window.safeParse = safeParse; window.safeParseLS = safeParseLS;
// ONE-TIME MIGRATION: earlier versions of this app let visitors paste their own
// provider API keys/models into localStorage for direct (client-side) calls.
// Now all 8 providers (except Perplexity) are proxied server-side with the
// owner's keys, so any leftover key/model from that era causes broken direct
// calls (e.g. an old deleted model, or a since-revoked personal key) instead
// of using the working server proxy. Wipe them out once per app version bump.
(function migrateLegacyProviderStorage(){
  const MIGRATION_FLAG = 'aiapp_legacy_keys_migrated_v92';
  try{
    if(localStorage.getItem(MIGRATION_FLAG)) return;
    const providers = ['claude','cohere','deepseek','gemini','groq','mistral','openrouter','perplexity'];
    providers.forEach(p => {
      if(p === 'perplexity') return; // Perplexity is still user-key only, keep it
      localStorage.removeItem('aiapp_' + p + '_apikey');
      localStorage.removeItem('aiapp_' + p + '_model');
    });
    localStorage.setItem(MIGRATION_FLAG, '1');
  }catch(e){ __swallow(e, "save:app-01-boot-auth#1"); }
})();

// Some mobile browsers (notably Huawei Browser) can misreport a wide CSS viewport,
// causing the `@media (max-width:860px)` mobile layout to never trigger even on a phone.
// Detect real touch/mobile devices via user-agent + touch support as a reliable fallback,
// and force the mobile UI class regardless of the reported viewport width.
(function applyMobileUiClass(){
  const ua = navigator.userAgent || '';
  const isMobileUA = /Android|iPhone|iPad|iPod|Mobile|Huawei|HarmonyOS/i.test(ua);
  const isTouch = (navigator.maxTouchPoints || 0) > 0;
  const isNarrow = window.matchMedia('(max-width:860px)').matches;
  if((isMobileUA && isTouch) || isNarrow){
    document.documentElement.classList.add('mobile-ui');
  }
})();

/* v308: منع السحب الأفقي على مستوى الصفحة (iOS Safari) — الكود/الجداول تنسحب داخل صندوقها فقط */
(function(){
  let sx=0, sy=0;
  document.addEventListener('touchstart', e=>{
    if(e.touches.length!==1) return;
    sx=e.touches[0].clientX; sy=e.touches[0].clientY;
  }, {passive:true});
  document.addEventListener('touchmove', e=>{
    if(e.touches.length!==1) return;
    const dx=Math.abs(e.touches[0].clientX-sx), dy=Math.abs(e.touches[0].clientY-sy);
    if(dx<=dy) return; // حركة عمودية — طبيعي
    // اسمح بالسحب الأفقي فقط داخل عناصر قابلة للتمرير الأفقي
    let el=e.target;
    while(el && el!==document.body){
      if(el.scrollWidth>el.clientWidth+2){
        const ox=getComputedStyle(el).overflowX;
        if(ox==='auto'||ox==='scroll') return;
      }
      el=el.parentElement;
    }
    if(e.cancelable) e.preventDefault();
  }, {passive:false});
})();

/* v310: منع سفاري iOS من سحب الصفحة كاملة عموديًا (يخفي الهيدر تحت شريط
   الساعة) — التطبيق مثبت 100dvh والصفحة نفسها ما يفترض تتحرك أبدًا.
   نرجّع التمرير لصفر إلا أثناء الكتابة (حتى ما نخرب رفع الكيبورد للحقل). */
(function lockWindowVScroll(){
  if(!document.documentElement.classList.contains('mobile-ui')) return;
  const inputFocused = () => {
    const ae = document.activeElement;
    return !!(ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.isContentEditable));
  };
  const reset = () => {
    if(inputFocused()) return;
    if(window.scrollY || document.documentElement.scrollTop || document.body.scrollTop){
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  };
  window.addEventListener('scroll', reset, {passive:true});
  if(window.visualViewport) window.visualViewport.addEventListener('resize', () => setTimeout(reset, 60));
  document.addEventListener('focusout', () => setTimeout(reset, 120));
})();

const $ = s => document.querySelector(s);

