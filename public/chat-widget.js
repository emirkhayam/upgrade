/* ============================================================
   AI ЧАТ-ПОМОЩНИК — ЗАГЛУШКА (placeholder).
   Видимая кнопка + мини-окно чата в стиле сайта, чтобы видеть «место».
   Команда бота заменяет ЭТОТ ФАЙЛ (или <script src="/chat-widget.js">)
   своим виджетом. Реальный бот пока не подключён — ответы здесь шаблонные.
   ============================================================ */
(function () {
  if (window.__apgradeChat) return;
  window.__apgradeChat = true;

  var WA = '996552180557'; // WhatsApp менеджера (+996 552 180 57)

  var css = `
  #apg-chat,#apg-chat *{box-sizing:border-box;font-family:'Onest',-apple-system,Segoe UI,sans-serif}
  #apg-chat-btn{
    position:fixed;right:22px;bottom:22px;z-index:2000;width:60px;height:60px;border:none;border-radius:50%;
    background:linear-gradient(135deg,#ff6a1f,#ffaa55);color:#fff;font-size:26px;cursor:pointer;
    box-shadow:0 10px 30px rgba(255,106,31,.45);display:flex;align-items:center;justify-content:center;
    transition:transform .2s, box-shadow .2s;
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
    position:fixed;right:22px;bottom:94px;z-index:2000;width:360px;max-width:calc(100vw - 32px);
    height:min(74vh,520px);background:#10131c;border:1px solid rgba(255,255,255,.12);border-radius:18px;
    display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.55);
    transform:translateY(16px);opacity:0;pointer-events:none;transition:transform .25s, opacity .25s;
  }
  #apg-chat-panel.open{transform:translateY(0);opacity:1;pointer-events:auto}
  .apg-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;background:#0a0c14;border-bottom:1px solid rgba(255,255,255,.08)}
  .apg-title{display:flex;align-items:center;gap:9px;font-weight:700;font-size:15px;color:#e8ecf2}
  .apg-title small{display:block;font-weight:400;font-size:11px;color:#7d8694;margin-top:1px}
  .apg-dot{width:9px;height:9px;border-radius:50%;background:#00c864;box-shadow:0 0 8px rgba(0,200,100,.7)}
  .apg-close{background:none;border:none;color:#7d8694;font-size:18px;cursor:pointer;padding:4px 8px;border-radius:8px}
  .apg-close:hover{color:#ff6a1f;background:rgba(255,255,255,.05)}
  .apg-body{flex:1;overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:10px;background:#0c0f18}
  .apg-msg{max-width:82%;padding:11px 14px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}
  .apg-msg.bot{align-self:flex-start;background:#1a1f2e;color:#e8ecf2;border-bottom-left-radius:5px}
  .apg-msg.user{align-self:flex-end;background:linear-gradient(135deg,#ff6a1f,#ff8c3f);color:#fff;border-bottom-right-radius:5px}
  .apg-note{align-self:center;font-size:11px;color:#7d8694;text-align:center;margin:2px 8px}
  .apg-form{display:flex;gap:8px;padding:12px;background:#0a0c14;border-top:1px solid rgba(255,255,255,.08)}
  .apg-form input{flex:1;padding:11px 13px;background:#05060a;border:1px solid rgba(255,255,255,.12);border-radius:10px;color:#e8ecf2;font-size:14px}
  .apg-form input:focus{outline:none;border-color:#ff6a1f}
  .apg-form button{width:44px;border:none;border-radius:10px;background:#ff6a1f;color:#fff;font-size:16px;cursor:pointer}
  .apg-form button:hover{background:#ff8c3f}
  @media(max-width:560px){
    #apg-chat-btn{right:16px;bottom:84px;width:54px;height:54px;font-size:23px}
    #apg-chat-panel{right:12px;left:12px;bottom:148px;width:auto;height:min(70vh,460px)}
  }`;

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var root = document.createElement('div');
  root.id = 'apg-chat';
  root.innerHTML =
    '<button id="apg-chat-btn" aria-label="Открыть чат"><span class="ic">💬</span><span class="x">✕</span></button>' +
    '<div id="apg-chat-panel" role="dialog" aria-label="Чат-помощник">' +
      '<div class="apg-head">' +
        '<div class="apg-title"><span class="apg-dot"></span><span>Помощник АПГРЕЙД<small>Онлайн · ответит за пару минут</small></span></div>' +
        '<button class="apg-close" id="apg-chat-close" aria-label="Закрыть">✕</button>' +
      '</div>' +
      '<div class="apg-body" id="apg-chat-body">' +
        '<div class="apg-msg bot">Привет! 👋 Я чат-помощник АПГРЕЙД. Помогу с вопросами о лагере, потоках и бронировании.</div>' +
        '<div class="apg-note">Ассистент скоро будет подключён</div>' +
      '</div>' +
      '<form class="apg-form" id="apg-chat-form">' +
        '<input id="apg-chat-text" type="text" placeholder="Напишите сообщение…" autocomplete="off">' +
        '<button type="submit" aria-label="Отправить">➤</button>' +
      '</form>' +
    '</div>';
  document.body.appendChild(root);

  var btn = document.getElementById('apg-chat-btn');
  var panel = document.getElementById('apg-chat-panel');
  var closeBtn = document.getElementById('apg-chat-close');
  var form = document.getElementById('apg-chat-form');
  var input = document.getElementById('apg-chat-text');
  var body = document.getElementById('apg-chat-body');

  function setOpen(open) {
    panel.classList.toggle('open', open);
    btn.classList.toggle('open', open);
    if (open) setTimeout(function () { input.focus(); }, 200);
  }
  btn.addEventListener('click', function () { setOpen(!panel.classList.contains('open')); });
  closeBtn.addEventListener('click', function () { setOpen(false); });

  function addMsg(text, who) {
    var d = document.createElement('div');
    d.className = 'apg-msg ' + who;
    d.textContent = text;
    body.appendChild(d);
    body.scrollTop = body.scrollHeight;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var t = input.value.trim();
    if (!t) return;
    addMsg(t, 'user');
    input.value = '';
    setTimeout(function () {
      addMsg('Спасибо за сообщение! Чат-бот скоро будет подключён. А пока напишите нам в WhatsApp — менеджер ответит в течение 2 часов.', 'bot');
      var a = document.createElement('a');
      a.href = 'https://wa.me/' + WA;
      a.target = '_blank';
      a.textContent = '💬 Написать в WhatsApp';
      a.style.cssText = 'align-self:flex-start;background:#25d366;color:#fff;text-decoration:none;padding:9px 14px;border-radius:12px;font-size:13px;font-weight:600';
      body.appendChild(a);
      body.scrollTop = body.scrollHeight;
    }, 600);
  });
})();
