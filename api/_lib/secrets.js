// api/_lib/secrets.js — v-secret-vault: خزنة أسرار مشفّرة للمالك.
//
// طلب المالك ١٣ سبتمبر: «حقل خاصّ مشفّر لحفظ الأسرار — مكان تخزين آمن (Secret) —
// بدل كتابته كنصّ خام بالمحادثة». القاعدة الثابتة: السرّ لا يُكتب في المحادثة ولا يصل
// النموذج ولا يُحفظ في سجلّ المشاريع. المالك يحفظه من الإعدادات، ويقرأه الخادم وحده.
//
//   • التشفير AES-256-GCM بمفتاح مشتقّ (SHA-256) من SECRETS_KEY في البيئة، وإن غاب
//     فمن AUTH_SECRET (المطلوب أصلًا لتوقيع الجلسات). بلا أيّهما الخزنة معطّلة عمدًا.
//   • التخزين في KV تحت db/secrets/vault.json: {name: {v, iv, tag, data, hint, updatedAt}}
//     — hint آخر ٤ حروف للعرض فقط.
//   • الواجهة (POST /api/system?action=secrets، للمالك وحده عبر isOwner): status · set ·
//     clear · test. لا عمليّة تعيد القيمة أبدًا.
//   • المستهلك: مفتاح GitHub لأدوات الوكيل ومحلّل الكود — البيئة أوّلًا (GITHUB_TOKEN)
//     ثمّ الخزنة (github-read.js → resolveGithubToken).
'use strict';

const crypto = require('crypto');

const VAULT_PATH = 'db/secrets/vault.json';
const CACHE_MS = 30000;
const NAMES = {
  github_token: { label: 'GitHub', re: /^[A-Za-z0-9_\-]{20,400}$/ },
};

function keyMaterial(env) {
  const e = env || process.env;
  const own = String(e.SECRETS_KEY || '').trim();
  if (own) return own;
  const auth = String(e.AUTH_SECRET || '').trim();
  return auth || '';
}
function masterKey(env) {
  const raw = keyMaterial(env);
  if (!raw) return null;
  return crypto.createHash('sha256').update('omran-vault:' + raw).digest();
}
function configured(env) { return !!masterKey(env); }

function encrypt(plain, env) {
  const key = masterKey(env);
  if (!key) throw new Error('vault_not_configured');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
}
function decrypt(rec, env) {
  const key = masterKey(env);
  if (!key || !rec || !rec.iv || !rec.tag || !rec.data) return '';
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(rec.iv, 'base64'));
  d.setAuthTag(Buffer.from(rec.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(rec.data, 'base64')), d.final()]).toString('utf8');
}

function kvOf(o) {
  if (o && o.kv) return o.kv;
  const kv = require('./kv.js');
  return { get: kv.kvGetJSON, put: kv.kvPutJSON };
}

let cache = { at: 0, vault: null };
function resetCache() { cache = { at: 0, vault: null }; }
async function loadVault(o) {
  const now = Date.now();
  if (!(o && o.kv) && cache.vault && now - cache.at < CACHE_MS) return cache.vault;
  let v = null;
  try { v = await kvOf(o).get(VAULT_PATH); } catch (e) { v = null; }
  v = v && typeof v === 'object' ? v : {};
  if (!(o && o.kv)) cache = { at: now, vault: v };
  return v;
}
async function saveVault(vault, o) {
  await kvOf(o).put(VAULT_PATH, vault);
  resetCache();
}

/** القيمة الصريحة لاستهلاك الخادم فقط — تعود '' عند الغياب أو أيّ عطل، ولا ترمي أبدًا. */
async function getSecret(name, o) {
  try {
    if (!NAMES[name]) return '';
    const vault = await loadVault(o);
    const rec = vault[name];
    if (!rec) return '';
    return decrypt(rec, o && o.env);
  } catch (e) { return ''; }
}

function hintOf(value) { const s = String(value); return s.length >= 4 ? s.slice(-4) : ''; }

