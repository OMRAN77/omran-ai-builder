'use strict';
// tests/talkchar-confirm.test.cjs — v-talkchar-confirm
// العرض: «الشخصيّة الكرتونيّة تتكلّم» في المحادثة ترجع «⚠️ confirm_required» لكلّ غير المالك (VIP أيضًا) — ولا نافذة سؤال.
// الجذر: المسار (app-09، __wantsTalkChar) ينادي veo-create بـfetch خام بلا confirmed، والخادم (requireConfirmation) يردّ 428 لكلّ
// وصف حرّ من غير المالك؛ فيُعاد الطلب بعد ٦ ث (428 ثانية) ثمّ يُرمى الرمز نصًّا خامًا. والكرتنة (صورة مدفوعة) قبلها تمرّ.
// القرار: postWithConfirm بإشارة الطلب نفسه (سؤال الخصم مرّة ثمّ confirmed:true)، وكسر الحلقة على المهلة/النقاط/الإلغاء، والنصوص
// القائمة: omranVideoCodeText (المهلة بالدقائق ونفاد النقاط، ١٤ لغة) وسطر vidCancelled بلا ⚠️ — كمسار الفيديو (v-chat-video-cooldown).
// الاختبار: كتلة المسار بنصّها من __sendPromptCore مع postWithConfirm الحقيقيّ، موصولةً بمعالج veo-create الحقيقيّ (kv مزيّف).
// مراجعة باب المال (١٦ أكتوبر): الكرتنة (صورة مدفوعة) كانت تُخصم قبل سؤال الفيديو فيكذب سطر «لم تُخصم أيّ نقاط»، والإعادة بعد ٥xx
// تسأل ثانيةً. الآن priceCheck (لا خصم ولا قفل ولا مزوّد) يسبق كلّ شيء: المهلة والرصيد ثمّ السعر — مع الكرتون إن لزم — مرّة واحدة،
// وconfirmed:true يُحمل إلى الإنشاء وإعادته؛ ورفض الطلب الدائم (4xx) لا يُعاد.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
process.env.AUTH_SECRET = 'talkchar-confirm-test-secret';
process.env.GEMINI_API_KEY = 'gm-test';
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
  putUser: async (u, rec) => { users.set(u, structuredClone(rec)); },
  isBanned: async () => false, verifyToken: () => null,
});
mock('api/_lib/_vip.js', { isVip: async (u) => vip.has(u) });
const locks = new Set();
mock('api/_lib/abuse-guard.js', {
  videoLock: async (u) => (locks.has(u) ? { ok: false, reason: 'video_cooldown', retryAfter: 150 } : (locks.add(u), { ok: true })),
  releaseVideoLock: async (u) => { locks.delete(u); },
  videoCooldownLeft: async (u) => (locks.has(u) ? 150 : 0),
  imageHourlyGuard: async () => ({ ok: true }),
});
const veo = require(rp('api/_lib/veo-create.js'));
const COST = require(rp('api/_lib/points.js')).COSTS.veo_video;
const IMG = require(rp('api/_lib/points.js')).COSTS.image;

const DAY = 86400000;
const token = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + DAY })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };
const user = (u, pts) => { users.set(u, { username: u, plan: 'free', points: pts }); kv.set('points:' + u, String(pts)); };
const bal = (u) => Number(kv.get('points:' + u));
let upstream = 0;
const plan = []; // حالات المزوّد القادمة بالترتيب (فارغ = ٢٠٠)
global.fetch = async (url) => {
  if (!/predictLongRunning/.test(url)) return new Response('{}', { status: 404 });
  const st = plan.length ? plan.shift() : 200;
  return st === 200 ? new Response(JSON.stringify({ name: 'operations/veo-' + (++upstream) }), { status: 200 })
    : new Response(JSON.stringify({ error: { message: 'models/veo-x: upstream ' + st } }), { status: st });
};
async function serve(body) {
  const res = { code: 200, body: null, setHeader() {}, status(c) { this.code = c; return this; }, end() { return this; }, json(v) { this.body = v; return this; } };
  await veo({ method: 'POST', body }, res);
  return res;
}

