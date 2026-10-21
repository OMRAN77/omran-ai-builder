// tests/fb-overlay.test.cjs — v-fb-no-stack (تدقيق ١٨ أكتوبر: g05 image-text-overlay).
// «رأيك يهمنا» يفتح بعد الرسالة العاشرة بـ1.5 ثانية فوق أيّ نافذة مفتوحة (لوحة الباقات في اللقطة)، وfbAsked
// يُكتب قبل العرض فلا فرصة ثانية. الإصلاح: إن كانت نافذة (dialog مفتوح أو ورقة المشاركة) ظاهرة وقت الفتح
// لا يفتح ولا يكتب fbAsked، فيُعاد مع الرسالة التالية؛ وfbAsked يُكتب عند الفتح الفعليّ فقط.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-05-ui.js'), 'utf8');

function sliceBlock(src, start) {
  assert.ok(start >= 0, 'التوقيع موجود');
  let depth = 0, q = null;
  for (let j = src.indexOf('{', start); j < src.length; j++) {
    const c = src[j];
    if (q) { if (c === '\\') { j++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '/' && src[j + 1] === '/') { j = src.indexOf('\n', j); continue; }
    if (c === '/' && src[j + 1] === '*') { j = src.indexOf('*/', j) + 1; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error('كتلة غير متوازنة');
}

function setup(count) {
  const ls = new Map([['fbMsgCount', String(count)]]);
  const timers = [];
  let opened = 0, overlay = null;
  const ctx = {
    window: { openFeedback() { opened++; } },
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)) },
    document: { querySelector: (sel) => (overlay && sel.split(',').some((s) => s.trim() === overlay) ? {} : null) },
    setTimeout: (f) => { timers.push(f); return timers.length; },
    __swallow() {},
  };
  vm.createContext(ctx);
  const i = SRC.indexOf('window.__fbCountMsg = function(){');
  vm.runInContext(sliceBlock(SRC, i) + ';', ctx);
  return {
    ls, ctx,
    send() { ctx.window.__fbCountMsg(); while (timers.length) timers.shift()(); },
    setOverlay(s) { overlay = s; },
    get opened() { return opened; },
  };
}

test('١. الرسالة العاشرة ولوحة الإعدادات/الباقات (dialog) مفتوحة: لا تقييم فوقها ولا fbAsked', () => {
  const s = setup(9);
  s.setOverlay('dialog[open]');
  s.send();
  assert.equal(s.opened, 0, 'لا يفتح فوق نافذة أخرى');
  assert.equal(s.ls.get('fbAsked'), undefined, 'لم يُعرض بعد — فرصة ثانية مع الرسالة التالية');
  s.setOverlay(null);
  s.send();
  assert.equal(s.opened, 1, 'الرسالة التالية بلا نافذة: يفتح مرّة');
  assert.equal(s.ls.get('fbAsked'), '1', 'يُكتب عند الفتح الفعليّ');
  s.send();
  assert.equal(s.opened, 1, 'لا يتكرّر بعد العرض');
});

test('٢. ورقة المشاركة (.oShOv) ظاهرة: لا يفتح', () => {
  const s = setup(12);
  s.setOverlay('.oShOv');
  s.send();
  assert.equal(s.opened, 0);
  assert.equal(s.ls.get('fbAsked'), undefined);
});

test('٣. بلا نافذة: يفتح مرّة عند العاشرة كما كان، وقبلها لا', () => {
  const s = setup(7);
  s.send();
  assert.equal(s.opened, 0, 'الثامنة');
  s.send();
  assert.equal(s.opened, 0, 'التاسعة');
  s.send();
  assert.equal(s.opened, 1, 'العاشرة');
});
