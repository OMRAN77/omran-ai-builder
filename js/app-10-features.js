window.postWithConfirm = postWithConfirm;
// --- Offline banner ---
(function(){
  const banner = $('#offlineBanner');
  let hideTimer = null;
  function refreshBannerText(){
    const span = banner.querySelector('[data-i18n]');
    if(span) span.textContent = t(navigator.onLine ? 'backOnlineBanner' : 'offlineBanner');
  }
  function setOffline(){
    clearTimeout(hideTimer);
    refreshBannerText();
    banner.style.background = '#b45309';
    banner.style.display = 'block';
  }
  function setOnline(){
    if(banner.style.display === 'none') return; // wasn't showing offline state, no need to flash
    banner.style.background = '#16a34a';
    banner.querySelector('[data-i18n]').setAttribute('data-i18n', 'backOnlineBanner');
    banner.querySelector('[data-i18n]').textContent = t('backOnlineBanner');
    hideTimer = setTimeout(() => {
      banner.style.display = 'none';
      banner.querySelector('[data-i18n]').setAttribute('data-i18n', 'offlineBanner');
    }, 2500);
  }
  window.addEventListener('offline', setOffline);
  window.addEventListener('online', setOnline);
  if(!navigator.onLine) setOffline();
})();

// --- Freeze detector: uses a Web Worker heartbeat so it keeps ticking even
// if the main thread is blocked. When the main thread finally catches up
// with a large delay, we know it was frozen and warn the user (after
// auto-saving their current project so nothing is lost). ---
(function(){
  const FREEZE_THRESHOLD_MS = 6000;
  /* v-freeze-tune (لقطة عمران: بانر «يستجيب ببطء» أثناء إقلاع ثقيل): الإقلاع
     على جهاز/شبكة بطيئة يحجب الخيط الرئيسي لحظيًا فيطلع البانر بلا داعٍ.
     الآن: مهلة سماح ١٨ث بعد الفتح (فترة الإقلاع لا تُحسَب تجمّدًا)، ونحتاج
     رصدين متتاليين لا واحد (توقّف GC عابر لا يطلّعه). */
  const BOOT_GRACE_MS = 18000;
  const bootAt = Date.now();
  const banner = $('#freezeBanner');
  const reloadBtn = $('#freezeReloadBtn');
  const dismissBtn = $('#freezeDismissBtn');
  if(!banner || !window.Worker) return;
  let shown = false;
  let dismissedUntil = 0;
  let strikes = 0;

  reloadBtn.onclick = () => location.reload();
  dismissBtn.onclick = () => {
    banner.style.display = 'none';
    shown = false;
    strikes = 0;
    dismissedUntil = Date.now() + 120000; // لا إزعاج لمدة دقيقتين
  };

  let worker = null;
  try{
    const workerSrc = "setInterval(function(){ postMessage(Date.now()); }, 1000);";
    const blob = new Blob([workerSrc], {type: 'application/javascript'});
    worker = new Worker(URL.createObjectURL(blob));
  }catch(e){ return; }

  worker.onmessage = (e) => {
    const delay = Date.now() - e.data;
    // خلال فترة الإقلاع لا نحسب أي تأخّر تجمّدًا
    if(Date.now() - bootAt < BOOT_GRACE_MS){ strikes = 0; return; }
    if(delay > FREEZE_THRESHOLD_MS){
      strikes++;
      if(strikes >= 2 && !shown && Date.now() > dismissedUntil){
        try{ saveState(); }catch(err){ __swallow(err, "save:app-10-features#1"); }
        shown = true;
        banner.style.display = 'flex';
      }
    } else {
      strikes = 0; // نبضة سليمة تصفّر العدّاد
    }
  };
  window.addEventListener('beforeunload', () => { try{ worker.terminate(); }catch(e){ __swallow(e, "save:app-10-features#2"); } });
})();

// --- AppGallery 7.5: طلب قراءة سياسة الخصوصية صراحةً عند أول إطلاق ---
// نافذة سفلية مرة واحدة في العمر: رابط السياسة + زر موافقة. الموافقة تُحفظ
// محليًا فلا تُعرض ثانية. لا تحجب شيئًا سواها ولا تجمع أي بيانات.
(function privacyFirstLaunch(){
  var KEY = 'aiapp_privacy_ack';
  try { if (localStorage.getItem(KEY) === '1') return; } catch(e){ return; }
  var wrap = document.createElement('div');
  wrap.id = 'privacyConsent';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.72);display:flex;align-items:flex-end;justify-content:center;';
  var card = document.createElement('div');
  /* v-privacy-i18n (شكوى المالك: البطاقة عربية بكل اللغات): النص من مفاتيح
     الترجمة (t جاهزة هنا — عربي/إنجليزي فورًا)، وdata-i18n تلتقطها جولة
     applyLanguage الثانية بعد وصول ملف اللغة الكسول. الاتجاه يتبع الصفحة. */
  card.style.cssText = 'width:min(100%,560px);background:var(--panel,#161616);border-radius:18px 18px 0 0;padding:22px 20px calc(20px + env(safe-area-inset-bottom));box-shadow:0 -8px 40px rgba(0,0,0,.5);text-align:start;';
  var pt = function(k, fb){ try{ if(typeof t === 'function'){ var v = t(k); if(v && v !== k) return v; } }catch(e){ __swallow(e, 'ui:privacy-t'); } return fb; };
  card.innerHTML = '<h3 style="margin:0 0 8px;font-size:16px;" data-i18n="privacyConsentTitle">' + pt('privacyConsentTitle', '🔒 خصوصيتك أولًا') + '</h3>'
    + '<p style="margin:0 0 14px;font-size:13px;line-height:1.8;color:var(--muted,#9a9a9a);" data-i18n="privacyConsentText">' + pt('privacyConsentText', 'قبل استخدام Omran AI Builder، يرجى قراءة <a href="/privacy.html" target="_blank" rel="noopener" style="color:var(--accent2,#a78bfa);text-decoration:underline;">سياسة الخصوصية</a> و<a href="/terms.html" target="_blank" rel="noopener" style="color:var(--accent2,#a78bfa);text-decoration:underline;">شروط الاستخدام</a>. نوضح فيهما ما نجمعه وكيف نحميه وحقك في حذف بياناتك.') + '</p>'
    + '<div style="display:flex;gap:10px;"><a href="/privacy.html" target="_blank" rel="noopener" class="btn" style="flex:1;text-align:center;line-height:42px;height:42px;text-decoration:none;border:1px solid var(--border,#333);border-radius:10px;color:var(--text,#eee);" data-i18n="privacyConsentRead">' + pt('privacyConsentRead', 'قراءة السياسة') + '</a>'
    + '<button type="button" id="privacyAgreeBtn" class="btn primary" style="flex:1;height:42px;border-radius:10px;font-weight:bold;" data-i18n="privacyConsentAgree">' + pt('privacyConsentAgree', 'أوافق وأتابع') + '</button></div>';
  wrap.appendChild(card);
  function mount(){ try { document.body.appendChild(wrap); } catch(e){ __swallow(e, 'ui:privacy-consent'); } }
  if (document.body) mount(); else window.addEventListener('DOMContentLoaded', mount);
  wrap.addEventListener('click', function(ev){
    if (ev.target && ev.target.id === 'privacyAgreeBtn') {
      try { localStorage.setItem(KEY, '1'); } catch(e){ __swallow(e, 'ui:privacy-ack'); }
      wrap.remove();
    }
  });
})();

