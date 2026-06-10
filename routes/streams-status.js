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

// A seat counts as TAKEN when it's reserved (Бронь) or has confirmed money (partial deposit or full).
// So a deposit holds the spot — it stops showing as free. Leads without confirmed money don't hold a seat.
const OCCUPIED = "(b.status = 'reserved' OR b.payment_status IN ('partial','paid'))";

// GET /api/streams-status — aggregated occupancy per stream (public, no auth, ТЗ §4-5).
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT s.id, s.name, s.date_start, s.date_end, s.capacity, COALESCE(s.is_full, 0) AS is_full,
      (SELECT COUNT(*) FROM bookings b WHERE b.stream_id = s.id AND ${OCCUPIED} AND b.gender = 'F') AS girls_taken,
      (SELECT COUNT(*) FROM bookings b WHERE b.stream_id = s.id AND ${OCCUPIED} AND b.gender = 'M') AS boys_taken
    FROM streams s
    WHERE s.is_active = 1
    ORDER BY s.date_start
  `).all();

  const streams = rows.map(s => {
    // Поток вручную помечен «Мест нет» в админке → показываем полностью занятым.
    const forcedFull = s.is_full === 1;
    const girlsTaken = forcedFull ? GENDER_CAP : Math.min(s.girls_taken, GENDER_CAP);
    const boysTaken = forcedFull ? GENDER_CAP : Math.min(s.boys_taken, GENDER_CAP);
    const takenTotal = girlsTaken + boysTaken;
    const freeTotal = Math.max(0, s.capacity - takenTotal);
    return {
      id: s.id,
      name: s.name,
      date_start: s.date_start,
      date_end: s.date_end,
      dates: `${fmtDate(s.date_start)} – ${fmtDate(s.date_end)}`,
      capacity_total: s.capacity,
      capacity_girls: GENDER_CAP,
      capacity_boys: GENDER_CAP,
      taken_total: takenTotal,
      free_total: freeTotal,
      percent_total: Math.round((takenTotal / s.capacity) * 100),
      girls: {
        taken: girlsTaken,
        free: Math.max(0, GENDER_CAP - girlsTaken),
        percent: Math.round((girlsTaken / GENDER_CAP) * 100)
      },
      boys: {
        taken: boysTaken,
        free: Math.max(0, GENDER_CAP - boysTaken),
        percent: Math.round((boysTaken / GENDER_CAP) * 100)
      },
      status: freeTotal <= 0 ? 'full' : freeTotal <= 20 ? 'limited' : 'available'
    };
  });

  res.json({ updated_at: new Date().toISOString(), streams });
});

module.exports = router;
