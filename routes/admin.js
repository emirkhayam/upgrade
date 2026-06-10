const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const auth = require('../middleware/auth');
const { updateBooking, createManualBooking } = require('../lib/bookingService');
const sheets = require('../lib/sheetsSync');
const { uploadsDir, privateDir } = require('../lib/paths');

const router = Router();

// Ensure all upload directories exist on the persistent volume (created at startup so
// they're present even on a fresh volume / new server).
['speakers', 'stars', 'media', 'qr', 'champion', 'news', 'accom'].forEach(dir => {
  fs.mkdirSync(path.join(uploadsDir, dir), { recursive: true });
});

// QR upload config
const qrStorage = multer.diskStorage({
  destination: path.join(uploadsDir, 'qr'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    // Unique name per upload so a new QR isn't masked by the browser/CDN cache of the old file.
    cb(null, 'payment-qr-' + Date.now() + ext);
  }
});
const uploadQR = multer({
  storage: qrStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Только изображения'));
  }
});

// ==================== AUTH ====================

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (
    username === process.env.ADMIN_USER &&
    password === process.env.ADMIN_PASS
  ) {
    const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '24h' });
    return res.json({ token });
  }
  res.status(401).json({ error: 'Неверный логин или пароль' });
});

// ==================== BOOKINGS ====================

router.get('/bookings', auth, (req, res) => {
  const { stream_id, status, search } = req.query;
  let sql = `
    SELECT b.*, s.name as stream_name, s.date_start, s.date_end
    FROM bookings b
    JOIN streams s ON s.id = b.stream_id
    WHERE 1=1
  `;
  const params = [];

  if (stream_id) {
    sql += ' AND b.stream_id = ?';
    params.push(stream_id);
  }
  if (status) {
    sql += ' AND b.status = ?';
    params.push(status);
  }
  if (search) {
    sql += ' AND (b.child_name LIKE ? OR b.parent_name LIKE ? OR b.parent_phone LIKE ?)';
    const s = '%' + search + '%';
    params.push(s, s, s);
  }

  sql += ' ORDER BY b.created_at DESC';

  const bookings = db.prepare(sql).all(...params);
  res.json(bookings);
});

// ==================== STATS ====================

