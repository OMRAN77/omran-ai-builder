// scripts/smoke.mjs — خمسة اختبارات دخان على نشرة حيّة.
//
// لماذا لا Playwright: طلبت الخطة متصفّحًا، لكن إضافته إلى تابعات
// المستودع تُثقل بناء Vercel بمئات الميغابايت لأجل خمسة تأكيدات
// معظمها على مستوى الشبكة. فالخمسة هنا بلا تابع واحد. فحص أخطاء
// الطرفية بالمتصفّح يبقى فحصًا يدويًا قبل كل ترقية إلى الإنتاج.
//
// الاستخدام:  node scripts/smoke.mjs [BASE_URL]
// افتراضيًا الإنتاج. MONITOR_KEY اختياري: بوجوده يتعمّق فحص الصحّة.
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

const BASE = (process.argv[2] || 'https://omran-ai-builder.vercel.app').replace(/\/$/, '');
const KEY = process.env.MONITOR_KEY || '';
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✓ ' + m); };
const no = (m) => { fail++; console.log('  ✗ ' + m); };
const get = async (p, o) => { try { return await fetch(BASE + p, o); } catch (e) { return { status: 0, err: e.message, headers: new Map(), text: async () => '' }; } };
const head = (r, k) => (r.headers.get ? r.headers.get(k) : '') || '';

// ① الصفحة وأصولها المحلّية — وتطابق بصمة الحزمة في ثلاثة أماكن.
async function page() {
  console.log('① الصفحة والأصول');
  const r = await get('/');
  r.status === 200 ? ok('/ → 200') : no(`/ → ${r.status}`);
  const html = await r.text();
  /<html/i.test(html) ? ok('HTML سليم') : no('ليس HTML');
  const m = html.match(/app\.bundle\.js\?v=([0-9a-f]+)/);
  const vHash = m ? m[1] : '';
  vHash ? ok('index يشير إلى الحزمة ببصمة ' + vHash) : no('لا بصمة ?v= في index');
  // كل أصل محلّي يشير إليه index يجب أن يُخدَم — الـ٤٠٤ الصامت يكسر الصفحة.
  const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/[^"#?]+|[a-z][^":]*\.(?:js|css|png|json))(?:\?[^"]*)?"/g)].map((x) => x[1]))]
    .filter((u) => !/^https?:|^about:|^#/.test(u)).map((u) => (u.startsWith('/') ? u : '/' + u));
  let bad = [];
  for (const a of assets) { const x = await get(a, { method: 'GET' }); if (x.status !== 200) bad.push(`${a}:${x.status}`); }
  bad.length === 0 ? ok(`${assets.length} أصلًا محلّيًا كلّها ٢٠٠`) : no('أصول مفقودة → ' + bad.join(' '));
  // البصمة الحيّة مقابل المحلّية: يكشف تأخّر الأجزاء أو نشرة نصفية.
  const b = await get('/js/app.bundle.js');
  const live = createHash('sha1').update(await b.text()).digest('hex');
  const lp = 'js/app.bundle.js';
  if (existsSync(lp)) {
    const loc = createHash('sha1').update(readFileSync(lp, 'utf8')).digest('hex');
    live === loc ? ok('الحزمة الحيّة تطابق المحلّية') : no(`الحزمة الحيّة ${live.slice(0, 8)} ≠ المحلّية ${loc.slice(0, 8)}`);
  }
  return vHash;
}

