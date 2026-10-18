'use strict';
/* v-maha-emirati (المالك ١٨ أكتوبر: «نبي مها تصير أحسن مساعد صوتي خليجي… صلّح اللي فشل: تعليمات اللهجة، فهم الكلمات المحلية»).
   مسبار اللهجة (scripts/maha-dialect-probe.mjs، ٣٠ طلبًا إماراتيًّا بصوت حقيقيّ) على تعليمات main: ٢٥ ردًّا من ٣٠ «مخلوط» —
   «الآن» بدل «الحين» في ١٩، و«تبغى/تبغين» الحجازيّة، وكلمات إنجليزيّة («car reveal»، «talking actor»)، وتخاطب الرجل بصيغة
   المؤنّث (تنسخ «افتحي» الموجّهة لها)، و«اطمّن، واضحة وبنحلها» المنسوخة من تعليماتها في ٨ ردود؛ و«البوش» سمعتها «بورش»،
   و«ياهل» صار «شخصًا»، و«صوت ريّال» بحثت له عن معلّق صوتيّ في الويب. هنا: ما يصل الجلسة فعلًا من معالج الإنتاج. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.join(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'maha-emirati-secret';
process.env.OPENAI_API_KEY = 'sk-test';

function loadHandler() {
  stub('api/_lib/_usage.js', { checkAndConsume: async () => ({ allowed: true }), DAILY_LIMIT: 5, clientIp: () => '127.0.0.1' });
  stub('api/_lib/points.js', { verifyPointsToken: () => 'omran', isOwnerUsername: () => true, readPoints: async () => null, COSTS: { maha_minute: 10 } });
  stub('api/_lib/kv.js', { kvGetJSON: async () => null, kvPutJSON: async () => {} });
  for (const f of ['api/_lib/memory.js', 'api/_lib/living-memory.js', 'api/_lib/realtime-session.js']) delete require.cache[rp(f)];
  return require(rp('api/_lib/realtime-session.js'));
}

async function mint(body) {
  const handler = loadHandler();
  const save = global.fetch;
  const sessions = [];
  global.fetch = async (url, init) => {
    sessions.push(JSON.parse(init.body).session);
    return new Response(JSON.stringify({ value: 'ek_test' }), { status: 200 });
  };
  const res = { code: 0, setHeader() { return res; }, status(c) { res.code = c; return res; }, json() { return res; }, send() { return res; }, end() { return res; } };
  try {
    await handler({ method: 'POST', headers: {}, socket: {}, body: Object.assign({ token: 't', app: { lang: 'ar', tools: [] } }, body) }, res);
  } finally {
    global.fetch = save;
  }
  assert.equal(res.code, 200);
  return sessions[sessions.length - 1].instructions;
}

test('١. لهجة إماراتيّة بكلماتها: ما تقوله وما لا تقوله، وبلا إنجليزيّ وسط العربيّ', async () => {
  const f = await mint({});
  assert.ok(f.includes('like a close Emirati friend on the phone'), 'السطر القديم باقٍ');
  assert.ok(f.includes('inside Arabic speech every word is Arabic') && f.includes('no English words'));
  const say = f.split('\n').find((l) => l.startsWith('EMIRATI WORDS TO SAY:'));
  const never = f.split('\n').find((l) => l.startsWith('NEVER SAY (Fus-ha or other dialects):'));
  assert.ok(say && never, 'السطران');
  for (const w of ['الحين', 'شو', 'تبا/تبي', 'وايد', 'باچر', 'مب', 'هيه', 'شحالك']) assert.ok(say.includes(w), 'تقول: ' + w);
  for (const w of ['الآن', 'ماذا', 'تبغى/تبغين', 'كيف أنت', 'بكرة', 'سوف', 'رح', 'تمّ إغلاق']) assert.ok(never.includes(w), 'لا تقول: ' + w);
  for (const w of ['الحين', 'شو', 'وايد', 'باچر', 'مب']) assert.ok(!never.includes(w + '،'), 'كلمة إماراتيّة ليست في الممنوع: ' + w);
});

test('٢. تفهم الكلمات المحلّيّة التي أخطأتها في المسبار: ياهل طفل، البوش إبل، ريّال رجل', async () => {
  const f = await mint({});
  const und = f.split('\n').find((l) => l.startsWith('UNDERSTAND EMIRATI:'));
  assert.ok(und, 'سطر الفهم');
  assert.ok(/ياهل\/يهال = a child\/children \(never a man\)/.test(und));
  assert.ok(/البوش = camels \(never Porsche\)/.test(und));
  assert.ok(/ريّال = a man/.test(und) && /باچر = tomorrow/.test(und) && /العين = the city Al Ain/.test(und));
});

test('٣. تخاطب الرجل بالمذكّر — «افتحي» موجّهة لها لا تعاد له — والمؤنّث لمن تتكلّم عن نفسها بالمؤنّث', async () => {
  const f = await mint({});
  const who = f.split('\n').find((l) => l.startsWith('WHO IS TALKING:'));
  assert.ok(who && who.includes('addressed to YOU - never echo them back'));
  assert.ok(who.includes('Talk to the user as a man') && who.includes('unless they speak of themselves as a woman'));
});

test('٤. لا عبارات محفوظة تُنسخ: «اطمّن، واضحة وبنحلها» و«كفو عليك» لم تعودا في تعليماتها، والطمأنة للمنزعج وحده', async () => {
  const f = await mint({});
  assert.ok(!f.includes('اطمّن، واضحة وبنحلها'), 'العبارة المنسوخة في ٨ ردود');
  assert.ok(!f.includes("'كفو عليك'"), 'المديح لكلّ طلب');
  assert.ok(f.includes('ONLY when the user hits a problem or sounds frustrated') && f.includes('a normal request gets no reassurance'));
  assert.ok(f.includes('never praise a plain request'));
  assert.ok(f.includes('Quoted Arabic phrases in these instructions only show the style - never repeat them word for word'));
});

test('٥. أداة التطبيق لا الويب: سطر المعرفة لكلّ أحد، وأمثلة الفتح وموضع مساعد البريد للمشترك — وعبدالله يرث اللهجة كلّها', async () => {
  const mahaApp = require(rp('api/_lib/maha-app.js'));
  const k = mahaApp.knowledge({ lang: 'ar' });
  assert.ok(k.includes('never search the web for it and never recommend outside apps, websites or freelancers'));
  const allowed = mahaApp.controlNote(true, false);
  assert.ok(allowed.includes('a free animation = video-templates, someone talking about their shop = video-actor, a man\'s voice = settings-voice'));
  assert.ok(allowed.includes('where it is (the Tools tab, then its name)') && allowed.includes('never say you are opening something you will not open'));
  for (const t of ['video-templates', 'video-actor', 'settings-voice']) assert.ok(mahaApp.OPEN_TARGETS.includes(t), 'هدف موجود: ' + t);
  const m = await mint({ voiceGender: 'male' });
  for (const l of ['EMIRATI WORDS TO SAY:', 'NEVER SAY (Fus-ha or other dialects):', 'UNDERSTAND EMIRATI:', 'WHO IS TALKING:']) assert.ok(m.includes(l), 'عبدالله: ' + l);
  assert.ok(m.includes('You are "عبدالله" (Abdullah)'));
});
