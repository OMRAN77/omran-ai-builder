/* v-media-notify (طلب المالك ٤ أكتوبر: «إذا طلعت من التطبيق وأنا أسوي صورة يعطيني تنبيه أنها جاهزة»):
   توليد الصورة/الفيديو يكمل في المتصفّح حتى لو خرج المستخدم لتطبيق آخر (التبويب حيّ)، لكنّه كان يكمل بصمت.
   هنا: التفاف على fetch يرصد اكتمال أيّ توليد (مسارات مها المباشرة وأدوات الوكيل والاستوديوهات كلّها
   تمرّ بنفس الطلبات)، فإن كان المستخدم خارج التطبيق (document.hidden) وصله إشعار نظام — ضغطته ترجعه.
   القواعد المقفلة: لا طلب إذن عند فتح التطبيق أبدًا (السؤال شريط داخليّ عند أوّل توليد أو من مفتاح
   الإعدادات)، لا إشعار والمستخدم داخل التطبيق، ومن قال «لا شكرًا» لا يُسأل ثانية.
   ملفّ مستقلّ بلا تعديل على الحزمة: يُحمَّل من index.html قبلها (يلتفّ على fetch مبكرًا)،
   ويحقن قسم «التنبيهات» في الإعدادات بنفسه (صفّها في القائمة يراقب إعادة الرسم). */
