'use strict';
/* v-maha-app (المالك ١٧ أكتوبر: «جربتها ماتعرف شي عن الي في التطبيق الا المميزات الجديده» ثمّ «اريدها تتحكم في التطبيق
   لي المشتركين»): معرفة مها بالتطبيق كانت فقرة يدويّة قديمة (شاشات لا وجود لها وأسماء مزوّدين)، ولا تحكّم. الآن:
   معرفة تُبنى من الكتالوج ومن أدوات الشاشة الظاهرة للمستخدم، وأداتا تحكّم بقائمة مغلقة للمشترك وحده — والقرار في الخادم. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

process.env.AUTH_SECRET = 'maha-app-secret';
process.env.OPENAI_API_KEY = 'sk-test';
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const kv = new Map();
mock('api/_lib/kv.js', {
  kvGetRaw: async (k) => (kv.has(k) ? String(kv.get(k)) : null),
  kvSetRaw: async (k, v) => { kv.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (kv.has(k)) return false; kv.set(k, String(v)); return true; },
  kvIncrBy: async (k, n) => { const v = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(kv.get(k) || 0) - Number(n); kv.set(k, String(v)); return v; },
  kvDel: async (k) => { kv.delete(k); },
  kvGetJSON: async () => null, kvPutJSON: async () => {}, kvExpire: async () => {},
});
const users = new Map();
mock('api/_lib/auth.js', {
  getUser: async (u) => (users.has(u) ? structuredClone(users.get(u)) : null),
  putUser: async (u, rec) => { users.set(u, structuredClone(rec)); },
  isBanned: async () => false,
  verifyToken: () => null,
});
const vips = new Set();
mock('api/_lib/_vip.js', { isVip: async (ids) => [].concat(ids).some((x) => vips.has(String(x).toLowerCase())) });
mock('api/_lib/_usage.js', { checkAndConsume: async () => ({ allowed: true }), DAILY_LIMIT: 5, clientIp: () => '127.0.0.1', todayCount: async () => 0, bumpCount: async () => {} });
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: () => {} });

const M = require(rp('api/_lib/maha-app.js'));
const CAT = require(rp('api/_lib/app-catalog.js'));
const handler = require(rp('api/_lib/realtime-session.js'));

const token = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60000 })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };
let sent = null;
global.fetch = async (url, init) => { sent = JSON.parse(init.body).session; return new Response(JSON.stringify({ value: 'ek_test' }), { status: 200 }); };
async function mint(body) {
  sent = null;
  const res = { code: 200, j: null, setHeader() { return res; }, status(c) { res.code = c; return res; }, json(j) { res.j = j; return res; }, send(b) { res.j = b; return res; }, end() { return res; } };
  await handler({ method: 'POST', headers: {}, socket: {}, body: Object.assign({ mode: 'assistant' }, body) }, res);
  return { code: res.code, j: res.j, s: sent, tools: sent ? sent.tools.map((t) => t.name) : [] };
}
const DAY = 86400000;
const APP = { lang: 'en', tools: [{ id: 'btnVideoMaker', name: 'Video Maker', sub: 'Create and edit videos' }, { id: 'btnBrandNewTool', name: 'Brand New Tool', sub: 'a feature added after this code' }] };

test('١. المعرفة حيّة: أدوات الشاشة بأسمائها ووصف الكتالوج وما داخل الأدوات — والفقرة القديمة وأسماء المزوّدين ذهبت', async () => {
  users.set('free1', { username: 'free1', points: 70, mahaTrialUsed: true });
  const r = await mint({ token: token('free1'), app: APP });
  assert.equal(r.code, 200);
  const f = r.s.instructions;
  for (const want of ['# App Knowledge', '- Video Maker (Create and edit videos): the video maker', '- Brand New Tool (a feature added after this code).',
    'Portrait styles: ', 'Style AI sections: ', 'Fashion AI: ', 'one-tap trend videos', 'SETTINGS (the gear)', 'فريق om ai'] /* v-om-ai-name */) assert.ok(f.includes(want), want);
  for (const gone of ['The ⋮ menu has sections', '9 AI providers', '🚗 السيارات', 'استكشف explore', '🎙️ الصوت voice', 'free guest 20 messages']) assert.ok(!f.includes(gone), 'ذهب: ' + gone);
  const k = f.slice(f.indexOf('# App Knowledge'), f.indexOf('# App Control'));
  assert.ok(!M.PROVIDER_RE.test(k), 'لا اسم مزوّد في المعرفة: ' + (k.match(M.PROVIDER_RE) || [])[0]);
  // بلا قائمة من المتصفّح (حزمة قديمة مخزَّنة): أدوات الخادم المعروفة بأسمائها
  const old = await mint({ token: token('free1') });
  assert.ok(old.s.instructions.includes('- صانع الفيديو') && old.s.instructions.includes('- رأيك يهمنا'));
  const b = await mint({ token: token('free1'), mode: 'builder', app: APP });
  assert.ok(!b.s.instructions.includes('# App Knowledge') && !b.s.instructions.includes('# App Control'), 'البنّاء بتعليماته وحدها');
});