// --- PWA: service worker + install prompt ---
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((reg) => {
      // Check for a newer service worker on every load, and whenever the tab regains focus.
      reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if(document.visibilityState === 'visible') reg.update().catch(() => {});
      });
      /* v-no-kickout (شكوى: «داخل المحادثة ويطلع واذا رجع يطلعه»): كانت
         الصفحة تعيد تحميل نفسها لحظة مغادرة المستخدم الشاشة بعد كل نشر
         (controllerchange مؤجَّل للإخفاء) — فيرجع ليجد التطبيق مقلوبًا من
         أوله، ومع نشرات اليوم المتلاحقة صار طردًا متكررًا. القشرة أصلًا
         network-first منذ v669، فالفتحة الطبيعية القادمة تجلب الأحدث بلا
         أي إعادة — لا reload على تحديث روتيني إطلاقًا. قناة إنقاذ v653
         في selfdiag باقية لحالات العامل المكسور فقط. */
    }).catch(() => {});
  });
}

let deferredInstallPrompt = null;
const btnInstall = $('#btnInstall');
(function migrateOpenrouterModel(){
  try {
    const __orOld = localStorage.getItem('aiapp_openrouter_model');
    if (__orOld === 'meta-llama/llama-3.1-8b-instruct:free' || __orOld === 'meta-llama/llama-3.3-70b-instruct:free') {
      localStorage.setItem('aiapp_openrouter_model', 'nvidia/nemotron-3-super-120b-a12b:free');
    }
    /* v-or-models: أسماء أخرى ماتت من كتالوج OpenRouter — من حفظها قديمًا
       كانت رسائله تفشل. تهاجر لأقرب بديل حي (متحقَّق في ورشة model-probe). */
    const __orRemap = {
      'google/gemini-flash-1.5:free': 'google/gemma-4-31b-it:free',
      'mistralai/mistral-7b-instruct:free': 'z-ai/glm-5.2:free',
      'anthropic/claude-3.5-sonnet': 'anthropic/claude-sonnet-4.5',
      'google/gemini-pro-1.5': 'google/gemini-2.5-pro',
    };
    if (__orRemap[__orOld]) localStorage.setItem('aiapp_openrouter_model', __orRemap[__orOld]);
  } catch(e){ __swallow(e, "save:app-10-features#3"); }
})();
const btnRefreshPage = $('#btnRefreshPage');
if (btnRefreshPage) {
  btnRefreshPage.onclick = () => { location.reload(); };
}
const btnInstallHeader = $('#btnInstallHeader');
const installButtons = [btnInstall].filter(Boolean); // header install button retired in clean design

function isStandalone(){
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function showInstallButtons(show){
  installButtons.forEach(b => { b.style.display = show ? 'inline-flex' : 'none'; });
}

// If already installed/running as an app, hide the buttons entirely.
if(isStandalone()){
  showInstallButtons(false);
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  showInstallButtons(true);
  // Auto-show the native install dialog the first time this browser ever
  // becomes eligible (Chrome/Edge on Android + desktop only — iOS Safari
  // does not support beforeinstallprompt, so there users still see the
  // manual "Add to Home Screen" instructions instead).
  try {
    // Auto-prompt removed: browsers require a user gesture for prompt().
    // Install happens only via the install button click (onInstallBtnClick).
    if(!isStandalone() && !localStorage.getItem('aiapp_autoinstall_prompted')){
      localStorage.setItem('aiapp_autoinstall_prompted', '1');
    }
  } catch(err){ __swallow(err, "save:app-10-features#4"); }
});

function showManualInstallInstructions(){
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  let msgAr, msgEn;
  if(isIOS){
    msgAr = 'للتثبيت على الآيفون:\n1) افتح الموقع من متصفح Safari\n2) اضغط زر المشاركة (المربع مع السهم للأعلى) في الأسفل\n3) اختر "إضافة إلى الشاشة الرئيسية"\n4) اضغط "إضافة"';
    msgEn = 'To install on iPhone:\n1) Open this site in Safari\n2) Tap the Share button (square with an up arrow)\n3) Choose "Add to Home Screen"\n4) Tap "Add"';
  } else if(isAndroid){
    msgAr = 'للتثبيت على أندرويد:\n1) افتح قائمة المتصفح (⋮) في الأعلى يمين\n2) اختر "تثبيت التطبيق" أو "إضافة إلى الشاشة الرئيسية"\n3) اتبع التعليمات لإتمام التثبيت';
    msgEn = 'To install on Android:\n1) Open the browser menu (⋮) top-right\n2) Choose "Install app" or "Add to Home screen"\n3) Follow the prompts to finish installing';
  } else {
    msgAr = 'للتثبيت على الكمبيوتر:\nابحث عن أيقونة التثبيت (⊕ أو شاشة صغيرة) في شريط عنوان المتصفح، ثم اضغط عليها واختر "تثبيت".';
    msgEn = 'To install on desktop:\nLook for the install icon (⊕ or small monitor) in your browser\'s address bar, click it, then choose "Install".';
  }
  const currentLang = (typeof lang !== 'undefined' && lang === 'ar') ? 'ar' : 'en';
  alert(currentLang === 'ar' ? msgAr : msgEn);
}

const onInstallBtnClick = async () => {
  if(deferredInstallPrompt){
    try {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
    } catch(e){ __swallow(e, "misc:app-10-features#5"); }
    deferredInstallPrompt = null;
    showInstallButtons(false);
  } else {
    showManualInstallInstructions();
  }
};
installButtons.forEach(b => { b.onclick = onInstallBtnClick; });
window.addEventListener('appinstalled', () => {
  showInstallButtons(false);
});

/* ---------- Share App button ---------- */
const btnShareApp = $('#btnShareApp');
if(btnShareApp){
  btnShareApp.onclick = async () => {
    const shareUrl = 'https://omran-ai-builder.vercel.app';
    const currentLang = (typeof lang !== 'undefined') ? lang : 'ar';
    const titles = { ar:'عمران AI', en:'Omran AI', fr:'Omran AI', hi:'Omran AI', ur:'Omran AI', bn:'Omran AI', ne:'Omran AI' };
    const texts = {
      ar: 'جرّب تطبيق عمران AI لإنشاء تطبيقات بالذكاء الاصطناعي مجانًا:',
      en: 'Try Omran AI to build apps with AI for free:',
      fr: "Essayez Omran AI pour créer des applications avec l'IA gratuitement :",
      hi: 'AI से मुफ्त में ऐप बनाने के लिए Omran AI आज़माएं:',
      ur: 'مفت میں AI سے ایپس بنانے کے لیے Omran AI آزمائیں:',
      bn: 'বিনামূল্যে AI দিয়ে অ্যাপ তৈরি করতে Omran AI ব্যবহার করুন:',
      ne: 'निःशुल्क AI ले एप बनाउन Omran AI प्रयोग गर्नुहोस्:'
    };
    const shareText = texts[currentLang] || texts.ar;
    if(navigator.share){
      try {
        await navigator.share({ title: titles[currentLang] || titles.ar, text: shareText, url: shareUrl });
      } catch(e){ /* user cancelled share, ignore */ }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        const copiedMsg = { ar:'تم نسخ رابط التطبيق!', en:'App link copied!', fr:"Lien de l'application copié !", hi:'ऐप लिंक कॉपी हो गया!', ur:'ایپ کا لنک کاپی ہو گیا!', bn:'অ্যাপ লিঙ্ক কপি হয়েছে!', ne:'एप लिंक कपी भयो!' };
        alert(copiedMsg[currentLang] || copiedMsg.ar);
      } catch(e){
        prompt('انسخ الرابط:', shareUrl);
      }
    }
  };
}

