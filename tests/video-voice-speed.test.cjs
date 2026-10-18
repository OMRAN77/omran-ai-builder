'use strict';
/* v-video-voice-speed (المالك ١٨ أكتوبر): «التعليق الصوتي في صانع الفيديو بطيء — «جرّب التطبيق وشوفوه» أخذت 2.7 ثانية مع وقفات بين الكلمات والطبقة طبيعية.
   السبب إنّ صانع الفيديو ما يرسل speed لـ/api/tts فيطلع دائمًا normal». ١) speed:'fast' افتراضيًا + اختيار (عادي/سريع/سريع جدًا) جنب «إضافة تعليق صوتي»
   ٢) تنظيف «...» والفواصل الزائدة من نصّ التعليق قبل الإرسال. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const V = read('js/app-11-video.js');

test('١. المنطلق: /api/tts يحوّل speed إلى معامل native (fast = +10% / 1.1، xfast = +20% / 1.2) وغيابه يعني normal', () => {
  const t = read('api/_lib/tts.js');
  assert.ok(/normal: \{ azureRate: '0%', openaiSpeed: 1 \}/.test(t) && /fast: \{ azureRate: '\+10%', openaiSpeed: 1\.1 \}/.test(t) && /xfast: \{ azureRate: '\+20%', openaiSpeed: 1\.2 \}/.test(t));
  assert.ok(/TTS_SPEED_MAP\[speed\] \|\| TTS_SPEED_MAP\.normal/.test(t));
});

test('٢. النموذج: «سرعة الصوت» داخل سطر «إضافة تعليق صوتي» — عادي / سريع (المحدَّد) / سريع جدًا بمفاتيح الترجمة الموجودة', () => {
  const core = read('js/partials-core.js');
  const label = core.slice(core.indexOf('id="videoMakerNarrationToggle"') - 200, core.indexOf('<!-- اختيار الصوت: ذكر/أنثى -->'));
  assert.ok(/<label[^>]*>[\s\S]*videoMakerNarrationToggleLabel[\s\S]*<select id="videoMakerNarrationSpeed"[\s\S]*<\/select>\s*<\/label>/.test(label), 'الاختيار داخل سطر التعليق نفسه');
  assert.ok(/<option value="normal" data-i18n="voiceSpeedNormal">/.test(label) && /<option value="fast" data-i18n="voiceSpeedFast" selected>/.test(label) && /<option value="xfast" data-i18n="voiceSpeedXFast">/.test(label));
  /* المفاتيح الأربعة موجودة بالـ١٤ لغة (app-03: عربيّ وإنجليزيّ + ١٢ حزمة) */
  const files = ['js/app-03-i18n-data.js'].concat(fs.readdirSync(path.join(ROOT, 'i18n')).filter((f) => f !== 'ad-studio.js').map((f) => 'i18n/' + f));
  for (const f of files) { const src = read(f); for (const k of ['voiceSpeedLabel', 'voiceSpeedNormal', 'voiceSpeedFast', 'voiceSpeedXFast']) assert.ok(new RegExp('"?' + k + '"?\\s*:').test(src), f + ' ' + k); }
});

test('٣. كلّ نداء /api/tts في صانع الفيديو يرسل speed ونصًّا منظَّفًا — الافتراضيّ «fast»، والتفضيل يُحفظ', () => {
  const calls = [...V.matchAll(/fetch\('\/api\/tts', \{[\s\S]*?body: JSON\.stringify\(\{([^\n]*)\}\),/g)];
  assert.strictEqual(calls.length, 5, 'خمسة مواضع في app-11-video.js');
  for (const c of calls) assert.ok(c[1].includes('cleanNarrationText(') && c[1].includes('speed: getNarrationSpeed()') && c[1].includes("voice: 'maha'"), c[1].slice(0, 80));
  assert.ok(/return NARRATION_SPEEDS\.indexOf\(v\) >= 0 \? v : 'fast';/.test(V), 'الافتراضيّ fast');
  assert.ok(V.includes("const NARRATION_SPEEDS = ['normal', 'fast', 'xfast'];") && V.includes("localStorage.setItem(NARRATION_SPEED_KEY"));
  assert.ok(V.includes('window.__vmkVoice = { speed: getNarrationSpeed, clean: cleanNarrationText };'));
});

test('٤. المخرج (video.js) والمحرّر (video-edit.js): speed ونصّ منظَّف أيضًا، والمحرّر فيه اختيار سرعة بالتفضيل المشترك', () => {
  const vj = read('js/video.js');
  assert.ok(/'\/api\/media\?action=tts'[\s\S]{0,200}text:vvClean\(s\.narration\),voice:'maha',lang:lang,gender:speaker,speed:vvSpeed\(\),token:tk/.test(vj));
  assert.ok(vj.includes("var br=await drJson('/api/ai?action=app-director-voice',{text:vvClean(s.narration)"));
  assert.ok(vj.includes("return (V&&V.speed&&V.speed())||'fast';"));
  const ve = read('js/video-edit.js');
  assert.ok(ve.includes('<select data-k="ttsSpeed"></select>') && /text: vvClean\(text\)\.slice\(0, 4000\), speed: K\('ttsSpeed'\)\.value \|\| 'fast'/.test(ve));
  assert.ok(ve.includes("localStorage.getItem('aiapp_video_voice_speed')") && ve.includes("window.t === 'function'"), 'تسميات الـ١٤ لغة من المترجم العامّ');
});

test('٥. تنظيف النصّ (سلوك فعليّ): «...» و«…» والفواصل المتتالية أو الزائدة تُزال، والباقي كما هو', () => {
  const m = V.match(/function cleanNarrationText\(t\)\{[\s\S]*?\n  \}/);
  assert.ok(m, 'الدالّة موجودة');
  const clean = new Function(m[0] + '; return cleanNarrationText;')();
  const cases = [
    ['جرّب التطبيق... وشوفوه', 'جرّب التطبيق وشوفوه'],
    ['جرّب التطبيق وشوفوه…', 'جرّب التطبيق وشوفوه'],
    ['جرّب التطبيق، ... وشوفوه', 'جرّب التطبيق، وشوفوه'],
    ['أهلا،، كيف حالك؟', 'أهلا، كيف حالك؟'],
    ['one, , two,,, three', 'one, two, three'],
    ['مرحبا ، كيف الحال', 'مرحبا، كيف الحال'],
    ['انتهى،.', 'انتهى.'],
    ['،، ابدأ هنا', 'ابدأ هنا'],
    ['3...2...1', '3 2 1'],
    ['سعره 1,000 ريال.', 'سعره 1,000 ريال.'],
    ['سطر أول\nسطر ثان', 'سطر أول\nسطر ثان'],
    ['كلام   كثير   مسافات', 'كلام كثير مسافات'],
    ['', ''], [null, ''], [undefined, ''],
  ];
  for (const [a, b] of cases) assert.strictEqual(clean(a), b, JSON.stringify(a));
});

test('٦. وسوم الكاش ارتفعت لما تغيّر (تُقرأ من index.html لا تُثبَّت)', () => {
  const h = read('index.html');
  const n = (re) => Number((h.match(re) || [])[1]);
  assert.ok(n(/partials-core\.js\?v=(\d+)/) >= 666 && n(/\/js\/video\.js\?v=(\d+)/) >= 451 && n(/video-edit\.js\?v=(\d+)/) >= 5);
});
