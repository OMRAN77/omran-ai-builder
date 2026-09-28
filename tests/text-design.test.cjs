'use strict';
/* v-text-design — لقطتا المالك ٢٧ سبتمبر: «اكتب عليها كلا م حب زوجين» طُبعت حرفيًّا بخطّ عريض بحدّ أسود فوق وجه الرجل،
   ومرجعه «نفس الصوره الي فيها البنات ٤»: عنوان ذهبيّ «البحر» وأسطر مشكولة أنيقة وزخرفة، في السماء الفارغة بعيدًا عن الوجوه. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseImageTextSpec } = require('../js/app-08-image-text.js');
const design = require('../api/_lib/text-design');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const attach = read('js/app-09-attach.js');

test('«كلام حب / كلا م حب زوجين / كلام لحبيبتي» is a request to author words, not text to print', () => {
  for (const [p, kind] of [['اكتب عليها كلا م حب زوجين', 'flirt'], ['اكتب عليها كلام حب', 'flirt'], ['اكتب كلام لحبيبتي', 'flirt'], ['اكتب عليه كلام جميل', 'phrase'], ['اكتب عليها شعر عن البحر', 'poetry'], ['اكتب خاطرة عن الصداقة', 'phrase']]) {
    const s = parseImageTextSpec(p);
    assert.equal(s.wantsText, true, p);
    assert.equal(s.exactText, null, p + ' — لا يُطبع الطلب نفسه');
    assert.equal(s.autoAuthored, true, p);
    assert.equal(s.kind, kind, p);
  }
  assert.equal(parseImageTextSpec('اكتب «كلام حب»').exactText, 'كلام حب', 'المنصَّص حرفيّ');
  assert.equal(parseImageTextSpec('اكتب كلام الناس ما يهمني').exactText, 'كلام الناس ما يهمني', 'بلا وصف طلب يبقى نصًّا');
  assert.equal(parseImageTextSpec('اكتب حبيبة قلبي').exactText, 'حبيبة قلبي');
});

const geminiReply = (obj) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }) });
const IMG = 'A'.repeat(4000);

test('server: the author sees the photo and returns a title, tashkeel lines and face boxes', async () => {
  let sent = null;
  const out = await design.authorTextDesign('k', 'اكتب عليها كلا م حب زوجين', {
    kind: 'flirt', imageBase64: IMG, imageMime: 'image/jpeg',
    fetchImpl: async (url, init) => { sent = { url, body: JSON.parse(init.body) }; return geminiReply({ title: 'حُبٌّ لا يَنتهي', lines: ['فِي عَيْنَيْكِ وَطَنِي', 'وَفِي قَلْبِي لَكِ عُمْرٌ', 'نَمْشِي مَعًا دَرْبَ الهَوَى'], topicLabel: 'حب', avoid: [{ label: 'face', box_2d: [160, 200, 440, 440] }, { label: 'person', box_2d: [100, 0, 900, 520] }] }); },
  });
  assert.match(sent.url, /gemini-flash-latest:generateContent/);
  const parts = sent.body.contents[0].parts;
  assert.equal(parts[0].inline_data.mime_type, 'image/jpeg', 'الصورة نفسها تُرسل');
  assert.match(parts[1].text, /tender, respectful romantic words/);
  assert.match(parts[1].text, /full correct tashkeel/);
  assert.match(parts[1].text, /box_2d/);
  assert.equal(out.title, 'حُبٌّ لا يَنتهي');
  assert.equal(out.lines.length, 3);
  assert.deepEqual(out.avoid[0], { box: [0.2, 0.16, 0.44, 0.44], label: 'face' }, 'box_2d [ymin,xmin,ymax,xmax]/1000 ← [x0,y0,x1,y1]/1');
  assert.equal(out.avoid[1].label, 'person');
});

test('server: bad designs are rejected and retried; GPT is the only fallback and it sees the photo too', async () => {
  const prev = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'x';
  try {
    let calls = 0, oa = null;
    const out = await design.authorTextDesign('k', 'كلام حب', {
      kind: 'flirt', imageBase64: IMG,
      fetchImpl: async (url, init) => {
        calls++;
        if (/generativelanguage/.test(url)) return geminiReply({ title: 'Love forever in english', lines: ['x'], topicLabel: '' });
        oa = JSON.parse(init.body);
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ title: 'عِشقٌ', lines: ['يا نَبضَ قَلبي', 'ويا ضَوءَ عُمري'], topicLabel: 'حب' }) } }] }) };
      },
    });
    assert.equal(calls, 3, 'محاولتان على Gemini ثمّ GPT');
    assert.equal(oa.messages[0].content[1].type, 'image_url');
    assert.equal(out.title, 'عِشقٌ');
    assert.deepEqual(out.avoid, []);
  } finally { if (prev === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = prev; }
  assert.throws(() => design.validateDesign({ title: 'البحر', lines: ['سطر واحد فقط'] }), /design_bad_lines/);
  assert.throws(() => design.validateDesign({ title: 'عنوان طويل جدًّا من خمس كلمات هنا', lines: ['أ ب', 'ج د'] }), /design_bad_title/);
});

test('server: layout-only returns face boxes, and never fails the write', async () => {
  const r = await design.detectTextLayout('k', { imageBase64: IMG, fetchImpl: async () => geminiReply({ avoid: [{ label: 'face', box_2d: [400, 250, 580, 380] }] }) });
  assert.deepEqual(r.avoid, [{ box: [0.25, 0.4, 0.38, 0.58], label: 'face' }]);
  assert.deepEqual(await design.detectTextLayout('k', { imageBase64: '' }), { avoid: [] });
  assert.deepEqual(design.normBoxes([{ box_2d: [1, 2] }, { box_2d: [500, 500, 400, 600] }, null]), [], 'صناديق فاسدة تُهمل');
  const mi = read('api/_lib/maha-image.js');
  assert.ok(mi.indexOf('if (body.layoutOnly === true)') > 0 && mi.indexOf('if (body.layoutOnly === true)') < mi.indexOf("if (!prompt && !prayerRequest)"), 'قبل شرط الطلب الفارغ');
  assert.match(mi, /checkAndConsume\(token, guestId, 'text-layout', clientIp\(req\)\)/, 'حصّة نصّيّة خاصّة لا رصيد صور');
  assert.match(mi, /body\.wantDesign === true && body\.planPrayerOnly === true && body\.textKind !== 'prayer' && await textDesign\.designRoute/, 'الدعاء يبقى على مخطّطه ونصوصه المأثورة');
});

test('server routes: layout never fails the write; a failed design falls back to the classic planner', async () => {
  const res = () => { const r = { code: 0, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
  const r1 = res(); await design.layoutRoute({ imageBase64: IMG }, r1, 'k', async () => ({ allowed: false }));
  assert.deepEqual([r1.code, r1.body], [200, { avoid: [] }], 'بلا حصّة: قائمة فارغة لا خطأ');
  const r2 = res(); await design.layoutRoute({ imageBase64: IMG }, r2, 'k', async () => { throw new Error('kv down'); });
  assert.deepEqual([r2.code, r2.body], [200, { avoid: [] }]);
  const prev = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
  const origFetch = global.fetch; global.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  try {
    const r3 = res();
    assert.equal(await design.designRoute({ textKind: 'flirt', designImageBase64: IMG }, r3, 'k', 'كلام حب'), false);
    assert.equal(r3.body, null, 'لم يُرسل ردّ: يكمل المخطّط الكلاسيكيّ');
  } finally { global.fetch = origFetch; if (prev !== undefined) process.env.OPENAI_API_KEY = prev; }
});

test('client: one call sends the photo thumbnail; the boxes live in the layer so restyle/replace never call again', () => {
  assert.match(attach, /__thumb = await omranShrinkForEdit\(__layer0 \? __layer0\.baseB64 : __b64, [^\n]*640, true\)/);
  assert.match(attach, /wantDesign:true, designImageBase64:__thumb \? __thumb\.b64 : undefined/);
  assert.match(attach, /\(!__avoid && __thumb && \(!__textSpec\.autoAuthored \|\| __textSpec\.kind === 'prayer'\)\) \? __layoutFetch\(\)/, 'التأليف يعيد الصناديق معه فلا نداء ثانٍ');
  assert.match(attach, /overlayTextOnImage\(__wb64, __wmime, __resolvedText, __textSpec\.fontKey, __textSpec\.color, __pos, __scale, __avoid\)/);
  assert.match(attach, /avoid:__avoid \|\| undefined, outTail:/);
  assert.match(attach, /__l\.position,__l\.scale,__l\.avoid\)/);
  assert.match(attach, /__keepLayer\.position, __keepLayer\.scale, __keepLayer\.avoid\)/);
});

test('client: «title\\n\\nlines» is a title and verses; a short single phrase is a hero title; a long one is lines', () => {
  const a = attach.indexOf('function __designText'), b = attach.indexOf('function __designSaliency');
  const ctx = {}; vm.createContext(ctx); vm.runInContext(attach.slice(a, b) + ';this.D=__designText;', ctx);
  const plain = (x) => JSON.parse(JSON.stringify(x));
  assert.deepEqual(plain(ctx.D('البَحر\n\nيا بَحرُ\nفيكَ الحَياةُ')), { title: 'البَحر', lines: ['يا بَحرُ', 'فيكَ الحَياةُ'], hero: false });
  assert.deepEqual(plain(ctx.D('حبيبة قلبي')), { title: 'حبيبة قلبي', lines: [], hero: true });
  assert.deepEqual(plain(ctx.D('إِنَّا لِلَّهِ وَإِنَّا إِلَيْهِ رَاجِعُونَ')).hero, true);
  const long = plain(ctx.D('في هدوء اللحظات تزهر الأماني النقية وتشرق الحياة'));
  assert.equal(long.title, '');
  assert.equal(long.lines.length, 1);
});

test('client renderer: title leads the block, balanced wrap, kashida only for display, faces weigh 4 and people 1.1', () => {
  const a = attach.indexOf('function __kashida'), b = attach.indexOf('function __designSaliency');
  const ctx = {}; vm.createContext(ctx); vm.runInContext("const __KASHIDA_JOIN = 'بتثجحخسشصضطظعغفقكلمنهيئ';" + attach.slice(a, b) + ';this.K=__kashida;', ctx);
  assert.equal(ctx.K('البَحر'), 'البَحــر', 'عنوان «البحر» كمرجع المالك');
  assert.equal(ctx.K('حبيبة قلبي'), 'حبيبة قلبي', 'أكثر من كلمة: بلا كشيدة');
  assert.equal(ctx.K('سما'), 'سما');
  assert.match(attach, /const titleShown = !named && T\.title \? __kashida\(T\.title\) : T\.title;/, 'العرض وحده؛ نصّ الطبقة حرفيّ');
  assert.match(attach, /Math\.min\(Math\.max\(0\.8 \* bw \/ t100, 2\.6 \* bFs\), 5\.2 \* bFs, base \* 0\.15 \* __sc\)/, 'العنوان ٠٫٨ من عرض الأسطر');
  assert.match(attach, /const wrapBal = \(text, maxW\) =>/);
  assert.match(attach, /\(o\.label === 'face' \? 4 : 1\.1\)/);
  assert.match(attach, /const mX = W \* 0\.09, mY = H \* 0\.035;/);
  assert.match(attach, /sal\.mean > 0\.35 && \(pick\.rel > 1\.15 \|\| pick\.cost > 0\.9 \|\| pick\.st\.sd > 0\.2\)/, 'الشريط للمزدحمة كلّها فقط');
  assert.match(attach, /const goldBusy = \(st\.gold \|\| 0\) > 0\.08 && \(pick\.rel \|\| 0\) > 0\.8;/, 'غيم الغروب ليس نقشًا ذهبيًّا');
  assert.match(attach, /const __DESIGN_TITLE_FONT = 'thuluth', __DESIGN_BODY_FONT = 'diwani';/, 'v-image-fonts: العنوان ثلث والأسطر ديواني');
  assert.match(attach, /getElementById\('gf-' \+ f\.gf\)/, 'وزنان للعائلة نفسها يُحمَّلان');
});

test('review #805 (bugbot): the love words decide the kind too — «كلام لزوجتي» is romantic, not a generic phrase', () => {
  for (const p of ['اكتب كلام لزوجتي', 'اكتب كلام حلو لزوجي', 'اكتب كلام لحبيبة قلبي', 'اكتب عليها كلام لخطيبي', 'اكتب كلام للعريس']) {
    const s = parseImageTextSpec(p);
    assert.equal(s.autoAuthored, true, p);
    assert.equal(s.kind, 'flirt', p);
  }
  assert.equal(parseImageTextSpec('اكتب كلام جميل عن النجاح').kind, 'phrase', 'بلا كلمة حبّ يبقى عبارة');
});

test('review #805 (bugbot): quote marks copied around the title or a line are stripped, not a failed design', async () => {
  const d = design.validateDesign({ title: '«البحر»', lines: ['«يا بَحرُ خُذْ هَمِّي»', '"وَأَعِدْ لِي ضَحِكَتِي"'], topicLabel: 'البحر' });
  assert.deepEqual([d.title, d.lines], ['البحر', ['يا بَحرُ خُذْ هَمِّي', 'وَأَعِدْ لِي ضَحِكَتِي']]);
  assert.doesNotMatch(design.buildDesignPrompt('كلام حب', 'flirt', true), /[«»]/, 'الأمثلة بلا علامات تنصيص كي لا تُنسخ');
  let calls = 0;
  const out = await design.authorTextDesign('k', 'كلام حب', { kind: 'flirt', imageBase64: IMG, fetchImpl: async () => { calls++; return geminiReply({ title: '«حُبٌّ لا يَنتهي»', lines: ['فِي عَيْنَيْكِ وَطَنِي', 'وَفِي قَلْبِي لَكِ عُمْرٌ'], topicLabel: 'حب', avoid: [] }); } });
  assert.equal(calls, 1, 'محاولة واحدة تكفي');
  assert.equal(out.title, 'حُبٌّ لا يَنتهي');
});

test('review #805 (bugbot): a prayer, or a design that fell back to the classic planner, still gets face boxes', () => {
  const i = attach.indexOf('const __layoutFetch = () =>');
  const flow = attach.slice(i, attach.indexOf("__swallow(e, 'img:design-layout-wait')", i));
  assert.ok(i > 0 && flow.length > 0);
  assert.match(flow, /\(!__textSpec\.autoAuthored \|\| __textSpec\.kind === 'prayer'\)\) \? __layoutFetch\(\)/, 'الدعاء لا يمرّ بالتصميم: الصناديق بالتوازي');
  assert.match(flow, /else if\(__planRes\.ok && !__avoid && __thumb && __textSpec\.kind !== 'prayer'\) __avoidP = __layoutFetch\(\);/, 'ردّ بلا صناديق = تصميم فشل: نداء الصناديق الآن');
  assert.ok(flow.indexOf('__avoidP = __layoutFetch()') < flow.indexOf('await __avoidP'), 'يُنتظر بعد إعادة الإسناد');
});
