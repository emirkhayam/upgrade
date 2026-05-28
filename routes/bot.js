const { Router } = require('express');
const db = require('../db');
const botAuth = require('../middleware/botAuth');
const { createBooking, updateBooking } = require('../lib/bookingService');

const router = Router();

// Every endpoint below requires the x-api-key header (see middleware/botAuth.js).
router.use(botAuth);

const withStream = `
  SELECT b.*, s.name AS stream_name, s.date_start, s.date_end
  FROM bookings b JOIN streams s ON s.id = b.stream_id
`;

// POST /api/bot/bookings — create a lead from a chat channel (Telegram / WhatsApp).
// Body: same fields as the public form, plus `source` ('telegram'|'whatsapp') and `contact_handle`.
router.post('/bookings', (req, res) => {
  const outcome = createBooking(req.body);
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  const booking = db.prepare(withStream + ' WHERE b.id = ?').get(outcome.booking_id);
  res.status(201).json({ ok: true, booking });
});

// GET /api/bot/bookings — find leads (e.g. look up a returning client by phone or handle).
// Query: phone, contact_handle, status, stream_id, limit (default 50, max 200).
router.get('/bookings', (req, res) => {
  const { phone, contact_handle, status, stream_id, limit } = req.query;
  let sql = withStream + ' WHERE 1=1';
  const params = [];
  if (phone) { sql += ' AND b.parent_phone LIKE ?'; params.push('%' + phone + '%'); }
  if (contact_handle) { sql += ' AND b.contact_handle = ?'; params.push(contact_handle); }
  if (status) { sql += ' AND b.status = ?'; params.push(status); }
  if (stream_id) { sql += ' AND b.stream_id = ?'; params.push(stream_id); }
  sql += ' ORDER BY b.created_at DESC LIMIT ?';
  params.push(Math.min(parseInt(limit, 10) || 50, 200));
  res.json(db.prepare(sql).all(...params));
});

// GET /api/bot/bookings/:id — one lead with its current status and payment info.
router.get('/bookings/:id', (req, res) => {
  const booking = db.prepare(withStream + ' WHERE b.id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Заявка не найдена' });
  res.json(booking);
});

// PATCH /api/bot/bookings/:id — update funnel/payment fields (same rules as the admin panel).
router.patch('/bookings/:id', (req, res) => {
  const outcome = updateBooking(req.params.id, req.body);
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  res.json({ ok: true, booking: outcome.booking });
});

module.exports = router;
