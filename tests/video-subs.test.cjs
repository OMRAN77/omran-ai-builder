'use strict';
/* v-video-subs — قرار المالك ٢٤ أكتوبر: «المجاني ما يحصل على الفيديوهات، المشتركين فقط»، وعلى أسئلتي: «أي باقة سارية + VIP»،
   «القوالب المتحرّكة وتحسين الفيديو تبقى للمجاني»، «يشوف كل شي ويطلع له للمشتركين».
   ١) الحارس نفسه (api/_lib/_videoSubs.js) لكلّ نوع حساب. ٢) المعالجات الخمسة الحقيقيّة (kv وسجلّات الحسابات مزيّفة): المجّانيّ يُرفض
   بـ٤٠٣ video_subscribers قبل سؤال الخصم ولا تُمسّ نقاطه، والمشترك يصل سؤال الخصم كما كان. ٣) النصّ بالـ١٤ لغة وربط الواجهة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
process.env.AUTH_SECRET = 'video-subs-test-secret';
process.env.GEMINI_API_KEY = 'gm-test';
process.env.MINIMAX_API_KEY = 'mm-test';
process.env.FAL_KEY = 'fal-test';
process.env.RUNWAY_API_KEY = 'rw-test';
process.env.VIDEO_FIRST_FRAME = 'off';

const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
const kv = new Map();
const users = new Map();
const vip = new Set();
mock('api/_lib/kv.js', {
  kvGetRaw: async (k) => kv.has(k) ? String(kv.get(k)) : null,
  kvSetRaw: async (k, v) => { kv.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (kv.has(k)) return false; kv.set(k, String(v)); return true; },
  kvIncrBy: async (k, n) => { const v = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(kv.get(k) || 0) - Number(n); kv.set(k, String(v)); return v; },
  kvGetJSON: async (k) => { try { return kv.has(k) ? JSON.parse(kv.get(k)) : null; } catch (e) { return null; } },
  kvPutJSON: async (k, v) => { kv.set(k, JSON.stringify(v)); }, kvDel: async (k) => { kv.delete(k); }, kvExpire: async () => {},
  kvIncr: async (k) => { const v = Number(kv.get(k) || 0) + 1; kv.set(k, String(v)); return v; }, kvList: async () => [],
  kvPipeline: async (cmds) => cmds.map(([op, k, v]) => { if (op === 'INCRBY') { const x = Number(kv.get(k) || 0) + Number(v); kv.set(k, String(x)); return x; } kv.set(k, String(v)); return 'OK'; }),
});
mock('api/_lib/auth.js', {
  getUser: async (u) => users.has(u) ? structuredClone(users.get(u)) : null,
  getUserOnce: async (u) => users.has(u) ? structuredClone(users.get(u)) : null,
  putUser: async (u, rec) => { users.set(u, structuredClone(rec)); },
  isBanned: async () => false, verifyToken: () => null,
});
mock('api/_lib/_vip.js', { isVip: async (u) => vip.has(u) });
mock('api/_lib/abuse-guard.js', {
  videoLock: async () => ({ ok: true }), releaseVideoLock: async () => {}, videoCooldownLeft: async () => 0, imageHourlyGuard: async () => ({ ok: true }),
});
const subs = require(rp('api/_lib/_videoSubs.js'));

const DAY = 86400000;
const NOW = Date.now();
const token = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: NOW + DAY })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };
function account(u, rec) { users.set(u, Object.assign({ username: u, points: 1000 }, rec)); kv.set('points:' + u, '1000'); }
account('free1', { plan: 'free' });                                                   // مجّانيّ — وعنده نقاط (حزمة) بلا باقة
account('chat1', { plan: 'basic', planUpdatedAt: NOW - DAY });                         // باقة المحادثة Plus سارية
account('old1', { plan: 'pro', planUpdatedAt: NOW - 40 * DAY });                       // باقة انتهت
account('mix1', { plan: 'free', media: { mix: { plan: 'media_basic', at: NOW - DAY } } });   // «صور وفيديو» سارية
account('vid1', { plan: 'free', media: { video: { plan: 'vid_pro', at: NOW - DAY } } });     // باقة الفيديو القديمة سارية
account('maha1', { plan: 'free', media: { maha: { plan: 'maha_basic', at: NOW - DAY } } });  // مها وحدها — ليست باقة فيديو
account('img1', { plan: 'free', media: { image: { plan: 'img_basic', at: NOW - DAY } } });   // الصور القديمة وحدها
account('vip1', { plan: 'free' }); vip.add('vip1');

test('١. الحارس: المالك وVIP وباقة المحادثة و«صور وفيديو» (والفيديو القديمة) — نعم؛ المجّانيّ وحزمة النقاط والمنتهية ومها والصور وحدها — لا', async () => {
  const yes = ['omran', 'vip1', 'chat1', 'mix1', 'vid1'];
  const no = ['free1', 'old1', 'maha1', 'img1', '', 'nobody'];
  for (const u of yes) assert.equal(await subs.videoAllowed(u), true, u);
  for (const u of no) assert.equal(await subs.videoAllowed(u), false, u);
  /* عطل قراءة الحساب = لا (لا فتح للتكلفة)، والمالك لا يمرّ بالقراءة */
  const broken = { getUser: async () => { throw new Error('redis down'); } };
  assert.equal(await subs.videoAllowed('chat1', broken), false);
  assert.equal(await subs.videoAllowed('omran', broken), true);
});

