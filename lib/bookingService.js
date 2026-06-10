// Shared booking logic used by the public site, the admin panel and the chat-bot API.
// Keeping it in one place means the gender quota, capacity and payment rules stay identical
// no matter which channel a lead comes through.
const db = require('../db');
const sheets = require('./sheetsSync');

const GENDER_LIMIT = 40;
const DEFAULT_PRICE = 19998;
// client_paid = клиент сообщил об оплате, ждёт проверки менеджером (деньги ещё не подтверждены).
const LEAD_STATUSES = ['new', 'calling', 'awaiting_payment', 'client_paid', 'reserved', 'paid', 'rejected'];
const SOURCES = ['website', 'telegram', 'whatsapp', 'manual'];

// Create a lead atomically, enforcing capacity and the 40-per-gender quota.
// Returns { booking_id } on success or { error, status } on failure.
function createBooking(data) {
  const {
    stream_id, child_name, child_age, parent_phone, parent_name, gender,
    parent_city, parent_email, alt_phone, tshirt_size, health, allergies,
    about_child, wishes, source, contact_handle, consent_data, consent_insurance
  } = data;

  if (!stream_id || !child_name || !child_age || !parent_phone || !gender) {
    return { error: 'Заполните все обязательные поля', status: 400 };
  }
  if (!['M', 'F'].includes(gender)) {
    return { error: 'Укажите пол ребёнка', status: 400 };
  }
  // Согласие на обработку персональных данных — обязательно (юр. основание держать ПД).
  // Проверяем на сервере, а не только галочкой на фронте.
  const consentData = consent_data === 1 || consent_data === true || consent_data === '1';
  if (!consentData) {
    return { error: 'Необходимо согласие на обработку данных', status: 400 };
  }
  const consentInsurance = (consent_insurance === 1 || consent_insurance === true || consent_insurance === '1') ? 1 : 0;
  const age = parseInt(child_age, 10);
  if (isNaN(age) || age < 6 || age > 17) {
    return { error: 'Возраст должен быть от 6 до 17 лет', status: 400 };
  }
  const phone = String(parent_phone).trim();
  if (phone.length < 9) {
    return { error: 'Введите корректный номер телефона', status: 400 };
  }
  const src = SOURCES.includes(source) ? source : 'website';

  const tx = db.transaction(() => {
    const stream = db.prepare(`
      SELECT capacity, price,
        (SELECT COUNT(*) FROM bookings WHERE stream_id = ? AND status != 'rejected') AS booked
      FROM streams WHERE id = ? AND is_active = 1
    `).get(stream_id, stream_id);

    if (!stream) {
      return { error: 'Поток не найден', status: 404 };
    }
    if (stream.capacity - stream.booked <= 0) {
      return { error: 'К сожалению, все места на этот поток заняты', status: 409 };
    }

    const genderCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM bookings WHERE stream_id = ? AND gender = ? AND status != 'rejected'"
    ).get(stream_id, gender);
    if (genderCount.cnt >= GENDER_LIMIT) {
      const label = gender === 'M' ? 'мальчиков' : 'девочек';
      return { error: `Места для ${label} на этом потоке закончились. Выберите другой поток.`, status: 409 };
    }

    const basePrice = stream.price || DEFAULT_PRICE;
    const result = db.prepare(`
      INSERT INTO bookings (stream_id, child_name, child_age, parent_phone, parent_name, gender,
        parent_city, parent_email, alt_phone, tshirt_size, health, allergies, about_child, wishes,
        source, contact_handle,
        consent_data, consent_data_at, consent_insurance,
        status, base_price, discount, paid_amount, payment_status, next_action)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'new', ?, 0, 0, 'none', 'Позвонить / написать в WhatsApp')
    `).run(stream_id, child_name.trim(), age, phone, (parent_name || '').trim(), gender,
      (parent_city || '').trim(), (parent_email || '').trim(), (alt_phone || '').trim(),
      (tshirt_size || '').trim(), (health || '').trim(), (allergies || '').trim(),
      (about_child || '').trim(), (wishes || '').trim(), src, (contact_handle || '').trim(),
      new Date().toISOString(), consentInsurance, basePrice);

    return { booking_id: result.lastInsertRowid };
  });

  const outcome = tx();
  if (outcome.booking_id) sheets.syncBooking(outcome.booking_id);
  return outcome;
}

