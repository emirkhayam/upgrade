const { Router } = require('express');
const db = require('../db');

const router = Router();

// POST /api/bookings — create a booking
router.post('/', (req, res) => {
  const { stream_id, child_name, child_age, parent_phone, parent_name } = req.body;

  // Validation
  if (!stream_id || !child_name || !child_age || !parent_phone) {
    return res.status(400).json({ error: 'Заполните все обязательные поля' });
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
      SELECT capacity,
        (SELECT COUNT(*) FROM bookings WHERE stream_id = ? AND status != 'cancelled') AS booked
      FROM streams WHERE id = ? AND is_active = 1
    `).get(stream_id, stream_id);

    if (!stream) {
      return { error: 'Поток не найден', status: 404 };
    }

    if (stream.capacity - stream.booked <= 0) {
      return { error: 'К сожалению, все места на этот поток заняты', status: 409 };
    }

    const result = db.prepare(`
      INSERT INTO bookings (stream_id, child_name, child_age, parent_phone, parent_name)
      VALUES (?, ?, ?, ?, ?)
    `).run(stream_id, child_name.trim(), age, phone, (parent_name || '').trim());

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
