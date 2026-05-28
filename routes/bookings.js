const { Router } = require('express');
const db = require('../db');

const router = Router();

// POST /api/bookings — create a booking
router.post('/', (req, res) => {
  const { stream_id, child_name, child_age, parent_phone, parent_name, gender,
    parent_city, parent_email, alt_phone, tshirt_size, health, allergies, about_child, wishes } = req.body;

  // Validation
  if (!stream_id || !child_name || !child_age || !parent_phone || !gender) {
    return res.status(400).json({ error: 'Заполните все обязательные поля' });
  }

  if (!['M', 'F'].includes(gender)) {
    return res.status(400).json({ error: 'Укажите пол ребёнка' });
  }

  const age = parseInt(child_age, 10);
  if (isNaN(age) || age < 6 || age > 17) {
    return res.status(400).json({ error: 'Возраст должен быть от 6 до 17 лет' });
  }

  const phone = parent_phone.trim();
  if (phone.length < 9) {
    return res.status(400).json({ error: 'Введите корректный номер телефона' });
  }

  // Atomic booking inside transaction
  const createBooking = db.transaction(() => {
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

    // Gender quota check (40 per gender)
    const GENDER_LIMIT = 40;
    const genderCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM bookings WHERE stream_id = ? AND gender = ? AND status != 'rejected'"
    ).get(stream_id, gender);

    if (genderCount.cnt >= GENDER_LIMIT) {
      const label = gender === 'M' ? 'мальчиков' : 'девочек';
      return { error: `Места для ${label} на этом потоке закончились. Выберите другой поток.`, status: 409 };
    }

    const basePrice = stream.price || 19998;
    const result = db.prepare(`
      INSERT INTO bookings (stream_id, child_name, child_age, parent_phone, parent_name, gender,
        parent_city, parent_email, alt_phone, tshirt_size, health, allergies, about_child, wishes,
        status, base_price, discount, paid_amount, payment_status, next_action)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, 0, 0, 'none', 'Позвонить / написать в WhatsApp')
    `).run(stream_id, child_name.trim(), age, phone, (parent_name || '').trim(), gender,
      (parent_city || '').trim(), (parent_email || '').trim(), (alt_phone || '').trim(),
      (tshirt_size || '').trim(), (health || '').trim(), (allergies || '').trim(),
      (about_child || '').trim(), (wishes || '').trim(), basePrice);

    return { booking_id: result.lastInsertRowid };
  });

  const outcome = createBooking();

  if (outcome.error) {
    return res.status(outcome.status).json({ error: outcome.error });
  }

  // Get QR image if uploaded
  const qrSetting = db.prepare("SELECT value FROM settings WHERE key = 'qr_image'").get();
  const qr_image_url = qrSetting ? qrSetting.value : null;

  res.status(201).json({
    booking_id: outcome.booking_id,
    qr_image_url,
    message: 'Ваша заявка в обработке, с вами в скором времени свяжется менеджер'
  });
});

module.exports = router;
