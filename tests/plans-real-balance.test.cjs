// tests/plans-real-balance.test.cjs — v-plans-real-balance (تدقيق ١٨ أكتوبر «صفحة الباقات تقول نقاطك خلصت والرصيد فوقها 10 نقاط»
// و«تقول تحتاج 10 نقاط والرصيد 10 والصورة أصلًا بـ20»، وأمر المالك ٢٠ أكتوبر، الدفعة ١: «خلها تقرا الرصيد الحقيقي»).
// سطر سبب فتح الباقات يُكتب من رصيده الحقيقيّ (الرقم نفسه في صفّ «رصيدك من النقاط» فوقه) ومن «تحتاج» في ردّ الخادم، ورسالة
// الصورة في المحادثة من ردّ الخادم نفسه بلا رقم مكتوب في الواجهة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

function makeDom() {
  const all = [];
  function mark(e, on) { e.attached = on; e.children.forEach((c) => mark(c, on)); }
  function el(tag) {
    const e = {
      tagName: String(tag).toUpperCase(), id: '', style: { cssText: '', display: '' }, textContent: '', children: [], parentNode: null, attached: false, attrs: {}, listeners: {},
      setAttribute(k, v) { this.attrs[k] = String(v); },
      appendChild(c) { c.parentNode = this; this.children.push(c); mark(c, this.attached); return c; },
      insertBefore(c, ref) { c.parentNode = this; const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, c); mark(c, this.attached); return c; },
      remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((x) => x !== this); this.parentNode = null; mark(this, false); },
      addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
      dispatch(type) { (this.listeners[type] || []).forEach((fn) => fn({ type })); },
      click() { this.dispatch('click'); },
    };
    all.push(e);
    return e;
  }
  const body = el('body');
  body.attached = true;
  return { el, body, doc: { body, createElement: el, getElementById: (id) => all.find((x) => x.attached && x.id === id) || null } };
}
// القوالب العربيّة الحقيقيّة من القاموس
const a3 = read('js/app-03-i18n-data.js');
const AR = {};
for (const k of ['plansWhyPoints', 'plansWhyPointsNeed', 'plansWhyPointsLow']) {
  const m = new RegExp('\\b' + k + ":\\s*'([^']*)'").exec(a3);
  assert.ok(m, k + ' في القاموس العربيّ');
  AR[k] = m[1];
}
const flush = () => new Promise((r) => setImmediate(r));
function gate(opts) {
  const o = opts || {};
  const { el, body, doc } = makeDom();
  const dlg = el('dialog'); dlg.id = 'settingsDialog'; body.appendChild(dlg);
  const sec = el('div'); sec.id = 'pricingSection'; dlg.appendChild(sec);
  const tabs = el('div'); tabs.id = 'priceTabs'; sec.appendChild(tabs);
  const btn = el('button'); btn.id = 'btnSettings'; body.appendChild(btn);
  const replies = o.replies || {};
  const ctx = {
    window: {}, document: doc, location: { href: 'https://omran.test/chat', origin: 'https://omran.test' }, URL,
    localStorage: { getItem: () => null, setItem: () => {} },
    lang: 'ar', console, Date, Object, Array, String, Number, Promise, JSON, setTimeout, isFinite,
    t: (k) => (k in AR ? AR[k] : k),
    authGet: (k) => (k === 'aiapp_auth_token' ? 'tok' : ''),
    showSettingsPage: () => {}, showPriceTab: () => {}, stripUiEmoji: (s) => s, __swallow: () => {},
  };
  // صفّ الرصيد: refreshPointsWallet يكتب window.__pointsBalance من /api/points (كما app-06)
  ctx.window.refreshPointsWallet = async () => { await flush(); if (o.balance != null) ctx.window.__pointsBalance = o.balance; };
  ctx.window.fetch = async (url) => { const r = replies[url] || { status: 200, body: {} }; return { status: r.status, ok: r.status < 300, clone() { return this; }, json: async () => r.body }; };
  vm.createContext(ctx);
  vm.runInContext(read('js/app-33-plans-gate.js'), ctx);
  return { ctx, why: () => doc.getElementById('plansWhy') };
}

test('١. ٤٠٢ من الخادم برصيد ١٠ وسعر ٢٠: السطر «رصيدك 10 نقطة، وهذه العمليّة تحتاج 20» لا «نقاطك خلصت»', async () => {
  const g = gate({ balance: 10, replies: { '/api/maha-image': { status: 402, body: { error: 'points_insufficient', needed: 20, points: 10 } } } });
  await g.ctx.window.fetch('/api/maha-image', { method: 'POST' });
  await flush(); await flush(); await flush();
  assert.equal(g.why().textContent, 'رصيدك 10 نقطة، وهذه العمليّة تحتاج 20 — اشحن من الباقات وكمّل مباشرة.');
  assert.doesNotMatch(g.why().textContent, /خلصت/);
});

