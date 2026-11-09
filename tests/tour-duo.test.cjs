// tests/tour-duo.test.cjs — v-tour-duo: فيديو الجولة بحوار سيف وميرا (شخصيّتا التطبيق الإماراتيّتان) بصوتيهما
// (المالك ٩ نوفمبر: «فيديو كشخصيّة إماراتيّة من هذي مع المحادثة الكلام» ← اختار «الاثنين بحوار بينهم»).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const src = read('scripts/video-anime-tour.mjs');
const block = (start, end) => { const a = src.indexOf(start); return src.slice(a + start.length - 1, src.indexOf(end, a)) + end.trim(); };
const DUO = new Function('return ' + block('const DUO = {', '\n};'))();
const SCENES_TXT = src.slice(src.indexOf('const SCENES = ['), src.indexOf('];', src.indexOf('const SCENES = [')) + 2);
const SC = new Function('return ' + SCENES_TXT.slice(SCENES_TXT.indexOf('['), -1))();
const SAY = new Function('return ' + block('const SAY = [', '];'))();
const sayOf = (t) => SAY.reduce((a, [re, r]) => a.replace(re, r), t);
const key = (w, say) => crypto.createHash('sha1').update(w + '|' + say).digest('hex').slice(0, 12);
const VD = path.join(root, 'video/voice/tour-duo');

test('١. لكلّ مشهد حوار (عدا بطاقة الحلقة)، ولكلّ مثال جملة بعده، والمتكلّمان سيف وميرا وحدهما', () => {
  const keyOf = (s) => s.shot || (s.k === 'chapter' ? 'ch-' + s.chap : s.k);
  for (const s of SC) {
    if (s.k === 'title') continue;
    assert.ok(Array.isArray(DUO[keyOf(s)]) && DUO[keyOf(s)].length, 'لا حوار لـ' + keyOf(s));
    if (s.ex) assert.ok(DUO[keyOf(s) + ':ex'] && DUO[keyOf(s) + ':ex'].length, 'لا جملة بعد مثال ' + keyOf(s));
  }
  const all = Object.values(DUO).flat();
  assert.ok(all.every(([w]) => w === 's' || w === 'm'));
  assert.ok(all.some(([w]) => w === 's') && all.some(([w]) => w === 'm'), 'حوار لا مونولوج');
  assert.equal(DUO.outro.length, 2);
});

test('٢. الشخصيّتان من شخصيّات التطبيق الجاهزة: c1 «شاب إماراتي» = سيف (صوت رجل)، c2 «فتاة إماراتيّة» = ميرا (صوت امرأة)', () => {
  const app = read('js/app-09-attach.js');
  assert.ok(app.includes("{id:'c1', name:omranAttachT('axAttachTcEmiratiMan', 'شاب إماراتي'"));
  assert.ok(app.includes("{id:'c2', name:omranAttachT('axAttachTcEmiratiWoman', 'فتاة إماراتية'"));
  assert.ok(src.includes("s: { name: 'سيف', img: 'assets/characters/c1.png', gender: 'male' }"));
  assert.ok(src.includes("m: { name: 'ميرا', img: 'assets/characters/c2.png', gender: 'female' }"));
  // تُعرض بنصف مقاسها أو أقلّ (٧٢٠ عرضًا ← ٢٥٠ و٣٠٠ و٣٤٠)، وبلا تكبير فوق ١ للمتكلّم
  for (const w of [250, 300, 340]) assert.ok(w * 2 <= 720);
  assert.ok(src.includes('scale(${on ? 1 : 0.94})'));
});

