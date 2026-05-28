const { Router } = require('express');
const db = require('../db');

const router = Router();

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const GENDER_CAP = 40;

function fmtDate(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

// GET /api/streams-status — aggregated PAID occupancy per stream (public, no auth, ТЗ §4-5).
// A seat counts as taken only when payment_status = 'paid'.
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT s.id, s.name, s.date_start, s.date_end, s.capacity,
      (SELECT COUNT(*) FROM bookings b WHERE b.stream_id = s.id AND b.payment_status = 'paid' AND b.gender = 'F') AS girls_paid,
      (SELECT COUNT(*) FROM bookings b WHERE b.stream_id = s.id AND b.payment_status = 'paid' AND b.gender = 'M') AS boys_paid
    FROM streams s
    WHERE s.is_active = 1
    ORDER BY s.date_start
  `).all();

  const streams = rows.map(s => {
    const girlsPaid = Math.min(s.girls_paid, GENDER_CAP);
    const boysPaid = Math.min(s.boys_paid, GENDER_CAP);
    const paidTotal = girlsPaid + boysPaid;
    const freeTotal = Math.max(0, s.capacity - paidTotal);
    return {
      id: s.id,
      name: s.name,
      date_start: s.date_start,
      date_end: s.date_end,
      dates: `${fmtDate(s.date_start)} – ${fmtDate(s.date_end)}`,
      capacity_total: s.capacity,
      capacity_girls: GENDER_CAP,
      capacity_boys: GENDER_CAP,
      paid_total: paidTotal,
      free_total: freeTotal,
      percent_total: Math.round((paidTotal / s.capacity) * 100),
      girls: {
        paid: girlsPaid,
        free: Math.max(0, GENDER_CAP - girlsPaid),
        percent: Math.round((girlsPaid / GENDER_CAP) * 100)
      },
      boys: {
        paid: boysPaid,
        free: Math.max(0, GENDER_CAP - boysPaid),
        percent: Math.round((boysPaid / GENDER_CAP) * 100)
      },
      status: freeTotal <= 0 ? 'full' : freeTotal <= 20 ? 'limited' : 'available'
    };
  });

  res.json({ updated_at: new Date().toISOString(), streams });
});

module.exports = router;
