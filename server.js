require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { uploadsDir } = require('./lib/paths');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Чистые адреса: старый /system.html → /system (301), /index.html → /
app.get(/\.html$/, (req, res, next) => {
  if (!['GET', 'HEAD'].includes(req.method)) return next();
  // Файл подтверждения Google Search Console — отдаём как есть, без редиректа
  if (/^\/google[0-9a-f]+\.html$/.test(req.path)) return next();
  let clean = req.path.replace(/\.html$/, '');
  if (clean.endsWith('/index')) clean = clean.slice(0, -'/index'.length) || '/';
  const query = req.originalUrl.slice(req.path.length); // сохранить ?...
  res.redirect(301, clean + query);
});

// Static files (extensions: html → /system отдаёт system.html)
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use('/uploads', express.static(uploadsDir));

// API routes
app.use('/api/streams', require('./routes/streams'));
app.use('/api/streams-status', require('./routes/streams-status'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/bot', require('./routes/bot'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/widget-chat', require('./routes/widget-chat'));

// Health check
app.get('/api/ping', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Fallback — serve index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`АПГРЕЙД server running at http://localhost:${PORT}`);
});