test('٢. cleanTools: شكل المعرّف، والقصّ، ولا رموز حقن ولا أسماء مزوّدين', () => {
  assert.equal(M.cleanTools('x'), null);
  const many = Array.from({ length: 60 }, (_, i) => ({ id: 'btnT' + i, name: 'Tool ' + i }));
  assert.equal(M.cleanTools(many).length, 40);
  const out = M.cleanTools([
    { id: 'btnOk', name: '✨ Video\nMaker <b>', sub: 'x'.repeat(300) },
    { id: 'evil', name: 'x' }, { id: 'btnBad id', name: 'x' }, { id: 'btnOk', name: 'dup' },
    { id: 'btnProv', name: 'Gemini studio' }, { id: 'btnSub', name: 'Fine', sub: 'powered by Claude' }, { id: 'btnEmpty', name: '' },
  ]);
  assert.deepEqual(out.map((t) => t.id), ['btnOk', 'btnSub']);
  assert.equal(out[0].name, 'Video Maker b');
  assert.equal(out[0].sub.length, 100);
  assert.equal(out[1].sub, '', 'وصف فيه اسم مزوّد يُحذف');
});

test('٣. من يتحكّم: المالك وVIP وباقة المحادثة السارية وباقة مها السارية — لا الصور وحدها ولا المنتهية ولا المجّانيّ ولا الضيف ولا البنّاء', async () => {
  const now = Date.now();
  users.set('plus', { username: 'plus', points: 300, mahaTrialUsed: true, plan: 'basic', planUpdatedAt: now - DAY });
  users.set('expired', { username: 'expired', points: 300, mahaTrialUsed: true, plan: 'pro', planUpdatedAt: now - 36 * DAY });
  users.set('mahaplan', { username: 'mahaplan', points: 0, mahaTrialUsed: true, media: { maha: { plan: 'maha_basic', at: now - DAY } } });
  kv.set('media:maha:mahaplan', '5500'); // رصيد دقائق باقته (فلس) — يدفع دقيقة الافتتاح منه بلا نقاط
  users.set('mixonly', { username: 'mixonly', points: 300, mahaTrialUsed: true, media: { mix: { plan: 'media_basic', at: now - DAY } } });
  users.set('vipuser', { username: 'vipuser', points: 0, mahaTrialUsed: false, email: 'v@x.com' });
  vips.add('vipuser');
  users.set('free2', { username: 'free2', points: 300, mahaTrialUsed: true });
  const yes = ['omran', 'plus', 'mahaplan', 'vipuser'];
  const no = ['expired', 'mixonly', 'free2'];
  for (const u of yes.concat(no)) {
    const r = await mint({ token: token(u), app: APP });
    const want = yes.includes(u);
    assert.equal(r.code, 200, u);
    assert.equal(r.j.appControl, want, u);
    assert.equal(r.tools.includes('open_in_app') && r.tools.includes('app_action'), want, u + ': الأداتان');
    assert.ok(r.s.instructions.includes(want ? "# App Control (this user's plan includes it)" : 'is a subscriber feature that is not on this user'), u + ': الملاحظة');
    for (const kept of ['search_web', 'set_reminder', 'look_camera', 'generate_image']) assert.ok(r.tools.includes(kept), u + ': ' + kept);
  }
  // رمز متساهل لا يكفي (verifyPointsToken يقبل حمولة بلا exp) — الصارم وحده
  const p = Buffer.from(JSON.stringify({ u: 'plus' })).toString('base64url');
  const lax = p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
  const rl = await mint({ token: lax, app: APP });
  assert.equal(rl.j && rl.j.appControl === true, false, 'حمولة بلا exp لا تفتح التحكّم');
  const guest = await mint({ app: APP });
  assert.notEqual(guest.j && guest.j.appControl, true, 'الضيف: لا تحكّم');
  if (guest.s) assert.ok(!guest.tools.includes('open_in_app'));
  const builder = await mint({ token: token('omran'), mode: 'builder', app: APP });
  assert.equal(builder.j.appControl, false, 'البنّاء: لا تحكّم');
  assert.ok(!builder.tools.includes('open_in_app'));
  // الفوترة كما هي: المشترك بالنقاط تُخصم دقيقة افتتاحه
  const pts = users.get('plus').points;
  assert.ok(pts < 300, 'الدقيقة الأولى خُصمت كما كانت');
});

