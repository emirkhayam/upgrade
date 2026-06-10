// Live Google Sheets sync (best-effort, fire-and-forget).
//
// Instead of a heavy Google API / service-account integration, this posts booking
// events to a Google Apps Script "Web App" bound to the owner's spreadsheet. The
// owner pastes the provided script into their own sheet, deploys it as a web app and
// puts the resulting URL into GSHEET_WEBHOOK_URL. The script upserts/deletes rows by
// booking ID, so the sheet is always a live mirror of the bookings table.
//
// Env:
//   GSHEET_WEBHOOK_URL — the Apps Script web-app URL (if empty, sync is silently off)
//   GSHEET_SECRET      — optional shared secret echoed in every payload (the script
//                        can reject requests that don't match)
const db = require('../db');

const HEADERS = [
  'ID', 'Создана', 'Поток', 'Начало', 'Конец', 'Ребёнок', 'Возраст', 'Пол',
  'Телефон', 'Родитель', 'Город', 'Email', 'Канал', 'Статус', 'Статус оплаты',
  'Скидка %', 'К оплате', 'Оплачено', 'Остаток', 'Дата оплаты', 'Менеджер',
  'След. действие', 'След. контакт'
];

const STATUS = { new: 'Новая', calling: 'Дозвон', awaiting_payment: 'Ожидает оплаты', client_paid: 'Клиент оплатил', reserved: 'Бронь', paid: 'Оплачено', rejected: 'Отказ' };
const PAY = { none: 'Нет оплаты', partial: 'Частично', paid: 'Оплачено' };
const SRC = { website: 'Сайт', telegram: 'Telegram', whatsapp: 'WhatsApp', manual: 'Вручную' };

const SELECT = `
  SELECT b.*, s.name AS stream_name, s.date_start, s.date_end
  FROM bookings b JOIN streams s ON s.id = b.stream_id
`;

function webhook() { return (process.env.GSHEET_WEBHOOK_URL || '').trim(); }
function isConfigured() { return !!webhook(); }

function rowFor(b) {
  const due = Math.round((b.base_price || 0) * (100 - (b.discount || 0)) / 100);
  return [
    b.id, b.created_at, b.stream_name, b.date_start, b.date_end,
    b.child_name, b.child_age, b.gender === 'M' ? 'М' : b.gender === 'F' ? 'Ж' : '',
    b.parent_phone, b.parent_name || '', b.parent_city || '', b.parent_email || '',
    SRC[b.source] || 'Сайт', STATUS[b.status] || b.status, PAY[b.payment_status] || b.payment_status,
    b.discount || 0, due, b.paid_amount || 0, Math.max(0, due - (b.paid_amount || 0)),
    b.payment_date || '', b.manager || '', b.next_action || '', b.next_contact_date || ''
  ];
}

// Send a payload to the Apps Script web app. Never throws — sync failures must not
// break the booking flow. Returns the parsed JSON response (for the resync button).
async function post(payload) {
  const url = webhook();
  if (!url || typeof fetch !== 'function') return null;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: (process.env.GSHEET_SECRET || '').trim(), ...payload }),
      redirect: 'follow'
    });
    return await res.json().catch(() => ({ ok: res.ok }));
  } catch (e) {
    console.error('[sheets] sync failed:', e.message);
    return null;
  }
}

// Create-or-update one booking row in the sheet (fire-and-forget).
function syncBooking(id) {
  if (!isConfigured()) return;
  const b = db.prepare(`${SELECT} WHERE b.id = ?`).get(id);
  if (!b) return;
  post({ action: 'upsert', headers: HEADERS, row: rowFor(b) });
}

// Remove one booking row from the sheet (fire-and-forget).
function deleteBooking(id) {
  if (!isConfigured()) return;
  post({ action: 'delete', id });
}

// Rewrite the entire sheet from the current DB (used by the "Resync" button).
async function syncAll() {
  if (!isConfigured()) return { ok: false, configured: false };
  const rows = db.prepare(`${SELECT} ORDER BY s.date_start, b.created_at`).all().map(rowFor);
  const resp = await post({ action: 'replace', headers: HEADERS, rows });
  return { ok: !!(resp && resp.ok !== false), configured: true, count: rows.length };
}

module.exports = { syncBooking, deleteBooking, syncAll, isConfigured, HEADERS };
