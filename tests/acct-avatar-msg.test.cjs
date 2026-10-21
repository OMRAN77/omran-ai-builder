'use strict';
/* v-acct-avatar-msg (تدقيق ١٨ أكتوبر، g12/acct-avatar): أخطاء رفع الصورة (كبيرة · رفض الخادم · بلا شبكة) كانت تُكتب في
   #acctUsernameMsg داخل صفّ «اسم المستخدم» المطويّ (display:none) فلا يراها أحد، والصورة التالفة (img.onerror) بلا أيّ رسالة.
   القرار: خانتا رسالة ظاهرتان — #acctAvatarMsg تحت زرّ «تغيير الصورة» في «حسابي»، و#setProfileMsg تحت الاسم في رأس
   الإعدادات (الرفع يبدأ من الاثنين) — ومساعد واحد avatarMsg يكتب فيهما؛ والنصوص مفاتيح موجودة بالـ١٤ لغة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const A01 = read('js/app-01-boot-auth.js');
const PS = read('js/partials-settings.js');
const T = { acctAvatarTooBig: 'TOO_BIG', acctGenericError: 'GENERIC', acctNetError: 'NET', acctSaving: 'SAVING' };
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

function mk(id) {
  return { id, style: {}, textContent: '', value: '', files: null, onclick: null, onchange: null };
}
async function upload({ fetchImpl, imgFails = false, big = false }) {
  const s = A01.indexOf('  if(acctAvatarBtn && acctAvatarInput){');
  const e = A01.indexOf('  if(acctUsernameSaveBtn){');
  assert.ok(s > 0 && e > s, 'معالج رفع الصورة بحدوده');
  const els = {};
  for (const id of ['acctAvatarBtn', 'acctAvatarInput', 'acctUsernameMsg', 'acctAvatarMsg', 'setProfileMsg']) els[id] = mk(id);
  els.acctAvatarMsg.style.display = 'none';
  els.setProfileMsg.style.display = 'none';
  const $ = (q) => els[q.replace(/^#/, '')] || null;
  class FileReader { readAsDataURL() { this.result = 'data:image/png;base64,AAAA'; setImmediate(() => this.onload()); } }
  class Image {
    constructor() { this.width = 320; this.height = 200; }
    set src(v) { this._src = v; setImmediate(() => (imgFails ? (this.onerror && this.onerror(new Error('decode'))) : this.onload())); }
    get src() { return this._src; }
  }
  const document = { createElement: () => ({ getContext: () => ({ drawImage() {} }), toDataURL: () => (big ? 'x'.repeat(300000) : 'data:image/jpeg;base64,BBBB') }) };
  const store = {};
  const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  let avatarUi = 0;
  new Function('$', 'acctAvatarBtn', 'acctAvatarInput', 'acctUsernameMsg', 'curT', 'authGet', 'updateAvatarUI', 'fetch', 'FileReader', 'Image', 'document', 'localStorage', A01.slice(s, e))(
    $, els.acctAvatarBtn, els.acctAvatarInput, els.acctUsernameMsg, () => T, () => 'tok', () => { avatarUi++; }, fetchImpl, FileReader, Image, document, localStorage);
  els.acctAvatarInput.files = [{ name: 'a.png' }];
  els.acctAvatarInput.onchange();
  await flush();
  return { els, store, avatarUi: () => avatarUi };
}

test('١. القالب: خانة رسالة تحت زرّ «تغيير الصورة» وأخرى تحت الاسم في رأس الإعدادات، مخفيّتان وهما فارغتان', () => {
  const H = PS.match(/var H = String\.raw`([\s\S]*?)`;/)[1];
  const btn = H.indexOf('id="acctAvatarBtn"');
  const msg = H.indexOf('id="acctAvatarMsg"');
  assert.ok(btn > 0 && msg > btn && msg - btn < 600, 'تحت زرّ الصورة مباشرة');
  assert.ok(H.indexOf('id="acctRowUser"') > msg, 'خارج صفّ «اسم المستخدم» المطويّ');
  const head = H.slice(H.indexOf('<div id="settingsProfile"'), H.indexOf('<div id="settingsUpgradeCard"'));
  assert.ok(head.indexOf('id="setProfileMsg"') > head.indexOf('id="setProfileName"'), 'تحت الاسم في الرأس');
  for (const id of ['acctAvatarMsg', 'setProfileMsg']) assert.match(H, new RegExp('<div id="' + id + '"[^>]*style="display:none;'), id + ' مخفيّة فارغة فلا تزيد الفراغ');
});

test('٢. بلا شبكة: الرسالة في خانتي الصورة ظاهرة، وخانة اسم المستخدم المطويّة فارغة', async () => {
  const r = await upload({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  for (const id of ['acctAvatarMsg', 'setProfileMsg']) {
    assert.equal(r.els[id].textContent, 'NET', id);
    assert.equal(r.els[id].style.display, '', id + ' ظاهرة');
  }
  assert.equal(r.els.acctUsernameMsg.textContent, '', 'لا شيء في الصفّ المطويّ');
});

test('٣. رفض الخادم 400 بخطئه، والصورة الكبيرة، والصورة التالفة — كلّها في خانتي الصورة', async () => {
  let r = await upload({ fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ error: 'SERVER_SAYS' }) }) });
  assert.equal(r.els.acctAvatarMsg.textContent, 'SERVER_SAYS');
  assert.equal(r.els.acctUsernameMsg.textContent, '');
  r = await upload({ fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({}) }) });
  assert.equal(r.els.acctAvatarMsg.textContent, 'GENERIC');
  r = await upload({ fetchImpl: async () => { throw new Error('لا يُنادى'); }, big: true });
  assert.equal(r.els.acctAvatarMsg.textContent, 'TOO_BIG');
  assert.equal(r.els.acctUsernameMsg.textContent, '');
  r = await upload({ fetchImpl: async () => { throw new Error('لا يُنادى'); }, imgFails: true });
  assert.equal(r.els.acctAvatarMsg.textContent, 'GENERIC', 'img.onerror يقول شيئًا');
  assert.equal(r.els.setProfileMsg.textContent, 'GENERIC');
});

test('٤. النجاح: تُحفظ الصورة وتُحدَّث الواجهة وتُمسح الرسالة وتختفي خانتها', async () => {
  const r = await upload({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ avatar: 'data:image/jpeg;base64,CCCC' }) }) });
  assert.equal(r.store.aiapp_avatar, 'data:image/jpeg;base64,CCCC');
  assert.equal(r.avatarUi(), 1);
  for (const id of ['acctAvatarMsg', 'setProfileMsg']) {
    assert.equal(r.els[id].textContent, '', id);
    assert.equal(r.els[id].style.display, 'none', id);
  }
});
