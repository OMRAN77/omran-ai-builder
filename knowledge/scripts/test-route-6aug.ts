// اختبار حزمة التوجيه — يستخرج الدوالّ من البندل الحيّ ويشغّلها بلا متصفّح وبلا حصّة.
const SRC = '/tmp/vc/src/js/app.bundle.js';
const src = await Bun.file(SRC).text();

function grab(startMark: string, endMark: string): string {
  const i = src.indexOf(startMark);
  if (i < 0) throw new Error('لم أجد: ' + startMark);
  const j = src.indexOf(endMark, i);
  if (j < 0) throw new Error('لم أجد نهاية: ' + startMark);
  return src.slice(i, j + endMark.length);
}
function grabLine(mark: string): string {
  const i = src.indexOf(mark);
  if (i < 0) throw new Error('لم أجد: ' + mark);
  return src.slice(i, src.indexOf('\n', i));
}

const parts = [
  grabLine('const CASUAL_RE = '),
  grab('function isCasualTurn(txt){', '\n}'),
  grabLine('const ROUTE_NEWS_RE = '),
  grabLine('const ROUTE_TRANSLATE_RE = '),
  grabLine('const ROUTE_ANALYSIS_RE = '),
  grab('function pickSpecialtyProvider(txt){', '\n}'),
  grab('function __convLockProvider(', '\n}'),
];

let saved = 0;
const harness = `
  const __swallow = () => {};
  const saveState = () => { globalThis.__saves = (globalThis.__saves || 0) + 1; };
  ${parts.join('\n')}
  return { pickSpecialtyProvider, __convLockProvider, isCasualTurn };
`;
const api = new Function(harness)() as {
  pickSpecialtyProvider: (t: string) => string | null;
  __convLockProvider: (c: any, d: string, o: boolean, r: boolean) => string;
  isCasualTurn: (t: string) => boolean;
};

// ───────── ٢٠ رسالة: المتوقّع مقابل الفعلي ─────────
const cases: [string, string | null][] = [
  ['هلا وغلا', 'groq'],
  ['صباح الخير', 'groq'],
  ['شكرا', 'groq'],
  ['حل لي هذه المسألة: تكامل x^2 dx', 'openai'],
  ['وش قانون المصفوفات؟', 'openai'],
  ['solve this equation 3x+5=20', 'openai'],
  ['اكتب لي قصيدة عن الوطن', 'openai'],
  ['اكتب قصة قصيرة عن صياد', 'openai'],
  ['write me a poem about rain', 'openai'],
  ['آخر الأخبار عن الذكاء الاصطناعي', 'perplexity'],
  ['كم سعر الذهب اليوم؟', 'perplexity'],
  ['شو الطقس اليوم في دبي', 'perplexity'],
  ['من فاز في مباراة أمس؟', 'perplexity'],
  ['latest news about openai', 'perplexity'],
  ['ترجم لي هذا النص للإنجليزي', 'gemini'],
  ['لخص لي هذا المقال', 'gemini'],
  ['summarize this document', 'gemini'],
  ['حلل لي أرقام المبيعات هذي', 'openai'],
  ['قارن بين iPhone و Samsung', 'openai'],
  ['اشرح لي كيف يعمل المحرك الكهربائي', null],
];

let pass = 0, fail = 0;
const rows: string[] = [];
for (const [msg, want] of cases) {
  const got = api.pickSpecialtyProvider(msg);
  const ok = got === want;
  ok ? pass++ : fail++;
  rows.push(`${ok ? '✓' : '✗'} ${String(got ?? 'الافتراضي').padEnd(11)} | متوقّع ${String(want ?? 'الافتراضي').padEnd(11)} | ${msg}`);
}
console.log(rows.join('\n'));
console.log(`\nالتوجيه: ${pass} ناجح · ${fail} فاشل من ${cases.length}`);

// ───────── قفل المحادثة ─────────
const lockTests: string[] = [];
function check(name: string, cond: boolean) { lockTests.push(`${cond ? '✓' : '✗'} ${name}`); return cond; }
let lockPass = 0;

const conv: any = { id: 'c1' };
let p1 = api.__convLockProvider(conv, 'gemini', false, false);
lockPass += +check('أول قرار يُحفظ في المحادثة', p1 === 'gemini' && conv.aiProvider === 'gemini');
let p2 = api.__convLockProvider(conv, 'openai', false, false);
lockPass += +check('النوبة الثانية تلتزم بمزوّد المحادثة', p2 === 'gemini');
let p3 = api.__convLockProvider(conv, 'claude', true, false);
lockPass += +check('البناء/الرؤية استثناء لهذه النوبة وحدها', p3 === 'claude' && conv.aiProvider === 'gemini');
let p4 = api.__convLockProvider(conv, 'groq', false, true);
lockPass += +check('اختيار المستخدم الصريح (الجوال) يتغلّب على القفل', p4 === 'groq');
const conv2: any = { id: 'c2' };
lockPass += +check('محادثة جديدة تبدأ بقرار جديد', api.__convLockProvider(conv2, 'perplexity', false, false) === 'perplexity');
lockPass += +check('بلا محادثة: لا انفجار', api.__convLockProvider(null, 'claude', false, false) === 'claude');
lockPass += +check('الحفظ نُودي مرّتين فقط (محادثتان)', (globalThis as any).__saves === 2);
console.log('\n' + lockTests.join('\n'));
console.log(`\nقفل المحادثة: ${lockPass}/7`);
console.log(`\nالخلاصة: ${fail === 0 && lockPass === 7 ? '✅ كل الاختبارات ناجحة' : '⚠️ يوجد فشل'}`);
