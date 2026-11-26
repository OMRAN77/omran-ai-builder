'use strict';
// v-talk-room-file: «غرفة الربع» على الآيفون والحاسوب — بلا تطبيق يقرأ الجهات (يحتاج حساب Apple مدفوعًا)، فالشخص يعطيها بنفسه مجّانًا:
// ملفّ جهات الاتصال (vCard: جهات الاتصال ← القوائم ← اضغط مطوّلًا «كل جهات الاتصال» ← تصدير) أو منتقي الجهات في المتصفّح. يُقرأ في الجهاز،
// ثمّ الطريق نفسه (E.164، البصمة، المطابقة، الحفظ في الجهاز). الدوالّ الحقيقيّة من room.html (طريقة fnSrc).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'room.html'), 'utf8');
function fnSrc(src, head) {
  const a = src.indexOf(head);
  assert.ok(a >= 0, head);
  let d = 0, i = src.indexOf('{', a);
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) break; } }
  return src.slice(a, i + 1);
}
const fns = (...heads) => heads.map((h) => fnSrc(html, h)).join('\n');
const plain = (x) => JSON.parse(JSON.stringify(x));
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };

function vcf() { const ctx = {}; vm.runInNewContext(fns('function vcfRows('), ctx); return ctx.vcfRows; }

// What an iPhone exports (vCard 3.0): folded lines, item groups, escapes, a folded photo; and an old Android one (2.1, quoted-printable).
const IPHONE = [
  'BEGIN:VCARD', 'VERSION:3.0', 'PRODID:-//Apple Inc.//iPhone OS 18.1//EN', 'N:الهاشمي;فاطمة;;;', 'FN:فاطمة الهاشمي',
  'item1.TEL;type=pref:+971 50 000 0002', 'item1.X-ABLabel:_$!<Mobile>!$_', 'TEL;type=CELL;type=VOICE:050 123 4567',
  'PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQSkZJRgABAQAAAQABAAD', ' /2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgy', 'END:VCARD',
  'BEGIN:VCARD', 'VERSION:3.0', 'N:Smith\\, Jr.;John;;;', 'FN:John Smith\\, Jr.', 'TEL;type=HOME:+44 (0)20 7946', ' 0958', 'END:VCARD',
  'BEGIN:VCARD', 'VERSION:3.0', 'N:;Ali;;;', 'TEL:00966551234567', 'END:VCARD',
  'BEGIN:VCARD', 'VERSION:3.0', 'FN:No number', 'EMAIL:a@b.c', 'END:VCARD',
].join('\r\n');
const OLD_ANDROID = [
  'BEGIN:VCARD', 'VERSION:2.1', 'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:;=D8=B9=D9=84=D9=8A;;;',
  'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=D8=B9=D9=84=D9=8A =D8=A7=D9=84=D8=B1=D8=A7=D8=B4=D8=AF=', '=D9=8A',
  'TEL;CELL:+971551112222', 'END:VCARD',
].join('\n');

test('vcfRows: ملفّ الآيفون — الأسطر المطويّة، مجموعات item، الهروب، الصورة تُترك، وأرقام كثيرة لجهة واحدة', () => {
  const rows = plain(vcf()(IPHONE));
  assert.deepEqual(rows, [
    ['فاطمة الهاشمي', '+971 50 000 0002'], ['فاطمة الهاشمي', '050 123 4567'],
    ['John Smith, Jr.', '+44 (0)20 79460958'],
    ['Ali', '00966551234567'],
  ]);
});

test('vcfRows: ملفّ أندرويد قديم (2.1) بأسماء quoted-printable وسطر مكسور بـ=', () => {
  assert.deepEqual(plain(vcf()(OLD_ANDROID)), [['علي الراشدي', '+971551112222']]);
  assert.deepEqual(plain(vcf()('BEGIN:VCARD\nFN;ENCODING=QUOTED-PRINTABLE:=ZZ%oops\nTEL:+971551112222\nEND:VCARD')), [['=ZZ%oops', '+971551112222']], 'ترميز تالف: كما كُتب');
});

