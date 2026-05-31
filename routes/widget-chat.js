const express = require('express');
const router = express.Router();

// Адрес бота-«мозга» разработчика. По умолчанию — его http-сервер.
// Меняется через переменную окружения BOT_CHAT_URL без правки кода.
const BOT_CHAT_URL = process.env.BOT_CHAT_URL || 'http://143.110.225.55:3003/api/widget-chat';

// Прокси: браузер шлёт сюда (наш https-домен), мы тихо пересылаем боту.
// Так на сайте по https нет «mixed content» — грязный http остаётся между серверами.
router.post('/', async (req, res) => {
  try {
    const upstream = await fetch(BOT_CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
      signal: AbortSignal.timeout(20000),
    });

    const text = await upstream.text();

    res.status(upstream.status);
    res.set('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.send(text);
  } catch (err) {
    console.error('[widget-chat proxy]', err.message);
    res.status(502).json({
      error: 'bot_unreachable',
      reply: 'Не получилось связаться с ботом. Напишите, пожалуйста, в WhatsApp — менеджер поможет.',
      show_whatsapp: true,
    });
  }
});

module.exports = router;
