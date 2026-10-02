// tests/video-download.test.cjs — v-dl-lock (أمر المالك ٢ أكتوبر «سكّره»): بروكسي التحميل كان يجلب أيّ رابط https ويمرّره
// بنوعه كما هو تحت نطاقنا. يثبّت على المعالج الحقيقيّ (بلا شبكة: حلّ الأسماء والجلب مزيّفان): الداخل محجوب (مباشرةً، وباسم
// يُحلّ إلى عنوان خاصّ، وبتحويلة)؛ فيديو وصور فقط ولا SVG ولا صفحة ولا برنامج؛ octet-stream بامتداد وسائط يُرسَل بنوع
// الامتداد؛ وسقف الحجم؛ والفيديو العاديّ يمرّ كما كان مع اسم ملفّ صحيح وnosniff.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const dl = require('../api/video-download.js');

const PUBLIC = '93.184.216.34';
function res() {
  return {
    code: 200, headers: {}, chunks: [], ended: false, json: null, headersSent: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; },
    write(b) { this.headersSent = true; this.chunks.push(Buffer.from(b)); return true; }, once() {},
    end() { this.ended = true; return this; }, jsonBody: null,
  };
}
async function get(url, upstream, dns) {
  const r = res();
  r.json = function (v) { this.jsonBody = v; this.ended = true; return this; };
  const calls = [];
  dl.__deps.lookup = async (host) => [{ address: (dns && dns[host]) || PUBLIC, family: 4 }];
  dl.__deps.fetchFn = async (u) => { calls.push(String(u)); return typeof upstream === 'function' ? upstream(String(u)) : upstream; };
  try { await dl({ method: 'GET', query: { url } }, r); } finally { dl.__deps.lookup = undefined; dl.__deps.fetchFn = undefined; }
  return { r, calls };
}
const media = (type, body, extra) => new Response(body || new Uint8Array([1, 2, 3]), { status: 200, headers: Object.assign({ 'content-type': type }, extra || {}) });

test('١. الداخل محجوب: localhost والبيانات الوصفيّة والشبكات الخاصّة، واسم يُحلّ إلى عنوان خاصّ — بلا أيّ جلب', async () => {
  for (const u of ['https://localhost/a.mp4', 'https://127.0.0.1/a.mp4', 'https://169.254.169.254/latest/meta-data', 'https://10.0.0.5/x.mp4', 'https://metadata.google.internal/x']) {
    const { r, calls } = await get(u, media('video/mp4'));
    assert.equal(r.code, 403, u); assert.equal(calls.length, 0, u);
  }
  const { r, calls } = await get('https://evil.example/x.mp4', media('video/mp4'), { 'evil.example': '192.168.1.10' });
  assert.equal(r.code, 403); assert.equal(calls.length, 0, 'الاسم يُحلّ قبل الجلب');
  assert.equal((await get('http://cdn.example/x.mp4', media('video/mp4'))).r.code, 400, 'https وحده كما كان');
});

test('٢. تحويلة إلى الداخل محجوبة', async () => {
  const { r, calls } = await get('https://cdn.example/x.mp4', (u) => (/cdn\.example/.test(u)
    ? new Response(null, { status: 302, headers: { location: 'https://internal.example/secret' } })
    : media('video/mp4')), { 'internal.example': '10.1.2.3' });
  assert.equal(r.code, 403);
  assert.deepEqual(calls, ['https://cdn.example/x.mp4'], 'لا جلب للهدف الداخليّ');
});

test('٣. فيديو وصور فقط: الصفحة والسكربت والبرنامج وSVG تُرفض، ولا يُمرَّر منها بايت', async () => {
  for (const t of ['text/html; charset=utf-8', 'application/javascript', 'application/x-msdownload', 'image/svg+xml', 'application/json']) {
    const { r } = await get('https://cdn.example/x', media(t));
    assert.equal(r.code, 415, t); assert.equal(r.chunks.length, 0, t);
  }
  const exe = await get('https://cdn.example/setup.exe', media('application/octet-stream'));
  assert.equal(exe.r.code, 415, 'octet-stream بلا امتداد وسائط');
});

test('٤. الفيديو والصورة يمرّان كما كانا، باسم ملفّ بنوعهما وnosniff؛ وoctet-stream بامتداد mp4 = video/mp4', async () => {
  let { r } = await get('https://dnznrvs05pmza.cloudfront.net/abc.mp4?sig=1', media('video/mp4', new Uint8Array([9, 9]), { 'content-length': '2' }));
  assert.equal(r.code, 200);
  assert.equal(r.headers['content-type'], 'video/mp4');
  assert.equal(r.headers['content-disposition'], 'attachment; filename="omran-ai-video.mp4"');
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.deepEqual(Buffer.concat(r.chunks), Buffer.from([9, 9]));
  ({ r } = await get('https://bucket.oss.example/clip.mp4', media('application/octet-stream')));
  assert.equal(r.code, 200); assert.equal(r.headers['content-type'], 'video/mp4');
  ({ r } = await get('https://v3.fal.media/files/x/out.webp', media('image/webp')));
  assert.equal(r.headers['content-disposition'], 'attachment; filename="omran-ai-image.webp"');
});

test('٥. سقف الحجم: المعلن فوقه يُرفض قبل أيّ بايت', async () => {
  const { r } = await get('https://cdn.example/big.mp4', media('video/mp4', null, { 'content-length': String(dl.MAX_BYTES + 1) }));
  assert.equal(r.code, 413); assert.equal(r.chunks.length, 0);
});
