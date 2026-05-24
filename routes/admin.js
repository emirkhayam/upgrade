const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const db = require('../db');
const auth = require('../middleware/auth');

const router = Router();

// QR upload config
const qrStorage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads', 'qr'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'payment-qr' + ext);
  }
});
const uploadQR = multer({
  storage: qrStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
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
      (SELECT COUNT(*) FROM bookings b WHERE b.stream_id = s.id AND b.status = 'confirmed') AS confirmed,
      (SELECT COUNT(*) FROM bookings b WHERE b.stream_id = s.id AND b.status = 'pending') AS pending,
      (SELECT COUNT(*) FROM bookings b WHERE b.stream_id = s.id AND b.status != 'cancelled') AS booked
    FROM streams s ORDER BY s.date_start
  `).all();

  const totals = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
    FROM bookings
  `).get();

  const revenue = db.prepare(`
    SELECT COALESCE(SUM(s.price), 0) as total
    FROM bookings b JOIN streams s ON s.id = b.stream_id
    WHERE b.status = 'confirmed'
  `).get();

  res.json({ streams, totals, revenue: revenue.total });
});

router.patch('/bookings/:id', auth, (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'confirmed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Невалидный статус' });
  }

  const result = db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Заявка не найдена' });
  }
  res.json({ ok: true });
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
  destination: path.join(__dirname, '..', 'uploads', 'champion'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'champion' + ext);
  }
});
const uploadChamp = multer({
  storage: champStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
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

module.exports = router;
