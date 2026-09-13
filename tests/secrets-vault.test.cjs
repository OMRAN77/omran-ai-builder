// tests/secrets-vault.test.cjs — v-secret-vault: خزنة أسرار مشفّرة للمالك، ولا سرّ في المحادثة.
// طلب المالك ١٣ سبتمبر: «حقل خاصّ مشفّر لحفظ الأسرار بدل كتابته نصًّا خامًا بالمحادثة»،
// و«اعرض لي آخر الدفعات». يثبت: التشفير والاستعادة، لا كشف للقيمة، البوّابة للمالك وحده،
// مفتاح GitHub من البيئة ثمّ الخزنة، آخر الدفعات، وحذف السرّ الملصوق من الرسائل.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');

process.env.AUTH_SECRET = 'vault-test-secret-' + 'x'.repeat(32);
process.env.OWNER_USERNAME = 'omran';
delete process.env.GITHUB_TOKEN;
delete process.env.SECRETS_KEY;

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const vault = require('../api/_lib/secrets.js');
const { redactSecrets, redactMessages, SECRET_MARK } = require('../api/_lib/_msgs.js');
const GH = require('../api/_lib/github-read.js');

function fakeKv() { const m = new Map(); return { get: async (k) => (m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : null), put: async (k, v) => { m.set(k, JSON.parse(JSON.stringify(v))); }, map: m }; }
function token(u) {
  const payload = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60_000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
  return payload + '.' + sig;
}
const GH_TOK = 'ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0';

test('vault: set → status hides the value → get decrypts → clear', async () => {
  const kv = fakeKv();
  const o = { kv };
  assert.deepEqual(await vault.setSecret('github_token', GH_TOK, o), { ok: true });
  const stored = kv.map.get(vault.VAULT_PATH).github_token;
  assert.ok(stored.iv && stored.tag && stored.data && !JSON.stringify(stored).includes(GH_TOK), 'المخزون مشفّر لا نصّ خام');
  assert.equal(stored.hint, GH_TOK.slice(-4));
  const st = await vault.vaultStatus(o);
  assert.equal(st.configured, true);
  assert.deepEqual(Object.keys(st.items.github_token).sort(), ['hint', 'set', 'updatedAt']);
  assert.equal(st.items.github_token.set, true);
  assert.ok(!JSON.stringify(st).includes(GH_TOK), 'الحالة لا تحمل القيمة');
  assert.equal(await vault.getSecret('github_token', o), GH_TOK, 'الخادم وحده يستعيد القيمة');
  assert.equal(await vault.getSecret('github_token', Object.assign({ env: { AUTH_SECRET: 'another-key-entirely' } }, o)), '', 'مفتاح آخر = لا استعادة (ولا رمي)');
  assert.deepEqual(await vault.setSecret('github_token', 'short', o), { error: 'bad_value' });
  assert.deepEqual(await vault.setSecret('openai', GH_TOK, o), { error: 'unknown_secret' });
  assert.deepEqual(await vault.setSecret('github_token', GH_TOK, { kv, env: {} }), { error: 'vault_not_configured' }, 'بلا SECRETS_KEY/AUTH_SECRET الخزنة معطّلة');
  assert.deepEqual(await vault.clearSecret('github_token', o), { ok: true });
  assert.equal((await vault.vaultStatus(o)).items.github_token.set, false);
  assert.equal(await vault.getSecret('github_token', o), '');
});

