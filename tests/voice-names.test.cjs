'use strict';
/* v-voice-names (المالك ١ أكتوبر: «ضيف عبدالله… ويكون في الإعدادات صوت تجريبيّ: مها وعبدالله»): زرّا نوع الصوت
   باسمَي الشخصيّتين في اللغات الـ١٤، والضغط يختار ويُسمع تعريفًا بالاسم فورًا، وزرّ التجربة يُسمع المختار. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const LANGS = ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'];

test('١. الاسمان وجملة التعريف في اللغات الـ١٤، و{name} في كلّ جملة', () => {
  const core = read('js/app-03-i18n-data.js');
  for (const [m, f] of [["voiceGenderMale: 'عبدالله'", "voiceGenderFemale: 'مها'"], ["voiceGenderMale: 'Abdullah'", "voiceGenderFemale: 'Maha'"]]) {
    assert.ok(core.includes(m) && core.includes(f), m);
  }
  assert.equal((core.match(/voiceSampleIntro: '.*\{name\}.*', \/\/ v-voice-names/g) || []).length, 2);
  for (const lg of LANGS) {
    const s = read('i18n/' + lg + '.js');
    assert.match(s, /"?voiceSampleIntro"?: "[^"]*\{name\}[^"]*"/, lg);
    assert.doesNotMatch(s, /"?voiceGenderMale"?: "(?:Male voice|Voz masculina|Мужской голос)"/, lg);
  }
  assert.ok(read('js/app-04-i18n-state.js').includes("'i18n/' + lg + '.js?v=725'"), 'وسم الكاش ارتفع');
});

test('٢. الضغط يختار ويُسمع تعريف الشخصيّة؛ والتجربة تُسمع المختار', () => {
  const src = read('js/app-07-voice.js');
  const a = src.indexOf('function setVoiceGenderUI(val){');
  const b = src.indexOf('// v-maha-voice-speed: نفس نمط', a);
  const c = src.indexOf("const btnTestVoice = $('#btnTestVoice');");
  const d = src.indexOf('// ---- Mic: record audio', c);
  const store = {};
  const said = [];
  const btns = [{ dataset: { gender: 'male' }, classList: { toggle() {} } }, { dataset: { gender: 'female' }, classList: { toggle() {} } }];
  const testBtn = {};
  const dict = { voiceGenderMale: 'عبدالله', voiceGenderFemale: 'مها', voiceSampleIntro: 'هلا والله، أنا {name}. كيف أقدر أساعدك اليوم؟' };
  const ctx = {
    document: { querySelectorAll: (q) => (q === '.voiceGenderBtn' ? btns : []) }, window: {},
    localStorage: { setItem: (k, v) => { store[k] = v; }, getItem: (k) => store[k] || null },
    t: (k) => dict[k] || k, speakSmart: (x) => said.push(x), __swallow() {}, $: () => testBtn,
  };
  vm.createContext(ctx);
  vm.runInContext(src.slice(a, b) + src.slice(c, d), ctx);
  btns[0].onclick();
  assert.equal(store.aiapp_voice_gender, 'male');
  assert.equal(said.at(-1), 'هلا والله، أنا عبدالله. كيف أقدر أساعدك اليوم؟');
  btns[1].onclick();
  assert.equal(said.at(-1), 'هلا والله، أنا مها. كيف أقدر أساعدك اليوم؟');
  store.aiapp_voice_gender = 'male';
  testBtn.onclick();
  assert.equal(said.at(-1), 'هلا والله، أنا عبدالله. كيف أقدر أساعدك اليوم؟');
  assert.ok(read('js/app.bundle.js').includes('function voicePersonaSample(gender){'), 'الحزمة');
});

test('٣. اختيار عبدالله يبقى: الإقلاع وبداية المكالمة لا يعيدانه إلى مها، والاسم والأيقونة تتبعه', async () => {
  const src = read('js/app-08-maha.js');
  const a = src.indexOf("const MAHA_ICON = '/icons/maha-m3.svg';");
  const b = src.indexOf('// All pitch samples collected', a);
  const store = { aiapp_voice_gender: 'male' };
  const els = { mahaCallNameLabel: { textContent: '' }, mahaOrb: { textContent: 'x', style: {} } };
  const fab = { title: '', img: { src: '', alt: '', getAttribute() { return this.src; } } };
  const glyph = { textContent: 'م', style: {} };
  let gimg = null;
  els.btnMahaDock = { title: '', querySelector: () => gimg, appendChild: (x) => { gimg = x; } };
  const ctx = {
    localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } },
    document: { getElementById: (id) => els[id] || null, createElement: () => ({ style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; } }), querySelector: (q) => (q === '#btnMahaDock .mahaGlyph' ? glyph : null) },
    btnMahaEl: { get title() { return fab.title; }, set title(v) { fab.title = v; }, querySelector: () => fab.img },
    __swallow() {}, Promise,
  };
  vm.createContext(ctx);
  vm.runInContext('let mahaDetectedGender = "female";\n' + src.slice(src.indexOf('function mahaReadVoiceGender(){'), src.indexOf('let mahaDetectedGender')) + src.slice(a, b) + '\nthis.ui = mahaUpdatePersonaUI; this.ensure = mahaEnsureVoiceChosen; this.g = () => mahaDetectedGender;', ctx);
  ctx.ui();
  assert.equal(store.aiapp_voice_gender, 'male', 'الإقلاع لا يعيده إلى مها');
  assert.equal(ctx.g(), 'male');
  assert.equal(els.mahaCallNameLabel.textContent, 'عبدالله');
  assert.equal(fab.img.src, '/icons/abdullah-icon.svg');
  assert.equal(glyph.style.display, 'none', 'v-persona-medallions: الحرف النصّيّ مخفيّ');
  assert.equal(gimg.getAttribute('src'), '/icons/abdullah-medallion.png', 'ميداليّة «ع» من لقطة المالك');
  assert.equal(gimg.style.display, 'block');
  assert.equal(els.btnMahaDock.title, 'عبدالله');
  assert.equal(await ctx.ensure(), 'male', 'بداية المكالمة لا تعيده');
  assert.equal(store.aiapp_voice_gender, 'male');
  store.aiapp_voice_gender = 'female';
  ctx.ui();
  assert.equal(els.mahaCallNameLabel.textContent, 'مها');
  assert.equal(glyph.textContent, 'م');
  assert.equal(gimg.getAttribute('src'), '/icons/maha-medallion.png', 'مها: ميداليّة «م» من لقطة المالك');
  assert.equal(gimg.style.display, 'block');
  for (const f of ['icons/maha-medallion.png', 'icons/abdullah-medallion.png']) assert.ok(fs.statSync(path.join(root, f)).size < 40000, f + ' خفيفة');
  delete store.aiapp_voice_gender;
  assert.equal(await ctx.ensure(), 'female', 'أوّل تشغيل = مها');
});

test('٤. v-voice-names-show + v-maha-subs: قفل v-maha-pause وتحييد الأسماء أُزيلا — الاسمان للجميع', () => {
  const src = read('js/app-08-maha.js');
  assert.ok(!src.includes('/* v-maha-pause (طلب عمران ٣١ أغسطس'), 'بلوك القفل أُزيل');
  assert.ok(!/__scrubNames|window\.__mahaPaused = /.test(src), 'لا تحييد ولا قفل');
});

test('٥. v-voice-calligraphy: اسم الشخصيّة صورة خطّ — عربيّة للعربيّة وإنجليزيّة لغيرها، ومخفيّة لمن مها موقوفة عنده', () => {
  const src = read('js/app-07-voice.js');
  const fn = src.slice(src.indexOf('function setVoiceGenderUI(val){'), src.indexOf('/* v-voice-names (المالك ١ أكتوبر'));
  const mk = (persona) => ({ dataset: { persona }, attrs: {}, cls: new Set(), setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, classList: { add(c) { this.o.cls.add(c); }, remove(c) { this.o.cls.delete(c); }, toggle(c, on) { on ? this.o.cls.add(c) : this.o.cls.delete(c); } } });
  const run = (lg, paused) => {
    const imgs = [mk('maha'), mk('abdullah')];
    imgs.forEach((i) => { i.classList.o = i; });
    const ctx = { lang: lg, window: { __mahaPaused: paused }, document: { querySelectorAll: (q) => (q === '.voiceGenderBtn' ? [] : imgs) } };
    vm.createContext(ctx);
    vm.runInContext(fn + '\nsetVoiceGenderUI("female");', ctx);
    return imgs;
  };
  let r = run('ar', false);
  assert.equal(r[0].getAttribute('src'), '/icons/name-maha-ar.png');
  assert.equal(r[1].getAttribute('src'), '/icons/name-abdullah-ar.png');
  assert.ok(r[0].cls.has('on'));
  for (const lg of ['en', 'fr', 'ur', 'zh']) assert.equal(run(lg, false)[1].getAttribute('src'), '/icons/name-abdullah-en.png', lg);
  assert.ok(!run('ar', true)[0].cls.has('on'), 'موقوفة = بلا صورة الاسم');
  for (const f of ['maha-ar', 'maha-en', 'abdullah-ar', 'abdullah-en']) assert.ok(fs.statSync(path.join(root, 'icons/name-' + f + '.png')).size < 40000, f);
  const part = read('js/partials-settings.js');
  assert.ok(part.includes('<img class="vgName" data-persona="abdullah"') && part.includes('<img class="vgName" data-persona="maha"'));
  assert.match(part, /#voiceSection \.voiceGenderBtn, #voiceSection \.voiceSpeedBtn, #voiceSection #btnTestVoice\{border:2px solid rgba\(201,162,39/, 'البراويز ذهبيّة');
});