/* ---------- Mobile drawers (projects / code / preview) ----------
   On mobile the chat is the main screen. ☰ opens the code drawer,
   💬 opens the preview drawer, 📂 opens the projects-history drawer. */
const sidebarEl = $('#sidebar');
const chatcolEl = $('#chatcol');
const workareaEl = $('#workarea');
const backdropEl = $('#drawerBackdrop');
const btnToggleHistory = $('#btnToggleHistory'); // ☰ -> code/preview drawer
const btnToggleProjects = $('#btnToggleProjects'); // 📂 -> project list
// 🤖 وكيل عمران: زر التشغيل/الإيقاف في قائمة ⋮
(function(){
  const b = document.getElementById('btnAgentMode');
  if(b){
    b.onclick = () => {
      window.__agentModeOn = !window.__agentModeOn;
      updateAgentModeUI();
      if(typeof closeHeaderMenu === 'function') closeHeaderMenu();
    };
  }
  updateAgentModeUI();
})();

function closeDrawers(){
  sidebarEl.classList.remove('open');
  workareaEl.classList.remove('open');
  backdropEl.classList.remove('show');
}
function openDrawer(el){
  const isOpen = el.classList.contains('open');
  closeDrawers();
  if(!isOpen){
    el.classList.add('open');
    backdropEl.classList.add('show');
    try{ document.getElementById('plusToolsPopup').classList.remove('show'); }catch(_){ __swallow(_, "ui:app-10-features#6"); }
  }
}
/* v-drawer-drag2 (طلب عمران): نفس سحب الإعدادات لدرجي المحادثات والملفات —
   الدرج يتبع الإصبع؛ فلته قبل ثلث العرض يرجع، وبعده (أو سحبة سريعة)
   ينزلق ويغلق. يعمل بالاتجاهين (RTL يمين / LTR يسار). */
function omranDrawerDrag(el){
  if(!el) return;
  let t0 = null, dragging = false, w = 0, sign = 1;
  const setX = (x, anim) => {
    el.style.setProperty('transition', anim ? 'transform .18s ease-out' : 'none', 'important');
    if(x === null) el.style.removeProperty('transform');
    else el.style.setProperty('transform', 'translateX(' + x + 'px)', 'important');
  };
  const clear = () => { el.style.removeProperty('transform'); el.style.removeProperty('transition'); };
  el.addEventListener('touchstart', (e) => {
    if(e.touches.length !== 1 || !el.classList.contains('open')){ t0 = null; return; }
    t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY, ts: Date.now() };
    dragging = false;
    w = el.getBoundingClientRect().width || 300;
    sign = (document.documentElement.dir === 'rtl') ? 1 : -1;
  }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    if(!t0) return;
    const d = (e.touches[0].clientX - t0.x) * sign;  /* موجب = نحو حافة الإغلاق */
    const dy = e.touches[0].clientY - t0.y;
    if(!dragging){
      if(Math.abs(d) < 14 || Math.abs(d) < Math.abs(dy) * 1.4) return;
      if(d <= 0){ t0 = null; return; }
      dragging = true;
    }
    setX(Math.max(0, d) * sign, false);
  }, { passive: true });
  const fin = (e) => {
    if(!t0) return;
    const was = dragging;
    const d = (was && e.changedTouches && e.changedTouches[0]) ? (e.changedTouches[0].clientX - t0.x) * sign : 0;
    const dt = Date.now() - t0.ts;
    t0 = null; dragging = false;
    if(!was) return;
    if(d > w * 0.35 || (dt < 300 && d > 70)){
      setX((w + 40) * sign, true);
      setTimeout(() => { clear(); closeDrawers(); }, 190);
    } else {
      setX(0, true);
      setTimeout(clear, 220);
    }
  };
  el.addEventListener('touchend', fin, { passive: true });
  el.addEventListener('touchcancel', fin, { passive: true });
}
omranDrawerDrag(sidebarEl);
omranDrawerDrag(workareaEl);

function switchWorkTab(tabName){
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + tabName));
}
btnToggleHistory.onclick = () => { switchWorkTab('code'); openDrawer(workareaEl); };

// 🧠 Ask-All toggle button + first-time hint
(function(){
  const b = document.getElementById('btnAskAllToggle');
  if(!b) return;
  window.__askAllToggleOn = false;
  const paint = () => {
    b.style.background = window.__askAllToggleOn ? 'var(--accent)' : '';
    b.style.color = window.__askAllToggleOn ? '#fff' : '';
    b.style.boxShadow = window.__askAllToggleOn ? '0 0 0 2px rgba(var(--accent-rgb),.35)' : '';
  };
  b.addEventListener('click', () => {
    window.__askAllToggleOn = !window.__askAllToggleOn;
    paint();
  });
  // إعادة تعيين الزر تلقائيًا (لمرة واحدة لكل رسالة) حتى لا يظل «اسأل الكل»
  // مفعّلًا فيتجاهل اختيار المستخدم ✅ للمزود في الرسائل التالية.
  window.__resetAskAllToggle = () => { window.__askAllToggleOn = false; paint(); };
  try{
    if(!localStorage.getItem('askAllHintSeen')){
      const tip = document.createElement('div');
      tip.id = 'askAllHintTip';
      const txt = (typeof t === 'function') ? t('askAllHintText') : '';
      tip.textContent = (txt && txt !== 'askAllHintText') ? txt : "💡 اكتب طلبك عادي — والذكاء الاصطناعي يبني تطبيقك فورًا";
      tip.style.cssText = 'margin:4px 12px 0; padding:8px 12px; border-radius:12px; background:rgba(var(--accent-rgb),.14); color:inherit; font-size:12.5px; cursor:pointer; text-align:center;';
      const bar = document.getElementById('inputbar');
      if(bar && bar.parentNode){
        bar.parentNode.insertBefore(tip, bar);
        const dismiss = () => { try{ tip.remove(); localStorage.setItem('askAllHintSeen','1'); }catch(e){ __swallow(e, "save:app-10-features#7"); } };
        tip.addEventListener('click', dismiss);
        setTimeout(dismiss, 25000);
      }
    }
  }catch(e){ __swallow(e, "save:app-10-features#8"); }
})();

// ➕ composer tools popup
(function(){
  const plusBtn = document.getElementById('btnPlusTools');
  const popup = document.getElementById('plusToolsPopup');
  if(!plusBtn || !popup) return;
  plusBtn.onclick = (e) => { e.stopPropagation(); popup.classList.toggle('show'); if(popup.classList.contains('show')){ try{ closeDrawers(); }catch(_){ __swallow(_, "ui:app-10-features#9"); } try{ closeHeaderMenu(); }catch(_){ __swallow(_, "ui:app-10-features#10"); } } };
  popup.addEventListener('click', (e) => {
    // close after choosing a tool (but keep open for stop toggling)
    if(e.target.closest('button')) setTimeout(() => popup.classList.remove('show'), 150);
  });
  document.addEventListener('click', (e) => {
    if(!e.target.closest('#plusToolsWrap')) popup.classList.remove('show');
  });
})();