router.get('/stats', auth, (req, res) => {
  const streams = db.prepare(`
    SELECT s.id, s.name, s.capacity, s.date_start, s.date_end, s.is_active, s.price,
      (SELECT COUNT(*) FROM bookings b WHERE b.stream_id = s.id AND b.status != 'rejected') AS booked,
      (SELECT COUNT(*) FROM bookings b WHERE b.stream_id = s.id AND b.payment_status = 'paid') AS paid_total,
      (SELECT COUNT(*) FROM bookings b WHERE b.stream_id = s.id AND b.payment_status = 'paid' AND b.gender = 'M') AS paid_males,
      (SELECT COUNT(*) FROM bookings b WHERE b.stream_id = s.id AND b.payment_status = 'paid' AND b.gender = 'F') AS paid_females,
      (SELECT COUNT(*) FROM bookings b WHERE b.stream_id = s.id AND b.status IN ('new','calling','awaiting_payment','client_paid')) AS pending,
      (SELECT COUNT(*) FROM bookings b WHERE b.stream_id = s.id AND b.gender = 'M' AND b.status != 'rejected') AS males,
      (SELECT COUNT(*) FROM bookings b WHERE b.stream_id = s.id AND b.gender = 'F' AND b.status != 'rejected') AS females
    FROM streams s ORDER BY s.date_start
  `).all();

  const totals = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status IN ('new','calling','awaiting_payment','client_paid') THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'reserved' THEN 1 ELSE 0 END) as reserved,
      SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END) as paid,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
    FROM bookings
  `).get();

  const revenue = db.prepare(`SELECT COALESCE(SUM(paid_amount), 0) as total FROM bookings`).get();

  res.json({ streams, totals, revenue: revenue.total });
});

// POST /api/admin/bookings — manually add a camper to a stream from the admin panel.
router.post('/bookings', auth, (req, res) => {
  const outcome = createManualBooking(req.body || {});
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  res.status(201).json({ ok: true, booking_id: outcome.booking_id });
});

router.patch('/bookings/:id', auth, (req, res) => {
  const outcome = updateBooking(req.params.id, req.body);
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  res.json({ ok: true, booking: outcome.booking });
});

// DELETE /api/admin/bookings/:id — полностью удалить заявку (для тестовых записей).
// Заодно подчищаем приватный файл свидетельства и строку с кодом, чтобы не плодить сирот.
router.delete('/bookings/:id', auth, (req, res) => {
  const booking = db.prepare('SELECT id, birth_cert_path FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Заявка не найдена' });

  if (booking.birth_cert_path) {
    const abs = path.join(privateDir, booking.birth_cert_path);
    if (abs.startsWith(privateDir)) fs.unlink(abs, () => {});
  }
  db.prepare('DELETE FROM otp_codes WHERE booking_id = ?').run(req.params.id);
  db.prepare('DELETE FROM bookings WHERE id = ?').run(req.params.id);
  sheets.deleteBooking(req.params.id);

  res.json({ ok: true });
});

// ==================== GOOGLE SHEETS LIVE SYNC ====================

// Is the live Google-Sheets webhook configured? (frontend toggles its buttons on this)
router.get('/sheets/status', auth, (req, res) => {
  res.json({ configured: sheets.isConfigured(), url: (process.env.GSHEET_VIEW_URL || '').trim() });
});

// Push the whole bookings table into the sheet at once (manual "Resync" button).
router.post('/sheets/resync', auth, async (req, res) => {
  if (!sheets.isConfigured()) {
    return res.status(400).json({ error: 'Google Таблица не подключена. Задайте GSHEET_WEBHOOK_URL.' });
  }
  const result = await sheets.syncAll();
  if (!result.ok) return res.status(502).json({ error: 'Не удалось связаться с Google Таблицей' });
  res.json(result);
});

// GET /api/admin/birth-cert/:id — stream the child's birth-certificate screenshot.
// Auth-only: these are personal documents and are NOT exposed via /uploads.
router.get('/birth-cert/:id', auth, (req, res) => {
  const booking = db.prepare('SELECT birth_cert_path FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking || !booking.birth_cert_path) {
    return res.status(404).json({ error: 'Документ не загружен' });
  }
  // Stored as a relative ref ('birth-certs/<file>'); resolve under privateDir and guard
  // against path traversal before sending.
  const abs = path.join(privateDir, booking.birth_cert_path);
  if (!abs.startsWith(privateDir) || !fs.existsSync(abs)) {
    return res.status(404).json({ error: 'Файл не найден' });
  }
  res.sendFile(abs);
});

// ==================== STREAMS ====================

router.get('/streams', auth, (req, res) => {
  const streams = db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM bookings b WHERE b.stream_id = s.id AND b.status != 'cancelled') AS booked
    FROM streams s
    ORDER BY s.date_start
  `).all();
  res.json(streams);
});

router.post('/streams', auth, (req, res) => {
  const { name, date_start, date_end, capacity, price } = req.body;
  if (!name || !date_start || !date_end || !capacity) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }
  const result = db.prepare(
    'INSERT INTO streams (name, date_start, date_end, capacity, price) VALUES (?, ?, ?, ?, ?)'
  ).run(name, date_start, date_end, capacity, price || 19998);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.patch('/streams/:id', auth, (req, res) => {
  const { name, date_start, date_end, capacity, price, is_active } = req.body;
  const stream = db.prepare('SELECT * FROM streams WHERE id = ?').get(req.params.id);
  if (!stream) return res.status(404).json({ error: 'Поток не найден' });

  db.prepare(`
    UPDATE streams SET
      name = ?, date_start = ?, date_end = ?, capacity = ?, price = ?, is_active = ?
    WHERE id = ?
  `).run(
    name ?? stream.name,
    date_start ?? stream.date_start,
    date_end ?? stream.date_end,
    capacity ?? stream.capacity,
    price ?? stream.price,
    is_active ?? stream.is_active,
    req.params.id
  );
  res.json({ ok: true });
});

router.delete('/streams/:id', auth, (req, res) => {
  const result = db.prepare('DELETE FROM streams WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Поток не найден' });
  res.json({ ok: true });
});