// ② العامل الخدمي — وقائمة التخزين المسبق كلٌّ أو لا شيء.
async function sw(vHash) {
  console.log('② العامل الخدمي');
  const r = await get('/sw.js');
  r.status === 200 ? ok('/sw.js → 200') : no(`/sw.js → ${r.status}`);
  /javascript/i.test(head(r, 'content-type')) ? ok('نوع المحتوى javascript') : no('نوع المحتوى ' + head(r, 'content-type'));
  const src = await r.text();
  const cm = src.match(/CACHE_NAME\s*=\s*['"][^'"]*?([0-9a-f]{8})['"]/);
  if (cm && vHash) cm[1] === vHash ? ok('إصدار الذاكرة يطابق index') : no(`ذاكرة ${cm[1]} ≠ index ${vHash}`);
  // تُجرَّد التعليقات أوّلًا: قائمة sw.js تذكر داخل تعليقٍ مسارًا قديمًا
  // خاطئًا، ولولا التجريد لحسبه هذا الفحص أصلًا مفقودًا فصرخ زورًا.
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1 ');
  const list = (clean.match(/STATIC_ASSETS\s*=\s*\[([\s\S]*?)\]/) || [, ''])[1];
  const items = [...list.matchAll(/['"]\.?(\/[^'"]*|)['"]/g)].map((x) => x[1] || '/');
  let bad = [];
  for (const a of items) { const x = await get(a); if (x.status !== 200) bad.push(`${a}:${x.status}`); }
  bad.length === 0 ? ok(`${items.length} أصلًا في التخزين المسبق كلّها ٢٠٠`) : no('التخزين المسبق سيفشل كلّه → ' + bad.join(' '));
}

const j = async (r) => { try { return JSON.parse(await r.text()); } catch { return null; } };

// ③ الدخول — يرفض الخطأ بـ٤٠١ لا ٥٠٠، ولا يسرّب سرًّا في جسم الرفض.
async function login() {
  console.log('③ الدخول');
  const r = await get('/api/account?action=auth', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'login', username: 'smoke-not-a-user', password: 'x'.repeat(12) }),
  });
  r.status >= 400 && r.status < 500 ? ok(`رفض ببيانات خاطئة → ${r.status}`) : no(`رفض ببيانات خاطئة → ${r.status}`);
  const t = await r.text();
  /eyJ|secret|sk_|AUTH_SECRET/i.test(t) ? no('جسم الرفض يسرّب شيئًا') : ok('جسم الرفض نظيف');
}

// ④ البوّابات — AI والمال بلا توكن. لا نداء حقيقي: لا رصيد يُحرق، والباب مقفل.
async function gates() {
  console.log('④ بوّابات AI والمال');
  const routes = [
    // بلا رسائل: يُختبر أنّ الحاجز قائم دون أن يُحرَق سطر واحد من الرصيد.
    ['/api/ai?action=deepseek', 'POST', '{}'],
    ['/api/account?action=create-checkout-session', 'POST', '{}'],
    ['/api/account?action=points', 'GET', null],
    ['/api/account?action=admin-stats', 'GET', null],
  ];
  for (const [p, method, body] of routes) {
    const r = await get(p, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body } : {}) });
    const t = await r.text();
    if (r.status >= 500) {
      // «الدفع غير مفعّل» ردٌّ مقصود مكتوب بيد صاحب المستودع لغياب مفتاح
      // Stripe في الإنتاج. باب مال مقفل: يُنبَّه عليه ولا يُلمَس ولا يُخفى.
      /not configured|غير مفعّل/.test(t) ? console.log(`  ⚠ ${p} → ${r.status} «الدفع غير مفعّل» — حالة معروفة، باب مقفل`)
        : no(`${p} → ${r.status} (خطأ خادم)`);
    } else if (r.status === 401 || r.status === 403) ok(`${p} → ${r.status} بلا توكن`);
    else ok(`${p} → ${r.status} (لا ٥٠٠)`);
  }
}

// ⑤ الصحّة — بمفتاح المراقب تعمّق، وبلا مفتاح تأكّد أن البوّابة قائمة.
async function health() {
  console.log('⑤ الصحّة');
  const bare = await get('/api/system?action=health');
  bare.status === 401 || bare.status === 403 ? ok('الصحّة محميّة بلا مفتاح') : no(`الصحّة بلا مفتاح → ${bare.status}`);
  if (!KEY) { console.log('  · لا MONITOR_KEY — تُخطّى القراءة العميقة'); return; }
  const r = await get('/api/system?action=health&key=' + encodeURIComponent(KEY));
  const d = await j(r);
  d && d.ok ? ok('ok: true') : no('ok غير صحيح');
  const rd = d && (d.redisOk ?? d.redis?.ok);
  rd === true ? ok('redisOk: true') : no('redis ' + JSON.stringify(rd));
  const e = d && d.env;
  if (e) (e.healthy ? ok : no)(`env healthy=${e.healthy} ${e.setCount ?? '?'}/${e.total ?? '?'}`);
}

