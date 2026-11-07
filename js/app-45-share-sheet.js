/* ───────── v-share-sheet: نافذة مشاركة واحدة لكلّ التطبيق (لقطة المالك ٧ نوفمبر: نافذة يوتيوب — دوائر التطبيقات ورابط بزرّ «نسخ» —
 * «الي اريده في التطبيق نفس هذي في كل التطبيق»، ثمّ «الصور لا ترسمه، الي اريده الصور الرسمية») ─────────
 * الجذر: تطبيق متجر مايكروسوفت يُعدّ «تطبيقًا» (omranLikelyApp: display-mode standalone) فكانت مسارات المشاركة تفتح لوحة ويندوز —
 * تعلق على الدوّارة «مشاركة». الآن كلّ زرّ مشاركة يفتح هذه النافذة داخل التطبيق:
 *   WhatsApp · Telegram · Facebook · X · Snapchat · الرسائل (الجوّال) · البريد · المزيد (الجوّال وحده: ورقة الهاتف أو جسر غلاف المتجر —
 *   الطريق الوحيد لإرسال الملفّ نفسه) ثمّ الرابط بزرّ «نسخ». لا «المزيد» على ويندوز/ماك أبدًا (هو لوحة ويندوز المعلّقة). إنستغرام لا
 *   يقبل المشاركة من المواقع فلا زرّ له (قرار المالك: سناب شات مكانه).
 * الشعارات رسميّة: مسارات Simple Icons (CC0) بألوان العلامات؛ البريد والمزيد أيقونتان عامّتان كيوتيوب.
 * الحاسوب: نافذة وسط بصفّ واحد يتمرّر بسهمين؛ الجوّال: ورقة من الأسفل بشبكة ٤ أعمدة (لا تمرير أفقيّ — فخّ هواوي v-shelf-nocomposite).
 * داخل <dialog> مفتوح (الإعدادات) تُلحق النافذة بالحوار نفسه وإلّا رُسمت خلف طبقته العليا.
 * opts: { url, getUrl (وعد رابط يُجهَّز عند الفتح — رفع الصورة)، text، title، file (File لـ«المزيد»)، more (دالّة بديلة لـ«المزيد»)،
 *         extras: [{ label, icon: 'download'|'copy', onClick(close, note) }] } */
