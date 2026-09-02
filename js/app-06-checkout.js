window.postWithConfirm = postWithConfirm;
/* يضبط شكل المحادثة كما يشترطه Gemini — يُستدعى قبل كل طلب. */
function sanitizeGeminiContents(list){
  const src = Array.isArray(list) ? list.filter(c => c && Array.isArray(c.parts) && c.parts.length) : [];
  const out = [];
  for(const c of src){
    const last = out[out.length - 1];
    if(last && last.role === c.role){ last.parts = last.parts.concat(c.parts); continue; }
    out.push({ role: c.role, parts: c.parts.slice() });
  }
  while(out.length && out[0].role !== 'user') out.shift();   // must open on a user turn
  while(out.length && out[out.length - 1].role !== 'user') out.pop(); // and close on one
  return out;
}

// ===== Checkout / Payments (Stripe Checkout + Apple Pay/Google Pay via
// Stripe Payment Request Button API + PayPal) =====
let checkoutCurrentPlan = null;
let paypalSdkLoaded = false;
let stripeJsLoaded = false;
let stripeInstance = null;
let currentPaymentRequest = null;
let currentWalletAvailability = null; // { applePay, googlePay } | null while unknown/unsupported

// Must match api/_lib/create-checkout-session.js PLANS[plan].amount (cents).
const CHECKOUT_PLAN_AMOUNTS = { basic: 1000, pro: 2000, max: 10000 };
// pk_live key is public by design (Stripe publishable keys are meant to ship
// in frontend code) — it only lets the browser start a payment, never move
// money on its own.
const STRIPE_PUBLISHABLE_KEY = 'pk_live_51TqBIu2ftH7NE4SGWV6z94pri9bau6c01UwTIXcUyM38XCUmIQJHe8IJzoYgTM0ab1zav7BWsh69KmgtuwS5H5J1002423FVlB';

// 💰 نظام النقاط — شراء باقة نقاط (يفعّل مع Stripe لاحقًا)
function buyPointsPack(amount){
  settingsToast(t('pricingComingSoon'));
}
window.buyPointsPack = buyPointsPack;

// جلب رصيد النقاط وعرضه في صف المحفظة أعلى قسم الباقات
async function refreshPointsWallet(){
  const row = document.getElementById('pricingWalletRow');
  const val = document.getElementById('pricingWalletValue');
  if(!row || !val) return;
  const token = authGet('aiapp_auth_token');
  if(!token){ row.style.display = 'none'; return; }
  try{
    const r = await fetch('/api/points', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'balance', token }) });
    const d = await r.json();
    if(d && d.ok && d.authed){
      row.style.display = 'flex';
      val.textContent = d.unlimited ? '∞' : (d.points + ' ' + t('pricingPointsUnit'));
      window.__pointsBalance = d.unlimited ? Infinity : d.points;
    } else { row.style.display = 'none'; }
  }catch(e){ /* صامت */ }
}
window.refreshPointsWallet = refreshPointsWallet;

/* v-points-acct (طلب المالك): رصيد النقاط في قائمة الحساب فقط، مع تحذير
   تلقائي قبل النفاد (≤ 20 نقطة) ورسالة نفاد + زر شحن يفتح باقات النقاط.
   يُستدعى تلقائيًا عند فتح قسم «حسابي» — لا زر ولا خطوة من المستخدم. */
const ACCT_POINTS_LOW = 20;
async function refreshAcctPoints(){
  const box = document.getElementById('acctPointsBox');
  const val = document.getElementById('acctPointsValue');
  const warn = document.getElementById('acctPointsLowWarn');
  const warnText = document.getElementById('acctPointsLowText');
  if(!box || !val) return;
  const token = authGet('aiapp_auth_token');
  if(!token){ box.style.display = 'none'; if(warn) warn.style.display = 'none'; return; }
  try{
    const r = await fetch('/api/points', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'balance', token }) });
    const d = await r.json();
    if(!(d && d.ok && d.authed)){ box.style.display = 'none'; if(warn) warn.style.display = 'none'; return; }
    box.style.display = 'flex';
    if(d.unlimited){
      val.textContent = '∞';
      if(warn) warn.style.display = 'none';
      return;
    }
    const bal = Math.max(0, Number(d.points) || 0);
    val.textContent = bal + ' ' + t('pricingPointsUnit');
    window.__pointsBalance = bal;
    if(warn && warnText){
      if(bal <= ACCT_POINTS_LOW){
        const key = bal <= 0 ? 'acctPointsOut' : 'acctPointsLow';
        warnText.setAttribute('data-i18n', key);
        warnText.textContent = t(key);
        warn.style.display = 'block';
      } else warn.style.display = 'none';
    }
  }catch(e){ /* صامت — الشبكة قد تنقطع، لا نكسر قائمة الحساب */ }
}
window.refreshAcctPoints = refreshAcctPoints;

/* v-ios-external-pay (طلب المالك): غلاف أبل ستور يدفع خارج التطبيق —
   صفحة Stripe المستضافة تُفتح في متصفح النظام (وفيها Apple Pay جاهز
   تلقائيًا في Safari) بدل أي شراء داخلي في الغلاف. كشف الغلاف: آيفون +
   جسر كاباسيتور/WebKit، أو علامة ?store=apple المحفوظة. الويب وPWA
   المثبّت بلا أي تغيير. */
function omranIOSStoreApp(){
  try{
    if(!/iPad|iPhone|iPod/.test(navigator.userAgent || '')) return false;
    if(window.Capacitor && (window.Capacitor.isNative === true || (typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()))) return true;
    if(window.webkit && window.webkit.messageHandlers && (window.webkit.messageHandlers.omranShare || window.webkit.messageHandlers.omranPdf)) return true;
    if((localStorage.getItem('aiapp_store') || '') === 'apple') return true;
  }catch(e){ /* guard-ok — بلا كشف تبقى النافذة الداخلية المعتادة */ }
  return false;
}

function openCheckout(plan){
  checkoutCurrentPlan = plan;
  // v-ios-external-pay: بلا نافذة داخلية إطلاقًا — مباشرة للدفع الخارجي.
  if(omranIOSStoreApp()){ startStripeCheckout(); return; }
  const overlay = document.getElementById('checkoutModalOverlay');
  const label = document.getElementById('checkoutPlanLabel');
  const statusMsg = document.getElementById('checkoutStatusMsg');
  if (label) label.textContent = t(plan === 'pro' ? 'checkoutPlanLabelPro' : plan === 'max' ? 'checkoutPlanLabelMax' : 'checkoutPlanLabelBasic');
  if (statusMsg) { statusMsg.style.color = ''; statusMsg.textContent = ''; }
  if (overlay) {
    // The overlay is defined inside the settings <dialog>, which is usually
    // display:none — move it to <body> so it is always visible when opened.
    if (overlay.parentElement !== document.body) document.body.appendChild(overlay);
    // If the settings dialog is open via showModal(), it sits in the browser
    // top layer and makes the rest of the page inert — close it first.
    const sd = document.getElementById('settingsDialog');
    if (sd && sd.open && typeof sd.close === 'function') { try { sd.close(); } catch (e) { /* guard-ok — cleanup: close() may throw on some browsers */ } }
    overlay.style.display = 'flex';
    // v-ios-nogpay (طلب عمران): زر Google Pay منتج أندرويد ولا معنى له على
    // الآيفون — نُخفيه على iOS ويبقى على بقية الأجهزة. البطاقة وPayPal (دفع
    // خارجي) يبقيان للجميع، فيأخذ PayPal مكان Google Pay على الآيفون.
    try {
      var __isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      var __gpay = overlay.querySelector('button[onclick="clickGooglePay()"]');
      if (__gpay) __gpay.style.display = __isIOS ? 'none' : 'flex';
    } catch (e) { /* guard-ok */ }
  }
  loadPaypalButtons();
  setupWalletPaymentRequest(plan);
}
window.openCheckout = openCheckout;

function closeCheckout(){
  const overlay = document.getElementById('checkoutModalOverlay');
  if (overlay) overlay.style.display = 'none';
}
window.closeCheckout = closeCheckout;

// "بطاقة" — opens the Stripe-hosted Checkout page (redirect). Creates a real
// recurring Stripe subscription; see the KNOWN LIMITATION note in
// api/_lib/create-checkout-session.js about renewal re-crediting.
async function startStripeCheckout(){
  const statusMsg = document.getElementById('checkoutStatusMsg');
  if (statusMsg) { statusMsg.style.color = ''; statusMsg.textContent = t('checkoutRedirecting'); }
  try {
    const r = await fetch('/api/account?action=create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: checkoutCurrentPlan, origin: window.location.origin, token: authGet('aiapp_auth_token') }),
    });
    const data = await r.json();
    if (!r.ok || !data.url) {
      if (statusMsg) statusMsg.textContent = data.error || t('checkoutNotConfigured');
      return;
    }
    // v-ios-bridge: على آيفون المثبَّت يهبط نجاح الدفع في ورقة متصفح منفصلة
    // بلا توكن فلا تُضاف النقاط. نحفظ رقم الجلسة، وعند العودة للتطبيق يتحقق
    // بنفسه (verify-checkout آمنة التكرار — لا تضيف النقاط مرتين).
    if (data.id) { try { localStorage.setItem('aiapp_ck_pending', data.id + ':' + Date.now()); } catch(e){ __swallow(e, 'checkout:pending'); } }
    /* v-ios-external-pay: في غلاف أبل ستور تُفتح صفحة Stripe في متصفح
       النظام (Apple Pay خارجي) — والعودة للتطبيق تُكمل التحقق عبر
       aiapp_ck_pending (v-ios-bridge، آمن التكرار). لو منع الغلاف
       window.open نهبط للتحويل المعتاد فلا يضيع الدفع بأي حال. */
    if (omranIOSStoreApp()){
      let w = null;
      try{ w = window.open(data.url, '_blank', 'noopener'); }catch(e){ __swallow(e, 'checkout:extopen'); }
      if (w){ closeCheckout(); return; }
    }
    window.location.href = data.url;
  } catch (e) {
    if (statusMsg) statusMsg.textContent = t('checkoutError');
  }
}
window.startStripeCheckout = startStripeCheckout;

// ===== Apple Pay / Google Pay (Stripe Payment Request Button API) =====
// Loads Stripe.js on demand (once) and reuses the same instance afterwards.
async function ensureStripeJs(){
  if (stripeInstance) return stripeInstance;
  try {
    if (!stripeJsLoaded) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://js.stripe.com/v3/';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
      stripeJsLoaded = true;
    }
    if (window.Stripe) stripeInstance = window.Stripe(STRIPE_PUBLISHABLE_KEY);
  } catch (e) { /* Stripe.js failed to load — wallet buttons will just report unavailable */ }
  return stripeInstance;
}

// Builds a fresh PaymentRequest for the plan currently open in the modal and
// checks Apple Pay / Google Pay availability on this device/browser. Buttons
// remain visible either way — clicking an unavailable one just shows a
// "not available on this device" message (per design).
async function setupWalletPaymentRequest(plan){
  currentWalletAvailability = null;
  currentPaymentRequest = null;
  const amount = CHECKOUT_PLAN_AMOUNTS[plan];
  if (!amount) return;
  try {
    const stripe = await ensureStripeJs();
    if (!stripe) return;
    const pr = stripe.paymentRequest({
      country: 'AE',
      currency: 'usd',
      total: { label: 'Omran AI Builder', amount },
      requestPayerName: true,
      requestPayerEmail: true,
    });
    const availability = await pr.canMakePayment();
    currentWalletAvailability = availability || null;
    pr.on('paymentmethod', (ev) => { handleWalletPaymentMethod(ev, plan); });
    currentPaymentRequest = pr;
  } catch (e) { currentWalletAvailability = null; currentPaymentRequest = null; }
}

async function handleWalletPaymentMethod(ev, plan){
  const statusMsg = document.getElementById('checkoutStatusMsg');
  try {
    const stripe = await ensureStripeJs();
    const cr = await fetch('/api/account?action=create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, token: authGet('aiapp_auth_token') }),
    });
    const cd = await cr.json();
    if (!cr.ok || !cd.clientSecret) {
      ev.complete('fail');
      if (statusMsg) statusMsg.textContent = cd.error || t('checkoutNotConfigured');
      return;
    }

    const { paymentIntent, error } = await stripe.confirmCardPayment(
      cd.clientSecret,
      { payment_method: ev.paymentMethod.id },
      { handleActions: false }
    );
    if (error) {
      ev.complete('fail');
      if (statusMsg) statusMsg.textContent = t('checkoutError');
      return;
    }
    ev.complete('success');

    let finalIntent = paymentIntent;
    if (finalIntent && finalIntent.status === 'requires_action') {
      const confirmResult = await stripe.confirmCardPayment(cd.clientSecret);
      if (confirmResult.error) {
        if (statusMsg) statusMsg.textContent = t('checkoutError');
        return;
      }
      finalIntent = confirmResult.paymentIntent;
    }

    const vr = await fetch('/api/account?action=verify-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_intent_id: cd.id, token: authGet('aiapp_auth_token') }),
    });
    const vd = await vr.json();
    if (vr.ok && vd.ok) {
      if (statusMsg) { statusMsg.style.color = '#22c55e'; statusMsg.textContent = t('checkoutSuccessMsg'); }
      if (typeof refreshPointsWallet === 'function') refreshPointsWallet();
      setTimeout(closeCheckout, 2500);
    } else if (statusMsg) {
      statusMsg.style.color = '';
      statusMsg.textContent = vd.error || t('checkoutError');
    }
  } catch (e) {
    try { ev.complete('fail'); } catch (e2) { /* guard-ok */ }
    if (statusMsg) statusMsg.textContent = t('checkoutError');
  }
}

function showWalletUnavailableMsg(){
  const statusMsg = document.getElementById('checkoutStatusMsg');
  if (statusMsg) { statusMsg.style.color = ''; statusMsg.textContent = t('checkoutWalletUnavailable'); }
}

function clickApplePay(){
  if (currentPaymentRequest && currentWalletAvailability && currentWalletAvailability.applePay) {
    currentPaymentRequest.show();
  } else {
    showWalletUnavailableMsg();
  }
}
window.clickApplePay = clickApplePay;

function clickGooglePay(){
  if (currentPaymentRequest && currentWalletAvailability && currentWalletAvailability.googlePay) {
    currentPaymentRequest.show();
  } else {
    showWalletUnavailableMsg();
  }
}
window.clickGooglePay = clickGooglePay;

