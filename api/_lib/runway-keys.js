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

function lastTaskPath(index) {
  return 'db/runway-last-task-' + index + '.json';
}

async function getLastTask(index) {
  try {
    const data = await kvGetJSON(lastTaskPath(index));
    return data && data.id ? data.id : null;
  } catch (e) {
    return null;
  }
}

async function saveLastTask(index, taskId) {
  if (!process.env.UPSTASH_REDIS_REST_URL) return;
  try {
    await kvPutJSON(lastTaskPath(index), { id: taskId });
  } catch (e) {
    // best-effort only
  }
}

// Checks the previously-remembered task for this key; if it exists and is
// not yet finished (SUCCEEDED/FAILED), cancels it on Runway so the account's
// single concurrency slot is freed up for the new request about to start.
async function clearStuckTask(index, apiKey) {
  const prevId = await getLastTask(index);
  if (!prevId) return;
  try {
    const r = await fetch('https://api.dev.runwayml.com/v1/tasks/' + prevId, {
      headers: { Authorization: 'Bearer ' + apiKey, 'X-Runway-Version': RUNWAY_VERSION },
    });
    if (!r.ok) return; // already gone/expired
    const data = await r.json().catch(() => ({}));
    if (data.status === 'SUCCEEDED' || data.status === 'FAILED') return;
    // Still pending/running/throttled: cancel it to free the concurrency slot.
    await fetch('https://api.dev.runwayml.com/v1/tasks/' + prevId, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + apiKey, 'X-Runway-Version': RUNWAY_VERSION },
    }).catch(() => {});
  } catch (e) {
    // best-effort only
  }
}

module.exports = { getKeys, pickKey, encodeTaskId, resolveTaskId, getLastTask, saveLastTask, clearStuckTask };