// ==================== QR SETTINGS ====================

router.post('/settings/qr', auth, uploadQR.single('qr'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Загрузите файл' });
  const url = '/uploads/qr/' + req.file.filename;
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('qr_image', ?)").run(url);
  res.json({ url });
});

router.get('/settings/qr', (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'qr_image'").get();
  res.json({ url: row ? row.value : null });
});

// ==================== CHAMPION ====================

const champStorage = multer.diskStorage({
  destination: path.join(uploadsDir, 'champion'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    // Unique name per upload so a new photo isn't masked by the browser/CDN cache of the old file.
    cb(null, 'champion-' + Date.now() + ext);
  }
});
const uploadChamp = multer({
  storage: champStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Только изображения'));
  }
});

router.get('/champion', (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'champion'").get();
  res.json(row ? JSON.parse(row.value) : null);
});

router.post('/champion', auth, uploadChamp.single('photo'), (req, res) => {
  const { name, xp, role, description } = req.body;
  const existing = db.prepare("SELECT value FROM settings WHERE key = 'champion'").get();
  const current = existing ? JSON.parse(existing.value) : {};

  const data = {
    name: name || current.name || '',
    xp: xp || current.xp || '',
    role: role || current.role || '',
    description: description || current.description || '',
    photo: req.file ? '/uploads/champion/' + req.file.filename : (current.photo || '')
  };

  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('champion', ?)").run(JSON.stringify(data));
  res.json(data);
});

// ==================== ACCOMMODATIONS (корпуса / лагерь «Маяк») ====================
const accomStorage = multer.diskStorage({
  destination: path.join(uploadsDir, 'accom'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    // Unique name per upload so a new photo isn't masked by the browser/CDN cache of the old file.
    cb(null, file.fieldname + '-' + Date.now() + ext);
  }
});
const uploadAccom = multer({
  storage: accomStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Только изображения'));
  }
});

router.get('/accommodations', (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'accommodations'").get();
  res.json(row ? JSON.parse(row.value) : {});
});

router.post('/accommodations', auth, uploadAccom.fields([
  { name: 'camp', maxCount: 1 },
  { name: 'boys', maxCount: 1 },
  { name: 'girls', maxCount: 1 }
]), (req, res) => {
  const existing = db.prepare("SELECT value FROM settings WHERE key = 'accommodations'").get();
  const current = existing ? JSON.parse(existing.value) : {};
  const files = req.files || {};
  const pick = (field, cur) => files[field] ? '/uploads/accom/' + files[field][0].filename : (cur || '');

  const data = {
    camp:  pick('camp',  current.camp),
    boys:  pick('boys',  current.boys),
    girls: pick('girls', current.girls)
  };

  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('accommodations', ?)").run(JSON.stringify(data));
  res.json(data);
});

// ==================== CONTACTS / СОЦСЕТИ ====================
// Значения по умолчанию = то, что сейчас захардкожено на сайте (чтобы ничего не пропало).
const DEFAULT_CONTACTS = {
  whatsapp: '996552180570',
  phone: '+996 552 180 570',
  email: 'apg.kg2026@gmail.com',
  instagram: 'https://www.instagram.com/apgrade_kg/',
  telegram: '',
  tiktok: '',
  youtube: ''
};

