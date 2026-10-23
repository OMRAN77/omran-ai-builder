// tests/maha-image-pending.test.cjs — v-maha-img-wait + v-maha-title-lang (تدقيق ١٨–١٩ أكتوبر، مها):
// ١) صورة مها تأخذ ~٢١ث، وحالة «أفكّر» تعود «أستمع» بعد ~٧ث فلا يرى المستخدم شيئًا. الآن خانة انتظار ذهبيّة
//    (.maha-img-pending بنصّ stGenImage القائم) مكان الصورة، مستقلّة عن mahaSetState، تزول بوصول الصورة أو فشلها
//    أو بإنهاء المكالمة، ويُحسب انتظارها نشاطًا فلا تُغلق مهلة السكوت (٢٠ث) المكالمة وهي ترسم.
// ٢) إغلاق المكالمة قبل وصول الصورة: كانت تُكتب في عنصر المكالمة المخفيّ فتضيع (والنقاط خُصمت لصورة رُسمت فعلًا).
//    الآن تصل رسالةً في المحادثة الحاليّة (أو مشروع جديد) عبر saveState (الخزنة). لا تغيير في الخصم.
// ٣) بعد الإغلاق كان mahaRtDc.send يرمي فيُطبع «failed to send function result». الآن يُفحص قبل الإرسال بصمت.
// ٤) تلميح زرّ «م» والزرّ العائم وبديل صورته كانت «مها» عربيّة ثابتة في كلّ لغة — الآن t('mahaTitle')
//    (أو t('voiceGenderMale') لعبدالله)، وتتبع تبديل اللغة. «مها» نفسها باقية اسمًا.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const cut = (s, a, b) => { const i = s.indexOf(a); const j = s.indexOf(b, i + a.length); assert.ok(i >= 0 && j > i, 'كتلة: ' + a); return s.slice(i, j); };
const tick = async (n) => { for (let i = 0; i < (n || 10); i++) await new Promise((r) => setImmediate(r)); };

/* ── عالم وهميّ لكتل الصورة والمكالمة الحقيقيّة ── */
function world(file, opts) {
  const o = opts || {};
  const src = read(file);
  const imgBlock = cut(src, 'let mahaLastImageBase64 = null;', '/* ---------- مها Realtime Voice');
  const setState = cut(src, 'function mahaSetState(state, customLabel){', 'function mahaStopVad(){');
  const watch = cut(src, 'const MAHA_SILENCE_END_MS = 20000;', 'function mahaEndCall(){');
  const endCall = cut(src, 'function mahaEndCall(){', 'let mahaCallMode = ');
  const kids = [];
  const box = {
    insertBefore(n, ref) { const i = ref ? kids.indexOf(ref) : -1; if (i >= 0) kids.splice(i, 0, n); else kids.push(n); n.parentNode = box; },
    appendChild(n) { kids.push(n); n.parentNode = box; },
    removeChild(n) { const i = kids.indexOf(n); if (i >= 0) kids.splice(i, 1); n.parentNode = null; },
  };
  const mk = (tag) => ({ tagName: tag, id: '', className: '', style: {}, textContent: '', attrs: {}, parentNode: null,
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
    get nextSibling() { const i = kids.indexOf(this); return i >= 0 ? (kids[i + 1] || null) : null; } });
  const img = mk('img'); img.id = 'mahaGenImage'; img.src = ''; img.style.display = 'none';
  const ring = mk('div'); ring.id = 'mahaGoldWave';
  box.appendChild(img); box.appendChild(ring);
  const errors = [];
  const calls = { renderAll: 0, saveState: 0, ended: 0 };
  let now = 1000;
  const intervals = [];
  let release = null, fail = null;
  const state = { projects: o.noProject ? [] : [{ id: 'p1', title: 'محادثة', messages: [{ role: 'user', content: 'مرحبا' }] }], currentId: o.noProject ? null : 'p1' };
  const ctx = {
    mahaCallActive: true, mahaCallMode: 'assistant', mahaState: 'idle', mahaLastActivity: 0, mahaLowMicStreak: 0,
    mahaOrbEl: null, mahaWaveEl: null, mahaStateLabelEl: null, mahaGoldWaveEl: null, mahaCallScreenEl: { style: {}, classList: { remove() {} } },
    mahaMediaRecorder: null, mahaCurrentAudio: null,
    t: (k) => '[' + k + ']', authGet: () => 'tok', __swallow() {},
    window: { getGuestId: () => 'g' },
    document: {
      getElementById: (id) => kids.find((k) => k.id === id) || null,
      createElement: (tag) => mk(tag),
      body: { classList: { add() {}, remove() {} } },
      addEventListener() {}, removeEventListener() {},
    },
    state, getCurrent: () => state.projects.find((p) => p.id === state.currentId),
    renderAll: () => { calls.renderAll++; }, saveState: () => { calls.saveState++; }, switchWorkTab() {},
    mahaAvatarDisplay() {}, mahaShowComposer() {}, mahaStopPointsMeter() {}, mahaCameraOff() {}, mahaEndRealtimeCall() {},
    mahaStopVad() {}, mahaStopStream() {}, mahaStopInterruptListener() {}, stopAllSpeaking() {},
    Date: { now: () => now },
    setTimeout: () => 0, clearTimeout() {}, setInterval: (f) => { intervals.push(f); return intervals.length; }, clearInterval: () => { intervals.length = 0; },
    console: { error: (...a) => errors.push(a.join(' ')), warn() {} },
    fetch: (url) => new Promise((res, rej) => {
      release = (status, body) => res({ ok: status >= 200 && status < 300, status, json: async () => body });
      fail = () => rej(new Error('net'));
    }),
  };
  vm.createContext(ctx);
  vm.runInContext(setState + imgBlock + watch + endCall + '\nthis.endCall = mahaEndCall; this.gen = mahaGenerateOrEditImage; this.setState = mahaSetState; this.startWatch = mahaStartCloseWatch;', ctx);
  return {
    ctx, img, kids, state, calls, errors,
    ph: () => kids.find((k) => /\bmaha-img-pending\b/.test(k.className)) || null,
    release: (s, b) => release(s, b), fail: () => fail(),
    advance: (ms) => { const end = now + ms; while (now < end) { now += 1000; intervals.slice().forEach((f) => f()); } },
    v: (expr) => vm.runInContext(expr, ctx),
  };
}