// v207: قائمة ⋮ في شريط التبويبات (رفع/تنزيل/ZIP)
(function(){
  const btn = document.getElementById('btnTabsMenu');
  const dd = document.getElementById('tabsMenuDropdown');
  if(!btn || !dd) return;
  btn.onclick = (e) => { e.stopPropagation(); dd.classList.toggle('show'); btn.classList.toggle('active', dd.classList.contains('show')); };
  dd.addEventListener('click', (e) => {
    if(e.target.closest('button')) setTimeout(() => { dd.classList.remove('show'); btn.classList.remove('active'); }, 150);
  });
  document.addEventListener('click', (e) => {
    if(!e.target.closest('#tabDownloadWrap')){ dd.classList.remove('show'); btn.classList.remove('active'); }
  });
})();

// v207: تقسيم قائمة ⋮ الرئيسية إلى مجموعات بعناوين صغيرة
(function(){
  const dd = document.getElementById('headerMenuDropdown');
  if(!dd) return;
  const groups = [
    { title: null, ids: ['btnSettings','btnAuthToggle','btnToggleHistory'] },
    { title: 'grpCreate', ids: ['btnPortraitStyle','btnQuickTemplates','btnVideoMaker','btnDesignAI','btnFashionAI','btnStudioAI','btnAdStudio'] },
    // v597: «رأيك يهمنا» جنب «مساعد البريد» بأمر عمران · مجموعة grpTools أُزيلت (أزرارها الأربعة مخفيّة بسطر ١٠٦ في index.html)
    { title: 'grpSections', ids: ['btnQibla','btnOmranTV','btnStocks','btnConstruction','btnOmranEdu','btnExpense','btnDocs','btnGov','btnCV','btnReligion','btnEmailAssist','btnFeedback'] }
  ];
  // v433: مجموعات الإبداع/الأقسام/الأدوات في مربع الأدوات المنفصل (تبويب الأدوات)
  const ptPopup = document.getElementById('sectionsToolsPopup');
  const ptOverlay = document.getElementById('sectionsToolsOverlay');
  if(ptOverlay){
    ptOverlay.addEventListener('click', (e) => { if(e.target === ptOverlay) ptOverlay.classList.remove('show'); });
  }
  const stpCloseBtn = document.getElementById('stpCloseBtn');
  if(stpCloseBtn && ptOverlay){ stpCloseBtn.onclick = () => ptOverlay.classList.remove('show'); }
  // v434: أيقونات Microsoft Fluent 3D الرسمية لبطاقات تبويب الأدوات
  const STP_3D = 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/';
  const STP_ICONS = {
    btnVideoMaker:  'Clapper%20board/3D/clapper_board_3d.png',
    btnDesignAI:    'Artist%20palette/3D/artist_palette_3d.png',
    btnFashionAI:   'Dress/3D/dress_3d.png',
    btnStudioAI:    'Magic%20wand/3D/magic_wand_3d.png',
    btnAdStudio:    'Megaphone/3D/megaphone_3d.png',
    btnQibla:       'Kaaba/3D/kaaba_3d.png',
    btnOmranTV:     'Television/3D/television_3d.png',
    btnStocks:      'Chart%20increasing/3D/chart_increasing_3d.png',
    btnConstruction:'Building%20construction/3D/building_construction_3d.png',
    btnOmranEdu:    'Graduation%20cap/3D/graduation_cap_3d.png',
    btnExpense:     'Money%20bag/3D/money_bag_3d.png',
    btnReligion:    'Mosque/3D/mosque_3d.png',
    btnEmailAssist: 'E-mail/3D/e-mail_3d.png',
    btnPortraitStyle:'Framed%20picture/3D/framed_picture_3d.png',
    btnTemplates:   'Light%20bulb/3D/light_bulb_3d.png',
    btnAgentMode:   'Robot/3D/robot_3d.png',
    btnInstall:     'Mobile%20phone/3D/mobile_phone_3d.png',
    btnShareApp:    'Outbox%20tray/3D/outbox_tray_3d.png',
    btnFeedback:    'Speech%20balloon/3D/speech_balloon_3d.png'
  };
  function stpApply3d(b, id){
    const path = STP_ICONS[id];
    if(!path) return;
    const img = document.createElement('img');
    img.className = 'stp3d';
    img.loading = 'lazy';
    img.alt = '';
    img.src = STP_3D + path;
    b.insertBefore(img, b.firstChild);
    b.classList.add('has3d');
  }
  groups.forEach(g => {
    if(g.title && ptPopup){
      const h = document.createElement('div');
      h.className = 'ptSectionTitle';
      const lbl = document.createElement('span');
      lbl.setAttribute('data-i18n', g.title);
      lbl.textContent = (typeof t === 'function') ? t(g.title) : g.title;
      h.appendChild(lbl);
      ptPopup.appendChild(h);
      const grid = document.createElement('div');
      grid.className = 'ptGrid';
      ptPopup.appendChild(grid);
      g.ids.forEach(id => { const b = document.getElementById(id); if(b){ grid.appendChild(b); stpApply3d(b, id); } });
      /* v-tools-back (طلب عمران ١ سبتمبر): اختيار ميزة كان يغلق مربع
         الأدوات تحتها — فإغلاق الميزة يرمي المستخدم للمحادثة بدل «نقطة
         خلف». كل الميزات تفتح فوق المربع (تدقيق z-index للسبع عشرة)،
         فنبقيه مفتوحًا: إغلاق الميزة يكشف المربع، وإغلاق المربع نفسه
         (✕ أو الخلفية) يعود للمحادثة. */
    } else {
      g.ids.forEach(id => { const b = document.getElementById(id); if(b && b.parentElement === dd) dd.appendChild(b); });
    }
  });
  // v214: تسجيل الخروج دائمًا آخر خانة في القائمة
  const lastLogout = document.getElementById('btnMenuLogout');
  if(lastLogout) dd.appendChild(lastLogout);
})();

// v207: إغلاق الإعدادات بالضغط في أي مكان خارجها
(function(){
  const dlg = document.getElementById('settingsDialog');
  if(!dlg) return;
  dlg.addEventListener('click', (e) => {
    if(e.target === dlg){
      const r = dlg.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if(!inside) dlg.close();
    }
  });
})();

