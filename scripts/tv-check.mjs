/* فاحص + مصلّح قنوات التلفزيون — يشتغل على GitHub Actions.
 * لكل قناة في app-25-tv.js:
 *   ١) حل @handle إلى UC مباشرة.
 *   ٢) فشل الحل؟ يبحث عن القناة باسمها في يوتيوب (فلتر قنوات) ويأخذ
 *      أول نتيجة — إصلاح تلقائي للمعرّفات الخاطئة.
 *   ٣) فحص البث الحي عبر صفحة /live.
 * النتيجة tv-status.json: العميل يستعمل المعرّف المُصحّح ويخفي ما لم يُحل.
 */
import { readFile, writeFile } from 'node:fs/promises';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'en',
  Cookie: 'CONSENT=YES+1; SOCS=CAI',
};

const ID_RE = /"channelId":"(UC[\w-]{22})"/;

async function page(url) {
  const r = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(15000) });
  return { status: r.status, html: r.ok ? await r.text() : '' };
}

async function byHandle(h) {
  const { status, html } = await page('https://www.youtube.com/@' + encodeURIComponent(h) + '/live');
  const m = html.match(ID_RE);
  return { id: m ? m[1] : null, status, len: html.length };
}

async function bySearch(name) {
  // sp=EgIQAg== فلتر «قنوات فقط»
  const q = encodeURIComponent(name);
  const { html } = await page('https://www.youtube.com/results?search_query=' + q + '&sp=EgIQAg%253D%253D');
  const m = html.match(ID_RE);
  return m ? m[1] : null;
}

/* v661: كائن البثّ الحقيقي — لا أوّل مقطع في الصفحة */
function playerResponse(html) {
  const i = html.indexOf('ytInitialPlayerResponse');
  if (i < 0) return null;
  const s = html.indexOf('{', i);
  if (s < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let j = s; j < html.length; j++) {
    const ch = html[j];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (!depth) { try { return JSON.parse(html.slice(s, j + 1)); } catch { return null; } }
    }
  }
  return null;
}

async function liveInfo(id) {
  try {
    const { html } = await page('https://www.youtube.com/channel/' + id + '/live');
    const pr = playerResponse(html);
    const vd = (pr && pr.videoDetails) || {};
    const ps = (pr && pr.playabilityStatus) || {};
    if (vd.isLive !== true || ps.status !== 'OK' || !vd.videoId) return { live: false };
    return {
      live: true,
      vid: vd.videoId,
      embeddable: ps.playableInEmbed !== false,
      title: (vd.title || '').slice(0, 120),
    };
  } catch { return { live: false }; }
}

const src = await readFile('js/app-25-tv.js', 'utf8');
// أزواج الاسم/المعرّف — الاسم يُستعمل للبحث عند فشل المعرّف
const entries = [...src.matchAll(/\{\s*n:\s*'([^']+)',\s*h:\s*'([A-Za-z0-9_.\-]+)'/g)]
  .map((m) => ({ name: m[1], h: m[2] }));
const seen = new Set();
const list = entries.filter((e) => !seen.has(e.h) && seen.add(e.h));
console.log('فحص ' + list.length + ' قناة...');

let prev = {};
try { prev = JSON.parse(await readFile('tv-status.json', 'utf8')).channels || {}; } catch { prev = {}; }

const channels = {};
let okCount = 0, liveCount = 0, repaired = 0;

for (const { name, h } of list) {
  const entry = { ok: false, live: false };
  try {
    const direct = await byHandle(h);
    if (direct.id) {
      entry.id = direct.id;
      entry.ok = true;
    } else {
      // اسم البحث بلا لاحقة اللغة «(أردو)» ونحوها
      const cleanName = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
      const found = await bySearch(cleanName + ' tv');
      if (found) {
        entry.id = found;
        entry.ok = true;
        entry.via = 'search';
        repaired++;
      } else {
        entry.status = direct.status;
      }
    }
    if (entry.ok) {
      okCount++;
      const li = await liveInfo(entry.id);
      entry.live = li.live;
      if (li.live) {
        liveCount++;
        if (li.vid) entry.vid = li.vid;
        entry.embeddable = li.embeddable;
      }
    }
  } catch { /* شبكة — تُعاد غدًا */ }
  const before = prev[h] || {};
  if (entry.live) entry.lastLive = new Date().toISOString();
  else if (before.lastLive) entry.lastLive = before.lastLive;
  channels[h] = entry;
  console.log((entry.live ? '🔴 ' : entry.ok ? '✅ ' : '❌ ')
    + h + (entry.via ? ' (بحث)' : '') + (entry.id ? ' ' + entry.id : ' status=' + (entry.status || '?')));
  await new Promise((res) => setTimeout(res, 120));
}

const out = {
  checkedAt: new Date().toISOString(),
  counts: { total: list.length, ok: okCount, live: liveCount, repaired },
  channels,
};
await writeFile('tv-status.json', JSON.stringify(out) + '\n');
console.log('\nالخلاصة: ' + okCount + '/' + list.length + ' محلولة (منها ' + repaired + ' أُصلحت بالبحث)، ' + liveCount + ' حية الآن.');