(function () {
  'use strict';

  var LS_PREF = 'aiapp_media_notify';        // '0' = أطفأه من الإعدادات؛ الافتراضيّ مفعَّل
  var LS_NEVER = 'aiapp_media_notify_never'; // '1' = قال «لا شكرًا» للشريط — لا يُسأل ثانية
  var ICON = './icons/icon-192-v2.png?icon=gold-20260819';

  /* النصوص محليّة هنا (ar/en) لا في قاموس الحزمة — الملفّ مستقلّ بلا ترقية وسم اللغات. */
  var STR = {
    ar: {
      mediaNotifLabel: 'تنبيه اكتمال الصور والفيديو',
      mediaNotifHint: 'إذا طلعت من التطبيق والصورة أو الفيديو قيد التنفيذ، يوصلك تنبيه أول ما يجهز — اضغطه ويرجعك للمحادثة.',
      mediaNotifAsk: 'تبي يوصلك تنبيه إذا خلصت الصورة وأنت خارج التطبيق؟',
      mediaNotifAskYes: 'فعّل',
      mediaNotifAskNo: 'لا شكرًا',
      mediaNotifReadyImage: '🎨 صورتك جاهزة — اضغط للرجوع',
      mediaNotifReadyVideo: '🎬 الفيديو جاهز — اضغط للرجوع',
      mediaNotifFailVideo: 'تعذّر إكمال الفيديو — ارجع وحاول مرة أخرى',
      mediaNotifDenied: 'المتصفح رافض الإشعارات — فعّلها من إعدادات المتصفح (أيقونة القفل).',
      notifSectionLabel: '🔔 التنبيهات'
    },
    en: {
      mediaNotifLabel: 'Image & video ready alerts',
      mediaNotifHint: 'If you leave the app while an image or video is being made, you get an alert the moment it is ready — tap it to jump back into the chat.',
      mediaNotifAsk: 'Want an alert when your image is ready while you are away from the app?',
      mediaNotifAskYes: 'Enable',
      mediaNotifAskNo: 'No thanks',
      mediaNotifReadyImage: '🎨 Your image is ready — tap to return',
      mediaNotifReadyVideo: '🎬 Your video is ready — tap to return',
      mediaNotifFailVideo: 'The video could not be completed — come back and try again',
      mediaNotifDenied: 'Notifications are blocked by the browser — allow them from the browser site settings (lock icon).',
      notifSectionLabel: '🔔 Notifications'
    }
  };
  function tr(k) {
    var lg = 'en';
    try { lg = (document.documentElement.lang || 'ar').slice(0, 2); } catch (e) { /* guard-ok — العربية افتراضيّ الواجهة */ }
    return (STR[lg] && STR[lg][k]) || STR.en[k] || STR.ar[k] || k;
  }
  function supported() {
    try { return typeof Notification !== 'undefined' && typeof Notification.permission === 'string'; }
    catch (e) { return false; }
  }
  function enabled() {
    try { return localStorage.getItem(LS_PREF) !== '0'; } catch (e) { return true; }
  }
  function permission() {
    try { return Notification.permission; } catch (e) { return 'denied'; }
  }
  function title() {
    try { if (typeof mahaPersonaName === 'function') return mahaPersonaName(); } catch (e) { /* guard-ok — الاسم الافتراضيّ يكفي */ }
    return 'مها';
  }

  /* الإشعار نفسه. الشرط الأوّل والأخير: المستخدم خارج التطبيق. النجاح وحده يستحق إشعارًا —
     فشل الصورة لا يُشعِر (إعادة المحاولة التلقائيّة في العميل تجعل «الفشل» غير نهائيّ)،
     وفشل الفيديو نهائيّ (لا إعادة) فيُشعِر. */
  window.mediaReadyNotify = function (kind, ok) {
    try {
      if (!supported() || !enabled()) return false;
      if (typeof document === 'undefined' || !document.hidden) return false;
      if (permission() !== 'granted') return false;
      var key = ok
        ? (kind === 'video' ? 'mediaNotifReadyVideo' : 'mediaNotifReadyImage')
        : 'mediaNotifFailVideo';
      var n = new Notification(title(), { body: tr(key), icon: ICON, tag: 'maha-media-ready' }); // وسم ثابت = لا تكديس
      n.onclick = function () {
        try { window.focus(); } catch (e) { /* guard-ok */ }
        try { n.close(); } catch (e2) { /* guard-ok */ }
      };
      return true;
    } catch (e) {
      try { __swallow(e, 'misc:media-notify'); } catch (e2) { /* guard-ok — لا استثناء من مرصدٍ جانبيّ أبدًا */ }
      return false;
    }
  };

  /* شريط السؤال — يظهر عند أوّل توليد فقط إن لم يُحسم الإذن، ومرّة واحدة في العمر إن رفض. */
  var barShown = false;
  function dismissBar() {
    barShown = false;
    var el = document.getElementById('mediaNotifAskBar');
    if (el) { try { el.remove(); } catch (e) { /* guard-ok */ } }
  }
  window.mediaNotifyMaybeAsk = function () {
    try {
      if (!supported() || barShown) return;
      if (permission() !== 'default') return;                    // ممنوح أو مرفوض — لا شريط
      if (!enabled()) return;
      try { if (localStorage.getItem(LS_NEVER) === '1') return; } catch (e) { /* guard-ok */ }
      if (!document.body) return;
      barShown = true;
      var bar = document.createElement('div');
      bar.id = 'mediaNotifAskBar';
      bar.style.cssText = 'position:fixed; bottom:76px; inset-inline:12px; z-index:9999; display:flex; flex-wrap:wrap; align-items:center; gap:8px;'
        + ' background:var(--panel2, #1c2230); color:var(--text, #fff); border:1px solid var(--border, rgba(127,127,127,.25));'
        + ' border-radius:14px; padding:10px 14px; box-shadow:0 8px 28px rgba(0,0,0,.35); font-size:13.5px; line-height:1.7;';
      var txt = document.createElement('span');
      txt.style.cssText = 'flex:1; min-width:180px;';
      txt.textContent = tr('mediaNotifAsk');
      var yes = document.createElement('button');
      yes.type = 'button';
      yes.textContent = tr('mediaNotifAskYes');
      yes.style.cssText = 'flex:none; padding:7px 16px; border-radius:10px; border:1px solid var(--accent, #4a7dff); background:var(--accent, #4a7dff); color:#fff; cursor:pointer; font-size:13px;';
      var no = document.createElement('button');
      no.type = 'button';
      no.textContent = tr('mediaNotifAskNo');
      no.style.cssText = 'flex:none; padding:7px 14px; border-radius:10px; border:1px solid var(--border, rgba(127,127,127,.25)); background:transparent; color:inherit; cursor:pointer; font-size:13px;';
      yes.onclick = function () {
        dismissBar();
        try { Notification.requestPermission().then(syncToggle).catch(function () { /* guard-ok — الرفض يظهر في حالة المفتاح */ }); } catch (e) { /* guard-ok */ }
      };
      no.onclick = function () {
        try { localStorage.setItem(LS_NEVER, '1'); } catch (e) { /* guard-ok */ }
        dismissBar();
      };
      bar.appendChild(txt); bar.appendChild(yes); bar.appendChild(no);
      document.body.appendChild(bar);
    } catch (e) {
      try { __swallow(e, 'misc:media-notify-ask'); } catch (e2) { /* guard-ok */ }
    }
  };

  /* التفاف fetch: كلّ مسارات التوليد (مها المباشر، أدوات الوكيل، الاستوديوهات، الترندات)
     تمرّ بهذه الطلبات — رصدها هنا يغطّيها كلّها بلا تعديل أيّ ملفّ منها.
     الالتفاف شفّاف: الاستجابة الأصليّة تُعاد كما هي، والقراءة على نسخة clone. */
  try {
    var origFetch = window.fetch;
    if (typeof origFetch === 'function') {
      window.fetch = function (input, init) {
        var url = '';
        try { url = typeof input === 'string' ? input : String((input && input.url) || ''); } catch (e) { /* guard-ok */ }
        var method = 'GET';
        try { method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase(); } catch (e) { /* guard-ok */ }
        var isImg = url.indexOf('maha-image') !== -1;
        var isVidStatus = url.indexOf('/api/video-status') !== -1 || url.indexOf('action=veo-status') !== -1;
        var isVidCreate = method === 'POST' && url.indexOf('/api/video') !== -1;
        if ((method === 'POST' && (isImg || isVidCreate)) && permission() === 'default') {
          try { window.mediaNotifyMaybeAsk(); } catch (e) { /* guard-ok */ }
        }
        var p = origFetch.apply(this, arguments);
        if (!isImg && !isVidStatus) return p;
        try {
          p.then(function (res) {
            try {
              if (!res || !res.ok || typeof res.clone !== 'function') return;
              res.clone().json().then(function (j) {
                try {
                  if (!j) return;
                  if (isImg && j.imageBase64) window.mediaReadyNotify('image', true);
                  if (isVidStatus && j.status === 'SUCCEEDED') window.mediaReadyNotify('video', true);
                  if (isVidStatus && j.status === 'FAILED') window.mediaReadyNotify('video', false);
                } catch (e) { /* guard-ok */ }
              }).catch(function () { /* guard-ok — جسم غير JSON ليس شأننا */ });
            } catch (e) { /* guard-ok */ }
          }).catch(function () { /* guard-ok — فشل الشبكة يظهر في المحادثة نفسها */ });
        } catch (e) { /* guard-ok */ }
        return p;
      };
    }
  } catch (e) { try { __swallow(e, 'misc:media-notify-fetch'); } catch (e2) { /* guard-ok */ } }

  /* مفتاح الإعدادات — التشغيل يطلب الإذن بإيماءة المستخدم، والرفض الدائم يُفسَّر بجملة. */
  function syncToggle() {
    try {
      var chk = document.getElementById('mediaNotifToggle');
      if (!chk) return;
      var st = document.getElementById('mediaNotifStatus');
      if (!supported()) {
        chk.checked = false; chk.disabled = true;
        if (st) st.textContent = tr('mediaNotifDenied');
        return;
      }
      chk.checked = enabled() && permission() === 'granted';
      if (st) st.textContent = (enabled() && permission() === 'denied') ? tr('mediaNotifDenied') : '';
    } catch (e) { /* guard-ok */ }
  }
  window.mediaNotifySyncToggle = syncToggle;
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (!el || el.id !== 'mediaNotifToggle') return;
    if (el.checked) {
      try { localStorage.setItem(LS_PREF, '1'); } catch (e2) { /* guard-ok */ }
      try { if (localStorage.getItem(LS_NEVER) === '1') localStorage.removeItem(LS_NEVER); } catch (e2) { /* guard-ok */ }
      if (permission() === 'default') {
        try { Notification.requestPermission().then(syncToggle).catch(function () { syncToggle(); }); } catch (e2) { syncToggle(); }
        return;
      }
    } else {
      try { localStorage.setItem(LS_PREF, '0'); } catch (e2) { /* guard-ok */ }
    }
    syncToggle();
  }, true);

  /* قسم «التنبيهات» يُحقن بعد «ذاكرتي» (partials-settings سبقتنا في التحميل)،
     وصفّه في قائمة الإعدادات يُراقَب: القائمة تُعاد كتابتها عند كلّ فتح فيُعاد الصفّ. */
  var SECTION_HTML = '<div id="notifSection" class="settingsPageSection" style="padding:14px; margin-bottom:18px;">'
    + '<div class="settingsSectionHeader" onclick="toggleSettingsSection(\'notifSection\')" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none;"><h3 style="margin:0; font-size: var(--fs-3);" data-media-notif-i18n="notifSectionLabel"></h3><span class="settingsSectionArrow" id="notifSectionArrow" style="font-size:13px; transition:transform .2s; margin-inline-start:8px;">&#9654;</span></div>'
    + '<div id="notifSectionContent" class="settingsSectionContent" style="display:none; margin-top:12px;">'
    + '<label style="display:flex; align-items:center; justify-content:space-between; gap:10px; cursor:pointer;">'
    + '<span data-media-notif-i18n="mediaNotifLabel" style="font-size:var(--fs-6);"></span>'
    + '<input type="checkbox" id="mediaNotifToggle" style="width:auto; accent-color:var(--accent);">'
    + '</label>'
    + '<p style="margin:8px 0 0; opacity:.75; font-size:var(--fs-6); line-height:1.7;" data-media-notif-i18n="mediaNotifHint"></p>'
    + '<div id="mediaNotifStatus" role="status" aria-live="polite" style="margin-top:6px; font-size:12px; min-height:16px; opacity:.85;"></div>'
    + '</div></div>';
  function fillTexts(scope) {
    try {
      var nodes = (scope || document).querySelectorAll('[data-media-notif-i18n]');
      for (var i = 0; i < nodes.length; i++) nodes[i].textContent = tr(nodes[i].getAttribute('data-media-notif-i18n'));
    } catch (e) { /* guard-ok */ }
  }
  function injectSection() {
    try {
      if (document.getElementById('notifSection')) return;
      var mem = document.getElementById('memorySection');
      if (!mem) return;
      mem.insertAdjacentHTML('afterend', SECTION_HTML);
      fillTexts(document.getElementById('notifSection'));
      syncToggle();
    } catch (e) { /* guard-ok */ }
  }
  var BELL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
  function navRow() {
    var row = document.createElement('div');
    row.className = 'settingsNavRow';
    row.setAttribute('data-sid', 'notifSection');
    row.setAttribute('data-media-notif-row', '1');
    row.innerHTML = '<span class="settingsNavIcon">' + BELL_SVG + '</span>'
      + '<span class="settingsNavLabel"><span class="settingsNavText"></span><span class="settingsNavSub"></span></span><span class="settingsNavValue"></span>'
      + '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:.4;flex:none"><path d="m9 18 6-6-6-6"/></svg>';
    var label = row.querySelector('.settingsNavText');
    if (label) label.textContent = tr('notifSectionLabel').replace(/^[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]+\s*/u, '');
    row.onclick = function () {
      try { if (typeof window.showSettingsPage === 'function') window.showSettingsPage('notifSection'); } catch (e) { /* guard-ok */ }
    };
    return row;
  }
  function placeNavRow(list) {
    try {
      if (!list || list.querySelector('[data-media-notif-row="1"]')) return;
      var row = navRow();
      var about = list.querySelector('[data-sid="aboutSection"]');
      var group = about && about.parentNode;
      if (group && group !== list) group.insertBefore(row, about);   // داخل مجموعة «عام» قبل «حول»
      else list.appendChild(row);
    } catch (e) { /* guard-ok */ }
  }
  try {
    var navObserver = new MutationObserver(function () {
      try { placeNavRow(document.getElementById('settingsNavList')); } catch (e) { /* guard-ok */ }
    });
    navObserver.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) { /* guard-ok — بلا مراقب: القسم يبقى قابلًا للفتح من الصفحة مباشرة */ }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectSection);
  else injectSection();
  try { placeNavRow(document.getElementById('settingsNavList')); } catch (e) { /* guard-ok */ }
  /* إعادة ترجمة النصوص المحقونة عند تبديل اللغة: تُملأ عند فتح الإعدادات. */
  document.addEventListener('click', function (e) {
    try {
      var t = e.target;
      if (t && t.closest && t.closest('#btnSettings')) fillTexts(document.getElementById('notifSection'));
    } catch (e2) { /* guard-ok */ }
  }, true);
})();
