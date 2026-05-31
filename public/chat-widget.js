/* ============================================================
   AI ЧАТ-ПОМОЩНИК АПГРЕЙД — реальный виджет для сайта
   Подключение:
   <script src="/chat-widget.js"></script>

   Требует backend endpoint:
   POST /api/widget-chat
   body: { session_id: string, message: string }
   response: { reply: string }
   ============================================================ */
(function () {
  if (window.__apgradeChat) return;
  window.__apgradeChat = true;

  var CONFIG = window.APGAIChat || {};
  var API_URL = CONFIG.apiUrl || '/api/widget-chat';
  var WA = CONFIG.whatsapp || '996552180557';
  var TITLE = CONFIG.title || 'Помощник АПГРЕЙД';
  var SUBTITLE = CONFIG.subtitle || 'Онлайн · отвечает сразу';
  var STORAGE_KEY = 'apg_chat_session_id';
  var HISTORY_KEY = 'apg_chat_history';

  function getSessionId() {
    try {
      var existing = localStorage.getItem(STORAGE_KEY);
      if (existing) return existing;

      var id = 'web_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
      localStorage.setItem(STORAGE_KEY, id);
      return id;
    } catch (e) {
      return 'web_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
    }
  }

  var sessionId = getSessionId();

  var css = `
  #apg-chat,#apg-chat *{box-sizing:border-box;font-family:'Onest',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
  #apg-chat-btn{
    position:fixed;right:22px;bottom:22px;z-index:2147483000;width:60px;height:60px;border:none;border-radius:50%;
    background:linear-gradient(135deg,#ff6a1f,#ffaa55);color:#fff;font-size:26px;cursor:pointer;
    box-shadow:0 10px 30px rgba(255,106,31,.45);display:flex;align-items:center;justify-content:center;
    transition:transform .2s,box-shadow .2s;
  }
  #apg-chat-btn:hover{transform:translateY(-2px) scale(1.05);box-shadow:0 14px 36px rgba(255,106,31,.6)}
  #apg-chat-btn .x{display:none}
  #apg-chat-btn.open .ic{display:none}
  #apg-chat-btn.open .x{display:block}
  #apg-chat-btn::after{
    content:'';position:absolute;inset:-4px;border-radius:50%;border:2px solid rgba(255,106,31,.5);
    animation:apgPulse 2s infinite;
  }
  #apg-chat-btn.open::after{display:none}
  @keyframes apgPulse{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.5);opacity:0}}

  #apg-chat-panel{
    position:fixed;right:22px;bottom:94px;z-index:2147483000;width:370px;max-width:calc(100vw - 32px);
    height:min(74vh,540px);background:#10131c;border:1px solid rgba(255,255,255,.12);border-radius:18px;
    display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.55);
    transform:translateY(16px);opacity:0;pointer-events:none;transition:transform .25s,opacity .25s;
  }
  #apg-chat-panel.open{transform:translateY(0);opacity:1;pointer-events:auto}

  .apg-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;background:#0a0c14;border-bottom:1px solid rgba(255,255,255,.08)}
  .apg-title{display:flex;align-items:center;gap:9px;font-weight:700;font-size:15px;color:#e8ecf2}
  .apg-title small{display:block;font-weight:400;font-size:11px;color:#7d8694;margin-top:1px}
  .apg-dot{width:9px;height:9px;border-radius:50%;background:#00c864;box-shadow:0 0 8px rgba(0,200,100,.7)}
  .apg-close{background:none;border:none;color:#7d8694;font-size:18px;cursor:pointer;padding:4px 8px;border-radius:8px}
  .apg-close:hover{color:#ff6a1f;background:rgba(255,255,255,.05)}

  .apg-body{flex:1;overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:10px;background:#0c0f18}
  .apg-msg{max-width:84%;padding:11px 14px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}
  .apg-msg.bot{align-self:flex-start;background:#1a1f2e;color:#e8ecf2;border-bottom-left-radius:5px}
  .apg-msg.user{align-self:flex-end;background:linear-gradient(135deg,#ff6a1f,#ff8c3f);color:#fff;border-bottom-right-radius:5px}
  .apg-msg.error{background:#3a1820;color:#ffd7df}
  .apg-note{align-self:center;font-size:11px;color:#7d8694;text-align:center;margin:2px 8px}

  .apg-typing{align-self:flex-start;background:#1a1f2e;color:#b9c0cc;padding:10px 13px;border-radius:14px;border-bottom-left-radius:5px;font-size:13px}
  .apg-typing span{display:inline-block;animation:apgBlink 1.2s infinite}
  .apg-typing span:nth-child(2){animation-delay:.2s}
  .apg-typing span:nth-child(3){animation-delay:.4s}
  @keyframes apgBlink{0%,80%,100%{opacity:.25}40%{opacity:1}}

  .apg-actions{display:flex;gap:8px;flex-wrap:wrap;padding:0 12px 12px;background:#0a0c14}
  .apg-action{
    color:#fff;background:#1a1f2e;border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:8px 11px;
    font-size:12px;cursor:pointer;
  }
  .apg-action:hover{border-color:#ff6a1f;color:#ffb27d}

  .apg-form{display:flex;gap:8px;padding:12px;background:#0a0c14;border-top:1px solid rgba(255,255,255,.08)}
  .apg-form input{flex:1;padding:11px 13px;background:#05060a;border:1px solid rgba(255,255,255,.12);border-radius:10px;color:#e8ecf2;font-size:14px}
  .apg-form input:focus{outline:none;border-color:#ff6a1f}
  .apg-form button{width:44px;border:none;border-radius:10px;background:#ff6a1f;color:#fff;font-size:16px;cursor:pointer}
  .apg-form button:hover{background:#ff8c3f}
  .apg-form button:disabled{opacity:.55;cursor:not-allowed}

  .apg-wa{
    align-self:flex-start;background:#25d366;color:#fff;text-decoration:none;padding:9px 14px;border-radius:12px;
    font-size:13px;font-weight:700;
  }

  @media(max-width:560px){
    #apg-chat-btn{right:16px;bottom:84px;width:54px;height:54px;font-size:23px}
    #apg-chat-panel{right:12px;left:12px;bottom:148px;width:auto;height:min(70vh,480px)}
  }`;

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var root = document.createElement('div');
  root.id = 'apg-chat';
  root.innerHTML =
    '<button id="apg-chat-btn" aria-label="Открыть чат">' +
      '<svg class="ic" width="30" height="30" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" fill="currentColor"/>' +
        '<circle cx="7.5" cy="9.5" r="1.6" fill="#ff6a1f"/>' +
        '<circle cx="12" cy="9.5" r="1.6" fill="#ff6a1f"/>' +
        '<circle cx="16.5" cy="9.5" r="1.6" fill="#ff6a1f"/>' +
      '</svg>' +
      '<svg class="x" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' +
      '</svg>' +
    '</button>' +
    '<div id="apg-chat-panel" role="dialog" aria-label="Чат-помощник">' +
      '<div class="apg-head">' +
        '<div class="apg-title"><span class="apg-dot"></span><span>' + escapeHtml(TITLE) + '<small>' + escapeHtml(SUBTITLE) + '</small></span></div>' +
        '<button class="apg-close" id="apg-chat-close" aria-label="Закрыть">✕</button>' +
      '</div>' +
      '<div class="apg-body" id="apg-chat-body"></div>' +
      '<div class="apg-actions" id="apg-chat-actions">' +
        '<button class="apg-action" data-text="Какие есть потоки?">Потоки</button>' +
        '<button class="apg-action" data-text="Сколько стоит лагерь?">Цена</button>' +
        '<button class="apg-action" data-text="Хочу забронировать место">Бронь</button>' +
      '</div>' +
      '<form class="apg-form" id="apg-chat-form">' +
        '<input id="apg-chat-text" type="text" placeholder="Напишите сообщение…" autocomplete="off">' +
        '<button id="apg-chat-send" type="submit" aria-label="Отправить">➤</button>' +
      '</form>' +
    '</div>';

  document.body.appendChild(root);

  var btn = document.getElementById('apg-chat-btn');
  var panel = document.getElementById('apg-chat-panel');
  var closeBtn = document.getElementById('apg-chat-close');
  var form = document.getElementById('apg-chat-form');
  var input = document.getElementById('apg-chat-text');
  var sendBtn = document.getElementById('apg-chat-send');
  var body = document.getElementById('apg-chat-body');
  var actions = document.getElementById('apg-chat-actions');

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function setOpen(open) {
    panel.classList.toggle('open', open);
    btn.classList.toggle('open', open);

    if (open) {
      setTimeout(function () {
        input.focus();
      }, 200);
    }
  }

  btn.addEventListener('click', function () {
    setOpen(!panel.classList.contains('open'));
  });

  closeBtn.addEventListener('click', function () {
    setOpen(false);
  });

  function saveHistory() {
    try {
      var messages = Array.prototype.slice.call(body.querySelectorAll('.apg-msg')).map(function (el) {
        return {
          who: el.classList.contains('user') ? 'user' : 'bot',
          text: el.textContent || '',
          error: el.classList.contains('error')
        };
      }).slice(-30);

      localStorage.setItem(HISTORY_KEY, JSON.stringify(messages));
    } catch (e) {}
  }

  function loadHistory() {
    try {
      var raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return false;

      var messages = JSON.parse(raw);
      if (!Array.isArray(messages) || !messages.length) return false;

      messages.forEach(function (m) {
        addMsg(m.text, m.who, !!m.error, false);
      });

      return true;
    } catch (e) {
      return false;
    }
  }

  function addMsg(text, who, isError, shouldSave) {
    var d = document.createElement('div');
    d.className = 'apg-msg ' + who + (isError ? ' error' : '');
    d.textContent = text;

    body.appendChild(d);
    body.scrollTop = body.scrollHeight;

    if (shouldSave !== false) {
      saveHistory();
    }
  }

  function addWhatsAppLink(message) {
    var a = document.createElement('a');
    a.href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent(message || 'Здравствуйте! Хочу задать вопрос по лагерю.');
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className = 'apg-wa';
    a.textContent = '💬 Написать в WhatsApp';

    body.appendChild(a);
    body.scrollTop = body.scrollHeight;
  }

  function showTyping() {
    var t = document.createElement('div');
    t.className = 'apg-typing';
    t.id = 'apg-chat-typing';
    t.innerHTML = '<span>●</span> <span>●</span> <span>●</span>';

    body.appendChild(t);
    body.scrollTop = body.scrollHeight;
  }

  function hideTyping() {
    var t = document.getElementById('apg-chat-typing');
    if (t) t.remove();
  }

  function setLoading(loading) {
    input.disabled = loading;
    sendBtn.disabled = loading;
  }

  async function sendMessage(text) {
    var message = String(text || '').trim();
    if (!message) return;

    addMsg(message, 'user');

    input.value = '';
    setLoading(true);
    showTyping();

    try {
      var res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          session_id: sessionId,
          message: message,
          page_url: window.location.href,
          page_title: document.title
        })
      });

      var data = await res.json().catch(function () {
        return {};
      });

      hideTyping();

      if (!res.ok) {
        throw new Error(data.error || data.message || 'Ошибка сервера');
      }

      var reply = data.reply || data.message || 'Спасибо! Я получил ваше сообщение.';
      addMsg(reply, 'bot');

      if (data.show_whatsapp) {
        addWhatsAppLink(message);
      }

    } catch (err) {
      hideTyping();

      addMsg(
        'Не получилось получить ответ от бота. Можете написать в WhatsApp, менеджер поможет.',
        'bot',
        true
      );

      addWhatsAppLink(message);

      console.error('[APG chat widget]', err);
    } finally {
      setLoading(false);
      input.focus();
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    sendMessage(input.value);
  });

  actions.addEventListener('click', function (e) {
    var quickButton = e.target.closest('[data-text]');
    if (!quickButton) return;

    sendMessage(quickButton.getAttribute('data-text'));
  });

  if (!loadHistory()) {
    addMsg(
      'Привет! 👋 Я чат-помощник АПГРЕЙД. Помогу с вопросами о лагере, потоках и бронировании.',
      'bot'
    );

    var note = document.createElement('div');
    note.className = 'apg-note';
    note.textContent = 'Обычно отвечаю сразу';
    body.appendChild(note);
  }
})();