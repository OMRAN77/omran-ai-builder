'use strict';
/* v-float-above-composer (تدقيق ١٨–١٩ أكتوبر، g01 session-new-toast وg03 composer-send): توست «✨ جلسة جديدة» كان
   على bottom:80px ثابت ومتوسّط النافذة، فيغطّي صندوق الكتابة (والإرسال على الجوّال) ٣٫٥ ثانية. الآن مساعد مشترك
   window.__omranAboveComposer يقيس أعلى #composerBox (أو #inputbar) ويعطي bottom فوقه بفجوة، ومنتصف الصندوق وعرضه؛
   يستعمله التوست هنا وتلميح التعليم (edu.js) وشريط سؤال التنبيه (media-notify.js). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/app-22-session-new.js'), 'utf8');

function parseCss(txt) {
  const o = {};
  String(txt || '').split(';').forEach((d) => { const i = d.indexOf(':'); if (i > 0) o[d.slice(0, i).trim()] = d.slice(i + 1).trim(); });
  return o;
}
function world(opts) {
  const o = Object.assign({ innerHeight: 900, rects: {}, newSession: true }, opts);
  const body = { children: [], appendChild(c) { body.children.push(c); return c; } };
  const els = {};
  Object.keys(o.rects).forEach((id) => { els[id] = { id, getBoundingClientRect: () => o.rects[id] }; });
  els.history = { id: 'history', children: [{}] };
  const document = {
    readyState: 'complete', body,
    getElementById: (id) => {
      if (id === 'sessToast') return body.children.find((c) => c.id === 'sessToast') || null;
      return els[id] || null;
    },
    createElement: () => {
      const e = { id: '', style: {}, textContent: '', remove() {} };
      return e;
    },
    addEventListener() {},
  };
  const state = { projects: [{ id: 'p1', title: 'x', messages: [{ role: 'user', content: 'هلا' }] }], currentId: 'p1' };
  const ss = new Map(); if (!o.newSession) ss.set('omran_sess_v1', '1');
  const ctx = {
    document, innerHeight: o.innerHeight, innerWidth: o.innerWidth || 1440,
    sessionStorage: { getItem: (k) => (ss.has(k) ? ss.get(k) : null), setItem: (k, v) => ss.set(k, v) },
    localStorage: { getItem: () => null, setItem() {} },
    setTimeout: () => 0, requestAnimationFrame: () => 0, MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
    __swallow() {}, lang: 'ar',
  };
  ctx.window = ctx;
  ctx.window.__omrS = state;
  vm.runInNewContext(SRC, ctx);
  const toast = body.children.find((c) => c.id === 'sessToast');
  return { ctx, toast, css: toast ? parseCss(toast.style.cssText) : null };
}

test('١. الحاسوب: التوست فوق #inputbar المقيس بعشر بكسلات وفي منتصفه (لا منتصف النافذة)', () => {
  const w = world({ innerHeight: 900, rects: { inputbar: { top: 800, left: 450, width: 670, height: 40, right: 1120, bottom: 840 } } });
  assert.ok(w.toast, 'التوست ظهر');
  assert.equal(w.css.bottom, '110px', '900 − 800 + 10');
  assert.equal(w.css.left, '785px', 'منتصف الصندوق 450 + 670/2');
  assert.equal(w.css.transform, 'translateX(-50%)');
  assert.equal(w.css['max-width'], '670px', 'لا يتجاوز عرض الصندوق');
  assert.notEqual(w.css['white-space'], 'nowrap', 'يلتفّ داخل عرض الصندوق بدل أن يفيض');
  assert.equal(w.css['box-sizing'], 'border-box', 'الحشوة داخل max-width');
});

test('٢. الجوّال: #composerBox أعلاه 713 من 844 ← التوست كلّه فوقه (bottom ≥ 139px)', () => {
  const w = world({ innerHeight: 844, innerWidth: 390, rects: { composerBox: { top: 713, left: 11, width: 358, height: 50, right: 369, bottom: 763 }, inputbar: { top: 700, left: 0, width: 390, height: 90 } } });
  const b = parseFloat(w.css.bottom);
  assert.ok(b >= 139, 'bottom=' + w.css.bottom + ' — أسفل التوست فوق أعلى الصندوق');
  assert.equal(b, 844 - 713 + 10, '#composerBox مقدَّم على #inputbar');
  assert.equal(w.css.left, '190px');
});

test('٣. بلا صندوق ظاهر (مخفيّ أثناء مكالمة مها مثلًا) يبقى الاحتياط القديم 80px و50%', () => {
  const w = world({ rects: { composerBox: { top: 0, left: 0, width: 0, height: 0 } } });
  assert.equal(w.css.bottom, '80px');
  assert.equal(w.css.left, '50%');
});

test('٤. المساعد المشترك معرَّض ولو لم تكن الجلسة جديدة، ويعطي null بلا صندوق', () => {
  const w = world({ newSession: false, innerHeight: 900, rects: { composerBox: { top: 799, left: 448, width: 674, height: 40 } } });
  assert.equal(w.toast, undefined, 'لا توست في نفس التبويب');
  const f = w.ctx.window.__omranAboveComposer;
  assert.equal(typeof f, 'function');
  assert.deepEqual(JSON.parse(JSON.stringify(f(10))), { bottom: 111, left: 448, width: 674, cx: 785 });
  assert.equal(f(8).bottom, 109, 'الفجوة تُمرَّر');
  const none = world({ newSession: false, rects: {} });
  assert.equal(none.ctx.window.__omranAboveComposer(10), null);
});