test('vcfRows: ما ليس ملفّ جهات، والحدود (٢٠ رقمًا للجهة، ٥٠٠٠ صفّ)', () => {
  const f = vcf();
  assert.deepEqual(plain(f('')), []); assert.deepEqual(plain(f('hello\nworld')), []); assert.deepEqual(plain(f(null)), []);
  assert.deepEqual(plain(f('TEL:+971551112222')), [], 'رقم خارج أيّ بطاقة');
  let one = 'BEGIN:VCARD\nFN:Many\n'; for (let i = 0; i < 30; i++) one += 'TEL:+97155' + String(1000000 + i) + '\n';
  assert.equal(f(one + 'END:VCARD').length, 20);
  let big = ''; for (let i = 0; i < 6000; i++) big += 'BEGIN:VCARD\nFN:F' + i + '\nTEL:+97156' + String(1000000 + i) + '\nEND:VCARD\n';
  assert.equal(f(big).length, 5000);
});

test('الطريق كلّه: ملفّ الآيفون ← E.164 بدولة الشخص ← الصفوف التي تُبصم (bookRows نفسها كتطبيق الأندرويد)', () => {
  const ctx = { CC: null, String, Object, Array, JSON };
  vm.runInNewContext(fns('function vcfRows(', 'function ccMap(', 'function toE164(', 'function cleanLabel(', 'function bookRows('), ctx);
  const b = plain(ctx.bookRows({ v: 1, iso: 'ae', list: ctx.vcfRows(IPHONE) }));
  assert.deepEqual(b.list.map((r) => r.p).sort(), ['+442079460958', '+966551234567', '+971500000002', '+971501234567']);
  const none = plain(ctx.bookRows({ v: 1, iso: '', list: [['x', '050 123 4567']] }));
  assert.equal(none.list.length, 0, 'بلا دولة: الرقم المحلّي لا يُخمَّن');
});

function page(over) {
  const store = new Map(), drew = [], payloads = [], body = [];
  const ctx = Object.assign({
    JSON, Object, Array, String, Promise, Number, Math, TextDecoder, Uint8Array,
    T: { syncTitle: 'TITLE', syncDisclose: 'ANDROID-DISCLOSE', fileDisclose: 'FILE-DISCLOSE', syncRelay: 'RELAY', syncAllow: 'Allow', syncLater: 'Later', syncing: 'BUSY',
      syncBtn: 'FIND', syncAgain: 'AGAIN', syncGo: 'GO', syncedAt: 'Synced {n}', syncNone: 'none', syncNoApp: 'noapp', syncGetApp: 'get', fileSteps: 'STEPS', fileCountry: 'COUNTRY',
      fileChoose: 'CHOOSE', pickBtn: 'PICK', fileEmpty: 'EMPTY', fileBig: 'BIG', syncFailed: 'FAILED' },
    L: 'en', CC: null, book: null, syncAsk: false, syncBusy: '', syncGo: '', installNote: false, fileOpen: false, fileCC: '', error: '', bridge: false, androidUA: false, myPhone: null,
    navigator: { languages: ['en-US'], language: 'en-US' }, window: {}, Intl,
    document: { createElement: () => { const el = { listeners: {}, addEventListener(k, f) { el.listeners[k] = f; }, click() { el.clicked = (el.clicked || 0) + 1; }, style: {} }; return el; }, body: { appendChild: (el) => body.push(el) } },
    $: () => null,
    lsGet: (k) => (store.has(k) ? store.get(k) : null), lsSet: (k, v) => { store.set(k, v); return true; },
    fmt: (s, n) => s.replace('{n}', n), when: () => 'today', draw() { drew.push(1); },
    syncDone(msg) { ctx.syncBusy = ''; if (msg) ctx.error = msg; },
    syncWhy: () => 'WHY', gotPayload: (p) => { payloads.push(p); ctx.book = { list: [1] }; return Promise.resolve(); },
    WHY: {},
  }, over || {});
  vm.runInNewContext(fns('function ccMap(', 'function toE164(', 'function cleanLabel(', 'function bookRows(', 'function vcfRows(', 'function guessCC(', 'function ccOptions(',
    'function gotRows(', 'function lastLineStart(', 'function vcfDecoder(', 'function readVcf(', 'function readFile(', 'function fileInput(', 'function needCC(', 'function pickContacts(',
    'function fileBox(', 'function syncBox(', 'function startSync(', 'var esc = function') + '\nvar ccOpts = "", bookFile = null;\nvar canPick = !!(navigator.contacts && typeof navigator.contacts.select === "function" && window.ContactsManager);', ctx);
  return { ctx, store, drew, payloads, body };
}

