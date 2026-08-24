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
// stuck in THROTTLED forever.
//
// IMPORTANT: keys are shared between users, so a task that is still running
// most likely belongs to SOMEONE ELSE who is currently waiting for their
// video — cancelling it blindly kills a paying subscriber's generation.
// We therefore only cancel a task that is genuinely stale: older than
// STALE_AFTER_MS. A healthy Runway generation finishes well inside that
// window, so anything still pending past it is abandoned, not active.
const { kvGetJSON, kvPutJSON } = require('./kv.js');
const RUNWAY_VERSION = '2024-11-06';
const STALE_AFTER_MS = 10 * 60 * 1000; // 10 دقائق

function lastTaskPath(index) {
  return 'db/runway-last-task-' + index + '.json';
}

// Returns { id, startedAt } — startAt may be null for legacy records
// written before timestamps were stored.
async function getLastTask(index) {
  try {
    const data = await kvGetJSON(lastTaskPath(index));
    if (!data || !data.id) return null;
    return { id: data.id, startedAt: data.startedAt || null };
  } catch (e) {
    return null;
  }
}

async function saveLastTask(index, taskId) {
  if (!process.env.UPSTASH_REDIS_REST_URL) return;
  try {
    await kvPutJSON(lastTaskPath(index), { id: taskId, startedAt: Date.now() });
  } catch (e) {
    // best-effort only
  }
}

// Parses Runway's own createdAt so legacy records (no local timestamp)
// can still be judged. Returns ms since epoch, or null.
function remoteAge(data) {
  const raw = data && (data.createdAt || data.created_at);
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

// Checks the previously-remembered task for this key. Cancels it ONLY if it
// is both unfinished AND stale — a task still within its normal runtime is
// left alone because another user is probably waiting on it.
async function clearStuckTask(index, apiKey) {
  const prev = await getLastTask(index);
  if (!prev) return;

  try {
    const r = await fetch('https://api.runwayml.com/v1/tasks/' + prev.id, {
      headers: { Authorization: 'Bearer ' + apiKey, 'X-Runway-Version': RUNWAY_VERSION },
    });
    if (!r.ok) return; // already gone/expired
    const data = await r.json().catch(() => ({}));
    if (data.status === 'SUCCEEDED' || data.status === 'FAILED' || data.status === 'CANCELLED') return;

    // Work out how long this task has been alive. Prefer our own timestamp,
    // fall back to Runway's createdAt for records saved before this change.
    const startedAt = prev.startedAt || remoteAge(data);

    // No timestamp available at all: assume it is active and leave it.
    // Worst case the new request queues; that beats killing a live job.
    if (!startedAt) return;

    if (Date.now() - startedAt < STALE_AFTER_MS) return; // still legitimately running

    await fetch('https://api.runwayml.com/v1/tasks/' + prev.id, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + apiKey, 'X-Runway-Version': RUNWAY_VERSION },
    }).catch(() => {});
  } catch (e) {
    // best-effort only
  }
}

module.exports = { getKeys, pickKey, encodeTaskId, resolveTaskId, getLastTask, saveLastTask, clearStuckTask, STALE_AFTER_MS };