// Manually add a camper to a stream from the admin panel ("заполнение потоков").
// Looser than createBooking: only name, age and gender are required, the phone is
// optional, and consent is implied (the manager is entering an offline sign-up).
// Capacity and the per-gender quota are still enforced so manual entries can't
// oversell a stream. Returns { booking_id } or { error, status }.
function createManualBooking(data) {
  const {
    stream_id, child_name, child_age, parent_phone, parent_name, gender,
    parent_city, parent_email, status
  } = data;

  if (!stream_id || !child_name || !gender) {
    return { error: 'Укажите поток, имя ребёнка и пол', status: 400 };
  }
  if (!['M', 'F'].includes(gender)) {
    return { error: 'Укажите пол ребёнка', status: 400 };
  }
  const age = parseInt(child_age, 10);
  if (isNaN(age) || age < 1 || age > 100) {
    return { error: 'Укажите корректный возраст', status: 400 };
  }
  const newStatus = LEAD_STATUSES.includes(status) ? status : 'reserved';

  const tx = db.transaction(() => {
    const stream = db.prepare(`
      SELECT capacity, price,
        (SELECT COUNT(*) FROM bookings WHERE stream_id = ? AND status != 'rejected') AS booked
      FROM streams WHERE id = ?
    `).get(stream_id, stream_id);

    if (!stream) return { error: 'Поток не найден', status: 404 };
    if (newStatus !== 'rejected' && stream.capacity - stream.booked <= 0) {
      return { error: 'Все места на этот поток заняты', status: 409 };
    }
    if (newStatus !== 'rejected') {
      const genderCount = db.prepare(
        "SELECT COUNT(*) as cnt FROM bookings WHERE stream_id = ? AND gender = ? AND status != 'rejected'"
      ).get(stream_id, gender);
      if (genderCount.cnt >= GENDER_LIMIT) {
        const label = gender === 'M' ? 'мальчиков' : 'девочек';
        return { error: `Места для ${label} на этом потоке закончились`, status: 409 };
      }
    }

    const basePrice = stream.price || DEFAULT_PRICE;
    const result = db.prepare(`
      INSERT INTO bookings (stream_id, child_name, child_age, parent_phone, parent_name, gender,
        parent_city, parent_email, source, contact_handle,
        consent_data, consent_data_at, status, base_price, discount, paid_amount, payment_status, next_action)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', '', 1, ?, ?, ?, 0, 0, 'none', '')
    `).run(stream_id, child_name.trim(), age, (parent_phone || '').trim(), (parent_name || '').trim(), gender,
      (parent_city || '').trim(), (parent_email || '').trim(), new Date().toISOString(), newStatus, basePrice);

    return { booking_id: result.lastInsertRowid };
  });

  const outcome = tx();
  if (outcome.booking_id) sheets.syncBooking(outcome.booking_id);
  return outcome;
}

// Update sales-funnel and payment fields. Payment status is always derived from the money,
// never set by hand. Returns { booking } on success or { error, status } on failure.
function updateBooking(id, data) {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
  if (!booking) return { error: 'Заявка не найдена', status: 404 };

  const { status, manager, next_action, next_contact_date, discount, paid_amount, payment_date, receipt } = data;

  if (status !== undefined && !LEAD_STATUSES.includes(status)) {
    return { error: 'Невалидный статус', status: 400 };
  }

  const newDiscount = discount !== undefined ? Math.max(0, Math.min(100, parseInt(discount) || 0)) : booking.discount;
  const newPaid = paid_amount !== undefined ? Math.max(0, parseInt(paid_amount) || 0) : booking.paid_amount;
  const amountDue = Math.round((booking.base_price || 0) * (100 - newDiscount) / 100);

  let paymentStatus;
  if (amountDue > 0 && newPaid >= amountDue) paymentStatus = 'paid';
  else if (newPaid > 0) paymentStatus = 'partial';
  else paymentStatus = 'none';

  let newPaymentDate = payment_date !== undefined ? payment_date : booking.payment_date;
  if (paymentStatus === 'paid' && !newPaymentDate) {
    newPaymentDate = new Date().toISOString().slice(0, 10);
  }

  db.prepare(`
    UPDATE bookings SET
      status = ?, manager = ?, next_action = ?, next_contact_date = ?,
      discount = ?, paid_amount = ?, payment_status = ?, payment_date = ?, receipt = ?
    WHERE id = ?
  `).run(
    status ?? booking.status,
    manager !== undefined ? manager : booking.manager,
    next_action !== undefined ? next_action : booking.next_action,
    next_contact_date !== undefined ? next_contact_date : booking.next_contact_date,
    newDiscount,
    newPaid,
    paymentStatus,
    newPaymentDate,
    receipt !== undefined ? receipt : booking.receipt,
    id
  );

  sheets.syncBooking(id);
  return { booking: db.prepare('SELECT * FROM bookings WHERE id = ?').get(id) };
}

module.exports = { createBooking, createManualBooking, updateBooking, LEAD_STATUSES, SOURCES, GENDER_LIMIT };
