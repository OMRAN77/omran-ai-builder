// tests/no-box-glow.test.cjs — v-no-box-glow: «اذا اضغط على اي محرك كل شي يضيى تحت» (المالك ٢٤ أكتوبر ٢٠٢٦ بلقطتي صانع الفيديو).
//
// المقيس بالمسبار (نقرة فأرة حقيقيّة، Chromium): الضغط على محرّك يركّز زرّه، فـ:focus-within في قاعدة توهّج om3-line يطابق
// شريط المحرّكات (#vmkTabs) والاستوديو كلّه (.vmk-studio) — توهّج أبيض حول الشريط وحول البطاقة كلّها؛ والكتابة في الوصف تضيء
// الاستوديو كلّه كذلك. بعد الإصلاح: يتوهّج المركَّز نفسه والمختار وحدهما، وغلاف حقل الكتابة بلا حدّ (#sbSearchWrap) باقٍ.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const CSS = fs.readFileSync(path.join(root, 'css', 'بلا-خطوط.css'), 'utf8');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const P = 'html:not([data-mode="light"]):not(.skin):not(.skin-wood):not(.bgimg)';
const GLOW = 'box-shadow:0 4px 18px rgba(255,255,255,.35) !important';
const bare = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
/* القواعد بمحدِّداتها كاملة — الفاصلة تفصل محدِّدين في المستوى الأعلى فقط لا داخل :is()/:has() */
function topSplit(s) { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; }
const rules = bare.split('}').filter((b) => b.includes('{')).map((b) => { const i = b.indexOf('{'); return { sels: topSplit(b.slice(0, i)), body: b.slice(i + 1).trim() }; });
const glowRules = rules.filter((r) => r.body.includes(GLOW));

test('١. توهّج om3-line لا يطابق صندوقًا لأنّ عنصرًا داخله مركَّز (:focus-within) — لا شريط المحرّكات ولا الاستوديو', () => {
  const om3 = glowRules.flatMap((r) => r.sels).filter((s) => s.includes('.om3-line'));
  assert.ok(om3.length >= 3, 'قواعد توهّج om3-line موجودة');
  for (const s of om3) assert.ok(!s.includes(':focus-within'), s);
});

test('٢. المركَّز نفسه والمختار يتوهّجان كما كانا (التبويب المختار، الزرّ المضغوط، التركيز بلوحة المفاتيح)', () => {
  const r = glowRules.find((x) => x.sels.includes(P + ' .om3-line:not(#om3-a#om3-b):is(:focus,.sel,.selected,.active,.on,[aria-pressed="true"],[aria-selected="true"],[aria-checked="true"])'));
  assert.ok(r, 'قاعدة المركَّز والمختار');
  assert.ok(r.body.includes('border-color:rgba(0,0,0,.06) !important'), 'الحدّ الشبح نفسه');
  assert.ok(glowRules.some((x) => x.sels.includes(P + ' .om3-hot.om3-line:not(#om3-a#om3-b):hover')), 'المرور باقٍ');
});

test('٣. غلاف حقل كتابة بلا حدّ (ابنه المباشر) يتوهّج عند الكتابة — في قاعدة وحدها فلا يُسقط :has قائمة المرور والاختيار', () => {
  const W = P + ' .om3-line:not(#om3-a#om3-b):has(> :is(input,textarea,select):focus)';
  const r = glowRules.find((x) => x.sels.includes(W));
  assert.ok(r, 'قاعدة الغلاف');
  assert.deepEqual(r.sels, [W], 'وحدها في قاعدتها');
  for (const x of glowRules) if (x !== r) for (const s of x.sels) assert.ok(!s.includes(':has(> :is(input'), 'لا :has في قائمة أخرى: ' + s);
  /* الابن المباشر وحده: بلا «>» يطابق الاستوديو حين يُكتب في الوصف فيضيء كلّه */
  assert.ok(!/:has\(\s*:is\(input/.test(bare), 'لا :has بلا ابن مباشر');
});

test('٤. وسم الكاش مرفوع (الملفّ يُحمَّل منفصلًا)', () => {
  const m = HTML.match(/href="css\/بلا-خطوط\.css\?v=(\d+)"/);
  assert.ok(m && Number(m[1]) >= 12, 'v>=12');
});
