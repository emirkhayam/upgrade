const { Router } = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { createBooking } = require('../lib/bookingService');
const { requestOtp, confirmOtp } = require('../lib/otpService');
const { isConfigured } = require('../lib/whatsappService');
const { privateDir } = require('../lib/paths');

const router = Router();

// Birth-certificate screenshots are children's personal documents — they go into a
// PRIVATE folder that express.static does NOT serve. They are only viewable through the
// JWT-protected admin route GET /api/admin/birth-cert/:id.
const birthCertDir = path.join(privateDir, 'birth-certs');
fs.mkdirSync(birthCertDir, { recursive: true });

const birthCertStorage = multer.diskStorage({
  destination: birthCertDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `cert-${req.params.id}-${Date.now()}${ext}`);
  }
});
const uploadBirthCert = multer({
  storage: birthCertStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB — фото/скриншот с телефона
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Только изображение или PDF'));
  }
});

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
    // While the WhatsApp bot isn't connected yet, the phone-verification step is skipped
    // so the booking flow keeps working. Set WHATSAPP_API_URL to turn it on.
    verify_required: isConfigured(),
    message: 'Ваша заявка в обработке, с вами в скором времени свяжется менеджер'
  });
});

// POST /api/bookings/:id/birth-cert — attach the birth-certificate screenshot (from ТУНДУК).
// Separate from create so the JSON booking transaction stays atomic and a failed/huge
// upload never blocks the booking itself.
router.post('/:id/birth-cert', (req, res) => {
  uploadBirthCert.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Файл не получен' });

    const booking = db.prepare('SELECT id FROM bookings WHERE id = ?').get(req.params.id);
    if (!booking) {
      fs.unlink(path.join(birthCertDir, req.file.filename), () => {});
      return res.status(404).json({ error: 'Заявка не найдена' });
    }

    db.prepare('UPDATE bookings SET birth_cert_path = ? WHERE id = ?')
      .run('birth-certs/' + req.file.filename, req.params.id);

    res.json({ ok: true });
  });
});

// POST /api/bookings/:id/verify/request — send a WhatsApp code to the parent's phone.
router.post('/:id/verify/request', async (req, res) => {
  const outcome = await requestOtp(req.params.id);
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error, retryAfter: outcome.retryAfter });
  res.json({ ok: true, ttl: outcome.ttl, already: outcome.already });
});

// POST /api/bookings/:id/verify/confirm — check the code; on success unlocks payment.
router.post('/:id/verify/confirm', (req, res) => {
  const outcome = confirmOtp(req.params.id, (req.body || {}).code);
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  res.json({ ok: true });
});

module.exports = router;
