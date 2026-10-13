// tests/img-token-write.test.cjs — v-img-token-write (المالك ١٣ أكتوبر): الوكيل يرسم ثم يرفع بـimage:"__IMG_1__"
// من دون أن يحمّل المالك الصورة. مسار النجاح: generate_image يحفظ /i/ + الرمز ← write_github يحلّ الرمز ← blob في الشجرة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const GW = require('../api/_lib/github-write.js');
const OD = require('../api/_lib/owner-draw.js');
const SG = require('../api/_lib/share-gate.js');

function pngBytes() {
  const p = new PNG({ width: 2, height: 2 });
  for (let i = 0; i < 16; i += 4) { p.data[i] = 180; p.data[i + 1] = 40; p.data[i + 2] = 20; p.data[i + 3] = 255; }
  return PNG.sync.write(p);
}
const PNG_B64 = pngBytes().toString('base64');
const DRAW = '✅ رُسمت الصورة (engine: test). ضع هذا الرمز حرفيًّا في src بلا أي إضافة: __IMG_1__ رابطها في التطبيق: /i/a1b2c3d4e5f6.jpg — ارفعها بـwrite_github ملف {path: مسار الصورة في المستودع, image: "__IMG_1__"}';

const lookup = async () => [{ address: '140.82.112.3', family: 4 }];
const ghRes = (obj, status) => ({ ok: !status || status < 400, status: status || 200, headers: new Headers(), json: async () => obj, text: async () => JSON.stringify(obj) });
function net(extraOpts) {
  const calls = [];
  const routes = [
    ['GET', /^\/repos\/o\/r$/, ghRes({ default_branch: 'main' })],
    ['GET', /^\/repos\/o\/r\/git\/ref\/heads\/main$/, ghRes({ object: { sha: 'basesha' } })],
    ['POST', /^\/repos\/o\/r\/git\/blobs$/, ghRes({ sha: 'imgblob' }, 201)],
    ['GET', /^\/repos\/o\/r\/git\/commits\/basesha$/, ghRes({ tree: { sha: 'basetree' } })],
    ['POST', /^\/repos\/o\/r\/git\/trees$/, ghRes({ sha: 'newtree' })],
    ['POST', /^\/repos\/o\/r\/git\/commits$/, ghRes({ sha: 'abc1234567', html_url: 'https://github.com/o/r/commit/abc1234567' })],
    ['POST', /^\/repos\/o\/r\/git\/refs$/, ghRes({ ref: 'refs/heads/x' }, 201)],
    ['GET', /^\/repos\/o\/r\/pulls\?/, ghRes([])],
    ['POST', /^\/repos\/o\/r\/pulls$/, ghRes({ number: 9, html_url: 'https://github.com/o/r/pull/9' }, 201)],
  ];
  const fetchImpl = async (url, init) => {
    const p = String(url).replace('https://api.github.com', '');
    const method = (init && init.method) || 'GET';
    let body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) { body = null; }
    calls.push({ method, url: p, body });
    for (const [m, re, r] of routes) if (m === method && re.test(p)) return r;
    return ghRes({ message: 'Not Found' }, 404);
  };
  return { calls, opts: Object.assign({ fetchImpl, lookup, env: { GITHUB_TOKEN: 'tok' } }, extraOpts || {}) };
}

test('١. نتيجة الرسم تُزاوج __IMG_1__ برابط /i/، وwrite_github يرفض الرمز بلا خريطة', () => {
  const tok = GW.parseImageTokens(DRAW);
  assert.equal(tok.__IMG_1__, 'a1b2c3d4e5f6');
  assert.equal(GW.imageIdOf('__IMG_1__', tok), 'a1b2c3d4e5f6');
  assert.equal(GW.imageIdOf('__IMG_1__'), '');
  assert.equal(GW.imageIdOf('/i/a1b2c3d4e5f6.jpg'), 'a1b2c3d4e5f6');
  const miss = GW.validateInput({ files: [{ path: 'a.webp', image: '__IMG_1__' }] });
  assert.match(miss.error, /لا يقابل صورة محفوظة/);
  const ok = GW.validateInput({ files: [{ path: 'assets/studio/options/heritage-omani.webp', image: '__IMG_1__' }] }, null, tok);
  assert.deepEqual(ok.images, [{ path: 'assets/studio/options/heritage-omani.webp', id: 'a1b2c3d4e5f6' }]);
});

