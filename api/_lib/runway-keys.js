// Shared helper: the site supports up to 3 Runway API keys (owner's own
// accounts) so multiple users can generate videos at the same time without
// waiting in Runway's per-account queue (Runway allows only 1 concurrent
// video per API key). Requests are distributed randomly across whichever
// keys are configured. The chosen key's index is embedded as a prefix on
// the task id returned to the client (e.g. "1:abcd-1234") so that later
// status/upscale calls for that same task use the SAME key that created it.

function getKeys() {
  const keys = [];
  if (process.env.RUNWAY_API_KEY) keys.push(process.env.RUNWAY_API_KEY);
  if (process.env.RUNWAY_API_KEY_2) keys.push(process.env.RUNWAY_API_KEY_2);
  if (process.env.RUNWAY_API_KEY_3) keys.push(process.env.RUNWAY_API_KEY_3);
  return keys;
}

// Pick a random configured key. Returns { index, key } or null if none configured.
function pickKey() {
  const keys = getKeys();
  if (keys.length === 0) return null;
  const index = Math.floor(Math.random() * keys.length);
  return { index, key: keys[index] };
}

// Encode the key index into the task id we hand back to the client.
function encodeTaskId(index, rawId) {
  return index + ':' + rawId;
}

// Given a client-supplied id (possibly "N:rawId" or a bare legacy id),
// return { key, rawId }. Falls back to the first configured key for
// legacy ids with no prefix (backward compatible with tasks created
// before multi-key support).
function resolveTaskId(id) {
  const keys = getKeys();
  const str = String(id || '');
  const m = str.match(/^(\d+):(.+)$/);
  if (m) {
    const idx = parseInt(m[1], 10);
    const key = keys[idx] || keys[0] || null;
    return { key, rawId: m[2] };
  }
  return { key: keys[0] || null, rawId: str };
}

// --- Stuck-task auto-cleanup -------------------------------------------
// Runway allows only 1 concurrent generation per API key/account. If a
// previous task from this key is left RUNNING/THROTTLED (e.g. the caller
// never polled it to completion, or a request failed client-side after
// Runway already accepted it), every new request on that same key gets
// stuck in THROTTLED forever. We remember the last task id we started per
// key (in Redis) and, before starting a new one, check + cancel it
// if it is not already finished.
const { kvGetJSON, kvPutJSON } = require('./kv.js');
const RUNWAY_VERSION = '2024-11-06';
// v-runway-host: المرجع الوحيد لعنوان Runway. مفاتيح الـAPI العامة تخدمها
// api.dev.runwayml.com حصرًا — النداء على api.runwayml.com يرجع
// «Incorrect hostname for API key» (حدث فعلًا في الإنتاج). قابل للتغيير
// من البيئة احتياطًا لو بدّلت Runway العنوان مجددًا.
const RUNWAY_API_BASE = (process.env.RUNWAY_API_BASE || 'https://api.dev.runwayml.com').replace(/\/+$/, '');

function lastTaskPath(index) {
  return 'db/runway-last-task-' + index + '.json';
}

/* v-ai-video-speed (مراجعة): السجلّ { id: آخر مهمّة، hold: أقدم مهمّة حيّة لم تنتهِ بعد } — بلا hold كانت المهمّة العالقة فعلًا تُنسى
   حين تأتي بعدها مهمّة خلال ربع ساعة (تُكتب فوقها)، فيبقى المفتاح مسدودًا ما دام عليه طلب. */
async function readSlot(index) {
  try { return (await kvGetJSON(lastTaskPath(index))) || {}; } catch (e) { return {}; }
}

async function getLastTask(index) {
  const data = await readSlot(index);
  return data && data.id ? data.id : null;
}

async function saveLastTask(index, taskId) {
  if (!process.env.UPSTASH_REDIS_REST_URL) return;
  try {
    const prev = await readSlot(index);
    await kvPutJSON(lastTaskPath(index), Object.assign({ id: taskId }, prev.hold ? { hold: prev.hold } : {}));
  } catch (e) {
    // best-effort only
  }
}

// Checks the previously-remembered task for this key; if it exists and is
// not yet finished (SUCCEEDED/FAILED), cancels it on Runway so the account's
// single concurrency slot is freed up for the new request about to start.
/* v-ai-video-speed (المالك ١٦ أكتوبر: «طول كثير»): المفتاح مشترك بين المستخدمين، و«آخر مهمّة» عليه قد تكون فيديو مستخدم آخر
   يتولّد الآن — كان يُلغى فيبقى صاحبه ينتظر حتّى حارس الربع ساعة ثمّ يُعاد من الصفر. يُلغى الآن العالق فعلًا وحده: عمره فوق
   STUCK_MS (عمر حارس الاستطلاع عند العميل؛ بعده لا أحد ينتظره). الحيّ يبقى، والجديد ينتظر دوره في طابور المزوّد (THROTTLED). */
const STUCK_MS = 15 * 60 * 1000;
// 'done' انتهت أو اختفت · 'stuck' لم تنتهِ وعمرها فوق STUCK_MS · 'live' تتولّد الآن أو عمرها مجهول (لا تُلغى)
async function taskState(id, apiKey) {
  try {
    const r = await fetch(RUNWAY_API_BASE + '/v1/tasks/' + id, {
      headers: { Authorization: 'Bearer ' + apiKey, 'X-Runway-Version': RUNWAY_VERSION },
    });
    if (!r.ok) return 'done'; // already gone/expired
    const data = await r.json().catch(() => ({}));
    if (data.status === 'SUCCEEDED' || data.status === 'FAILED' || data.status === 'CANCELLED') return 'done';
    const age = Date.now() - Date.parse(data.createdAt || '');
    return age > STUCK_MS ? 'stuck' : 'live';
  } catch (e) {
    return 'live'; // best-effort only — لا يُلغى ما لم نره
  }
}
async function clearStuckTask(index, apiKey) {
  const slot = await readSlot(index);
  const ids = [...new Set([slot.hold, slot.id].filter(Boolean))];
  if (!ids.length) return;
  const states = await Promise.all(ids.map((id) => taskState(id, apiKey)));
  // Still pending/running/throttled past STUCK_MS: cancel it to free the concurrency slot.
  await Promise.all(ids.map((id, i) => (states[i] !== 'stuck' ? null : fetch(RUNWAY_API_BASE + '/v1/tasks/' + id, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + apiKey, 'X-Runway-Version': RUNWAY_VERSION },
  }).catch(() => {}))));
  // hold = أقدم حيّة نراقبها حتّى تنتهي — العالقة لا تضيع حين تُكتب مهمّة جديدة فوق id
  const live = (id) => ids.indexOf(id) >= 0 && states[ids.indexOf(id)] === 'live';
  const hold = live(slot.hold) ? slot.hold : (live(slot.id) ? slot.id : null);
  if ((hold || null) !== (slot.hold || null) && process.env.UPSTASH_REDIS_REST_URL) {
    try { await kvPutJSON(lastTaskPath(index), Object.assign({ id: slot.id }, hold ? { hold } : {})); } catch (e) { /* guard-ok — أفضل جهد */ }
  }
}

module.exports = { getKeys, pickKey, encodeTaskId, resolveTaskId, getLastTask, saveLastTask, clearStuckTask, RUNWAY_API_BASE, STUCK_MS };
