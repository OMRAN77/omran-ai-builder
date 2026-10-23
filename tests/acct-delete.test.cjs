// tests/acct-delete.test.cjs — v-acct-delete (تدقيق ١٨ أكتوبر «ما في حذف حساب داخل التطبيق، لازم المستخدم يراسل بالإيميل»،
// وأمر المالك ٢٠ أكتوبر، الدفعة ٢: «حذف الحساب داخل التطبيق — Apple وGoogle يطلبونه»).
// الخادم (account-delete.js) بمخزن مزيّف: الاسم تأكيدًا وكلمة المرور إن وُجدت وحدّ محاولاتها، إيقاف التجديد قبل أيّ محو (وتعذّره
// يمنع الحذف)، محو بيانات الحساب وفهارسه التي تشير إليه وحده وروابطه العامّة، والسجلّ شاهد بلا بيانات؛ والمالك لا يُحذف.
// ثمّ الربط: إجراء auth، والواجهة في «حسابي» للمسجَّل غير المالك، والنصوص بالـ١٤ لغة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const { deleteAccount, singleKeys, FAIL_MAX } = require(path.join(root, 'api/_lib/account-delete.js'));

function hashPw(pw) { const salt = 'abc123'; return { salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') }; }
function world(o) {
  const opt = o || {};
  const kv = new Map();
  const users = new Map();
  const sara = Object.assign({ username: 'Sara', email: 'sara@x.com', phone: '+971500000000', avatar: 'data:x', media: { image: { plan: 'img1', at: 1 } } }, opt.google ? { googleAuth: true } : hashPw('secret-pass-1'));
  users.set('sara', sara);
  for (const k of singleKeys('sara')) kv.set(k, '1');
  kv.set('planvid:sara:111', '1'); kv.set('planvid:sara:222', '1'); kv.set('emaildraft:sara:m1', 'enc');
  kv.set('chats:noor', 'keep'); kv.set('points:noor', '50'); kv.set('planvid:sarah:1', 'keep'); // أسماء قريبة لا تُمسّ
  kv.set('db/explore/1_a.json', JSON.stringify({ id: 'a', username: 'Sara' })); kv.set('db/shares/a.json', '{}');
  kv.set('db/explore/2_b.json', JSON.stringify({ id: 'b', username: 'noor' })); kv.set('db/shares/b.json', '{}');
  kv.set('db/email-index/sara@x.com', JSON.stringify({ username: 'sara' }));
  kv.set('db/phone-index/+971500000000', JSON.stringify({ username: 'someone_else' })); // هاتف صار لغيره — لا يُمسّ
  kv.set('db/alias/g_sara@x.com', JSON.stringify({ primary: 'sara' }));
  kv.set('payrec:sara:1', 'legal'); // سجلّ دفع يبقى
  const calls = [];
  const kvApi = {
    kvGetRaw: async (k) => (kv.has(k) ? kv.get(k) : null),
    kvGetJSON: async (k) => { try { return kv.has(k) ? JSON.parse(kv.get(k)) : null; } catch (e) { return null; } },
    kvDel: async (k) => { kv.delete(k); },
    kvList: async (p) => [...kv.keys()].filter((k) => k.startsWith(p)),
    kvIncr: async (k) => { const v = Number(kv.get(k) || 0) + 1; kv.set(k, String(v)); return v; },
    kvExpire: async () => {},
  };
  const auth = { getUser: async (u) => (users.has(u) ? JSON.parse(JSON.stringify(users.get(u))) : null), putUser: async (u, r) => { users.set(u, JSON.parse(JSON.stringify(r))); } };
  const autoRenewToggle = async (req, res) => { calls.push(['renew', req.body.on]); if (opt.billingDown) res.status(502).json({ error: 'stripe down' }); else res.status(200).json({ ok: true, subs: 1, on: false }); };
  return { kv, users, calls, o: { kv: kvApi, auth, autoRenewToggle, now: 1700000000000 } };
}

test('١. الاسم لا يطابق أو كلمة المرور خاطئة: لا محو ولا إيقاف، والمحاولات الخاطئة لها حدّ', async () => {
  const w = world();
  assert.equal((await deleteAccount({ username: 'sara', token: 't', confirmUsername: 'sar', password: 'secret-pass-1' }, w.o)).body.code, 'name_mismatch');
  for (let i = 0; i < FAIL_MAX; i++) assert.equal((await deleteAccount({ username: 'sara', token: 't', confirmUsername: 'SARA', password: 'nope' }, w.o)).status, 401);
  assert.equal((await deleteAccount({ username: 'sara', token: 't', confirmUsername: 'sara', password: 'secret-pass-1' }, w.o)).body.code, 'too_many', 'بعد ٥ أخطاء حتّى الصحيحة تنتظر');
  assert.deepEqual(w.calls, []);
  assert.ok(w.kv.has('chats:sara') && w.users.get('sara').email, 'لم يُمسّ شيء');
});

test('٢. المالك لا يحذف حسابه من هنا', async () => {
  const w = world();
  assert.equal((await deleteAccount({ username: 'omran', token: 't', confirmUsername: 'omran', password: 'x' }, w.o)).status, 403);
});

test('٣. تعذّر إيقاف التجديد في Stripe = لا حذف (لا بطاقة تُخصم لحساب بلا صاحب)', async () => {
  const w = world({ billingDown: true });
  const r = await deleteAccount({ username: 'sara', token: 't', confirmUsername: 'sara', password: 'secret-pass-1' }, w.o);
  assert.deepEqual([r.status, r.body.code], [502, 'billing']);
  assert.ok(w.kv.has('chats:sara') && w.kv.has('points:sara') && !w.users.get('sara').deleted);
});

test('٤. النجاح: التجديد أُوقف أوّلًا، بياناته وفهارسه وروابطه العامّة مُحيت، وغيره لم يُمسّ، والسجلّ شاهد بلا بيانات', async () => {
  const w = world();
  const r = await deleteAccount({ username: 'sara', token: 't', confirmUsername: 'Sara', password: 'secret-pass-1' }, w.o);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(w.calls, [['renew', false]]);
  for (const k of singleKeys('sara')) assert.ok(!w.kv.has(k), 'باقٍ: ' + k);
  for (const k of ['planvid:sara:111', 'planvid:sara:222', 'emaildraft:sara:m1', 'db/explore/1_a.json', 'db/shares/a.json', 'db/email-index/sara@x.com', 'db/alias/g_sara@x.com']) assert.ok(!w.kv.has(k), 'باقٍ: ' + k);
  for (const k of ['chats:noor', 'points:noor', 'planvid:sarah:1', 'db/explore/2_b.json', 'db/shares/b.json', 'db/phone-index/+971500000000', 'payrec:sara:1']) assert.ok(w.kv.has(k), 'مُحي خطأً: ' + k);
  assert.deepEqual(w.users.get('sara'), { deleted: true, deletedAt: 1700000000000, selfDeleted: true }, 'لا بريد ولا كلمة مرور ولا ملفّ');
  assert.equal((await deleteAccount({ username: 'sara', token: 't', confirmUsername: 'sara' }, w.o)).body.code, 'gone');
});

test('٥. حساب Google بلا كلمة مرور: الاسم يكفي', async () => {
  const w = world({ google: true });
  assert.equal((await deleteAccount({ username: 'sara', token: 't', confirmUsername: 'sara', password: '' }, w.o)).status, 200);
});

test('٦. الربط: إجراء deleteAccount في auth، والواجهة في «حسابي» للمسجَّل غير المالك، والخروج بعده صامت', () => {
  const a = read('api/_lib/auth.js');
  assert.match(a, /if \(action === 'deleteAccount'\) \{\n\s*const u = verifyToken\(token\);/);
  assert.match(a, /require\('\.\/account-delete\.js'\)\.deleteAccount\(\{ username: u, token, confirmUsername: String\(body\.confirmUsername \|\| ''\)\.slice\(0, 64\), password \}\)/);
  const p = read('js/partials-settings.js');
  for (const id of ['acctDeleteWrap', 'acctRowDelete', 'acctDeleteName', 'acctDeletePass', 'acctDeleteBtn', 'acctDeleteMsg']) assert.ok(p.includes('id="' + id + '"'), id);
  assert.match(p, /onclick="acctDeleteAccount\(\)"/);
  const a1 = read('js/app-01-boot-auth.js');
  assert.match(a1, /acctDeleteWrap\.style\.display = \(loggedIn && String\(authGet\('aiapp_username'\) \|\| ''\)\.trim\(\)\.toLowerCase\(\) !== 'omran'\) \? '' : 'none';/);
  const f = a1.slice(a1.indexOf('  async function acctDeleteAccount(){'), a1.indexOf('  window.acctDeleteAccount = acctDeleteAccount;'));
  assert.ok(f.indexOf("say('acctDeleteWrongName'); return; }") < f.indexOf("confirm(t('acctDeleteConfirm'))"), 'الاسم يُفحص قبل السؤال وقبل الخادم');
  assert.ok(f.indexOf("confirm(t('acctDeleteConfirm'))") < f.indexOf("fetch('/api/auth'"), 'السؤال قبل الحذف');
  assert.match(f, /await doLogout\(\{ deleted: true \}\);/);
});

test('٧. نصوص الحذف بالـ١٤ لغة بلا اسم مزوّد ولا أحرف خفيّة', () => {
  const K = ['acctDeleteLabel', 'acctDeleteHint', 'acctDeleteNamePh', 'acctDeletePassPh', 'acctDeleteBtn', 'acctDeleteConfirm', 'acctDeleteWorking', 'acctDeleteDone', 'acctDeleteWrongName', 'acctDeleteWrongPass', 'acctDeleteTooMany', 'acctDeleteFailed'];
  // ZWNJ/ZWJ (U+200C/U+200D) جزء من إملاء الماليالاميّة (پاسوورد كما في قاموسها القائم) — الممنوع أحرف الاتّجاه والمسافة الخفيّة
  const BAD = /gemini|google|openai|gpt|claude|anthropic|stripe|[​‎‏‪-‮⁦-⁩﻿]/i;
  const a3 = read('js/app-03-i18n-data.js');
  const D = { ar: {}, en: {} };
  for (const k of K) {
    const m = [...a3.matchAll(new RegExp('\\b' + k + ":\\s*'((?:[^'\\\\]|\\\\.)*)'", 'g'))];
    assert.equal(m.length, 2, k);
    D.ar[k] = m[0][1]; D.en[k] = m[1][1];
  }
  for (const l of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
    const c = { I18N: { [l]: {} }, window: {} };
    vm.createContext(c);
    vm.runInContext(read('i18n/' + l + '.js'), c);
    D[l] = c.I18N[l];
  }
  assert.equal(Object.keys(D).length, 14);
  for (const [l, d] of Object.entries(D)) for (const k of K) { assert.ok(d[k], l + ' ' + k); assert.doesNotMatch(d[k], BAD, l + ' ' + k); }
});