test('٢. الرقم نفسه الذي يكتبه صفّ الرصيد: إن قرأ الصفّ رصيدًا آخر (تغيّر بعد الردّ) يتبعه السطر', async () => {
  const g = gate({ balance: 12, replies: { '/api/maha-image': { status: 402, body: { error: 'points_insufficient', needed: 20, points: 10 } } } });
  await g.ctx.window.fetch('/api/maha-image', { method: 'POST' });
  for (let i = 0; i < 5; i++) await flush();
  assert.match(g.why().textContent, /^رصيدك 12 نقطة، وهذه العمليّة تحتاج 20 /);
});

test('٣. صفر = «نقاطك خلصت»؛ وفتح بلا سعر (مها، المحادثة) يقرأ الرصيد ويقول «ما يكفي»', async () => {
  const z = gate({ balance: 0, replies: { '/api/video-create': { status: 402, body: { error: 'points_insufficient', needed: 55, points: 0 } } } });
  await z.ctx.window.fetch('/api/video-create', { method: 'POST' });
  for (let i = 0; i < 5; i++) await flush();
  assert.equal(z.why().textContent, AR.plansWhyPoints);
  const m = gate({ balance: 10 });
  m.ctx.window.omranOpenPlans('points', 'maha');
  for (let i = 0; i < 5; i++) await flush();
  assert.equal(m.why().textContent, 'رصيدك 10 نقطة وما يكفي لهذه العمليّة — اشحن من الباقات وكمّل مباشرة.');
});

test('٤. رسالة الصورة في المحادثة من ردّ الخادم: رصيده وسعر الصورة، وبلاهما بلا رقم (لا «تحتاج 10» القديم)', () => {
  const a2 = read('js/app-02-tts.js');
  const fn = a2.slice(a2.indexOf('function imgErrFriendly('), a2.indexOf("  if(err === 'image_generation_timeout'){"));
  const ctx = { setTimeout: () => {}, window: {}, __swallow: () => {}, Number, isFinite };
  vm.createContext(ctx);
  vm.runInContext(fn + '\n  return null; }', ctx);
  assert.equal(ctx.imgErrFriendly('points_insufficient', true, { error: 'points_insufficient', needed: 20, points: 10 }),
    '⚡ رصيدك 10 نقطة، وهذه الصورة تحتاج 20 نقطة. افتح الإعدادات ← الباقات لشحن نقاطك وتكمل مباشرة.');
  assert.match(ctx.imgErrFriendly('points_insufficient', false, { needed: 35, points: 0 }), /You have 0 points; this image needs 35\./);
  const bare = ctx.imgErrFriendly('points_insufficient', true);
  assert.doesNotMatch(bare, /\d/, 'بلا رقم مكتوب');
  const a9 = read('js/app-09-attach.js');
  assert.equal((a9.match(/imgErrFriendly\(__data && __data\.error, lang === 'ar', __data\)/g) || []).length, 2);
  assert.equal((a9.match(/imgErrFriendly\(__gData && __gData\.error, lang === 'ar', __gData\)/g) || []).length, 1);
});

test('٥. النصّان الجديدان بالـ١٤ لغة بموضعي {have} و{need}، بلا اسم مزوّد ولا أحرف خفيّة؛ ووسم ملفّات اللغات مرفوع', () => {
  const BAD = /gemini|google|openai|gpt|claude|anthropic|[​-‏‪-‮⁦-⁩﻿]/i;
  const dicts = { ar: {}, en: {} };
  for (const k of ['plansWhyPointsNeed', 'plansWhyPointsLow']) {
    const m = [...a3.matchAll(new RegExp('\\b' + k + ":\\s*'([^']*)'", 'g'))];
    assert.equal(m.length, 2, k);
    dicts.ar[k] = m[0][1]; dicts.en[k] = m[1][1];
  }
  for (const l of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
    const ctx = { I18N: { [l]: {} }, window: {} };
    vm.createContext(ctx);
    vm.runInContext(read('i18n/' + l + '.js'), ctx);
    dicts[l] = ctx.I18N[l];
  }
  assert.equal(Object.keys(dicts).length, 14);
  for (const [l, d] of Object.entries(dicts)) {
    assert.ok(d.plansWhyPointsNeed.includes('{have}') && d.plansWhyPointsNeed.includes('{need}'), l);
    assert.ok(d.plansWhyPointsLow.includes('{have}') && !d.plansWhyPointsLow.includes('{need}'), l);
    for (const k of ['plansWhyPointsNeed', 'plansWhyPointsLow']) assert.doesNotMatch(d[k], BAD, l + ' ' + k);
  }
  // الوسم يُقرأ من الملفّ لا يُثبَّت حرفيًّا (سقّاطة البنية): سبب الرفع موجود والوسم الحاليّ ≥ رفعه
  const st = read('js/app-04-i18n-state.js');
  const tag = Number((/'\.js\?v=(\d+)'/.exec(st) || [])[1]);
  assert.ok(st.includes('v-plans-real-balance (764):') && tag >= 764, 'وسم ملفّات اللغات مرفوع لنصّي هذه الدفعة');
});