const SRC = fs.readFileSync(path.join(root, 'js/app-09-attach.js'), 'utf8');
const block = (src, head, end) => { const i = src.indexOf(head); assert.ok(i >= 0, 'مفقود: ' + head); const j = src.indexOf(end, i); assert.ok(j > i, 'نهاية مفقودة: ' + head); return src.slice(i, j + end.length); };
const TALK = block(SRC, '    if(__wantsTalkChar){\n', '      cur.lastMsgWasImageEdit = false;\n      renderAll(); saveState();\n      return;\n    }');
const POST = block(SRC, 'async function postWithConfirm(url, payload', '\n}\n');
const FRIENDLY = block(SRC, 'function __friendlyErr(e){', '\n}\n');
const HELPER = block(SRC, 'function omranVideoCodeText(', '\n}\n');
const PRICE = block(SRC, 'async function omranTalkPriceCheck(', '\n}\n');
const TD = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/app-11-video-trends-data.js'), 'utf8'), TD);
const TRENDS = TD.window.__VIDEO_TRENDS;
const coolText = (lg, m) => TRENDS.ui.cooldown[lg].replace('⏳', '').trim().replace('{m}', String(m));
const I18N = { vidCancelled: 'أُلغي إنشاء الفيديو — لم تُخصم أيّ نقاط.', plansWhyPoints: 'نقاطك خلصت — اشحن من الباقات وكمّل مباشرة.' };

// «خل الشخصية تتكلم وتقول: …» بشخصيّة جاهزة من المكتبة (__alreadyCartoon: بلا كرتنة) أو بصورته (photo: الكرتنة المدفوعة أوّلًا)
// — الحركة والمدّة من نافذة الخيارين. seq ترتيب الأحداث: price/create/cartoon/confirm.
async function talk(u, opt) {
  const o = Object.assign({ confirm: true, lg: 'ar', photo: false }, opt || {});
  const log = { confirms: [], creates: [], polls: 0, seq: [] };
  const runSignal = { aborted: false };
  const sb = {
    lang: o.lg, text: 'خل الشخصية تتكلم وتقول: هلا والله', localStorage: { getItem: () => o.lg },
    cur: { messages: [] }, thinkingDiv: null, __wantsTalkChar: true, __alreadyCartoon: !o.photo, __charImg: { b64: 'iVBORw0KGgo=', mime: 'image/png' },
    __runCtl: { signal: runSignal }, chatPhase() {}, renderAll() {}, saveState() {}, __swallow() {},
    authGet: () => token(u), t: (k) => I18N[k] || k, AL: () => o.lg, genAbortController: null, Response,
    setTimeout: (fn) => fn(), // انتظار الاستطلاع والإعادة بلا وقت حقيقيّ
    confirm: (m) => { log.confirms.push(m); log.seq.push('confirm'); return o.confirm; },
    fetch: async (url, init) => {
      if (String(url) === '/api/maha-image') { // الكرتنة: صورة مدفوعة بلا تأكيد (كـmaha-image.js) — تُخصم هنا لغير المالك
        log.seq.push('cartoon');
        if (u !== 'omran') kv.set('points:' + u, String(bal(u) - IMG));
        return new Response(JSON.stringify({ imageBase64: 'Q0FSVE9PTg==', mimeType: 'image/png' }), { status: 200 });
      }
      if (String(url).startsWith('/api/video?action=veo-create')) {
        const body = JSON.parse(init.body);
        log.seq.push(body.priceCheck === true ? 'price' : 'create');
        log.creates.push({ price: body.priceCheck === true, confirmed: body.confirmed === true, runSignal: init.signal === runSignal });
        const r = await serve(body);
        return new Response(JSON.stringify(r.body), { status: r.code }); // جسم يُقرأ مرّة كما في المتصفّح
      }
      if (String(url).startsWith('/api/video?action=veo-status')) { log.polls++; return new Response(JSON.stringify({ status: 'SUCCEEDED', output: ['/api/video?action=veo-download&f=x'] }), { status: 200 }); }
      throw new Error('fetch غير متوقّع: ' + url);
    },
  };
  sb.window = sb; sb.__VIDEO_TRENDS = TRENDS; sb.getGuestId = () => 'g-test';
  sb.askTalkCharOpts = async () => ({ motion: 'moving', duration: 6 });
  vm.runInNewContext(HELPER + '\n' + PRICE + '\n' + FRIENDLY + '\n' + POST + '\nthis.go = async function(){\n' + TALK + '\n};', sb);
  await sb.go();
  const m = sb.cur.messages[sb.cur.messages.length - 1];
  return { log, content: m && m.content, video: !!(m && m.attachments && m.attachments[0] && m.attachments[0].isVideo) };
}

