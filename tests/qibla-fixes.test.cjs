// tests/qibla-fixes.test.cjs — v-qibla-dir-hijri (تدقيق ١٨–١٩ أكتوبر، لقطات ٠٢٣ و٠٢٤ و٠٢٩).
// العرض: واجهة القبلة بالإنجليزيّ مقلوبة («Şafar 1440 AH 9»، «?How many minutes»، «min before 30»)، والتاريخ الهجريّ
// «9 صفر 1440» واليوم في 1448، وأزرار التنبيه «5 دقيقة قبل».
// الجذر: el.dir='rtl' ثابت والغلاف يُبنى مرّة؛ aladhan يقرأ /timings/{DD-MM-YYYY} ونحن نرسل YYYY-MM-DD (فيجيب عن ٢٠١٩ —
// جُرّب حيًّا: 2026-10-19 ← هجريّ 1441، و19-10-2026 ← 1448)، والخادم (check-reminders) مثله؛ ووحدة الدقائق واحدة لكلّ عدد.
// الاختبار: app-26-qibla.js الحقيقيّ في vm بمستند وهميّ وfetch مسجِّل، ودالّة الخادم fetchPrayerTimeMs الحقيقيّة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/app-26-qibla.js'), 'utf8');
const srv = fs.readFileSync(path.join(root, 'api/_lib/check-reminders.js'), 'utf8');

function fakeEl(tag) {
  const kids = {};
  const el = { tag, style: {}, attrs: {}, dir: '', id: '', innerHTML: '', textContent: '', parentNode: null,
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : (k === 'style' ? '' : null); },
    querySelector(sel) { if (!kids[sel]) kids[sel] = fakeEl('q'); return kids[sel]; }, querySelectorAll() { return []; },
    appendChild(c) { c.parentNode = this; return c; }, insertBefore(c) { c.parentNode = this; return c; },
    remove() { this.removed = true; if (doc.body.list.indexOf(this) >= 0) doc.body.list.splice(doc.body.list.indexOf(this), 1); } };
  Object.defineProperty(el, 'style', { value: { cssText: '' }, writable: true });
  return el;
}
const doc = { body: { list: [], appendChild(c) { this.list.push(c); c.parentNode = this; return c; } } };
function load(langCode) {
  doc.body.list = [];
  const urls = [];
  const store = { aiapp_lang: langCode };
  class FixedDate extends Date { constructor(...a) { if (a.length) super(...a); else super(2026, 9, 19, 10, 0, 0); } static now() { return new FixedDate().getTime(); } }
  const ctx = {
    lang: langCode, window: {}, navigator: {}, Date: FixedDate, Math, JSON, Object, Array, String, Number, Promise, Intl, setTimeout, clearTimeout,
    setInterval: () => 1, clearInterval() {}, __swallow() {},
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem(k, v) { store[k] = v; } },
    document: { getElementById: (id) => doc.body.list.find((e) => e.id === id && !e.removed) || null, createElement: (t) => fakeEl(t), body: doc.body, querySelector: () => null, addEventListener() {} },
    fetch: (u) => {
      urls.push(String(u));
      if (/ip-geo/.test(u)) return Promise.resolve({ json: () => ({ lat: 25.2, lng: 55.27 }) });
      return Promise.resolve({ json: () => ({ data: { timings: { Fajr: '05:02', Sunrise: '06:19', Dhuhr: '12:07', Asr: '15:22', Maghrib: '17:51', Isha: '19:05' }, date: { hijri: { day: '8', month: { ar: 'جمادى الأولى', en: 'Jumada al-Ula' }, year: '1448' } } } }) });
    },
  };
  vm.runInNewContext(src, ctx);
  return { ctx, urls, Q: ctx.window.omranQibla };
}
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };

test('١. اتّجاه الغلاف من لغة الواجهة، ويُعاد بناؤه حين تتغيّر اللغة', async () => {
  const t = load('en');
  t.Q.open(); await flush();
  const en = t.ctx.document.getElementById('omranQiblaShell');
  assert.equal(en.dir, 'ltr');
  assert.ok(en.innerHTML.includes('Qibla &amp; Prayer Times') || en.innerHTML.includes('Qibla & Prayer Times'));
  t.Q.close();
  t.ctx.lang = 'ar'; t.ctx.localStorage.setItem('aiapp_lang', 'ar');
  t.Q.open(); await flush();
  const ar = t.ctx.document.getElementById('omranQiblaShell');
  assert.notEqual(ar, en, 'غلاف جديد بلغته');
  assert.equal(ar.dir, 'rtl');
  assert.ok(ar.innerHTML.includes('القبلة والمواقيت'));
  assert.ok(!/el\.dir = 'rtl'/.test(src), 'لا اتّجاه ثابت');
});

test('٢. طلب المواقيت بصيغة aladhan DD-MM-YYYY (كان YYYY-MM-DD فيجيب عن ٢٠١٩: هجريّ 1441)', async () => {
  const t = load('ar');
  t.Q.open(); await flush();
  const u = t.urls.find((x) => x.includes('aladhan'));
  assert.ok(u, t.urls.join(' | '));
  assert.match(u, /\/v1\/timings\/19-10-2026\?latitude=25\.2&longitude=55\.27&method=16$/);
});

test('٣. أزرار التنبيه: «دقائق» من ٣ إلى ١٠ و«دقيقة» لما فوقها، وبقيّة اللغات كما هي', () => {
  const ar = load('ar').Q;
  assert.equal(ar._minLabel(5), '5 دقائق قبل');
  assert.equal(ar._minLabel(10), '10 دقائق قبل');
  assert.equal(ar._minLabel(15), '15 دقيقة قبل');
  assert.equal(ar._minLabel(30), '30 دقيقة قبل');
  assert.equal(load('en').Q._minLabel(5), '5 min before');
  assert.equal(load('fr').Q._minLabel(10), '10 min avant');
  assert.match(src, /b\.textContent = v === 0 \? tx\('atAdhan'\) : minLabel\(v\);/);
});

test('٤. الخادم (check-reminders): الرابط DD-MM-YYYY والحساب الداخليّ بالتاريخ نفسه', async () => {
  const i = srv.indexOf('async function fetchPrayerTimeMs(');
  let d = 0, end = -1; for (let j = srv.indexOf('{', i); j < srv.length; j++) { if (srv[j] === '{') d++; else if (srv[j] === '}' && --d === 0) { end = j + 1; break; } }
  const urls = [];
  const ctx = { Intl, Date, Number, parseInt, AbortSignal: { timeout: () => null },
    fetch: async (u) => { urls.push(u); return { ok: true, json: async () => ({ data: { timings: { Fajr: '05:02' }, meta: { timezone: 'Asia/Dubai' } } }) }; } };
  vm.runInNewContext(srv.slice(i, end) + ';this.f=fetchPrayerTimeMs;', ctx);
  const ms = await ctx.f(25.2, 55.27, 'Fajr', '2026-10-19', 16);
  assert.match(urls[0], /\/v1\/timings\/19-10-2026\?latitude=25\.2&longitude=55\.27&method=16$/);
  assert.equal(ms, Date.UTC(2026, 9, 19, 1, 2), 'الفجر 05:02 بتوقيت دبي = 01:02 UTC في ١٩ أكتوبر');
});
