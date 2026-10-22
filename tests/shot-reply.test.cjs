// tests/shot-reply.test.cjs — v-shot-reply (أمر المالك ٢٢ أكتوبر): «لما المستخدم يرسل صورة شاشة، الردّ طويل ومعقّد — يسرد كلّ النصوص حرفيًّا».
// الحالات الثلاث: (أ) الجواب أوّلًا بلا سرد للنصوص، (ب) نتائج مزوّدين = جدول خمسة أعمدة ثمّ أفضل ٣ بسبب في سطر، (ج) صفحة متجر بلا نتائج = سطر واحد
// «ابحث عن الخدمة وصوّر لي النتائج وأرتّبها لك» ومعه رابط الموقع. يفحص: القاعدة في نظام دور الصورة الحقيقيّ (chat.js) وفي المسارات القديمة (api/ai.js)،
// قاعدة العميل بلا «اذكره كاملًا»، والمقيِّم (eval/score.cjs) على ردود جيّدة وسيّئة لكلّ حالة، ومشغّل التقييم يرسل اللقطات صورًا فعلًا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

process.env.AUTH_SECRET = 'shot-reply-test-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
delete process.env.ANTHROPIC_API_KEY;
const root = path.join(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
stub('api/_lib/kv.js', { kvGetJSON: async () => null, kvPutJSON: async () => {}, kvDel: async () => {}, kvExpire: async () => {} });
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', checkAndConsume: async () => ({ allowed: true, username: 'shot-user' }) });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
const chat = require(rp('api/_lib/chat.js'));
const SR = require(rp('api/_lib/shot-reply.js'));
const S = require(rp('eval/score.cjs'));
const Q = JSON.parse(fs.readFileSync(path.join(root, 'eval/questions.json'), 'utf8')).questions;
const q = (id) => Q.find((x) => x.id === id);
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const failed = (r) => r.checks.filter((c) => !c.pass).map((c) => c.name);

const token = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60_000 })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };
const sse = (events) => new Response(events.map((e) => 'data: ' + JSON.stringify(e) + '\n').join('') + '\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const textReply = () => sse([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'تمام' } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
]);
const sysText = (b) => (Array.isArray(b.system) ? b.system.map((x) => x.text).join('') : String(b.system || ''));
const IMG = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } };
async function turn(messages) {
  const bodies = [];
  const save = global.fetch;
  global.fetch = async (url, init) => { let b = {}; try { b = JSON.parse(init.body); } catch (e) { /* نداء جانبيّ ليس JSON */ } if (b && b.max_tokens) bodies.push(b); return textReply(); };
  const res = { setHeader() {}, status() { return this; }, json() { return this; }, write() { return true; }, end() { this.writableEnded = true; }, on() {}, flushHeaders() {} };
  try { await chat({ method: 'POST', headers: { 'x-vercel-ip-country': 'AE' }, body: { messages, token: token('shot-user'), provider: 'claude', tz: 'Asia/Dubai' } }, res); }
  finally { global.fetch = save; }
  return bodies[0];
}
const NOTE = SR.SHOT_REPLY_NOTE.trim();

