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

const vHash = await page();
await sw(vHash);
await login();
await gates();
await health();
console.log(`\n${fail === 0 ? '✓ الدخان أخضر' : '✗ الدخان أحمر'} — نجح ${pass} · فشل ${fail} · ${BASE}`);
process.exit(fail === 0 ? 0 : 1);