router.get('/contacts', (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'contacts'").get();
  res.json(row ? { ...DEFAULT_CONTACTS, ...JSON.parse(row.value) } : DEFAULT_CONTACTS);
});

router.post('/contacts', auth, (req, res) => {
  const b = req.body || {};
  const data = {
    whatsapp:  (b.whatsapp  ?? '').toString().trim(),
    phone:     (b.phone     ?? '').toString().trim(),
    email:     (b.email     ?? '').toString().trim(),
    instagram: (b.instagram ?? '').toString().trim(),
    telegram:  (b.telegram  ?? '').toString().trim(),
    tiktok:    (b.tiktok    ?? '').toString().trim(),
    youtube:   (b.youtube   ?? '').toString().trim()
  };
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('contacts', ?)").run(JSON.stringify(data));
  res.json(data);
});

// ==================== ПРОГРАММА (блок «День за днём») ====================
// Значения по умолчанию = то, что сейчас захардкожено на сайте (system.html),
// чтобы при первом открытии админки программа уже была заполнена и ничего не пропало.
const DEFAULT_PROGRAM = {
  intro: '10 дней · 5 миссий по 2 дня · 1 финал. Каждый день — новые активности, прокачка навыка, командная работа, очки в общий рейтинг.',
  days: [
    { mission: 'M.01 · SPORT',    color: 'm1', num: '01', title: 'Заезд · Открытие', items: ['Заселение', 'Выдача формы', 'Знакомство', 'Вечер у костра'] },
    { mission: 'M.01 · SPORT',    color: 'm1', num: '02', title: 'Спорт · Команды',  items: ['Эстафеты', 'Мастер-класс', 'Олимпийский чемпион', 'Турнир'] },
    { mission: 'M.02 · SCIENCE',  color: 'm2', num: '03', title: 'Наука · Опыты',    items: ['Лекция учёного', 'Лаборатория', 'Эксперименты', 'Квест'] },
    { mission: 'M.02 · SCIENCE',  color: 'm2', num: '04', title: 'Головоломки',      items: ['Дебаты', 'Стратегии', 'Игра-симулятор', 'Озеро · отдых'] },
    { mission: 'M.03 · IT',       color: 'm3', num: '05', title: 'IT · Старт',       items: ['Лекция: Google/Meta', 'AI workshop', 'Киберспорт', 'Networking'] },
    { mission: 'M.03 · IT',       color: 'm3', num: '06', title: 'Хакатон',          items: ['Команды по 5', '12 часов', 'Питч проектов', 'Жюри'] },
    { mission: 'M.04 · CREATIVE', color: 'm4', num: '07', title: 'Творчество',       items: ['Видео-блогинг', 'Музыка', 'Дизайн', 'Актёрское'] },
    { mission: 'M.04 · CREATIVE', color: 'm4', num: '08', title: 'Свой проект',      items: ['Команды', 'Производство', 'Показ', 'Голосование'] },
    { mission: 'M.05 · FINAL',    color: 'm5', num: '09', title: 'Финал · Битва',    items: ['Финальные испытания', 'Все 4 миссии', 'Подсчёт очков', 'Прогон'] },
    { mission: 'M.05 · FINAL',    color: 'm5', num: '10', title: 'Церемония',        items: ['Родительский день', 'Награждение', '3 чемпиона', '10 номинантов'] }
  ]
};

const PROGRAM_COLORS = ['m1', 'm2', 'm3', 'm4', 'm5'];

router.get('/program', (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'program'").get();
  res.json(row ? JSON.parse(row.value) : DEFAULT_PROGRAM);
});