// «المتصفح» (v361) — خانة بحث ويب مربوطة بالمحادثة الحالية: المستخدم يكتب
// موضوعًا، يُرسَل داخل نفس المحادثة عبر sendPrompt() فيكمّل النموذج على نفس
// السياق (بحث حي + ربط بالكلام السابق). الدخول والخروج بحرية؛ الموضوع محفوظ.
(function(){
  const b = document.getElementById('omranBtnWeb') || document.getElementById('btnPreviewToggle');
  if(!b) return;
  try{ if(localStorage.getItem('previewEnabled') === 'off') localStorage.removeItem('previewEnabled'); }catch(e){ __swallow(e, "misc:app-10-features#11"); }
  function isAr(){ return (typeof lang === 'undefined' || !lang || lang === 'ar' || lang === 'ur'); }
  function openBrowserBox(){
    const ar = isAr();
    const dir = ar ? 'rtl' : 'ltr';
    let old = document.getElementById('webBrowserOverlay');
    if(old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'webBrowserOverlay';
    ov.dir = dir;
    ov.style.cssText = 'position:fixed; inset:0; z-index:950; background:rgba(0,0,0,.6); backdrop-filter:blur(4px); display:flex; align-items:flex-start; justify-content:center; padding:14vh 16px 16px;';
    const card = document.createElement('div');
    card.style.cssText = 'width:100%; max-width:560px; background:var(--panel,#000000); border:1px solid rgba(255,255,255,.12); border-radius:16px; box-shadow:0 20px 60px rgba(0,0,0,.5); overflow:hidden;';
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex; align-items:center; gap:8px; padding:12px 14px; border-bottom:1px solid rgba(255,255,255,.08);';
    bar.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b8ba7" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>' +
      '<input id="webBrowserInput" type="text" autocomplete="off" placeholder="' + (ar ? 'ابحث في الويب وتابع نفس الموضوع…' : 'Search the web, continue the same topic…') + '" style="flex:1; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1); border-radius:10px; color:#fff; font-size:15px; padding:11px 13px; outline:none;">' +
      '<button id="webBrowserGo" type="button" style="flex-shrink:0; background:var(--accent,#6b7280); border:none; color:#fff; border-radius:10px; padding:11px 15px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center;"><svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg></button>';
    const hint = document.createElement('div');
    hint.style.cssText = 'padding:10px 16px 14px; color:#8b8ba7; font-size:12.5px; line-height:1.7;';
    hint.textContent = ar ? 'اكتب موضوعك وبيكمّل مع محادثتك الحالية على نفس السياق. اضغط خارج الصندوق للإغلاق.' : 'Type your topic — it continues within your current chat and context. Tap outside to close.';
    card.appendChild(bar); card.appendChild(hint); ov.appendChild(card);
    document.body.appendChild(ov);
    const input = document.getElementById('webBrowserInput');
    setTimeout(() => { try{ input.focus(); }catch(e){ __swallow(e, "ui:app-10-features#12"); } }, 50);
    function go(){
      const q = (input.value || '').trim();
      if(!q) return;
      ov.remove();
      try{ if(typeof closeDrawers === 'function') closeDrawers(); }catch(e){ __swallow(e, "ui:app-10-features#13"); }
      try{
        const p = document.getElementById('prompt');
        if(p){
          p.value = q;
          p.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if(typeof sendPrompt === 'function') sendPrompt();
      }catch(e){ __swallow(e, "misc:app-10-features#14"); }
    }
    document.getElementById('webBrowserGo').onclick = go;
    input.addEventListener('keydown', (ev) => { if(ev.key === 'Enter'){ ev.preventDefault(); go(); } });
    ov.addEventListener('click', (ev) => { if(ev.target === ov) ov.remove(); });
  }
  b.onclick = (e) => {
    e.stopPropagation();
    openBrowserBox();
    setTimeout(() => {
      const p = document.getElementById('plusToolsPopup'); if(p) p.classList.remove('show');
      if(typeof closeHeaderMenu === 'function') try{ closeHeaderMenu(); }catch(e2){ __swallow(e2, "ui:app-10-features#15"); }
    }, 100);
  };
})();

// 🕰️ آلة الزمن — عرض واسترجاع إصدارات المشروع
(function(){
  const btn = document.getElementById('btnTimeMachine');
  if(!btn) return;
  btn.onclick = () => {
    const cur = getCurrent();
    const isAr = (typeof lang === 'undefined' || !lang || lang === 'ar' || lang === 'ur');
    const hist = (cur && cur.codeHistory) ? cur.codeHistory.slice().reverse() : [];
    let old = document.getElementById('tmOverlay');
    if(old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'tmOverlay';
    ov.style.cssText = 'position:fixed; inset:0; z-index:900; background:rgba(0,0,0,.75); backdrop-filter:blur(3px); display:flex; align-items:center; justify-content:center; padding:16px;';
    const box = document.createElement('div');
    box.style.cssText = 'background:#12151d; border-radius:14px; max-width:560px; width:100%; max-height:80vh; display:flex; flex-direction:column; overflow:hidden;';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex; align-items:center; gap:10px; padding:14px 16px; font-size:14px; font-weight:700;';
    head.innerHTML = '<span>🕰️ ' + (isAr ? 'آلة الزمن — إصدارات المشروع' : 'Time Machine — project versions') + '</span><span style="flex:1;"></span>';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✖';
    closeBtn.style.cssText = 'background:none; border:none; color:#fff; cursor:pointer; font-size:15px;';
    closeBtn.onclick = () => ov.remove();
    head.appendChild(closeBtn);
    box.appendChild(head);
    const body = document.createElement('div');
    body.style.cssText = 'overflow:auto; flex:1; padding:0 16px 16px;';
    if(!hist.length){
      body.innerHTML = '<div style="color:#98a0b3; padding:12px 0;">' + (isAr ? 'لا توجد إصدارات محفوظة بعد — كل تعديل على الكود ينحفظ هنا تلقائيًا.' : 'No saved versions yet — every code change is saved here automatically.') + '</div>';
    }
    hist.forEach((h, idx) => {
      const isCurrent = cur.code === h.code;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; align-items:center; gap:10px; padding:10px 0; font-size:13px;';
      const d = new Date(h.ts);
      const when = d.toLocaleString(isAr ? 'ar-AE' : 'en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
      const info = document.createElement('span');
      info.style.cssText = 'flex:1; color:' + (isCurrent ? 'var(--accent2,#00e0b8)' : '#e8eaf1') + ';';
      info.textContent = (isCurrent ? '✅ ' : '') + when + ' — ' + Math.round(h.code.length / 1024) + 'KB';
      row.appendChild(info);
      if(!isCurrent){
        const diffB = document.createElement('button');
        diffB.className = 'btn';
        diffB.style.cssText = 'font-size:12px; padding:5px 10px;';
        diffB.textContent = '🔀';
        diffB.title = isAr ? 'الفروقات' : 'Diff';
        diffB.onclick = () => showCodeDiff(cur.code, h.code, when);
        row.appendChild(diffB);
        const restB = document.createElement('button');
        restB.className = 'btn';
        restB.style.cssText = 'font-size:12px; padding:5px 10px;';
        restB.textContent = isAr ? '↩️ استرجاع' : '↩️ Restore';
        restB.onclick = () => {
          cur.code = h.code;
          cur.codeType = h.codeType || 'html';
          saveState();
          renderAll(true);
          ov.remove();
        };
        row.appendChild(restB);
      }
      body.appendChild(row);
    });
    box.appendChild(body);
    ov.appendChild(box);
    ov.onclick = (e) => { if(e.target === ov) ov.remove(); };
    document.body.appendChild(ov);
  };
})();

// 🖼️ صور → PDF (client-side, no API cost)
(function(){
  const btn = document.getElementById('btnImgToPdf');
  const input = document.getElementById('imgToPdfInput');
  if(!btn || !input) return;
  /* v-pdf-file: محمّل مشترك واحد في app-05 (النسخة الموطّنة أولًا ثم CDN) */
  function loadJsPdf(){ return omranLoadJsPdf(); }
  function readImage(file){
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => resolve({ img, dataUrl: fr.result });
        img.onerror = reject;
        img.src = fr.result;
      };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }
  btn.onclick = () => input.click();
  input.onchange = async () => {
    const files = Array.from(input.files || []).filter(f => f.type.indexOf('image/') === 0);
    input.value = '';
    if(!files.length) return;
    const isAr = (typeof lang === 'undefined' || !lang || lang === 'ar' || lang === 'ur');
    btn.disabled = true;
    /* v-img2pdf-heic (لقطة عمران ١ سبتمبر): صورة واحدة بصيغة لا يفكها
       المتصفح (HEIC من كاميرات هواوي/آيفون) كانت تُفشل العملية كلها برسالة
       عامة. الآن: الصورة الفاشلة تُتخطى، والرسالة تسمي السبب، والفشل يُبلغ
       لوحة الأخطاء ليُشخَّص عن بُعد. */
    const failedNames = [];
    let added = 0;
    try{
      await loadJsPdf();
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      for(let i = 0; i < files.length; i++){
        let decoded;
        try{
          /* v-heic: تحويل HEIC إلى JPEG محليًا قبل الفك */
          const nf = await omranNormalizeImageFile(files[i]);
          decoded = await readImage(nf);
        }
        catch(e){ failedNames.push(files[i].name || files[i].type || '?'); continue; }
        const img = decoded.img;
        // draw to canvas as JPEG to keep the PDF small and support all formats
        const cv = document.createElement('canvas');
        const maxSide = 2000;
        const sc = Math.min(1, maxSide / Math.max(img.width, img.height));
        cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
        const cx = cv.getContext('2d');
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
        cx.drawImage(img, 0, 0, cv.width, cv.height);
        const jpg = cv.toDataURL('image/jpeg', 0.88);
        const margin = 24;
        const fit = Math.min((pw - margin * 2) / cv.width, (ph - margin * 2) / cv.height);
        const w = cv.width * fit, h = cv.height * fit;
        if(added > 0) pdf.addPage();
        pdf.addImage(jpg, 'JPEG', (pw - w) / 2, (ph - h) / 2, w, h);
        added++;
      }
      if(!added) throw new Error('no-decodable-images');
      /* v-pdf-universal: pdf.save() = رابط تنزيل لا يعمل داخل الأغلفة —
         المسار الموحد: جسر الآيفون ← ورقة مشاركة النظام ← تنزيل عادي. */
      await omranSaveBlob(pdf.output('blob'), 'omran-images.pdf');
      if(failedNames.length){
        alert(isAr
          ? 'تم إنشاء الـPDF، لكن تخطّيت ' + failedNames.length + ' صورة بصيغة غير مدعومة (HEIC؟): ' + failedNames.slice(0,3).join('، ')
          : 'PDF created, but ' + failedNames.length + ' unsupported image(s) were skipped (HEIC?): ' + failedNames.slice(0,3).join(', '));
      }
    }catch(err){
      try{
        fetch('/api/system?action=client-errors', { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            message: 'IMG2PDF FAIL: ' + String((err && err.message) || err).slice(0,120)
              + ' — types: ' + files.map(f => f.type || f.name || '?').slice(0,5).join(','),
            source: 'img-to-pdf', url: location.href, ua: navigator.userAgent
          }), keepalive: true
        }).catch(function(){ /* guard-ok: الإبلاغ لا يعطل شيئًا */ });
      }catch(e2){ __swallow(e2, 'img2pdf:report'); }
      /* v-heic-diag: الرسالة تطبع السبب الفعلي واسم/نوع الملف — سكرينشوت
         المستخدم يصير هو التشخيص الكامل بدل جولات تخمين. */
      const detParts = [];
      if(failedNames.length) detParts.push(failedNames.slice(0,3).join('، '));
      detParts.push(files.map(f => (f.type || '?').replace('image/','')).slice(0,4).join('،'));
      if(window.__omranHeicErr) detParts.push(window.__omranHeicErr);
      detParts.push(String((err && err.message) || err).slice(0,120));
      const heicish = files.some(f => /hei[cf]/i.test((f.type || '') + (f.name || '')));
      alert((heicish
        ? (isAr ? 'تعذر فك صور HEIC هذه بالذات.' : 'Could not decode these specific HEIC photos.')
        : (isAr ? 'تعذر قراءة الصور المحددة.' : 'Could not read the selected images.'))
        + '\n' + (isAr ? 'التفاصيل: ' : 'Details: ') + detParts.filter(Boolean).join(' | '));
    }
    btn.disabled = false;
  };
})();

// Brand title: click = home, text follows language
(function(){
  const h1 = document.querySelector('header h1');
  /* v-logo-soft (شكوى: «الصفحة تومض كأني أسويله أبديت»): الشعار كان يعيد
     تحميل الصفحة كاملة — ولمسه سهل على الآيفون فتومض الشاشة وتعيد الإقلاع.
     صار يرجع للرئيسية داخل الصفحة نفسها بلا أي إعادة تحميل. */
  /* v-logo-keep (شكوى عمران ٣١ أغسطس: «إذا أضغط على كلمة عمران يفتح محادثة
     جديدة»): الشعار كان ينقر زر «الرئيسية» فيُنشئ محادثة جديدة — ولمسه سهل
     أعلى الشاشة فتضيع المحادثة الحالية من قدام المستخدم. صار غير مدمر:
     يقفل الأدراج ويرجع لأعلى المحادثة فقط. محادثة جديدة = زر + أو الرئيسية. */
  if(h1) h1.onclick = () => {
    try{ saveState(); }catch(_){ __swallow(_, "save:app-10-features#16"); }
    try{ if(typeof closeDrawers === 'function') closeDrawers(); }catch(_){ /* guard-ok */ }
    try{ window.scrollTo(0, 0); const m = document.getElementById('messages'); if(m) m.scrollTop = 0; }catch(_){ /* guard-ok */ }
  };
  /* v-brand-l10n (طلب المالك ٢٩ أغسطس): شعار ذهبي مخصوص لكل لغة — العربي
     والإنجليزي كما هما بلا أي تغيير. الأعراض عند ارتفاع 42 من ملفات PNG
     الفعلية (الأصل 168px = ٤×). لغة بلا شعار خاص ترجع للإنجليزي. */
  const BRAND_L10N_W = { zh:84, hi:71, es:87, fr:89, bn:80, ru:89, ur:75, id:86, fil:93, tr:75, ne:69, ml:110 };
  const syncBrand = () => {
    const bt = document.getElementById('brandTitle');
    const l = (typeof lang !== 'undefined' && lang) ? lang : 'ar';
    if(bt){
      /* v-brand-stable (شكوى ٢٩ أغسطس: الشعار يتحرك عند التحديث): أبعاد
         الصورة تُعلن مسبقًا فيحجز المتصفح مكانها قبل تحميلها — لا قفزة.
         النِّسب من ملفات PNG الفعلية: عربي 1203×400، إنجليزي 1534×400. */
      let imgSrc, imgW, imgAlt;
      if(l === 'ar'){ imgSrc = 'icons/brand-ar.png'; imgW = 126; imgAlt = 'عمران Ai'; }
      else if(BRAND_L10N_W[l]){ imgSrc = 'icons/brand-' + l + '.png'; imgW = BRAND_L10N_W[l]; imgAlt = 'Omran Ai'; }
      else { imgSrc = 'icons/brand-en.png'; imgW = 161; imgAlt = 'Omran Ai'; }
      bt.innerHTML = '<img src="' + imgSrc + '" alt="' + imgAlt + '" class="brandImg" width="' + imgW + '" height="42">';
    }
  };
  syncBrand();
  window.__syncBrandTitle = syncBrand;
})();
btnToggleProjects.onclick = () => { openDrawer(sidebarEl); closeHeaderMenu(); };

// One-time onboarding hint for new/mobile users who don't know ☰ opens the
// code + live-preview drawer: a pulsing glow + tooltip pointing at it, shown
// only once (localStorage flag), dismissed on tap/close/timeout.
(function initCodeHint(){
  try{
    return; // hint retired — code button now lives in the ⚙️ menu
    if(localStorage.getItem('aiapp_seen_code_hint')) return;
    if(window.innerWidth > 860) return; // mobile-only nudge
    const tip = $('#codeHintTip');
    const promptEl = $('#prompt');
    if(!btnToggleHistory || !tip || !promptEl) return;
    function position(){
      const r = btnToggleHistory.getBoundingClientRect();
      tip.style.top = (r.bottom + 10) + 'px';
      const left = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, r.left + r.width / 2 - tip.offsetWidth / 2));
      tip.style.left = left + 'px';
    }
    function dismiss(){
      try{ localStorage.setItem('aiapp_seen_code_hint', '1'); }catch(e){ __swallow(e, "save:app-10-features#17"); }
      btnToggleHistory.classList.remove('code-hint-pulse');
      tip.style.display = 'none';
      window.removeEventListener('resize', position);
    }
    function show(){
      btnToggleHistory.classList.add('code-hint-pulse');
      tip.style.display = 'block';
      position();
      window.addEventListener('resize', position);
      btnToggleHistory.addEventListener('click', dismiss, {once: true});
      const closeBtn = $('#codeHintCloseBtn');
      if(closeBtn) closeBtn.addEventListener('click', dismiss);
      // dismiss automatically once the user sends the message, or after a timeout
      promptEl.removeEventListener('keydown', onFirstKey);
      setTimeout(dismiss, 9000);
    }
    function onFirstKey(){
      promptEl.removeEventListener('input', onFirstKey);
      promptEl.removeEventListener('keydown', onFirstKey);
      show();
    }
    // Wait until the user actually starts typing their request before nudging
    // them toward ☰ — this is the moment the tip is most relevant.
    promptEl.addEventListener('input', onFirstKey, {once: true});
    promptEl.addEventListener('keydown', onFirstKey, {once: true});
  }catch(e){ console.error('codeHint init', e); }
})();
backdropEl.onclick = closeDrawers;