// ⑥ مسارات يفتحها المتصفّح بتصفُّح كامل — انهيارها يُري الزائر صفحة Vercel
// نفسها لا رسالة من التطبيق، ولم تكن مغطّاة. ومعها نداء بهويّة جوّال، لأنّ
// بلاغ المالك كان «فقط في الهواتف» ومسار الجوّال يختار مزوّده بنفسه.
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// ⓘ بطاقة هويّة النشرة خلف هذا العنوان. غرضها واحد: حين ينجح فحصٌ على
// عنوان النشرة ويفشل على النطاق بنفس الالتزام، فالسؤال ليس «ما العطب؟»
// بل «هل هما النشرة نفسها؟». رؤوس Vercel تجيب بلا تخمين.
// \u2461 مِجسّ النشرة: ملفّ بمسار لم يوجد قبل هذه النشرة. المسار الجديد لا
// يمكن أن يكون مخزَّنًا في كاش — فإن غاب عن عنوان بينما هو موجود في الشجرة
// المنشورة، فذلك العنوان لا يخدم هذه النشرة أصلًا. لا تأويل آخر.
async function probe() {
  console.log('\u2461 مِجسّ النشرة');
  const local = existsSync('deploy-probe.txt') ? readFileSync('deploy-probe.txt', 'utf8').trim() : '';
  if (!local) { console.log('  · لا مِجسّ محلّيّ — تُخطّى'); return; }
  const want = (local.match(/commit=(\w+)/) || [])[1] || '';
  const r = await get('/deploy-probe.txt');
  if (r.status === 404) { no('المِجسّ غائب (404) → هذا العنوان لا يخدم النشرة الحاليّة'); return; }
  if (r.status !== 200) { no(`المِجسّ → ${r.status}`); return; }
  const live = (await r.text()).trim();
  const got = (live.match(/commit=(\w+)/) || [])[1] || '؟';
  got === want ? ok(`المِجسّ يطابق: commit=${got}`)
               : no(`المِجسّ من نشرة أخرى: حيّ=${got} ≠ محلّيّ=${want}`);
}

async function identity() {
  console.log('\u24D8 هويّة النشرة خلف هذا العنوان');
  const r = await get('/');
  if (r.status === 0) { no('تعذّر الوصول — ' + (r.err || 'شبكة')); return; }
  for (const k of ['x-vercel-id', 'x-vercel-cache', 'x-matched-path', 'age', 'server']) {
    const v = head(r, k);
    if (v) console.log(`  · ${k}: ${String(v).slice(0, 90)}`);
  }
  const b = await get('/js/app.bundle.js');
  for (const k of ['x-vercel-id', 'x-vercel-cache', 'age']) {
    const v = head(b, k);
    if (v) console.log(`  · bundle ${k}: ${String(v).slice(0, 90)}`);
  }
}