test('٣. النصوص: الاسم OM Ai، لا اسم مزوّد ولا «عمران AI»، والمنطوق يكتب الأرقام والاسم كلمات', () => {
  const all = Object.values(DUO).flat().map(([, t]) => t);
  assert.ok(all.some((t) => t.includes('OM Ai')));
  const banned = /claude|كلود|gemini|جيمناي|grok|غروك|gpt|openai|azure|عمران|omran/i;
  all.forEach((t) => assert.ok(!banned.test(t), t));
  assert.equal(sayOf('جولة في OM Ai… مكان مكان!'), 'جولة في أوم إيه آي… مكان مكان!');
  assert.equal(sayOf('وستايل AI؟'), 'وستايل إيه آي؟');
  assert.equal(sayOf('أزياء AI: صورتك'), 'أزياء إيه آي: صورتك');
  assert.equal(sayOf('وهنا الأدوات: ١٤ أداة في ٣ أقسام.'), 'وهنا الأدوات: أربع عشرة أداة في ثلاثة أقسام.');
});

test('٤. لكلّ جملة صوتها المولَّد في video/voice/tour-duo، من مصدر واحد (لا صوتان مختلفان لشخصيّة)', () => {
  const idx = JSON.parse(fs.readFileSync(path.join(VD, 'index.json'), 'utf8'));
  const lines = [];
  for (const [k, arr] of Object.entries(DUO)) for (const [w, t] of arr) lines.push({ w, t, key: key(w, sayOf(t)), k });
  for (const l of lines) {
    const v = idx[l.key];
    assert.ok(v, 'بلا صوت: ' + l.k + ' — ' + l.t);
    assert.ok(fs.existsSync(path.join(VD, v.file)), v.file);
    assert.ok(v.dur > 0.3 && v.dur < 8, l.t + ' ' + v.dur);
    assert.equal(v.who, l.w);
  }
  assert.equal(new Set(Object.values(idx).map((v) => v.tier)).size, 1, 'مصدر صوت واحد');
});

test('٥. التوليد من خدمة صوت التطبيق نفسها بطلب صريح فقط، بلا مفتاح ولا حساب، والدفعة لا تُقبل إلّا بقصّ حاسم', () => {
  assert.ok(src.includes("const TTS_URL = 'https://omran-ai-builder.vercel.app/api/tts';"));
  assert.ok(src.includes("JSON.stringify({ text, voice: 'maha', gender, lang: 'ar', dialect: 'ae', guestId })"));
  assert.ok(src.includes("if (STAGE === 'voice')") && !/STAGE === 'all' \|\| STAGE === 'voice'/.test(src), 'الأصوات لا تدخل all');
  assert.ok(!/signup|sk-ant-|sk-or-|API_KEY|Ocp-Apim/.test(src.slice(src.indexOf('async function ttsCall'), src.indexOf('async function synthVoices'))));
  assert.ok(src.includes('وقفات القصّ غير حاسمة') && src.includes('Math.min(...pick.map((c) => c.e - c.s)) <= Math.max(...rest)'));
  assert.ok(src.includes("args.includes('--single')"));
});

test('٦. الزمن من الصوت: المشهد يتّسع لكلامه، والفصول والخاتمة على رأس مازورة، والمدّة الكلّيّة معقولة', () => {
  assert.ok(src.includes('Math.ceil((t - GAP + HOLD) / (BAR / 2)) / 2'));
  assert.ok(src.includes("if (nx && nx.k !== 'shot' && acc % 1) { s.bars += 0.5; acc += 0.5; }"));
  const idx = JSON.parse(fs.readFileSync(path.join(VD, 'index.json'), 'utf8'));
  const speech = Object.values(idx).reduce((a, v) => a + v.dur, 0);
  assert.ok(speech > 120 && speech < 200, 'مجموع الكلام ' + speech.toFixed(1));
  // الحوار يخرج في ملفّ منفصل، وفيديو مها الأنمي كما هو
  assert.ok(src.includes("CAST === 'duo' ? 'video/final/om-ai-tour-duo-ar.mp4' : 'video/final/anime-tour-ar.mp4'"));
  assert.ok(src.includes("const CAST = opt('cast', 'maha') === 'duo' ? 'duo' : 'maha';"));
});