/* ---------- Header "more" dropdown (📂 projects / 📲 install / 🚪 logout) ---------- */
const btnHeaderMenu = $('#btnHeaderMenu');
const headerMenuDropdown = $('#headerMenuDropdown');
function closeHeaderMenu(){
  headerMenuDropdown.classList.remove('show');
  btnHeaderMenu.classList.remove('active');
  const qc = $('#quickChips');
  if(qc) qc.style.display = '';
  const msgs = $('#messages');
  if(msgs) msgs.style.visibility = '';
  const pf = $('#previewFrame');
  if(pf) pf.style.visibility = '';
  const pc = $('#panel-code');
  if(pc) pc.style.visibility = '';
}
// v202: بعض نصوص الترجمة تحتوي إيموجي (مثل 📈/✅) — ننظف تسميات قائمة الأقسام
// لأن أيقوناتها الآن SVG احترافية فقط بدون أي إيموجي.
function stripHeaderMenuEmoji(){
  try{
    const scopes = [headerMenuDropdown, document.getElementById('plusToolsPopup'), document.getElementById('sectionsToolsPopup')];
    ['#btnDeleteAll','#authToggleBtn','#settingsLogoutBtn','#btnExportZip','[data-i18n="exportZip"]'].forEach(sel=>{
      const el = document.querySelector(sel); if(el) scopes.push(el);
    });
    scopes.forEach(scope=>{
      if(!scope) return;
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      let n; const nodes=[];
      while((n = walker.nextNode())) nodes.push(n);
      nodes.forEach(tn=>{
        const clean = tn.textContent.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').replace(/\s{2,}/g, ' ');
        if(clean !== tn.textContent) tn.textContent = clean;
      });
    });
  }catch(e){ __swallow(e, "misc:app-10-features#18"); }
}
try{ setInterval(stripHeaderMenuEmoji, 3000); setTimeout(stripHeaderMenuEmoji, 800); }catch(e){ __swallow(e, "misc:app-10-features#19"); }
function toggleHeaderMenu(){
  const willShow = !headerMenuDropdown.classList.contains('show');
  if(willShow){ stripHeaderMenuEmoji(); try{ const pg=document.getElementById('providerGridSidebar'); if(pg) pg.classList.remove('open'); }catch(_){ __swallow(_, "ui:app-10-features#20"); } }
  headerMenuDropdown.classList.toggle('show', willShow);
  btnHeaderMenu.classList.toggle('active', willShow);
  const qc = $('#quickChips');
  if(qc) qc.style.display = willShow ? 'none' : '';
  const msgs = $('#messages');
  if(msgs) msgs.style.visibility = willShow ? 'hidden' : '';
  const pf = $('#previewFrame');
  if(pf) pf.style.visibility = willShow ? 'hidden' : '';
  const pc = $('#panel-code');
  if(pc) pc.style.visibility = willShow ? 'hidden' : '';
}
btnHeaderMenu.onclick = (e) => { e.stopPropagation(); toggleHeaderMenu(); };
document.addEventListener('click', (e) => {
  if(!headerMenuDropdown.classList.contains('show')) return;
  if(e.target.closest('#headerMenuDropdown button')){ closeHeaderMenu(); return; }
  if(headerMenuDropdown.contains(e.target) || e.target === btnHeaderMenu) return;
  closeHeaderMenu();
});