async function setSecret(name, value, o) {
  const spec = NAMES[name];
  if (!spec) return { error: 'unknown_secret' };
  const v = String(value == null ? '' : value).trim();
  if (!spec.re.test(v)) return { error: 'bad_value' };
  if (!configured(o && o.env)) return { error: 'vault_not_configured' };
  const vault = await loadVault(o);
  vault[name] = Object.assign(encrypt(v, o && o.env), { hint: hintOf(v), updatedAt: Date.now() });
  await saveVault(vault, o);
  return { ok: true };
}
async function clearSecret(name, o) {
  if (!NAMES[name]) return { error: 'unknown_secret' };
  const vault = await loadVault(o);
  delete vault[name];
  await saveVault(vault, o);
  return { ok: true };
}
/** حالة العرض: هل محفوظ، وآخر ٤ حروف، ومتى — بلا القيمة أبدًا. */
async function vaultStatus(o) {
  const vault = await loadVault(o);
  const items = {};
  for (const name of Object.keys(NAMES)) {
    const rec = vault[name];
    items[name] = rec ? { set: true, hint: String(rec.hint || ''), updatedAt: rec.updatedAt || null } : { set: false, hint: '', updatedAt: null };
  }
  return { configured: configured(o && o.env), items };
}

/* ---------- فحص مفتاح GitHub بلا كشفه ---------- */
async function testGithub(repo, o) {
  const tok = await getSecret('github_token', o);
  if (!tok) return { ok: false, error: 'لا مفتاح GitHub محفوظ في الخزنة.' };
  const gh = require('./github-read.js');
  const t = gh.parseTarget({ url: String(repo || '').trim() || 'OMRAN77/omran-ai-builder' });
  if (!t) return { ok: false, error: 'صيغة المستودع: owner/repo' };
  const env = { GITHUB_TOKEN: tok };
  const net = Object.assign({ env }, o && o.net ? o.net : {});
  const u = await gh.ghFetch('/user', net);
  if (u.status === 401) return { ok: false, error: 'المفتاح مرفوض من GitHub (401) — غير صالح أو منتهٍ.' };
  let login = '';
  try { const uj = await u.json(); login = (uj && uj.login) || ''; } catch (e) { login = ''; }
  const r = await gh.ghFetch('/repos/' + t.owner + '/' + t.repo, net);
  let perms = null;
  try { const rj = await r.json(); perms = (rj && rj.permissions) || null; } catch (e) { perms = null; }
  const rate = r.headers && typeof r.headers.get === 'function' ? (r.headers.get('x-ratelimit-limit') || '') : '';
  return {
    ok: true, login, repo: t.owner + '/' + t.repo,
    readable: !!r.ok,
    writable: !!(r.ok && perms && (perms.push || perms.admin || perms.maintain)),
    rateLimit: rate ? (rate + '/ساعة') : '',
  };
}

/* ---------- الواجهة (للمالك وحده) ---------- */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
  const { isOwner } = require('./_owner.js');
  if (!isOwner(req)) { res.status(401).json({ error: 'unauthorized' }); return; }
  let body = req.body;
  if (!body || typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; } }
  const op = String((body && body.op) || 'status');
  const name = String((body && body.name) || 'github_token');
  try {
    if (op === 'status') { res.status(200).json(Object.assign({ ok: true }, await vaultStatus())); return; }
    if (op === 'set') {
      const r = await setSecret(name, body.value);
      if (r.error) { res.status(r.error === 'vault_not_configured' ? 500 : 400).json({ ok: false, error: r.error }); return; }
      res.status(200).json(Object.assign({ ok: true }, await vaultStatus())); return;
    }
    if (op === 'clear') {
      const r = await clearSecret(name);
      if (r.error) { res.status(400).json({ ok: false, error: r.error }); return; }
      res.status(200).json(Object.assign({ ok: true }, await vaultStatus())); return;
    }
    if (op === 'test') { res.status(200).json(await testGithub(body.repo)); return; }
    res.status(400).json({ ok: false, error: 'unknown_op' });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'vault_failed' });
  }
};

module.exports.getSecret = getSecret;
module.exports.setSecret = setSecret;
module.exports.clearSecret = clearSecret;
module.exports.vaultStatus = vaultStatus;
module.exports.testGithub = testGithub;
module.exports.configured = configured;
module.exports.resetCache = resetCache;
module.exports.NAMES = NAMES;
module.exports.VAULT_PATH = VAULT_PATH;
module.exports.__test = { encrypt, decrypt, masterKey };