router.post('/program', auth, (req, res) => {
  const b = req.body || {};
  const str = (v) => (v ?? '').toString().trim();
  const daysIn = Array.isArray(b.days) ? b.days : [];

  const days = daysIn.map((d) => {
    d = d || {};
    const color = PROGRAM_COLORS.includes(d.color) ? d.color : 'm1';
    const items = (Array.isArray(d.items) ? d.items : [])
      .map(str)
      .filter(Boolean);
    return {
      mission: str(d.mission),
      color,
      num: str(d.num),
      title: str(d.title),
      items
    };
  }).filter((d) => d.title || d.mission || d.items.length);

  const data = { intro: str(b.intro), days };
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('program', ?)").run(JSON.stringify(data));
  res.json(data);
});

// ==================== PUBLIC API (no auth) ====================

router.get('/public/speakers', (req, res) => {
  const rows = db.prepare('SELECT * FROM speakers WHERE is_active = 1 ORDER BY sort_order, id').all();
  res.json(rows);
});

router.get('/public/stars', (req, res) => {
  const rows = db.prepare('SELECT * FROM stars WHERE is_active = 1 ORDER BY sort_order, id').all();
  res.json(rows);
});

router.get('/public/media', (req, res) => {
  const rows = db.prepare('SELECT * FROM media WHERE is_active = 1 ORDER BY sort_order, id').all();
  res.json(rows);
});

router.get('/public/news', (req, res) => {
  const rows = db.prepare('SELECT * FROM news WHERE is_active = 1 ORDER BY sort_order, id').all();
  res.json(rows);
});

router.get('/public/reels', (req, res) => {
  const rows = db.prepare('SELECT * FROM reels WHERE is_active = 1 ORDER BY sort_order, id').all();
  res.json(rows);
});

// ==================== SPEAKERS ====================

const speakerStorage = multer.diskStorage({
  destination: path.join(uploadsDir, 'speakers'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'speaker-' + Date.now() + ext);
  }
});
const uploadSpeaker = multer({
  storage: speakerStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Только изображения'));
  }
});

router.get('/speakers', auth, (req, res) => {
  const speakers = db.prepare('SELECT * FROM speakers ORDER BY sort_order, id').all();
  res.json(speakers);
});

router.post('/speakers', auth, uploadSpeaker.single('photo'), (req, res) => {
  const { name, role, category, bio, instagram, sort_order, is_active } = req.body;
  if (!name) return res.status(400).json({ error: 'Имя обязательно' });
  const photo = req.file ? '/uploads/speakers/' + req.file.filename : '';
  const result = db.prepare(
    'INSERT INTO speakers (name, role, category, bio, instagram, photo, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(name, role || '', category || '', bio || '', instagram || '', photo, parseInt(sort_order) || 0, is_active !== undefined ? parseInt(is_active) : 1);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.patch('/speakers/:id', auth, uploadSpeaker.single('photo'), (req, res) => {
  const speaker = db.prepare('SELECT * FROM speakers WHERE id = ?').get(req.params.id);
  if (!speaker) return res.status(404).json({ error: 'Спикер не найден' });
  const { name, role, category, bio, instagram, sort_order, is_active } = req.body;
  const photo = req.file ? '/uploads/speakers/' + req.file.filename : speaker.photo;
  db.prepare(
    'UPDATE speakers SET name=?, role=?, category=?, bio=?, instagram=?, photo=?, sort_order=?, is_active=? WHERE id=?'
  ).run(
    name ?? speaker.name, role ?? speaker.role, category ?? speaker.category,
    bio ?? speaker.bio, instagram ?? speaker.instagram, photo,
    sort_order !== undefined ? parseInt(sort_order) : speaker.sort_order,
    is_active !== undefined ? parseInt(is_active) : speaker.is_active, req.params.id
  );
  res.json({ ok: true });
});

router.delete('/speakers/:id', auth, (req, res) => {
  const result = db.prepare('DELETE FROM speakers WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Спикер не найден' });
  res.json({ ok: true });
});

// ==================== STARS ====================

const starStorage = multer.diskStorage({
  destination: path.join(uploadsDir, 'stars'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'star-' + Date.now() + ext);
  }
});
const uploadStar = multer({
  storage: starStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Только изображения'));
  }
});