test('١. (أ) الجواب أوّلًا: دور الصورة الحقيقيّ يحمل قاعدة الشكل آخر «اقرأ اللقطة أوّلًا»، وأمر النسخ الحرفيّ القديم زال، ودور النصّ بلاها', async () => {
  const img = sysText(await turn([{ role: 'user', content: [{ type: 'text', text: 'ليش النسخ الاحتياطي ما يشتغل؟' }, IMG] }]));
  assert.ok(img.includes(NOTE), 'قاعدة الشكل تصل نظام دور الصورة');
  assert.ok(img.indexOf('قراءة اللقطة أوّلًا') < img.indexOf(NOTE), 'بعد قاعدة القراءة — الأخير أعلى أولويّة');
  assert.ok(chat.__vimg.IMAGE_READ_NOTE.endsWith(SR.SHOT_REPLY_NOTE), 'جزء من IMAGE_READ_NOTE فيصل الفرعين (بأدوات وبلا أدوات)');
  const plain = sysText(await turn([{ role: 'user', content: 'وش أفضل وقت لزيارة دبي؟' }]));
  assert.ok(!plain.includes('[شكل الردّ على اللقطة'), 'دور بلا صورة لا يحملها');
  const src = read('api/_lib/chat.js');
  assert.ok(!src.includes('(١) كلّ نصّ ظاهر فيها حرفيًّا') && !src.includes('انقل نصّه حرفيًّا في أوّل سطر من ردّك'), 'الأمر الذي كان يُقرأ «اسرد كلّ النصوص» زال');
  assert.ok(/أوّل سطر = جواب سؤال المستخدم/.test(NOTE) && /ممنوع سرد نصوص اللقطة/.test(NOTE) && /إلّا إن طلبها صراحةً/.test(NOTE));

  const good = 'لأنّ مساحة التخزين السحابي ممتلئة (15 من 15 GB)، فما في مكان للنسخة الجديدة.\nالحلّ:\n- فرّغ مساحة من حسابك السحابيّ أو رقّ الباقة.\n- أو أطفئ «تضمين الفيديو» عشان تصغر النسخة.\nبعدها اضغط «نسخ احتياطي الآن».';
  const r1 = S.scoreQuestion(q('shot-answer'), { text: good });
  assert.equal(r1.score, 100, failed(r1).join(' · '));
  const dump = 'في الصورة تظهر شاشة النسخ الاحتياطي للمحادثات، وفيها:\n- ⚠️ تعذّر النسخ الاحتياطي: مساحة التخزين السحابي ممتلئة (15 GB من 15 GB)\n- آخر نسخة ناجحة: ١٤ أكتوبر ٢٠٢٦ — ٣:١٠ ص\n- حجم النسخة: 2.4 GB\n- الحساب: user@example.com\n- نسخ احتياطي تلقائي: يوميًّا\n- تضمين الفيديو: مفعّل\n- النسخ عبر بيانات الجوّال: متوقّف\n- تشفير النسخ الاحتياطي من طرف لطرف: غير مفعّل\n- سجلّ المحادثات المؤرشفة: 37 محادثة\n- الوسائط المحفوظة: 1,284 صورة · 96 فيديو\nالسبب أنّ المساحة ممتلئة.';
  const f = failed(S.scoreQuestion(q('shot-answer'), { text: dump }));
  assert.ok(f.includes('أوّل سطر جواب') && f.includes('بلا وصف للّقطة') && f.includes('نصوص اللقطة ≤2'), f.join(' · '));
});

test('٢. (ب) نتائج مزوّدين: القاعدة تسمّي الأعمدة الخمسة بترتيبها و«أفضل ٣» بسبب في سطر، والمقيِّم يقبل الجدول ويرفض ما عداه', () => {
  assert.deepEqual(SR.TABLE_COLS, ['الاسم', 'التقييم', 'عدد المشترين', 'السعر', 'مدة التسليم']);
  assert.ok(NOTE.includes('| الاسم | التقييم | عدد المشترين | السعر | مدة التسليم |'));
  assert.ok(NOTE.includes('«⭐ أفضل ٣:»') && NOTE.includes('الاسم — السبب في سطر واحد') && NOTE.includes('«—» بلا تخمين'));
  const table = '| الاسم | التقييم | عدد المشترين | السعر | مدة التسليم |\n|---|---|---|---|---|\n| استوديو نقش | 4.9 | 312 | من $25 | 3 أيام |\n| مصمّم سريع | 4.6 | 1,050 | من $10 | يوم واحد |\n| هوية برو | 5.0 | 48 | من $60 | 5 أيام |\n| ريشة ذهبية | 4.8 | 640 | من $18 | يومان |\n| شعارك اليوم | 4.2 | 95 | من $8 | — |';
  const top = '⭐ أفضل ٣:\n1. **استوديو نقش** — 4.9 مع 312 مشترٍ وسعر متوسّط.\n2. ريشة ذهبية — 4.8 و640 مشترٍ وأرخص من الأوّل.\n3. مصمّم سريع — الأسرع والأرخص مع أكبر عدد مشترين.';
  const good = 'أنصحك بـ«استوديو نقش»: تقييم عالٍ وعدد مشترين كبير بسعر معقول.\n\n' + table + '\n\n' + top;
  const r = S.scoreQuestion(q('shot-table'), { text: good });
  assert.equal(r.score, 100, failed(r).join(' · '));
  const list = '1. استوديو نقش ★4.9 — 312 مشترٍ — $25 — 3 أيام\n2. مصمّم سريع ★4.6 — 1,050 مشترٍ — $10 — يوم\n3. هوية برو ★5.0 — 48 مشترٍ — $60 — 5 أيام\n4. ريشة ذهبية ★4.8 — 640 — $18 — يومان\n5. شعارك اليوم ★4.2 — 95 — $8';
  assert.ok(failed(S.scoreQuestion(q('shot-table'), { text: list })).includes('أعمدة: الاسم · التقييم · عدد المشترين · السعر · مدة التسليم'), 'سرد بلا جدول');
  const wrongOrder = table.replace('| الاسم | التقييم | عدد المشترين | السعر |', '| الاسم | السعر | عدد المشترين | التقييم |') + '\n\n' + top;
  assert.ok(failed(S.scoreQuestion(q('shot-table'), { text: wrongOrder })).some((n) => n.startsWith('أعمدة')), 'أعمدة بغير ترتيبها');
  const twoLines = table + '\n\n⭐ أفضل ٣:\n1. استوديو نقش\nلأنّ تقييمه عالٍ وعدد مشتريه كبير\n2. ريشة ذهبية — أرخص\n3. مصمّم سريع — الأسرع';
  assert.ok(failed(S.scoreQuestion(q('shot-table'), { text: twoLines })).includes('أفضل ٣ بسبب في سطر'), 'السبب في سطر ثانٍ');
  const four = table + '\n\n' + top + '\n4. هوية برو — الأعلى تقييمًا';
  assert.ok(failed(S.scoreQuestion(q('shot-table'), { text: four })).includes('أفضل ٣ بسبب في سطر'), 'أربعة لا ثلاثة');
  assert.ok(failed(S.scoreQuestion(q('shot-table'), { text: table })).includes('أفضل ٣ بسبب في سطر'), 'جدول بلا ترشيح');
});

