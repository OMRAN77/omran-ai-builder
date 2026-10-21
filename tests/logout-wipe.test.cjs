// tests/logout-wipe.test.cjs — v-logout-wipe (تدقيق ١٨ أكتوبر: «بعد الخروج تبقى محادثات الحساب كلها ظاهرة على الجهاز، حتى بعد
// التحديث»، وأمر المالك ٢٠ أكتوبر، الدفعة ٢: «تسجيل الخروج يمسح المحادثات والصور المحفوظة في الجهاز»).
// الكود الحقيقيّ من app-04 في vm بمتصفّح مزيّف: تأكيد ← رفع أخير للحساب ← مسح المحادثات وIndexedDB والمفضّلة وصورة البطل؛
// «لا» = لا شيء يُمسح؛ فشل الرفع = تنبيه ثانٍ قبل المسح؛ والإعدادات تبقى. وdoLogout ينتظر المسح قبل مسح الرمز.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const A4 = read('js/app-04-i18n-state.js');

function env(o) {
  const opt = o || {};
  const s = A4.indexOf('var __chatsLivePollTimer = null;');
  const e = A4.indexOf('function __chatsPullMerge(){');
  assert.ok(s > 0 && e > s, 'كتلة الخروج بحدودها');
  const log = [];
  const ls = new Map(Object.entries(Object.assign({
    aiapp_projects: '[{"id":"p_1"}]', aiapp_projects_slim: '[]', aiapp_current_id: 'p_1', aiapp_deleted_chats: '["p_0"]',
    aiapp_studio_favorites: '[{"dataUrl":"data:image/png;base64,AAA"}]', aiapp_fashion_favorites: '[]', omran_hero_b64: 'QUJD', omran_hero_mime: 'image/jpeg',
    aiapp_theme: 'dark', aiapp_lang: 'ar', omranCustomInstructions: 'خاطبني باسمي',
  }, opt.ls || {})));
  const confirms = (opt.confirms || [true, true]).slice();
  const ctx = {
    console, JSON, Object, Array, String, Number, Promise, Date, Math, Error,
    setTimeout: (fn, ms) => (ms >= 3000 ? 0 : setTimeout(fn, 0)), clearTimeout: () => {}, clearInterval: () => {},
    window: { __localChatsLoaded: true, indexedDB: true },
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), removeItem: (k) => { log.push('rm:' + k); ls.delete(k); } },
    indexedDB: { deleteDatabase: (n) => { log.push('idb-delete:' + n); const rq = {}; setTimeout(() => rq.onsuccess && rq.onsuccess(), 0); return rq; } },
    confirm: (m) => { log.push('confirm:' + m); return confirms.length ? confirms.shift() : false; },
    t: (k) => ({ logoutWipeConfirm: 'CONFIRM', logoutWipeOffline: 'OFFLINE', defaultProjectTitle: 'محادثة جديدة' })[k] || k,
    __swallow: () => {},
    state: { projects: opt.projects || [{ id: 'p_1', title: 'وصفة', messages: [{ role: 'user', content: 'هلا' }] }], currentId: 'p_1' },
    IDB_NAME: 'aiapp_db',
    chatsAuthToken: () => 'tok',
    chatsServerPull: (cb) => { log.push('pull'); setTimeout(() => cb(opt.pullOk === false ? false : true), 0); },
    chatsSlimForServer: () => ctx.state.projects.map((p) => ({ id: p.id, messages: p.messages || [] })),
    fetch: async (url) => { log.push('fetch:' + url); return { ok: opt.saveOk !== false }; },
    saveState: () => log.push('saveState'), renderAll: () => log.push('renderAll'), mahaClearImageRef: () => log.push('maha-clear'),
  };
  vm.createContext(ctx);
  vm.runInContext('let __slimCache = null; let __chatsSyncTimer = null; let __chatsLoadedFor = "tok";\n' + A4.slice(s, e), ctx);
  return { ctx, log, ls };
}

