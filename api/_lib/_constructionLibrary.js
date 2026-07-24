// Shared helper: growing library of saved construction designs (2D plans).
// Each generated design is saved as one JSON file in Vercel Blob so future
// users can browse similar designs (by floors + area range) before paying
// for a brand-new AI generation. Follows the same per-item Blob pattern used
// across this app (auth.js, feedback.js).
const crypto = require('crypto');

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const BLOB_BASE = 'https://blob.vercel-storage.com';
const STORE_ID = process.env.BLOB_STORE_ID || '6tfgxvttzyoiavtu';
const PUBLIC_BASE = 'https://' + STORE_ID + '.public.blob.vercel-storage.com/';

function itemPath(id) { return 'db/construction-library/' + id + '.json'; }

async function putBlob(path, obj) {
  try {
    await fetch(BLOB_BASE + '/' + path, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + BLOB_TOKEN,
        'x-content-type': 'application/json',
        'x-add-random-suffix': '0',
        'x-cache-control-max-age': '0',
      },
      body: JSON.stringify(obj),
    });
  } catch (e) {
    // best-effort only; never break the main request because of this
  }
}

async function saveDesign(entry) {
  if (!BLOB_TOKEN) return null;
  const id = Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex');
  const record = Object.assign({ id, createdAt: Date.now() }, entry);
  await putBlob(itemPath(id), record);
  return id;
}

async function listDesigns({ buildingType, floors, area, limit }) {
  if (!BLOB_TOKEN) return [];
  const out = [];
  let cursor;
  let pages = 0;
  const maxPages = 6;
  do {
    const url = new URL(BLOB_BASE + '/');
    url.searchParams.set('prefix', 'db/construction-library/');
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);
    let listRes;
    try {
      listRes = await fetch(url.toString(), { headers: { Authorization: 'Bearer ' + BLOB_TOKEN } });
    } catch (e) {
      break;
    }
    if (!listRes.ok) break;
    const listData = await listRes.json();
    const blobs = listData.blobs || [];
    for (const b of blobs) {
      try {
        const r = await fetch(b.url + '?_=' + Date.now(), { cache: 'no-store' });
        if (!r.ok) continue;
        const item = await r.json();
        out.push(item);
      } catch (e) {
        // skip unreadable item
      }
    }
    cursor = listData.cursor;
    pages++;
  } while (cursor && pages < maxPages);

  let filtered = out;
  if (buildingType) filtered = filtered.filter((d) => d.buildingType === buildingType);
  if (floors) {
    filtered = filtered.filter((d) => Math.abs(Number(d.floors) - Number(floors)) <= 0.5);
  }
  if (area) {
    const a = Number(area);
    filtered = filtered.filter((d) => d.area && Math.abs(Number(d.area) - a) / a <= 0.35);
  }
  filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return filtered.slice(0, limit || 12);
}

module.exports = { saveDesign, listDesigns };
