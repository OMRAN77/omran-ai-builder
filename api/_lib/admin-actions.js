// Vercel Serverless Function: OWNER-ONLY user management actions.
// Requires a valid session token belonging to OWNER_USERNAME. Regular users
// get 403 no matter what they send. Actions: ban, unban, delete, message, reset-link, link-sub.
const { getUser, putUser, userPath } = require('./auth.js');
const { kvDel, kvList, kvGetJSON } = require('./kv.js');
const crypto = require('crypto');
const RESET_LINK_MIN = 30; // v-owner-reset-link: صلاحيّة الرابط كرابط البريد

// v-owner-core: قائمة المالك الموحّدة — ‹omran› مدمج دائمًا والبيئة تضيف لا تستبدل.
const { isOwnerName } = require('./_owner.js');

// v-session-shape (الدفعة A، أمان): نسخة verifyToken اليدويّة هنا كانت تقبل حمولة موقّعة بلا exp (تذكرة مهمّة البناء) جلسةً
// لا تنتهي، وتقرأ السرّ في نطاق الوحدة. الآن _session.sessionUser: u نصّ وexp رقم في المستقبل، والسرّ عند النداء.
const { sessionUser } = require('./_session.js');

// getUser/putUser now come from auth.js, which stores/reads user records
// encrypted at rest (AES-256-GCM) instead of as raw JSON.

/* v-owner-reset-stripe: إيميل لا يصل حسابًا في التطبيق ← أسماء المستخدمين التي دفعت به في Stripe (قراءة فقط): جلسات الدفع المكتملة
   بالبريد (customer_details[email]، الأحدث أوّلًا)، ثمّ العملاء بالبريد واشتراكاتهم، ثمّ الشحنات المدفوعة (Google Pay: PaymentIntent بلا جلسة
   ولا عميل — بريده في billing_details) — والاسم من metadata.username الذي يضعه createCheckoutSession من جلسة الحساب نفسه.
   كلّ نتيجة بريدها هو البريد المطلوب نفسه، والاسم يُتبع إن تغيّر بعد الدفع (liveAccount). ← قائمة الحسابات الحيّة المختلفة (الأحدث أوّلًا)؛
   بلا مفتاح Stripe أو بعطب = [] بلا رمي، ولا يُسجَّل بريد ولا اسم.
   المراجعة العدائيّة (٥ مؤكّدة، مصلحة): أوّل اسم حيّ كان يُختار بصمت وبريد واحد قد يدفع منه حسابان (المالك يُسأل الآن)؛ الاسم المغيَّر بعد الدفع
   كان ٤٠٤ (resolveLoginUser لا يتبع movedTo لاسم)؛ دافعو Google Pay لا جلسة لهم ولا عميل (الشحنات)؛ جلسة لم تكتمل كانت تُحسب؛ ورفض Stripe صامت.
   v-owner-reset-scan (المالك بعد دمج #1298: إيميل علياء نفسه ← «ما في حساب» ثانيةً، والسجلّ بلا رفض من Stripe — ردّ ولم يُطلع اسمًا):
   • مرشِّح البريد في Stripe يطابق البريد بحروفه كما خُزّن (قائمة العملاء موثَّقة «case-sensitive») — من دفعت بـ«Aliya.…» لا يصلها «aliya.…».
     فإن لم يُطلع المرشِّح اسمًا تُمسح أحدث جلسات الدفع المكتملة (١٠ صفحات × ١٠٠ و٢٥ ث حدًّا) ويُطابَق البريد بلا حالة أحرف.
   • metadata الجلسة لا تنتقل إلى دفعتها (لا payment_intent_data) — فشحنة صفحة الدفع بلا اسم وكانت تُترك: يُقرأ الاسم من نيّتها ثمّ من جلستها
     بـpayment_intent (كما يفعل pay-refund). وبريد الشحنة من billing_details أو receipt_email، ومسحها بالحدّ نفسه.
   • opts.diag أعداد بلا بريد ولا اسم (ما مُسح، وما طابق، وما طابق بلا اسم، والأعطال، وهل انقطع المسح) — تُعاد للمالك مع ٤٠٤ وتُسجَّل.
   • المراجعة المستقلّة (٣ مؤكّدة بمحاكاة، مصلحة): المسحان كانا على ساعة واحدة فمسح جلسات طويل يُسقط مسح الشحنات (دافعو Apple/Google Pay) — لكلّ
     مسح ساعته؛ مهلة نداء واحد كانت تقفز إلى نهاية البحث، و٤٢٩/5xx كانت «نهاية القائمة» بلا partial — كلّ عطب يُعدّ ويُكمل ما بعده؛ واسم حساب
     محذوف كان يوقف البحث قبل الحساب الحيّ — الخطوة التالية تُترك فقط إذا وُجد حساب حيّ. */