for (const file of ['js/app-08-maha.js', 'js/app.bundle.js']) {
  test(file + ': ١. خانة «يرسم صورة…» مكان الصورة أثناء الطلب، لا تمسحها «أستمع»، وتزول بوصول الصورة', async () => {
    const w = world(file);
    const p = w.ctx.gen('a falcon', false, '', '', '', false, 'auto', false);
    await tick();
    const ph = w.ph();
    assert.ok(ph, 'خانة الانتظار ظاهرة');
    assert.equal(ph.textContent, '[stGenImage]');
    assert.equal(w.kids.indexOf(ph), w.kids.indexOf(w.img) + 1, 'في خانة الصورة نفسها');
    w.ctx.setState('listening');
    assert.ok(w.ph(), 'mahaSetState لا يمسحها');
    w.release(200, { imageBase64: 'IMG', mimeType: 'image/png' });
    assert.equal(JSON.stringify(await p), '{"ok":true}');
    assert.equal(w.ph(), null, 'تزول بوصول الصورة');
    assert.equal(w.img.src, 'data:image/png;base64,IMG');
    assert.equal(w.img.style.display, 'block');
    assert.equal(w.state.projects[0].messages.length, 2, 'v-maha-img-hold (الدفعة ١): الصورة تُحفظ في المحادثة ولو المكالمة جارية — قبل تأكيد الخصم');
  });

  test(file + ': ٢. فشل الطلب (٥٠٠ أو انقطاع) يزيل الخانة', async () => {
    let w = world(file);
    let p = w.ctx.gen('x', false, '', '', '', false, 'auto', false);
    await tick(); assert.ok(w.ph());
    w.release(500, { error: 'failed' });
    assert.equal((await p).ok, false);
    assert.equal(w.ph(), null);
    w = world(file);
    p = w.ctx.gen('x', false, '', '', '', false, 'auto', false);
    await tick(); assert.ok(w.ph());
    w.fail();
    assert.equal((await p).ok, false);
    assert.equal(w.ph(), null);
  });

  test(file + ': ٣. إنهاء المكالمة قبل وصول الصورة: الصورة رسالة في المحادثة الحاليّة لا في العنصر المخفيّ', async () => {
    const w = world(file);
    const p = w.ctx.gen('a falcon', false, '', '', '', false, 'auto', false);
    await tick(); assert.ok(w.ph());
    w.ctx.endCall();
    assert.equal(w.ph(), null, 'الإنهاء يزيل الخانة');
    w.release(200, { imageBase64: 'IMG', mimeType: 'image/png' });
    assert.equal(JSON.stringify(await p), '{"ok":true}');
    const msgs = w.state.projects[0].messages;
    assert.equal(msgs.length, 2);
    const m = msgs[1];
    assert.equal(m.role, 'assistant');
    assert.equal(m.attachments.length, 1);
    assert.deepEqual({ isImage: m.attachments[0].isImage, dataUrl: m.attachments[0].dataUrl, name: m.attachments[0].name }, { isImage: true, dataUrl: 'data:image/png;base64,IMG', name: 'maha-image.png' });
    assert.ok(w.calls.renderAll >= 1 && w.calls.saveState >= 1, 'تُرسم وتُحفظ (الخزنة في saveState)');
    assert.equal(w.img.src, '', '#mahaGenImage لم يُمسّ');
    assert.notEqual(w.img.style.display, 'block');
    assert.equal(w.ph(), null);
  });

  test(file + ': ٤. بلا محادثة حاليّة: مشروع جديد يحمل الصورة', async () => {
    const w = world(file, { noProject: true });
    const p = w.ctx.gen('a falcon', false, '', '', '', false, 'auto', false);
    await tick();
    w.ctx.endCall();
    w.release(200, { imageBase64: 'IMG2', mimeType: 'image/jpeg' });
    await p;
    assert.equal(w.state.projects.length, 1);
    const pr = w.state.projects[0];
    assert.equal(w.state.currentId, pr.id);
    assert.equal(pr.title, '[defaultProjectTitle]');
    assert.equal(pr.messages[0].attachments[0].dataUrl, 'data:image/jpeg;base64,IMG2');
  });

  test(file + ': ٥. مهلة السكوت لا تُغلق المكالمة وهي ترسم، وتعود بعد وصول الصورة', async () => {
    const w = world(file);
    w.ctx.startWatch();
    const p = w.ctx.gen('a falcon', false, '', '', '', false, 'auto', false);
    await tick();
    w.ctx.setState('listening');
    w.advance(30000);
    assert.equal(w.v('mahaCallActive'), true, 'تنتظر الصورة ٣٠ث والمكالمة باقية');
    w.release(200, { imageBase64: 'IMG', mimeType: 'image/png' });
    await p;
    w.advance(15000);
    assert.equal(w.v('mahaCallActive'), true, 'المهلة تبدأ من وصول الصورة');
    w.advance(8000);
    assert.equal(w.v('mahaCallActive'), false, 'سكوت ٢٠ث بعدها يُغلق كما كان (v-maha-band)');
  });

  test(file + ': ٦. نتيجة الأداة بعد إغلاق القناة: لا رمي ولا console.error', async () => {
    const src = read(file);
    const fn = cut(src, 'async function mahaHandleRtFunctionCall(ev){', '// Like mahaMaybeSearch');
    const run = async (closeFirst) => {
      const sent = [];
      const errors = [];
      let release;
      const ctx = {
        mahaRtDc: { readyState: 'open', send: (x) => sent.push(x) },
        mahaSetState() {}, mahaAppGate: () => null, mahaLastImageBase64: null,
        mahaGenerateOrEditImage: () => new Promise((r) => { release = r; }),
        console: { error: (...a) => errors.push(a.join(' ')) },
      };
      vm.createContext(ctx);
      vm.runInContext(fn + '\nthis.h = mahaHandleRtFunctionCall;', ctx);
      const p = ctx.h({ name: 'generate_image', arguments: '{"prompt":"x"}', call_id: 'c1' });
      await tick();
      if (closeFirst) ctx.mahaRtDc = null;
      release({ ok: true });
      await p;
      return { sent, errors };
    };
    const closed = await run(true);
    assert.deepEqual(closed, { sent: [], errors: [] }, 'بصمت بعد الإغلاق');
    const open = await run(false);
    assert.equal(open.sent.length, 2, 'القناة المفتوحة ترسل النتيجة وresponse.create كما كان');
    assert.deepEqual(open.errors, []);
  });

  test(file + ': ٧. تلميح «م» والعائم وبديل الصورة بلغة التطبيق، وتتبع تبديلها؛ والاسم الظاهر كما هو', () => {
    const src = read(file);
    const a = src.indexOf("const MAHA_ICON = '/icons/maha-m3.svg';");
    const b = src.indexOf('// All pitch samples collected', a);
    assert.ok(a > 0 && b > a);
    const T = {
      ar: { mahaTitle: 'مها - مساعدة صوتية', voiceGenderMale: 'عبدالله' },
      en: { mahaTitle: 'Maha - Voice Assistant', voiceGenderMale: 'Abdullah' },
      fr: { mahaTitle: 'Maha - Assistante vocale', voiceGenderMale: 'Abdullah' },
    };
    let cur = 'en';
    const store = { aiapp_voice_gender: 'female' };
    const els = { mahaCallNameLabel: { textContent: '' }, mahaOrb: { textContent: 'x', style: {} } };
    const fab = { title: '', img: { src: '', alt: '', getAttribute() { return this.src; } } };
    let gimg = null;
    els.btnMahaDock = { title: '', querySelector: () => gimg, appendChild: (x) => { gimg = x; } };
    let observed = null, onMut = null;
    const ctx = {
      t: (k) => T[cur][k] || k,
      localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } },
      document: { documentElement: {}, getElementById: (id) => els[id] || null, createElement: () => ({ style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; } }), querySelector: () => null },
      btnMahaEl: { get title() { return fab.title; }, set title(v) { fab.title = v; }, querySelector: () => fab.img },
      MutationObserver: function (cb) { onMut = cb; this.observe = (target, o) => { observed = o; }; },
      __swallow() {}, Promise,
    };
    vm.createContext(ctx);
    vm.runInContext('let mahaDetectedGender = "female";\n' + src.slice(src.indexOf('function mahaReadVoiceGender(){'), src.indexOf('let mahaDetectedGender')) + src.slice(a, b) + '\nthis.ui = mahaUpdatePersonaUI;', ctx);
    const titles = () => [els.btnMahaDock.title, fab.title, fab.img.alt];
    ctx.ui();
    assert.deepEqual(titles(), Array(3).fill('Maha - Voice Assistant'));
    assert.equal(els.mahaCallNameLabel.textContent, 'مها', 'الاسم الظاهر في المكالمة لم يُلمس هنا');
    store.aiapp_voice_gender = 'male';
    ctx.ui();
    assert.deepEqual(titles(), Array(3).fill('Abdullah'));
    cur = 'ar';
    ctx.ui();
    assert.deepEqual(titles(), Array(3).fill('عبدالله'), 'العربيّة كما كانت لعبدالله');
    store.aiapp_voice_gender = 'female';
    ctx.ui();
    assert.deepEqual(titles(), Array(3).fill('مها - مساعدة صوتية'), 'العربيّة: نصّ mahaTitle نفسه الذي يضعه data-i18n-title');
    // تبديل اللغة: مراقب سمة lang يعيد التلميحات وحدها (لا يمسّ اسم المكالمة ووسم HD)
    assert.equal(typeof onMut, 'function', 'مراقب تبديل اللغة');
    assert.equal(JSON.stringify(observed), JSON.stringify({ attributes: true, attributeFilter: ['lang'] }));
    els.mahaCallNameLabel.textContent = 'مها · HD';
    cur = 'fr'; store.aiapp_voice_gender = 'male';
    onMut();
    assert.deepEqual(titles(), Array(3).fill('Abdullah'));
    store.aiapp_voice_gender = 'female';
    onMut();
    assert.deepEqual(titles(), Array(3).fill('Maha - Assistante vocale'));
    assert.equal(els.mahaCallNameLabel.textContent, 'مها · HD');
  });
}

test('٨. نمط الخانة في modules.css: ذهبيّة بلمعة وخلفيّة داكنة خاصّة بها (تُقرأ في كلّ ثيم)، وبلا حركة لمن طلب تقليلها', () => {
  const css = read('css/modules.css');
  const m = css.match(/#mahaAvatarBox \.maha-img-pending\{([^}]*)\}/);
  assert.ok(m, 'قاعدة الخانة');
  assert.match(m[1], /width:105px;height:105px;/, 'بمقاس صورة مها');
  assert.match(m[1], /animation:mahaImgShimmer /);
  assert.match(m[1], /#0a0908/, 'خلفيّة داكنة ثابتة تحت النصّ الذهبيّ');
  assert.match(css, /@keyframes mahaImgShimmer\{/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{ #mahaAvatarBox \.maha-img-pending\{animation:none;\} \}/);
  // stGenImage قائم بالـ١٤ لغة
  const core = read('js/app-03-i18n-data.js');
  assert.equal((core.match(/\bstGenImage:/g) || []).length, 2);
  for (const lg of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) assert.match(read('i18n/' + lg + '.js'), /"stGenImage":/, lg);
});
