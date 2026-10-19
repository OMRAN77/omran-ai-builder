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

test('١. لهجة إماراتيّة افتراضيّة بكلماتها، والفصحى ممنوعة في كلّ لهجة — ومن يتكلّم لهجة أخرى يأخذ كلماتها، وبلا إنجليزيّ وسط العربيّ', async () => {
  const f = await mint({});
  assert.ok(f.includes('like a close Emirati friend on the phone'), 'السطر القديم باقٍ');
  assert.ok(f.includes('unless they clearly use another Arabic dialect, then match it'), 'مجاراة لهجته باقية');
  assert.ok(f.includes('inside Arabic speech every word is Arabic') && f.includes('no English words'));
  assert.ok(f.includes('in Arabic a plain Emirati verb (فتحته لك، ضبطته، سكّرتها، كبّرت الخط), never «تمّ + noun» or الآن'), 'تأكيد الأداة بفعل إماراتيّ لا «تمّ فتح»');
  const say = f.split('\n').find((l) => l.startsWith('EMIRATI WORDS (your default Arabic):'));
  const never = f.split('\n').find((l) => l.startsWith('NEVER SAY (Fus-ha, in any dialect):'));
  assert.ok(say && never, 'السطران');
  for (const w of ['الحين', 'شو', 'وايد', 'باچر', 'مب', 'هيه', 'شحالك/شحالج', 'خبّرني/خبّريني']) assert.ok(say.includes(w), 'تقول: ' + w);
  // التشغيلتان 39190791087/39190933801: «تبغى» رجعت ٨/٦٠ لمّا صار المنع شرطًا عامًّا — الآن أزواج «قولي لا تقولي» في الإماراتيّ
  assert.ok(say.includes('In Emirati say تبا/تبي not تبغى/تبغين، باچر not بكرة، شو not إيش، and never تريد، رح، هلّق، بدّك'));
  for (const w of ['الآن', 'ماذا', 'كيف أنت', 'غدًا', 'سوف', 'تمّ إغلاق']) assert.ok(never.includes(w), 'فصحى ممنوعة: ' + w);
  // مراجعة النقض: كلمات اللهجات الأخرى ليست «ممنوعة» على أهلها — ممنوعة في الردّ الإماراتيّ وحده
  for (const w of ['إيش', 'تبغى', 'بكرة', 'مو', 'رح', 'بدّك', 'تريد']) assert.ok(!never.includes(w), 'ليست في الممنوع العامّ: ' + w);
  assert.ok(say.includes('clearly speaks another dialect') && say.includes("gets their own dialect's words instead"));
});

test('٢. تفهم الكلمات المحلّيّة التي أخطأتها في المسبار: ياهل طفل، البوش إبل، ريّال رجل', async () => {
  const f = await mint({});
  const und = f.split('\n').find((l) => l.startsWith('UNDERSTAND EMIRATI:'));
  assert.ok(und, 'سطر الفهم');
  assert.ok(/ياهل\/يهال = a child\/children \(never a man - an image prompt says 'a little boy' or 'a child'\)/.test(und));
  assert.ok(/البوش = camels \(never Porsche\)/.test(und));
  assert.ok(/ريّال = a man/.test(und) && /باچر = tomorrow/.test(und) && /العين = the city Al Ain/.test(und));
});

test('٣. صيغ المؤنّث الموجّهة لها لا تعاد له ولا تدلّ عليه — والجنس من الذاكرة ثمّ كلامه عن نفسه ثمّ صوته، وإلّا المذكّر الخليجيّ المعتاد', async () => {
  const f = await mint({});
  const who = f.split('\n').find((l) => l.startsWith('WHO IS TALKING:'));
  assert.ok(who && who.includes('addressed to YOU - never echo them back; they say nothing about the user'));
  assert.ok(who.includes('USER MEMORY says, then by how they speak of themselves'));
  assert.ok(who.includes("then by a clearly woman's or man's voice (a woman: تبين، قولي، اختاري)"), 'صوت المرأة يكفي للمؤنّث');
  // التشغيلتان 39190791087/39190933801: «صيغة محايدة عند الشكّ» أعطت رجلًا بصوت رجل صيغ المؤنّث ١٠/٦٠ (تبين، تشوفين) — السابقة ٠/٦٠
  assert.ok(who.includes('When none of these is clear, use the usual Gulf masculine') && who.includes('never switch to feminine because of what they asked for'));
  assert.ok(!who.includes('Talk to the user as a man (تبي، قول لي، اختار، حاب) unless'), 'لا مذكّر يغلب صوت المرأة');
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
  assert.ok(k.includes('When the user wants to MAKE something one of these tools makes') && k.includes('never send them to outside apps, websites or freelancers for it'));
  assert.ok(k.includes('Information, news, real-world or social-media trends, links and shopping still follow your search rules (search_web)'), 'البحث والروابط والأخبار كما هي');
  const allowed = mahaApp.controlNote(true, false);
  assert.ok(allowed.includes('a free animation = video-templates, someone talking about their shop = video-actor, «وين أغيّر صوتج» or «أبا صوت ريّال» = your own voice, so settings-voice where the male voice عبدالله is'));
  assert.ok(allowed.includes('ONLY after ok:true (in Arabic a plain Emirati verb like «فتحته لك» - never «تمّ فتح»)'));
  assert.ok(allowed.includes('where it is (the Tools tab - «الأدوات» - then its name)') && k.includes('«الأدوات» in Arabic') && allowed.includes('never say you are opening something you will not open'));
  for (const t of ['video-templates', 'video-actor', 'settings-voice']) assert.ok(mahaApp.OPEN_TARGETS.includes(t), 'هدف موجود: ' + t);
  const m = await mint({ voiceGender: 'male' });
  for (const l of ['EMIRATI WORDS (your default Arabic):', 'NEVER SAY (Fus-ha, in any dialect):', 'UNDERSTAND EMIRATI:', 'WHO IS TALKING:']) assert.ok(m.includes(l), 'عبدالله: ' + l);
  assert.ok(m.includes('You are "عبدالله" (Abdullah)'));
});