window.addEventListener('resize', () => { if(window.innerWidth > 860) closeDrawers(); });

/* ---------- Draggable resizers (desktop) ---------- */
function setupResizer(resizerEl, panelEl, opts){
  const { min = 180, max = 560, storeKey } = opts;
  const saved = parseInt(localStorage.getItem(storeKey) || '', 10);
  if(saved && saved >= min && saved <= max){
    panelEl.style.width = saved + 'px';
  }
  let startX = 0, startWidth = 0, dragging = false;
  const isRTL = () => document.documentElement.dir === 'rtl';

  function onMove(clientX){
    let delta = clientX - startX;
    if(isRTL()) delta = -delta;
    let newWidth = startWidth + delta;
    newWidth = Math.max(min, Math.min(max, newWidth));
    panelEl.style.width = newWidth + 'px';
  }
  function onUp(){
    if(!dragging) return;
    dragging = false;
    resizerEl.classList.remove('dragging');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    document.body.classList.remove('resizing-active');
    localStorage.setItem(storeKey, parseInt(panelEl.style.width, 10));
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend', onUp);
  }
  function onMouseMove(e){ onMove(e.clientX); }
  function onTouchMove(e){ if(e.touches[0]) onMove(e.touches[0].clientX); }
  function onDown(clientX){
    dragging = true;
    startX = clientX;
    startWidth = panelEl.getBoundingClientRect().width;
    resizerEl.classList.add('dragging');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    document.body.classList.add('resizing-active');
  }
  resizerEl.addEventListener('mousedown', (e) => {
    if(window.innerWidth <= 860) return;
    onDown(e.clientX);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onUp);
  });
  resizerEl.addEventListener('touchstart', (e) => {
    if(window.innerWidth <= 860) return;
    if(e.touches[0]) onDown(e.touches[0].clientX);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onUp);
  }, { passive: true });
}
setupResizer($('#resizer1'), sidebarEl, { min: 180, max: 420, storeKey: 'panelWidthSidebar' });
setupResizer($('#resizer2'), chatcolEl, { min: 280, max: 620, storeKey: 'panelWidthChat' });

