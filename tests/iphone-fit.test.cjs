'use strict';
/* v-iphone-fit (لقطات المالك ٢٣ سبتمبر — آيفون): مربّع الكتابة يطفو ٨٢ نقطة فوق الكيبورد، ودرجا المحادثات
   والملفّات تحت الساعة. يشغّل pinVisualViewport الحقيقيّ على منفذ مرئيّ مزيّف ويفحص قواعد CSS. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const boot = fs.readFileSync('js/app-01-boot-auth.js', 'utf8');
const css = fs.readFileSync('css/redesign.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

function runPin() {
  const src = boot.slice(boot.indexOf('(function pinVisualViewport(){'), boot.indexOf('const $ = s =>'));
  const ls = {};
  const vv = { height: 844, offsetTop: 0, addEventListener: (t, f) => { (ls[t] = ls[t] || []).push(f); } };
  const classes = new Set();
  const props = {};
  const root = { classList: { toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); } },
    style: { setProperty: (k, v) => { props[k] = v; }, removeProperty: (k) => { delete props[k]; } } };
  const win = { visualViewport: vv, innerHeight: 844, addEventListener() {}, scrollTo() {}, scrollY: 0 };
  const doc = { documentElement: root, addEventListener() {}, body: {} };
  let frames = [];
  new Function('window', 'document', 'requestAnimationFrame', 'setInterval', 'performance', src)(
    win, doc, (f) => frames.push(f), () => 0, { now: () => 0 });
  const flush = () => { const f = frames; frames = []; f.forEach((x) => x()); };
  flush();
  return { vv, classes, props, fire: () => { (ls.resize || []).forEach((f) => f()); flush(); } };
}

test('١. الكيبورد يفتح ⇒ html.kb-open و‎--vv-h بطول المرئيّ؛ يغلق ⇒ تزول العلامة', () => {
  const p = runPin();
  assert.equal(p.classes.has('kb-open'), false);
  p.vv.height = 844 - 380; p.fire();
  assert.equal(p.classes.has('kb-open'), true);
  assert.equal(p.props['--vv-h'], '464px');
  p.vv.height = 844; p.fire();
  assert.equal(p.classes.has('kb-open'), false);
  assert.equal(p.props['--vv-h'], undefined);
});

test('٢. CSS: الكيبورد مفتوح ⇒ لا حجز تحت main ولا شريط تبويبات؛ الدرجان بحاشية القمّة (سقف 62)', () => {
  assert.match(css, /html\.kb-open main\{padding-bottom:0 !important;\}/);
  assert.match(css, /html\.kb-open #omranBottomNav\{display:none !important;\}/);
  assert.match(css, /html\.mobile-ui #sidebar, html\.mobile-ui #workarea\{padding-top:min\(var\(--omran-sat, env\(safe-area-inset-top,0px\)\), 62px\);\}/);
  assert.match(css, /@media \(max-width:860px\)\{\n\s+#sidebar, #workarea\{padding-top:min\(var\(--omran-sat/);
  assert.ok(+((html.match(/css\/redesign\.css\?v=(\d+)/) || [])[1] || 0) >= 682);
});