const STRIPE_API = 'https://api.stripe.com/v1/';
const STRIPE_PAID = new Set(['paid', 'no_payment_required']);
const STRIPE_SCAN_PAGES = 10;
const STRIPE_SCAN_MS = 25000; // لكلّ مسح
async function stripeAccountsFor(emails, follow, opts) {
  const diag = (opts && opts.diag) || {};
  Object.assign(diag, { filter: 0, scanned: 0, sessions: 0, customers: 0, charges: 0, matched: 0, unnamed: 0, names: 0, live: 0, errors: 0, partial: false });
  const secret = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!secret) { diag.off = true; return []; } /* v-owner-reset-records: Stripe غير مربوط — البحث لم يشمله (complete=false) */
  const f = (opts && opts.fetchImpl) || fetch;
  /* عطب (رفض، مهلة، جسم لا يُقرأ) = null يُعدّ ويُسجَّل بالمسار وحده — لا يرمي، ولا يُقرأ «لا نتائج» */
  const get = async (path) => {
    const where = '[admin-actions] reset-link stripe ' + path.split('?')[0]; /* بلا بريد ولا اسم */
    try {
      const r = await f(STRIPE_API + path, { headers: { Authorization: 'Bearer ' + secret }, signal: AbortSignal.timeout(8000) });
      const d = await r.json().catch(() => null);
      if (r.ok && d && typeof d === 'object') return d;
      console.warn(where + ' HTTP ' + r.status + (r.ok ? ' unreadable' : ''));
    } catch (e) { console.warn(where + ' ' + String((e && e.name) || 'error')); }
    diag.errors++;
    return null;
  };
  const rows = async (path) => { const d = await get(path); return d && Array.isArray(d.data) ? d.data : []; };
  const idOf = (x) => (typeof x === 'string' ? x : (x && typeof x.id === 'string' ? x.id : ''));
  /* v-owner-reset-records (المراجعة المستقلّة): الاسم ومعه وقت الدفع (created بالثواني) — اسمٌ حُرّر بعد الدفع وسجّله غيره لا يأخذ الرابط */
  const names = [];
  const add = (md, created) => {
    const u = md && typeof md.username === 'string' ? md.username.trim().toLowerCase() : '';
    if (!u) return false;
    const at = Number(created) > 0 ? Number(created) * 1000 : 0;
    const hit = names.find((x) => x.name === u);
    if (!hit) names.push({ name: u, at });
    else if (at && (!hit.at || at < hit.at)) hit.at = at;
    return true;
  };
  const list = [...new Set((emails || []).map((e) => String(e || '').trim()).filter((e) => e.includes('@')))];
  /* كلّ نتيجة بريدُها هو البريد المطلوب نفسه — مرشِّح تجاهله Stripe (أو تغيّر) لا يعطي المالك رابطًا لحساب شخص آخر */
  const want = new Set(list.map((e) => e.toLowerCase()));
  const same = (x) => want.has(String(x || '').trim().toLowerCase());
  const seen = new Set();
  const paidSession = (s) => {
    if (!s || !STRIPE_PAID.has(String(s.payment_status))) return;
    if (!same((s.customer_details && s.customer_details.email) || s.customer_email)) return;
    if (s.id) { if (seen.has(s.id)) return; seen.add(s.id); }
    diag.sessions++;
    if (!add(s.metadata, s.created)) diag.unnamed++;
  };
  /* الأحدث أوّلًا صفحةً صفحة حتّى الحدّ، بساعة لكلّ مسح؛ «partial» إن بقي ما لم يُمسح (الحدّ، أو المهلة، أو عطب صفحة) */
  const scan = async (path, each) => {
    const t0 = Date.now();
    let after = '';
    for (let page = 0; page < STRIPE_SCAN_PAGES; page++) {
      if (Date.now() - t0 > STRIPE_SCAN_MS) { diag.partial = true; return; }
      const d = await get(path + (after ? '&starting_after=' + encodeURIComponent(after) : ''));
      if (!d || !Array.isArray(d.data)) { if (d) diag.errors++; diag.partial = true; return; }
      for (const x of d.data) await each(x);
      if (!d.has_more || !d.data.length) return;
      after = idOf(d.data[d.data.length - 1]);
      if (!after) { diag.partial = true; return; }
    }
    diag.partial = true;
  };
  /* خطوة رمت (بيانات غير متوقَّعة) تُعدّ وتُكمل التالية — لا تُسقط البحث كلّه (عطب Stripe = لا حساب، ٤٠٤) */
  const step = async (fn) => {
    try { await fn(); }
    catch (e) { diag.errors++; diag.partial = true; console.warn('[admin-actions] reset-link stripe lookup failed: ' + String((e && e.name) || 'error')); }
  };
  /* الأسماء إلى حساباتها الحيّة (الأحدث أوّلًا)؛ الخطوة التالية تُترك فقط إذا وُجد حساب حيّ — اسم حساب محذوف لا يوقف البحث.
     v-owner-reset-records: اسم مختوم أو عطب قراءة يُعدّ ويُكمل (كان ٥٠٠ يخفي الحساب الحيّ)، وحساب سُجّل بعد الدفع ليس الدافع */
  const live = [];
  const followed = new Set();
  const found = async () => {
    for (const x of names) {
      if (followed.has(x.name)) continue;
      followed.add(x.name);
      let hit = null;
      try { hit = await follow(x.name); }
      catch (e) { diag.errors++; diag.partial = true; continue; } /* مختوم أو عطب قراءة: الاسم التالي */
      if (!hit || !hit.user || hit.user.deleted || live.includes(hit.key)) continue;
      if (x.at && Number(hit.user.createdAt) > x.at + 60000) { diag.reused = (diag.reused || 0) + 1; continue; }
      live.push(hit.key);
    }
    return live.length > 0;
  };
  await step(async () => {
    for (const e of list) {
      const got = await rows('checkout/sessions?status=complete&limit=20&customer_details[email]=' + encodeURIComponent(e));
      diag.filter += got.length;
      got.forEach(paidSession);
    }
  });
  if (!(await found())) await step(() => scan('checkout/sessions?status=complete&limit=100', (s) => { diag.scanned++; paidSession(s); }));
  if (!(await found())) {
    await step(async () => {
      for (const e of list) {
        const q = "email:'" + e.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
        for (const c of (await rows('customers/search?limit=5&query=' + encodeURIComponent(q))).slice(0, 5)) {
          if (!c || !same(c.email)) continue;
          diag.customers++;
          add(c.metadata, c.created);
          for (const s of await rows('subscriptions?status=all&limit=10&customer=' + encodeURIComponent(String(c.id || '')))) add(s && s.metadata, s && s.created);
        }
      }
    });
  }
  /* Google Pay (PaymentRequest ← createPaymentIntent): لا جلسة ولا عميل؛ الشحنة تحمل بريد الدافع ونسخة metadata النيّة. وشحنة صفحة الدفع
     بلا metadata: الاسم من نيّتها ثمّ من جلستها. لا مرشّح بريد في قائمة الشحنات — المسح بالحدّ نفسه */
  if (!(await found())) {
    await step(() => scan('charges?limit=100', async (ch) => {
      diag.charges++;
      if (!ch || !ch.paid) return;
      if (!same(ch.billing_details && ch.billing_details.email) && !same(ch.receipt_email)) return;
      diag.matched++;
      if (add(ch.metadata, ch.created)) return;
      const pi = idOf(ch.payment_intent);
      if (pi) {
        const p = await get('payment_intents/' + encodeURIComponent(pi));
        if (p && add(p.metadata, ch.created)) return;
        const s = (await rows('checkout/sessions?limit=1&payment_intent=' + encodeURIComponent(pi)))[0];
        if (s && add(s.metadata, ch.created)) return;
      }
      diag.unnamed++;
    }));
  }
  await found();
  diag.names = names.length;
  diag.live = live.length;
  return live;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!process.env.UPSTASH_REDIS_REST_URL) { res.status(500).json({ error: 'Server is missing UPSTASH_REDIS_REST_URL' }); return; }

  try {
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const { token, action, targetUsername, text } = body;
    /* v-owner-reset-scan: فحص بلا رمز — يقول لأيّ حساب يصل البريد ولا يكتب شيئًا ولا يُبطل رابطًا سابقًا (للتحقّق الحيّ دون إنشاء رابط) */
    const dryRun = body.dryRun === true;
    /* v-owner-reset-records: exact — اسم حساب بعينه (زرّ الجدول، أو الطلب الثاني بعد الفحص): لا يُعاد البحث بالبريد ولو كان في الاسم «@» */
    const exact = body.exact === true;

    const requester = sessionUser(token);
    if (!isOwnerName(requester)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    // v-purge-checks: تنظيف حسابات الفحص الآلية (zzcheck…) دفعة واحدة — كانت
    // تُحذف يدويًّا واحدًا واحدًا وتراكم منها ٧٠+. للمالك فقط، والبادئة
    // مثبّتة في الكود فلا تطال أي حساب حقيقي، وتُحذف نقاطها معها.
    if (action === 'purge-checks') {
      const PREFIX = 'db/users/zzcheck';
      const keys = await kvList(PREFIX);
      let removed = 0;
      for (const k of keys) {
        const uname = decodeURIComponent(String(k).slice('db/users/'.length).replace(/\.json$/, ''));
        if (!/^zzcheck[0-9a-f]{4,}$/i.test(uname)) continue; // صيغة المولّدات حصرًا
        await kvDel(k);
        await kvDel('points:' + encodeURIComponent(uname));
        removed++;
      }
      res.status(200).json({ ok: true, removed, note: 'حُذفت حسابات الفحص zzcheck ونقاطها نهائيًّا' });
      return;
    }

    /* v-claude-diag (المالك: «فيه رصيد» ورسالة أنثروبيك تقول العكس): فحص
       حاسم للمالك فقط — يجرب مفتاح الخادم الفعلي على أنثروبيك ويرجع رد
       الخطأ كاملًا مع ذيل المفتاح، فيتضح فورًا أي حساب/منظمة يخص المفتاح
       وهل الرصيد يخصه. لا يكشف المفتاح نفسه أبدًا. */
    if (action === 'claude-diag') {
      const { shape } = require('./_env-keys.js'); // v-key-shape
      const akey = process.env.ANTHROPIC_API_KEY || '';
      if (!akey) {
        const misplaced = process.env.ANTHROPIC_KEY_MISPLACED === 'openrouter';
        res.status(200).json({ ok: false, keyTail: misplaced ? '(مفتاح OpenRouter)' : '(غير مضبوط)', detail: misplaced
          ? 'ANTHROPIC_API_KEY في Vercel يحمل مفتاح OpenRouter (sk-or-…) لا مفتاح Anthropic. نُقل تلقائيًّا إلى OPENROUTER_API_KEY وكلود يمرّ عبر OpenRouter الآن. الصحيح: مفتاح من console.anthropic.com يبدأ بـsk-ant-api03- في هذا المتغيّر، أو احذف المتغيّر وأبقِ OPENROUTER_API_KEY.'
          : 'ANTHROPIC_API_KEY غير موجود في Vercel' });
        return;
      }
      let st = 0, bodyTxt = '';
      try {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': akey, 'anthropic-version': '2023-06-01' },
          signal: AbortSignal.timeout(20000),
          body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
        });
        st = r.status;
        bodyTxt = (await r.text()).slice(0, 600);
      } catch (e) { bodyTxt = 'fetch: ' + (e && e.message); }
      const sh = shape(akey).label;
      res.status(200).json({ ok: st === 200, status: st, keyTail: '…' + akey.slice(-6), shape: sh, detail: (st === 200 ? 'المفتاح شغال والرصيد سليم ✅' : bodyTxt) + '\nشكل المفتاح: ' + sh });
      return;
    }

    /* v-owner-link-sub: اشتراك Stripe دُفع بلا دخول (قبل v-checkout-login) يُربط بحساب صاحبه — الدفعات الفائتة تُضاف بمفاتيح
       الويب هوك نفسها والتجديد بعدها يُشحن وحده (sub-link.js). يكتب فقط بـconfirm:true صريحًا، وإلّا فحصٌ بلا أثر. */
    if (action === 'link-sub') {
      const r = await require('./sub-link.js').linkSub({ target: targetUsername, subscriptionId: body.subscriptionId, confirm: body.confirm === true, expect: body.expect });
      res.status(r.status).json(r.body);
      return;
    }

    if (!targetUsername || typeof targetUsername !== 'string') {
      res.status(400).json({ error: 'missing targetUsername' });
      return;
    }
    /* v-owner-reset-records (مراجعة الخصوصيّة): علامات الاتّجاه المخفيّة (من قائمة الأسماء في التنبيه أو من محادثة عربيّة) تُشال قبل البحث */
    const typed = targetUsername.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '').trim();
    let key = typed.toLowerCase();
    let via = ''; // v-owner-reset-stripe / v-owner-reset-records: من أين عُرف الحساب (stripe · record · paypal)
    const stripeDiag = {}; // v-owner-reset-scan: أعداد البحث في Stripe (بلا بريد ولا اسم)
    const extra = {}; // v-owner-reset-records: أعداد السجلّات وPayPal للفحص وللـ٤٠٤
    /* v-owner-reset-find: جدول المستخدمين يعرض أحدث ٦٠ تسجيلًا فقط، فصاحب الحساب الأقدم لا صفّ له ولا 🔑. خانة البحث ترسل
       الإيميل كما كتبه المالك: يُحوَّل إلى حسابه بفهرس البريد (مؤكَّدًا أو لا — المالك تحقّق بنفسه)، وحساب «المتابعة عبر Google»
       لا كلمة مرور يعرفها صاحبه فيُقال للمالك ذلك بدل رابط لا ينفع. */
    if (action === 'reset-link' && key.includes('@') && !exact) {
      const auth = require('./auth.js');
      const lookup = require('./owner-lookup.js');
      const follow = (u) => lookup.liveReadOnly(u, auth); // v-owner-reset-records: يتبع الاسم المغيَّر بلا كتابة
      const low = (x) => String(x == null ? '' : x).trim().toLowerCase();
      /* v-owner-reset-records (المراجعة المستقلّة): البريد يعطي رابطًا مباشرًا لحساب أثبته وحده (emailVerifiedFor) — اسم مستخدم بالنصّ نفسه
         (أسماء «@» قديمة: كان بعضهم يسجّل بريد غيره اسمًا) أو فهرس البريد (كتبه التسجيل حتّى ١٨ أكتوبر بلا إثبات، فقد يكون زرعًا). ما لم
         يُثبَت يصير اسمًا محتملًا للمالك، ويمضي البحث إلى من أثبته. قراءة فقط: لا resolveLoginUser (emailProven ← stampLegacyEmail يكتب)
         ولا getUser/googleAccountFor (قد يعيدان تشفير سجلّ بالسرّ السابق ويكتبان). */
      const weakFirst = [];
      let directKey = ''; // اسم مستخدم بالنصّ نفسه بلا إثبات للبريد — آخر ما يُرجع إليه
      let found = '';
      try {
        const direct = await auth.getUserOnce(key, { readOnly: true, quiet: true });
        if (direct && !direct.deleted) {
          if (low(direct.email) === key && auth.emailVerifiedFor(key, direct)) found = key;
          else { weakFirst.push(key); directKey = key; }
        }
      } catch (e) { console.warn('[admin-actions] reset-link direct ' + String((e && e.code) || (e && e.name) || 'error')); } /* اسم بالنصّ نفسه لا يُقرأ: ليس دليلًا، يمضي البحث */
      if (!found) {
        try {
          const idx = await kvGetJSON('db/email-index/' + key);
          const uname = low(idx && idx.username);
          if (uname) {
            const live = await follow(uname);
            /* الفهرس يُتبع إن كان بريد الحساب الحيّ هو البريد نفسه (كـindexOwner)، ورابطًا إن كان مؤكَّدًا عليه */
            if (live.user && !live.user.deleted && low(live.user.email) === key) {
              if (auth.emailVerifiedFor(live.key, live.user)) found = live.key;
              else if (!weakFirst.includes(live.key)) weakFirst.push(live.key);
            }
          }
        } catch (e) { console.warn('[admin-actions] reset-link index ' + String((e && e.code) || (e && e.name) || 'error')); } /* عطب الفهرس لا يُسقط البحث */
      }
      if (found) key = found;
      else {
        /* حساب «المتابعة عبر Google» بهذا البريد (كـgoogleAccountFor، قراءةً فقط): لا كلمة مرور يعرفها صاحبه — يُقال للمالك */
        try {
          const alias = await kvGetJSON('db/alias/g_' + key);
          const g = await follow((alias && alias.primary) ? String(alias.primary) : 'g_' + key);
          if (g.user && !g.user.deleted) { res.status(200).json({ ok: false, google: true, username: g.key }); return; }
        } catch (e) { console.warn('[admin-actions] reset-link google ' + String((e && e.code) || (e && e.name) || 'error')); } /* كـgoogleAccountFor: عطبه لا يُسقط البحث */
        /* v-owner-reset-records (المالك بعد #1303: Stripe كلّه بلا دفعة بإيميلها ← «سوّها» على بحثين آخرين، قراءة فقط — بيانات المستخدمين
           والمال بابان مقفلان). السجلّات أوّلًا: الإثبات القويّ يسبق الدفع، لأنّ Stripe وPayPal لا يتحقّقان من بريد الدافع (المراجعة المستقلّة:
           حساب أثبت البريد كان يخسر أمام من كتبه في صفحة الدفع). قويّ = رابط، وضعيف = أسماء للمالك. */
        extra.records = {};
        const rec = await lookup.recordAccountsFor(typed, { diag: extra.records });
        console.warn('[admin-actions] reset-link records ' + JSON.stringify(extra.records)); /* أعداد فقط */
        if (rec.strong.length > 1) { res.status(409).json({ error: 'multiple accounts', kind: 'record', candidates: rec.strong.slice(0, 5).map((x) => x.key) }); return; }
        if (rec.strong.length === 1) {
          if (rec.strong[0].gid) { res.status(200).json({ ok: false, google: true, username: rec.strong[0].key }); return; }
          key = rec.strong[0].key;
          via = 'record';
        } else {
          /* v-owner-reset-stripe (المالك بعد v-owner-reset-find: إيميل علياء ← «ما في حساب بهذا الإيميل أو الاسم»، ثمّ «سوّها»): التسجيل لا
             يحفظ إيميلًا منذ ١٨ أكتوبر (v-signup-no-email) — فمن سجّل باسم وكلمة مرور ودفع ببريده بريده في Stripe ومعه اسمه في
             metadata.username الذي يضعه createCheckoutSession. قراءة فقط (بموافقة المالك على البند — Stripe باب مقفل). */
          const paid = await stripeAccountsFor([typed, key], follow, { diag: stripeDiag });
          /* بريد دفع منه أكثر من حساب: لا رابط تلقائيّ — المالك يسأل صاحبه عن اسم حسابه ويكتبه في الخانة نفسها */
          if (paid.length > 1) { res.status(409).json({ error: 'multiple accounts', kind: 'stripe', candidates: paid.slice(0, 5) }); return; }
          if (paid.length === 1) { key = paid[0]; via = 'stripe'; }
          else {
            console.warn('[admin-actions] reset-link stripe none ' + JSON.stringify(stripeDiag)); /* أعداد فقط — بلا بريد ولا اسم */
            extra.paypal = {};
            const pp = await lookup.paypalAccountsFor([typed, key], follow, { diag: extra.paypal, orders: rec.paypalOrders });
            console.warn('[admin-actions] reset-link paypal ' + JSON.stringify(extra.paypal)); /* أعداد فقط */
            if (pp.length > 1) { res.status(409).json({ error: 'multiple accounts', kind: 'paypal', candidates: pp.slice(0, 5) }); return; }
            if (pp.length === 1) { key = pp[0]; via = 'paypal'; }
            else {
              /* complete: كلّ مصدر بُحث فيه حتّى آخره بلا عطب (PayPal الكامل المقفل حالة معروفة، رسالتها تُقال وحدها) — وإلّا قالت الواجهة
                 «ما اكتمل البحث» بدل «دوّرت في كلّ شيء» (المراجعة المستقلّة) */
              const p = extra.paypal;
              const complete = !stripeDiag.off && !stripeDiag.partial && !stripeDiag.errors && !extra.records.partial
                && !p.off && (p.denied ? p.errors <= 1 : (!p.errors && !p.partial));
              const candidates = [...weakFirst, ...rec.weak.map((x) => x.key)].filter((k, i, a) => a.indexOf(k) === i && !isOwnerName(k)).slice(0, 10);
              /* اسم «@» قديم هو النصّ نفسه ولا أحد غيره يدّعي البريد ولا أثبته: هو الحساب (كما كان قبل المراجعة) — والمالك يرى اسمه في الفحص
                 قبل أن يؤكّد. وإلّا أسماء محتملة. */
              const rival = weakFirst.some((k) => k !== directKey) || rec.weak.some((x) => x.key !== directKey && (x.why === 'unverified' || x.why === 'old'));
              if (directKey && !rival) { key = directKey; via = 'name'; }
              else {
                res.status(404).json(Object.assign({ error: 'user not found', diag: stripeDiag, candidates, complete }, extra));
                return;
              }
            }
          }
        }
      }
    }
    if (isOwnerName(key)) {
      res.status(400).json({ error: 'cannot act on the owner account' });
      return;
    }

    // سجلّ لا يفكّه أيّ مفتاح (كُتب بسرّ ضاع) يرمي الآن بدل أن يتنكّر في هيئة
    // «غير موجود». هنا بالذات يُفتح المخرج الوحيد منه: المالك يحذفه حذفًا
    // مباشرًا من المخزن — بلا قراءة — فيتحرّر الاسم ويُنشأ من جديد. حدث فعلًا:
    // حساب المالك القديم وحساب جوجل المرتبط به بقيا مقفلين بلا أيّ سبيل،
    // لأنّ delete القديم كان يقرأ السجلّ أوّلًا ليكتب فيه deleted:true.
    let user = null, sealed = false;
    /* v-owner-reset-records: رابط الاسترجاع يقرأ بلا إعادة تشفير (dryRun لا يكتب شيئًا؛ والرابط يكتب الرمز بـputUser بالسرّ الحاليّ على كلّ حال) */
    try { user = action === 'reset-link' ? await require('./auth.js').getUserOnce(key, { readOnly: true }) : await getUser(key); }
    catch (e) {
      if (e && e.code === 'USER_RECORD_UNDECRYPTABLE') sealed = true;
      else throw e;
    }
    if (sealed) {
      if (action === 'delete') {
        await kvDel(userPath(key));
        res.status(200).json({ ok: true, purged: true, note: 'سجلّ مقفل بسرّ قديم — حُذف نهائيًّا وتحرّر الاسم' });
        return;
      }
      res.status(409).json({ error: 'sealed_record', message: 'السجلّ مقفل بسرّ قديم ولا يُقرأ — لا يصحّ عليه إلا الحذف (أو استرجاعه بـ AUTH_SECRET_PREVIOUS)' });
      return;
    }
    /* v-owner-reset-records: اسم قديم تغيّر ← حسابه الحيّ (شاهد movedTo)؛ واسم لا حساب له ← أسماء فيها النصّ نفسه، للمالك لا رابط */
    if (action === 'reset-link' && user && user.deleted && user.movedTo) {
      let live = { user: null };
      try { live = await require('./owner-lookup.js').liveReadOnly(key); }
      catch (e) {
        if (e && e.code === 'USER_RECORD_UNDECRYPTABLE') { res.status(409).json({ error: 'sealed_record', message: 'السجلّ مقفل بسرّ قديم ولا يُقرأ — لا يصحّ عليه إلا الحذف (أو استرجاعه بـ AUTH_SECRET_PREVIOUS)' }); return; }
        throw e;
      }
      if (live.user && !live.user.deleted) {
        if (isOwnerName(live.key)) { res.status(400).json({ error: 'cannot act on the owner account' }); return; } /* اسم قديم يقود إلى حساب المالك */
        key = live.key;
        user = live.user;
      }
    }
    if (!user) {
      if (action === 'reset-link' && !key.includes('@')) {
        const names = await require('./owner-lookup.js').nameAccountsFor(key);
        res.status(404).json({ error: 'user not found', candidates: names });
        return;
      }
      res.status(404).json({ error: 'user not found' });
      return;
    }

    /* v-owner-reset-link: مستخدم نسي كلمة مروره وإيميل الاسترجاع لا يصله (MAIL_FROM التجريبيّ يصل صاحب حساب Resend وحده)،
       فيعيد الضغط حتّى ينقفل ربع ساعة. هنا المالك — بعد أن يتحقّق من صاحب الحساب بنفسه — ينشئ رابط الاسترجاع نفسه الذي
       يرسله البريد (رمز ٣٠ دقيقة، يُخزَّن مجزَّأً، ويُبطل الرابط السابق) ويسلّمه له بيده. لا يرى المالك كلمة المرور ولا يضعها؛
       صاحب الحساب يكتبها، وresetWithToken يُبطل كلّ جلساته السابقة كما في الاسترجاع بالبريد. */
    if (action === 'reset-link') {
      if (user.deleted) { res.status(404).json({ error: 'user not found' }); return; }
      if (dryRun) { res.status(200).json(Object.assign({ ok: true, dryRun: true, username: key }, via ? { via, diag: stripeDiag } : {}, extra)); return; }
      const rt = crypto.randomBytes(24).toString('hex');
      user.resetTokenHash = crypto.createHash('sha256').update(rt).digest('hex');
      user.resetTokenExpiry = Date.now() + RESET_LINK_MIN * 60 * 1000;
      await putUser(key, user);
      const { siteUrl } = require('./_site.js');
      const link = siteUrl() + '/?resetToken=' + encodeURIComponent(rt) + '&ru=' + encodeURIComponent(key);
      res.status(200).json(Object.assign({ ok: true, link, minutes: RESET_LINK_MIN, username: key }, via ? { via } : {}));
      return;
    }

    if (action === 'ban') {
      user.banned = true;
      await putUser(key, user);
      res.status(200).json({ ok: true, banned: true });
      return;
    }
    if (action === 'unban') {
      user.banned = false;
      await putUser(key, user);
      res.status(200).json({ ok: true, banned: false });
      return;
    }
    if (action === 'delete') {
      user.deleted = true;
      user.pendingMessage = null;
      await putUser(key, user);
      res.status(200).json({ ok: true, deleted: true });
      return;
    }
    if (action === 'message') {
      if (!text || !String(text).trim()) {
        res.status(400).json({ error: 'empty message' });
        return;
      }
      user.pendingMessage = { text: String(text).trim(), at: Date.now() };
      await putUser(key, user);
      res.status(200).json({ ok: true, sent: true });
      return;
    }

    res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: String(e && e.message || e) });
  }
};