test('الدولة: المختارة قبل، وإلّا رمز رقمك المربوط متى ما كان لدولة وحدة — ولا تخمين من لغة الجهاز', () => {
  let p = page(); assert.equal(p.ctx.guessCC(), '', 'آيفون بالإنجليزي (US) في بغداد: لا «أمريكا»');
  p = page({ navigator: { languages: ['ar-AE'] } }); assert.equal(p.ctx.guessCC(), '', 'ولا من لغة عربيّة');
  p = page({ myPhone: '+971•••••67' }); assert.equal(p.ctx.guessCC(), 'ae');
  p = page({ myPhone: '+964•••••12' }); assert.equal(p.ctx.guessCC(), 'iq');
  p = page({ myPhone: '+966•••••12' }); assert.equal(p.ctx.guessCC(), 'sa');
  p = page({ myPhone: '+120•••••12' }); assert.equal(p.ctx.guessCC(), '', '+1 لدول كثيرة: لا تخمين');
  p = page({ myPhone: '+447•••••12' }); assert.equal(p.ctx.guessCC(), '', '+44 كذلك');
  p = page({ myPhone: '+971•••••67' }); p.store.set('room-cc', 'sa'); assert.equal(p.ctx.guessCC(), 'sa', 'المختارة قبل أوّلًا');
  p.store.set('room-cc', 'zz'); assert.equal(p.ctx.guessCC(), 'ae', 'محفوظ غير صالح: يُترك');
  const o = page().ctx.ccOptions('ae');
  assert.match(o, /^<option value="">—<\/option>/); assert.match(o, /<option value="ae" selected>[^<]*\+971<\/option>/);
  assert.equal((o.match(/ selected/g) || []).length, 1); assert.ok((o.match(/<option /g) || []).length >= 250);
});

test('الشاشة: آيفون/حاسوب — الإفصاح الخاصّ بالملفّ (بلا «الخادم يمرّرها»)، ثمّ صندوق الملفّ؛ والأندرويد كما كان', () => {
  let p = page({ myPhone: '+971•••••67' });
  assert.match(p.ctx.syncBox(), /data-sync="1"[^>]*>FIND</, 'الآيفون صار له زرّ');
  p.ctx.syncAsk = true;
  let h = p.ctx.syncBox();
  assert.match(h, /FILE-DISCLOSE/); assert.ok(!/ANDROID-DISCLOSE|RELAY/.test(h)); assert.match(h, /data-syncok="1"/);
  p.ctx.syncAsk = false; p.ctx.startSync();
  assert.equal(p.ctx.fileOpen, true); assert.equal(p.ctx.fileCC, 'ae');
  h = p.ctx.syncBox();
  assert.match(h, /STEPS/); assert.match(h, /<select id="bookcc"/); assert.match(h, /value="ae" selected/);
  assert.match(h, /data-file="1"[^>]*>CHOOSE</); assert.ok(!/type="file"/.test(h), 'خانة الملفّ ليست في الصفحة المعاد رسمها');
  assert.ok(!/data-pick/.test(h), 'بلا منتقي في المتصفّح: لا زرّ'); assert.match(h, /data-filex="1"/);
  p = page({ navigator: { languages: ['en-US'], contacts: { select: () => Promise.resolve([]) } }, window: { ContactsManager: function () {} } });
  p.ctx.fileOpen = true; assert.match(p.ctx.syncBox(), /data-pick="1"/, 'المنتقي متى ما وُجد');

  p = page({ androidUA: true }); p.ctx.syncAsk = true;
  h = p.ctx.syncBox(); assert.match(h, /ANDROID-DISCLOSE/); assert.match(h, /RELAY/); assert.ok(!/FILE-DISCLOSE/.test(h));
  p.ctx.syncAsk = false; p.ctx.fileOpen = true; assert.ok(!/data-file/.test(p.ctx.syncBox()), 'الأندرويد: لا صندوق ملفّ');
});