test('٣. (ج) صفحة بلا مزوّدين: سطر واحد بالعبارة حرفيًّا ورابط الموقع إن عُرف — والوصف أو العبارة بلا رابط يسقطان', () => {
  assert.equal(SR.SEARCH_LINE, 'ابحث عن الخدمة وصوّر لي النتائج وأرتّبها لك');
  assert.ok(NOTE.includes('ردّك سطر واحد فقط') && NOTE.includes('«' + SR.SEARCH_LINE + '»') && NOTE.includes('شريط العنوان') && NOTE.includes('رابطه'));
  const good = SR.SEARCH_LINE + ' — في [خدماتي](https://khadamati.example)';
  const r = S.scoreQuestion(q('shot-home'), { text: good });
  assert.equal(r.score, 100, failed(r).join(' · '));
  assert.equal(S.scoreQuestion(q('shot-home'), { text: 'ابحث عن الخدمة، وصور لي النتائج وارتبها لك: https://khadamati.example' }).score, 100, 'بلا تشكيل وبفاصلة = نفس العبارة');
  const describe = 'هذه الصفحة الرئيسيّة لموقع خدماتي، وفيها الأقسام:\n- تصميم وجرافيك\n- كتابة وترجمة\n- برمجة وتطوير\nابحث في قسم التصميم عن مصمّم شعارات.';
  const f = failed(S.scoreQuestion(q('shot-home'), { text: describe }));
  assert.ok(f.includes('أسطر ≤1') && f.includes('العبارة: ' + SR.SEARCH_LINE), f.join(' · '));
  assert.deepEqual(failed(S.scoreQuestion(q('shot-home'), { text: SR.SEARCH_LINE })), ['رابط khadamati.example'], 'الموقع ظاهر في شريط العنوان فرابطه مطلوب');
});

test('٤. المسارات القديمة لكلّ مزوّد (api/ai.js): الصورة = القاعدة آخر الملاحظة في المتوازن والموجَّه والاحترافيّ، وبلا صورة أو في «خام» لا شيء', () => {
  const ai = require('../api/ai.js');
  const withImg = (extra) => Object.assign({ messages: [{ role: 'system', content: 'نظام العميل' }, { role: 'user', content: [{ type: 'text', text: 'مين الأفضل فيهم؟' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } }] }] }, extra);
  const sys = (b) => b.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  for (const mode of ['balanced', 'guided']) {
    for (const premium of [false, true]) {
      const b = withImg({ mode, premium }); ai.__injectNote('openai', b, 'AE');
      assert.ok(sys(b).trimEnd().endsWith(NOTE), mode + (premium ? ' احترافيّ' : '') + ': آخر الملاحظة');
    }
  }
  const g = { mode: 'balanced', contents: [{ role: 'user', parts: [{ text: 'وش هذا؟' }, { inline_data: { mime_type: 'image/png', data: 'iVBORw0KGgo=' } }] }] };
  ai.__injectNote('gemini', g, 'AE');
  assert.ok(JSON.stringify(g.systemInstruction).includes(JSON.stringify(NOTE).slice(1, 60)), 'Gemini: في systemInstruction');
  const plain = { mode: 'balanced', messages: [{ role: 'user', content: 'وش أفضل وقت لزيارة دبي؟' }] }; ai.__injectNote('openai', plain, 'AE');
  assert.ok(!sys(plain).includes('[شكل الردّ على اللقطة'), 'بلا صورة لا تُضاف');
  const raw = withImg({ mode: 'factory' }); ai.__injectNote('openai', raw, 'AE');
  assert.ok(!sys(raw).includes('[شكل الردّ على اللقطة'), 'خام: الطلب كما هو');
});