// On mobile, picking a project from the history list should close the drawer.
$('#history').addEventListener('click', () => {
  if(window.innerWidth <= 860) closeDrawers();
});

/* ---------- 🎓 Omran Edu (educational video builder, embedded in-app) ---------- */
(function(){
  const btn = $('#btnOmranEdu');
  const modal = $('#omranEduModal');
  const frame = $('#omranEduFrame');
  const closeBtn = $('#omranEduCloseBtn');
  if(!btn || !modal || !frame) return;
  // v306: the OLD education modal's open logic, kept fully intact and exposed
  // globally so the Edu Hub («التعليم») home card can open it.
  function openOldEdu(){
    if(frame.src === 'about:blank' || !frame.src){
      /* v-edu-selfhost: مستودع omran-edu غير موصول بالنشر التلقائي — الصفحة
         المحدثة تُستضاف هنا (edu-old/) فتنشر مع التطبيق، والخلفية تبقى على
         النشر القديم الشغال (CORS مفتوح). */
      frame.src = '/edu-old/index.html?v=14l'; /* v-edu-14: كسر الكاش بعد إضافة اللغات */
    }
    modal.style.display = 'flex';
    if(window.innerWidth <= 860 && typeof closeDrawers === 'function') closeDrawers();
    const dd = $('#headerMenuDropdown');
    if(dd) dd.classList.remove('show');
  }
  window.openOmranEduModal = openOldEdu;
  // v306: the single «التعليم» button now opens the NEW Edu Hub; the old
  // modal stays reachable from a card inside the Edu Hub home view.
  btn.addEventListener('click', () => {
    const dd = $('#headerMenuDropdown');
    if(dd) dd.classList.remove('show');
    if(window.innerWidth <= 860 && typeof closeDrawers === 'function') closeDrawers();
    if(typeof window.eduHubOpen === 'function') window.eduHubOpen();
    else openOldEdu();
  });
  function closeModal(){ modal.style.display = 'none'; }
  if(closeBtn) closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if(e.target === modal) closeModal(); });
})();

/* ---------- 🔗 Share project (public/private link) ---------- */
let shareModalProject = null;
function openShareModal(project){
  shareModalProject = project;
  const modal = $('#shareModal');
  if(!modal) return;
  $('#shareResultBox').style.display = 'none';
  $('#shareStatusMsg').style.display = 'none';
  $('#sharePublicYes').checked = true;
  modal.style.display = 'flex';
}
(function(){
  const modal = $('#shareModal');
  if(!modal) return;
  const closeBtn = $('#shareModalCloseBtn');
  const createBtn = $('#shareCreateBtn');
  const copyBtn = $('#shareCopyBtn');
  const statusMsg = $('#shareStatusMsg');
  const resultBox = $('#shareResultBox');
  const resultUrl = $('#shareResultUrl');

  function closeModal(){ modal.style.display = 'none'; shareModalProject = null; }
  if(closeBtn) closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if(e.target === modal) closeModal(); });

  if(createBtn) createBtn.addEventListener('click', async () => {
    if(!shareModalProject) return;
    /* v-share-chat (طلب المالك: «مش ضروري فقط التطبيق — كل شي»): المحادثة
       تُشارك أيضًا — الرفض فقط لمشروع فارغ تمامًا (لا كود ولا رسائل). */
    const __shareMsgs = (shareModalProject.messages || [])
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim())
      .slice(-300)
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 20000) }));
    if(!String(shareModalProject.code || '').trim() && !__shareMsgs.length){
      statusMsg.style.display = 'block';
      statusMsg.textContent = t('shareNeedCode');
      return;
    }
    const isPublic = $('#sharePublicYes').checked;
    statusMsg.style.display = 'block';
    statusMsg.textContent = t('shareCreating');
    resultBox.style.display = 'none';
    createBtn.disabled = true;
    try{
      const username = (typeof authGet === 'function' && authGet('aiapp_username')) ? authGet('aiapp_username') : 'زائر';
      const resp = await fetch('/api/share', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          title: shareModalProject.title || t('defaultProjectTitle'),
          code: shareModalProject.code || '',
          username,
          isPublic,
          messages: __shareMsgs, /* v-share-chat */
        }),
      });
      const data = await resp.json();
      if(!resp.ok || !data.id) throw new Error(data.error || 'error');
      const fullUrl = location.origin + '/p.html?id=' + data.id;
      resultUrl.value = fullUrl;
      resultBox.style.display = 'block';
      statusMsg.style.display = 'none';
    }catch(e){
      /* v-share-why: السبب الحقيقي يظهر — «بلا كود» و«أكبر من الحد» لهما
         رسالتاهما، وأي خطأ خادم آخر يُعرض نصّه بين قوسين ليُشخَّص فورًا. */
      var __sm = (e && e.message) || '';
      if(__sm === 'Missing code' || __sm === 'empty_project') statusMsg.textContent = t('shareNeedCode');
      else if(__sm === 'code_too_large') statusMsg.textContent = t('shareTooLarge');
      else statusMsg.textContent = t('shareError') + ((__sm && __sm !== 'error') ? ' (' + __sm.slice(0, 120) + ')' : '');
    }finally{
      createBtn.disabled = false;
    }
  });

  if(copyBtn) copyBtn.addEventListener('click', () => {
    resultUrl.select();
    navigator.clipboard && navigator.clipboard.writeText(resultUrl.value).catch(()=>{});
    try{ document.execCommand('copy'); }catch(e){ __swallow(e, "misc:app-10-features#21"); }
    statusMsg.style.display = 'block';
    statusMsg.textContent = t('shareCopied');
  });
})();

/* v-modal-close-fix (شكوى عمران: «✕ فوق عند الساعة ما ينضغط» — وبطلبه لاحقًا:
   بلا أي زر إضافي): كل نوافذ الأدوات الكبيرة يأخذ رأسها هامش أمان علويًّا حتى
   لا يختبئ ✕ تحت الساعة، ويكبر الزر نفسه. قائمة معلنة — لا لمس لغيرها. */
(function omranModalCloseFix(){
  var PAIRS = [
    ['designAiModal', 'designAiCloseBtn'],
    ['fashionAiModal', 'fashionAiCloseBtn'],
    ['studioAiModal', 'studioAiCloseBtn'],
    ['portraitStyleModal', 'portraitStyleCloseBtn'],
    ['omranEduModal', 'omranEduCloseBtn'],
    ['videoMakerModal', 'videoMakerCloseBtn'],
    ['constructionModal', 'constructionCloseBtn'],
    ['religionModal', 'religionCloseBtn'],
    ['emailAssistModal', 'emailAssistCloseBtn'],
  ];
  function arm(){
    PAIRS.forEach(function(p){
      var modal = document.getElementById(p[0]);
      var closeBtn = document.getElementById(p[1]);
      if(!modal || !closeBtn || modal.__omranBC) return;
      modal.__omranBC = 1;
      try{ modal.style.paddingTop = 'calc(20px + max(env(safe-area-inset-top, 0px), 30px))'; }catch(e){ /* guard-ok — cosmetic */ }
      try{ closeBtn.style.minWidth = '44px'; closeBtn.style.minHeight = '40px'; closeBtn.style.fontSize = '16px'; }catch(e){ /* guard-ok — cosmetic */ }
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ arm(); setTimeout(arm, 1200); });
  else { arm(); setTimeout(arm, 1200); }
})();
