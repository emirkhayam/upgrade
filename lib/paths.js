const path = require('path');

// Persistent data root. On the server DATA_DIR points at the mounted volume (/app/data);
// locally it falls back to the repo root. Uploads live alongside the DB so they survive
// redeploys on the same persistent volume — see [[deployment-coolify]].
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..');
const uploadsDir = path.join(dataDir, 'uploads');

module.exports = { dataDir, uploadsDir };
