/* v-plans-gate (طلب المالك ٦ أكتوبر: «انتهاء الخدمة ولا تجديد ولا انتهاء النقاط تحوّله إلى الاشتراك» — عُرضت الفكرة
   فقال «أبدأ بالكلّ»): كانت كلّ ميزة تتصرّف وحدها عند الجدار — الصور تكتب «افتح الإعدادات ← الباقات»، الفيديو
   والاستوديوهات «جرّب بكرة»، مها وحدها تفتح الباقات، وانتهاء الاشتراك يمرّ بصمت. هنا مسار واحد:
   ١) omranOpenPlans(سبب، قسم): الضيف ← شاشة التسجيل؛ المسجَّل ← الإعدادات ← «الباقات والنقاط» على قسمه وفوقه سطر
      السبب (الصور والفيديو قسم واحد «صور وفيديو» منذ v-media-merge). فتح واحد لكلّ محاولة مهما تعدّدت مساراتها (حارس ٨ ثوانٍ).
   ٢) التفاف fetch (نمط media-notify.js): ردّ 402/403 من خادمنا برمز جدار الوسائط والاستوديوهات — points_insufficient ·
      daily_limit_reached — يفتح الباقات لأيّ ميزة بلا لمس ملفّاتها. المحادثة تفتحها من نهاية مسارها (app-09). عطل
      المزوّد عندنا (رصيده، الشبكة) لا يحمل هذه الرموز، فلا يُحوَّل أحد للاشتراك بذنب ليس ذنبه.
   ٣) ردّ الرصيد (/api/points) يحمل subs: تنبيه مرّة قبل انتهاء الاشتراك بثلاثة أيّام ومرّة بعد انتهائه، بزرّ «جدّد». */
