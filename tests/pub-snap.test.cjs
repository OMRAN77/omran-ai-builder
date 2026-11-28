// tests/pub-snap.test.cjs — v-pub-snap (المالك ٢٨ نوفمبر: «انا شغلي في الكمبوتر… يستوي من الكمبوتر من التطبيق بروحه»): سناب لا ينشر من التطبيقات
// بلا قائمة سماح، فزرّ «Snapchat — من الكمبيوتر» في «انشر في حساباتي» ينزّل الفيديو المعروض ويفتح صفحة رفع سناب في الضغطة نفسها، بنصّه بالـ١٤ لغة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('الزرّ في اللوحة، ينزّل الفيديو ويفتح صفحة رفع سناب في الضغطة نفسها، بلا خادم', () => {
  const v = read('js/video.js');
  assert.match(v, /<button type="button" class="vmk-pub-snap" id="vdPubSnap"><\/button>/);
  assert.match(v, /querySelector\('#vdPubSnap'\)\.addEventListener\('click',pbSnap\)/);
  const fn = /function pbSnap\(\)\{[\s\S]*?\n  \}/.exec(v)[0];
  assert.match(fn, /a\.href=DR\.out; a\.download='om-ai-snapchat\.mp4'/, 'ينزّل الفيديو المعروض');
  assert.match(fn, /window\.open\('https:\/\/profile\.snapchat\.com\/','_blank','noopener'\)/, 'صفحة الرفع في لسان جديد');
  assert.ok(!/pbApi|fetch\(/.test(fn), 'لا خادم ولا مفتاح');
  assert.match(v, /ps\.textContent=L\('vdPubSnap'\); ps\.disabled=!DR\.out\|\|EC\.busy;/, 'معطّل بلا فيديو');
  const ver = (src, re) => Number((re.exec(src) || [])[1] || 0);
  assert.ok(ver(read('index.html'), /js\/video\.js\?v=(\d+)/) > 475, 'وسم video.js مرفوع بعد v-socpub-note (475)');
  assert.match(read('css/modules.css'), /#videoMakerModal \.vmk-pub-snap\{/);
  assert.ok(ver(read('index.html'), /css\/modules\.css\?v=(\d+)/) > 700, 'وسم modules.css مرفوع');
});

test('النصّان بالـ١٤ لغة، ووسم ملفّات اللغات مرفوع', () => {
  const d = read('js/app-03-i18n-data.js');
  assert.equal((d.match(/vdPubSnap: "/g) || []).length, 2, 'العربيّة والإنجليزيّة');
  assert.equal((d.match(/vdPubSnapMsg: "/g) || []).length, 2);
  for (const lg of ['fr', 'es', 'ru', 'tr', 'id', 'fil', 'hi', 'ur', 'bn', 'ne', 'ml', 'zh']) {
    const s = read('i18n/' + lg + '.js');
    assert.match(s, new RegExp('Object\\.assign\\(I18N\\["' + lg + '"\\], \\{"vdPubSnap": "Snapchat — [^"]+", "vdPubSnapMsg": "[^"]+"\\}\\);'), lg);
  }
  assert.ok(Number((/'\.js\?v=(\d+)'/.exec(read('js/app-04-i18n-state.js')) || [])[1]) > 810, 'وسم ملفّات اللغات مرفوع');
});