router.get('/stars', auth, (req, res) => {
  const stars = db.prepare('SELECT * FROM stars ORDER BY sort_order, id').all();
  res.json(stars);
});

router.post('/stars', auth, uploadStar.single('photo'), (req, res) => {
  const { name, title, description, category, sort_order, is_active } = req.body;
  if (!name) return res.status(400).json({ error: 'Имя обязательно' });
  const photo = req.file ? '/uploads/stars/' + req.file.filename : '';
  const result = db.prepare(
    'INSERT INTO stars (name, title, description, photo, category, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(name, title || '', description || '', photo, category || '', parseInt(sort_order) || 0, is_active !== undefined ? parseInt(is_active) : 1);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.patch('/stars/:id', auth, uploadStar.single('photo'), (req, res) => {
  const star = db.prepare('SELECT * FROM stars WHERE id = ?').get(req.params.id);
  if (!star) return res.status(404).json({ error: 'Звезда не найдена' });
  const { name, title, description, category, sort_order, is_active } = req.body;
  const photo = req.file ? '/uploads/stars/' + req.file.filename : star.photo;
  db.prepare(
    'UPDATE stars SET name=?, title=?, description=?, photo=?, category=?, sort_order=?, is_active=? WHERE id=?'
  ).run(
    name ?? star.name, title ?? star.title, description ?? star.description,
    photo, category ?? star.category, sort_order !== undefined ? parseInt(sort_order) : star.sort_order,
    is_active !== undefined ? parseInt(is_active) : star.is_active, req.params.id
  );
  res.json({ ok: true });
});

router.delete('/stars/:id', auth, (req, res) => {
  const result = db.prepare('DELETE FROM stars WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Звезда не найдена' });
  res.json({ ok: true });
});

// ==================== MEDIA ====================

const mediaStorage = multer.diskStorage({
  destination: path.join(uploadsDir, 'media'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'media-' + Date.now() + ext);
  }
});
const uploadMedia = multer({
  storage: mediaStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Только изображения и видео'));
  }
});

router.get('/media', auth, (req, res) => {
  const media = db.prepare('SELECT * FROM media ORDER BY sort_order, id DESC').all();
  res.json(media);
});

router.post('/media', auth, uploadMedia.single('file'), (req, res) => {
  const { type, title, category, url, format, sort_order, is_active } = req.body;
  let fileUrl = url || '';
  let thumbnail = '';
  if (req.file) {
    fileUrl = '/uploads/media/' + req.file.filename;
    if (req.file.mimetype.startsWith('image/')) thumbnail = fileUrl;
  }
  const result = db.prepare(
    'INSERT INTO media (type, title, category, url, thumbnail, format, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(type || 'photo', title || '', category || '', fileUrl, thumbnail, format === 'portrait' ? 'portrait' : 'landscape', parseInt(sort_order) || 0, is_active !== undefined ? parseInt(is_active) : 1);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.patch('/media/:id', auth, uploadMedia.single('file'), (req, res) => {
  const item = db.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Медиа не найдено' });
  const { type, title, category, url, format, sort_order, is_active } = req.body;
  let fileUrl = url ?? item.url;
  let thumbnail = item.thumbnail;
  if (req.file) {
    fileUrl = '/uploads/media/' + req.file.filename;
    if (req.file.mimetype.startsWith('image/')) thumbnail = fileUrl;
  }
  db.prepare(
    'UPDATE media SET type=?, title=?, category=?, url=?, thumbnail=?, format=?, sort_order=?, is_active=? WHERE id=?'
  ).run(
    type ?? item.type, title ?? item.title, category ?? item.category,
    fileUrl, thumbnail, (format === 'portrait' || format === 'landscape') ? format : item.format,
    sort_order !== undefined ? parseInt(sort_order) : item.sort_order,
    is_active !== undefined ? parseInt(is_active) : item.is_active, req.params.id
  );
  res.json({ ok: true });
});

router.delete('/media/:id', auth, (req, res) => {
  const result = db.prepare('DELETE FROM media WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Медиа не найдено' });
  res.json({ ok: true });
});