(function(){
  var GUARD_MS = 8000, NOTICE_DAYS = 3, DAY_MS = 86400000, lastOpen = 0, noticeShown = false;
  var WHY = { points: 'plansWhyPoints', limit: 'plansWhyLimit', expired: 'plansWhyExpired', expiring: 'plansWhyExpiring' };
  /* رموز الوسائط والاستوديوهات وحدها: طلب واحد ونتيجته نهائيّة. حدّ المحادثة (subscribeOnly · engine_limit ·
     insufficient_points) لا يُلتقط هنا — مسارها يجرّب مزوّدًا بعد مزوّد وقد يجيب التالي، فتفتح الباقات من نهايتها
     (err.planLimit · free-limit · premiumNoPoints) لا من أوّل 402. */
  var CODES = { points_insufficient: 'points', daily_limit_reached: 'limit' };
  // v-media-merge: الصور والفيديو قسم واحد «صور وفيديو» — باقتهما القديمة والمدموجة (mix) تفتحانه.
  var TAB_OF_KIND = { chat: 'chat', mix: 'media', image: 'media', video: 'media', maha: 'maha' };
  var PLAN_NAME = { basic: 'Plus', pro: 'Pro', max: 'Max' };
  var KIND_ORDER = ['chat', 'mix', 'image', 'video', 'maha'];

  function loggedIn(){ try{ return !!authGet('aiapp_auth_token'); }catch(e){ return false; } }
  function fill(s, vars){
    var out = String(s || '');
    Object.keys(vars || {}).forEach(function(k){ out = out.split('{' + k + '}').join(String(vars[k])); });
    return out;
  }
  function whyText(reason, vars){ return fill(t(WHY[reason] || WHY.points), vars); }

  // سطر السبب فوق أقسام الباقات — يُنشأ عند أوّل حاجة، فلا يلمس الجزء المحمّل partials-settings.js.
  function showWhy(text){
    var sec = document.getElementById('pricingSection');
    if(!sec) return;
    var el = document.getElementById('plansWhy');
    if(!el){
      if(!text) return;
      el = document.createElement('div');
      el.id = 'plansWhy';
      el.setAttribute('role', 'status');
      el.style.cssText = 'margin:0 0 12px; padding:10px 12px; border-radius:12px; border:1px solid rgba(201,162,39,.45);'
        + ' background:rgba(201,162,39,.10); color:var(--text); font-size:13px; line-height:1.7;';
      var tabs = document.getElementById('priceTabs');
      if(tabs && tabs.parentNode) tabs.parentNode.insertBefore(el, tabs); else sec.appendChild(el);
    }
    el.textContent = text || '';
    el.style.display = text ? '' : 'none';
  }

  function openPlans(reason, tab, vars){
    var now = Date.now();
    if(now - lastOpen < GUARD_MS) return false;
    lastOpen = now;
    if(!loggedIn()){
      try{ if(typeof window.requireLogin === 'function') window.requireLogin('guestLimit'); }catch(e){ __swallow(e, 'plans-gate:login'); }
      return true;
    }
    try{
      var sb = document.getElementById('btnSettings');
      if(sb) sb.click();
      if(typeof showSettingsPage === 'function') showSettingsPage('pricingSection');
      if(tab && typeof showPriceTab === 'function') showPriceTab(tab);
      showWhy(whyText(reason, vars));
    }catch(e){ __swallow(e, 'plans-gate:open'); }
    return true;
  }

  // السطر يخصّ هذا الفتح وحده: فتح الإعدادات باليد (الزرّ يُنقر قبل أن نكتب السطر) أو إغلاقها يمسحه، فلا يظهر قديمًا.
  try{
    var sbtn = document.getElementById('btnSettings');
    if(sbtn) sbtn.addEventListener('click', function(){ showWhy(''); }, true);
    var dlg = document.getElementById('settingsDialog');
    if(dlg) dlg.addEventListener('close', function(){ showWhy(''); });
  }catch(e){ __swallow(e, 'plans-gate:wire'); }

  function tabFor(url, reason){
    if(/realtime-session/.test(url)) return 'maha';
    if(/video-watch/.test(url)) return 'pts'; // تحليل الفيديو بالنقاط وحدها (ليس في جدول الوسائط)
    if(/\/api\/video/.test(url) || /maha-image|upscale/.test(url)) return 'media'; // v-media-merge
    return reason === 'points' ? 'pts' : 'chat';
  }
  // ردّ جدار من خادمنا ← {reason, tab}؛ وإلّا null (عطل مزوّد، دفع لم يكتمل، ضيف استهلك صوره — لكلّ منها مساره).
  function classify(url, status, d){
    if(!(status === 402 || status === 403) || !d || typeof d !== 'object') return null;
    var reason = CODES[String(d.error || '')] || '';
    return reason ? { reason: reason, tab: tabFor(url, reason) } : null;
  }
  function ourApi(url){
    try{ var u = new URL(url, location.href); return u.origin === location.origin && u.pathname.indexOf('/api/') === 0; }
    catch(e){ return false; }
  }

  function subLabel(s){
    if(s.kind === 'chat') return PLAN_NAME[s.plan] || String(s.plan || '');
    var key = { mix: 'priceTabMedia', image: 'priceTabImg', video: 'priceTabVid', maha: 'priceTabMaha' }[s.kind];
    var lbl = key ? t(key) : String(s.plan || '');
    try{ if(typeof stripUiEmoji === 'function') lbl = stripUiEmoji(lbl); }catch(e){ __swallow(e, 'plans-gate:label'); }
    return lbl;
  }
  function fmtDate(ms){
    try{ return new Date(ms).toLocaleDateString(lang || 'ar', { day: 'numeric', month: 'long' }); }
    catch(e){ return new Date(ms).toISOString().slice(0, 10); }
  }
  function seenKey(s, state){ return 'omran_sub_notice_' + s.kind + '_' + state + '_' + s.endsAt; }
  function seen(k){ try{ return localStorage.getItem(k) === '1'; }catch(e){ return false; } }
  function markSeen(k){ try{ localStorage.setItem(k, '1'); }catch(e){ __swallow(e, 'plans-gate:seen'); } }

  // انتهى (خسر مزاياه الآن) قبل «قارب»؛ وباقة المحادثة قبل الوسائط. كلّ حالة لكلّ فترة اشتراك مرّة واحدة.
  function pickNotice(subs, now){
    /* v-media-merge: المدموجة السارية تغطّي الصور والفيديو — انتهاء باقتهما القديمة ليس خسارة مزايا، و«جدّد» كان يبيعه
       المدموجة التي يملكها فيصفّر رصيدها (الشراء يعيد الملء ولا يُرحَّل). */
    var arr = Array.isArray(subs) ? subs : [];
    var mixOn = arr.some(function(s){ return s && s.kind === 'mix' && s.active; });
    var list = arr.filter(function(s){ return s && TAB_OF_KIND[s.kind] && Number(s.endsAt) > 0 && !(mixOn && (s.kind === 'image' || s.kind === 'video')); })
      .sort(function(a, b){ return KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind); });
    var i;
    for(i = 0; i < list.length; i++) if(!list[i].active && !seen(seenKey(list[i], 'expired'))) return { s: list[i], state: 'expired' };
    for(i = 0; i < list.length; i++){
      var s = list[i];
      if(s.active && s.endsAt - now <= NOTICE_DAYS * DAY_MS && !seen(seenKey(s, 'expiring'))) return { s: s, state: 'expiring' };
    }
    return null;
  }

  function showNotice(n){
    if(!document.body || document.getElementById('plansNoticeBar')) return;
    var vars = { plan: subLabel(n.s), date: fmtDate(n.s.endsAt) };
    var tab = TAB_OF_KIND[n.s.kind];
    markSeen(seenKey(n.s, n.state));
    var bar = document.createElement('div');
    bar.id = 'plansNoticeBar';
    bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:fixed; top:12px; left:50%; transform:translateX(-50%); width:min(640px, calc(100% - 24px)); z-index:9999;'
      + ' display:flex; flex-wrap:wrap; align-items:center; gap:8px; background:var(--panel2, #1c2230); color:var(--text, #fff);'
      + ' border:1px solid rgba(201,162,39,.45); border-radius:14px; padding:10px 14px; box-shadow:0 8px 28px rgba(0,0,0,.35);'
      + ' font-size:13.5px; line-height:1.7; box-sizing:border-box;';
    var txt = document.createElement('span');
    txt.style.cssText = 'flex:1; min-width:180px;';
    txt.textContent = whyText(n.state, vars);
    var go = document.createElement('button');
    go.type = 'button';
    go.textContent = t('plansRenew');
    go.style.cssText = 'flex:none; padding:7px 16px; border-radius:10px; border:1px solid #c9a227; background:#c9a227; color:#0a0a0a; font-weight:700; cursor:pointer; font-size:13px; font-family:inherit;';
    var later = document.createElement('button');
    later.type = 'button';
    later.textContent = t('plansLater');
    later.style.cssText = 'flex:none; padding:7px 14px; border-radius:10px; border:1px solid var(--border, rgba(127,127,127,.25)); background:transparent; color:inherit; cursor:pointer; font-size:13px; font-family:inherit;';
    function close(){ try{ bar.remove(); }catch(e){ __swallow(e, 'plans-gate:bar'); } }
    go.onclick = function(){ close(); lastOpen = 0; openPlans(n.state, tab, vars); };
    later.onclick = close;
    bar.appendChild(txt); bar.appendChild(go); bar.appendChild(later);
    document.body.appendChild(bar);
  }
  function checkSubs(subs){
    if(noticeShown || !loggedIn()) return;
    var n = pickNotice(subs, Date.now());
    if(!n) return;
    noticeShown = true;
    showNotice(n);
  }

  // الالتفاف شفّاف كـmedia-notify.js: الاستجابة الأصليّة تُعاد كما هي، والقراءة على نسخة clone قبل أن يقرأها صاحبها.
  try{
    var prevFetch = window.fetch;
    if(typeof prevFetch === 'function'){
      window.fetch = function(input, init){
        var p = prevFetch.apply(window, arguments);
        var url = '';
        try{ url = typeof input === 'string' ? input : String((input && input.url) || ''); }catch(e){ url = ''; }
        if(!ourApi(url)) return p;
        try{
          p.then(function(res){
            try{
              if(!res || typeof res.clone !== 'function') return;
              if(res.status === 402 || res.status === 403){
                res.clone().json().then(function(d){
                  var g = classify(url, res.status, d);
                  if(g) openPlans(g.reason, g.tab);
                }).catch(function(){ /* guard-ok — جسم غير JSON ليس جدارًا من خادمنا */ });
              } else if(res.ok && /\/api\/points(?:[?#]|$)/.test(url)){
                res.clone().json().then(function(d){ if(d && Array.isArray(d.subs)) checkSubs(d.subs); })
                  .catch(function(){ /* guard-ok — ردّ رصيد بلا JSON لا تنبيه فيه */ });
              }
            }catch(e){ __swallow(e, 'plans-gate:watch'); }
          }).catch(function(){ /* guard-ok — فشل الشبكة يظهر في الميزة نفسها */ });
        }catch(e){ __swallow(e, 'plans-gate:wrap'); }
        return p;
      };
    }
  }catch(e){ __swallow(e, 'plans-gate:fetch'); }

  window.omranOpenPlans = openPlans;
  window.__omranPlansGate = { classify: classify, tabFor: tabFor, pickNotice: pickNotice, checkSubs: checkSubs, showWhy: showWhy };
})();