test('بلا دولة: الملفّ والمنتقي ينتظران اختيارها؛ وخانة الملفّ واحدة للصفحة خارج الرسم', () => {
  const p = page();
  assert.equal(p.ctx.needCC(), true); assert.equal(p.ctx.error, 'COUNTRY');
  p.ctx.fileCC = 'iq'; p.ctx.error = '';
  assert.equal(p.ctx.needCC(), false); assert.equal(p.ctx.error, '');
  const a = p.ctx.fileInput(), b = p.ctx.fileInput();
  assert.equal(a, b, 'واحدة'); assert.equal(p.body.length, 1, 'في body لا في view'); assert.equal(a.type, 'file'); assert.match(a.accept, /^\.vcf,/);
  assert.equal(typeof a.listeners.change, 'function');
});

const blob = (s) => new Blob([s]);
test('الملفّ: يُقرأ في الجهاز ويمرّ للمطابقة؛ الفارغ لا يمسّ القائمة المحفوظة', async () => {
  let p = page({ fileCC: 'ae', fileOpen: true });
  p.ctx.readFile(blob(IPHONE)); await flush();
  assert.equal(p.payloads.length, 1);
  assert.equal(p.payloads[0].iso, 'ae'); assert.equal(p.payloads[0].list.length, 4);
  assert.equal(p.ctx.fileOpen, false, 'تمّ: الصندوق يُطوى');

  p = page({ fileCC: '', book: { list: ['kept'] } });
  p.ctx.readFile(blob('BEGIN:VCARD\nFN:x\nTEL:050 123 4567\nEND:VCARD')); await flush();
  assert.equal(p.payloads.length, 0); assert.equal(p.ctx.error, 'EMPTY'); assert.deepEqual(plain(p.ctx.book), { list: ['kept'] }, 'المحفوظة كما هي');
  p = page(); p.ctx.readFile(blob('not a vcard')); await flush(); assert.equal(p.ctx.error, 'EMPTY');
  p = page(); p.ctx.readFile({ size: 2 * 1024 * 1024 * 1024, slice() { throw new Error('read'); } }); await flush();
  assert.equal(p.ctx.error, 'BIG'); assert.equal(p.payloads.length, 0);
  p = page(); p.ctx.readFile({ size: 10, slice: () => ({ arrayBuffer: () => Promise.reject(new Error('io')) }) }); await flush();
  assert.equal(p.ctx.error, 'FAILED');
  p = page(); p.ctx.readFile(null); await flush(); assert.equal(p.payloads.length, 0);
  p = page({ fileCC: 'ae', gotPayload: () => Promise.reject(new Error('sync-cap')) });
  p.ctx.readFile(blob(IPHONE)); await flush();
  assert.equal(p.ctx.error, 'WHY', 'خطأ المطابقة (حدّ اليوم…) يُقال');
});

test('الملفّ بـUTF-16 (من بعض الكمبيوترات) يُقرأ، بعلامته أو بدونها', async () => {
  const card = 'BEGIN:VCARD\r\nVERSION:2.1\r\nFN:علي\r\nTEL;CELL:+971501234567\r\nEND:VCARD\r\n';
  const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(card, 'utf16le')]);
  const be = Buffer.from(Buffer.from('﻿' + card, 'utf16le')).swap16();
  const leNoBom = Buffer.from(card, 'utf16le');
  for (const [name, bytes] of [['LE', le], ['BE', be], ['LE بلا علامة', leNoBom]]) {
    const p = page({ fileCC: 'ae' });
    p.ctx.readFile(new Blob([bytes])); await flush();
    assert.equal(p.payloads.length, 1, name); assert.deepEqual(plain(p.payloads[0].list), [['علي', '+971501234567']], name);
  }
});