test('٥. قاعدة العميل (app-09 والحزمة): لا «اذكره كاملًا بدون تلخيص» ولا وصف الشاشة أوّلًا — النسخ الحرفيّ بطلب صريح فقط', () => {
  for (const f of ['js/app-09-attach.js', 'js/app.bundle.js']) {
    const s = read(f);
    assert.ok(!s.includes('واذكره كاملًا بدون تلخيص'), f + ': أمر السرد زال');
    assert.ok(s.includes('نسخ نصوص الصورة كاملةً حرفيًا فقط إن طلبه المستخدم صراحةً'), f);
    assert.ok(s.includes('حدّد لنفسك أي شاشة/صفحة بالضبط تظهر في الصورة (اسم التطبيق والقسم) بلا وصفها في الردّ'), f);
  }
});

test('٦. مشغّل التقييم يرسل لقطات الحالات الثلاث صورًا حقيقيّة مع السؤال، وردود الشكل الصحيح تأخذ ١٠٠', async () => {
  const seen = [];
  const replies = {
    'ليش النسخ الاحتياطي ما يشتغل؟': 'لأنّ مساحة التخزين السحابي ممتلئة، فرّغ مساحة ثمّ اضغط «نسخ احتياطي الآن».',
    'مين الأفضل فيهم؟': 'استوديو نقش.\n\n| الاسم | التقييم | عدد المشترين | السعر | مدة التسليم |\n|---|---|---|---|---|\n| استوديو نقش | 4.9 | 312 | $25 | 3 أيام |\n| مصمّم سريع | 4.6 | 1,050 | $10 | يوم |\n| هوية برو | 5.0 | 48 | $60 | 5 أيام |\n| ريشة ذهبية | 4.8 | 640 | $18 | يومان |\n| شعارك اليوم | 4.2 | 95 | $8 | — |\n\n⭐ أفضل ٣:\n1. استوديو نقش — توازن التقييم والعدد\n2. ريشة ذهبية — جودة بسعر أقلّ\n3. مصمّم سريع — الأسرع',
    'أبي أحد يصمم لي شعار، مين أختار؟': SR.SEARCH_LINE + ' — في [خدماتي](https://khadamati.example)',
  };
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const b = JSON.parse(body || '{}');
      seen.push(b);
      const c = b.messages[0].content;
      const text = Array.isArray(c) ? (c.find((x) => x.type === 'text') || {}).text : c;
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end('data: ' + JSON.stringify({ delta: replies[text] || 'تمام' }) + '\n\ndata: ' + JSON.stringify({ done: true }) + '\n\n');
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-eval-'));
  try {
    const code = await new Promise((resolve) => {
      const p = spawn(process.execPath, [path.join(root, 'scripts/eval-run.mjs')], {
        env: Object.assign({}, process.env, { EVAL_BASE: 'http://127.0.0.1:' + srv.address().port, EVAL_TOKEN: 'tok-test', EVAL_ONLY: 'shot-answer,shot-table,shot-home', EVAL_OUT: out, EVAL_PREV_DIR: path.join(out, 'none') }),
        stdio: 'ignore',
      });
      p.on('exit', resolve);
    });
    assert.equal(code, 0);
    assert.equal(seen.length, 3);
    for (const b of seen) {
      const [img, txt] = b.messages[0].content;
      assert.equal(img.type, 'image');
      assert.equal(img.source.media_type, 'image/png');
      assert.ok(Buffer.from(img.source.data, 'base64').subarray(1, 4).toString() === 'PNG' && img.source.data.length > 20000, 'لقطة PNG حقيقيّة');
      assert.equal(txt.type, 'text');
    }
    const res = JSON.parse(fs.readFileSync(path.join(out, 'result-claude.json'), 'utf8'));
    assert.deepEqual(res.results.map((r) => [r.id, r.score]).sort(), [['shot-answer', 100], ['shot-home', 100], ['shot-table', 100]], JSON.stringify(res.results.map((r) => [r.id, failed(r)])));
    assert.ok(fs.readFileSync(path.join(out, 'report-claude.md'), 'utf8').includes('لقطات الشاشة'));
  } finally {
    srv.close();
  }
});
