// Phone verification via one-time codes delivered over WhatsApp.
// The code is generated server-side, stored hashed in SQLite (table otp_codes),
// expires after a TTL and is protected against brute force + SMS/WhatsApp spam.
const bcrypt = require('bcryptjs');
const db = require('../db');
const { sendOtp } = require('./whatsappService');

const TTL_MS = (parseInt(process.env.OTP_TTL_SEC, 10) || 300) * 1000; // default 5 min
const RESEND_MS = (parseInt(process.env.OTP_RESEND_SEC, 10) || 60) * 1000; // 1/min
const MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS, 10) || 5; // wrong guesses
const MAX_SENDS = parseInt(process.env.OTP_MAX_SENDS, 10) || 5; // sends per booking (cost guard)

function genCode() {
  return String(Math.floor(1000 + Math.random() * 9000)); // 4 digits, как просил UX
}

// Generate + send a code for an existing booking. Enforces resend throttle and a
// per-booking send cap so nobody can drain the WhatsApp balance.
// Returns { ok:true, ttl } or { error, status }.
async function requestOtp(bookingId) {
  const booking = db.prepare('SELECT id, parent_phone, phone_verified FROM bookings WHERE id = ?').get(bookingId);
  if (!booking) return { error: 'Заявка не найдена', status: 404 };
  if (booking.phone_verified) return { ok: true, ttl: 0, already: true };

  const now = Date.now();
  const row = db.prepare('SELECT * FROM otp_codes WHERE booking_id = ?').get(bookingId);

  if (row) {
    if (now - row.last_sent < RESEND_MS) {
      const wait = Math.ceil((RESEND_MS - (now - row.last_sent)) / 1000);
      return { error: `Код уже отправлен. Повторить можно через ${wait} сек.`, status: 429, retryAfter: wait };
    }
    if (row.sent_count >= MAX_SENDS) {
      return { error: 'Слишком много отправок. Свяжитесь с менеджером в WhatsApp.', status: 429 };
    }
  }

  const code = genCode();
  const codeHash = bcrypt.hashSync(code, 8);
  const expiresAt = now + TTL_MS;
  const sentCount = (row ? row.sent_count : 0) + 1;

  db.prepare(`
    INSERT INTO otp_codes (booking_id, phone, code_hash, attempts, sent_count, expires_at, last_sent)
    VALUES (?, ?, ?, 0, ?, ?, ?)
    ON CONFLICT(booking_id) DO UPDATE SET
      code_hash = excluded.code_hash,
      attempts = 0,
      sent_count = ?,
      expires_at = excluded.expires_at,
      last_sent = excluded.last_sent
  `).run(bookingId, booking.parent_phone, codeHash, sentCount, expiresAt, now, sentCount);

  const sent = await sendOtp(booking.parent_phone, code);
  if (!sent.ok) {
    // Don't leave a half-state that blocks the throttle if delivery never happened.
    const reason = sent.reason === 'not_configured'
      ? 'WhatsApp-отправка пока не настроена (подключим бота).'
      : 'Не удалось отправить код. Попробуйте позже или напишите менеджеру.';
    return { error: reason, status: 503 };
  }

  return { ok: true, ttl: Math.round(TTL_MS / 1000) };
}

// Check a code for a booking. On success marks bookings.phone_verified = 1.
// Returns { ok:true } or { error, status }.
function confirmOtp(bookingId, code) {
  const row = db.prepare('SELECT * FROM otp_codes WHERE booking_id = ?').get(bookingId);
  if (!row) return { error: 'Сначала запросите код', status: 400 };

  if (Date.now() > row.expires_at) {
    db.prepare('DELETE FROM otp_codes WHERE booking_id = ?').run(bookingId);
    return { error: 'Код истёк. Запросите новый.', status: 410 };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    db.prepare('DELETE FROM otp_codes WHERE booking_id = ?').run(bookingId);
    return { error: 'Слишком много попыток. Запросите новый код.', status: 410 };
  }

  const ok = bcrypt.compareSync(String(code || '').trim(), row.code_hash);
  if (!ok) {
    db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE booking_id = ?').run(bookingId);
    const left = MAX_ATTEMPTS - (row.attempts + 1);
    return { error: left > 0 ? `Неверный код. Осталось попыток: ${left}.` : 'Неверный код.', status: 400 };
  }

  const tx = db.transaction(() => {
    db.prepare('UPDATE bookings SET phone_verified = 1, phone_verified_at = ? WHERE id = ?')
      .run(new Date().toISOString(), bookingId);
    db.prepare('DELETE FROM otp_codes WHERE booking_id = ?').run(bookingId);
  });
  tx();

  return { ok: true };
}

module.exports = { requestOtp, confirmOtp };