const P = (c) => ({ price: true, confirmed: c, runSignal: true });
const C = (c) => ({ price: false, confirmed: c, runSignal: true });

test('١. غير المالك: سؤال السعر مرّة واحدة قبل أيّ خطوة، ثمّ الإنشاء بـconfirmed:true — فيديو ناطق، والخصم والقفل مرّة', async () => {
  user('mona', 1000);
  const r = await talk('mona');
  assert.equal(r.log.confirms.length, 1, 'نافذة تأكيد الخصم مرّة واحدة');
  assert.ok(r.log.confirms[0].includes(String(COST)), 'السعر في النافذة: ' + r.log.confirms[0]);
  assert.deepEqual(r.log.creates, [P(false), P(true), C(true)], 'سؤال السعر (428 ثمّ الموافقة) ثمّ إنشاء واحد مؤكَّد — بإشارة الطلب نفسه');
  assert.ok(!/confirm_required/.test(r.content), r.content);
  assert.equal(r.video, true, 'رسالة الفيديو: ' + r.content);
  assert.equal(r.log.polls, 1);
  assert.equal(bal('mona'), 1000 - COST);
});

test('٢. «إلغاء» في نافذة الخصم: سطر vidCancelled بلا ⚠️، لا إنشاء ولا خصم ولا قفل', async () => {
  user('noor', 1000);
  const r = await talk('noor', { confirm: false });
  assert.equal(r.content, I18N.vidCancelled);
  assert.deepEqual(r.log.creates, [P(false)], 'سؤال السعر وحده — لا إنشاء ولا إعادة');
  assert.equal(bal('noor'), 1000);
  assert.equal(locks.has('noor'), false);
});

test('٣. فيديو ثانٍ داخل المهلة: يُعرف قبل السؤال وقبل أيّ خصم — نصّ المهلة المترجم بالدقائق (لا video_cooldown)', async () => {
  user('sara', 1000);
  assert.equal((await talk('sara')).video, true);
  const r = await talk('sara');
  assert.equal(r.content, '⚠️ ' + coolText('ar', 3));
  assert.deepEqual(r.log.creates, [P(false)], 'لا نافذة ولا إنشاء');
  assert.equal(r.log.confirms.length, 0);
  assert.equal(bal('sara'), 1000 - COST, 'الأوّل وحده مخصوم');
  const en = await talk('sara', { lg: 'en' });
  assert.equal(en.content, '⚠️ ' + coolText('en', 3));
});

test('٤. نفاد النقاط: نصّ الباقات القائم قبل أيّ نافذة أو خصم', async () => {
  user('poor', 10);
  const r = await talk('poor');
  assert.equal(r.content, '⚠️ ' + I18N.plansWhyPoints);
  assert.deepEqual(r.log.creates, [P(false)]);
  assert.equal(r.log.confirms.length, 0);
  assert.equal(bal('poor'), 10);
});

test('٥. المالك: بلا سؤال، فحص السعر يمرّ ثمّ إنشاء واحد بإشارة الطلب، وفيديو', async () => {
  const r = await talk('omran');
  assert.equal(r.log.confirms.length, 0);
  assert.deepEqual(r.log.creates, [P(false), C(true)]);
  assert.equal(r.video, true);
});