function res() { return { code: 200, body: null, setHeader() {}, status(c) { this.code = c; return this; }, end() { return this; }, json(v) { this.body = v; return this; } }; }
let upstream = 0;
global.fetch = async () => { upstream++; return new Response(JSON.stringify({ name: 'operations/x', task_id: 't1' }), { status: 200 }); };
const H = {
  veo: (b) => [require(rp('api/_lib/veo-create.js')), { method: 'POST', query: { action: 'veo-create' }, body: Object.assign({ promptText: 'قطّة تلعب في حديقة' }, b) }],
  veoPrice: (b) => [require(rp('api/_lib/veo-create.js')), { method: 'POST', query: { action: 'veo-price' }, body: Object.assign({ promptText: 'talking character', withCartoon: false }, b) }],
  trend: (b) => [require(rp('api/_lib/veo-create.js')), { method: 'POST', query: { action: 'veo-create' }, body: Object.assign({ trend: 'pixarsketch', params: { text: 'x' } }, b) }],
  runway: (b) => [require(rp('api/_lib/video-create.js')), { method: 'POST', body: Object.assign({ promptText: 'قطّة تلعب', duration: 5 }, b) }],
  actor: (b) => [require(rp('api/_lib/actor-create.js')), { method: 'POST', query: { action: 'actor-create' }, body: Object.assign({ speech: 'هلا والله', promptText: 'رجل في مجلس' }, b) }],
  minimax: (b) => [require(rp('api/_lib/minimax-create.js')), { method: 'POST', query: { action: 'minimax-create' }, body: Object.assign({ promptText: 'قطّة تلعب' }, b) }],
  omni: (b) => [require(rp('api/_lib/omni-create.js')), { method: 'POST', query: { action: 'omni-create' }, body: Object.assign({ promptText: 'قطّة تلعب' }, b) }],
};
async function call(kind, user) {
  const [h, req] = H[kind]({ token: token(user) });
  const r = res();
  await h(req, r);
  return r;
}

test('٢. المجّانيّ (وعنده ١٠٠٠ نقطة): كلّ مسار فيديو بالذكاء الاصطناعي ٤٠٣ video_subscribers قبل سؤال الخصم — لا نافذة «تخصم»، ولا نقطة، ولا مزوّد', async () => {
  for (const kind of Object.keys(H)) {
    const before = upstream;
    for (const u of ['free1', 'maha1', 'old1']) {
      const r = await call(kind, u);
      assert.equal(r.code, 403, kind + ' ' + u + ' ' + JSON.stringify(r.body));
      assert.deepEqual(r.body, { error: 'video_subscribers' }, kind + ' ' + u);
      assert.equal(kv.get('points:' + u), '1000', 'لم تُمسّ نقاطه: ' + kind + ' ' + u);
    }
    assert.equal(upstream, before, 'لا نداء مزوّد: ' + kind);
  }
});

test('٣. المشترك (باقة المحادثة، «صور وفيديو»، VIP): يمرّ الحارس فيصل سؤال الخصم أو الإنشاء كما كان — لا ٤٠٣', async () => {
  for (const kind of ['veo', 'veoPrice', 'runway', 'actor', 'minimax', 'omni']) {
    for (const u of ['chat1', 'mix1', 'vip1']) {
      const before = upstream;
      const r = await call(kind, u);
      assert.notEqual(r.code, 403, kind + ' ' + u + ' ' + JSON.stringify(r.body));
      assert.notEqual(r.body && r.body.error, 'video_subscribers', kind + ' ' + u);
      /* الاقتصاديّ لمشترك المحادثة يُصرف من صلاحيّة باقته بلا سؤال (كما قبل) — يصل المزوّد نفسه.
         v-minimax-h3: يُقاس عند النداء الأوّل — ردّ v2 الناجح ({ task_id }) يستهلك صلاحيّة الباقة ويحجز القفل، فنداء ثانٍ يسأل الخصم كما ينبغي */
      if (kind === 'minimax' && u === 'chat1') assert.equal(upstream, before + 1, 'الاقتصاديّ وصل المزوّد');
    }
  }
  /* غير VIP: سؤال الخصم (٤٢٨) كما قبل الحارس — الحارس قبله لا بعده */
  for (const kind of ['veo', 'runway', 'omni']) assert.equal((await call(kind, 'chat1')).code, 428, kind);
});

