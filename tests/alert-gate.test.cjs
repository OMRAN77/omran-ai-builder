'use strict';
/* v-alert-gate (فيديو المالك ٢ أكتوبر): نافذة «تحذير طارئ» بخبر إنجليزيّ ظهرت فوق شاشة الدخول.
   الآن: لا نافذة فوق شاشة الدخول (تؤجَّل بلا تعليم «شوهد»)، وفي الواجهة العربيّة يُتخطّى خبر بلا حرف عربيّ. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js/app-23-alerts.js'), 'utf8');

function boot({ overlay = 'none', lang = 'ar', items }) {
  const ls = new Map(lang === 'en' ? [['aiapp_lang', 'en']] : []);
  const modal = { style: { display: 'none' }, querySelector: () => ({}) };
  const els = { authOverlay: { style: { display: overlay } }, omranEmergencyModal: modal };
  let first = null;
  const ctx = {
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)) },
    document: { getElementById: (id) => els[id] || null, addEventListener() {} },
    fetch: async () => ({ ok: true, json: async () => ({ items }) }),
    setTimeout: (fn) => { if (!first) first = fn; }, setInterval() {}, URL, console,
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { modal, els, ls, poll: async () => { first(); await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r)); } };
}

const EN = { id: 'en1', title: 'Trump vows to hit Iran hard if linked to flydubai attack', url: 'https://x.test/a', level: 'emergency' };
const AR = { id: 'ar1', title: 'تحذير طارئ: إخلاء منطقة', url: 'https://x.test/b', level: 'emergency' };

test('١. فوق شاشة الدخول: لا نافذة، ولا يُعلَّم الخبر كمشاهَد (يظهر بعد الدخول)', async () => {
  const b = boot({ overlay: 'flex', items: [AR] });
  await b.poll();
  assert.equal(b.modal.style.display, 'none');
  assert.equal(b.ls.get('aiapp_alerts_seen'), undefined);
});

test('٢. واجهة عربيّة: الخبر الإنجليزيّ يُتخطّى والعربيّ يظهر', async () => {
  const b = boot({ items: [EN] });
  await b.poll();
  assert.equal(b.modal.style.display, 'none');
  const c = boot({ items: [EN, AR] });
  await c.poll();
  assert.equal(c.modal.style.display, 'flex');
});

test('٣. واجهة إنجليزيّة: الخبر الإنجليزيّ يظهر كما كان', async () => {
  const b = boot({ lang: 'en', items: [EN] });
  await b.poll();
  assert.equal(b.modal.style.display, 'flex');
});
