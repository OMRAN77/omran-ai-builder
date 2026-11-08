// tests/anime-tour.test.cjs — v-anime-tour: فيديو جولة «أنمي» في التطبيق كلّه (scripts/video-anime-tour.mjs)
// (المالك ٨ نوفمبر: «فيديو توضيحي في التطبيق كامل… مكان مكان… دقيقتين او ٣… نفس الانمي»)
// السكربت يشغّل متصفّحًا وffmpeg، فيُقرأ هنا نصًّا: الجدول والتغطية والقيود الثابتة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const src = read('scripts/video-anime-tour.mjs');
const scenes = src.slice(src.indexOf('const SCENES = ['), src.indexOf('];', src.indexOf('const SCENES = [')));
const lines = [...scenes.matchAll(/(?:line|title|sub|shout): '([^']*)'/g)].map((m) => m[1])
  .concat([...scenes.matchAll(/lines: \[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1])));

test('المدّة بين دقيقتين وثلاث، وكلّ قطع على رأس مازورة (١٤٠ نبضة)', () => {
  assert.ok(src.includes('const BPM = 140, BAR = 240 / BPM;'));
  const bars = [...scenes.matchAll(/bars: (\d+)/g)].reduce((a, m) => a + Number(m[1]), 0);
  const secs = bars * 240 / 140;
  assert.ok(secs >= 120 && secs <= 180, 'المدّة ' + secs.toFixed(1) + 'ث');
});

test('يدخل كلّ أدوات شاشة الأدوات (الأقسام الثلاثة) ويصوّرها ويشرحها', () => {
  const feat = read('js/app-10-features.js');
  const groups = [...feat.matchAll(/\{ title: 'grp(?:Create|Business|Life)', ids: \[([^\]]*)\] \}/g)];
  assert.equal(groups.length, 3);
  const paused = (read('js/app-10-features.js') + read('js/app-05-ui.js') + read('js/app-04-i18n-state.js')).match(/OMRAN_PAUSED_TOOLS\s*=\s*\[([^\]]*)\]/);
  const pausedIds = paused ? [...paused[1].matchAll(/'(\w+)'/g)].map((m) => m[1]) : [];
  // المخفيّ للجميع بقاعدة CSS في index.html (مثل btnGov) لا يظهر في الشاشة
  const hidden = [...read('index.html').matchAll(/([#\w\-, ]+)\{\s*display:\s*none\s*!important;?\s*\}/g)].flatMap((m) => [...m[1].matchAll(/#(btn\w+)/g)].map((x) => x[1]));
  const all = groups.flatMap((g) => [...g[1].matchAll(/'(\w+)'/g)].map((m) => m[1]));
  const ids = all.filter((id) => !pausedIds.includes(id) && !hidden.includes(id) && new RegExp('id="' + id + '"').test(read('index.html') + read('js/partials-core.js') + read('js/partials-settings.js')));
  assert.ok(pausedIds.includes('btnOmranTV') && hidden.includes('btnGov'), 'paused=' + pausedIds + ' hidden=' + hidden);
  assert.equal(ids.length, 14, 'أدوات: ' + ids.join(','));
  // ما لا يراه المستخدم لا يُعرض عليه في الفيديو، والعدد في الجملة يطابق الشاشة
  all.filter((id) => !ids.includes(id)).forEach((id) => assert.ok(!scenes.includes("shot: '" + id + "'"), 'أداة غير ظاهرة في الفيديو: ' + id));
  assert.ok(scenes.includes("'" + ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '١٤'][ids.length] + ' أداة في ٣ أقسام'), 'عدد الأدوات في الجملة');
  for (const id of ids) {
    assert.ok(src.includes("'" + id + "'"), 'لا لقطة لـ' + id);
    assert.ok(scenes.includes("shot: '" + id + "'"), 'لا مشهد لـ' + id);
  }
  ['home', 'built', 'code', 'maha', 'tools', 'themes'].forEach((p) => assert.ok(scenes.includes("shot: '" + p + "'"), p));
});

test('لا اسم مزوّد أو نموذج في أيّ نصّ يظهر، ولا إيموجي (الخطّ لا يرسمها)', () => {
  assert.ok(lines.length >= 30, 'نصوص: ' + lines.length);
  const banned = /claude|كلود|كلاود|gemini|جيمناي|جيميني|grok|غروك|جروك|gpt|openai|أوبن|runway|veo|minimax|kling|deepseek|mistral|llama/i;
  for (const l of lines) {
    assert.ok(!banned.test(l), 'اسم مزوّد: ' + l);
    assert.ok(!/\p{Extended_Pictographic}/u.test(l), 'إيموجي: ' + l);
  }
  // اللقطات بحساب مستخدم عاديّ: شريط اختيار النموذج يظهر للمالك وحده
  assert.ok(src.includes("localStorage.setItem('aiapp_username', 'ahmed')"));
  assert.ok(!src.includes("'aiapp_username', 'omran'"));
});

test('بلا إنفاق ولا شبكة: لا مفتاح ولا نداء مزوّد، والردود المحلّيّة توضيحيّة، والصوت مولَّد بالكود', () => {
  assert.ok(!/sk-ant-|sk-or-|github_pat_|ghp_|API_KEY|process\.env\.[A-Z_]*KEY/.test(src));
  assert.ok(!/fetch\(['"`]https?:/.test(src));
  assert.ok(src.includes("if (p.startsWith('/api/')) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}'); return; }"));
  assert.ok(src.includes("ctx.route('**/api/tools?action=stocks'") && src.includes("ctx.route('https://api.aladhan.com/**'"));
  assert.ok(src.includes("fs.writeFileSync(path.join(WORK, 'audio.wav'), buf)"));
  assert.ok(!/\.(mp3|ogg|m4a)['"]/.test(src.replace(/\.mp4/g, '')));
});

test('النصّ فوق الصور بـHTML لا داخلها، ومها SVG مرسومة باليد، والمخرج في video/ الذي لا يُنشر', () => {
  assert.ok(src.includes('window.mahaSVG = function (id)') && src.includes('<svg id="${id}" viewBox="0 0 400 600"'));
  assert.ok(src.includes("fonts.googleapis.com/css2?family=Lalezar"));
  assert.ok(src.includes("opt('out', 'video/final/anime-tour-ar.mp4')"));
  assert.ok(/^video\/$/m.test(read('.vercelignore')));
  assert.ok(!/filter:\s*blur/.test(src));
});
