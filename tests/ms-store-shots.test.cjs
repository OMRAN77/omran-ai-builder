// tests/ms-store-shots.test.cjs — v-ms-shots: رفض Microsoft Store (٢٢ أكتوبر ٢٠٢٦، 10.1.1.3 Inaccurate Representation —
// «show non-Windows UI or devices», لقطات جوّال في القائمة الإنجليزيّة). اللقطات الجديدة: التطبيق نفسه على حاسوب ١٩٢٠×١٠٨٠ بلغتين.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('١. المولّد يصوّر نافذة حاسوب ١٩٢٠×١٠٨٠ من الموقع العامّ بحساب غير المالك، بلا هاتف ولا ?store=', () => {
  const sh = read('store/microsoft/shots.mjs');
  assert.ok(sh.includes("'--desktop', '--viewport', '1920x1080', '--scale', '1'"), 'حاسوب لا جوّال');
  assert.doesNotMatch(sh, /'--mobile'|360x640|'\/\?store=/, 'لا واجهة جوّال ولا رابط حزمة متجر آخر');
  assert.ok(sh.includes("'--path', '/'") && sh.includes("'--user', 'reviewer'") && !/'--user', 'omran'/.test(sh));
  assert.ok(sh.includes("const LANGS = (opt('langs') || 'en,ar')"), 'الإنجليزيّة (موضع الرفض) والعربيّة');
  assert.match(sh, /askAllHintTip/, 'تلميح أوّل زيارة يُغلق قبل اللقطة');
});

test('٢. الملفّات = قائمة المولّد في كلّ لغة، PNG ١٩٢٠×١٠٨٠ (حدود المتجر 1366×768 … 3840×2160) وأقلّ من ٥٠ م.ب', () => {
  const sh = read('store/microsoft/shots.mjs');
  const names = [...sh.matchAll(/\{ name: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(names.length >= 4 && names.length <= 10, 'من ٤ إلى ١٠ لقطات');
  const { PNG } = require('pngjs');
  for (const lang of ['en', 'ar']) {
    const dir = path.join(root, 'store/microsoft/screenshots', lang);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
    assert.deepEqual(files, names.map((n) => n + '.png').sort(), lang + ': لا لقطة قديمة باقية');
    for (const f of files) {
      const buf = fs.readFileSync(path.join(dir, f));
      const p = PNG.sync.read(buf);
      assert.ok(p.width === 1920 && p.height === 1080, lang + '/' + f + ' ١٩٢٠×١٠٨٠');
      assert.ok(buf.length < 50 * 1024 * 1024, lang + '/' + f);
    }
  }
});

test('٣. README المتجر يقول ما حدث وكيف يُعاد التقديم: الاسم «Om ai» محجوز، والرفض 10.1.1.3، واللقطات من المولّد', () => {
  const r = read('store/microsoft/README.md');
  assert.ok(r.includes('10.1.1.3') && r.includes('9NZLQM4G1X3D') && r.includes('node store/microsoft/shots.mjs'));
  assert.ok(r.includes('Resubmit for certification'));
});