// ⑦ اتّفاق عنوان العودة بين الخطوتين.
//
// redirect_uri_mismatch عاش لأنّ العنوان كان يُبنى مرّتين: المتصفّح من
// window.location.origin والخادم من SITE_URL. الفحص يسأل الخادم عمّا سيرسله
// فعلًا، ويقارن ما يضعه في رابط جوجل بما يعلنه — فإن افترقا مرّة أخرى ظهر
// هنا بالاسم بدل أن يظهر عند المستخدم كصفحة رفض من جوجل.
//
// ويطبع القيمتين في كلّ تشغيل: هما ما يجب أن يكون في Google Cloud Console،
// وقد ضاع علينا وقت طويل ونحن نخمّنهما.
async function oauthOrigin() {
  console.log('\u2466 اتّفاق عنوان العودة');
  const r = await get('/api/system?action=google-start&show=1');
  if (r.status !== 200) { no(`google-start&show=1 \u2192 ${r.status}`); return; }
  let j = null;
  try { j = JSON.parse(await r.text()); } catch (e) { no('show=1 \u2192 ردّ ليس JSON'); return; }
  if (!j.redirect_uri || !j.client_id) { no('show=1 \u2192 ينقصه redirect_uri أو client_id'); return; }
  console.log(`  \u00b7 redirect_uri: ${j.redirect_uri}`);
  console.log(`  \u00b7 client_id: ${j.client_id}`);
  console.log(`  \u00b7 client_id \u0645\u0646 \u0627\u0644\u0628\u064a\u0626\u0629: ${j.client_id_from_env ? '\u0646\u0639\u0645' : '\u0644\u0627 \u2014 \u0627\u062d\u062a\u064a\u0627\u0637 \u0645\u0643\u062a\u0648\u0628'}`);
  j.redirect_uri.endsWith('/api/auth-google-callback')
    ? ok('redirect_uri ينتهي بمسار العودة الصحيح')
    : no(`redirect_uri لا ينتهي بمسار العودة: ${j.redirect_uri}`);

  const g = await get('/api/system?action=google-start&state=smoke', { redirect: 'manual' });
  if (g.status !== 302) { no(`google-start \u2192 ${g.status} (يُنتظر 302)`); return; }
  const loc = head(g, 'location');
  if (!/^https:\/\/accounts\.google\.com\//.test(loc)) { no('التحويل ليس إلى جوجل'); return; }
  ok('يحوّل إلى accounts.google.com بـ302');
  const u = new URL(loc);
  u.searchParams.get('redirect_uri') === j.redirect_uri
    ? ok('العنوان في رابط جوجل يطابق ما يعلنه الخادم')
    : no(`افتراق: الرابط ${u.searchParams.get('redirect_uri')} \u2260 المعلَن ${j.redirect_uri}`);
  u.searchParams.get('client_id') === j.client_id
    ? ok('client_id في رابط جوجل يطابق ما يعلنه الخادم')
    : no('افتراق في client_id بين الرابط والمعلَن');
  u.searchParams.get('state') === 'smoke'
    ? ok('state يُمرَّر كما هو')
    : no('state لا يُمرَّر — حماية CSRF مكسورة');
}

async function navRoutes() {
  console.log('⑥ مسارات التصفُّح الكامل + هويّة جوّال');
  // ٥٠٠ هنا = انهيار الدالّة. أيّ رمز آخر (302 · 400 · 403 · 405) سلوك سليم.
  const routes = [
    ['/api/auth-google-callback', 'GET', null, {}],
    ['/api/auth-google-callback?error=access_denied', 'GET', null, {}],
    ['/api/media?action=img&id=smoke-probe', 'GET', null, {}],
    ['/api/raw', 'GET', null, {}],
    ['/api/ai?action=chat', 'POST', '{}', { 'user-agent': IPHONE_UA }],
    ['/api/ai?action=claude', 'POST', '{}', { 'user-agent': IPHONE_UA }],
  ];
  for (const [p, method, body, extra] of routes) {
    const r = await get(p, {
      method,
      headers: { 'content-type': 'application/json', ...extra },
      redirect: 'manual',
      ...(body ? { body } : {}),
    });
    const label = p + (extra['user-agent'] ? ' [جوّال]' : '');
    if (r.status === 0) { no(`${label} → لا استجابة (${r.err || 'شبكة'})`); continue; }
    const t = await r.text();
    if (/FUNCTION_INVOCATION_FAILED/.test(t)) no(`${label} → انهارت الدالّة`);
    else if (r.status >= 500) {
      /not configured|غير مفعّل|missing [A-Z_]+_API_KEY/.test(t)
        ? console.log(`  ⚠ ${label} → ${r.status} «مفتاح غائب» — إعداد لا انهيار`)
        : no(`${label} → ${r.status} (خطأ خادم)`);
    } else ok(`${label} → ${r.status}`);
  }
}

const vHash = await page();
await sw(vHash);
await login();
await gates();
await health();
await navRoutes();
await oauthOrigin();
await probe();
await identity();
console.log(`\n${fail === 0 ? '✓ الدخان أخضر' : '✗ الدخان أحمر'} — نجح ${pass} · فشل ${fail} · ${BASE}`);
process.exit(fail === 0 ? 0 : 1);