test('٤. الترتيب في الكود: الحارس بعد التعرّف على الحساب وقبل سؤال الخصم والحجز في الخمسة، وvideo-create بعد حجز اليوم (يُردّ مع الردّ)', () => {
  const G = "if (await require('./_videoSubs.js').denyFree(res, ";
  const at = (src, s) => { const i = src.indexOf(s); assert.ok(i > 0, s); return i; };
  const veo = read('api/_lib/veo-create.js');
  assert.ok(at(veo, G + 'pcUser)) return;') < at(veo, "const pcSteps = "), 'سؤال السعر');
  assert.ok(at(veo, G + 'username)) return;') < at(veo, "quality = await require('./_qualityGate.js')"), 'الإنشاء');
  for (const f of ['minimax-create', 'omni-create', 'actor-create']) {
    const s = read('api/_lib/' + f + '.js');
    assert.ok(at(s, G + 'username)) return;') < at(s, 'pointsLib.requireConfirmation('), f);
  }
  const vc = read('api/_lib/video-create.js');
  assert.ok(at(vc, 'usageResult = await checkVideoQuota(token, res);') < at(vc, G + 'usageResult.username)) return;'));
  assert.ok(at(vc, G + 'usageResult.username)) return;') < at(vc, "pointsLib.requireConfirmation(body, pointsLib.COSTS.runway_video"));
  /* القوالب المتحرّكة وتحسين الفيديو المجّانيّان لا يمرّان به (قرار المالك) */
  for (const f of ['video-enhance.js', 'video-watch.js']) if (fs.existsSync(path.join(root, 'api/_lib', f))) assert.ok(!read('api/_lib/' + f).includes('_videoSubs'), f);
});

test('٥. الواجهة: «الفيديو للمشتركين» بالـ١٤ لغة بلا اسم مزوّد، والميزات الأربع تعرضه، والجدار يفتح «صور وفيديو»، ووسم اللغات مرفوع', () => {
  const a3 = read('js/app-03-i18n-data.js');
  const m = [...a3.matchAll(/\bplansWhyVideoSubs:\s*'([^']*)'/g)].map((x) => x[1]);
  assert.equal(m.length, 2, 'العربيّة والإنجليزيّة');
  const all = { ar: m[0], en: m[1] };
  for (const l of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
    const ctx = { I18N: { [l]: {} }, window: {} };
    vm.createContext(ctx);
    vm.runInContext(read('i18n/' + l + '.js'), ctx);
    all[l] = ctx.I18N[l].plansWhyVideoSubs;
  }
  assert.equal(Object.keys(all).length, 14);
  for (const [l, v] of Object.entries(all)) { assert.ok(v && v.length > 10, l); assert.doesNotMatch(v, /gemini|google|veo|runway|openai|claude|minimax|جيمناي/i, l); }
  assert.match(all.ar, /للمشتركين/);
  /* وسم ملفّات اللغات يُقرأ لا يُثبَّت (سقّاطة arch-ratchet: vPinTests) — رُفع بعد النصّ الجديد */
  const tag = Number((read('js/app-04-i18n-state.js').match(/sc\.src = 'i18n\/' \+ lg \+ '\.js\?v=(\d+)'/) || [])[1]);
  assert.ok(tag >= 771, 'وسم اللغات: ' + tag);
  assert.match(read('js/app-33-plans-gate.js'), /video_subscribers: 'subs'/);
  assert.match(read('js/app-33-plans-gate.js'), /subs: 'plansWhyVideoSubs'/);
  assert.match(read('js/app-11-video-trends.js'), /e\.code === 'video_subscribers' && W\('plansWhyVideoSubs'\)/);
  assert.match(read('js/app-11-video.js'), /code === 'video_subscribers' && typeof window\.t === 'function'\) return '⚠️ ' \+ window\.t\('plansWhyVideoSubs'\)/);
  assert.match(read('js/app-09-attach.js'), /if\(code === 'video_subscribers'\) return t\('plansWhyVideoSubs'\);/);
  const bundle = read('js/app.bundle.js');
  assert.ok(bundle.includes("video_subscribers: 'subs'") && bundle.includes("W('plansWhyVideoSubs')"), 'npm run bundle');
});