test('الملفّ الكبير بالصور: يُقرأ قطعًا (٤ ميغا) والصور تُرمى — ورقم مطويّ على حدّ القطعة يبقى سليمًا', async () => {
  const STEP = 4 * 1024 * 1024;
  const head = 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Photo\r\nTEL:+971551110000\r\nPHOTO;ENCODING=b;TYPE=JPEG:';
  const tail = 'END:VCARD\r\nBEGIN:VCARD\r\nVERSION:3.0\r\nFN:عمران\r\nTEL:+97150\r\n';
  const after = ' 0000001\r\nEND:VCARD\r\n';
  const need = STEP - Buffer.byteLength(head) - 2 - Buffer.byteLength(tail);      // the 4 MB boundary falls right before the folded half of Omran's number
  const m = Math.floor((need - 70) / 77) - 1;
  const NL = '\r\n';
  const photo = 'A'.repeat(70) + (NL + ' ' + 'B'.repeat(74)).repeat(m) + 'C'.repeat(need - 70 - 77 * m);
  assert.equal(Buffer.byteLength(head + photo + NL + tail), STEP, 'the boundary is where it should be');
  const text = head + photo + NL + tail + after;
  let big = text; for (let i = 0; i < 6; i++) big += 'BEGIN:VCARD\r\nFN:P' + i + '\r\nPHOTO;ENCODING=b:' + 'D'.repeat(1024 * 1024) + '\r\nTEL:+97156000000' + i + '\r\nEND:VCARD\r\n';
  const p = page({ fileCC: 'ae' });
  const got = await p.ctx.readVcf(new Blob([big]));
  assert.ok(got.length < 5000, 'الصور ما تبقى في الذاكرة: ' + got.length);
  p.ctx.readFile(new Blob([big])); await flush(); await flush();
  const rows = plain(p.payloads[0].list);
  assert.deepEqual(rows.slice(0, 2), [['Photo', '+971551110000'], ['عمران', '+971500000001']], 'الرقم المطويّ على حدّ القطعة');
  assert.equal(rows.length, 8);
});

test('منتقي الجهات: الاسم وكلّ أرقامه، والإغلاق بلا اختيار لا يقول شيئًا', async () => {
  const chosen = [{ name: ['Sara'], tel: ['+971 50 999 9999', '055 111 2222'] }, { name: [], tel: ['+966551234567'] }, { tel: [] }];
  let asked = null;
  let p = page({ fileCC: 'ae', navigator: { contacts: { select: (props, o) => { asked = [props, o]; return Promise.resolve(chosen); } } } });
  p.ctx.pickContacts(); await flush();
  assert.deepEqual(plain(asked), [['name', 'tel'], { multiple: true }]);
  assert.deepEqual(plain(p.payloads[0].list), [['Sara', '+971 50 999 9999'], ['Sara', '055 111 2222'], ['', '+966551234567']]);
  p = page({ navigator: { contacts: { select: () => Promise.reject(new Error('cancel')) } } });
  p.ctx.pickContacts(); await flush();
  assert.equal(p.ctx.error, ''); assert.equal(p.payloads.length, 0);
});

test('موصولة: الحالة، الأزرار تنتظر الدولة، تغيير الدولة يُحفظ — ولا رفع للملفّ', () => {
  assert.match(html, /var fileOpen = false, fileCC = '';/);
  assert.match(html, /else if \(d\.file\) \{ if \(!needCC\(\)\) fileInput\(\)\.click\(\); \}/);
  assert.match(html, /else if \(d\.pick\) \{ if \(!needCC\(\)\) pickContacts\(\); \}/);
  assert.match(html, /else if \(d\.filex\) \{ fileOpen = false; draw\(\); \}/);
  assert.match(html, /if \(t\.id === 'bookcc'\) \{ fileCC = t\.value; lsSet\('room-cc', fileCC\);/);
  assert.ok(!/bookfile/.test(html), 'لا خانة ملفّ داخل الرسم');
  for (const fn of ['function vcfRows(', 'function readVcf(', 'function readFile(', 'function gotRows(', 'function pickContacts(', 'function fileInput(']) assert.ok(!/fetch\(|call\(|FormData|XMLHttpRequest/.test(fnSrc(html, fn)), fn + ': لا يرسل شيئًا بنفسه');
});