test('vault handler: owner only, never returns the value, ops status/set/clear', async () => {
  // KV الحقيقيّ يُستبدل بذاكرة
  const kvPath = require.resolve('../api/_lib/kv.js');
  const kv = fakeKv();
  const saved = require.cache[kvPath];
  require.cache[kvPath] = { id: kvPath, filename: kvPath, loaded: true, exports: { kvGetJSON: kv.get, kvPutJSON: kv.put } };
  vault.resetCache();
  const call = async (body) => {
    let code = 0, out = null;
    const res = { setHeader() {}, status(c) { code = c; return this; }, json(v) { out = v; return this; }, end() {} };
    await vault({ method: 'POST', body, headers: {}, query: {} }, res);
    return { code, out };
  };
  try {
    assert.equal((await call({ op: 'status', token: token('guest') })).code, 401, 'غير المالك مرفوض');
    assert.equal((await call({ op: 'status' })).code, 401, 'بلا رمز مرفوض');
    let r = await call({ op: 'set', name: 'github_token', value: GH_TOK, token: token('omran') });
    assert.equal(r.code, 200); assert.equal(r.out.ok, true); assert.equal(r.out.items.github_token.set, true);
    assert.ok(!JSON.stringify(r.out).includes(GH_TOK), 'الردّ لا يحمل القيمة');
    r = await call({ op: 'status', token: token('omran') });
    assert.equal(r.out.items.github_token.hint, GH_TOK.slice(-4));
    r = await call({ op: 'set', name: 'github_token', value: 'nope', token: token('omran') });
    assert.equal(r.code, 400); assert.equal(r.out.error, 'bad_value');
    r = await call({ op: 'clear', name: 'github_token', token: token('omran') });
    assert.equal(r.code, 200); assert.equal(r.out.items.github_token.set, false);
    r = await call({ op: 'bogus', token: token('omran') });
    assert.equal(r.code, 400);
  } finally {
    if (saved) require.cache[kvPath] = saved; else delete require.cache[kvPath];
    vault.resetCache();
  }
});

test('github token: env first, then the vault; explicit opts.env never touches the vault', async () => {
  assert.equal(await GH.resolveGithubToken({ env: { GITHUB_TOKEN: ' envtok ' } }), 'envtok');
  assert.equal(await GH.resolveGithubToken({ env: {} }), '', 'بيئة صريحة بلا مفتاح = لا خزنة');
  const secPath = require.resolve('../api/_lib/secrets.js');
  const saved = require.cache[secPath];
  require.cache[secPath] = { id: secPath, filename: secPath, loaded: true, exports: { getSecret: async (n) => (n === 'github_token' ? 'vaulttok' : '') } };
  try {
    assert.equal(await GH.resolveGithubToken({}), 'vaulttok', 'بلا بيئة صريحة وبلا GITHUB_TOKEN → الخزنة');
    const calls = [];
    const fetchImpl = async (url, init) => { calls.push(init.headers.Authorization); return { ok: true, status: 200, headers: new Headers(), json: async () => ({}), text: async () => '' }; };
    await GH.ghFetch('/repos/o/r', { fetchImpl, lookup: async () => [{ address: '140.82.112.3', family: 4 }] });
    assert.deepEqual(calls, ['Bearer vaulttok'], 'الطلب يحمل مفتاح الخزنة');
  } finally {
    if (saved) require.cache[secPath] = saved; else delete require.cache[secPath];
  }
});

test('commits: /commits URL and what=commits, formatted latest pushes', async () => {
  const t = GH.parseTarget({ url: 'https://github.com/OMRAN77/omran-ai-builder/commits/main' });
  assert.deepEqual([t.kind, t.ref, t.path], ['commits', 'main', '']);
  assert.equal(GH.parseTarget({ url: 'OMRAN77/omran-ai-builder', what: 'commits', ref: 'dev' }).kind, 'commits');
  assert.equal(GH.parseTarget({ url: 'https://github.com/a/b/commits/main/api/_lib' }).path, 'api/_lib');
  const calls = [];
  const list = [
    { sha: '4a64ba7b63eddca07273f062907273e4aaa1bf07', author: { login: 'OMRAN77' }, commit: { author: { date: '2026-09-13T03:30:53Z' }, message: 'Merge pull request #544 from OMRAN77/claude/zero-result-fix\n\nbody' } },
    { sha: 'c08aab28feccd2addee42b6d1a1167b1bd9fea74', author: null, commit: { author: { name: 'Claude', date: '2026-09-13T03:17:37Z' }, message: 'دمج main في فرع الطبقات' } },
  ];
  const fetchImpl = async (url) => { calls.push(String(url)); return { ok: true, status: 200, headers: new Headers(), json: async () => list, text: async () => '' }; };
  const opts = { fetchImpl, lookup: async () => [{ address: '140.82.112.3', family: 4 }], env: {} };
  const out = await GH.readGithub({ url: 'OMRAN77/omran-ai-builder', what: 'commits', ref: 'main', limit: 5 }, opts);
  assert.match(calls[0], /\/repos\/OMRAN77\/omran-ai-builder\/commits\?per_page=5&sha=main$/);
  assert.match(out, /^آخر الدفعات \(الالتزامات\) في OMRAN77\/omran-ai-builder على main — 2:/);
  assert.match(out, /- 4a64ba7 · 2026-09-13 03:30 · OMRAN77 · Merge pull request #544 from OMRAN77\/claude\/zero-result-fix$/m, 'سطر واحد لكلّ التزام: sha7 · وقت · كاتب · العنوان');
  assert.match(out, /- c08aab2 · 2026-09-13 03:17 · Claude · دمج main/m, 'بلا حساب GitHub يُؤخذ اسم الكاتب');
  assert.ok(!out.includes('body'), 'جسم الالتزام لا يُعرض');
  const empty = await GH.readGithub({ url: 'a/b', what: 'commits' }, Object.assign({}, opts, { fetchImpl: async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => [], text: async () => '' }) }));
  assert.match(empty, /لا التزامات/);
});