test('٦. الخادم: الوصف الحرّ من غير المالك (VIP أيضًا) يطلب التأكيد، وpriceCheck لا يخصم ولا يقفل ولا ينادي المزوّد ويسعّر الكرتون', async () => {
  user('v1', 1000); vip.add('v1');
  const body = { promptText: 'talk', ratio: '720:1280', quality: 'fast', durationSeconds: 6, imageBase64: 'iVBORw0KGgo=', imageMime: 'image/png', keepPhoto: true };
  assert.equal((await serve(Object.assign({ token: token('v1') }, body))).code, 428);
  assert.equal((await serve(Object.assign({ token: token('omran') }, body))).code, 200);
  user('pc', 1000);
  const before = upstream;
  const q = await serve({ priceCheck: true, withCartoon: true, promptText: 'talking character', token: token('pc') });
  assert.equal(q.code, 428);
  assert.equal(q.body.cost, COST + IMG, 'الكرتون ضمن السعر');
  assert.ok(q.body.message_ar.includes(String(COST + IMG)), q.body.message_ar);
  assert.doesNotMatch(q.body.message_ar, /Veo|Gemini|Google|Runway/i);
  const ok = await serve({ priceCheck: true, withCartoon: true, confirmed: true, promptText: 'talking character', token: token('pc') });
  assert.equal(ok.code, 200);
  assert.equal(bal('pc'), 1000, 'لا خصم');
  assert.equal(locks.has('pc'), false, 'لا قفل');
  assert.equal(upstream, before, 'لا نداء مزوّد');
  assert.equal((await serve({ priceCheck: true, promptText: 'x', token: 'bad' })).code, 401);
});

test('٧. صورة المستخدم: السعر (مع الكرتون) يُسأل قبل الكرتنة المدفوعة — الإلغاء لا يكرتن ولا يخصم، والموافقة سؤال واحد', async () => {
  user('huda', 1000);
  const no = await talk('huda', { photo: true, confirm: false });
  assert.deepEqual(no.log.seq, ['price', 'confirm'], 'لا كرتنة بعد الإلغاء');
  assert.equal(no.content, I18N.vidCancelled);
  assert.equal(bal('huda'), 1000, 'سطر «لم تُخصم أيّ نقاط» صادق');
  const yes = await talk('huda', { photo: true });
  assert.deepEqual(yes.log.seq, ['price', 'confirm', 'price', 'cartoon', 'create']);
  assert.ok(yes.log.confirms[0].includes(String(COST + IMG)), 'السعر يشمل الكرتون: ' + yes.log.confirms[0]);
  assert.equal(yes.video, true);
  assert.equal(bal('huda'), 1000 - COST - IMG, 'ما أُعلن هو ما خُصم');
});

test('٨. صورة المستخدم ورصيد يكفي الكرتون لا الفيديو: يُرفض قبل الكرتنة (كان يدفع الكرتون ثمّ points_insufficient)', async () => {
  user('mid', 100);
  const r = await talk('mid', { photo: true });
  assert.deepEqual(r.log.seq, ['price']);
  assert.equal(r.content, '⚠️ ' + I18N.plansWhyPoints);
  assert.equal(bal('mid'), 100);
});

test('٩. عطب مؤقّت (503) ثمّ نجاح: الإعادة بالموافقة نفسها بلا نافذة ثانية، وخصم واحد صافٍ', async () => {
  user('rana', 1000);
  plan.push(503);
  const r = await talk('rana');
  assert.equal(r.log.confirms.length, 1, 'نافذة واحدة');
  assert.deepEqual(r.log.creates, [P(false), P(true), C(true), C(true)]);
  assert.equal(r.video, true);
  assert.equal(bal('rana'), 1000 - COST, 'الأوّل مردود');
  assert.equal(locks.has('rana'), true, 'قفل الناجح وحده');
});

test('١٠. رفض دائم للطلب (400): لا إعادة عمياء، نصّ «غيّر الوصف أو الصورة» بلا اسم مزوّد، والنقاط مردودة', async () => {
  user('lama', 1000);
  plan.push(400);
  const r = await talk('lama');
  assert.deepEqual(r.log.creates, [P(false), P(true), C(true)]);
  assert.match(r.content, /غيّر الوصف أو الصورة/);
  assert.doesNotMatch(r.content, /veo|models\//i);
  assert.equal(bal('lama'), 1000);
  assert.equal(locks.has('lama'), false);
});