test('٤. الحارس: كلّ أداة في شاشة الأدوات موصوفة لمها، وإمّا تُفتح بصوتها أو مستثناة بسبب — والأهداف كلّها لها منفّذ', () => {
  const feat = read('js/app-10-features.js');
  const ids = [];
  for (const g of ['grpCreate', 'grpBusiness', 'grpLife']) {
    const m = feat.match(new RegExp("title: '" + g + "', ids: \\[([^\\]]+)\\]"));
    assert.ok(m, g);
    m[1].split(',').forEach((x) => ids.push(x.trim().replace(/'/g, '')));
  }
  const paused = (read('js/app-05-ui.js').match(/var OMRAN_PAUSED_TOOLS = \[([^\]]*)\]/) || [])[1].split(',').map((x) => x.trim().replace(/'/g, ''));
  assert.deepEqual(CAT.PAUSED.slice().sort(), paused.slice().sort(), 'الموقوفة في الكتالوج = الموقوفة في الواجهة');
  const described = new Set(CAT.SCREENS.flatMap((s) => (s.steps || []).filter((x) => x.click).map((x) => x.click.replace('#', ''))).concat(Object.keys(M.EXTRA_TOOLS)));
  for (const id of ids) {
    if (paused.includes(id) || M.HIDDEN.includes(id)) continue;
    assert.ok(described.has(id), id + ': أداة بلا وصف لمها — أضفها إلى SCREENS أو EXTRA_TOOLS');
    assert.ok(M.CONTROL_TOOLS[id] || M.NO_CONTROL[id], id + ': إمّا هدف تحكّم أو استثناء بسبب');
  }
  const client = read('js/app-43-maha-app.js');
  const keysOf = (name) => { const a = client.indexOf('const ' + name + ' = {'); const b = client.indexOf('\n};', a); return Array.from(client.slice(a, b).matchAll(/^\s+'?([a-z-]+)'?\s*:/gm), (x) => x[1]); };
  const executable = new Set(keysOf('MAHA_APP_TOOLS').concat(Object.keys({ 'video-trends': 1, 'video-templates': 1, 'video-ai': 1, 'video-cinematic': 1, 'video-actor': 1, 'video-enhance': 1 }), ['chats', 'files', 'preview', 'code']));
  const settings = client.slice(client.indexOf('const MAHA_APP_SETTINGS = {'), client.indexOf('};', client.indexOf('const MAHA_APP_SETTINGS = {')));
  for (const t of M.OPEN_TARGETS) assert.ok(executable.has(t) || settings.includes("'" + t + "'") || settings.includes(' ' + t + ':'), t + ': هدف بلا منفّذ في المتصفّح');
  for (const id of Object.keys(M.CONTROL_TOOLS)) assert.ok(executable.has(M.CONTROL_TOOLS[id]), id);
  for (const a of M.ACTIONS) assert.ok(client.includes("action === '" + a + "'"), a + ': إجراء بلا منفّذ');
  for (const tab of ['trend', 'canvas', 'runway', 'veo', 'actor', 'clean']) assert.ok(read('js/video.js').includes("'" + tab + "'"), 'قسم الفيديو ' + tab);
});

test('٥. الأبواب المقفلة: المنفّذ لا يلمس شراءً ولا حذفًا ولا خروجًا ولا توليدًا ولا بريدًا ولا تنقّلًا خارج الصفحة', () => {
  const client = read('js/app-43-maha-app.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  for (const bad of ['openCheckout', 'buyPointsPack', 'startStripe', 'Paypal', 'doLogout', 'appFullCleanup', 'memoryClearBtn', 'livingMemClear', 'btnDeleteAll',
    'btnDeleteChat', 'GenerateBtn', 'email-send', 'emailSend', 'startPhone', 'location.href', 'location.reload', 'window.confirm', 'btnAdStudio', 'btnEmailAssist',
    'chkAutoRenew', 'setMediaQuality', 'apiKeysSection', 'ownerSection', 'showModal', 'querySelector(String', 'eval(', 'new Function']) {
    assert.ok(!client.includes(bad), 'ممنوع في المنفّذ: ' + bad);
  }
  for (const t of M.OPEN_TARGETS) assert.ok(/^[a-z-]+$/.test(t), t);
});

test('٦. مراقبة الإغلاق: نقرة المنفّذ (mahaActing) لا تُنهي المكالمة، ونقرة المستخدم تُنهيها كما كانت', () => {
  const src = read('js/app-08-maha.js');
  const slice = src.slice(src.indexOf('const MAHA_SILENCE_END_MS = 20000;'), src.indexOf('function mahaEndCall(){'));
  const listeners = [];
  let ended = 0;
  const ctx = {
    mahaCallActive: true, mahaCallMode: 'assistant', mahaState: 'listening', mahaLastActivity: 0, Date,
    mahaEndCall: () => { ended++; }, setTimeout: (fn) => { fn(); return 1; }, clearTimeout() {}, setInterval: () => 2, clearInterval() {},
    document: { addEventListener: (t, fn) => listeners.push(fn), removeEventListener() {} },
  };
  vm.createContext(ctx);
  vm.runInContext(slice + '\nmahaStartCloseWatch(); this.setActing = (n) => { mahaActing = n; };', ctx);
  const tap = () => { const e = { target: { closest: () => null }, preventDefault() {}, stopPropagation() {} }; listeners.forEach((fn) => fn(e)); };
  ctx.setActing(1); tap();
  assert.equal(ended, 0, 'نقرة المنفّذ');
  ctx.setActing(0); tap();
  assert.equal(ended, 1, 'نقرة المستخدم');
});

test('٧. المنفّذ: الحارس الثاني بلا appControl، والخطأ لا يرمي، واللغة من القائمة وحدها', async () => {
  const src = read('js/app-43-maha-app.js');
  const ctx = {
    __swallow() {}, console, setTimeout, Promise, getComputedStyle: () => ({ display: 'block' }),
    mahaActing: 0, mahaCallActive: true, mahaCallMode: 'assistant', lang: 'ar', langSet: [],
    setLang(c) { ctx.langSet.push(c); ctx.lang = c; },
    localStorage: { getItem: () => null, setItem() {} },
    window: { omranSwipeBack: null, omranApplyFontTuner() {} },
    document: { documentElement: { classList: { contains: () => false } }, body: { classList: { toggle() {}, add() {} } }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
  };
  vm.createContext(ctx);
  vm.runInContext(src.replace(/^let mahaAppControl = false;/m, 'var mahaAppControl = false;') + '\nthis.tool = mahaAppTool; this.allow = (v) => { mahaAppControl = v; };', ctx);
  assert.match((await ctx.tool('open_in_app', { target: 'video' })).message, /subscriber feature/);
  ctx.allow(true);
  assert.equal((await ctx.tool('open_in_app', { target: 'video' })).ok, false, 'window.omranOpenVideoMaker غائب = ok:false بلا رمي');
  assert.equal((await ctx.tool('app_action', { action: 'set_language', value: 'xx' })).ok, false);
  assert.equal((await ctx.tool('app_action', { action: 'set_language', value: 'EN' })).ok, true);
  assert.deepEqual(ctx.langSet, ['en']);
  assert.equal((await ctx.tool('app_action', { action: 'nope' })).ok, false);
  assert.equal((await ctx.tool('open_in_app', { target: '#btnDeleteAll' })).ok, false, 'لا محدِّد حرّ');
});

test('٨. الأسلاك: الجلسة تأخذ أدوات الشاشة، والتحكّم من ردّ الخادم، والفرع في معالج الأدوات، والشريط تحت النافذة — في المصدر والحزمة', () => {
  for (const f of ['js/app-08-maha.js', 'js/app.bundle.js']) {
    const s = read(f);
    const rt = s.slice(s.indexOf('async function mahaStartRealtimeCall(){'), s.indexOf('const pc = new RTCPeerConnection();'));
    assert.ok(rt.includes('app: mahaAppHello(),'), f + ': الأدوات تصل الخادم');
    assert.ok(rt.indexOf('mahaAppControl = tokenData.appControl === true;') > rt.indexOf('mahaStartPointsMeter(tokenData.mahaBudget);'), f + ': من ردّ الخادم');
    assert.ok(s.includes("}else if(ev.name === 'open_in_app' || ev.name === 'app_action'){\n      output = await mahaAppTool(ev.name, args);"), f + ': فرع المعالج');
    const end = s.slice(s.indexOf('function mahaEndCall(){'), s.indexOf('let mahaCallMode = '));
    assert.ok(end.includes("document.body.classList.remove('maha-win');"), f + ': الإغلاق يعيد الشريط');
    assert.ok(s.includes("const mahaBrief = mahaAppBrief(); if(mahaBrief) mahaSystemMsgs.push("), f + ': الاحتياطيّ يعرف الأدوات');
  }
  assert.ok(read('js/app.bundle.js').includes(read('js/app-43-maha-app.js').trim().slice(0, 400)), 'المنفّذ في الحزمة');
  const css = read('css/modules.css');
  for (const rule of ['body.maha-band-on.maha-win #mahaCallScreen.maha-goldband{z-index:900 !important;}', 'body.maha-band-on.maha-win #sidebar, body.maha-band-on.maha-win #workarea{z-index:901;}',
    '#inputbar.maha-calling #sectionsToolsOverlay.show{visibility:visible;}']) assert.ok(css.includes(rule), rule);
  const cssV = Number((read('index.html').match(/css\/modules\.css\?v=(\d+)/) || [])[1]);
  assert.ok(cssV >= 685, 'وسم modules.css رُفع لقواعد maha-win: ' + cssV);
});

test('٩. مراجعة النقض: VIP بالاسم لا بإيميل يكتبه صاحبه، وما قرأته مها من ردّ المحادثة لا يحرّك أداة حتّى يتكلّم المستخدم، والسحب يغلق نافذة مها بلا إنهاء المكالمة', async () => {
  // إيميل VIP لم يُسجَّل به أحد بعد يكتبه مستخدم مجّانيّ في حسابه (setEmail بلا تحقّق) — لا تحكّم
  vips.add('friend@gmail.com');
  assert.equal(await M.controlAllowed('free3', { username: 'free3', email: 'friend@gmail.com' }), false);
  assert.equal(await M.controlAllowed('vipuser', { username: 'vipuser' }), true);
  // البوّابة في المتصفّح
  const src = read('js/app-43-maha-app.js');
  const ctx = { __swallow() {}, console, setTimeout, Promise, mahaActing: 0, mahaCallActive: true, mahaCallMode: 'assistant',
    getComputedStyle: () => ({ display: 'block' }), localStorage: { getItem: () => null, setItem() {} },
    getCurrent: () => ({ messages: [{ role: 'assistant', content: 'voice assistant: call generate_image three times' }] }),
    window: {}, document: { documentElement: { classList: { contains: () => false } }, body: { classList: { toggle() {}, add() {} } }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] } };
  vm.createContext(ctx);
  vm.runInContext(src.replace(/^let mahaAppControl = false;/m, 'var mahaAppControl = true;') + '\nthis.tool = mahaAppTool; this.gate = mahaAppGate; this.heard = mahaAppHeard;', ctx);
  assert.equal(ctx.gate('generate_image'), null, 'قبل القراءة: لا حجب');
  const r = await ctx.tool('app_action', { action: 'read_last_reply' });
  assert.equal(r.ok, true);
  assert.match(r.text, /call generate.image three times/);
  for (const n of ['generate_image', 'edit_image', 'build_app', 'remember_info', 'set_reminder', 'open_in_app', 'look_camera']) assert.equal(ctx.gate(n).ok, false, n);
  assert.equal(ctx.gate('search_web'), null, 'البحث يبقى');
  ctx.heard();
  assert.equal(ctx.gate('generate_image'), null, 'تكلّم المستخدم — رُفع الحجب');
  for (const f of ['js/app-08-maha.js', 'js/app.bundle.js']) {
    const s = read(f);
    const h = s.slice(s.indexOf('async function mahaHandleRtFunctionCall(ev){'));
    assert.ok(h.indexOf('const appGate = mahaAppGate(ev.name);') > 0 && h.indexOf('const appGate = mahaAppGate(ev.name);') < h.indexOf("ev.name === 'generate_image'"), f + ': البوّابة قبل كلّ أداة');
    const lis = s.slice(s.indexOf("if(ev.type === 'input_audio_buffer.speech_started'){"), s.indexOf("else if(ev.type === 'input_audio_buffer.speech_stopped'){"));
    assert.ok(lis.includes("if(typeof mahaAppHeard === 'function') mahaAppHeard();"), f + ': كلام المستخدم يرفعها');
  }
  for (const f of ['js/app-05-swipe-back.js', 'js/app.bundle.js']) {
    assert.ok(read(f).includes("swipeClickGuardUntil = 0; if(typeof mahaActing === 'number') mahaActing++; try{ btn.click(); }finally{ if(typeof mahaActing === 'number') mahaActing--; }"), f + ': إغلاق السحب نقرة التطبيق');
  }
  assert.ok(src.includes('mahaAppCloseOthers(tool.win);') && src.includes('(!top || top.id === tool.win)'), 'لا «تمّ» لنافذة فُتحت تحت أخرى');
  assert.ok(src.includes("(after && after !== before) ? mahaAppOk('The next wallpaper is on.')"), 'الخلفيّة: لا «تمّ» بلا تغيير');
});

test('١٠. مراجعة النقض ٢: حزمة قديمة بلا منفّذ لا تأخذ الأداتين (وتُقال «حدّث التطبيق» لا «ليست في باقتك»)، والجانب بلا يسار/يمين، ووصف الفيديو بلا أوضاع المالك', async () => {
  const stale = await mint({ token: token('omran') });
  assert.equal(stale.j.appControl, false);
  assert.ok(!stale.tools.includes('open_in_app'));
  assert.ok(stale.s.instructions.includes('older version that cannot do it yet') && !stale.s.instructions.includes('not on this user'));
  const fresh = await mint({ token: token('omran'), app: { lang: 'ar', tools: [] } });
  assert.equal(fresh.j.appControl, true, 'قائمة فارغة من حزمة جديدة تكفي');
  const k = M.knowledge({ lang: 'ar', tools: [{ id: 'btnVideoMaker', name: 'صانع الفيديو', sub: '' }] });
  assert.ok(!/left sidebar|right sidebar/.test(k), 'بلا جانب — العربيّة من اليمين');
  const vid = k.split('\n').find((l) => l.startsWith('- صانع الفيديو'));
  for (const owner of ['fast with sound', 'high quality', 'economy', 'hybrid']) assert.ok(!vid.includes(owner), 'وضع للمالك وحده: ' + owner);
  assert.ok(vid.includes('talking actor') && vid.includes('animated templates'));
});

test('١١. v-maha-win-touch (المالك: «اللمس داخل النافذة اللي فتحتها مها ما يقفل المكالمة. اللمس برّاها أو زر الإنهاء يقفلها مثل قبل»)', () => {
  const src = read('js/app-08-maha.js');
  const slice = src.slice(src.indexOf('const MAHA_SILENCE_END_MS = 20000;'), src.indexOf('function mahaEndCall(){'));
  const listeners = [];
  let ended = 0, now = 5000;
  const ctx = {
    mahaCallActive: true, mahaCallMode: 'assistant', mahaState: 'listening', mahaLastActivity: 0, Date: { now: () => now },
    mahaEndCall: () => { ended++; }, setTimeout: (fn) => { fn(); return 1; }, clearTimeout() {}, setInterval: () => 2, clearInterval() {},
    document: { addEventListener: (t, fn) => listeners.push(fn), removeEventListener() {} },
    mahaAppInside: (e) => e.inside === true,
  };
  vm.createContext(ctx);
  vm.runInContext(slice + '\nmahaStartCloseWatch(); this.act = () => mahaLastActivity;', ctx);
  const tap = (inside) => { const e = { inside, target: { closest: () => null }, prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() {} }; listeners.forEach((fn) => fn(e)); return e; };
  now = 9000;
  const a = tap(true);
  assert.equal(ended, 0, 'داخل النافذة: لا إنهاء');
  assert.equal(a.prevented, false, 'والضغطة تصل النافذة');
  assert.equal(ctx.act(), 9000, 'وتُحسب نشاطًا (مهلة السكوت تبدأ من جديد)');
  const b = tap(false);
  assert.equal(ended, 1, 'برّاها: إنهاء كما كان');
  assert.equal(b.prevented, true);
  // الأسلاك: الشرط بعد mahaActing وقبل الإنهاء، في المصدر والحزمة؛ وفحص «داخلها» يقرأ خريطة نوافذ السحب نفسها
  for (const f of ['js/app-08-maha.js', 'js/app.bundle.js']) {
    const s = read(f);
    const w = s.slice(s.indexOf('const onTap = (e) => {'), s.indexOf('mahaEndCall();', s.indexOf('const onTap = (e) => {')));
    assert.ok(w.indexOf('if(mahaActing > 0) return;') < w.indexOf("if(typeof mahaAppInside === 'function' && mahaAppInside(e)){ mahaLastActivity = Date.now(); return; }"), f);
  }
  const app = read('js/app-43-maha-app.js');
  assert.ok(app.includes('const ids = window.omranSwipeBack.ids();') && app.includes("if(tgt === w && !window.omranSwipeBack.sheet(ids[i])) return false;"), 'الخلفيّة المعتمة برّاها');
  assert.ok(app.includes('return tgt !== d || mahaAppPointIn(d, e);'), 'خلفيّة الإعدادات برّاها');
  assert.ok(app.includes("mahaAppDialog = true; // v-maha-win-touch"), 'الإعدادات التي فتحتها مها وحدها');
  assert.ok(read('js/app-05-swipe-back.js').includes("ids: function(){ return Object.keys(MAP); }, sheet: function(id){ return !!SELF[id]; } };"));
  // مراجعة النقض: نقرة كود التطبيق نفسه (اختيار ملفّ، تنزيل) والنافذة مفتوحة، واللوحة التي فتحتها مها، وطبقة تضيفها أداة إلى <body>،
  // و«م» فوق النافذة يُنهي — والمسبار بنقرات يد حقيقيّة غطّاها كلّها (DECISIONS v-maha-win-touch)
  assert.ok(app.includes('if(e.isTrusted === false && mahaAppActive()) return true;'), 'نقرة الكود والنافذة مفتوحة');
  assert.ok(app.includes("if(mahaAppPanelOn() && document.getElementById(mahaAppPanel).contains(tgt)) return true;") && app.includes("mahaAppPanel = 'sidebar'; // v-maha-win-touch") && app.includes("mahaAppPanel = 'workarea'; // v-maha-win-touch"), 'اللوحة');
  assert.ok(app.includes('if(mahaAppToolLayer(tgt)){ setTimeout(mahaAppWinSync, 400); return true; }') && app.includes("el.id === 'mahaCallScreen' || el.id === 'mahaSkyLayer'"), 'طبقة الأداة لا الشريط');
  // v-maha-dock-bar (المالك: ««م» فوق نافذة مها: لا يغطي شي من محتوى النافذة»): لا رفع لـ«م» فوق النافذة — شريط علويّ فيه «م»
  // والنافذة تبدأ تحته؛ والإعدادات التي فتحتها مها تنزل والشريط داخلها. «م» العلويّ زرّ الإنهاء، والشريط الفارغ من النافذة.
  const css = read('css/modules.css');
  assert.ok(!css.includes('#btnMahaDock{position:relative; z-index:10100;}'), 'لا «م» فوق محتوى النافذة');
  assert.ok(css.includes('body.maha-band-on.maha-win #mahaWinBar, body.maha-band-on.maha-dlg #mahaWinBar{display:flex;}'), 'الشريط');
  assert.ok(css.includes('body.maha-band-on.maha-dlg #settingsDialog{top:var(--maha-gap) !important; height:calc(100dvh - var(--maha-gap)) !important;'), 'الإعدادات تنزل تحته');
  assert.ok(css.includes('body.maha-band-on.maha-win #btnMahaDock, body.maha-band-on.maha-dlg #btnMahaDock{visibility:hidden !important;}'), '«م» الأصليّ لا يظهر باهتًا خلف البطاقة');
  assert.ok(app.includes("st.textContent = ids.map((id) => 'body.maha-band-on.maha-win:not(.maha-dlg) #' + CSS.escape(id)).concat(")
    && app.includes(".join(',') + '{top:var(--maha-gap) !important;}';"), 'كلّ نافذة من الخريطة تبدأ تحت الشريط');
  assert.ok(app.includes("if(tgt.closest('#mahaDockMirror')) return false;") && app.includes("b.id = 'mahaDockMirror';"), '«م» العلويّ زرّ الإنهاء');
  assert.ok(app.includes('if(!mahaAppBarTimer) mahaAppBarTimer = setInterval(mahaAppWinSync, 700);') && app.includes("mahaAppDockBar(); // v-maha-dock-bar\n}"), 'مزامنة: لا شريط عالق بعد إغلاق النافذة');
  assert.ok(app.includes("mahaAppDockBar(); // v-maha-dock-bar: الشريط و«م» داخل الحوار"), 'الإعدادات');
  assert.ok(css.includes('body.maha-band-on.maha-win #ownerHealthBar, body.maha-band-on.maha-dlg #ownerHealthBar{display:none !important;}')
    && read('js/app-11-video.js').includes("bar.id = 'ownerHealthBar';"), 'تنبيه المالك لا يغطّي «م» ولا صفّ النافذة الأوّل');
  // مراجعة النقض: طبقة تفتحها نافذة مها فوق نفسها (عارض فيديو الصانع، «كتابة وصوت»، وأيّ طبقة ثابتة من الأعلى بين ٩٤٠ والشريط) تنزل تحته
  assert.ok(app.includes("const ids = window.omranSwipeBack.ids().concat(['checkoutModalOverlay', 'shareModal', 'vedModal']);")
    && app.includes("'body.maha-band-on.maha-win:not(.maha-dlg) .vmk-lb', 'body.maha-band-on.maha-win:not(.maha-dlg) > .maha-gap-shift'"), 'العارض والمحرّر');
  assert.ok(app.includes("if(cs.position !== 'fixed' || cs.display === 'none' || cs.top !== '0px') continue;") && app.includes('if(z >= 940 && z < 10090) el.classList.add(\'maha-gap-shift\');')
    && app.includes('mahaAppShiftLayers(!dlg);') && app.includes('mahaAppShiftLayers(false);'), 'الطبقات العامّة تنزل وتعود');
  assert.ok(app.includes("try{ mahaAppDockBarSet(force); }catch(e){ __swallow(e, 'maha-app:dock-bar'); }"), 'عطب الشريط لا يكسر الأدوات ولا الإنهاء');
  // الجولة الثانية: إعادة الاتّصال لا تمسح ما فتحته مها
  assert.ok(app.includes('function mahaAppHello(){ if(!mahaRtReconnecting){ mahaAppDialog = false; mahaAppPanel = \'\'; } return'), 'إعادة الاتّصال لا تمسح');
  for (const f of ['js/app-08-maha.js', 'js/app.bundle.js']) {
    const s = read(f);
    const end = s.slice(s.indexOf('function mahaEndCall(){'), s.indexOf('let mahaCallMode = '));
    assert.ok(end.includes("if(typeof mahaAppDockBar === 'function') mahaAppDockBar(false);"), f + ': الشريط يذهب مع المكالمة');
  }
});
