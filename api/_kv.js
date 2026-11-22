// عميل Redis صغير (Upstash REST) لدالّتَي هذا المشروع. الأسرار تُقرأ داخل النداء لا عند تحميل الملفّ.
//   UPSTASH_REDIS_REST_URL   مثل https://xxxx.upstash.io
//   UPSTASH_REDIS_REST_TOKEN
// بلا هذين المتغيّرين اللعب الفرديّ يعمل كاملًا؛ الغرف والملاحظات تردّ «store».
async function command(args, path = '') {
  const url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('store not configured');
  const res = await fetch(url.replace(/\/$/, '') + path, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const data = await res.json().catch(() => null);
  if (!res.ok || data == null) throw new Error('store error ' + res.status);
  return data;
}
const one = async (args) => { const d = await command(args); return d && 'result' in d ? d.result : null; };

module.exports = {
  kvGetRaw: (key) => one(['GET', key]),
  kvSetRaw: (key, value, ttlSec) => one(ttlSec ? ['SET', key, String(value), 'EX', String(Math.max(1, Math.trunc(ttlSec)))] : ['SET', key, String(value)]),
  /** SET only if the key does not exist (with its expiry in the same command). True when this call created it. */
  kvSetIfAbsent: async (key, value, ttlSec) => (await one(['SET', key, String(value), 'NX', ...(ttlSec ? ['EX', String(Math.max(1, Math.trunc(ttlSec)))] : [])])) === 'OK',
  kvIncr: (key) => one(['INCR', key]),
  kvExpire: (key, seconds) => one(['EXPIRE', key, String(Math.max(1, Math.trunc(seconds)))]),
  /** Several commands in one request. Returns their results in order. */
  kvPipeline: async (cmds) => { const d = await command(cmds, '/pipeline'); if (!Array.isArray(d)) throw new Error('store error'); return d.map((x) => (x && 'result' in x ? x.result : null)); },
};
