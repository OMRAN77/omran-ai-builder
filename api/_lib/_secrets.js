// api/_lib/_secrets.js — single source of truth for server secrets.
//
// Previously every module carried its own copy of:
//     process.env.AUTH_SECRET || 'fallback-dev-secret-change-me'
// across 10+ files. That default is published with the source, so any
// deployment missing the env var accepted forged session tokens for ANY
// user — including the owner account, which grants the admin endpoints.
//
// These getters throw instead. A function that returns 500 with a clear log
// line is recoverable in minutes; one that quietly runs on a publicly known
// signing key is not recoverable at all.
function requireSecret(name, howTo) {
  const value = (process.env[name] || '').trim();
  if (!value) {
    throw new Error(
      `[config] المتغير ${name} غير مضبوط — الخادم متوقف عمدًا حتى تضبطه. ` +
        `${name} is not set; refusing to start. ${howTo}`
    );
  }
  return value;
}

const GENERATE_HINT =
  'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))" ' +
  'then add it in Vercel → Settings → Environment Variables.';

module.exports = {
  // Signs every session token. Rotating it logs everyone out — that is expected.
  get AUTH_SECRET() {
    return requireSecret('AUTH_SECRET', GENERATE_HINT);
  },
  // Guards the health + client-error log endpoints (they expose user URLs,
  // user agents and stack traces).
  get MONITOR_KEY() {
    return requireSecret('MONITOR_KEY', GENERATE_HINT);
  },
};
