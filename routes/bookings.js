const { Router } = require('express');
const db = require('../db');
const { createBooking } = require('../lib/bookingService');

const router = Router();

// POST /api/bookings — create a booking from the public website widget/form.
// Source is forced to 'website' here; channel leads (Telegram/WhatsApp) come through /api/bot.
router.post('/', (req, res) => {
  const outcome = createBooking({ ...req.body, source: 'website', contact_handle: '' });

  if (outcome.error) {
    return res.status(outcome.status).json({ error: outcome.error });
  }

  const qrSetting = db.prepare("SELECT value FROM settings WHERE key = 'qr_image'").get();
  const qr_image_url = qrSetting ? qrSetting.value : null;

  res.status(201).json({
    booking_id: outcome.booking_id,
    qr_image_url,
    message: 'Ваша заявка в обработке, с вами в скором времени свяжется менеджер'
  });
});

module.exports = router;