test('redaction: pasted secrets never reach the model, ordinary text untouched', () => {
  const pat = 'github_pat_' + 'Z'.repeat(40);
  const msg = 'استخدم هذا ' + GH_TOK + ' وهذا ' + pat + ' وsk-ant-' + 'q'.repeat(40) + ' وAIza' + 'w'.repeat(35);
  const out = redactSecrets(msg);
  assert.ok(!out.includes(GH_TOK) && !out.includes(pat) && !out.includes('sk-ant-') && !out.includes('AIza'), 'كلّ الأسرار محذوفة');
  assert.equal(out.split(SECRET_MARK).length - 1, 4);
  for (const plain of ['شو الموضوع', 'ghp_short', 'sk-123', 'https://github.com/OMRAN77/omran-ai-builder/commits/main', 'الملف app-09-attach.js']) {
    assert.equal(redactSecrets(plain), plain, 'نصّ عاديّ لا يُمسّ: ' + plain);
  }
  const msgs = [
    { role: 'system', content: 'S' },
    { role: 'user', content: 'توكن: ' + GH_TOK },
    { role: 'user', content: [{ type: 'text', text: 'اقرأ ' + GH_TOK }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }] },
    null,
  ];
  const red = redactMessages(msgs);
  assert.equal(red[0], msgs[0], 'رسالة بلا سرّ تعود بالمرجع نفسه');
  assert.ok(!red[1].content.includes(GH_TOK) && msgs[1].content.includes(GH_TOK), 'نسخة جديدة لا تعديل في المكان');
  assert.ok(!red[2].content[0].text.includes(GH_TOK));
  assert.equal(red[2].content[1], msgs[2].content[1], 'كتلة الصورة كما هي');
  assert.equal(red[3], null);
  assert.equal(redactMessages(undefined), undefined);
});

test('source guards: server redacts on both handlers, client intercepts pasted tokens, owner-only vault UI, agent knows commits and the vault', () => {
  const chat = read('api/_lib/chat.js'); const agent = read('api/_lib/agent.js');
  assert.ok(chat.includes('const messages = redactMessages(body.messages);'), 'chat.js');
  assert.ok(agent.includes('const messages = redactMessages(body.messages);'), 'agent.js');
  assert.ok(agent.includes("what: { type: 'string', enum: ['auto', 'commits']") && agent.includes('25-و. الأسرار'), 'أداة الوكيل وقاعدته');
  assert.ok(read('api/system.js').includes("case 'secrets': return require('./_lib/secrets.js');"), 'المسار');
  const attach = read('js/app-09-attach.js');
  assert.ok(attach.includes("window.omranVaultStore('github_token', __gh)") && attach.includes("text = text.replace(__secRe,"), 'اعتراض اللصق في العميل');
  assert.ok(read('js/partials-settings.js').includes('id="vaultSectionWrap"') && read('js/partials-settings.js').includes('type="password" id="vaultGhInput"'), 'قسم الخزنة (حقل كلمة سرّ)');
  assert.ok(read('js/app-01-boot-auth.js').includes("__vw.style.display = isAdminUI ? '' : 'none';"), 'يظهر للمالك وحده');
  assert.ok(read('js/app-05-ui.js').includes("'vaultSection','adminSection'"), 'القسم مسجَّل');
  assert.ok(read('js/app-28-vault.js').includes('window.omranVaultStore = function'), 'الجزء الجديد');
  assert.ok(read('.env.example').includes('SECRETS_KEY'), 'موثّق في البيئة');
  const gw = read('api/_lib/github-write.js');
  assert.ok(gw.includes('if (!(await resolveGithubToken(o)))'), 'الرفع يأخذ المفتاح من البيئة أو الخزنة');
});
