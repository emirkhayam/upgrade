const { Router } = require('express');
const db = require('../db');

const router = Router();

// GET /api/streams — available streams with spots left
router.get('/', (req, res) => {
  const streams = db.prepare(`
    SELECT
      s.id, s.name, s.date_start, s.date_end, s.capacity, s.price,
      s.capacity - COALESCE(
        (SELECT COUNT(*) FROM bookings b WHERE b.stream_id = s.id AND b.status != 'cancelled'),
        0
      ) AS spots_left
    FROM streams s
    WHERE s.is_active = 1
    ORDER BY s.date_start
  `).all();

  res.json(streams);
});

module.exports = router;