(function(){
  'use strict';
  var P = {"whatsapp": "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z", "telegram": "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z", "facebook": "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z", "x": "M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z", "snapchat": "M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301.165-.088.344-.104.464-.104.182 0 .359.029.509.09.45.149.734.479.734.838.015.449-.39.839-1.213 1.168-.089.029-.209.075-.344.119-.45.135-1.139.36-1.333.81-.09.224-.061.524.12.868l.015.015c.06.136 1.526 3.475 4.791 4.014.255.044.435.27.42.509 0 .075-.015.149-.045.225-.24.569-1.273.988-3.146 1.271-.059.091-.12.375-.164.57-.029.179-.074.36-.134.553-.076.271-.27.405-.555.405h-.03c-.135 0-.313-.031-.538-.074-.36-.075-.765-.135-1.273-.135-.3 0-.599.015-.913.074-.6.104-1.123.464-1.723.884-.853.599-1.826 1.288-3.294 1.288-.06 0-.119-.015-.18-.015h-.149c-1.468 0-2.427-.675-3.279-1.288-.599-.42-1.107-.779-1.707-.884-.314-.045-.629-.074-.928-.074-.54 0-.958.089-1.272.149-.211.043-.391.074-.54.074-.374 0-.523-.224-.583-.42-.061-.192-.09-.389-.135-.567-.046-.181-.105-.494-.166-.57-1.918-.222-2.95-.642-3.189-1.226-.031-.063-.052-.15-.055-.225-.015-.243.165-.465.42-.509 3.264-.54 4.73-3.879 4.791-4.02l.016-.029c.18-.345.224-.645.119-.869-.195-.434-.884-.658-1.332-.809-.121-.029-.24-.074-.346-.119-1.107-.435-1.257-.93-1.197-1.273.09-.479.674-.793 1.168-.793.146 0 .27.029.383.074.42.194.789.3 1.104.3.234 0 .384-.06.465-.105l-.046-.569c-.098-1.626-.225-3.651.307-4.837C7.392 1.077 10.739.807 11.727.807l.419-.015h.06z", "googlemessages": "M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zM4.911 7.089h11.456a2.197 2.197 0 0 1 2.165 2.19v5.863a2.213 2.213 0 0 1-2.177 2.178H8.04c-1.174 0-2.04-.99-2.04-2.178v-4.639L4.503 7.905c-.31-.42-.05-.816.408-.816zm3.415 2.19c-.347 0-.68.21-.68.544 0 .334.333.544.68.544h7.905c.346 0 .68-.21.68-.544 0-.334-.334-.545-.68-.545zm0 2.177c-.347 0-.68.21-.68.544 0 .334.333.544.68.544h7.905c.346 0 .68-.21.68-.544 0-.334-.334-.544-.68-.544zm-.013 2.19c-.346 0-.68.21-.68.544 0 .334.334.544.68.544h5.728c.347 0 .68-.21.68-.544 0-.334-.333-.545-.68-.545z"};
  var BRAND = {
    whatsapp: { bg: '#25D366', fg: '#fff', d: P.whatsapp, s: 0.62 },
    telegram: { bg: '#fff', fg: '#26A5E4', d: P.telegram, s: 1, round: true },
    facebook: { bg: '#fff', fg: '#0866FF', d: P.facebook, s: 1, round: true },
    x: { bg: '#000', fg: '#fff', d: P.x, s: 0.5 },
    snapchat: { bg: '#FFFC00', fg: '#fff', d: P.snapchat, s: 0.62, stroke: '#000' },
    messages: { bg: '#fff', fg: '#1A73E8', d: P.googlemessages, s: 1, round: true }
  };
  var LINE = {
    chat: '<path d="M4 6a3 3 0 013-3h10a3 3 0 013 3v7a3 3 0 01-3 3H10l-5 4v-4.3A3 3 0 014 13V6z" fill="currentColor" stroke="none"/>',
    email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    more: '<circle cx="6" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18" cy="12" r="1.3" fill="currentColor"/>',
    download: '<path d="M12 3v11m0 0l-4-4m4 4l4-4M5 17v2a2 2 0 002 2h10a2 2 0 002-2v-2"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/>'
  };
  function tt(k, ar, en){
    try{ var v = (typeof window.t === 'function') ? window.t(k) : ''; if(typeof v === 'string' && v && v !== k) return v; }catch(e){ __swallow(e, 'share-sheet:t'); }
    var l = ''; try{ l = (typeof lang !== 'undefined' && lang) ? lang : (document.documentElement.lang || 'ar'); }catch(e){ l = 'ar'; }
    return (l === 'ar' || l === 'ur') ? ar : en;
  }
  function phone(){ try{ return typeof omranMobileUA === 'function' ? !!omranMobileUA() : /Android|iPhone|iPad|iPod|HarmonyOS|HUAWEI|Mobile/i.test(navigator.userAgent || ''); }catch(e){ return false; } }
  function android(){ try{ return /Android|HarmonyOS|HUAWEI|HONOR/i.test(navigator.userAgent || ''); }catch(e){ return false; } }
  function brandSvg(b){
    var k = b.s, off = (24 - 24 * k) / 2;
    var g = '<g transform="translate(' + off + ' ' + off + ') scale(' + k + ')"><path d="' + b.d + '" fill="' + b.fg + '"' + (b.stroke ? ' stroke="' + b.stroke + '" stroke-width="1.1" paint-order="stroke"' : '') + '/></g>';
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (b.round ? '<circle cx="12" cy="12" r="10.6" fill="#fff"/>' : '') + g + '</svg>';
  }
  function lineSvg(name){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (LINE[name] || '') + '</svg>'; }
  function el(tag, cls, text){ var e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = String(text); return e; }
  function copyText(txt){
    try{ if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(txt).catch(function(e){ __swallow(e, 'share-sheet:copy-async'); }); return true; } }catch(e){ __swallow(e, 'share-sheet:copy'); }
    try{ var ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); ta.remove(); return ok; }catch(e){ __swallow(e, 'share-sheet:copy-legacy'); }
    return false;
  }
  function openUrl(u){
    if(/^(mailto|sms):/i.test(u)){ try{ location.href = u; return; }catch(e){ __swallow(e, 'share-sheet:href'); } }
    try{ var a = document.createElement('a'); a.href = u; a.target = '_blank'; a.rel = 'noopener'; a.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.appendChild(a); a.click(); setTimeout(function(){ try{ a.remove(); }catch(e){ __swallow(e, 'share-sheet:a-rm'); } }, 1500); return; }catch(e){ __swallow(e, 'share-sheet:a'); }
    try{ window.open(u, '_blank', 'noopener'); }catch(e){ __swallow(e, 'share-sheet:open'); }
  }
  function css(){
    if(document.getElementById('omShareCss')) return;
    var st = document.createElement('style'); st.id = 'omShareCss';
    st.textContent = '.omShOv{position:fixed;inset:0;z-index:2147483600;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center}'
      + '.omSh{box-sizing:border-box;width:min(560px,calc(100vw - 24px));background:#212121;color:#fff;border-radius:16px;padding:18px 20px 20px;box-shadow:0 20px 60px rgba(0,0,0,.5);font-family:inherit;text-align:start}'
      + '.omShHd{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}.omShHd b{font-size:17px;font-weight:700}'
      + '.omShX{-webkit-appearance:none;appearance:none;background:none;border:0;color:#ddd;cursor:pointer;padding:4px;display:flex}.omShX svg{width:24px;height:24px}'
      + '.omShRowW{position:relative}.omShRow{display:flex;gap:18px;overflow-x:auto;scrollbar-width:none;padding:2px 2px 6px;scroll-behavior:smooth}.omShRow::-webkit-scrollbar{display:none}'
      + '.omShIt{-webkit-appearance:none;appearance:none;background:none;border:0;color:inherit;font:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;min-width:72px;padding:0}'
      + '.omShIt span{font-size:12.5px;color:#e5e5e5;white-space:nowrap}.omShIt[disabled]{opacity:.4;cursor:default}'
      + '.omShC{width:60px;height:60px;border-radius:50%;display:flex;align-items:center;justify-content:center;overflow:hidden;color:#fff}.omShC svg{width:100%;height:100%;display:block}'
      + '.omShC.ln svg{width:28px;height:28px}'
      + '.omShArr{position:absolute;top:12px;width:38px;height:38px;border-radius:50%;border:0;background:#3a3a3a;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.5);z-index:2;font-size:20px;line-height:1}'
      + '.omShArr[hidden]{display:none}'
      + '.omShLk{margin-top:18px;display:flex;align-items:center;gap:10px;border:1px solid #3d3d3d;border-radius:12px;background:#0f0f0f;padding:8px 10px}'
      + '.omShLk input{flex:1;min-width:0;background:none;border:0;outline:0;color:#ddd;font:inherit;font-size:14px;direction:ltr;text-align:left;text-overflow:ellipsis}'
      + '.omShLk button{-webkit-appearance:none;appearance:none;border:0;cursor:pointer;background:#3ea6ff;color:#0f0f0f;font:inherit;font-weight:700;border-radius:999px;padding:8px 16px;font-size:13.5px;white-space:nowrap}'
      + '.omShLk button[disabled]{opacity:.5;cursor:default}'
      + '.omShNote{margin-top:10px;font-size:12.5px;color:#bdbdbd;min-height:1em}'
      + 'html.mobile-ui .omShOv{align-items:flex-end}html.mobile-ui .omSh{width:100%;border-radius:18px 18px 0 0;padding-bottom:calc(22px + env(safe-area-inset-bottom,0px))}'
      + 'html.mobile-ui .omShRow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px 4px;overflow:visible}html.mobile-ui .omShIt{min-width:0}html.mobile-ui .omShArr{display:none}'
      + 'html[data-mode="light"] .omSh{background:#fff;color:#0f0f0f}html[data-mode="light"] .omShIt span{color:#0f0f0f}html[data-mode="light"] .omShX{color:#333}'
      + 'html[data-mode="light"] .omShLk{background:#f2f2f2;border-color:#e0e0e0}html[data-mode="light"] .omShLk input{color:#0f0f0f}html[data-mode="light"] .omShC.ln{background:#e8e8e8 !important;color:#0f0f0f}'
      + 'html[data-mode="light"] .omShNote{color:#555}';
    document.head.appendChild(st);
  }
  function host(){ try{ var ds = document.querySelectorAll('dialog[open]'); if(ds.length) return ds[ds.length - 1]; }catch(e){ __swallow(e, 'share-sheet:host'); } return document.body; }

  window.omranShareSheet = function(opts){
    var o = opts || {};
    css();
    try{ var old = document.querySelector('.omShOv'); if(old) old.remove(); }catch(e){ __swallow(e, 'share-sheet:old'); }
    var text = String(o.text || '').trim(), url = String(o.url || ''), pending = !url && typeof o.getUrl === 'function';
    var title = o.title || tt('shareSheetTitle', 'مشاركة', 'Share');
    var ov = el('div', 'omShOv'), sh = el('div', 'omSh'); ov.appendChild(sh);
    try{ sh.dir = (document.documentElement.dir || 'rtl'); }catch(e){ __swallow(e, 'share-sheet:dir'); }
    var close = function(){ try{ ov.remove(); document.removeEventListener('keydown', onKey, true); }catch(e){ __swallow(e, 'share-sheet:close'); } };
    var onKey = function(e){ if(e.key === 'Escape'){ e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    ov.addEventListener('click', function(e){ if(e.target === ov) close(); });
    var hd = el('div', 'omShHd'); hd.appendChild(el('b', '', title));
    var xb = el('button', 'omShX'); xb.type = 'button'; xb.setAttribute('aria-label', tt('closeTitle', 'إغلاق', 'Close'));
    xb.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    xb.onclick = close; hd.appendChild(xb); sh.appendChild(hd);
    var note = el('div', 'omShNote');
    var say = function(m){ note.textContent = m || ''; };
    var msg = function(){ return [text, url].filter(Boolean).join('\n'); };
    var e = encodeURIComponent;
    var isPhone = phone();
    /* need: يحتاج رابطًا (فيسبوك وسناب لا يقبلان نصًّا وحده) */
    var APPS = [
      { id: 'whatsapp', n: 'WhatsApp', go: function(){ return 'https://wa.me/?text=' + e(msg()); } },
      { id: 'telegram', n: 'Telegram', go: function(){ return 'https://t.me/share/url?url=' + e(url || text) + (url && text ? '&text=' + e(text) : ''); } },
      { id: 'facebook', n: 'Facebook', need: true, go: function(){ return 'https://www.facebook.com/sharer/sharer.php?u=' + e(url); } },
      { id: 'x', n: 'X', go: function(){ return 'https://x.com/intent/tweet?text=' + e(text || '') + (url ? '&url=' + e(url) : ''); } },
      { id: 'snapchat', n: 'Snapchat', need: true, go: function(){ return 'https://www.snapchat.com/scan?attachmentUrl=' + e(url); } }
    ];
    if(isPhone) APPS.push({ id: 'messages', n: tt('shareMessages', 'الرسائل', 'Messages'), line: !android() ? 'chat' : '', go: function(){ return 'sms:?&body=' + e(msg()); } });
    APPS.push({ id: 'email', n: tt('shareEmail', 'البريد', 'Email'), line: 'email', bg: '#5f6368', go: function(){ return 'mailto:?subject=' + e(o.mailSubject || 'om ai') + '&body=' + e(msg()); } });
    var canMore = isPhone && (typeof o.more === 'function' || (typeof omranNativeBridge === 'function' && omranNativeBridge('omranShare') && o.file && typeof msgDownloadBlob === 'function') || typeof navigator.share === 'function');
    var rowW = el('div', 'omShRowW'), row = el('div', 'omShRow'); rowW.appendChild(row);
    var needBtns = [];
    var addItem = function(label, circle, onClick, needsUrl){
      var b = el('button', 'omShIt'); b.type = 'button';
      b.appendChild(circle); b.appendChild(el('span', '', label));
      b.onclick = function(ev){ try{ if(ev && ev.stopPropagation) ev.stopPropagation(); if(b.disabled) return; onClick(); }catch(err){ __swallow(err, 'share-sheet:item'); } };
      if(needsUrl){ needBtns.push(b); if(!url) b.disabled = true; }
      row.appendChild(b);
      return b;
    };
    var nothing = !url && !pending && !text; /* ملفّ بلا رابط ولا نصّ: «المزيد» والإضافات وحدها — لا واتساب برسالة فارغة */
    APPS.forEach(function(a){
      if(nothing || (a.need && !url && !pending)) return;
      var c = el('div', 'omShC' + (a.line ? ' ln' : ''));
      if(a.line){ c.style.background = a.bg || '#34C759'; c.innerHTML = lineSvg(a.line); }
      else { var br = BRAND[a.id]; c.style.background = br.round ? 'transparent' : br.bg; c.innerHTML = brandSvg(br); }
      addItem(a.n, c, function(){ openUrl(a.go()); }, !!(a.need || (pending && !text)));
    });
    if(canMore){
      var mc = el('div', 'omShC ln'); mc.style.background = '#3a3a3a'; mc.innerHTML = lineSvg('more');
      addItem(tt('shareMore', 'المزيد', 'More'), mc, function(){
        if(typeof o.more === 'function'){ o.more(close); return; }
        try{
          if(o.file && typeof omranNativeBridge === 'function' && omranNativeBridge('omranShare') && typeof msgDownloadBlob === 'function'){ msgDownloadBlob(o.file, o.file.name || 'omran-file'); close(); return; }
          var data = (o.file && navigator.canShare && navigator.canShare({ files: [o.file] })) ? { files: [o.file], title: 'om ai' } : { title: 'om ai', text: text || undefined, url: url || undefined };
          var pr = navigator.share(data);
          if(pr && pr.then) pr.then(close, function(err){ if(!(err && err.name === 'AbortError')) say(tt('shareFail', 'تعذّرت المشاركة — جرّب نسخ الرابط', 'Could not share — try copying the link')); });
        }catch(err){ __swallow(err, 'share-sheet:more'); say(tt('shareFail', 'تعذّرت المشاركة — جرّب نسخ الرابط', 'Could not share — try copying the link')); }
      }, false);
    }
    (o.extras || []).forEach(function(x){
      var c = el('div', 'omShC ln'); c.style.background = '#3a3a3a'; c.innerHTML = lineSvg(x.icon || 'download');
      addItem(x.label, c, function(){ x.onClick(close, say); }, false);
    });
    var prev = el('button', 'omShArr'), next = el('button', 'omShArr');
    prev.type = next.type = 'button'; prev.textContent = '‹'; next.textContent = '›';
    prev.style.left = '-14px'; next.style.right = '-14px';
    prev.setAttribute('aria-label', '‹'); next.setAttribute('aria-label', '›');
    prev.onclick = function(){ row.scrollBy({ left: -260, behavior: 'smooth' }); };
    next.onclick = function(){ row.scrollBy({ left: 260, behavior: 'smooth' }); };
    rowW.appendChild(prev); rowW.appendChild(next);
    var arrows = function(){
      var max = row.scrollWidth - row.clientWidth, x = row.scrollLeft;
      if(max <= 2){ prev.hidden = next.hidden = true; return; }
      /* يمين-يسار في كروم: scrollLeft من ٠ نزولًا إلى -max */
      var rtl = getComputedStyle(row).direction === 'rtl';
      var atLeft = rtl ? (x <= -max + 2) : (x <= 2), atRight = rtl ? (x >= -2) : (x >= max - 2);
      prev.hidden = atLeft; next.hidden = atRight;
    };
    row.addEventListener('scroll', arrows, { passive: true });
    sh.appendChild(rowW);
    var lk = el('div', 'omShLk'), inp = el('input'); inp.readOnly = true; inp.setAttribute('aria-label', title);
    var cp = el('button', '', tt('shareCopy', 'نسخ', 'Copy')); cp.type = 'button';
    var setUrl = function(u){
      url = String(u || ''); inp.value = url || text; cp.disabled = !inp.value;
      var rtlTxt = !url && /[\u0600-\u06FF]/.test(text); inp.style.direction = rtlTxt ? 'rtl' : 'ltr'; inp.style.textAlign = rtlTxt ? 'right' : 'left'; /* نصّ الردّ العربيّ من اليمين، والرابط من اليسار */
      needBtns.forEach(function(b){ b.disabled = !url; });
    };
    cp.onclick = function(){ if(copyText(url || text)){ cp.textContent = tt('shareSheetCopied', 'تمّ النسخ', 'Copied'); setTimeout(function(){ cp.textContent = tt('shareCopy', 'نسخ', 'Copy'); }, 1600); } else say(tt('sheetCopyFail', 'تعذّر النسخ', 'Copy failed')); };
    inp.addEventListener('focus', function(){ try{ inp.select(); }catch(err){ __swallow(err, 'share-sheet:select'); } });
    lk.appendChild(inp); lk.appendChild(cp);
    if(url || text || pending) sh.appendChild(lk);
    sh.appendChild(note);
    setUrl(url);
    if(pending){
      inp.value = tt('sharePreparing', 'جارٍ تجهيز الرابط…', 'Preparing the link…'); cp.disabled = true;
      Promise.resolve().then(o.getUrl).then(function(u){ if(!ov.isConnected) return; if(u) setUrl(u); else { setUrl(''); say(tt('shareLinkFail', 'تعذّر تجهيز الرابط', 'Could not prepare the link')); } },
        function(err){ __swallow(err, 'share-sheet:get-url'); if(!ov.isConnected) return; setUrl(''); say((err && err.userMsg) || tt('shareLinkFail', 'تعذّر تجهيز الرابط', 'Could not prepare the link')); });
    }
    host().appendChild(ov);
    setTimeout(arrows, 0);
    return true;
  };

  /* ── زرّ «مشاركة» بجانب كلّ زرّ تحميل لنتيجة (المالك ٧ نوفمبر بلقطة استوديو فيها «تحميل الصورة» و«حفظ في المفضلة» وحدهما:
     «مافي اي شي — فقط تحميل في التطبيق كامل في الهاتف والكمبيوتر… الايميل والسناب والتواصل الاجتماعي») ──
     omranShareMedia({ src, name, kind }): الصورة ← omranSaveImage(…, 'share') (رابط /i/ أسبوعًا + «المزيد» بالملفّ)؛ الفيديو والـPDF والملفّ:
     رابط https قائم يُشارَك كما هو، وdata:/blob: يُرفع إلى /api/media (PDF ≈٣ م.ب، ملفّ ≈٤ م.ب، أسبوعًا) — الأكبر سطر واضح و«المزيد»
     على الهاتف بالملفّ نفسه، و«تحميل» دائرة إضافيّة.
     omranAddShareNextTo(dl, { getSrc, name, kind, after }): زرّ بصنف زرّ التحميل وأسلوبه نفسه يُدرج بعده (أو بعد after)، يظهر ويختفي معه
     (مراقب سماته)، ونصّه بمفتاح shareNextBtn فيتبع تبديل اللغة. omranShareNextAuto(): يربط قائمة عناصر التحميل المعروفة (SHARE_NEXT) كلّما
     ظهرت في الصفحة — القوالب تُحقن بعد الحزمة. */
  function kindOf(src, name, mime){
    var s = (typeof src === 'string') ? src : '', n = String(name || '').toLowerCase(), m = String(mime || (src && src.type) || '').toLowerCase();
    var both = n + ' ' + s.slice(0, 300).toLowerCase();
    if(/^image\//.test(m) || /^data:image\//i.test(s) || /\.(png|jpe?g|webp|gif|bmp|avif|heic)(\?|#|\s|$)/i.test(both) || /\/i\/[a-f0-9]{6,}/i.test(s)) return 'image';
    if(/^video\//.test(m) || /^data:video\//i.test(s) || /\.(mp4|webm|mov|m4v)(\?|#|\s|$)/i.test(both)) return 'video';
    if(/pdf/.test(m) || /^data:application\/pdf/i.test(s) || /\.pdf(\?|#|\s|$)/i.test(both)) return 'pdf';
    return 'file';
  }
  function blobOf(src){
    if(src && typeof src === 'object' && typeof src.size === 'number') return Promise.resolve(src);
    return fetch(String(src)).then(function(r){ if(!r.ok) throw new Error('fetch ' + r.status); return r.blob(); });
  }
  function bigErr(){ var e = new Error('too-large'); e.userMsg = tt('shareFileBig', 'الملفّ أكبر من حدّ رابط المشاركة — حمّله وأرسله، أو من «المزيد» في الجوّال', 'The file is too big for a share link — download it and send it, or use More on your phone'); return e; }
  function uploadForShare(blob, name){
    var isPdf = (blob.type === 'application/pdf') || /\.pdf$/i.test(name || '');
    var cap = (isPdf ? 4 : 5) * 1024 * 1024;
    if(blob.size * 1.37 > cap) return Promise.reject(bigErr());
    return new Promise(function(res, rej){ var fr = new FileReader(); fr.onload = function(){ res(String(fr.result || '').split(',')[1] || ''); }; fr.onerror = function(){ rej(new Error('read')); }; fr.readAsDataURL(blob); })
      .then(function(b64){
        if(!b64 || b64.length > cap) throw bigErr();
        var tok = ''; try{ tok = (typeof authGet === 'function') ? (authGet('aiapp_auth_token') || '') : ''; }catch(e){ tok = ''; }
        return fetch(isPdf ? '/api/media?action=pdf' : '/api/media?action=file', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: b64, name: name || 'omran-file', mime: blob.type || 'application/octet-stream', token: tok }) });
      })
      .then(function(r){ return r.json().catch(function(){ return null; }).then(function(d){ if(!r.ok || !d || !d.url) throw new Error((d && d.error) || ('http ' + r.status)); return /^https?:/i.test(d.url) ? d.url : (location.origin + d.url); }); });
  }
  function plainDl(src, name){
    try{
      var a = document.createElement('a'); a.href = (typeof src === 'string') ? src : URL.createObjectURL(src); a.download = name || ''; a.rel = 'noopener';
      a.dataset.nativeDownload = '1'; a.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.appendChild(a); a.click();
      setTimeout(function(){ try{ a.remove(); }catch(e){ __swallow(e, 'share-next:dl-rm'); } }, 3000);
    }catch(e){ __swallow(e, 'share-next:dl'); }
  }
  window.omranShareMedia = function(o){
    o = o || {};
    var src = o.src, name = o.name || '', kind = o.kind || kindOf(src, name, o.mime);
    if(!src) return false;
    if(kind === 'image' && typeof window.omranSaveImage === 'function'){ window.omranSaveImage(src, name || ('omran-image-' + Date.now() + '.png'), 'share'); return true; }
    var s = (typeof src === 'string') ? src : '';
    var http = /^https?:/i.test(s) ? s : '';
    var dlOne = { label: tt('imgDlBtn', 'تحميل', 'Download'), icon: 'download', onClick: function(close){ close(); if(typeof o.download === 'function') o.download(); else plainDl(src, name); } };
    var opts = { url: http, extras: [dlOne] };
    if(!http){
      opts.getUrl = function(){
        return blobOf(src).then(function(b){
          try{ if(typeof File === 'function') opts.file = new File([b], name || ('omran-' + kind), { type: b.type || 'application/octet-stream' }); }catch(e){ __swallow(e, 'share-next:file'); }
          return uploadForShare(b, name || ('omran-' + kind));
        });
      };
    }
    return window.omranShareSheet(opts);
  };
  function hiddenEl(el){
    try{
      if(!el) return true;
      if(el.hidden || el.style.display === 'none' || el.style.visibility === 'hidden') return true;
      if(!el.isConnected) return false; /* أُنشئ ولم يُلحق بالصفحة بعد (فقاعة رسالة تُبنى ثمّ تُلحق) — يُحكم بأسلوبه المضمّن وحده */
      var cs = getComputedStyle(el); return cs.display === 'none' || cs.visibility === 'hidden';
    }catch(e){ return false; }
  }
  window.omranAddShareNextTo = function(dl, o){
    o = o || {};
    if(!dl || dl.__omShareNext) return dl ? dl.__omShareNext : null;
    var b = document.createElement('button'); b.type = 'button';
    b.className = String(o.className != null ? o.className : (dl.className || 'btn')).replace(/\bomShareNext\b/g, '').trim() + ' omShareNext';
    b.style.cssText = (o.style != null) ? String(o.style) : dl.style.cssText; b.style.removeProperty('display');
    if(o.label){ b.textContent = String(o.label); } /* نصّ خاصّ (مثل «↗️ مشهد ٢») — يُبنى مع العنصر نفسه عند كلّ رسم */
    else { b.setAttribute('data-i18n', 'shareNextBtn'); b.textContent = tt('shareNextBtn', '↗️ مشاركة', '↗️ Share'); }
    b.addEventListener('click', function(ev){
      try{
        if(ev){ ev.preventDefault(); ev.stopPropagation(); }
        var src = (typeof o.getSrc === 'function' ? o.getSrc() : '') || dl.getAttribute('href') || dl.getAttribute('src') || '';
        if(!src || src === '#') return;
        var nm = (typeof o.name === 'function' ? o.name() : o.name) || dl.getAttribute('download') || '';
        window.omranShareMedia({ src: src, name: nm, kind: o.kind });
      }catch(err){ __swallow(err, 'share-next:click'); }
    });
    var anchor = o.after || dl;
    anchor.parentNode.insertBefore(b, anchor.nextSibling);
    var sync = function(){
      try{
        if(hiddenEl(dl)){ b.style.display = 'none'; return; }
        var cs = dl.isConnected ? getComputedStyle(dl) : null;
        var d = o.display || (cs ? cs.display : (dl.style.display || '')); /* نفس عرض زرّ التحميل: كتلة بعرضه أو سطريّ بجانبه */
        b.style.display = d;
        /* بعرض الحاوية فقط إن كان زرّ التحميل نفسه بعرضها: داخل حاوية مرنة يُحسب كلّ ابن «block» وإن كان شريحة صغيرة (فيديو المحادثة،
           مشاهد الصانع) فكان الزرّ يأخذ سطرًا كاملًا وحده */
        var p = dl.parentNode, pcs = (cs && p && p.nodeType !== 9) ? getComputedStyle(p) : null;
        var full = /^(block|flex|grid)$/.test(d) && !(pcs && /flex|grid/.test(pcs.display));
        if(!full && pcs && p.clientWidth){ var cw = p.clientWidth - (parseFloat(pcs.paddingLeft) || 0) - (parseFloat(pcs.paddingRight) || 0); full = cw > 0 && dl.offsetWidth >= cw - 2; }
        if(full){ b.style.width = '100%'; b.style.boxSizing = 'border-box'; } else b.style.width = '';
        if(o.mirrorColor && cs) b.style.color = cs.color; /* لون رابط التحميل نفسه (الذهبيّ في فقاعة المحادثة) */
      }catch(err){ __swallow(err, 'share-next:sync'); }
    };
    try{ new MutationObserver(sync).observe(dl, { attributes: true, attributeFilter: ['style', 'hidden', 'class', 'href', 'src'] }); }catch(err){ __swallow(err, 'share-next:observe'); }
    if(dl.parentNode && dl.parentNode !== document.body){ try{ new MutationObserver(sync).observe(dl.parentNode, { attributes: true, attributeFilter: ['style', 'hidden', 'class'] }); }catch(err){ __swallow(err, 'share-next:observe-parent'); } }
    sync();
    dl.__omShareNext = b;
    return b;
  };
  /* عناصر التحميل المعروفة في القوالب (جرد الأدوات) — تُربط تلقائيًّا حين تظهر. after: عنصر يُدرج الزرّ بعده بدل زرّ التحميل نفسه. */
  var SHARE_NEXT = [
    { sel: '#studioAiDownloadLink', className: 'btn' },          // الاستوديو
    { sel: '#fashionAiDownloadLink', className: 'btn' },         // الأزياء
    { sel: '#designAiDownloadLink', className: 'btn' },          // الديكور
    { sel: '#constructionDownloadLink', className: 'btn' },      // المقاولات: المخطّط
    { sel: '#constructionPhotoDownloadLink', className: 'btn' }, // المقاولات: الصورة الواقعيّة
    { sel: '#constructionInteriorDownloadLink', className: 'btn' },
    { sel: '#constructionAngleDownloadLink', className: 'btn' },
    { sel: '#constructionRoomDownloadLink', className: 'btn' },
    { sel: '#videoMakerDownloadLink', className: 'btn', kind: 'video' }, // صانع الفيديو
    { sel: '#vdDl', className: 'vmk-dir-dl', kind: 'video', style: 'background:transparent;cursor:pointer;font-family:inherit;' },  // مخرج التطبيق (video.js)
    { sel: '#vmkClDl', className: 'vmk-cl-dl', kind: 'video', style: 'background:transparent;cursor:pointer;font-family:inherit;' } // تنظيف الفيديو (video.js)
  ];
  window.omranShareNextList = SHARE_NEXT;
  var autoTimer = 0;
  function autoRun(){
    autoTimer = 0;
    SHARE_NEXT.forEach(function(r){
      try{
        var els = document.querySelectorAll(r.sel);
        for(var i = 0; i < els.length; i++){
          var el = els[i]; if(el.__omShareNext) continue;
          var after = r.after ? document.querySelector(r.after) : null;
          window.omranAddShareNextTo(el, { kind: r.kind, className: r.className, style: r.style, after: after && after.parentNode === el.parentNode ? after : null, getSrc: r.getSrc, name: r.name });
        }
      }catch(err){ __swallow(err, 'share-next:auto'); }
    });
  }
  window.omranShareNextAuto = function(){ if(!autoTimer) autoTimer = setTimeout(autoRun, 60); };
  try{
    window.omranShareNextAuto();
    new MutationObserver(function(){ window.omranShareNextAuto(); }).observe(document.documentElement, { childList: true, subtree: true });
  }catch(err){ __swallow(err, 'share-next:boot'); }
})();
