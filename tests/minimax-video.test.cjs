// tests/minimax-video.test.cjs — v-minimax-video: المحرّك الاقتصاديّ (MiniMax Hailuo)
// أُضيف بجانب Runway وVeo. يثبت: (١) الموجّه يعرف المسارين، (٢) نقطة الحالة تُطبّع
// شكل MiniMax إلى {status, output} مثل Runway (نجاح/جارٍ/فشل)، (٣) الواجهة والعميل
// وترجمات كلّ اللغات موجودة، (٤) الإنشاء يبني الطلب الصحيح ويعتمد على المفتاح.
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'synthetic-test-secret-' + 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function fakeRes() {
  return { headers: {}, code: 0, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; },
    json(o) { this.body = o; return this; }, end() { return this; } };
}

test('١. الموجّه يسجّل minimax-create وminimax-status', () => {
  const v = read('api/video.js');
  assert.ok(v.includes("case 'minimax-create': return require('./_lib/minimax-create.js');"));
  assert.ok(v.includes("case 'minimax-status': return require('./_lib/minimax-status.js');"));
});

test('٢. minimax-status: Success → SUCCEEDED مع رابط، Processing → RUNNING، Fail → FAILED', async () => {
  process.env.MINIMAX_API_KEY = 'test-key';
  const handler = require('../api/_lib/minimax-status.js');
  const realFetch = global.fetch;
  // نجاح: أوّل نداء = الاستعلام (Success + file_id)، الثاني = جلب الملفّ (download_url)
  global.fetch = async (url) => {
    if (/query\/video_generation/.test(url)) return { ok: true, json: async () => ({ status: 'Success', file_id: 'F1' }) };
    if (/files\/retrieve/.test(url)) return { ok: true, json: async () => ({ file: { download_url: 'https://cdn/x.mp4' } }) };
    return { ok: false, json: async () => ({}) };
  };
  let res = fakeRes();
  await handler({ method: 'GET', query: { task_id: 'T1' } }, res);
  assert.equal(res.body.status, 'SUCCEEDED');
  assert.equal(res.body.output[0], 'https://cdn/x.mp4');

  // جارٍ
  global.fetch = async () => ({ ok: true, json: async () => ({ status: 'Processing' }) });
  res = fakeRes();
  await handler({ method: 'GET', query: { task_id: 'T1' } }, res);
  assert.equal(res.body.status, 'RUNNING');

  // فشل
  global.fetch = async () => ({ ok: true, json: async () => ({ status: 'Fail' }) });
  res = fakeRes();
  await handler({ method: 'GET', query: { task_id: 'T1' } }, res);
  assert.equal(res.body.status, 'FAILED');

  global.fetch = realFetch;
});

test('٣. minimax-status بلا task_id = 400، وبلا مفتاح = 500', async () => {
  const handler = require('../api/_lib/minimax-status.js');
  let res = fakeRes();
  await handler({ method: 'GET', query: {} }, res);
  assert.equal(res.code, 400);
  const saved = process.env.MINIMAX_API_KEY; delete process.env.MINIMAX_API_KEY;
  res = fakeRes();
  await handler({ method: 'GET', query: { task_id: 'T' } }, res);
  assert.equal(res.code, 500);
  if (saved) process.env.MINIMAX_API_KEY = saved;
});

test('٤. minimax-create: الطلب الصحيح (نقطة النهاية/النموذج/first_frame_image) والكلفة', () => {
  const c = read('api/_lib/minimax-create.js');
  assert.ok(c.includes('/v1/video_generation'), 'نقطة نهاية الإنشاء');
  assert.ok(/MiniMax-Hailuo/.test(c), 'نموذج Hailuo افتراضيّ');
  assert.ok(c.includes('first_frame_image'), 'صورة → تحريك الصورة');
  assert.ok(c.includes('MINIMAX_API_KEY'), 'يعتمد على مفتاح المالك');
  assert.ok(c.includes('minimax_video'), 'يخصم كلفة minimax_video');
  assert.ok(c.includes('refundPoints'), 'يُسترجع الرصيد عند الفشل');
  const p = read('api/_lib/points.js');
  assert.ok(/minimax_video:\s*\d+/.test(p), 'كلفة minimax_video معرّفة');
});

test('٥. الواجهة: خيار المحرّك في القائمة، وفرع العميل، وترجمة كلّ اللغات', () => {
  assert.ok(read('js/partials-core.js').includes('value="minimax"'), 'خيار minimax في القائمة');
  const client = read('js/app-11-video.js');
  assert.ok(client.includes("creationMode === 'minimax'"), 'فرع العميل للمحرّك الاقتصاديّ');
  assert.ok(client.includes('action=minimax-create') && client.includes('action=minimax-status'), 'العميل ينادي المسارين');
  // الترجمة موجودة في الحزمة (عربي + إنجليزي) وكلّ ملفّات i18n
  const i18n = read('js/app-03-i18n-data.js');
  assert.ok((i18n.match(/videoModeMinimax/g) || []).length >= 2, 'مفتاح الترجمة في الحزمة (عربي+إنجليزي)');
  // ملفّات اللغات هي التي تحمل بقيّة أوضاع الفيديو — كلّها يجب أن تحمل الترجمة الجديدة.
  const langs = fs.readdirSync(path.join(root, 'i18n')).filter((f) => f.endsWith('.js') && read('i18n/' + f).includes('videoModeRunwayOnly'));
  assert.ok(langs.length >= 12, 'كلّ ملفّات اللغات ممسوحة');
  for (const f of langs) assert.ok(read('i18n/' + f).includes('videoModeMinimax'), 'ترجمة videoModeMinimax في ' + f);
});

console.log('✓ minimax-video: المحرّك الاقتصاديّ مضاف بجانب Runway/Veo — موجّه، تطبيع حالة، واجهة، وترجمات');