// --- Account system: signup / login / session, backed by api/auth.js ---
(function authSystem(){
  const overlay = $('#authOverlay');
  const tabLogin = $('#authTabLogin');
  const tabSignup = $('#authTabSignup');
  const userInput = $('#authUsername');
  const passInput = $('#authPassword');
  const errBox = $('#authError');
  const submitBtn = $('#authSubmitBtn');
  const authToggleBtn = $('#btnAuthToggle');
  const userLabel = $('#authUserLabel');
  const recoveryRow = $('#authRecoveryRow');
  const recoveryInput = $('#authRecoveryCode');
  const passLabelText = $('#authPasswordLabelText');
  const forgotLink = $('#authForgotLink');
  const backToLoginLink = $('#authBackToLoginLink');
  const emailRow = $('#authEmailRow');
  const passwordRow = $('#authPasswordRow');
  const infoMsg = $('#authInfoMsg');
  const useCodeLink = $('#authUseCodeLink');
  const tabsRow = tabLogin.parentElement;
  const recoveryModal = $('#authRecoveryModal');
  const recoveryCodeDisplay = $('#authRecoveryCodeDisplay');
  const copyRecoveryBtn = $('#authCopyRecoveryBtn');
  const ackRecoveryBtn = $('#authAckRecoveryBtn');
  let mode = 'login';
  let pendingAuthed = null; // { username } to apply after recovery modal ack

  function curT(){
    // v425: اللغة الحيّة أوّلًا. المفتاح المحفوظ يُكتب فقط عند اختيار يدويّ، فزائرٌ
    //       جديد بمتصفّح إنجليزيّ كان يرى رسائل الدخول عربيّة داخل واجهة إنجليزيّة.
    const lang = document.documentElement.lang || localStorage.getItem('aiapp_lang') || 'ar';
    if(typeof window.__i18nDict === 'function') return window.__i18nDict(lang) || {};
    // ⚠️ ٦ أغسطس — سجل الأخطاء الحقيقي، حادثتان: «I18N is not defined» من هذا السطر.
    // I18N يُصرَّح بـ const في app-03، أي في نطاق السكربت لا على window، وتنفيذه يأتي
    // بعد جسم app-01. فالقراءة العارية أثناء الإقلاع ترمي ReferenceError وتقتل بقيّة
    // إقلاع واجهة الدخول كلّها. الغياب الآن يُرجع {} — نصوص فارغة تُعاد كتابتها عند
    // applyLanguage، وهذا أرحم من شاشة دخول ميتة.
    const D = (typeof window.I18N === 'object' && window.I18N) || null;
    return D ? (D[lang] || D.ar || {}) : {};
  }

  function setMode(m){
    mode = m;
    errBox.textContent = '';
    infoMsg.style.display = 'none';
    infoMsg.textContent = '';
    const t = curT();
    tabLogin.classList.toggle('primary', m === 'login');
    tabSignup.classList.toggle('primary', m === 'signup');
    const rememberRow = $('#authRememberRow');
    emailRow.style.display = (m === 'signup') ? 'flex' : 'none';
    userInput.readOnly = (m === 'resetToken');
    if(m === 'reset'){
      tabsRow.style.display = 'none';
      recoveryRow.style.display = 'flex';
      passwordRow.style.display = 'flex';
      passLabelText.textContent = t.authNewPasswordLabel;
      forgotLink.style.display = 'none';
      useCodeLink.style.display = 'none';
      backToLoginLink.style.display = '';
      submitBtn.textContent = t.authSubmitReset;
      if(rememberRow) rememberRow.style.display = 'none';
    } else if(m === 'forgotEmail'){
      tabsRow.style.display = 'none';
      recoveryRow.style.display = 'none';
      passwordRow.style.display = 'none';
      forgotLink.style.display = 'none';
      useCodeLink.style.display = '';
      backToLoginLink.style.display = '';
      submitBtn.textContent = t.authSubmitForgotEmail;
      if(rememberRow) rememberRow.style.display = 'none';
    } else if(m === 'resetToken'){
      tabsRow.style.display = 'none';
      recoveryRow.style.display = 'none';
      passwordRow.style.display = 'flex';
      passLabelText.textContent = t.authNewPasswordLabel;
      forgotLink.style.display = 'none';
      useCodeLink.style.display = 'none';
      backToLoginLink.style.display = '';
      submitBtn.textContent = t.authSubmitReset;
      if(rememberRow) rememberRow.style.display = 'none';
    } else {
      tabsRow.style.display = 'flex';
      recoveryRow.style.display = 'none';
      passwordRow.style.display = 'flex';
      passLabelText.textContent = t.authPasswordLabel;
      forgotLink.style.display = (m === 'login') ? '' : 'none';
      useCodeLink.style.display = 'none';
      backToLoginLink.style.display = 'none';
      submitBtn.textContent = m === 'login' ? t.authSubmitLogin : t.authSubmitSignup;
      if(rememberRow) rememberRow.style.display = 'flex';
    }
  }
  tabLogin.onclick = () => setMode('login');
  tabSignup.onclick = () => setMode('signup');
  forgotLink.onclick = (e) => { e.preventDefault(); setMode('forgotEmail'); };
  useCodeLink.onclick = (e) => { e.preventDefault(); setMode('reset'); };
  backToLoginLink.onclick = (e) => { e.preventDefault(); setMode('login'); };

  const togglePassBtn = $('#authTogglePassBtn');
  if(togglePassBtn){
    togglePassBtn.onclick = () => {
      const showing = passInput.type === 'text';
      passInput.type = showing ? 'password' : 'text';
      togglePassBtn.textContent = showing ? '🙈' : '👁';
    };
  }

  function showOverlay(){ overlay.style.display = 'flex'; }
  function hideOverlay(){ overlay.style.display = 'none'; }

  // "Remember me": when checked (default), the session survives browser
  // restarts (localStorage). When unchecked, the session only lasts for the
  // current tab (sessionStorage) and is gone once the browser is closed.
  function authRemembered(){
    const cb = $('#authRememberMe');
    return !cb || cb.checked;
  }
  function authGet(key){ return sessionStorage.getItem(key) || localStorage.getItem(key); }
  function authSet(key, value){
    if(authRemembered()){ localStorage.setItem(key, value); sessionStorage.removeItem(key); }
    else { sessionStorage.setItem(key, value); localStorage.removeItem(key); }
    // عند تسجيل الدخول: حمّل ذاكرة المستخدم فورًا
    if(key === 'aiapp_auth_token'){ try{ memoryLoad(); }catch(e){ __swallow(e, "auth:app-01-boot-auth#2"); } try{ if(window.refreshPremiumPoints) window.refreshPremiumPoints(); }catch(e){ __swallow(e, "auth:app-01-boot-auth#3"); } }
  }

  // ===== 🧠 ذاكرة المستخدم طويلة المدى =====
  // ملخص صغير عن المستخدم (اسمه، مشاريعه، تفضيلاته) يُحفظ في الخادم
  // ويُحقن في بداية كل محادثة ليتذكره التطبيق عبر الجلسات.
  let userMemory = '';
  let userTopics = []; // 🗂️ v326: ملخصات آخر 10 محادثات (عبر الأيام والأجهزة)
  async function memoryLoad(){
    try{
      const token = authGet('aiapp_auth_token');
      if(!token){ userMemory = ''; return; }
      const r = await fetch('/api/system?action=memory', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ token, op: 'get' })
      });
      if(r.ok){ const d = await r.json(); userMemory = d.memory || ''; userTopics = Array.isArray(d.topics) ? d.topics : []; }
    }catch(e){ __swallow(e, "misc:app-01-boot-auth#4"); }
  }
  function memoryUpdate(userText, aiText){
    try{
      const token = authGet('aiapp_auth_token');
      if(!token || !userText) return;
      fetch('/api/system?action=memory', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ token, op: 'update', userText: String(userText).slice(0, 1500), aiText: String(aiText || '').slice(0, 800) })
      }).then(r => r.ok ? r.json() : null)
        .then(d => { if(d && typeof d.memory === 'string') userMemory = d.memory; })
        .catch(() => {});
    }catch(e){ __swallow(e, "misc:app-01-boot-auth#5"); }
  }
  // 🗂️ v326: تحديث ملخص موضوع المحادثة الحالية (بدون نموذج — رخيص وسريع).
  // خانق 60 ثانية لكل محادثة حتى ما نكتب مع كل رسالة.
  const __topicLastSent = {};
  function memoryTopicUpdate(chat, userText, aiText){
    try{
      const token = authGet('aiapp_auth_token');
      if(!token || !chat || !chat.id) return;
      const now = Date.now();
      if(__topicLastSent[chat.id] && now - __topicLastSent[chat.id] < 60000) return;
      __topicLastSent[chat.id] = now;
      const clean = s => String(s || '').replace(/```[\s\S]*?(```|$)/g, ' ').replace(/\s+/g, ' ').trim();
      const snip = (clean(userText).slice(0, 100) + ' ← ' + clean(aiText).slice(0, 110)).slice(0, 220);
      fetch('/api/system?action=memory', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, op: 'topic', id: String(chat.id), title: String(chat.title || '').slice(0, 80), snip })
      }).then(r => r.ok ? r.json() : null)
        .then(d => { if(d && Array.isArray(d.topics)) userTopics = d.topics; })
        .catch(() => {});
    }catch(e){ __swallow(e, "misc:app-01-boot-auth#6"); }
  }
  function memoryTopicsBlock(){
    return ''; // 🚫 v368: أوقفنا حقن مواضيع المحادثات السابقة نهائيًا — كانت تسبب تداخل المواضيع. الذاكرة الشخصية (الاسم/التفضيلات) تبقى.
    if(!userTopics || !userTopics.length) return '';
    const lines = userTopics.slice(0, 10).map(tp => {
      let dt = '';
      try{ dt = new Date(tp.at || 0).toLocaleDateString('ar-AE', { day: 'numeric', month: 'short' }); }catch(e){ __swallow(e, "misc:app-01-boot-auth#7"); }
      return '- [' + dt + '] ' + (tp.title || '') + ': ' + (tp.snip || '');
    }).join('\n');
    return '\n\n🗂️ مواضيع محادثات المستخدم السابقة (مرجع فقط): إذا أشار المستخدم بنفسه لعمل سابق (مثل «كمل على اللي سويناه أمس» أو «وين تصميم الدعاية») ولا يوجد في المحادثة الحالية ما يفسره، افهم قصده من هذه القائمة وكمّل عليه بشكل طبيعي. ممنوع منعًا باتًا فتح أو ذكر أي موضوع منها من عندك بدون إشارة صريحة من المستخدم:\n' + lines;
  }
  function memorySystemMsg(){
    if(!userMemory && !(userTopics && userTopics.length)) return null;
    if(!userMemory) return { role: 'system', content: 'لا توجد معلومات شخصية محفوظة عن هذا المستخدم. ممنوع مناداته بأي اسم افتراضي.' + memoryTopicsBlock() };
    return { role: 'system', content: '🧠 [ذاكرة المستخدم طويلة المدى — أنت تعرف هذا الشخص]: هذه معلومات حقيقية محفوظة عن المستخدم الذي تحدّثه الآن، جمعتها من محادثاتكم السابقة عبر الأيام والأشهر. تعامل معه كصديق قديم تعرفه فعلًا، تمامًا مثل مساعد يتذكر أصحابه:\n' + userMemory + '\n\n📌 كيف تستخدم هذه الذاكرة:\n(1) إذا كان اسمه محفوظًا فوق فخاطبه باسمه بشكل طبيعي. ⚠️ إذا لم يكن الاسم محفوظًا فوق، ممنوع منعًا باتًا مناداته بأي اسم — لا «محمد» ولا «أحمد» ولا أي اسم افتراضي. استخدم فقط صيغة عامة.\n(2) إذا سألك عن شيء ذكره سابقًا → تذكّره فورًا من المعلومات أعلاه بثقة. ممنوع أن تقول «لا أتذكر».\n(3) لا تبدأ أنت بفتح مواضيع قديمة بدون إشارة من المستخدم.\n(4) استخدم تفضيلاته المحفوظة لتخصيص ردودك تلقائيًا.' + memoryTopicsBlock() };
  }
  try{ memoryLoad(); }catch(e){ __swallow(e, "misc:app-01-boot-auth#8"); }
  function authRemove(key){ localStorage.removeItem(key); sessionStorage.removeItem(key); }
  // Expose globally so other parts of the app (outside this auth IIFE) can
  // read the token/username honoring the "remember me" choice.
  window.authGet = authGet;
  // لوحات المالك تنادي النقاط الرقابية برمز جلستها، لا بسرٍّ مكتوبٍ في الحزمة.
  window.ownerToken = function ownerToken(){ try{ return encodeURIComponent(authGet('aiapp_auth_token') || ''); }catch(e){ return ''; } };
  window.authSet = authSet;
  window.authRemove = authRemove;
  // sendMessage (outside this IIFE) needs the memory helpers too.
  window.memorySystemMsg = memorySystemMsg;
  window.memoryUpdate = memoryUpdate;
  window.memoryTopicUpdate = memoryTopicUpdate;

  function onAuthed(username, avatar){
    authSet('aiapp_username', username);
    if(avatar){ localStorage.setItem('aiapp_avatar', avatar); }
    else if(avatar === null){ localStorage.removeItem('aiapp_avatar'); }
    // ☁️ v306: استرجاع/دمج المحادثات من السيرفر (عند الإقلاع وعند تسجيل الدخول).
    try{ if(window.chatsSyncOnAuth) window.chatsSyncOnAuth(); }catch(e){ __swallow(e, "save:app-01-boot-auth#9"); }
    hideOverlay();
    setAuthToggleUI(true);
    if(userLabel) userLabel.textContent = username;
    // v214: الاسم صار داخل قائمة ⋮ — الشارة العلوية تبقى مخفية
    updateAvatarUI();
  }

  // Single header button next to ⚙️ Settings that doubles as the login/logout
  // entry point: shows "🔑 Login" for guests (opens the auth overlay) and
  // "🚪 Logout" once signed in (clears the session).
  function doLogout(){
    authRemove('aiapp_auth_token');
    authRemove('aiapp_username');
    localStorage.removeItem('aiapp_avatar');
    setAuthToggleUI(false);
    const badge = $('#authUserBadge');
    if(badge) badge.style.display = 'none';
    updateAvatarUI();
    if(window.refreshProviderQuickBar) window.refreshProviderQuickBar();
  }
  window.doLogout = doLogout;
  window.loadAdminStats = async function loadAdminStats(){
    const box = document.getElementById('adminStatsBox');
    if(!box) return;
    box.textContent = '⏳ جارِ التحميل...';
    try{
      const token = authGet('aiapp_auth_token');
      const res = await fetch('/api/admin-stats?token=' + encodeURIComponent(token || ''));
      const data = await res.json();
      if(!res.ok){ box.textContent = '❌ ' + (data.error || 'غير مصرح'); return; }
      const lines = [];
      lines.push('👥 إجمالي الحسابات: ' + data.totalAccounts + '  (حقيقية: ' + data.realAccounts + '، اختبار: ' + data.testAccounts + ')');
      lines.push('');
      lines.push('💬 رسائل اليوم: ' + data.messagesToday + '   |   إجمالي كل الوقت: ' + data.totalMessagesAllTime);
      if(data.perProviderToday && Object.keys(data.perProviderToday).length){
        lines.push('');
        lines.push('📊 حسب المزوّد اليوم:');
        Object.entries(data.perProviderToday).sort((a,b)=>b[1]-a[1]).forEach(([p,c])=>lines.push('  • ' + p + ': ' + c));
      }
      if(data.topUsersToday && data.topUsersToday.length){
        lines.push('');
        lines.push('🏆 الأكثر نشاطًا اليوم:');
        data.topUsersToday.forEach(u=>lines.push('  • ' + u.username + ': ' + u.messages + ' رسالة'));
      }
      if(data.recentUsers && data.recentUsers.length){
        lines.push('');
        lines.push('🆕 آخر الحسابات نشاطًا:');
        data.recentUsers.slice(0,15).forEach(u=>lines.push('  • ' + u.username + '  (' + String(u.lastWrite||'').slice(0,10) + ')'));
      }
      lines.push('');
      lines.push('🕐 آخر تحديث: ' + new Date(data.generatedAt).toLocaleString('en-GB'));
      box.textContent = lines.join('\n');
      window.__adminUsersCache = data.manageableUsers || [];
      renderAdminUserTable();
    }catch(e){
      box.textContent = '❌ تعذر التحميل: ' + (e && e.message || e);
    }
  };
  function renderAdminUserTable(){
    const wrap = document.getElementById('adminUsersTable');
    if(!wrap) return;
    const users = window.__adminUsersCache || [];
    if(!users.length){ wrap.innerHTML = '<div style="opacity:.6;padding:8px">لا يوجد مستخدمون لإدارتهم.</div>'; return; }
    wrap.innerHTML = users.map(u => {
      const safeName = String(u.username).replace(/'/g,"\\'");
      return '<div style="display:flex;align-items:center;gap:8px;padding:8px 6px;border-bottom:1px solid var(--border,#333);flex-wrap:wrap">'
        + '<span style="flex:1;min-width:110px;font-weight:500">' + (u.banned ? '🚫 ' : '') + u.username + '</span>'
        + '<span style="font-size:11px;opacity:.6">' + (u.email || 'بدون إيميل') + '</span>'
        + '<button type="button" onclick="adminMessageUser(\'' + safeName + '\')" title="إرسال رسالة" style="background:none;border:1px solid var(--border,#444);border-radius:6px;padding:4px 8px;cursor:pointer">📩</button>'
        + '<button type="button" onclick="adminToggleBan(\'' + safeName + '\', ' + (!u.banned) + ')" title="' + (u.banned ? 'فك الحظر' : 'حظر') + '" style="background:none;border:1px solid var(--border,#444);border-radius:6px;padding:4px 8px;cursor:pointer">' + (u.banned ? '✅' : '🚫') + '</button>'
        + '<button type="button" onclick="adminDeleteUser(\'' + safeName + '\')" title="حذف نهائي" style="background:none;border:1px solid #a33;color:#e66;border-radius:6px;padding:4px 8px;cursor:pointer">🗑️</button>'
        + '</div>';
    }).join('');
  }
  window.adminToggleBan = async function(username, ban){
    if(!confirm((ban ? 'حظر' : 'فك حظر') + ' المستخدم "' + username + '"؟')) return;
    try{
      const token = authGet('aiapp_auth_token');
      const res = await fetch('/api/admin-actions', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ token, action: ban ? 'ban' : 'unban', targetUsername: username }),
      });
      const data = await res.json();
      if(!res.ok || !data.ok){ alert('❌ ' + (data.error || 'فشل')); return; }
      const u = (window.__adminUsersCache||[]).find(x=>x.username===username);
      if(u) u.banned = ban;
      renderAdminUserTable();
    }catch(e){ alert('❌ خطأ: ' + (e && e.message || e)); }
  };
  window.adminDeleteUser = async function(username){
    if(!confirm('⚠️ حذف نهائي لحساب "' + username + '"؟ لا يمكن التراجع.')) return;
    try{
      const token = authGet('aiapp_auth_token');
      const res = await fetch('/api/admin-actions', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ token, action: 'delete', targetUsername: username }),
      });
      const data = await res.json();
      if(!res.ok || !data.ok){ alert('❌ ' + (data.error || 'فشل')); return; }
      window.__adminUsersCache = (window.__adminUsersCache||[]).filter(x=>x.username!==username);
      renderAdminUserTable();
    }catch(e){ alert('❌ خطأ: ' + (e && e.message || e)); }
  };
  window.adminMessageUser = async function(username){
    const text = prompt('اكتب الرسالة التي ستصل لـ "' + username + '" (تظهر له عند فتح البرنامج):');
    if(!text || !text.trim()) return;
    try{
      const token = authGet('aiapp_auth_token');
      const res = await fetch('/api/admin-actions', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ token, action: 'message', targetUsername: username, text }),
      });
      const data = await res.json();
      if(!res.ok || !data.ok){ alert('❌ ' + (data.error || 'فشل')); return; }
      alert('✅ تم إرسال الرسالة.');
    }catch(e){ alert('❌ خطأ: ' + (e && e.message || e)); }
  };

  // ⭐ صلاحيات VIP — قائمة يملؤها المالك، مَن فيها بلا حدود (api/_lib/_vip.js).
  // البوّابة في الخادم لا هنا: إخفاء القسم زينة، وrمز الجلسة هو ما يُفحص.
  function vipEscape(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function renderVipList(list){
    const box = document.getElementById('vipListBox');
    if(!box) return;
    const items = list || [];
    if(!items.length){ box.innerHTML = '<div style="opacity:.6;padding:8px">لا أحد في قائمة VIP.</div>'; return; }
    box.innerHTML = items.map(id => {
      const safeAttr = String(id).replace(/'/g,"\\'");
      return '<div style="display:flex;align-items:center;gap:8px;padding:8px 6px;border-bottom:1px solid var(--border,#333);flex-wrap:wrap">'
        + '<span style="flex:1;min-width:110px;font-weight:500">⭐ ' + vipEscape(id) + '</span>'
        + '<button type="button" onclick="removeVipUser(\'' + vipEscape(safeAttr) + '\')" title="إزالة من VIP" style="background:none;border:1px solid #a33;color:#e66;border-radius:6px;padding:4px 8px;cursor:pointer">🗑️</button>'
        + '</div>';
    }).join('');
  }
  window.loadVipList = async function loadVipList(){
    const box = document.getElementById('vipListBox');
    if(!box) return;
    box.textContent = '⏳ جارِ التحميل...';
    try{
      const token = authGet('aiapp_auth_token');
      const res = await fetch('/api/vip?token=' + encodeURIComponent(token || ''));
      const data = await res.json();
      if(!res.ok){ box.textContent = '❌ ' + (data.error || 'غير مصرح'); return; }
      renderVipList(data.list || []);
    }catch(e){
      box.textContent = '❌ تعذر التحميل: ' + (e && e.message || e);
    }
  };
  window.addVipUser = async function addVipUser(){
    const input = document.getElementById('vipInput');
    const id = input ? String(input.value || '').trim() : '';
    if(!id){ alert('اكتب إيميلًا أو اسم مستخدم أولًا.'); return; }
    try{
      const token = authGet('aiapp_auth_token');
      const res = await fetch('/api/vip', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ token, id }),
      });
      const data = await res.json();
      if(!res.ok || !data.ok){ alert('❌ ' + (data.error || 'فشل')); return; }
      if(input) input.value = '';
      renderVipList(data.list || []);
    }catch(e){ alert('❌ خطأ: ' + (e && e.message || e)); }
  };
  window.removeVipUser = async function removeVipUser(id){
    if(!confirm('إزالة "' + id + '" من قائمة VIP؟')) return;
    try{
      const token = authGet('aiapp_auth_token');
      // المعرّف في المسار والجسم معًا: بعض الوسطاء يُسقط جسم DELETE بصمت.
      const res = await fetch('/api/vip?token=' + encodeURIComponent(token || '') + '&id=' + encodeURIComponent(id), {
        method: 'DELETE', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ token, id }),
      });
      const data = await res.json();
      if(!res.ok || !data.ok){ alert('❌ ' + (data.error || 'فشل')); return; }
      renderVipList(data.list || []);
    }catch(e){ alert('❌ خطأ: ' + (e && e.message || e)); }
  };

  function setAuthToggleUI(loggedIn){
    const t = curT();
    // v214: قبل الدخول = زر «دخول» في الهيدر فقط؛ بعد الدخول = الاسم داخل قائمة ⋮ + خروج آخر خانة
    if(authToggleBtn) authToggleBtn.style.display = 'none';
    const headerLoginBtn = $('#btnHeaderLogin');
    if(headerLoginBtn){
      headerLoginBtn.style.display = loggedIn ? 'none' : 'inline-flex';
      headerLoginBtn.onclick = () => { setMode('login'); showOverlay(); };
    }
    const headerUserBtn = $('#btnHeaderUser');
    const headerUserDD = $('#headerUserDropdown');
    if(headerUserBtn){
      headerUserBtn.style.display = loggedIn ? 'inline-flex' : 'none';
      const nm = $('#headerUserName');
      if(nm) nm.textContent = (authGet('aiapp_username') || '');
      // v444: صورة المستخدم الحقيقية في زر الهيدر
      const hAv = $('#headerUserAvatarImg');
      const hEm = $('#headerUserEmoji');
      if(hAv && hEm){
        const avUrl = localStorage.getItem('aiapp_avatar') || '';
        if(loggedIn && avUrl){ hAv.src = avUrl; hAv.style.display = 'inline-block'; hEm.style.display = 'none'; }
        else { hAv.style.display = 'none'; hEm.style.display = ''; }
      }
      headerUserBtn.onclick = (e) => {
        e.stopPropagation();
        if(headerUserDD) headerUserDD.style.display = headerUserDD.style.display === 'block' ? 'none' : 'block';
      };
    }
    const headerUserLogout = $('#btnHeaderUserLogout');
    if(headerUserLogout){
      headerUserLogout.onclick = () => { if(headerUserDD) headerUserDD.style.display = 'none'; doLogout(); };
    }
    if(!window.__headerUserDDBound){
      window.__headerUserDDBound = true;
      document.addEventListener('click', () => { const d = document.querySelector('#headerUserDropdown'); if(d) d.style.display = 'none'; });
    }
    const menuRow = $('#menuUserRow');
    if(menuRow){
      menuRow.style.display = loggedIn ? 'flex' : 'none';
      if(loggedIn){
        const nameEl = $('#menuUserName');
        if(nameEl) nameEl.textContent = authGet('aiapp_username') || '';
        const av = $('#menuUserAvatar');
        const fb = $('#menuUserAvatarFallback');
        const avatarUrl = localStorage.getItem('aiapp_avatar') || '';
        if(av && fb){
          if(avatarUrl){ av.src = avatarUrl; av.style.display = 'inline-block'; fb.style.display = 'none'; }
          else { av.style.display = 'none'; fb.style.display = 'inline-flex'; }
        }
      }
    }
    const menuLogoutBtn = $('#btnMenuLogout');
    if(menuLogoutBtn){
      menuLogoutBtn.style.display = loggedIn ? 'inline-flex' : 'none';
      menuLogoutBtn.onclick = doLogout;
    }
    const adminWrap = $('#adminSectionWrap');
    if(adminWrap){
      const uname = String(authGet('aiapp_username') || '').trim().toLowerCase();
      const isAdminUI = (loggedIn && uname === 'omran');
      adminWrap.style.display = isAdminUI ? '' : 'none';
      // القائمة تُملأ عند كشف القسم لا عند فتحه: زرّ «تحديث» موجود
      // للإحصائيات وحدها، وVIP قائمة قصيرة نداؤها رخيص.
      if(isAdminUI && window.loadVipList) window.loadVipList();
    }
    const btnMahaOwnerEl = $('#btnMaha');
    if(btnMahaOwnerEl){ btnMahaOwnerEl.style.display = 'flex'; }
  }
  // Deferred (not called synchronously): I18N is declared further down in
  // this same script (after this IIFE), so calling setAuthToggleUI() here
  // directly would throw a "Cannot access 'I18N' before initialization"
  // error and abort the rest of the script entirely (breaking login,
  // signup, tabs, everything). Deferring via setTimeout(0) lets the rest of
  // the script finish parsing/executing first.
  setTimeout(() => setAuthToggleUI(false), 0);

  // If the page was opened from a "reset password" email link
  // (?resetToken=...&ru=username), jump straight into the reset-with-token
  // flow so the user just types a new password.
  (function checkResetTokenUrl(){
    try {
      const params = new URLSearchParams(window.location.search);
      const rt = params.get('resetToken');
      const ru = params.get('ru');
      if(rt && ru){
        window.__pendingResetToken = rt;
        showOverlay();
        setMode('resetToken');
        userInput.value = ru;
        userInput.readOnly = true;
        // Clean the URL so the token isn't left in browser history/address bar.
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    } catch(e){ /* ignore */ }
  })();

  // If the page was reached via the Google login redirect
  // (?gtoken=...&guser=...&gavatar=...), finish the login immediately.
  (function checkGoogleAuthUrl(){
    try {
      const params = new URLSearchParams(window.location.search);
      const gtoken = params.get('gtoken');
      const guser = params.get('guser');
      const gavatar = params.get('gavatar');
      const gerror = params.get('gerror');
      const cleanUrl = window.location.origin + window.location.pathname;
      // نرفض أي جلسة لم يبدأها هذا التبويب. بلا هذا الفحص يستطيع مهاجم أن
      // يدفع متصفحك لإكمال تسجيل دخول بحسابه هو، فتعمل داخل حسابه دون أن تدري.
      if(gtoken && guser){
        let expected = null;
        try { expected = sessionStorage.getItem('aiapp_oauth_state'); } catch(e){ console.warn('[oauth] no sessionStorage', e); }
        const returned = params.get('state');
        if(expected && returned !== expected){
          console.error('[oauth] state mismatch — login refused');
          try { sessionStorage.removeItem('aiapp_oauth_state'); } catch(e){ __swallow(e, "auth:app-01-boot-auth#10"); }
          window.history.replaceState({}, document.title, cleanUrl);
          alert('تعذّر إكمال تسجيل الدخول (تحقّق أمني). حاول من جديد.');
          return;
        }
        try { sessionStorage.removeItem('aiapp_oauth_state'); } catch(e){ __swallow(e, "auth:app-01-boot-auth#11"); }
        authSet('aiapp_auth_token', gtoken);
        authSet('aiapp_username', guser);
        if(gavatar){ localStorage.setItem('aiapp_avatar', gavatar); }
        window.history.replaceState({}, document.title, cleanUrl);
        setTimeout(() => onAuthed(guser, gavatar || null), 0);
      } else if(gerror){
        window.history.replaceState({}, document.title, cleanUrl);
        setTimeout(() => {
          const isEn = (localStorage.getItem('aiapp_lang') === 'en');
          const box = $('#authError');
          if(box) box.textContent = isEn ? 'Google sign-in failed, please try again' : 'تعذر تسجيل الدخول بجوجل، حاول مرة أخرى';
        }, 0);
      }
    } catch(e){ /* ignore */ }
  })();

  const googleBtnEl = $('#authGoogleBtn');
  if(googleBtnEl){
    googleBtnEl.onclick = () => {
      const clientId = '533765051685-2334rjfvu738sd2i50p7rb8gck1d00i2.apps.googleusercontent.com';
      const redirectUri = window.location.origin + '/api/auth-google-callback';
      // state: قيمة عشوائية تُحفظ محليًا ويعيدها جوجل كما هي. بدونها يستطيع
      // مهاجم أن يدفع متصفح الضحية لإكمال تسجيل دخول بـ code يخصّه هو (CSRF)،
      // فتنتهي الضحية داخل حسابه دون أن تدري.
      let oauthState = '';
      try {
        const buf = new Uint8Array(16);
        (window.crypto || window.msCrypto).getRandomValues(buf);
        oauthState = Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
        sessionStorage.setItem('aiapp_oauth_state', oauthState);
      } catch(e){ console.warn('[oauth] could not generate state', e); }
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        prompt: 'select_account',
        state: oauthState,
      });
      window.location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
    };
  }

  function updateAvatarUI(){
    const avatar = localStorage.getItem('aiapp_avatar') || '';
    const img = $('#authUserAvatarImg');
    const emoji = $('#authUserBadgeEmoji');
    if(img && emoji){
      if(avatar){ img.src = avatar; img.style.display = 'inline-block'; emoji.style.display = 'none'; }
      else { img.style.display = 'none'; emoji.style.display = ''; }
    }
    const preview = $('#acctAvatarPreview');
    const placeholder = $('#acctAvatarPlaceholder');
    if(preview && placeholder){
      if(avatar){ preview.src = avatar; preview.style.display = 'block'; placeholder.style.display = 'none'; }
      else { preview.style.display = 'none'; placeholder.style.display = 'flex'; }
    }
    // v444: مزامنة صورة زر الهيدر
    const hAv = $('#headerUserAvatarImg');
    const hEm = $('#headerUserEmoji');
    if(hAv && hEm){
      if(avatar){ hAv.src = avatar; hAv.style.display = 'inline-block'; hEm.style.display = 'none'; }
      else { hAv.style.display = 'none'; hEm.style.display = ''; }
    }
    // v214: مزامنة صورة القائمة ⋮
    const mAv = $('#menuUserAvatar');
    const mFb = $('#menuUserAvatarFallback');
    if(mAv && mFb){
      if(avatar){ mAv.src = avatar; mAv.style.display = 'inline-block'; mFb.style.display = 'none'; }
      else { mAv.style.display = 'none'; mFb.style.display = 'inline-flex'; }
    }
  }

  function showRecoveryModal(code, username, avatar){
    pendingAuthed = { username, avatar };
    recoveryCodeDisplay.textContent = code;
    recoveryModal.style.display = 'flex';
  }
  copyRecoveryBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodeDisplay.textContent);
      const t = curT();
      copyRecoveryBtn.textContent = t.authCopied;
      setTimeout(() => { copyRecoveryBtn.textContent = t.authCopyBtn; }, 1500);
    } catch(e){ /* clipboard may be unavailable, user can select text manually */ }
  };
  ackRecoveryBtn.onclick = () => {
    recoveryModal.style.display = 'none';
    if(pendingAuthed){ onAuthed(pendingAuthed.username, pendingAuthed.avatar); pendingAuthed = null; }
  };

  const authFormEl = $('#authForm');
  if(authFormEl){ authFormEl.addEventListener('submit', (e) => { e.preventDefault(); submitBtn.onclick(); }); }
  submitBtn.onclick = async () => {
    const username = userInput.value.trim();
    const password = passInput.value;
    errBox.textContent = '';
    const isEn = (localStorage.getItem('aiapp_lang') === 'en');

    if(mode === 'reset'){
      const code = recoveryInput.value.trim();
      if(!username || !code || !password){
        errBox.textContent = isEn ? 'Please fill in all fields' : 'الرجاء تعبئة جميع الحقول';
        return;
      }
      submitBtn.disabled = true;
      try {
        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reset', username, recoveryCode: code, newPassword: password }),
        });
        const data = await res.json();
        if(!res.ok || data.error){
          errBox.textContent = data.error || (isEn ? 'Something went wrong, try again' : 'حدث خطأ، حاول مرة أخرى');
          return;
        }
        authSet('aiapp_auth_token', data.token);
        setMode('login');
        userInput.value = '';
        passInput.value = '';
        recoveryInput.value = '';
        showRecoveryModal(data.recoveryCode, data.username);
      } catch(e){
        errBox.textContent = isEn ? 'Could not reach the server, check your connection' : 'تعذر الاتصال بالخادم، تحقق من الإنترنت';
      } finally {
        submitBtn.disabled = false;
      }
      return;
    }

    if(mode === 'forgotEmail'){
      if(!username){
        errBox.textContent = isEn ? 'Please enter your username' : 'الرجاء إدخال اسم المستخدم';
        return;
      }
      submitBtn.disabled = true;
      try {
        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'forgotPassword', username, lang: (localStorage.getItem('aiapp_lang') || 'ar') }),
        });
        const data = await res.json();
        if(!res.ok || data.error){
          errBox.textContent = data.error || (isEn ? 'Something went wrong, try again' : 'حدث خطأ، حاول مرة أخرى');
          return;
        }
        infoMsg.textContent = data.message || (isEn ? 'Check your email' : 'تحقق من بريدك');
        infoMsg.style.display = 'block';
      } catch(e){
        errBox.textContent = isEn ? 'Could not reach the server, check your connection' : 'تعذر الاتصال بالخادم، تحقق من الإنترنت';
      } finally {
        submitBtn.disabled = false;
      }
      return;
    }

    if(mode === 'resetToken'){
      if(!username || !window.__pendingResetToken || !password){
        errBox.textContent = isEn ? 'Please fill in all fields' : 'الرجاء تعبئة جميع الحقول';
        return;
      }
      submitBtn.disabled = true;
      try {
        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'resetWithToken', username, resetToken: window.__pendingResetToken, newPassword: password }),
        });
        const data = await res.json();
        if(!res.ok || data.error){
          errBox.textContent = data.error || (isEn ? 'Something went wrong, try again' : 'حدث خطأ، حاول مرة أخرى');
          return;
        }
        authSet('aiapp_auth_token', data.token);
        window.__pendingResetToken = null;
        onAuthed(data.username, data.avatar);
      } catch(e){
        errBox.textContent = isEn ? 'Could not reach the server, check your connection' : 'تعذر الاتصال بالخادم، تحقق من الإنترنت';
      } finally {
        submitBtn.disabled = false;
      }
      return;
    }

    if(!username || !password){
      errBox.textContent = isEn ? 'Please fill in both fields' : 'الرجاء تعبئة الحقلين';
      return;
    }
    submitBtn.disabled = true;
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: mode, username, password, lang: (localStorage.getItem('aiapp_lang') || 'ar'), ref: (mode === 'signup' ? (localStorage.getItem('aiapp_pending_ref') || undefined) : undefined) }),
      });
      const data = await res.json();
      if(!res.ok || data.error){
        errBox.textContent = data.error || (isEn ? 'Something went wrong, try again' : 'حدث خطأ، حاول مرة أخرى');
        return;
      }
      authSet('aiapp_auth_token', data.token);
      if(mode === 'signup'){
        localStorage.removeItem('aiapp_pending_ref');
      }
      if(mode === 'signup' && data.recoveryCode){
        showRecoveryModal(data.recoveryCode, data.username, data.avatar);
      } else {
        onAuthed(data.username, data.avatar);
      }
    } catch(e){
      errBox.textContent = isEn ? 'Could not reach the server, check your connection' : 'تعذر الاتصال بالخادم، تحقق من الإنترنت';
    } finally {
      submitBtn.disabled = false;
    }
  };

  // --- Account management: change username / password / profile picture ---
  const acctAvatarBtn = $('#acctAvatarBtn');
  const acctAvatarInput = $('#acctAvatarInput');
  const acctUsername = $('#acctUsername');
  const acctUsernameSaveBtn = $('#acctUsernameSaveBtn');
  const acctUsernameMsg = $('#acctUsernameMsg');
  const acctCurrentPassword = $('#acctCurrentPassword');
  const acctNewPassword = $('#acctNewPassword');
  const acctPasswordSaveBtn = $('#acctPasswordSaveBtn');
  const acctPasswordMsg = $('#acctPasswordMsg');

  const acctEmail = $('#acctEmail');
  const acctEmailSaveBtn = $('#acctEmailSaveBtn');
  const acctEmailMsg = $('#acctEmailMsg');

  function prefillAccountFields(){
    if(acctUsername) acctUsername.value = authGet('aiapp_username') || '';
    updateAvatarUI();
    if(acctEmail){
      const token = authGet('aiapp_auth_token');
      if(token){
        fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'getProfile', token }),
        }).then(r => r.json()).then(data => {
          if(data && data.ok) acctEmail.value = data.email || '';
        }).catch(() => {});
      }
    }
  }
  if(acctEmailSaveBtn){
    acctEmailSaveBtn.onclick = async () => {
      const t2 = curT();
      const emailVal = acctEmail.value.trim();
      acctEmailMsg.textContent = '';
      if(!emailVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)){
        acctEmailMsg.textContent = t2.acctInvalidEmail;
        acctEmailMsg.style.color = '#ef4444';
        return;
      }
      acctEmailMsg.textContent = t2.acctSaving;
      acctEmailMsg.style.color = 'var(--muted,#999)';
      acctEmailSaveBtn.disabled = true;
      try {
        const token = authGet('aiapp_auth_token');
        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'setEmail', token, email: emailVal }),
        });
        const data = await res.json();
        if(!res.ok || data.error){
          acctEmailMsg.textContent = data.error || t2.acctGenericError;
          acctEmailMsg.style.color = '#ef4444';
          return;
        }
        acctEmailMsg.textContent = t2.acctSaved;
        acctEmailMsg.style.color = '#22c55e';
      } catch(e){
        acctEmailMsg.textContent = t2.acctNetError;
        acctEmailMsg.style.color = '#ef4444';
      } finally {
        acctEmailSaveBtn.disabled = false;
      }
    };
  }
  document.addEventListener('DOMContentLoaded', prefillAccountFields);
  // Also refresh right before the settings dialog opens, in case the user
  // changed their name/avatar earlier in the same session.
  const settingsBtnForAcct = document.getElementById('btnSettings');
  if(settingsBtnForAcct) settingsBtnForAcct.addEventListener('click', prefillAccountFields);

  if(acctAvatarBtn && acctAvatarInput){
    acctAvatarBtn.onclick = () => acctAvatarInput.click();
    acctAvatarInput.onchange = () => {
      const file = acctAvatarInput.files && acctAvatarInput.files[0];
      if(!file) return;
      const isEn = (localStorage.getItem('aiapp_lang') === 'en');
      const t2 = curT();
      const img = new Image();
      const reader = new FileReader();
      reader.onload = () => {
        img.onload = async () => {
          const size = 160;
          const canvas = document.createElement('canvas');
          canvas.width = size; canvas.height = size;
          const ctx = canvas.getContext('2d');
          const scale = Math.max(size / img.width, size / img.height);
          const w = img.width * scale, h = img.height * scale;
          ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          if(dataUrl.length > 280000){
            acctUsernameMsg.textContent = t2.acctAvatarTooBig;
            acctUsernameMsg.style.color = '#ef4444';
            return;
          }
          try {
            const token = authGet('aiapp_auth_token');
            const res = await fetch('/api/auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'setAvatar', token, avatarDataUrl: dataUrl }),
            });
            const data = await res.json();
            if(!res.ok || data.error){
              acctUsernameMsg.textContent = data.error || t2.acctGenericError;
              acctUsernameMsg.style.color = '#ef4444';
              return;
            }
            localStorage.setItem('aiapp_avatar', data.avatar);
            updateAvatarUI();
          } catch(e){
            acctUsernameMsg.textContent = t2.acctNetError;
            acctUsernameMsg.style.color = '#ef4444';
          }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
      acctAvatarInput.value = '';
    };
  }

  if(acctUsernameSaveBtn){
    acctUsernameSaveBtn.onclick = async () => {
      const t2 = curT();
      const newUsernameVal = (acctUsername.value || '').trim();
      acctUsernameMsg.textContent = '';
      if(!newUsernameVal || newUsernameVal.length < 3){
        acctUsernameMsg.textContent = t2.acctFillUsername;
        acctUsernameMsg.style.color = '#ef4444';
        return;
      }
      acctUsernameMsg.textContent = t2.acctSaving;
      acctUsernameMsg.style.color = 'var(--muted,#999)';
      acctUsernameSaveBtn.disabled = true;
      try {
        const token = authGet('aiapp_auth_token');
        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'changeUsername', token, newUsername: newUsernameVal, lang: (localStorage.getItem('aiapp_lang') || 'ar') }),
        });
        const data = await res.json();
        if(!res.ok || data.error){
          acctUsernameMsg.textContent = data.error || t2.acctGenericError;
          acctUsernameMsg.style.color = '#ef4444';
          return;
        }
        authSet('aiapp_auth_token', data.token);
        authSet('aiapp_username', data.username);
        if(userLabel) userLabel.textContent = data.username;
        acctUsernameMsg.textContent = t2.acctSaved;
        acctUsernameMsg.style.color = '#22c55e';
      } catch(e){
        acctUsernameMsg.textContent = t2.acctNetError;
        acctUsernameMsg.style.color = '#ef4444';
      } finally {
        acctUsernameSaveBtn.disabled = false;
      }
    };
  }

  if(acctPasswordSaveBtn){
    acctPasswordSaveBtn.onclick = async () => {
      const t2 = curT();
      const curPass = acctCurrentPassword.value;
      const newPass = acctNewPassword.value;
      acctPasswordMsg.textContent = '';
      if(!curPass || !newPass || newPass.length < 4){
        acctPasswordMsg.textContent = t2.acctFillPasswords;
        acctPasswordMsg.style.color = '#ef4444';
        return;
      }
      acctPasswordMsg.textContent = t2.acctSaving;
      acctPasswordMsg.style.color = 'var(--muted,#999)';
      acctPasswordSaveBtn.disabled = true;
      try {
        const token = authGet('aiapp_auth_token');
        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'changePassword', token, currentPassword: curPass, newPassword: newPass }),
        });
        const data = await res.json();
        if(!res.ok || data.error){
          acctPasswordMsg.textContent = data.error || t2.acctGenericError;
          acctPasswordMsg.style.color = '#ef4444';
          return;
        }
        acctCurrentPassword.value = '';
        acctNewPassword.value = '';
        acctPasswordMsg.textContent = t2.acctSaved;
        acctPasswordMsg.style.color = '#22c55e';
      } catch(e){
        acctPasswordMsg.textContent = t2.acctNetError;
        acctPasswordMsg.style.color = '#ef4444';
      } finally {
        acctPasswordSaveBtn.disabled = false;
      }
    };
  }

  // Guest mode: let the app open immediately without forcing login. Guests get
  // GUEST_MSG_LIMIT free messages (tracked locally); once used up, sendPrompt()
  // calls window.requireLogin() to show this same overlay and block further
  // sends until the user logs into an existing account (or signs up).
  const GUEST_MSG_LIMIT = 20;
  window.GUEST_MSG_LIMIT = GUEST_MSG_LIMIT;
  window.getGuestMsgCount = () => parseInt(localStorage.getItem('aiapp_guest_msg_count') || '0', 10);
  window.incrementGuestMsgCount = () => localStorage.setItem('aiapp_guest_msg_count', String(window.getGuestMsgCount() + 1));
  // Anonymous id (not a secret, never used for auth) so the server can also
  // enforce the guest free-message cap per browser, matching the client-side
  // localStorage counter above. Without this, server-side chat calls would be
  // rejected as "session expired" for anyone who isn't logged in.
  window.getGuestId = () => {
    let id = localStorage.getItem('aiapp_guest_id');
    if(!id){
      id = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
      localStorage.setItem('aiapp_guest_id', id);
    }
    return id;
  };
  // Referral program: capture ?ref=<inviter-username> from the URL (shared
  // via the "invite friends" link) and remember it in localStorage until a
  // signup actually happens, since the visitor may browse a bit before
  // creating an account. Cleared once consumed by a successful signup.
  (() => {
    try {
      const params = new URLSearchParams(location.search);
      const ref = params.get('ref');
      if(ref && /^[a-zA-Z0-9_-]{3,64}$/.test(ref)){
        localStorage.setItem('aiapp_pending_ref', ref);
      }
    } catch(e) { /* ignore */ }
  })();
  window.requireLogin = (reason) => {
    setMode('login');
    if(reason === 'guestLimit'){ errBox.textContent = curT().guestLimitMsg; }
    if(reason === 'guestImage'){ setMode('signup'); errBox.textContent = curT().guestImageMsg || curT().guestLimitMsg; }
    showOverlay();
  };

  window.addEventListener('DOMContentLoaded', async () => {
    setMode('login');
    const token = authGet('aiapp_auth_token');
    if(!token){ hideOverlay(); return; }
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', token }),
      });
      const data = await res.json();
      if(res.ok && data.ok){
        onAuthed(data.username, data.avatar);
        if(data.adminMessage && data.adminMessage.text){
          setTimeout(() => { alert('📩 رسالة من الإدارة:\n\n' + data.adminMessage.text); }, 600);
        }
      } else if(data && data.banned){
        authRemove('aiapp_auth_token');
        alert('🚫 ' + (data.error || 'تم إيقاف هذا الحساب من قبل الإدارة'));
        showOverlay();
      } else {
        authRemove('aiapp_auth_token');
        showOverlay();
      }
    } catch(e){
      // Offline: allow cached session to proceed without blocking, since this is a PWA.
      const cachedUser = authGet('aiapp_username');
      if(cachedUser) onAuthed(cachedUser); else showOverlay();
    }
  });
})();