test('١. نعم: رفع أخير للحساب أوّلًا، ثمّ مسح المحادثات وIndexedDB والمفضّلة وصورة البطل — والإعدادات والتعليمات باقية', async () => {
  const { ctx, log, ls } = env();
  assert.equal(await ctx.window.chatsLogoutWipe(), true);
  const iSave = log.indexOf('fetch:/api/account?action=chats_save');
  assert.ok(iSave > log.indexOf('pull') && iSave >= 0, 'سحب ثمّ رفع');
  assert.ok(iSave < log.findIndex((x) => x.startsWith('rm:')), 'الرفع قبل أيّ مسح');
  for (const k of ['aiapp_projects', 'aiapp_projects_slim', 'aiapp_current_id', 'aiapp_deleted_chats', 'aiapp_studio_favorites', 'aiapp_fashion_favorites', 'omran_hero_b64', 'omran_hero_mime']) assert.ok(!ls.has(k), k);
  for (const k of ['aiapp_theme', 'aiapp_lang', 'omranCustomInstructions']) assert.ok(ls.has(k), 'باقٍ: ' + k);
  assert.ok(log.includes('idb-delete:aiapp_db'), 'المحادثات ومخزن صورها');
  assert.ok(log.includes('maha-clear'));
  assert.equal(ctx.state.projects.length, 1);
  assert.equal(ctx.state.projects[0].messages.length, 0, 'محادثة فارغة جديدة');
  assert.equal(ctx.state.currentId, ctx.state.projects[0].id);
  assert.ok(log.indexOf('saveState') > log.indexOf('idb-delete:aiapp_db'));
  assert.equal(log.filter((x) => x.startsWith('confirm:')).length, 1, 'سؤال واحد حين نجح الرفع');
});

test('٢. «لا» في التأكيد: لا رفع ولا مسح، والخروج يُلغى', async () => {
  const { ctx, log, ls } = env({ confirms: [false] });
  assert.equal(await ctx.window.chatsLogoutWipe(), false);
  assert.ok(!log.some((x) => x.startsWith('rm:') || x.startsWith('idb-delete') || x.startsWith('fetch:')), JSON.stringify(log));
  assert.ok(ls.has('aiapp_projects') && ls.has('aiapp_studio_favorites'));
});

test('٣. تعذّر الرفع (الاتصال): يُقال قبل المسح — «لا» يبقي كلّ شيء، و«نعم» يمسح', async () => {
  const a = env({ pullOk: false, confirms: [true, false] });
  assert.equal(await a.ctx.window.chatsLogoutWipe(), false);
  assert.deepEqual(a.log.filter((x) => x.startsWith('confirm:')), ['confirm:CONFIRM', 'confirm:OFFLINE']);
  assert.ok(a.ls.has('aiapp_projects'), 'لم يُمسح شيء');
  const b = env({ saveOk: false, confirms: [true, true] });
  assert.equal(await b.ctx.window.chatsLogoutWipe(), true);
  assert.ok(b.log.includes('confirm:OFFLINE') && !b.ls.has('aiapp_projects'));
});

test('٤. لا محادثات ولا صور على الجهاز: خروج بلا سؤال', async () => {
  const { ctx, log } = env({ projects: [{ id: 'p_9', messages: [] }], ls: { aiapp_studio_favorites: '[]', aiapp_fashion_favorites: '[]', omran_hero_b64: '', omran_hero_mime: '' } });
  assert.equal(await ctx.window.chatsLogoutWipe(), true);
  assert.ok(!log.some((x) => x.startsWith('confirm:')));
});

test('٥. doLogout ينتظر المسح قبل مسح الرمز، و«لا» = يبقى مسجَّلًا', () => {
  const a1 = read('js/app-01-boot-auth.js');
  const i = a1.indexOf('  async function doLogout(opts){');
  assert.ok(i > 0, 'doLogout صارت async');
  const body = a1.slice(i, a1.indexOf("authRemove('aiapp_auth_token');", i));
  assert.match(body, /try\{ ok = await window\.chatsLogoutWipe\(\{ silent: !!\(opts && opts\.deleted\) \}\); \}/);
  assert.match(body, /if\(ok === false\) return;/);
});

test('٥ب. بعد حذف الحساب: مسح صامت بلا سؤال ولا رفع', async () => {
  const { ctx, log, ls } = env({ confirms: [] });
  assert.equal(await ctx.window.chatsLogoutWipe({ silent: true }), true);
  assert.ok(!log.some((x) => x.startsWith('confirm:') || x.startsWith('fetch:') || x === 'pull'), JSON.stringify(log));
  assert.ok(!ls.has('aiapp_projects') && log.includes('idb-delete:aiapp_db'));
});

test('٦. نصّا التأكيد بالـ١٤ لغة بلا اسم مزوّد ولا أحرف خفيّة', () => {
  const BAD = /gemini|google|openai|gpt|claude|anthropic|[​-‏‪-‮⁦-⁩﻿]/i;
  const a3 = read('js/app-03-i18n-data.js');
  const D = { ar: {}, en: {} };
  for (const k of ['logoutWipeConfirm', 'logoutWipeOffline']) {
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
  for (const [l, d] of Object.entries(D)) for (const k of ['logoutWipeConfirm', 'logoutWipeOffline']) { assert.ok(d[k] && d[k].length > 30, l + ' ' + k); assert.doesNotMatch(d[k], BAD, l + ' ' + k); }
});
