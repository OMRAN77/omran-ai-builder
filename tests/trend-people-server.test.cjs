// tests/trend-people-server.test.cjs — v-trend-people (نصف الخادم): شخصيّتان أو ثلاث في فيديو
// الترند. محرّك الفيديو يقبل صورة أولى واحدة، وميزة مراجعه عرضيّة 16:9 فقط بينما ٤١ من
// الترندات الـ٤٥ طوليّة — فنبني من صور الأشخاص أوّل إطار واحدًا فيهم كلّهم بخطّ الدمج القائم،
// ثمّ يحرّكه المحرّك. يثبّت: شرط «كلّهم وكلّ واحد بوجهه» في الأمر، وبناء أوّل إطار بالنسبة
// الصحيحة، وأنّ صورة واحدة تمرّ كما كانت، وأنّ فشل الدمج يردّ الخصم ويفكّ القفل.
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'synthetic-test-secret-' + 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const tp = require('../api/_lib/trend-people.js');
const { buildTrendPrompt } = require('../api/_lib/video-trends.js');

function fakeRes() {
  return { headers: {}, code: 0, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; },
    json(o) { this.body = o; return this; }, end() { return this; } };
}

test('١. الأمر: شخص واحد كما كان، وأكثر يُلحق شرط «كلّهم ولا يُدمجون في واحد»', () => {
  const one = buildTrendPrompt('heritagesing', { text: 'يا هلا', hasImage: true });
  const two = buildTrendPrompt('heritagesing', { text: 'يا هلا', hasImage: true, people: 2 });
  assert.equal(one.people, 1);
  assert.equal(two.people, 2);
  assert.ok(two.prompt.startsWith(one.prompt), 'الشرط يُلحق ولا يعيد كتابة القالب');
  const extra = two.prompt.slice(one.prompt.length);
  assert.match(extra, /contains 2 different people/);
  assert.match(extra, /all 2 of them must appear together/);
  assert.match(extra, /never merge them into one person/);
  assert.match(extra, /never drop anyone/);
  assert.ok(!/different people/.test(one.prompt), 'لا شرط لشخص واحد');
  assert.equal(buildTrendPrompt('heritagesing', { people: 99 }).people, 3, 'الحدّ ٣');
  assert.equal(buildTrendPrompt('heritagesing', { people: 'x' }).people, 1);
  // القوالب كلّها تقبل الشرط بلا تعديل أيّ منها (v-trends-more-2: ٤٥ ← ٥٥)
  const keys = Object.keys(require('../api/_lib/video-trends.js').TRENDS);
  assert.ok(keys.length >= 55, 'عدد الترندات نقص: ' + keys.length);
  for (const k of keys) assert.match(buildTrendPrompt(k, { people: 3, text: 'x', name: 'x' }).prompt, /all 3 of them must appear together/, k);
});

test('٢. النسبة: الترند الطوليّ 9:16 وغيره 16:9 — أوّل إطار يطابق إطار الفيديو', () => {
  assert.equal(tp.aspectOf('720:1280'), '9:16');
  assert.equal(tp.aspectOf('1280:720'), '16:9');
  assert.equal(tp.aspectOf(''), '16:9');
  assert.equal(tp.MAX_PEOPLE, 3);
  const task = tp.frameTask(3, 'an old Arabian souq with lanterns');
  assert.match(task, /OPENING FRAME/);
  assert.match(task, /ALL 3 people/);
  assert.match(task, /old Arabian souq with lanterns/);
  assert.match(task, /Never merge two people into one face/);
  assert.match(task, /never add a person who is not in the reference photos/);
});

test('٣. أوّل إطار: صورتان → نداء دمج واحد بكلّ الصور وعناوينها، وصورة واحدة → لا عمل', async () => {
  const seen = [];
  const opts = {
    faceCrops: async () => [],
    callImage: async (key, parts, aspect) => { seen.push({ key, parts, aspect }); return { b64: 'GROUP', mime: 'image/png' }; },
  };
  const two = [{ data: 'AAAA', mime: 'image/png' }, { data: 'BBBB', mime: 'image/jpeg' }];
  const out = await tp.groupFirstFrame('K', two, 'a souq scene', '720:1280', opts);
  assert.deepEqual([out.b64, out.mime], ['GROUP', 'image/png']);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].aspect, '9:16');
  const texts = seen[0].parts.filter((p) => p.text).map((p) => p.text);
  const datas = seen[0].parts.filter((p) => p.inlineData).map((p) => p.inlineData.data);
  assert.deepEqual(datas, ['AAAA', 'BBBB'], 'الصورتان بترتيب الرفع');
  assert.ok(texts.some((t) => /^Photo 1 of 2:/.test(t)) && texts.some((t) => /^Photo 2 of 2:/.test(t)), 'كلّ صورة بعنوانها');
  assert.match(texts[texts.length - 1], /ALL 2 people/, 'الأمر الكامل آخرًا');

  assert.equal(await tp.groupFirstFrame('K', [two[0]], 's', '720:1280', opts), null, 'صورة واحدة = المسار القديم');
  assert.equal(await tp.groupFirstFrame('K', [], 's', '720:1280', opts), null);
  assert.equal(seen.length, 1, 'لا نداء زائد');

  // أكثر من الحدّ يُقصّ على ٣، وعطب كشف الوجوه لا يوقف الدمج
  const four = [1, 2, 3, 4].map((n) => ({ data: 'P' + n, mime: 'image/png' }));
  await tp.groupFirstFrame('K', four, 's', '1280:720', { faceCrops: async () => { throw new Error('detect down'); }, callImage: opts.callImage });
  assert.deepEqual(seen[1].parts.filter((p) => p.inlineData).map((p) => p.inlineData.data), ['P1', 'P2', 'P3'], 'الحدّ ٣');
  assert.equal(seen[1].aspect, '16:9');
});

