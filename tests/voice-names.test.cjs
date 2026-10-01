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
  assert.ok(read('js/app-04-i18n-state.js').includes("'i18n/' + lg + '.js?v=708'"), 'وسم الكاش ارتفع');
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
    document: { querySelectorAll: () => btns },
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