test('٢. رسم ← رمز ← رفع مسار heritage-omani.webp: PNG يُحوَّل WebP والـblob في الشجرة وطلب سحب', async () => {
  const tok = GW.parseImageTokens(DRAW);
  const n = net({
    imageTokens: tok,
    getImage: async (id) => (id === 'a1b2c3d4e5f6' ? { mime: 'image/png', b64: PNG_B64 } : null),
  });
  const out = await GW.pushFiles({
    repo: 'o/r',
    message: 'بدّل صورة عماني بكمة',
    files: [{ path: 'assets/studio/options/heritage-omani.webp', image: '__IMG_1__' }],
  }, n.opts);
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal(out.prNumber, 9);
  const blob = n.calls.find((c) => c.method === 'POST' && c.url.endsWith('/git/blobs'));
  assert.equal(blob.body.encoding, 'base64');
  const raw = Buffer.from(blob.body.content, 'base64');
  assert.equal(raw.toString('ascii', 0, 4), 'RIFF');
  assert.equal(raw.toString('ascii', 8, 12), 'WEBP');
  const tree = n.calls.find((c) => c.method === 'POST' && c.url.endsWith('/git/trees')).body.tree;
  assert.ok(tree.some((e) => e.path === 'assets/studio/options/heritage-omani.webp' && e.sha === 'imgblob'));
});

test('٣. صور المالك المرفقة تُحفظ بـTTL ٢٤ ساعة ويصل النموذج رابط /i/', async () => {
  const puts = [];
  const share = require('../api/_lib/img-share.js');
  const orig = share.putImage;
  share.putImage = async (data, mime, w, h, ttl) => { puts.push({ mime, ttl, n: String(data).length }); return 'cafebabecafe'; };
  try {
    const msg = { role: 'user', content: [
      { type: 'text', text: 'غيّر هذي' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG_B64 } },
    ] };
    const r = await OD.stampAttach(msg);
    assert.equal(r.tokens.__ATT_1__, 'cafebabecafe');
    assert.equal(puts[0].ttl, OD.DRAW_TTL);
    assert.equal(OD.DRAW_TTL, 24 * 3600);
    assert.ok(msg.content[0].text.includes('/i/cafebabecafe.png'));
    assert.ok(msg.content[0].text.includes('write_github'));
    assert.ok(msg.content.some((b) => b && b.type === 'image'));
  } finally { share.putImage = orig; }
});

test('٤. سلّة owner-draw بعمر يوم، والعميل والخادم يمرّران الرمز', () => {
  const p = SG.uploadPlan({ purpose: 'owner-draw' }, 'share-img', 30, 7 * 86400);
  assert.equal(p.ttlSec, 24 * 3600);
  assert.equal(p.ownerDraw, true);
  assert.equal(p.bucket, 'owner-draw-img');
  assert.equal(SG.uploadPlan({}, 'share-img', 30, 7 * 86400).ttlSec, 7 * 86400);
  const src = read('js/app-17-agent-tools.js');
  assert.match(src, /purpose: 'owner-draw'/);
  assert.match(src, /async function saveOwnerDraw/);
  assert.match(src, /eLine \+= await saveOwnerDraw/);
  assert.ok(src.includes('if (args && args.noRef') && src.includes('write_github ملف'));
  const chat = read('api/_lib/chat.js');
  assert.match(chat, /imageTokens: __ownerOps\.imgTok/);
  assert.match(chat, /stampAttach\(convo\[convo\.length - 1\]\)/);
  assert.match(chat, /parseImageTokens\(result\)/);
  const ge = read('api/_lib/github-edit.js');
  assert.match(ge, /imgFiles/);
  assert.match(ge, /imageTokens/);
  const bundle = read('js/app.bundle.js');
  assert.match(bundle, /purpose: 'owner-draw'/);
  assert.match(GW.TOOL.description, /__IMG_N__/);
});