test('٤. veo-create: شخصيّتان تبنيان أوّل إطار قبل المحرّك، وفشل الدمج يردّ الخصم ويفكّ القفل', async () => {
  const src = read('api/_lib/veo-create.js');
  assert.match(src, /const trendPeople = Array\.isArray\(body\.imagesBase64\)/);
  assert.match(src, /if \(body\.trend && trendPeople\.length > 1\) \{/);
  assert.match(src, /groupFirstFrame\(apiKey, trendPeople, promptText, ratio\)/);
  assert.match(src, /if \(chargedUser\) await pointsLib\.refundPoints\(chargedUser, pointsLib\.COSTS\.veo_video\);\n\s+if \(videoLocked\) await require\('\.\/abuse-guard\.js'\)\.releaseVideoLock\(videoLocked\);\n\s+res\.status\(frame\.status \|\| 502\)/, 'الفشل يردّ الاثنين');
  // الدمج بعد القفل عمدًا: مهلة الثلاث دقائق هي ما يحدّ نداءاته
  assert.ok(src.indexOf('videoLocked = username;') < src.indexOf('groupFirstFrame'), 'بعد القفل');
  assert.ok(src.indexOf('groupFirstFrame') < src.indexOf("await fetch(GL + '/models/'"), 'قبل نداء المحرّك');

  // المعالج الحقيقيّ بمالك (بلا خصم) ومزوّد مزيّف: الصورتان تصيران أوّل إطار واحدًا
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.OWNER_USERNAMES = 'omran';
  const crypto = require('crypto');
  const payload = Buffer.from(JSON.stringify({ u: 'omran', exp: Date.now() + 60000 })).toString('base64url');
  const token = payload + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');

  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, init) => {
    calls.push(String(url));
    if (/gemini-3-pro-image/.test(url)) {
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { data: 'GROUPFRAME', mimeType: 'image/png' } }] } }] }) };
    }
    const body = JSON.parse(init.body);
    calls.push(body.instances[0]);
    return { ok: true, json: async () => ({ name: 'operations/x1' }) };
  };
  const res = fakeRes();
  await require('../api/_lib/veo-create.js')({ method: 'POST', body: {
    trend: 'heritagesing', params: { text: 'يا هلا', people: 2 }, token,
    imageBase64: 'AAAA', imageMime: 'image/png',
    imagesBase64: ['AAAA', 'BBBB'], imagesMime: ['image/png', 'image/png'],
  } }, res);
  global.fetch = realFetch;
  assert.equal(res.code, 200, JSON.stringify(res.body));
  const inst = calls.find((c) => c && c.prompt);
  assert.ok(inst, 'وصل نداء المحرّك');
  assert.equal(inst.image.bytesBase64Encoded, 'GROUPFRAME', 'أوّل إطار هو الصورة المدموجة لا الأولى');
  assert.match(inst.prompt, /all 2 of them must appear together/);
  assert.ok(calls.some((c) => typeof c === 'string' && /gemini-3-pro-image/.test(c)), 'نداء الدمج تمّ');
});

test('٥. صورة واحدة: لا نداء دمج ولا تغيّر في المسار القائم', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.OWNER_USERNAMES = 'omran';
  const crypto = require('crypto');
  const payload = Buffer.from(JSON.stringify({ u: 'omran', exp: Date.now() + 60000 })).toString('base64url');
  const token = payload + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
  const urls = []; let inst = null;
  const realFetch = global.fetch;
  global.fetch = async (url, init) => {
    urls.push(String(url));
    inst = JSON.parse(init.body).instances[0];
    return { ok: true, json: async () => ({ name: 'operations/x2' }) };
  };
  const res = fakeRes();
  await require('../api/_lib/veo-create.js')({ method: 'POST', body: {
    trend: 'heritagesing', params: { text: 'يا هلا' }, token, imageBase64: 'ONLYONE', imageMime: 'image/png',
  } }, res);
  global.fetch = realFetch;
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.ok(!urls.some((u) => /gemini-3-pro-image/.test(u)), 'لا نداء دمج لصورة واحدة');
  assert.equal(inst.image.bytesBase64Encoded, 'ONLYONE');
  assert.ok(!/different people/.test(inst.prompt), 'لا شرط أشخاص');
});
