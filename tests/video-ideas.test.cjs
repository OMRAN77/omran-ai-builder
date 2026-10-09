// tests/video-ideas.test.cjs — v-vmk-ideas: شريحة مثال لكلّ وضع فيديو تعبّئ الوصف بضغطة
// (المالك: «شو أسوّي بالأوضاع اللي ما عندي فيها أفكار» ← مثال واحد يتبدّل مع الوضع، بلا مساحة إضافيّة)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const MODES = ['Canvas', 'Runway', 'Minimax', 'Omni', 'Hybrid', 'Veo', 'Actor'];
const KEYS = ['videoIdeaLbl'].concat(MODES.map((m) => 'videoIdea' + m));
const LANGS = ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'];

test('كلّ وضع في القائمة له مفتاح مثال، وكلّه بالـ١٤ لغة', () => {
  const html = read('js/partials-core.js');
  const modes = [...html.matchAll(/<option value="(\w+)"[^>]*data-i18n="videoMode/g)].map((m) => m[1]);
  assert.equal(modes.length, MODES.length);
  modes.forEach((v) => assert.ok(MODES.includes(v[0].toUpperCase() + v.slice(1)), 'وضع بلا مثال: ' + v));
  const base = read('js/app-03-i18n-data.js');
  KEYS.forEach((k) => assert.equal((base.match(new RegExp(k + ': "', 'g')) || []).length, 2, k + ' (ar+en)'));
  LANGS.forEach((lg) => {
    const s = read('i18n/' + lg + '.js');
    KEYS.forEach((k) => assert.ok(new RegExp('^\\s*' + k + ': "[^"]+",', 'm').test(s), lg + ' ← ' + k));
  });
});

test('الواجهة: مثال الوضع الأوّل نموذجٌ في قسمه يملأ الوصف بضغطة، ووسوم الملفّات مرفوعة', () => {
  const js = read('js/video.js');
  assert.ok(js.includes("keys=['videoIdea'+c,'videoIdea'+c+'2']"));
  assert.ok(js.includes('setVal(pe,tx)'));
  const h = read('index.html');
  assert.ok(h.includes('src="/js/video.js?v=436"') && h.includes('modules.css?v=673'));
  assert.ok(read('js/app-04-i18n-state.js').includes(".js?v=731'"));
});