// ===== PayPal =====
async function loadPaypalButtons(){
  const container = document.getElementById('paypalButtonContainer');
  const fallbackBtn = document.getElementById('paypalFallbackBtn');
  if (!container) return;
  container.innerHTML = '';
  try {
    const r = await fetch('/api/account?action=paypal-client-id');
    const data = await r.json();
    if (!data.configured) {
      if (fallbackBtn) fallbackBtn.style.display = 'flex';
      return;
    }
    if (fallbackBtn) fallbackBtn.style.display = 'none';
    if (!paypalSdkLoaded) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(data.clientId)}&currency=USD&intent=capture&disable-funding=card`;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
      paypalSdkLoaded = true;
    }
    if (window.paypal) {
      window.paypal.Buttons({
        style: { color: 'blue', shape: 'rect', label: 'paypal', height: 45 },
        createOrder: async () => {
          const cr = await fetch('/api/account?action=paypal-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create', plan: checkoutCurrentPlan }),
          });
          const cd = await cr.json();
          if (!cr.ok) throw new Error(cd.error || 'error');
          return cd.id;
        },
        onApprove: async (data) => {
          const statusMsg = document.getElementById('checkoutStatusMsg');
          const cap = await fetch('/api/account?action=paypal-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'capture', orderId: data.orderID, token: authGet('aiapp_auth_token') }),
          });
          const capData = await cap.json();
          if (cap.ok && (capData.status === 'COMPLETED' || capData.status === 'APPROVED')) {
            if (statusMsg) { statusMsg.style.color = '#22c55e'; statusMsg.textContent = t('checkoutSuccessMsg'); }
            if (typeof refreshPointsWallet === 'function') refreshPointsWallet();
            setTimeout(closeCheckout, 2500);
          } else if (statusMsg) {
            statusMsg.style.color = '';
            statusMsg.textContent = t('checkoutError');
          }
        },
        onError: () => {
          const statusMsg = document.getElementById('checkoutStatusMsg');
          if (statusMsg) statusMsg.textContent = t('checkoutError');
        },
      }).render('#paypalButtonContainer');
    }
  } catch (e) {
    if (fallbackBtn) fallbackBtn.style.display = 'flex';
  }
}

async function startPaypalCheckout(){
  const statusMsg = document.getElementById('checkoutStatusMsg');
  if (statusMsg) statusMsg.textContent = t('checkoutNotConfigured');
}
window.startPaypalCheckout = startPaypalCheckout;

// Handle Stripe redirect back (success/cancel) from the "بطاقة" hosted
// Checkout Page.
(function handleCheckoutRedirectResult(){
  try {
    const params = new URLSearchParams(window.location.search);
    const checkoutResult = params.get('checkout');
    if (checkoutResult === 'success' || checkoutResult === 'cancel') {
      const sessionId = params.get('session_id');
      window.addEventListener('DOMContentLoaded', () => {
        setTimeout(async () => {
          if (checkoutResult === 'success' && sessionId) {
            try {
              const vr = await fetch('/api/account?action=verify-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'verify-checkout', session_id: sessionId, token: authGet('aiapp_auth_token') }),
              });
              const vd = await vr.json();
              alert(vr.ok && vd.ok ? t('checkoutSuccessMsg') : t('checkoutError'));
              if (vr.ok && vd.ok && typeof refreshPointsWallet === 'function') refreshPointsWallet();
            } catch (e) { alert(t('checkoutError')); }
          } else {
            alert(checkoutResult === 'success' ? t('checkoutSuccessMsg') : t('checkoutCancelMsg'));
          }
        }, 300);
      });
      params.delete('checkout');
      params.delete('plan');
      params.delete('session_id');
      const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
      window.history.replaceState({}, '', newUrl);
      // نفس السياق أكمل بنفسه — لا حاجة لجسر الآيفون.
      try { localStorage.removeItem('aiapp_ck_pending'); } catch(e){ __swallow(e, 'checkout:clear'); }
    }
  } catch(e){ __swallow(e, "auth:app-06-checkout#1"); }
})();

/* v-ios-bridge: العودة من دفع اكتمل في ورقة المتصفح المنفصلة (آيفون المثبَّت):
   نتحقق من الجلسة المحفوظة بتوكن التطبيق نفسه — عند كل عودة/تركيز ونبضة كل
   ٥ ثوانٍ لنصف ساعة. غير مدفوعة بعد؟ نبقيها. مدفوعة؟ نقاطك تُضاف وتُبشَّر. */
(function checkoutClaimBridge(){
  function pending(){
    try {
      const raw = localStorage.getItem('aiapp_ck_pending');
      if(!raw) return null;
      const i = raw.lastIndexOf(':');
      const id = raw.slice(0, i), ts = Number(raw.slice(i + 1) || 0);
      if(!id || (Date.now() - ts) > 30 * 60 * 1000){ localStorage.removeItem('aiapp_ck_pending'); return null; }
      return id;
    } catch(e){ return null; }
  }
  let busy = false;
  async function claim(){
    const id = pending();
    if(!id || busy) return;
    const token = authGet('aiapp_auth_token');
    if(!token) return;
    busy = true;
    try {
      const r = await fetch('/api/account?action=verify-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify-checkout', session_id: id, token }),
      });
      const d = await r.json().catch(() => ({}));
      if(r.ok && d.ok){
        localStorage.removeItem('aiapp_ck_pending');
        alert(t('checkoutSuccessMsg'));
        if(typeof refreshPointsWallet === 'function') refreshPointsWallet();
      } else if(r.status === 400 || r.status === 403){
        localStorage.removeItem('aiapp_ck_pending'); // جلسة لا تخصنا/فاسدة — لا نلحّ
      }
      // 402 = لم يُدفع بعد — تبقى معلّقة للنبضة التالية.
    } catch(e){ __swallow(e, 'checkout:claim'); }
    busy = false;
  }
  window.addEventListener('focus', claim);
  document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') claim(); });
  const iv = setInterval(() => { if(!pending()){ clearInterval(iv); return; } claim(); }, 5000);
  claim();
})();
const btnExportProjectsEl = $('#btnExportProjects');
if(btnExportProjectsEl) btnExportProjectsEl.onclick = exportProjects;
const btnImportProjectsEl = $('#btnImportProjects');
const importProjectsFileEl = $('#importProjectsFile');
if(btnImportProjectsEl && importProjectsFileEl){
  btnImportProjectsEl.onclick = () => importProjectsFileEl.click();
  importProjectsFileEl.onchange = (e) => {
    const file = e.target.files && e.target.files[0];
    if(file) importProjectsFromFile(file);
    importProjectsFileEl.value = '';
  };
}
$('#btnSettings').onclick = () => {
  try {
  collapseAllSettingsSections();
  renderStats();
  renderReferral();
  $('#provider').value = localStorage.getItem('aiapp_provider') || 'claude';
  $('#apiKey').value = localStorage.getItem('aiapp_apikey') || '';
  $('#modelName').value = localStorage.getItem('aiapp_model') || 'gpt-4o-mini';
  $('#geminiApiKey').value = localStorage.getItem('aiapp_gemini_apikey') || '';
  $('#geminiModel').value = localStorage.getItem('aiapp_gemini_model') || 'gemini-flash-latest';
  $('#groqApiKey').value = localStorage.getItem('aiapp_groq_apikey') || '';
  $('#groqModel').value = localStorage.getItem('aiapp_groq_model') || 'llama-3.3-70b-versatile';
  $('#claudeApiKey').value = localStorage.getItem('aiapp_claude_apikey') || '';
  $('#claudeModel').value = localStorage.getItem('aiapp_claude_model') || 'claude-sonnet-5';
  $('#openrouterApiKey').value = localStorage.getItem('aiapp_openrouter_apikey') || '';
  $('#openrouterModel').value = localStorage.getItem('aiapp_openrouter_model') || 'openai/gpt-4o-mini';
  $('#perplexityApiKey').value = localStorage.getItem('aiapp_perplexity_apikey') || '';
  $('#perplexityModel').value = localStorage.getItem('aiapp_perplexity_model') || 'sonar';
  $('#mistralApiKey').value = localStorage.getItem('aiapp_mistral_apikey') || '';
  $('#mistralModel').value = localStorage.getItem('aiapp_mistral_model') || 'mistral-small-latest';
  $('#deepseekApiKey').value = localStorage.getItem('aiapp_deepseek_apikey') || '';
  $('#deepseekModel').value = localStorage.getItem('aiapp_deepseek_model') || 'deepseek-chat';
  $('#cohereApiKey').value = localStorage.getItem('aiapp_cohere_apikey') || '';
  // 'command-r-plus' was retired by Cohere on 2025-09-15; if a visitor's
  // browser still has it saved from before, silently upgrade it so requests
  // don't fail with a 404 model-not-found error.
  {
    const savedCohereModel = localStorage.getItem('aiapp_cohere_model');
    $('#cohereModel').value = normalizeCohereModel(savedCohereModel);
  }
  $('#chkIncludeOpenAI').checked = localStorage.getItem('aiapp_include_openai') !== 'false';
  $('#chkIncludeGemini').checked = localStorage.getItem('aiapp_include_gemini') !== 'false';
  $('#chkIncludeGroq').checked = localStorage.getItem('aiapp_include_groq') !== 'false';
  $('#chkIncludeClaude').checked = localStorage.getItem('aiapp_include_claude') !== 'false';
  $('#chkIncludeOpenRouter').checked = localStorage.getItem('aiapp_include_openrouter') !== 'false';
  $('#chkIncludePerplexity').checked = localStorage.getItem('aiapp_include_perplexity') !== 'false';
  $('#chkIncludeMistral').checked = localStorage.getItem('aiapp_include_mistral') !== 'false';
  $('#chkIncludeDeepSeek').checked = localStorage.getItem('aiapp_include_deepseek') !== 'false';
  $('#chkIncludeCohere').checked = localStorage.getItem('aiapp_include_cohere') !== 'false';
  try { setVoiceGenderUI(localStorage.getItem('aiapp_voice_gender') || 'female'); } catch(e) { console.error(e); }
  try { loadThemeToForm(); } catch(e) { console.error(e); }
  try { populateVoicePicker(); } catch(e) { console.error(e); }
  } catch(e) { console.error('settings populate error', e); }
  try { renderSettingsNavList(); showSettingsHome(); } catch(e) { console.error(e); }
  try { if (window.updateVersionLabel) window.updateVersionLabel(); } catch(e){ __swallow(e, "misc:app-06-checkout#2"); }
  openDialogSafe(settingsDialog);
};
if($('#btnResetColors')) $('#btnResetColors').onclick = () => {
  localStorage.removeItem('aiapp_theme');
  localStorage.removeItem('aiapp_provider_colors');
  const row = $('#colorPresetsRow');
  if(row) row.innerHTML = '';
  try { loadThemeToForm(); } catch(e) { console.error(e); }
  applyTheme();
  renderMessages();
};
$('#fetchClaudeModelsBtn').onclick = async () => {
  const apiKey = $('#claudeApiKey').value.trim();
  const listEl = $('#claudeModelList');
  const btn = $('#fetchClaudeModelsBtn');
  if(!apiKey){ alert(t('fetchModelsFail')); return; }
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = '...';
  try {
    const res = await fetch('https://api.anthropic.com/v1/models?limit=1000', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    });
    if(!res.ok){ alert(t('fetchModelsFail')); return; }
    const data = await res.json();
    const models = (data.data || []).map(m => m.id);
    if(!models.length){ alert(t('fetchModelsEmpty')); return; }
    listEl.innerHTML = '<option value="">-- ' + t('fetchModelsBtn') + ' --</option>' + models.map(id => `<option value="${id}">${id}</option>`).join('');
    listEl.style.display = 'block';
    listEl.onchange = () => { if(listEl.value) $('#claudeModel').value = listEl.value; };
  } catch(e) {
    alert(t('fetchModelsFail'));
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
};
/* ===== Calendar & World Clock ===== */
const CLOCK_TIMEZONES = [
  {tz:'Etc/GMT', ar:'غرينتش (GMT)', en:'Greenwich (GMT)'},
  {tz:'Asia/Riyadh', ar:'السعودية - الرياض/مكة', en:'Saudi Arabia - Riyadh/Makkah'},
  {tz:'Asia/Dubai', ar:'الإمارات - دبي/أبوظبي', en:'UAE - Dubai/Abu Dhabi'},
  {tz:'Asia/Kuwait', ar:'الكويت', en:'Kuwait'},
  {tz:'Asia/Qatar', ar:'قطر - الدوحة', en:'Qatar - Doha'},
  {tz:'Asia/Bahrain', ar:'البحرين', en:'Bahrain'},
  {tz:'Asia/Muscat', ar:'عُمان - مسقط', en:'Oman - Muscat'},
  {tz:'Africa/Cairo', ar:'مصر - القاهرة', en:'Egypt - Cairo'},
  {tz:'Asia/Amman', ar:'الأردن - عمّان', en:'Jordan - Amman'},
  {tz:'Asia/Beirut', ar:'لبنان - بيروت', en:'Lebanon - Beirut'},
  {tz:'Asia/Damascus', ar:'سوريا - دمشق', en:'Syria - Damascus'},
  {tz:'Asia/Baghdad', ar:'العراق - بغداد', en:'Iraq - Baghdad'},
  {tz:'Asia/Gaza', ar:'فلسطين - غزة', en:'Palestine - Gaza'},
  {tz:'Asia/Aden', ar:'اليمن - عدن', en:'Yemen - Aden'},
  {tz:'Africa/Khartoum', ar:'السودان - الخرطوم', en:'Sudan - Khartoum'},
  {tz:'Africa/Tripoli', ar:'ليبيا - طرابلس', en:'Libya - Tripoli'},
  {tz:'Africa/Tunis', ar:'تونس', en:'Tunisia'},
  {tz:'Africa/Algiers', ar:'الجزائر', en:'Algeria'},
  {tz:'Africa/Casablanca', ar:'المغرب - الرباط', en:'Morocco - Rabat'},
  {tz:'Europe/London', ar:'بريطانيا - لندن', en:'UK - London'},
  {tz:'Europe/Paris', ar:'فرنسا - باريس', en:'France - Paris'},
  {tz:'Europe/Berlin', ar:'ألمانيا - برلين', en:'Germany - Berlin'},
  {tz:'Europe/Madrid', ar:'إسبانيا - مدريد', en:'Spain - Madrid'},
  {tz:'Europe/Rome', ar:'إيطاليا - روما', en:'Italy - Rome'},
  {tz:'Europe/Istanbul', ar:'تركيا - إسطنبول', en:'Turkey - Istanbul'},
  {tz:'Europe/Moscow', ar:'روسيا - موسكو', en:'Russia - Moscow'},
  {tz:'America/New_York', ar:'أمريكا - نيويورك', en:'USA - New York'},
  {tz:'America/Chicago', ar:'أمريكا - شيكاغو', en:'USA - Chicago'},
  {tz:'America/Los_Angeles', ar:'أمريكا - لوس أنجلوس', en:'USA - Los Angeles'},
  {tz:'America/Toronto', ar:'كندا - تورنتو', en:'Canada - Toronto'},
  {tz:'America/Sao_Paulo', ar:'البرازيل - ساو باولو', en:'Brazil - Sao Paulo'},
  {tz:'Asia/Tokyo', ar:'اليابان - طوكيو', en:'Japan - Tokyo'},
  {tz:'Asia/Shanghai', ar:'الصين - بكين/شنغهاي', en:'China - Beijing/Shanghai'},
  {tz:'Asia/Seoul', ar:'كوريا الجنوبية - سيول', en:'South Korea - Seoul'},
  {tz:'Asia/Kolkata', ar:'الهند - نيودلهي', en:'India - New Delhi'},
  {tz:'Asia/Karachi', ar:'باكستان - كراتشي', en:'Pakistan - Karachi'},
  {tz:'Asia/Dhaka', ar:'بنغلاديش - دكا', en:'Bangladesh - Dhaka'},
  {tz:'Asia/Jakarta', ar:'إندونيسيا - جاكرتا', en:'Indonesia - Jakarta'},
  {tz:'Asia/Kuala_Lumpur', ar:'ماليزيا - كوالالمبور', en:'Malaysia - Kuala Lumpur'},
  {tz:'Australia/Sydney', ar:'أستراليا - سيدني', en:'Australia - Sydney'},
  {tz:'Pacific/Auckland', ar:'نيوزيلندا - أوكلاند', en:'New Zealand - Auckland'},
];
const CLOCK_WORLD_STRIP = ['Asia/Riyadh','Asia/Dubai','Europe/London','America/New_York','Asia/Tokyo'];
let clockIntervalId = null;

function clockGmtOffset(tz){
  try {
    const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' });
    const part = dtf.formatToParts(new Date()).find(p => p.type === 'timeZoneName');
    return part ? part.value.replace('GMT','GMT ') : '';
  } catch(e) { return ''; }
}

function clockFormatTime(tz){
  try {
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
    }).format(new Date());
  } catch(e) { return '--:--:--'; }
}

function populateClockTZSelect(){
  const sel = $('#clockTZSelect');
  if (!sel) return;
  const saved = localStorage.getItem('aiapp_clock_tz');
  sel.innerHTML = CLOCK_TIMEZONES.map(z => `<option value="${z.tz}">${lang === 'ar' ? z.ar : z.en}</option>`).join('');
  const guess = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (saved && CLOCK_TIMEZONES.some(z => z.tz === saved)) sel.value = saved;
  else if (CLOCK_TIMEZONES.some(z => z.tz === guess)) sel.value = guess;
  else sel.value = 'Asia/Riyadh';
}

function updateHeaderClock(){
  const el = $('#headerClockTime');
  if (!el) return;
  el.textContent = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  }).format(new Date());
}
updateHeaderClock();
setInterval(updateHeaderClock, 1000);

function renderClockWorldStrip(){
  const box = $('#clockWorldStrip');
  if (!box) return;
  box.innerHTML = CLOCK_WORLD_STRIP.map(tz => {
    const meta = CLOCK_TIMEZONES.find(z => z.tz === tz);
    const label = meta ? (lang === 'ar' ? meta.ar : meta.en) : tz;
    return `<div class="clockStripRow" data-tz="${tz}" style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; border-radius:10px; background:var(--bg); border:1px solid var(--border);">
      <span style="font-size:13px; font-weight:500;">${label}</span>
      <span class="clockStripTime" style="font-size:15px; font-weight:700; direction:ltr;">--:--:--</span>
    </div>`;
  }).join('');
}

function updateClockDialog(){
  const now = new Date();
  const gEl = $('#clockGregorianTime');
  const gdEl = $('#clockGregorianDate');
  const hEl = $('#clockHijriDate');
  if (gEl) gEl.textContent = clockFormatTime(Intl.DateTimeFormat().resolvedOptions().timeZone);
  if (gdEl) {
    gdEl.textContent = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }).format(now);
  }
  if (hEl) {
    try {
      const hijriStr = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-ca-islamic-umalqura-nu-latn' : 'en-US-u-ca-islamic-umalqura', {
        year: 'numeric', month: 'long', day: 'numeric',
      }).format(now);
      hEl.textContent = '🕌 ' + hijriStr;
    } catch(e) { hEl.textContent = '🕌 —'; }
  }
  const sel = $('#clockTZSelect');
  if (sel && sel.value) {
    const selTimeEl = $('#clockSelectedTime');
    const selMetaEl = $('#clockSelectedMeta');
    if (selTimeEl) selTimeEl.textContent = clockFormatTime(sel.value);
    if (selMetaEl) selMetaEl.textContent = clockGmtOffset(sel.value);
  }
  document.querySelectorAll('.clockStripRow').forEach(row => {
    const tz = row.getAttribute('data-tz');
    const timeEl = row.querySelector('.clockStripTime');
    if (timeEl) timeEl.textContent = clockFormatTime(tz) + '  ' + clockGmtOffset(tz);
  });
}

$('#btnClock').onclick = () => {
  populateClockTZSelect();
  renderClockWorldStrip();
  updateClockDialog();
  if (clockIntervalId) clearInterval(clockIntervalId);
  clockIntervalId = setInterval(updateClockDialog, 1000);
  openDialogSafe($('#clockDialog'));
};
$('#clockTZSelect').onchange = updateClockDialog;
$('#btnCloseClock').onclick = () => {
  closeDialogSafe($('#clockDialog'));
  if (clockIntervalId) { clearInterval(clockIntervalId); clockIntervalId = null; }
};
$('#btnSaveClock').onclick = () => {
  const sel = $('#clockTZSelect');
  if (sel && sel.value) localStorage.setItem('aiapp_clock_tz', sel.value);
  closeDialogSafe($('#clockDialog'));
  if (clockIntervalId) { clearInterval(clockIntervalId); clockIntervalId = null; }
};

$('#btnCancelSettings').onclick = () => closeDialogSafe(settingsDialog);
/* v-settings-sheet (طلب عمران): زرا حفظ/إلغاء أُخفيا — الحفظ صار تلقائيًا
   عند إغلاق النافذة، والسحب لأسفل من أعلى المحتوى يغلقها كورقة جوال. */
const saveSettingsNow = () => {
  localStorage.setItem('aiapp_provider', $('#provider').value);
  localStorage.setItem('aiapp_apikey', $('#apiKey').value.trim());
  localStorage.setItem('aiapp_model', $('#modelName').value.trim() || 'gpt-4o-mini');
  localStorage.setItem('aiapp_gemini_apikey', $('#geminiApiKey').value.trim());
  localStorage.setItem('aiapp_gemini_model', $('#geminiModel').value.trim() || 'gemini-flash-latest');
  localStorage.setItem('aiapp_groq_apikey', $('#groqApiKey').value.trim());
  localStorage.setItem('aiapp_groq_model', $('#groqModel').value.trim() || 'llama-3.3-70b-versatile');
  localStorage.setItem('aiapp_claude_apikey', $('#claudeApiKey').value.trim());
  localStorage.setItem('aiapp_claude_model', $('#claudeModel').value.trim() || 'claude-sonnet-5');
  localStorage.setItem('aiapp_openrouter_apikey', $('#openrouterApiKey').value.trim());
  (() => {
    const sel = $('#openrouterModelSelect');
    const finalModel = (sel.value === '__custom__') ? ($('#openrouterModel').value.trim() || 'openai/gpt-4o-mini') : sel.value;
    localStorage.setItem('aiapp_openrouter_model', finalModel);
  })();
  localStorage.setItem('aiapp_perplexity_apikey', $('#perplexityApiKey').value.trim());
  localStorage.setItem('aiapp_perplexity_model', $('#perplexityModel').value.trim() || 'sonar');
  localStorage.setItem('aiapp_mistral_apikey', $('#mistralApiKey').value.trim());
  localStorage.setItem('aiapp_mistral_model', $('#mistralModel').value.trim() || 'mistral-small-latest');
  localStorage.setItem('aiapp_deepseek_apikey', $('#deepseekApiKey').value.trim());
  localStorage.setItem('aiapp_deepseek_model', $('#deepseekModel').value.trim() || 'deepseek-chat');
  localStorage.setItem('aiapp_cohere_apikey', $('#cohereApiKey').value.trim());
  localStorage.setItem('aiapp_cohere_model', normalizeCohereModel($('#cohereModel').value));
  localStorage.setItem('aiapp_include_openai', $('#chkIncludeOpenAI').checked ? 'true' : 'false');
  localStorage.setItem('aiapp_include_gemini', $('#chkIncludeGemini').checked ? 'true' : 'false');
  localStorage.setItem('aiapp_include_groq', $('#chkIncludeGroq').checked ? 'true' : 'false');
  localStorage.setItem('aiapp_include_claude', $('#chkIncludeClaude').checked ? 'true' : 'false');
  localStorage.setItem('aiapp_include_openrouter', $('#chkIncludeOpenRouter').checked ? 'true' : 'false');
  localStorage.setItem('aiapp_include_perplexity', $('#chkIncludePerplexity').checked ? 'true' : 'false');
  localStorage.setItem('aiapp_include_mistral', $('#chkIncludeMistral').checked ? 'true' : 'false');
  localStorage.setItem('aiapp_include_deepseek', $('#chkIncludeDeepSeek').checked ? 'true' : 'false');
  localStorage.setItem('aiapp_include_cohere', $('#chkIncludeCohere').checked ? 'true' : 'false');
  saveThemeFromForm();
};
$('#btnSaveSettings').onclick = () => { saveSettingsNow(); closeDialogSafe(settingsDialog); };
/* الحفظ التلقائي: أي إغلاق (سحب، ✕، ESC، رجوع) يحفظ أولًا */
settingsDialog.addEventListener('close', () => { try{ saveSettingsNow(); }catch(e){ __swallow(e, 'settings:autosave'); } });
/* v-drawer-drag (طلب عمران — نفس ChatGPT): الدرج يتبع الإصبع أثناء السحب؛
   فلته قبل ثلث العرض يرجع لمكانه بحركة، وبعده (أو بسحبة سريعة) ينزلق
   خارج الشاشة ويغلق. التمرير الرأسي داخل المحتوى لا يتأثر. */
(function(){
  let t0 = null, dragging = false, w = 0;
  const setX = (x, anim) => {
    settingsDialog.style.transition = anim ? 'transform .18s ease-out' : 'none';
    settingsDialog.style.transform = x ? ('translateX(' + x + 'px)') : '';
  };
  settingsDialog.addEventListener('touchstart', (e) => {
    if(e.touches.length !== 1){ t0 = null; return; }
    t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY, ts: Date.now() };
    dragging = false;
    w = settingsDialog.getBoundingClientRect().width || 300;
  }, { passive: true });
  settingsDialog.addEventListener('touchmove', (e) => {
    if(!t0) return;
    const dx = e.touches[0].clientX - t0.x;   /* موجب = نحو حافة الدرج اليمنى */
    const dy = e.touches[0].clientY - t0.y;
    if(!dragging){
      if(Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.4) return; /* تمرير رأسي */
      if(dx <= 0){ t0 = null; return; }
      dragging = true;
    }
    setX(Math.max(0, dx), false);
  }, { passive: true });
  const finish = (e) => {
    if(!t0) return;
    const wasDragging = dragging;
    const dx = (wasDragging && e.changedTouches && e.changedTouches[0]) ? (e.changedTouches[0].clientX - t0.x) : 0;
    const dt = Date.now() - t0.ts;
    t0 = null; dragging = false;
    if(!wasDragging) return;
    if(dx > w * 0.35 || (dt < 300 && dx > 70)){
      setX(w + 40, true);
      setTimeout(() => { setX(0, false); closeDialogSafe(settingsDialog); }, 190);
    } else {
      setX(0, true);
      setTimeout(() => { settingsDialog.style.transition = 'none'; }, 220);
    }
  };
  settingsDialog.addEventListener('touchend', finish, { passive: true });
  settingsDialog.addEventListener('touchcancel', finish, { passive: true });
  /* v-settings-grab: النقر على المقبض يغلق أيضًا (مفيد للكمبيوتر) */
  const grab = document.getElementById('settingsGrab');
  if(grab) grab.addEventListener('click', () => closeDialogSafe(settingsDialog));
  /* v-settings-outside (فكرة عمران): الورقة أصغر من الشاشة — النقر على
     المساحة الفاضية (الـbackdrop) يغلقها ويرجعك */
  settingsDialog.addEventListener('click', (e) => {
    if(e.target !== settingsDialog) return;
    const r = settingsDialog.getBoundingClientRect();
    if(e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom){
      closeDialogSafe(settingsDialog);
    }
  });
})();

// Allow manually editing the generated code directly in the code panel:
// typing here now updates the project's stored code, saves it, and live-refreshes
// the preview (HTML) or re-runs it (Python), instead of being a read-only view.
let codeEditDebounce = null;
codeEl.addEventListener('input', () => {
  let cur = getCurrent();
  if(!cur){
    // No project exists yet: create one on-the-fly so typed code isn't lost.
    cur = { id: Date.now().toString(), title: 'مشروعي', code: '', codeType: 'html', messages: [] };
    state.projects.push(cur);
    state.currentId = cur.id;
    emptyState.style.display = 'none';
    previewFrame.style.display = 'block';
  }
  cur.code = codeEl.value;
  clearTimeout(codeEditDebounce);
  codeEditDebounce = setTimeout(() => {
    saveState();
    if(cur.codeType === 'python'){
      $('#pyOutput').textContent = '';
      $('#pyStatus').textContent = '';
      runPythonCode(cur.code);
    } else {
      previewFrame._lastSrc = cur.code; previewFrame._imageView = false;
      previewFrame.srcdoc = cur.code;
    }
  }, 500);
});

// ▶️ Run pasted/edited code immediately and jump to preview
$('#btnRunCode').onclick = () => {
  const src = codeEl.value.trim();
  if(!src) return;
  let cur = getCurrent();
  const looksPy = !/^\s*</.test(src) && /(^|\n)\s*(import |def |print\()/.test(src);
  if(!cur){
    cur = { id: Date.now().toString(), title: 'مشروعي', code: '', codeType: looksPy ? 'python' : 'html', messages: [] };
    state.projects.push(cur);
    state.currentId = cur.id;
  }
  cur.code = codeEl.value;
  cur.codeType = looksPy ? 'python' : 'html';
  saveState();
  renderHistory();
  renderCodeAndPreview();
  if(cur.codeType === 'python'){
    $('#pyOutput').textContent = '';
    $('#pyStatus').textContent = '';
    runPythonCode(cur.code);
  } else {
    previewFrame._lastSrc = cur.code; previewFrame._imageView = false;
    previewFrame.srcdoc = cur.code;
  }
  switchWorkTab('preview');
};

$('#btnUploadCode').onclick = () => {
  $('#codeUploadInput').click();
};
$('#codeUploadInput').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let cur = getCurrent();
    const isPy = /\.py$/i.test(file.name);
    if(!cur){
      // No active project yet: create one from the uploaded file.
      cur = { id: Date.now().toString(), title: file.name.replace(/\.[^.]+$/, ''), code: '', codeType: isPy ? 'python' : 'html', messages: [] };
      state.projects.push(cur);
      state.currentId = cur.id;
    }
    cur.code = reader.result;
    cur.codeType = isPy ? 'python' : 'html';
    saveState();
    renderHistory();
    renderCodeAndPreview();
  };
  reader.readAsText(file);
  e.target.value = '';
});

(() => {
  const btn = $('#btnCopyCode');
  const copyIconSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
  const checkIconSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  btn.innerHTML = copyIconSVG;
  btn.style.background = 'rgba(255,255,255,0.06)';
  btn.style.border = '1px solid var(--border,rgba(255,255,255,.12))';
  btn.style.color = 'var(--muted,#98a0b3)';
  btn.style.opacity = '1';
  btn.onmouseenter = () => { btn.style.color = 'var(--accent2,#00e0b8)'; btn.style.background = 'rgba(255,255,255,0.12)'; };
  btn.onmouseleave = () => { btn.style.color = 'var(--muted,#98a0b3)'; btn.style.background = 'rgba(255,255,255,0.06)'; };
  btn.onclick = async () => {
    const cur = getCurrent();
    const codeToCopy = (cur && cur.code) ? cur.code : codeEl.value;
    if(!codeToCopy){ return; }
    try{
      await navigator.clipboard.writeText(codeToCopy);
    }catch(e){
      codeEl.select();
      document.execCommand('copy');
    }
    btn.innerHTML = checkIconSVG;
    setTimeout(() => { btn.innerHTML = copyIconSVG; }, 1500);
  };
})();

$('#btnDownload').onclick = () => {
  const cur = getCurrent();
  if(!cur || !cur.code){ alert(t('noCodeToDownload')); return; }
  const isPy = cur.codeType === 'python';
  const blob = new Blob([cur.code], {type: isPy ? 'text/x-python' : 'text/html'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = (cur.title || 'app') + (isPy ? '.py' : '.html');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// 📦 تصدير المشروع كملف ZIP جاهز للنشر (index.html + README)
$('#btnExportZip').onclick = async () => {
  const cur = getCurrent();
  if(!cur || !cur.code){ alert(t('noCodeToDownload')); return; }
  try{
    if(!window.JSZip){
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    const zip = new JSZip();
    const isPy = cur.codeType === 'python';
    zip.file(isPy ? 'main.py' : 'index.html', cur.code);
    zip.file('README.md', '# ' + (cur.title || 'App') + '\n\nBuilt with Omran AI Builder — https://omran-ai-builder.vercel.app\n\n' + (isPy ? 'Run: `python main.py`' : 'Open `index.html` in a browser, or deploy the folder to Vercel/Netlify.'));
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = (cur.title || 'app') + '.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }catch(e){
    console.error('zip export error', e);
    alert('⚠️ ' + (e.message || e));
  }
};

$('#btnRunPython').onclick = () => {
  const cur = getCurrent();
  if(cur && cur.code) runPythonCode(cur.code);
};

// 🔁 التصحيح الذاتي: يشغّل الكود المولّد في iframe مخفي معزول، يلتقط أخطاء
// JavaScript وقت التشغيل، ويطلب من الذكاء إصلاحها قبل عرض النتيجة للمستخدم.
// 📋 تقسيم المهام: يقسم الطلبات الكبيرة إلى خطوات ويتابع إنجازها
const TASK_I18N = {
  ar: { title: '📋 خطة العمل', planning: '📋 جاري تقسيم المهمة إلى خطوات...', verifying: '🔎 جاري التحقق من اكتمال كل الخطوات...', refining: '🧩 جاري إكمال الخطوات الناقصة...' },
  en: { title: '📋 Work plan', planning: '📋 Breaking the task into steps...', verifying: '🔎 Verifying all steps are complete...', refining: '🧩 Completing the missing steps...' },
  fr: { title: '📋 Plan de travail', planning: '📋 Découpage de la tâche en étapes...', verifying: '🔎 Vérification que toutes les étapes sont terminées...', refining: '🧩 Finalisation des étapes manquantes...' },
  hi: { title: '📋 कार्य योजना', planning: '📋 कार्य को चरणों में बाँटा जा रहा है...', verifying: '🔎 सभी चरणों की जाँच हो रही है...', refining: '🧩 बचे हुए चरण पूरे किए जा रहे हैं...' },
  ur: { title: '📋 ورک پلان', planning: '📋 کام کو مراحل میں تقسیم کیا جا رہا ہے...', verifying: '🔎 تمام مراحل کی تصدیق ہو رہی ہے...', refining: '🧩 باقی مراحل مکمل کیے جا رہے ہیں...' },
  bn: { title: '📋 কাজের পরিকল্পনা', planning: '📋 কাজটি ধাপে ভাগ করা হচ্ছে...', verifying: '🔎 সব ধাপ সম্পূর্ণ কিনা যাচাই হচ্ছে...', refining: '🧩 বাকি ধাপগুলো সম্পন্ন করা হচ্ছে...' },
  ne: { title: '📋 कार्य योजना', planning: '📋 कामलाई चरणहरूमा विभाजन गरिँदै...', verifying: '🔎 सबै चरणहरू पूरा भए/नभएको जाँच गरिँदै...', refining: '🧩 बाँकी चरणहरू पूरा गरिँदै...' },
  id: { title: '📋 Rencana kerja', planning: '📋 Membagi tugas menjadi langkah-langkah...', verifying: '🔎 Memeriksa semua langkah sudah selesai...', refining: '🧩 Menyelesaikan langkah yang belum selesai...' },
  fil: { title: '📋 Plano ng trabaho', planning: '📋 Hinahati ang gawain sa mga hakbang...', verifying: '🔎 Sinusuri kung kumpleto ang lahat ng hakbang...', refining: '🧩 Kinukumpleto ang mga natitirang hakbang...' },
  tr: { title: '📋 Çalışma planı', planning: '📋 Görev adımlara bölünüyor...', verifying: '🔎 Tüm adımların tamamlandığı doğrulanıyor...', refining: '🧩 Eksik adımlar tamamlanıyor...' },
  zh: { title: '📋 工作计划', planning: '📋 正在将任务拆分为步骤...', verifying: '🔎 正在检查所有步骤是否完成...', refining: '🧩 正在补全缺失的步骤...' },
  ru: { title: '📋 План работы', planning: '📋 Разбиваем задачу на шаги...', verifying: '🔎 Проверяем, что все шаги выполнены...', refining: '🧩 Завершаем недостающие шаги...' },
  es: { title: '📋 Plan de trabajo', planning: '📋 Dividiendo la tarea en pasos...', verifying: '🔎 Verificando que todos los pasos estén completos...', refining: '🧩 Completando los pasos faltantes...' },
  ml: { title: '📋 വർക്ക് പ്ലാൻ', planning: '📋 ടാസ്ക് ഘട്ടങ്ങളായി വിഭജിക്കുന്നു...', verifying: '🔎 എല്ലാ ഘട്ടങ്ങളും പൂർത്തിയായോ എന്ന് പരിശോധിക്കുന്നു...', refining: '🧩 ബാക്കിയുള്ള ഘട്ടങ്ങൾ പൂർത്തിയാക്കുന്നു...' }
};
function taskTxt(key){
  const l = localStorage.getItem('aiapp_lang') || 'ar';
  return (TASK_I18N[l] || TASK_I18N.ar)[key];
}
function formatTaskPlan(steps, done){
  return taskTxt('title') + ':\n' + steps.map((s, i) => ((done && done[i]) ? '✅ ' : '⬜ ') + s).join('\n');
}
// هوية التطبيق — نسخة مختصرة: الأساسيات فقط لتوفير التوكنز.
const APP_IDENTITY_NOTE = '\n(APP IDENTITY: You are inside "Omran AI Builder" by فريق عمران AI. "عمران/Omran" = THIS app only. Features: AI app builder, 3 public providers (Claude/GPT/Gemini), مها voice assistant, image+video generation, live web search, memory, education, stocks. Creator: فريق عمران AI.)'
// ست قواعد عامة فقط؛ الدليل والتصحيح والخطوة التالية تعمل عند الحاجة لا آليًّا.
const CONVERSATION_QUALITY_RULE = '\n[أسلوب المحادثة — ست قواعد عامة ملزمة]:\n' +
'(١) ابدأ بالجواب أو المعلومة الأهم مباشرة، وقدّم الخطر أو الخطأ أولًا إن وُجد.\n' +
'(٢) لا تبدأ بمدح أو عبارة جاهزة أو تحية من نفسك؛ بعد أول تبادل ادخل في الموضوع.\n' +
'(٣) كن صريحًا: لا تخمّن معلومة غير مؤكدة، واذكر عدم اليقين بوضوح، واعترف بخطئك إذا أخطأت.\n' +
'(٤) طابق طول الرد وتنظيمه مع الطلب: السؤال البسيط جواب قصير من ١–٣ جمل بلا عناوين أو تعداد، والموضوع المتشعب أقسام واضحة.\n' +
'(٥) افهم لغة المستخدم ونبرته وردّ بلغة مألوفة له، مع الحفاظ على شخصية المساعد وهويته بلا تقليد لعباراته أو مزاجه.\n' +
'(٦) أظهر الجواب النهائي المصقول فقط؛ لا تعرض التفكير الداخلي أو مراجعة القواعد.\n' +
'[قواعد مشروطة — لا تطبّق آليًّا]:\n' +
'- الدليل: عند البحث أو التحقق أو التحليل التقني/المستندي أو ذكر معلومة متغيرة، اعرض المصدر أو الملف والسطر ووقت التحقق بحسب المتاح. لا تحوّل الدردشة العامة إلى تقرير مصادر.\n' +
'- التصحيح: صحّح باختصار ووضوح فقط عند وجود خطأ مادي في كلام المستخدم أو في رد سابق منك، ثم أكمل الجواب؛ لا تفتعل تصحيحًا.\n' +
'- الخطوة التالية: أضفها فقط إذا كان الطلب عمليًّا متعدد الخطوات، أو بقي قرار لازم، أو تعذّر التنفيذ. لا تختم كل رد باقتراح أو سؤال.'
// قاعدة الاكتمال: تمنع تسليم "شاشة دخول فقط" عند طلب تطبيق كبير أو نسخة من تطبيق مشهور.
const BUILD_COMPLETENESS_RULE = '\nCOMPLETENESS RULE (mandatory, highest priority): when the user asks to build an app — especially a clone of a famous/known app (e.g. Yoho, TikTok, WhatsApp, Instagram) — NEVER deliver only a login screen or a single screen. Silently plan ALL the core screens the real app has (for example a voice-chat rooms app needs: login, home with a list of live rooms, a full live room screen with speaker seats + text chat + gift animations, user profile, coins/store), then implement ALL of them inside the single HTML file with working navigation between screens and realistic demo data (sample rooms, users, avatars via emoji/SVG, messages). The very first reply must feel like a complete, usable, beautiful app — not a starting point.' +
'\nGAME RULES (mandatory, highest priority, no exceptions): every game MUST be fully playable on BOTH mobile touchscreens and desktop keyboards. (1) Touch controls are REQUIRED: draw an on-screen virtual joystick or directional buttons (◀▲▼▶) plus action buttons (attack/jump/shoot) as fixed overlay elements, sized at least 56px, using touchstart/touchmove/touchend with e.preventDefault(); ALSO support keyboard (arrows/WASD/space) for desktop. NEVER ship a game controlled by keyboard only. (2) Graphics must be polished and rich: characters and objects must be real drawn shapes (detailed canvas drawings, SVG sprites, emoji sprites, gradients, glow, shadows, particle effects, animations) — plain colored rectangles/squares as characters are strictly FORBIDDEN. (3) Include a HUD (score/health), start screen, game-over screen with restart button, and sound effects via WebAudio API. (4) The canvas must resize responsively to fill the available screen on any device (window resize + orientationchange).' +
'\nWORKING BUTTONS RULE (mandatory, highest priority): every button/control in the generated app MUST actually work when clicked. (1) NEVER use <script type="module"> — use a plain <script> placed at the END of <body>. (2) If you use inline onclick="fn()" attributes, the function MUST be declared at the global scope (plain `function fn(){}` at the top level of the script) — never inside DOMContentLoaded, an IIFE, or any closure. Preferred: attach handlers with document.getElementById(...).addEventListener("click", ...) at the end of the script. (3) Never reference DOM elements before they exist. (4) Wrap risky logic so one error cannot kill all buttons. (5) Elements created dynamically via innerHTML/insertAdjacentHTML LOSE their listeners — for any dynamic list/grid/options you MUST use event delegation (one listener on the static parent container checking e.target.closest(...)) OR re-attach listeners immediately after every render. (6) Screen/tab navigation MUST work: every nav button, tab, back button, menu item, retry/restart/home button must switch screens correctly (show target, hide others) and reset state where needed. NEVER leave href=\"#\" or an empty handler on any control. (7) MANDATORY FINAL SELF-TEST before output: mentally click EVERY single button/tab/menu item in the app one by one and trace the full flow (start → main → each action → result → restart/home) confirming each handler exists, is reachable, and its target elements exist. An app with even ONE dead button is a REJECTED, invalid answer.';
// قاعدة التصاميم: إعلان/بوستر/شهادة/بطاقة = تصميم ثابت + زر حفظ كصورة، مو تطبيق.
const DESIGN_POSTER_RULE = '\nDESIGN/POSTER RULE (mandatory, highest priority): when the user asks to design an AD, POSTER, FLYER, CERTIFICATE, CARD, INVITATION, LOGO, BANNER or COVER (إعلان، بوستر، شهادة، بطاقة، دعوة، لوجو، شعار، بنر، غلاف، منشور) — e.g. "صمم لي إعلان لهذا العقار مع الرقم" — the output is a STATIC VISUAL DESIGN, NOT an app. STRICTLY FORBIDDEN: navigation bars, menus, tabs, forms, input fields, multiple screens, or any app chrome. Deliver: (1) ONE polished poster centered on the page with a suitable aspect ratio (square or 4:5 for ads, landscape for certificates), built with rich CSS graphics — gradients, shapes, glow, elegant Arabic-friendly fonts via Google Fonts CDN, decorative SVG elements matching the subject (e.g. a building silhouette for real estate). (2) Every text and phone number the user provided must appear EXACTLY as written, large, high-contrast and instantly readable — phone numbers extra large. (3) Exactly ONE floating action button "⬇️ حفظ كصورة" fixed at the bottom, using html2canvas via CDN (https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js) to capture ONLY the poster element at scale:2 and download it as PNG. (4) NEVER present design options or variants or ask the user to choose — produce one beautiful finished design immediately; if the user later asks for changes (color, size, background, new design), modify exactly what was requested and return the full updated file. (5) REAL PHOTO BACKGROUNDS: when the user asks for a photo background (خلفية صور أبراج/مدينة/بحر…) or the subject is real estate / towers / city, you MUST use a REAL photograph as the poster background via CSS background-image with a dark gradient overlay for text readability — use these verified working URLs (pick the most fitting, you may combine several as section images like professional real-estate ads): Dubai Burj Khalifa skyline https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=1600&q=80 ; Dubai towers https://images.unsplash.com/photo-1518684079-3c830dcef090?w=1600&q=80 ; Dubai marina towers https://images.unsplash.com/photo-1546412414-e1885259563a?w=1600&q=80 ; city skyline https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=1600&q=80 ; modern buildings https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=1600&q=80 ; BRIGHT DAYTIME Dubai skyline (use this when clarity matters) https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=2400&q=90 . NEVER claim you cannot add real photos. (6) NAMES: STRICTLY FORBIDDEN to invent any company/brand/person name (e.g. "عقارات النخبة الذهبية") — use ONLY names and texts the user explicitly provided; if the user gave no company name, omit it entirely. (7) ARABIC TEXT SAFETY: STRICTLY FORBIDDEN to use letter-spacing (or any non-zero letter-spacing value) on ANY Arabic text — it breaks Arabic letter joining when saved as image; set letter-spacing:0 explicitly on Arabic elements. (8) NO TEXT CLIPPING: every text element must have generous inner padding (min 24px from poster edges), overflow visible, and NO fixed widths that cut words — long titles must wrap, never be clipped at the edge. (9) BACKGROUND CLARITY (mandatory): the background photo must stay SHARP and clearly visible — STRICTLY FORBIDDEN to apply filter:blur() or backdrop-filter:blur() to the background image itself, and any dark overlay on it must not exceed rgba(0,0,0,0.35) total; put readability effects (glass blur, semi-transparent panels) ONLY on the small text cards, never on the whole background. If the user asks for a clearer background (وضوح الخلفية / الخلفية غير واضحة / وضّح الصورة), you MUST do ALL of these literally: (a) remove EVERY overlay, gradient layer and blur from the background (zero overlays — not reduced, REMOVED), (b) switch the background photo to a BRIGHT DAYTIME high-resolution photo (use w=2400&q=90 in the Unsplash URL) — dark night-city photos are FORBIDDEN after a clarity request because they look dim even with no overlay, (c) shrink/condense the text cards so more of the photo is visible. Never just claim you did it. (10) RTL DIRECTION (mandatory): any design containing Arabic text MUST start with <html dir="rtl" lang="ar"> and every Arabic text element must render right-to-left — otherwise punctuation marks (! ? .) appear flipped on the wrong side, which is an automatic failure. (11) NO PLAIN/EMPTY DESIGNS: a bare white card with plain text is FORBIDDEN and counts as a failed answer — EVERY design (including greeting/congratulation cards like بطاقة تهنئة مولود) must have a rich premium look: a real photo background OR a luxurious multi-color gradient, plus decorative elements (SVG shapes, ornaments, soft glow, elegant Google Fonts like Amiri/Cairo/Tajawal) matching the occasion. (12) BACKGROUND MUST MATCH THE OCCASION: the city/towers photos in rule (5) are ONLY for real-estate/business/city subjects — using them for personal occasions is FORBIDDEN and absurd (e.g. Dubai towers on a baby card = failure). Newborn/baby card (تهنئة مولود): soft pastel gradient (baby blue or blush pink with cream/gold), cute SVG ornaments (stars, moon, clouds, balloons, tiny footprints). Wedding/engagement (زواج/خطوبة): elegant cream-gold with floral SVG ornaments. Eid/Ramadan (عيد/رمضان): deep green or navy with gold crescent, lanterns, Islamic patterns. Graduation (تخرج): navy-gold with cap and stars. Birthday (عيد ميلاد): festive colorful with balloons and confetti. Pick the theme from the occasion mentioned by the user, never default to city photos. (13) NO INVENTED CONTACT INFO (mandatory): STRICTLY FORBIDDEN to invent or add any phone number, WhatsApp number, email, address or website that the user did not explicitly provide — a made-up phone number on a design is an automatic failure; if the user gave no contact info, the design simply has none. (14) AD TEXT PLACEMENT QUESTION (mandatory): when the user requests a commercial AD (إعلان بيع/إيجار/ترويج لسيارة أو عقار أو منتج أو خدمة) and has NOT yet specified whether the text goes inside or outside the photo — and no earlier answer exists in this conversation — you MUST reply with ONLY this short question and nothing else (no design, no code): «📢 تبي كتابة تفاصيل الإعلان داخل الصورة نفسها، ولا الصورة بروحها والتفاصيل خارجها؟ (داخل / خارج)». This single question is the ONLY exception to rule (4). Once the user answers (داخل/فوق الصورة = INSIDE; خارج/تحت/حولها = OUTSIDE) or already specified it, immediately produce the COMPLETE design with zero further questions. Never ask it twice for the same ad, and never ask it for certificates/greeting cards/invitations/logos — commercial ads only. (15) AD TEMPLATE MODES: INSIDE mode = the photo is the FULL poster background (sharp, total dark overlay ≤ rgba(0,0,0,0.35)) with texts on small elegant glass cards over it — title at top, big gold price card, contact bar at the bottom. OUTSIDE mode = professional structured template top-to-bottom: ① top ribbon banner (e.g. «للبيــع» in gold on dark), ② hero photo inside a rounded framed card with a subtle gold border, ③ specs grid of 4–6 items each with a professional SVG line icon (NEVER emoji icons) — car: الموديل/السنة/الممشى/الجير/اللون/المواصفات; real-estate: الغرف/الحمامات/المساحة/المواقف/الطابق; product/service: key features; ④ large price card, ⑤ contact card ONLY if the user gave contact info. Category themes: car = dark navy #0d1b2a + gold #d4af37; real-estate = deep navy or green + gold; product = clean light with one brand accent; service = premium gradient; event ads follow rule (12) occasion themes. Only the data the user provided appears — empty fields are omitted, never invented. (16) USER PHOTO = HERO (mandatory): if the user attached a photo for the ad (or the message notes an attached ad photo), that photo MUST be the hero image — write EXACTLY src="__USER_IMAGE__" for the hero <img>, or background-image:url(\'__USER_IMAGE__\') in INSIDE mode; the app substitutes the real photo automatically. STRICTLY FORBIDDEN to use any stock/Unsplash photo when the user provided one, and never distort or flip the user\'s photo.';
const NO_FAKE_EDIT_RULE = '\nNO-FAKE-EDIT RULE (mandatory, highest priority): when the user reports a bug or asks for a modification to an existing app/game/design (poster, card, certificate, logo…), you are STRICTLY FORBIDDEN from replying with only words like "عدّلت" or "أضفت" or a list of claimed changes. Every fix/modification reply MUST contain the COMPLETE updated HTML file inside one fenced code block, with the fix actually implemented in the code. A reply without the full code block is invalid. Specifically for touch-control bugs: rewrite the control handlers using pointerdown/pointerup AND touchstart/touchend with e.preventDefault() and { passive:false }, attach them to large fixed overlay buttons, and verify every on-screen button has a working handler.'
+ '\nNO-FAKE-PROMISE RULE (mandatory, highest priority): you are a TEXT model with NO ability to generate, render, draw or attach images, architectural renders, floor plans or videos. You are STRICTLY FORBIDDEN from promising to create any visual (e.g. "سأقوم بإنشاء منظور/مخطط", "إذا أعدت إرسال الطلب سأنشئ", "I will generate an image"), from listing visuals you will deliver, and from claiming you created one. If the user asks for an image/render/visual, reply with ONE short sentence telling them to phrase it with a drawing word (مثل: "ارسم لي..." أو "تصور معماري لـ...") so the built-in image generator runs — nothing more. Never promise future delivery and never describe the visuals as if they exist.';
const TOPIC_FOLLOW_RULE = '\nTOPIC FOLLOW RULE (mandatory, highest priority): the user\'s LATEST message is your ONLY reference for what to do now. If the latest message changes the topic, follow the new topic IMMEDIATELY and completely drop the previous topic — never continue, mention, or mix in the old topic unless the user himself returns to it. Conversation history is background context only, never a task list. Requests like exams/tests/quizzes/tools/apps must be built as an interactive HTML app, NEVER as a Python script, unless the user explicitly asks for Python.';
const CHAT_STYLE_RULE = '\nCHAT STYLE RULE (mandatory): outside the single fenced code block, use 1 to 3 short natural sentences in the user\'s language to state what was built or changed. Add a question or next step only when a real choice, blocker or unfinished action remains; never append suggestions automatically. NEVER put code, HTML tags, CSS, function names in backticks, or technical snippets in the conversational text. All code goes ONLY inside one fenced ``` block. The chat must read like a discussion between two people, never like documentation.'
// ✅ v303: ممنوع «أنا موديل نصي لا أرسم» + ممنوع سلسلة الاستيضاحات + الرد القصير الموافق = تنفيذ فوري.
const APP_CAPABILITY_RULE = '\nAPP CAPABILITY RULE (mandatory): This app AUTOMATICALLY generates real images (floor plans, facades, posters, photos) around your text replies. NEVER say you are a text-only model, that you cannot draw, or tell the user to type a different command to get an image — the app already handles image generation. FORBIDDEN: asking more than ONE clarifying question in a conversation thread. If the user replies with a short affirmative (نعم / ابدأ / يلا / تمام / ok / yes) or names a part of your own previous proposal (المخطط / الواجهة / الشكل الخارجي...), that IS full approval of your last proposal — execute it completely and immediately, never ask what they mean.';
+ '\nADDRESSING RULE (mandatory): NEVER call the user by any name (like عبدالله or أحمد) unless the user explicitly told you their name in THIS conversation. If you do not know the name, use no name at all.'
+ '\nGREETING RULE (mandatory): greet AT MOST ONCE per conversation — only if the user greeted you in their CURRENT message AND you have not greeted before in this conversation. NEVER open a reply with هلا/أهلاً/مرحبا/وعليكم السلام otherwise. Go straight to the answer.'
+ '\nPERSONA RULE (mandatory): you are a warm, sharp Gulf-Arabic assistant. Never call the user "كابتن" or any nickname. Keep replies SHORT (2-4 sentences), human and direct. Add ONE concrete next-step suggestion or question only when a real choice, blocker or unfinished action remains; otherwise end after the answer. No generic filler, no lecture-style advice, no bullet lists in casual chat.'
+ '\nTOPIC RULE (mandatory): each user message may be a completely NEW topic. Detect topic switches instantly and answer the NEW topic only — never drag the previous topic into the reply or re-answer it.'
+ '\nQUESTION RULE (mandatory): if the user asks a question or wants a discussion, ONLY answer it. Do NOT offer to build an app, do NOT produce code, and do NOT list app screens unless the user explicitly commanded you to build something.'
+ '\nCONSULTATION RULE (mandatory): when the user explicitly asks for your opinion, advice or a discussion (شو رايك، وش تنصح، ناقشني، عطني رايك، أيهما أفضل، استشارة), switch to a thoughtful consultant style: give a clear honest opinion, 2-3 concrete reasons, mention one trade-off, and end with a short conclusion (خلاصة). This is the ONLY case where a longer structured reply is allowed — still no code and no offering to build.'
+ '\nLANGUAGE PURITY RULE (mandatory): reply ENTIRELY in the user\'s language. If the user writes Arabic, the whole reply must be Arabic — never mix English sentences or phrases into an Arabic reply (technical proper nouns like HTML are fine).'
+ '\nNO VISIBLE THINKING RULE (mandatory, highest priority): NEVER print your internal reasoning, chain-of-thought, self-analysis, rule-checking or planning process in the reply (e.g. "Okay, let me unpack this", "First, checking the system rules", "Final check"). All thinking stays silent and internal — output ONLY the final polished answer itself, nothing else.';

// تنظيف نص المحادثة: يشيل أي كود متبقي (مسيّج أو خام) حتى لا يظهر في الدردشة.
// 🔒 أثناء البث الحي: أول ما يبدأ المزود يكتب كودًا (سياج ``` أو HTML خام)
// نقص العرض عند بداية الكود ونظهر مؤشر "يكتب الكود" بدل عرض الكود في المحادثة.
function liveStripCode(text){
  if(!text) return '';
  const i = text.search(/```|<!doctype html|<html[\s>]/i);
  if(i === -1) return text;
  const before = text.slice(0, i).trim();
  const lang = localStorage.getItem('aiapp_lang') || 'ar';
  const label = (lang === 'ar') ? '⏳ يكتب الكود الآن…' : '⏳ Writing the code…';
  return (before ? before + '\n\n' : '') + label;
}

function stripCodeFromChat(text){
  if(!text) return '';
  let out = String(text)
    .replace(/```[\s\S]*?```/g, '')      // fenced blocks
    .replace(/```[\s\S]*$/g, '');        // unclosed fence to end
  // أسطر تبدو كود خام (وسوم HTML / CSS / JS) تنحذف
  out = out.split('\n').filter(line => {
    const s = line.trim();
    if(!s) return true;
    if(/^<[a-zA-Z!\/]/.test(s)) return false;
    if(/^[.#@][\w-]+\s*\{/.test(s) || /^\}\s*$/.test(s)) return false;
    if(/^(const|let|var|function|import|export|document\.|window\.)\b/.test(s)) return false;
    return true;
  }).join('\n');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

async function planBuildSteps(text){
  const langName = ({ar:'Arabic',en:'English',fr:'French',hi:'Hindi',ur:'Urdu',bn:'Bengali',ne:'Nepali',id:'Indonesian',fil:'Filipino',tr:'Turkish',zh:'Simplified Chinese',ru:'Russian',es:'Spanish',ml:'Malayalam'})[localStorage.getItem('aiapp_lang') || 'ar'] || 'Arabic';
  const msgs = [
    { role: 'system', content: 'You are an expert app architect. Turn the user\'s app-building request into ONE unified blueprint that every builder must follow exactly. If the request is a clone of a famous/known app (e.g. Yoho, TikTok, WhatsApp), enumerate ALL its essential screens (login, home/feed or room list, main interactive screen, chat, profile, store/coins, etc.) — never stop at a login screen. Reply with ONLY a JSON object, nothing else: {"name":"app name","style":"one line: exact color theme + visual style","screens":["every screen"],"steps":["4-10 short build steps in ' + langName + ', each max 12 words"]}' },
    { role: 'user', content: text }
  ];
  const res = await callAIWithFallback(msgs, () => {});
  const raw = ((res && res.reply) || '');
  const om = raw.match(/\{[\s\S]*\}/);
  if(om){
    try{
      const o = JSON.parse(om[0]);
      const arr = o && o.steps;
      if(Array.isArray(arr) && arr.length >= 2 && arr.every(s => typeof s === 'string')){
        const steps = arr.slice(0, 10);
        let spec = '';
        if(o.name) spec += 'App name: ' + o.name + '\n';
        if(o.style) spec += 'Visual style: ' + o.style + '\n';
        if(Array.isArray(o.screens) && o.screens.length) spec += 'Screens (ALL required): ' + o.screens.join(' | ') + '\n';
        steps.__spec = spec;
        return steps;
      }
    }catch(e){ __swallow(e, "misc:app-06-checkout#3"); }
  }
  const m = raw.match(/\[[\s\S]*?\]/);
  if(!m) return null;
  try{
    const arr = JSON.parse(m[0]);
    if(Array.isArray(arr) && arr.length >= 2 && arr.length <= 12 && arr.every(s => typeof s === 'string')) return arr.slice(0, 10);
  }catch(e){ __swallow(e, "misc:app-06-checkout#4"); }
  return null;
}
async function verifyBuildSteps(code, steps){
  const msgs = [
    { role: 'system', content: 'You are a strict code reviewer. You receive an HTML app and a list of required build steps. For EACH step decide if the code implements it. Reply with ONLY a JSON array of booleans (same length/order as the steps), nothing else.' },
    { role: 'user', content: 'Steps:\n' + steps.map((s, i) => (i + 1) + '. ' + s).join('\n') + '\n\nCode:\n```html\n' + String(code).slice(0, 60000) + '\n```' }
  ];
  const res = await callAIWithFallback(msgs, () => {});
  const m = ((res && res.reply) || '').match(/\[[\s\S]*?\]/);
  if(!m) return null;
  try{
    const arr = JSON.parse(m[0]);
    if(Array.isArray(arr) && arr.length === steps.length) return arr.map(Boolean);
  }catch(e){ __swallow(e, "misc:app-06-checkout#5"); }
  return null;
}

function testCodeInSandbox(code){
  return new Promise((resolve) => {
    const errors = [];
    const token = 'heal_' + Math.random().toString(36).slice(2);
    const catcher = '<scr' + 'ipt>(function(){function send(m){try{parent.postMessage({__heal:"' + token + '",err:String(m).slice(0,400)},"*");}catch(e){ __swallow(e, "misc:app-06-checkout#6"); }}window.addEventListener("error",function(e){send((e.message||"Script error")+(e.lineno?" [line "+e.lineno+"]":""));});window.addEventListener("unhandledrejection",function(e){send("Unhandled rejection: "+((e.reason&&e.reason.message)||e.reason));});})();</scr' + 'ipt>';
    let html = String(code);
    if(/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, m => m + catcher);
    else html = catcher + html;
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.style.cssText = 'position:fixed;width:2px;height:2px;left:-9999px;top:-9999px;visibility:hidden;pointer-events:none;';
    const onMsg = (e) => {
      if(e.data && e.data.__heal === token && errors.length < 5){
        const msg = e.data.err;
        if(msg && !errors.includes(msg)) errors.push(msg);
      }
    };
    window.addEventListener('message', onMsg);
    frame.srcdoc = html;
    document.body.appendChild(frame);
    setTimeout(() => {
      window.removeEventListener('message', onMsg);
      try{ frame.remove(); }catch(e){ __swallow(e, "misc:app-06-checkout#7"); }
      resolve(errors);
    }, 2500);
  });
}

async function selfHealCode(code, codeType, onStatus){
  // نفحص فقط أكواد HTML القابلة للعرض في المعاينة
  if(!code || (codeType && codeType !== 'html' && codeType !== '') || !/<\w+[^>]*>/.test(code)) return code;
  let current = code;
  for(let attempt = 1; attempt <= 2; attempt++){
    let errors;
    try{ errors = await testCodeInSandbox(current); }catch(e){ return current; }
    if(!errors.length) return current;
    console.log('[selfHeal] attempt ' + attempt + ' errors:', errors);
    if(onStatus) try{ onStatus(attempt, errors); }catch(e){ __swallow(e, "misc:app-06-checkout#8"); }
    try{
      const fixMessages = [
        { role: 'system', content: 'You are a senior code fixer. You receive a complete HTML file and the JavaScript runtime errors it produced when executed. Return the FULL corrected HTML file inside a single ```html code fence. Keep the design, texts and all features exactly the same - fix ONLY the errors. No explanations outside the fence.' },
        { role: 'user', content: 'Runtime errors:\n' + errors.join('\n') + '\n\nCode:\n```html\n' + current + '\n```' }
      ];
      const res = await callAIWithFallback(fixMessages, () => {});
      const fixed = extractReply((res && res.reply) || '');
      if(fixed.code && fixed.code.length > current.length * 0.5){
        current = fixed.code;
      } else {
        return current;
      }
    }catch(e){
      return current;
    }
  }
  return current;
}

// 🪧 v300: استبدال صورة المستخدم المرفقة مكان __USER_IMAGE__ في تصاميم الإعلانات
function substUserImage(code){
  // 🎨 الصور التي رسمها النموذج بنفسه في هذا الردّ: الرمز → data URI.
  // يجري قبل __USER_IMAGE__ لأنّ الاثنين قد يجتمعان في صفحة واحدة.
  try{
    if(code && code.indexOf('__IMG_') !== -1 && window.__genImages){
      for(const k in window.__genImages){
        if(code.indexOf(k) !== -1) code = code.split(k).join(window.__genImages[k]);
      }
    }
  }catch(e){ __swallow(e, 'img:subst'); }
  try{
    if(code && code.indexOf('__USER_IMAGE__') !== -1){
      const c = getCurrent();
      const im = c && c.lastEditedImage;
      if(im && im.b64){
        return code.split('__USER_IMAGE__').join('data:' + (im.mime || 'image/png') + ';base64,' + im.b64);
      }
    }
  }catch(e){ __swallow(e, "misc:app-06-checkout#9"); }
  return code;
}
function extractHtml(text){
  const match = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if(match) return substUserImage(match[1].trim());
  return substUserImage(text.trim());
}

// 🧹 يشيل "التفكير الداخلي" المسرّب من بعض النماذج (DeepSeek R1 وأمثاله):
// وسوم <think> الصريحة + فقرات التحليل الإنجليزية الطويلة قبل الجواب العربي.
function stripLeakedThinking(text){
  if(!text) return text;
  let out = String(text);
  // 1) وسوم التفكير الصريحة
  out = out.replace(/<\s*(think|thinking|thought|reasoning)\s*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '').trim();
  // 2) فقرات تمهيدية إنجليزية طويلة (تحليل داخلي) قبل جواب عربي
  const paras = out.split(/\n\s*\n/);
  if(paras.length >= 2){
    let cut = 0, dropped = 0;
    for(let i = 0; i < paras.length - 1; i++){
      const p = paras[i];
      const latin = (p.match(/[A-Za-z]/g) || []).length;
      const arab = (p.match(/[\u0600-\u06FF]/g) || []).length;
      const cotHint = /\b(okay|alright|let me|first,|checking|the user|i need to|final check|per the|unpack)\b/i.test(p);
      if(latin > 60 && latin > arab * 2 && cotHint){ cut = i + 1; dropped += p.length; }
      else break;
    }
    if(cut > 0 && dropped >= 150){
      const rest = paras.slice(cut).join('\n\n').trim();
      const restArab = (rest.match(/[\u0600-\u06FF]/g) || []).length;
      if(rest && restArab >= 5) out = rest;
    }
  }
  return out;
}
function extractReply(text){
  const __r = extractReplyRaw(text);
  if(__r && __r.code) __r.code = substUserImage(__r.code);
  return __r;
}
function extractReplyRaw(text){
  text = stripLeakedThinking(text);
  const match = text.match(/```(\w*)\s*\n?([\s\S]*?)```/);
  if(match){
    const lang = (match[1] || '').toLowerCase();
    const code = match[2].trim();
    const explanation = (text.slice(0, match.index) + text.slice(match.index + match[0].length)).trim();
    if((lang === 'python' || lang === 'py') && code.length > 3){
      return { code, explanation, codeType: 'python' };
    }
    const looksLikeApp = code.length > 40 && /<html|<!doctype|<body|<script|<style|<div|<head/i.test(code);
    if(looksLikeApp || lang === 'html'){
      return { code, explanation, codeType: 'html' };
    }
  }
  // No CLOSED fence found - but the provider may have hit its max-token limit
  // mid-code, leaving an opening ``` with no closing one. Treat everything
  // from that opening fence onward as (incomplete) code so it never renders
  // raw in the chat bubble; only the text before it becomes the explanation.
  const openMatch = text.match(/```(\w*)\s*\n?/);
  if(openMatch){
    const lang = (openMatch[1] || '').toLowerCase();
    const code = text.slice(openMatch.index + openMatch[0].length).trim();
    const explanation = text.slice(0, openMatch.index).trim();
    const looksLikeApp = code.length > 40 && /<html|<!doctype|<body|<script|<style|<div|<head/i.test(code);
    if(code.length > 3 && (lang === 'python' || lang === 'py')){
      return { code, explanation, codeType: 'python' };
    }
    if(code.length > 3 && (looksLikeApp || lang === 'html')){
      return { code, explanation, codeType: 'html' };
    }
  }
  // Raw HTML with NO fences at all (some providers dump the full document
  // as plain text). Detect it and route it to the code panel instead of chat.
  const rawIdx = text.search(/<!doctype html|<html[\s>]/i);
  if(rawIdx !== -1){
    const endIdx = text.lastIndexOf('</html>');
    const code = (endIdx !== -1 ? text.slice(rawIdx, endIdx + 7) : text.slice(rawIdx)).trim();
    if(code.length > 200){
      const explanation = (text.slice(0, rawIdx) + (endIdx !== -1 ? text.slice(endIdx + 7) : '')).trim();
      return { code, explanation, codeType: 'html' };
    }
  }
  // 🩹 v490: مقطع كود بلا سياج ولا <html> (يبدأ بـ<div>/<style>/<script>…).
  // بدونه كان يُمسح من فقاعة المحادثة (stripCodeFromChat) ولا يصل المعاينة أبدًا
  // = فجوة بيضاء صامتة. نلتقطه ونلفّه في مستند كامل ليُعرض.
  const fragM = text.match(/^[ \t]*<(div|style|script|body|canvas|section|main|form|svg|table|nav|header|article)[\s>]/im);
  if(fragM){
    const start = fragM.index + fragM[0].indexOf('<');
    let end = -1;
    ['div','style','script','body','canvas','section','main','form','svg','table','nav','header','article'].forEach(function(tg){
      const j = text.lastIndexOf('</' + tg + '>');
      if(j !== -1 && j + tg.length + 3 > end) end = j + tg.length + 3;
    });
    if(end <= start) end = text.length;
    let code = text.slice(start, end).trim();
    if(code.length > 200 && /<\/[a-z]+>/i.test(code)){
      const explanation = (text.slice(0, start) + '\n' + text.slice(end)).trim();
      if(!/<html[\s>]|<!doctype/i.test(code)){
        code = '<!doctype html>\n<html lang="ar">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n</head>\n<body>\n' + code + '\n</body>\n</html>';
      }
      return { code: code, explanation: explanation, codeType: 'html' };
    }
  }
  return { code: '', explanation: text.trim(), codeType: '' };
}

function throwProviderError(status, errText){
  // Every thrown error carries the original HTTP status on `.status` so callers
  // (like the auto-fallback logic in callAIWithFallback) can tell a rate-limit
  // (429) or daily-quota (402) failure apart from a hard failure worth surfacing
  // immediately (auth, bad request, etc.).
  let err;
  if(status === 402){
    // 👑 الرد الاحترافي: 402 مع reason:'points' يعني نفاد النقاط (وليس حد يومي).
    let __pointsErr = false;
    try{
      const __p = JSON.parse(errText);
      if(__p && (__p.reason === 'points' || __p.error === 'insufficient_points')) __pointsErr = true;
    }catch(_){ if(/insufficient_points|"reason"\s*:\s*"points"/.test(errText || '')) __pointsErr = true; }
    err = new Error(t('dailyLimitError'));
    if(__pointsErr) err.premiumNoPoints = true;
  } else if(status === 429){
    err = new Error(t('quotaError'));
  } else if(status === 401 || status === 403){
    // Our own free-trial server proxies (openai/groq/claude) return a JSON
    // {error: '...session expired...'} when the login token is missing/invalid,
    // which is different from a bad upstream provider API key.
    let sessionMsg = null;
    try{
      const parsed = JSON.parse(errText);
      if(parsed && parsed.error && /الجلسة|session/i.test(parsed.error)) sessionMsg = parsed.error;
    }catch(e){ __swallow(e, "auth:app-06-checkout#10"); }
    err = sessionMsg ? new Error('🔒 ' + sessionMsg) : new Error(t('authError'));
  } else {
    err = new Error(t('providerError') + status + ' - ' + (errText || '').slice(0, 200));
  }
  err.status = status;
  // v-claude-shape: مقتطف خطأ المزود الأصلي يظهر في سطر الحالة — «HTTP 400»
  // وحدها كانت تخفي السبب الحقيقي (شكل رسائل مرفوض، مفتاح، نموذج...).
  err.upstreamText = String(errText || '').replace(/\s+/g, ' ').slice(0, 160);
  throw err;
}

function toOpenAIVisionMessages(messages){
  return messages.map(m => {
    if(m.images && m.images.length){
      const content = [{ type: 'text', text: m.content }];
      m.images.forEach(img => content.push({ type: 'image_url', image_url: { url: img.dataUrl } }));
      return { role: m.role, content };
    }
    return { role: m.role, content: m.content };
  });
}

// Vision-capable model overrides used ONLY when an image is attached, so "Ask All"
// still gets every one of the 9 providers to weigh in on an attached image, even
// though each provider's normal default chat model is text-only.
const GROQ_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const MISTRAL_VISION_MODEL = 'pixtral-12b-2409';
const OPENROUTER_VISION_MODEL = 'meta-llama/llama-4-scout';

// DeepSeek, Cohere and Perplexity have no image-input model at all (with any key),
// so when an image is attached we first ask Gemini for a detailed text description
// of it, then hand that description to these providers as plain text instead of the
// image itself - so they can still give a relevant answer about it. The description
// is generated once per message and cached on the message object so every provider
// in one "Ask All" round reuses the same single Gemini call instead of repeating it.
async function getImageDescriptionForMessages(messages){
  const lastImgMsg = messages.filter(m => m.images && m.images.length).slice(-1)[0];
  if(!lastImgMsg) return null;
  if(lastImgMsg._imgDescCache !== undefined) return lastImgMsg._imgDescCache;
  if(!lastImgMsg._imgDescPromise){
    lastImgMsg._imgDescPromise = (async () => {
      try{
        const descMessages = [
          { role: 'system', content: 'صف هذه الصورة أو الصور وصفًا قويًا وشاملًا: أولًا انقل كل نص ظاهر فيها حرفيًا كما هو (عربي/إنجليزي/أرقام/جداول) بدون تلخيص، ثم صف العناصر والأشخاص والألوان والمكان والسياق وأي ملاحظات أو أخطاء مهمة. اكتب مباشرة بدون مقدمات، ليستخدمه نموذج آخر لا يملك القدرة على رؤية الصور.' },
          { role: 'user', content: lastImgMsg.content || 'صف هذه الصورة بالتفصيل', images: lastImgMsg.images },
        ];
        return await callGemini(descMessages, null);
      }catch(e){
        return null;
      }
    })();
  }
  const result = await lastImgMsg._imgDescPromise;
  lastImgMsg._imgDescCache = result;
  return result;
}

// Replaces any image attachment with the Gemini-generated text description above
// (falls back to plain stripping if the description call failed for any reason).
async function stripImagesWithDescription(messages){
  const hasImages = messages.some(m => m.images && m.images.length);
  if(!hasImages) return messages.map(m => ({ role: m.role, content: m.content }));
  const description = await getImageDescriptionForMessages(messages);
  return messages.map(m => {
    if(m.images && m.images.length && description){
      return { role: m.role, content: (m.content || '') + '\n\n[وصف تلقائي للصورة المرفقة من نموذج آخر يدعم الرؤية، لأن هذا النموذج لا يدعم تحليل الصور مباشرة:\n' + description + ']' };
    }
    return { role: m.role, content: m.content };
  });
}

// Reads an OpenAI-compatible SSE stream (used by OpenAI, Groq, OpenRouter,
// Perplexity, Mistral, DeepSeek, Cohere) line-by-line, extracting the growing
// text via each chunk's `choices[0].delta.content`. Calls onDelta(fullTextSoFar)
// after every new piece of text so the UI can show a live typing effect.
// Returns the final full text once the stream ends.
async function readOpenAICompatibleStream(res, onDelta){
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let hadReasoning = false;
  while(true){
    const { done, value } = await reader.read();
    if(done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for(const line of lines){
      const trimmed = line.trim();
      if(!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if(payload === '[DONE]') continue;
      try{
        const json = JSON.parse(payload);
        const d = json.choices && json.choices[0] ? json.choices[0].delta : null;
        const delta = d ? d.content : null;
        if(delta){
          full += delta;
          if(onDelta) onDelta(full);
        } else if(d && d.reasoning_content && !full){
          // 🆕 (27/7) موديلات التفكير (DeepSeek v4) تبث reasoning_content قبل الرد —
          // نعرض مؤشر تفكير حتى لا تبدو الواجهة معلّقة.
          hadReasoning = true;
          if(onDelta) onDelta('🧠 يفكر الآن…');
        }
      }catch(e){ /* ignore partial/malformed chunk */ }
    }
  }
  // v207: إذا انتهى البث أثناء التفكير بدون أي رد فعلي (انقطاع/مهلة) —
  // نرمي خطأ 503 حتى ينتقل النظام تلقائيًا لمزود بديل بدل تعليق «يفكر الآن…».
  if(!full && hadReasoning){
    const err = new Error('thinking stream ended without content');
    err.status = 503;
    throw err;
  }
  return full;
}

// Reads a Gemini SSE stream (`alt=sse`), where each event is a full
// GenerateContentResponse chunk whose parts contain the newly generated text.
async function readGeminiStream(res, onDelta){
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  while(true){
    const { done, value } = await reader.read();
    if(done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for(const line of lines){
      const trimmed = line.trim();
      if(!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if(!payload) continue;
      try{
        const json = JSON.parse(payload);
        const parts = json.candidates && json.candidates[0] && json.candidates[0].content ? json.candidates[0].content.parts : null;
        if(parts){
          const text = parts.map(p => p.text || '').join('');
          if(text){
            full += text;
            if(onDelta) onDelta(full);
          }
        }
      }catch(e){ /* ignore partial/malformed chunk */ }
    }
  }
  return full;
}

// Reads an Anthropic Claude SSE stream, where `content_block_delta` events
// carry `delta.text` pieces to append.
async function readClaudeStream(res, onDelta){
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  while(true){
    const { done, value } = await reader.read();
    if(done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for(const line of lines){
      const trimmed = line.trim();
      if(!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if(!payload) continue;
      try{
        const json = JSON.parse(payload);
        if(json.type === 'content_block_delta' && json.delta && typeof json.delta.text === 'string'){
          full += json.delta.text;
          if(onDelta) onDelta(full);
        }
      }catch(e){ /* ignore partial/malformed chunk */ }
    }
  }
  return full;
}

async function callOpenAILike(messages, onDelta){
  const apiKey = localStorage.getItem('aiapp_apikey');
  const model = localStorage.getItem('aiapp_model') || 'gpt-4o-mini';
  // If the visitor hasn't entered their own OpenAI key, fall back to the server-side
  // proxy which uses the site owner's key (for quick trials without setup).
  if(!apiKey){
    const res = await fetch('/api/openai', {
      signal: (typeof genAbortController !== 'undefined' && genAbortController) ? genAbortController.signal : undefined,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: toOpenAIVisionMessages(messages), token: authGet('aiapp_auth_token'), guestId: window.getGuestId(), stream: !!onDelta, premium: (window.__premiumOn === true), mode: AI_MODE_NAME() }),
    });
    if(!res.ok){
      const errText = await res.text();
      throwProviderError(res.status, errText);
    }
    if(onDelta) return await readOpenAICompatibleStream(res, onDelta);
    const data = await res.json();
    return data.choices[0].message.content;
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
      signal: (typeof genAbortController !== 'undefined' && genAbortController) ? genAbortController.signal : undefined,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify({ model, messages: toOpenAIVisionMessages(messages), temperature: 0.7, stream: !!onDelta }),
  });
  if(!res.ok){
    const errText = await res.text();
    throwProviderError(res.status, errText);
  }
  if(onDelta) return await readOpenAICompatibleStream(res, onDelta);
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callOpenRouter(messages, onDelta){
  const apiKey = localStorage.getItem('aiapp_openrouter_apikey');
  const hasImages = messages.some(m => m.images && m.images.length);
  const model = hasImages ? OPENROUTER_VISION_MODEL : (localStorage.getItem('aiapp_openrouter_model') || 'openai/gpt-4o-mini');
  // If the visitor hasn't entered their own OpenRouter key, fall back to the server-side
  // proxy which uses the site owner's key (for quick trials without setup).
  if(!apiKey){
    const res = await fetch('/api/openrouter', {
      signal: (typeof genAbortController !== 'undefined' && genAbortController) ? genAbortController.signal : undefined,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: toOpenAIVisionMessages(messages), token: authGet('aiapp_auth_token'), guestId: window.getGuestId(), stream: !!onDelta }),
    });
    if(!res.ok){
      const errText = await res.text();
      throwProviderError(res.status, errText);
    }
    if(onDelta) return await readOpenAICompatibleStream(res, onDelta);
    const data = await res.json();
    return data.choices[0].message.content;
  }
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      signal: (typeof genAbortController !== 'undefined' && genAbortController) ? genAbortController.signal : undefined,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify({ model, messages: toOpenAIVisionMessages(messages), temperature: 0.7, stream: !!onDelta }),
  });
  if(!res.ok){
    const errText = await res.text();
    throwProviderError(res.status, errText);
  }
  if(onDelta) return await readOpenAICompatibleStream(res, onDelta);
  const data = await res.json();
  return data.choices[0].message.content;
}

function stripPplxCitations(s){
  return String(s || '')
    .replace(/\[\d{1,3}\]/g, '')
    // v285: حذف أي صورة يحشرها Perplexity داخل الرد (ماركداون أو رابط صورة مباشر)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/https?:\/\/\S+\.(?:png|jpe?g|gif|webp)(?:\?\S*)?/gi, '');
}
async function callPerplexity(messages, onDelta){
  const apiKey = localStorage.getItem('aiapp_perplexity_apikey');
  const model = localStorage.getItem('aiapp_perplexity_model') || 'sonar';
  let plainMessages = await stripImagesWithDescription(messages);
  plainMessages = [{ role: 'system', content: 'قاعدة صارمة: إذا كانت رسالة المستخدم تحية لفظية فقط (مثل: السلام عليكم، مرحبا، هلا، صباح الخير) فاكتفِ بتحية قصيرة وطبيعية من دون صيغة ثابتة أو بحث أو مصادر؛ لا تطرح أي سؤال ولا تعرض المساعدة. أمّا سؤال المجاملة مثل «كيف حالك؟» فأجب عن حالك مباشرة واسأل المستخدم عن حاله عند الملاءمة؛ لا تكرر التحية ولا تعرض المساعدة بدل الجواب. وفي كل الردود: ممنوع منعًا باتًا وضع أرقام مراجع أو استشهادات مثل [1] أو [2] داخل النص.' }, ...plainMessages];
  if(onDelta){ const orig = onDelta; onDelta = (chunk) => orig(stripPplxCitations(chunk)); }
  // If the visitor hasn't entered their own Perplexity key, fall back to the server-side
  // proxy which uses the site owner's key (for quick trials without setup).
  if(!apiKey){
    const res = await fetch('/api/perplexity', {
      signal: (typeof genAbortController !== 'undefined' && genAbortController) ? genAbortController.signal : undefined,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: plainMessages, token: authGet('aiapp_auth_token'), guestId: window.getGuestId(), stream: !!onDelta }),
    });
    if(!res.ok){
      const errText = await res.text();
      throwProviderError(res.status, errText);
    }
    if(onDelta) return stripPplxCitations(await readOpenAICompatibleStream(res, onDelta));
    const data = await res.json();
    return stripPplxCitations(data.choices[0].message.content);
  }
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
      signal: (typeof genAbortController !== 'undefined' && genAbortController) ? genAbortController.signal : undefined,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify({ model, messages: plainMessages, temperature: 0.7, stream: !!onDelta }),
  });
  if(!res.ok){
    const errText = await res.text();
    throwProviderError(res.status, errText);
  }
  if(onDelta) return stripPplxCitations(await readOpenAICompatibleStream(res, onDelta));
  const data = await res.json();
  return stripPplxCitations(data.choices[0].message.content);
}

async function callGemini(messages, onDelta){
  const apiKey = localStorage.getItem('aiapp_gemini_apikey');
  let model = localStorage.getItem('aiapp_gemini_model') || 'gemini-flash-latest';
  if(model === 'gemini-1.5-flash' || model === 'gemini-pro' || model === 'gemini-2.0-flash' || model === 'gemini-2.0-flash-001' || model === 'gemini-2.5-flash' || model === 'gemini-2.5-flash-lite'){ model = 'gemini-flash-latest'; localStorage.setItem('aiapp_gemini_model', model); }
  const systemMsgs = messages.filter(m => m.role === 'system');
  const systemMsg = systemMsgs.length ? { content: systemMsgs.map(m => m.content).join('\n\n') } : null;
  const rest = messages.filter(m => m.role !== 'system');
  /* Gemini is the strictest of the three on conversation shape, and it was the
     only one with no sanitising step. Claude already gets a trailing-assistant
     trim in api/ai.js (the v262 "assistant prefill" fix); GPT tolerates almost
     anything. Gemini rejects with 400 when:
       · the last turn is `model`
       · two turns in a row share a role
       · the first turn is not `user`
       · any `parts` array is empty
     Those exact states are what image edits, regenerations and silent provider
     switches leave behind — which is why it worked in a clean chat and stopped
     after attaching or editing an image. */
  const rawContents = rest.map(m => {
    const parts = [];
    const txt = String(m.content == null ? '' : m.content).trim();
    if(txt) parts.push({ text: txt });
    if(m.images && m.images.length){
      m.images.forEach(img => {
        try{
          const base64 = String(img.dataUrl || '').split(',')[1];
          if(base64) parts.push({ inline_data: { mime_type: img.mime, data: base64 } });
        }catch(e){ console.warn('[gemini] skipped an unreadable image', e); }
      });
    }
    return { role: m.role === 'assistant' ? 'model' : 'user', parts };
  }).filter(c => c.parts.length);

  const contents = sanitizeGeminiContents(rawContents);
  const systemInstruction = systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined;
  // If the visitor hasn't entered their own Gemini key, fall back to the server-side
  // proxy which uses the site owner's key (for quick trials without setup).
  if(!apiKey){
    const res = await fetch('/api/gemini', {
      signal: (typeof genAbortController !== 'undefined' && genAbortController) ? genAbortController.signal : undefined,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, contents, systemInstruction, token: authGet('aiapp_auth_token'), guestId: window.getGuestId(), stream: !!onDelta, premium: (window.__premiumOn === true), mode: AI_MODE_NAME() }),
    });
    if(!res.ok){
      const errText = await res.text();
      throwProviderError(res.status, errText);
    }
    if(onDelta) return await readGeminiStream(res, onDelta);
    const data = await res.json();
    return data.candidates[0].content.parts.map(p => p.text).join('\n');
  }
  const endpoint = onDelta
    ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = { contents };
  if(systemInstruction) body.systemInstruction = systemInstruction;
  const res = await fetch(endpoint, {
      signal: (typeof genAbortController !== 'undefined' && genAbortController) ? genAbortController.signal : undefined,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if(!res.ok){
    const errText = await res.text();
    throwProviderError(res.status, errText);
  }
  if(onDelta) return await readGeminiStream(res, onDelta);
  const data = await res.json();
  return data.candidates[0].content.parts.map(p => p.text).join('\n');
}

async function callGroq(messages, onDelta){
  const apiKey = localStorage.getItem('aiapp_groq_apikey');
  const hasImages = messages.some(m => m.images && m.images.length);
  const model = hasImages ? GROQ_VISION_MODEL : (localStorage.getItem('aiapp_groq_model') || 'llama-3.3-70b-versatile');
  const msgsOut = hasImages ? toOpenAIVisionMessages(messages) : messages;
  // If the visitor hasn't entered their own Groq key, fall back to the server-side
  // proxy which uses the site owner's key (for quick trials without setup).
  if(!apiKey){
    const res = await fetch('/api/groq', {
      signal: (typeof genAbortController !== 'undefined' && genAbortController) ? genAbortController.signal : undefined,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: msgsOut, token: authGet('aiapp_auth_token'), guestId: window.getGuestId(), stream: !!onDelta }),
    });
    if(!res.ok){
      const errText = await res.text();
      throwProviderError(res.status, errText);
    }
    if(onDelta) return await readOpenAICompatibleStream(res, onDelta);
    const data = await res.json();
    return data.choices[0].message.content;
  }
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      signal: (typeof genAbortController !== 'undefined' && genAbortController) ? genAbortController.signal : undefined,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify({ model, messages: msgsOut, temperature: 0.7, stream: !!onDelta }),
  });
  if(!res.ok){
    const errText = await res.text();
    throwProviderError(res.status, errText);
  }
  if(onDelta) return await readOpenAICompatibleStream(res, onDelta);
  const data = await res.json();
  return data.choices[0].message.content;
}

// Strips non-standard fields (like our internal `images` array) that some providers'
// APIs reject outright with "extra_forbidden" errors when messages don't support vision.
function stripToPlainMessages(messages){
  return messages.map(m => ({ role: m.role, content: m.content }));
}

async function callMistral(messages, onDelta){
  const apiKey = localStorage.getItem('aiapp_mistral_apikey');
  const model = localStorage.getItem('aiapp_mistral_model') || 'mistral-small-latest';
  // If the visitor hasn't entered their own Mistral key, fall back to the server-side
  // proxy which uses the site owner's key (for quick trials without setup).
  if(!apiKey){
    const res = await fetch('/api/mistral', {
      signal: (typeof genAbortController !== 'undefined' && genAbortController) ? genAbortController.signal : undefined,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: stripToPlainMessages(messages), token: authGet('aiapp_auth_token'), guestId: window.getGuestId(), stream: !!onDelta }),
    });
    if(!res.ok){
      const errText = await res.text();
      throwProviderError(res.status, errText);
    }
    if(onDelta) return await readOpenAICompatibleStream(res, onDelta);
    const data = await res.json();
    return data.choices[0].message.content;
  }
  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      signal: (typeof genAbortController !== 'undefined' && genAbortController) ? genAbortController.signal : undefined,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify({ model, messages: stripToPlainMessages(messages), temperature: 0.7, stream: !!onDelta }),
  });
  if(!res.ok){
    const errText = await res.text();
    throwProviderError(res.status, errText);
  }
  if(onDelta) return await readOpenAICompatibleStream(res, onDelta);
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callDeepSeek(messages, onDelta){
  const apiKey = localStorage.getItem('aiapp_deepseek_apikey');
  const model = localStorage.getItem('aiapp_deepseek_model') || 'deepseek-chat';
  const plainMessages = await stripImagesWithDescription(messages);
  // If the visitor hasn't entered their own DeepSeek key, fall back to the server-side
  // proxy which uses the site owner's key (for quick trials without setup).
  if(!apiKey){
    const res = await fetch('/api/deepseek', {
      signal: (typeof genAbortController !== 'undefined' && genAbortController) ? genAbortController.signal : undefined,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: plainMessages, token: authGet('aiapp_auth_token'), guestId: window.getGuestId(), stream: !!onDelta }),
    });
    if(!res.ok){
      const errText = await res.text();
      throwProviderError(res.status, errText);
    }
    if(onDelta) return await readOpenAICompatibleStream(res, onDelta);
    const data = await res.json();
    return data.choices[0].message.content;
  }
  const res = await fetch('https://api.deepseek.com/chat/completions', {
      signal: (typeof genAbortController !== 'undefined' && genAbortController) ? genAbortController.signal : undefined,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify({ model, messages: plainMessages, temperature: 0.7, stream: !!onDelta }),
  });
  if(!res.ok){
    const errText = await res.text();
    throwProviderError(res.status, errText);
  }
  if(onDelta) return await readOpenAICompatibleStream(res, onDelta);
  const data = await res.json();
  return data.choices[0].message.content;
}

function normalizeCohereModel(raw){
  const v = (raw || '').trim().toLowerCase();
  if(!v || v === 'command-r-plus' || v === 'command-r' || v === 'command-r-plus-08-2024' || v === 'command-r-08-2024' || v === 'command') return 'command-a-03-2025';
  return raw.trim();
}
async function callCohere(messages, onDelta){
  const apiKey = localStorage.getItem('aiapp_cohere_apikey');
  const savedModel = localStorage.getItem('aiapp_cohere_model');
  const model = normalizeCohereModel(savedModel);
  if(savedModel !== model) localStorage.setItem('aiapp_cohere_model', model);
  // If the visitor hasn't entered their own Cohere key, fall back to the server-side
  // proxy which uses the site owner's key (for quick trials without setup).
  if(!apiKey){
    const res = await fetch('/api/cohere', {
      signal: (typeof genAbortController !== 'undefined' && genAbortController) ? genAbortController.signal : undefined,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: stripToPlainMessages(messages), token: authGet('aiapp_auth_token'), guestId: window.getGuestId(), stream: !!onDelta }),
    });
    if(!res.ok){
      const errText = await res.text();
      throwProviderError(res.status, errText);
    }
    if(onDelta) return await readOpenAICompatibleStream(res, onDelta);
    const data = await res.json();
    return data.choices[0].message.content;
  }
  const res = await fetch('https://api.cohere.com/compatibility/v1/chat/completions', {
      signal: (typeof genAbortController !== 'undefined' && genAbortController) ? genAbortController.signal : undefined,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify({ model, messages: stripToPlainMessages(messages), temperature: 0.7, stream: !!onDelta }),
  });
  if(!res.ok){
    const errText = await res.text();
    throwProviderError(res.status, errText);
  }
  if(onDelta) return await readOpenAICompatibleStream(res, onDelta);
  const data = await res.json();
  return data.choices[0].message.content;
}

async function fetchClaudeModelList(apiKey){
  const res = await fetch('https://api.anthropic.com/v1/models?limit=1000', {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
  });
  if(!res.ok) return [];
  const data = await res.json();
  return (data.data || []).map(m => m.id);
}

async function claudeMessagesRequest(apiKey, model, systemMsg, rest, stream){
  return await fetch('https://api.anthropic.com/v1/messages', {
      signal: (typeof genAbortController !== 'undefined' && genAbortController) ? genAbortController.signal : undefined,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'anthropic-beta': 'output-128k-2025-02-19',
    },
    body: JSON.stringify({
      model,
      max_tokens: 16000,
      system: systemMsg ? systemMsg.content : undefined,
      messages: rest,
      stream: !!stream,
    }),
  });
}

async function claudeProxyRequest(model, systemMsg, rest, stream){
  return await fetch('/api/claude', {
      signal: (typeof genAbortController !== 'undefined' && genAbortController) ? genAbortController.signal : undefined,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      system: systemMsg ? systemMsg.content : undefined,
      messages: rest,
      token: authGet('aiapp_auth_token'), guestId: window.getGuestId(),
      stream: !!stream,
      thinking: window.__claudeThinking || undefined,
      premium: (window.__premiumOn === true),
      mode: AI_MODE_NAME(),
    }),
  });
}

async function callClaude(messages, onDelta){
  const apiKey = localStorage.getItem('aiapp_claude_apikey');
  let model = window.__claudeModelOverride || localStorage.getItem('aiapp_claude_model') || 'claude-sonnet-5';
  const systemMsgsC = messages.filter(m => m.role === 'system');
  const systemMsg = systemMsgsC.length ? { content: systemMsgsC.map(m => m.content).join('\n\n') } : null;
  let rest = messages.filter(m => m.role !== 'system').map(m => {
    if(m.images && m.images.length){
      const content = [{ type: 'text', text: m.content }];
      m.images.forEach(img => {
        const base64 = img.dataUrl.split(',')[1];
        content.push({ type: 'image', source: { type: 'base64', media_type: img.mime, data: base64 } });
      });
      return { role: m.role === 'assistant' ? 'assistant' : 'user', content };
    }
    return { role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content };
  });
  /* v-claude-shape: أنثروبيك يرفض 400 محادثة أولها assistant (كود المشروع
     يوضع كذلك في المقدمة) أو فيها محتوى فارغ أو دوران متتاليان بنفس الدور —
     كان كل رد في مشروع فيه كود يموت على كلود ويتحوّل للاحتياط. */
  rest = rest.filter(m => Array.isArray(m.content) ? m.content.length : String(m.content || '').trim());
  for(let i = rest.length - 1; i > 0; i--){
    if(rest[i].role === rest[i - 1].role && typeof rest[i].content === 'string' && typeof rest[i - 1].content === 'string'){
      rest[i - 1] = { role: rest[i - 1].role, content: rest[i - 1].content + '\n\n' + rest[i].content };
      rest.splice(i, 1);
    }
  }
  if(rest.length && rest[0].role !== 'user') rest.unshift({ role: 'user', content: 'هذا مشروعي الحالي — اعتمد عليه فيما يلي:' });
  // If the visitor hasn't entered their own Claude key, fall back to the server-side
  // proxy which uses the site owner's key (for quick trials without setup).
  if(!apiKey){
    const res = await claudeProxyRequest(model, systemMsg, rest, !!onDelta);
    if(!res.ok){
      const errText = await res.text();
      throwProviderError(res.status, errText);
    }
    if(onDelta) return await readClaudeStream(res, onDelta);
    const data = await res.json();
    return data.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
  }
  let res = await claudeMessagesRequest(apiKey, model, systemMsg, rest, !!onDelta);
  if(!res.ok && res.status === 404){
    // Model not found — auto-discover a working model from this account and retry once.
    const errTextFirst = await res.text();
    if(/model/i.test(errTextFirst) && /not_found/i.test(errTextFirst)){
      const available = await fetchClaudeModelList(apiKey);
      if(available.length){
        const preferred = available.find(id => /sonnet/i.test(id)) || available.find(id => /haiku/i.test(id)) || available[0];
        model = preferred;
        localStorage.setItem('aiapp_claude_model', model);
        const modelInput = document.getElementById('claudeModel');
        if(modelInput) modelInput.value = model;
        res = await claudeMessagesRequest(apiKey, model, systemMsg, rest, !!onDelta);
      } else {
        throwProviderError(404, errTextFirst);
      }
    } else {
      throwProviderError(404, errTextFirst);
    }
  }
  if(!res.ok){
    const errText = await res.text();
    throwProviderError(res.status, errText);
  }
  if(onDelta) return await readClaudeStream(res, onDelta);
  const data = await res.json();
  return data.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
}

// providerKey: 'default' uses the selected default provider (openai/openrouter/gemini/groq/claude/perplexity), or explicitly named
// 🛠️ v528 — المزوّدون الذين تعمل معهم حلقة الأدوات الخمس (مُتحقَّق حيًّا).
// cohere وperplexity وopenrouter خارجها عمدًا: الأوّلان لا يدعمان الأدوات على
// هذا الطريق، والثالث مفتاح المستخدم نفسه.
const TOOL_PROVIDERS = ['claude', 'openai', 'gemini', 'deepseek', 'mistral', 'groq'];

async function callProviderAI(providerKey, messages, onDelta){
  let effective = providerKey;
  if(providerKey === 'default'){
    effective = localStorage.getItem('aiapp_provider') || 'claude';
  }
  if(effective === 'gemini') return await callGemini(messages, onDelta);
  if(effective === 'groq') return await callGroq(messages, onDelta);
  if(effective === 'claude') return await callClaude(messages, onDelta);
  if(effective === 'openrouter') return await callOpenRouter(messages, onDelta);
  if(effective === 'perplexity') return await callPerplexity(messages, onDelta);
  if(effective === 'mistral') return await callMistral(messages, onDelta);
  if(effective === 'deepseek') return await callDeepSeek(messages, onDelta);
  if(effective === 'cohere') return await callCohere(messages, onDelta);
  return await callOpenAILike(messages, onDelta);
}

async function callAI(messages){
  return await callProviderAI('default', messages);
}

// Providers tried in order after the user's chosen default, skipping ones that
// need a personal API key the visitor hasn't entered (only Perplexity today).
const AUTO_FALLBACK_ORDER = ['claude', 'gemini', 'openai', 'groq'];

// Sends the chat to the user's chosen default provider; if it fails with a
// rate-limit (429) or daily-quota (402) error, automatically retries with the
// next available provider (server-side ones use the owner's keys, so this is
// invisible to the visitor besides a small "🔄 switched" note on the reply).
// Any other kind of error (auth, bad request, etc.) fails immediately instead
// of trying every provider.
// If onDelta is given, the reply streams in live (word by word); onDelta is
// called with the accumulated text so far, and is reset to empty each time a
// new provider is attempted after a fallback switch.
// v262 — 🛡️ شبكة أمان الرفض: يكشف ردود "آسف لا أستطيع" القصيرة من أي مزود
// ويحوّل الطلب بصمت للمزود التالي (محاولتان إضافيتان كحد أقصى لضبط التكلفة).
const REFUSAL_RE = /^(?:[^]{0,60})?(?:(?:آسف|عذر[اً]|أعتذر|المعذرة)[^]{0,80}?(?:لا\s*(?:أستطيع|يمكنني|أقدر)|ما\s*(?:أقدر|أستطيع|يمكنني))|لا\s*(?:أستطيع|يمكنني)\s*(?:مساعدت|تحليل|تقديم|القيام|فعل|تنفيذ|الإجابة)|I['’]?m?\s*(?:am\s*)?sorry,?\s*(?:but\s*)?I\s*can(?:['’]t|not)|I\s*can(?:['’]t|not)\s*(?:help|assist|analyz|provide|do that|answer|comply))/i;
function isRefusalReply(txt){
  const s = String(txt || '').trim();
  return s.length > 0 && s.length < 700 && REFUSAL_RE.test(s.slice(0, 220));
}
// v262 — 🎯 مصنّف التخصص (الوضع الافتراضي فقط): كل مهنة لأستاذها خلف الكواليس.
// محافظ عن قصد: الطب والقانون والبناء والعام تبقى عند Claude (الافتراضي).
/* Short social turns ("مرحبا", "شكرا", "شو رايك") don't need a frontier
   model. Routing them to the fast one is the single biggest cost saving in
   the app, and the user cannot tell the difference on a greeting.
   Deliberately narrow: only very short messages with no question depth. */
const CASUAL_RE = /^(?:\s*)(?:مرحبا|مرحبًا|مرحبتين|هلا وغلا|هلا|هلو|اهلا|أهلا|أهلًا|السلام عليكم|سلام|صباح الخير|مساء الخير|كيف حالك|كيف الحال|كيفك|شلونك|شحالك|شخبارك|شو الأخبار|تمام|تمم|اوك|أوك|اوكي|ok|okay|thanks|thank you|شكرا|شكراً|مشكور|يعطيك العافية|تسلم|باي|مع السلامة|hi|hello|hey|good morning|good evening|how are you)(?:\s|!|\.|؟|\?|,|،)*$/i;

function isCasualTurn(txt){
  const s = String(txt || '').trim();
  if(!s || s.length > 40) return false;
  return CASUAL_RE.test(s);
}

// 🎯 ٦ أغسطس — قائمة المزوّدين مخفيّة على الكمبيوتر، فالتوجيه بالتخصص يعمل للجميع هناك.
// الجوال لم يُلمس: شريطه باق، واختياره الصريح يُحترم كما كان.
function __provUiHidden(){
  try{
    return !document.documentElement.classList.contains('mobile-ui') && window.innerWidth >= 861;
  }catch(e){ return false; }
}
// 🔗 قفل المحادثة: أول مزوّد يُقرَّر لخيط يبقى له حتى نهايته، فلا تتنقّل أجوبة
// الخيط الواحد بين عقول مختلفة. البناء والإصلاح والرؤية استثناء لهذه النوبة وحدها.
function __convLockProvider(conv, decided, oneOff, respectExplicit, deferLock){
  try{
    if(!conv || oneOff || respectExplicit) return decided;
    if(conv.aiProvider) return conv.aiProvider;
    // التحية والمجاملة القصيرة لا تختاران عقل الخيط كله؛ أول طلب فعلي هو الذي يثبّته.
    if(deferLock) return decided;
    conv.aiProvider = decided;
    if(typeof saveState === 'function') saveState();
  }catch(e){ __swallow(e, 'route:convlock'); }
  return decided;
}
// ٦ قواعد التوجيه — الثلاث الأولى كانت موجودة، والثلاث التالية جديدة.
/* v-one-brain: موجّه التخصصات حُذف بقرار المالك — كان يوزّع الأسئلة على
   أربعة عقول مختلفة (سعر/خبر → perplexity بلا أدوات، ترجمة → gemini،
   تحليل → openai) فيتجاوز العقل الواحد وميثاقه وبطاقات مصادره. كل شيء
   الآن للعقل الواحد وأدواته. */
function pickSpecialtyProvider(){ return null; }
async function callAIWithFallback(messages, onDelta, preferredList){
  // 🧹 v308: تعقيم نهائي — أي base64 عملاق داخل نص أي رسالة يُستبدل بعلامة
  // قصيرة قبل الإرسال (الصور المرفقة الحقيقية تبقى في حقل images المنفصل).
  try{
    messages = messages.map(m => {
      if(m && typeof m.content === 'string' && m.content.length > 100000){
        const c = m.content.replace(/data:(image|audio|video)\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]{200,}/g, 'data:image/png;base64,EMBEDDED_MEDIA_OMITTED');
        if(c !== m.content) return Object.assign({}, m, { content: c });
      }
      return m;
    });
  }catch(e){ __swallow(e, "misc:app-06-checkout#11"); }
  // v358 — التوجيه بالمجموعات الوظيفية: المزود المختار يوسَّع لسلسلة مجموعته
  // (الاحتياط الصامت يبقى داخل نفس المجموعة أولًا)، ثم بقية المزودين كشبكة أمان أخيرة.
  const __sel = localStorage.getItem('aiapp_provider') || 'claude';
  const __grp = (typeof FUNCTIONAL_GROUPS !== 'undefined' && FUNCTIONAL_GROUPS[__sel]) ? FUNCTIONAL_GROUPS[__sel] : [__sel];
  const head = (preferredList && preferredList.length) ? preferredList : __grp;
  const order = [...head, ...AUTO_FALLBACK_ORDER.filter(p => !head.includes(p))];
  let lastErr = null;
  let firstRefusal = null; // أول رد رفض (نرجعه فقط إذا رفض الجميع)
  let refusalTries = 0;    // حد أقصى محاولتين إضافيتين بعد الرفض
  let errSwitched = false; // التبديل بسبب عطل/ضغط فقط هو اللي يظهر للمستخدم
  for(const providerKey of order){
    try{
      // Shown for every provider — the silent spinner was the reason Gemini
      // and GPT felt "dead" next to Claude, which had its own thinking output.
      try{
        if(window.__chatStatus && !window.__chatStatus.isReleased()){
          /* v-prov-status-i18n (شكوى المالك: «يكتب…» عربية بجانب اسم مترجم): سطر
             الحالة يتبع لغة الواجهة كبقية النصوص. */
          window.__chatStatus.phase('💭', (typeof functionalLabel === 'function' ? functionalLabel(providerKey) : providerKey) + ' ' + t('provTypingSuffix'));
        }
      }catch(e){ console.warn('[status] provider phase failed', e); }
      const reply = await callProviderAI(providerKey, messages, onDelta);
      // 🛡️ v309: رد فارغ = فشل → جرّب المزود التالي (يمنع الفقاعة الخفية)
      if(!String(reply || '').trim()){ lastErr = new Error(t('providerError')); continue; }
      if(isRefusalReply(reply) && refusalTries < 2){
        if(!firstRefusal) firstRefusal = { reply, providerKey };
        refusalTries++;
        continue; // 🛡️ تحويل صامت للمزود التالي — بدون أي رسالة للمستخدم
      }
      return { reply, providerKey, switched: errSwitched && providerKey !== head[0], requestedKey: head[0] };
    }catch(err){
      // الإلغاء قرار المستخدم، لا عطل مزوّد. لا نحوّله إلى مزوّد آخر وإلا بدا
      // زر الإيقاف معطّلًا واستمر الرد سرًّا بعد الضغط عليه.
      if((err && err.name === 'AbortError') ||
        (typeof genAbortController !== 'undefined' && genAbortController && genAbortController.signal.aborted)){
        if(err && err.name === 'AbortError') throw err;
        const abortErr = new Error('Generation stopped');
        abortErr.name = 'AbortError';
        throw abortErr;
      }
      lastErr = err;
      // A silent switch means the user gets different quality with no
      // explanation and blames the app. Say it plainly.
      // نسمّي من فشل ولماذا. الرسالة العامة كانت تترك المستخدم يرى مزوّدًا
      // غير الذي اختاره بلا تفسير — فيظنّ أن الاختيار معطّل، والحقيقة أن
      // المزوّد المختار فشل وأُخفي فشله.
      try{
        if(window.__chatStatus){
          const who = (typeof functionalLabel === 'function' ? functionalLabel(providerKey) : providerKey);
          const why = (err && (err.status ? ('HTTP ' + err.status + (err.upstreamText ? ' — ' + err.upstreamText.slice(0, 80) : '')) : String(err.message || '').slice(0, 70))) || t('provUnknownReason');
          /* v-prov-status-i18n: رسالة التعثر بلغة الواجهة لا بالعربي دائمًا. */
          window.__chatStatus.note('⚠️', who + ' ' + t('provFailSwitch').replace('{why}', why));
          console.warn('[fallback] ' + providerKey + ' failed:', err);
        }
      }catch(e){ console.warn('[status] fallback note failed', e); }
      if(err && (err.status === 429 || err.status === 402 || err.status >= 500)){ errSwitched = true; continue; }
      // 🛡️ v309: أي فشل آخر (نفاد رصيد المزود 400/401/403، عطل شبكة...) —
      // تحويل صامت للمزود التالي بدل إظهار خطأ أو رد فارغ للمستخدم.
      continue;
    }
  }
  if(firstRefusal) return { reply: firstRefusal.reply, providerKey: firstRefusal.providerKey, switched: false, requestedKey: head[0] };
  throw lastErr || new Error(t('providerError') + ' - fallback');
}

// ⚠️ ٦ أغسطس — سجل الأخطاء الحقيقي، ١١ حادثة: «sendPrompt is not defined». الدالة
// تُعرَّف في app-09، بعد هذا الملفّ. في الحزمة الواحدة يكفي رفع التصريح، أمّا
// الملفّات المقسّمة فسكربتات مستقلّة لا رفع بينها: الإسناد المباشر كان يضع undefined
// فيموت زرّ الإرسال صمتًا. الربط المتأخّر يُصلح الحالتين.
$('#btnSend').onclick = (e) => { if(typeof sendPrompt === 'function') return sendPrompt(e); };
// إبراز سهم الإرسال عند الكتابة
window.__updateSendReady = () => {
  const hasAttach = (typeof pendingAttachments !== 'undefined') && pendingAttachments.length > 0;
  $('#btnSend').classList.toggle('ready', $('#prompt').value.trim().length > 0 || hasAttach);
};
$('#prompt').addEventListener('input', window.__updateSendReady);
// v209: صندوق الكتابة يبدأ بسطر واحد صغير ويكبر تلقائيًا مع الكتابة فقط
(function(){
  const p = $('#prompt');
  function autoGrow(){
    /* v-tap-fast: قياس scrollHeight يعيد تخطيط الصفحة كلها مع كل حرف —
       سطر واحد قصير والارتفاع أصلًا على الأدنى → لا قياس إطلاقًا. */
    var v = p.value;
    if(p.__omMinH && v.indexOf('\n') === -1 && v.length < 20){
      if(p.style.height !== p.__omMinH) p.style.height = p.__omMinH;
      return;
    }
    p.style.height = 'auto';
    var h = Math.min(p.scrollHeight, 110) + 'px';
    p.style.height = h;
    if(v === '') p.__omMinH = h;
  }
  p.addEventListener('input', autoGrow);
  window.__promptAutoGrow = autoGrow;
  autoGrow();
})();
$('#prompt').addEventListener('keydown', e => {
  if(e.key === 'Enter' && !e.shiftKey){
    e.preventDefault();
    sendPrompt();
  }
});

/* ───────── تأكيد قبل صرف النقاط ─────────
   الخادم يرجع 428 مع السعر بدل التنفيذ الصامت. هنا نعرضه ونعيد الطلب
   بـ confirmed:true فقط بعد موافقة صريحة. */
async function postWithConfirm(url, payload){
  const send = (body) => fetch(url, {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body),
    signal: (typeof genAbortController !== 'undefined' && genAbortController) ? genAbortController.signal : undefined,
  });
  let res = await send(payload);
  if(res.status !== 428) return res;

  let q = {};
  try { q = await res.json(); } catch(e){ console.warn('[confirm] bad quote', e); }
  const isEn = (typeof AL === 'function' && AL() === 'en');
  const msg = q.message_ar || ((isEn ? 'This will cost ' : 'هذه العملية تخصم ')
    + (q.cost || '?') + (isEn ? ' points' : ' نقطة') + (q.label ? ' (' + q.label + ')' : '') + '.');
  const okToSpend = confirm(msg + '\n' + (isEn ? 'Continue?' : 'أكمل؟'));
  if(!okToSpend) return res;
  return await send(Object.assign({}, payload, { confirmed: true }));
}
