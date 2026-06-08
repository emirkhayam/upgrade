// Adapter for sending WhatsApp messages through the project's own WhatsApp bot.
//
// The bot endpoint + auth are configured via environment variables (set later, when
// you give me the bot's address — no code change needed):
//   WHATSAPP_API_URL  — POST endpoint of your bot that actually delivers a WhatsApp message
//   WHATSAPP_API_KEY  — optional secret your bot expects (sent as Bearer + x-api-key)
//   WHATSAPP_PHONE_FIELD / WHATSAPP_TEXT_FIELD — override the JSON field names if your
//                        bot expects something other than { phone, message }
//
// Until WHATSAPP_API_URL is set, sendWhatsApp() returns { ok:false, reason:'not_configured' }
// so the OTP endpoint replies 503 instead of silently pretending a code was sent.

const API_URL = process.env.WHATSAPP_API_URL || '';
const API_KEY = process.env.WHATSAPP_API_KEY || '';
const PHONE_FIELD = process.env.WHATSAPP_PHONE_FIELD || 'phone';
const TEXT_FIELD = process.env.WHATSAPP_TEXT_FIELD || 'message';

// Normalise a Kyrgyz phone to digits with country code (no +, no spaces).
// Most WhatsApp APIs want the bare international number, e.g. 996700123456.
function normalizePhone(raw) {
  let p = String(raw || '').replace(/[^\d]/g, '');
  if (p.startsWith('0')) p = '996' + p.slice(1);      // 0700... -> 996700...
  if (p.length === 9) p = '996' + p;                  // 700123456 -> 996700123456
  return p;
}

// Low-level send. Returns { ok, reason?, status? }.
async function sendWhatsApp(phone, message) {
  if (!API_URL) return { ok: false, reason: 'not_configured' };

  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) {
    headers['Authorization'] = 'Bearer ' + API_KEY;
    headers['x-api-key'] = API_KEY;
  }

  const body = {};
  body[PHONE_FIELD] = normalizePhone(phone);
  body[TEXT_FIELD] = message;

  try {
    const r = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      console.error('[whatsapp] bot replied', r.status);
      return { ok: false, reason: 'bot_error', status: r.status };
    }
    return { ok: true };
  } catch (err) {
    console.error('[whatsapp] send failed:', err.message);
    return { ok: false, reason: 'unreachable' };
  }
}

// Whether WhatsApp sending is wired up yet. While false, the site skips the OTP
// step entirely so booking keeps working until you connect the bot (set WHATSAPP_API_URL).
function isConfigured() {
  return !!API_URL;
}

// Build the OTP message text and send it.
function sendOtp(phone, code) {
  const message =
    `АПГРЕЙД 2026\nВаш код подтверждения: ${code}\n` +
    `Введите его на сайте, чтобы перейти к оплате. Код действует 5 минут.`;
  return sendWhatsApp(phone, message);
}

module.exports = { sendWhatsApp, sendOtp, normalizePhone, isConfigured };
