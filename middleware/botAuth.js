// Protects the chat-bot API with a shared secret passed in the `x-api-key` header.
// If BOT_API_KEY is not configured the endpoints stay closed (503) so an empty key never bypasses auth.
function botAuth(req, res, next) {
  const expected = process.env.BOT_API_KEY;
  if (!expected) {
    return res.status(503).json({ error: 'Bot API не настроен' });
  }
  const key = req.get('x-api-key');
  if (!key || key !== expected) {
    return res.status(401).json({ error: 'Невалидный ключ' });
  }
  next();
}

module.exports = botAuth;
