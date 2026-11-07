'use strict';
/* tests/owner-reset-link.test.cjs — v-owner-reset-link (٧ نوفمبر ٢٠٢٦).
   العرض: مستخدمة نسيت كلمة مرورها، وإيميل الاسترجاع لا يصلها، فأعادت الضغط حتّى «محاولات كثيرة — جرّب بعد ١٥ دقيقة».
   الحلّ: زرّ 🔑 في جدول المستخدمين للمالك ينشئ رابط الاسترجاع نفسه (٣٠ دقيقة) ليسلّمه المالك بيده بعد التحقّق.
   يشغّل admin-actions.js وauth.js الحقيقيّين بمخزن في الذاكرة، ودوالّ لوحة المالك الحقيقيّة من app-01 في vm. */
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.OMRAN_TEST_FAST_SLEEP = '1';
process.env.AUTH_SECRET = 'سرّ-اختبار-الاسترجاع';
process.env.OWNER_USERNAME = 'boss';
process.env.UPSTASH_REDIS_REST_URL = 'http://فحص-محلّيّ';

const store = new Map();
const kvPath = require.resolve('../api/_lib/kv.js');
require.cache[kvPath] = { id: kvPath, filename: kvPath, loaded: true, exports: {
  kvGetJSON: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
  kvDel: async (k) => { store.delete(k); },
  kvList: async () => [...store.keys()],
  kvIncr: async () => 1, kvExpire: async () => {}, kvIncrBy: async () => 1,
  kvDecrBy: async () => 1, kvSetIfAbsent: async () => true,
  kvGetRaw: async (k) => store.get(k) || null, kvSetRaw: async (k, v) => store.set(k, v),
} };

const auth = require('../api/_lib/auth.js');
const admin = require('../api/_lib/admin-actions.js');
const mkRes = () => {
  const r = { code: 0, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (o) => { r.body = o; return r; };
  r.end = () => r;
  r.setHeader = () => {};
  return r;
};
const callAdmin = async (body) => { const r = mkRes(); await admin({ method: 'POST', body }, r); return r; };
const callAuth = async (body) => { const r = mkRes(); await auth({ method: 'POST', body, headers: {}, socket: {} }, r); return r; };
const ownerToken = () => auth.makeToken('boss');

test('١. المالك ينشئ رابطًا، وصاحب الحساب يضع به كلمة مرور جديدة، والرابط لا يُستعمل مرّتين', async () => {
  await auth.putUser('alya', { username: 'alya', email: 'alya@example.com', hash: 'h', salt: 's' });
  const r = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'Alya' });
  assert.equal(r.code, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.minutes, 30);
  const u = new URL(r.body.link);
  const rt = u.searchParams.get('resetToken');
  assert.match(rt, /^[0-9a-f]{48}$/);
  assert.equal(u.searchParams.get('ru'), 'alya');
  const saved = await auth.getUser('alya');
  assert.notEqual(saved.resetTokenHash, rt, 'الرمز يُخزَّن مجزَّأً لا خامًا');
  assert.ok(saved.resetTokenExpiry > Date.now() + 29 * 60 * 1000 && saved.resetTokenExpiry <= Date.now() + 30 * 60 * 1000);

  const ok = await callAuth({ action: 'resetWithToken', username: 'alya', resetToken: rt, newPassword: 'NewPass123' });
  assert.equal(ok.code, 200, JSON.stringify(ok.body));
  assert.ok(ok.body.token, 'يدخل مباشرة بجلسة جديدة');
  const again = await callAuth({ action: 'resetWithToken', username: 'alya', resetToken: rt, newPassword: 'Other1234' });
  assert.equal(again.code, 401, 'الرابط لمرّة واحدة');
});

test('٢. رابط جديد يُبطل السابق', async () => {
  await auth.putUser('noor', { username: 'noor', hash: 'h', salt: 's' });
  const a = new URL((await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'noor' })).body.link).searchParams.get('resetToken');
  const b = new URL((await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'noor' })).body.link).searchParams.get('resetToken');
  assert.notEqual(a, b);
  assert.equal((await callAuth({ action: 'resetWithToken', username: 'noor', resetToken: a, newPassword: 'NewPass123' })).code, 401);
  assert.equal((await callAuth({ action: 'resetWithToken', username: 'noor', resetToken: b, newPassword: 'NewPass123' })).code, 200);
});

test('٣. المالك وحده، ولا للمحذوف ولا للغائب ولا لحساب المالك', async () => {
  await auth.putUser('sara', { username: 'sara', hash: 'h', salt: 's' });
  for (const token of [auth.makeToken('sara'), undefined, 'مزوّر.لا.يفكّ']) {
    const r = await callAdmin({ token, action: 'reset-link', targetUsername: 'sara' });
    assert.ok(r.code === 401 || r.code === 403, 'غير المالك: ' + r.code);
  }
  assert.ok(!(await auth.getUser('sara')).resetTokenHash, 'ولم يُكتب رمز');
  await auth.putUser('gone', { username: 'gone', hash: 'h', salt: 's', deleted: true });
  assert.equal((await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'gone' })).code, 404);
  assert.equal((await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'لا-أحد' })).code, 404);
  assert.equal((await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'boss' })).code, 400);
});

/* ---------- الواجهة: زرّ 🔑 ودالّته الحقيقيّة من app-01 في vm ---------- */
const { dictFor, clientSlice } = require('./_owner-vm.cjs');
const { makeDom } = require('./_mini-dom.cjs');
function env(lang, answer) {
  const { document } = makeDom();
  ['adminStatsBox', 'adminUsersTable', 'adminClaudeDiagBox', 'vipListBox'].forEach((id) => { const e = document.createElement('div'); e.id = id; document.body.appendChild(e); });
  const said = [], sent = [];
  const ctx = {
    document, curT: () => dictFor(lang), authGet: () => 'tok', __swallow() {},
    confirm: (m) => { said.push(['confirm', m]); return answer; }, alert: (m) => said.push(['alert', m]), prompt: (m, v) => { said.push(['prompt', m, v]); return null; },
    fetch: async (url, init) => { sent.push([String(url), JSON.parse(init.body)]); return { ok: true, status: 200, json: async () => ({ ok: true, link: 'https://x.test/?resetToken=ab&ru=alya', minutes: 30 }) }; },
  };
  ctx.window = ctx;
  clientSlice('js/app-01-boot-auth.js', '  /* v-owner-i18n', '  function setAuthToggleUI(loggedIn){', ctx);
  return { ctx, said, sent };
}

test('٤. الزرّ في كلّ صفّ، والرفض لا يرسل شيئًا، والموافقة تعرض الرابط لينسخه', async () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js/app-01-boot-auth.js'), 'utf8');
  assert.ok(src.includes(`onclick="adminResetLink(\\'' + safeName + '\\')" title="' + escAdm(ownT('ownerResetTitle'))`), 'زرّ 🔑 بالاسم المهرَّب نفسه');
  const no = env('ar', false);
  await no.ctx.adminResetLink('alya');
  assert.equal(no.sent.length, 0);
  assert.match(no.said[0][1], /تأكّد أوّلًا أنّه صاحب الحساب/);
  const yes = env('en', true);
  await yes.ctx.adminResetLink('alya');
  assert.deepEqual(yes.sent[0][1], { token: 'tok', action: 'reset-link', targetUsername: 'alya' });
  const p = yes.said.find((x) => x[0] === 'prompt');
  assert.ok(p, 'نافذة الرابط');
  assert.equal(p[2], 'https://x.test/?resetToken=ab&ru=alya');
  assert.match(p[1], /valid 30 min/);
});
