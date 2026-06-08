const path = require('path');

// Persistent data root. On the server DATA_DIR points at the mounted volume (/app/data);
// locally it falls back to the repo root. Uploads live alongside the DB so they survive
// redeploys on the same persistent volume — see [[deployment-coolify]].
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..');
const uploadsDir = path.join(dataDir, 'uploads');
// Private files are NOT served by express.static — they hold children's personal
// documents (birth-certificate screenshots) and are streamed only through a
// JWT-protected admin route. Kept on the same persistent volume as uploads.
const privateDir = path.join(dataDir, 'private');

module.exports = { dataDir, uploadsDir, privateDir };
