// tests/google-token.test.cjs — v-google-token (فحص Desloppify ٨ نوفمبر ٢٠٢٦: getAccessToken منسوخة حرفيًّا في ثلاثة ملفّات بريد).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('١. ملفّات البريد الثلاثة تستعمل النسخة الواحدة، ولا تقرأ سرّ جوجل في نطاق الوحدة', () => {
  for (const n of ['email-list', 'email-send', 'email-calendar']) {
    const s = read('api/_lib/' + n + '.js');
    assert.ok(s.includes("const { refreshGoogleAccessToken: getAccessToken } = require('./_google-token.js');"), n);
    assert.doesNotMatch(s, /async function getAccessToken|GOOGLE_CLIENT_(ID|SECRET)|oauth2\.googleapis\.com\/token/, n + ': لا نسخة محلّيّة');
  }
});

test('٢. الطلب نفسه حرفيًّا، والسرّان يُقرآن عند النداء، والخطأ يرمي رمز جوجل', async () => {
  delete require.cache[require.resolve(path.join(root, 'api/_lib/_google-token.js'))];
  delete process.env.GOOGLE_CLIENT_ID; delete process.env.GOOGLE_CLIENT_SECRET;
  const { refreshGoogleAccessToken } = require(path.join(root, 'api/_lib/_google-token.js')); // يُحمَّل بلا أسرار — لا يرمي
  process.env.GOOGLE_CLIENT_ID = 'cid-late';
  process.env.GOOGLE_CLIENT_SECRET = 'csec-late';
  const calls = [];
  const realFetch = global.fetch;
  try {
    global.fetch = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ access_token: 'at-1' }) }; };
    assert.equal(await refreshGoogleAccessToken('rt-1'), 'at-1');
    assert.equal(calls[0].url, 'https://oauth2.googleapis.com/token');
    assert.equal(calls[0].init.method, 'POST');
    const p = Object.fromEntries(new URLSearchParams(String(calls[0].init.body)));
    assert.deepEqual(p, { client_id: 'cid-late', client_secret: 'csec-late', refresh_token: 'rt-1', grant_type: 'refresh_token' });
    global.fetch = async () => ({ ok: false, json: async () => ({ error: 'invalid_grant' }) });
    await assert.rejects(refreshGoogleAccessToken('bad'), /invalid_grant/);
    global.fetch = async () => ({ ok: false, json: async () => ({}) });
    await assert.rejects(refreshGoogleAccessToken('bad'), /refresh_failed/);
  } finally { global.fetch = realFetch; }
});