// ==================== NEWS (Новости / медиа-феед) ====================

const newsStorage = multer.diskStorage({
  destination: path.join(uploadsDir, 'news'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'news-' + Date.now() + ext);
  }
});
const uploadNews = multer({
  storage: newsStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Только изображения'));
  }
});

router.get('/news', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM news ORDER BY sort_order, id').all());
});

router.post('/news', auth, uploadNews.single('image'), (req, res) => {
  const { category, title, date_text, sort_order, is_active } = req.body;
  const image = req.file ? '/uploads/news/' + req.file.filename : '';
  const result = db.prepare(
    'INSERT INTO news (category, title, date_text, image, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(category || '', title || '', date_text || '', image, parseInt(sort_order) || 0, is_active !== undefined ? parseInt(is_active) : 1);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.patch('/news/:id', auth, uploadNews.single('image'), (req, res) => {
  const item = db.prepare('SELECT * FROM news WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Новость не найдена' });
  const { category, title, date_text, sort_order, is_active } = req.body;
  const image = req.file ? '/uploads/news/' + req.file.filename : item.image;
  db.prepare(
    'UPDATE news SET category=?, title=?, date_text=?, image=?, sort_order=?, is_active=? WHERE id=?'
  ).run(
    category ?? item.category, title ?? item.title, date_text ?? item.date_text, image,
    sort_order !== undefined ? parseInt(sort_order) : item.sort_order,
    is_active !== undefined ? parseInt(is_active) : item.is_active, req.params.id
  );
  res.json({ ok: true });
});

router.delete('/news/:id', auth, (req, res) => {
  const result = db.prepare('DELETE FROM news WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Новость не найдена' });
  res.json({ ok: true });
});

// ==================== REELS (Instagram рилсы в блоке @apgrade_kg) ====================

router.get('/reels', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM reels ORDER BY sort_order, id').all());
});

router.post('/reels', auth, (req, res) => {
  const { url, caption, sort_order, is_active } = req.body;
  if (!url || !/instagram\.com\//i.test(url)) return res.status(400).json({ error: 'Вставьте ссылку на рилс/пост Instagram' });
  const result = db.prepare(
    'INSERT INTO reels (url, caption, sort_order, is_active) VALUES (?, ?, ?, ?)'
  ).run(url.trim(), caption || '', parseInt(sort_order) || 0, is_active !== undefined ? parseInt(is_active) : 1);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.patch('/reels/:id', auth, (req, res) => {
  const item = db.prepare('SELECT * FROM reels WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Рилс не найден' });
  const { url, caption, sort_order, is_active } = req.body;
  db.prepare(
    'UPDATE reels SET url=?, caption=?, sort_order=?, is_active=? WHERE id=?'
  ).run(
    url ? url.trim() : item.url, caption ?? item.caption,
    sort_order !== undefined ? parseInt(sort_order) : item.sort_order,
    is_active !== undefined ? parseInt(is_active) : item.is_active, req.params.id
  );
  res.json({ ok: true });
});

router.delete('/reels/:id', auth, (req, res) => {
  const result = db.prepare('DELETE FROM reels WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Рилс не найден' });
  res.json({ ok: true });
});

// Обработчик ошибок загрузки файлов (multer): возвращаем понятный JSON вместо «тихого» 500
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? 'Файл слишком большой. Максимум 15 МБ — сожмите изображение или выберите фото меньшего размера.'
      : 'Ошибка загрузки файла: ' + err.message;
    return res.status(400).json({ error: msg });
  }
  if (err) return res.status(400).json({ error: err.message || 'Ошибка загрузки файла' });
  next();
});

module.exports = router;
