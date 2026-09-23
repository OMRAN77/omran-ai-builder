/* فاحص + مصلّح قنوات التلفزيون — يشتغل على GitHub Actions.
 * لكل قناة في app-25-tv.js:
 *   ١) حل @handle إلى UC مباشرة.
 *   ٢) فشل الحل؟ يبحث عن القناة باسمها في يوتيوب (فلتر قنوات) ويأخذ
 *      أول نتيجة — إصلاح تلقائي للمعرّفات الخاطئة.
 *   ٣) فحص البث الحي عبر صفحة /live.
 * النتيجة tv-status.json: العميل يستعمل المعرّف المُصحّح ويخفي ما لم يُحل.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { buildSports, parseEspn, windowMatches, ymd, MATCH_LEAGUES } from './tv-lib.mjs';

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

/* v-tv-hls-check (شكوى المالك: «أكثر القنوات ما تشتغل يحوّل على جوجل»):
 * روابط البث المباشر تُفحص من هنا — وصولًا (#EXTM3U) وCORS للمتصفح: مشغّل
 * المتصفح (hls.js) يحتاج Access-Control-Allow-Origin، وأغلب روابط الفهرس
 * تعمل في تطبيقات التلفزيون لا المتصفح. العميل يعتمد النتيجة: cors:false
 * تُتجاهل على غير سفاري، وok:false تُتجاهل كليًا. */
/* v-tv-deep (المالك ٢٣ سبتمبر: «أكثر القنوات الرياضيّة ما تشتغل»): تشخيص فقط — لا يغيّر ok/cors/geo
 * ولا ما يعرضه العميل. الفهرس قد يمرّ والتشغيل يفشل: نتبع الرابط إلى قائمة الجودة ثمّ أوّل مقطع
 * فيديو (ومفتاح التشفير إن وُجد) ونسجّل CORS في كلّ خطوة، والسبب الأوّل للفشل في deep.why. */
const ORIGIN = 'https://omran-ai-builder.vercel.app';
function corsOk(r) {
  const a = r.headers.get('access-control-allow-origin') || '';
  return a === '*' || a.includes('omran-ai-builder.vercel.app');
}
function nextUri(text, base, tag) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith(tag)) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j].trim();
      if (!l || l.startsWith('#')) continue;
      try { return new URL(l, base).href; } catch { return null; }
    }
  }
  return null;
}
async function hop(url, wantText) {
  const r = await fetch(url, {
    headers: { 'User-Agent': HEADERS['User-Agent'], Origin: ORIGIN },
    redirect: 'follow',
    signal: AbortSignal.timeout(9000),
  });
  const out = { code: r.status, cors: corsOk(r), url: r.url || url, text: '' };
  if (wantText && r.ok) out.text = await r.text();
  else { try { await r.body?.cancel(); } catch { /* الجسم لا يلزم */ } }
  return out;
}
const ok2xx = (c) => c >= 200 && c < 300;
async function deepProbe(text, base) {
  const d = { why: '' };
  try {
    let media = text, mediaUrl = base;
    if (text.includes('#EXT-X-STREAM-INF')) {
      const vu = nextUri(text, base, '#EXT-X-STREAM-INF');
      if (!vu) { d.why = 'no-variant'; return d; }
      const v = await hop(vu, true);
      d.variant = v.code; d.variantCors = v.cors;
      if (!ok2xx(v.code) || !v.text.includes('#EXTM3U')) { d.why = 'variant-dead'; return d; }
      if (!v.cors) { d.why = 'variant-nocors'; return d; }
      media = v.text; mediaUrl = v.url;
    }
    if (/#EXT-X-KEY:[^\n]*METHOD=(SAMPLE-AES|ISO-23001-7)/i.test(media) || /KEYFORMAT="(com\.widevine|com\.microsoft|com\.apple)/i.test(media)) { d.why = 'drm'; return d; }
    if (media.includes('#EXT-X-ENDLIST')) d.ended = true;
    const km = media.match(/#EXT-X-KEY:[^\n]*METHOD=AES-128[^\n]*URI="([^"]+)"/i);
    if (km) {
      const k = await hop(new URL(km[1], mediaUrl).href, false);
      d.key = k.code; d.keyCors = k.cors;
      if (!ok2xx(k.code)) { d.why = 'key-dead'; return d; }
      if (!k.cors) { d.why = 'key-nocors'; return d; }
    }
    const su = nextUri(media, mediaUrl, '#EXTINF');
    if (!su) { d.why = 'no-segments'; return d; }
    const s = await hop(su, false);
    d.seg = s.code; d.segCors = s.cors;
    if (!ok2xx(s.code)) { d.why = 'seg-dead'; return d; }
    if (!s.cors) { d.why = 'seg-nocors'; return d; }
    d.why = d.ended ? 'ended' : 'ok';
  } catch { d.why = d.why || 'timeout'; }
  return d;
}
const deepCounts = {};
let freshSports = [];

const streamsStatus = {};
let mOk = 0, mCors = 0;
try {
  const tvs = JSON.parse(await readFile('tv-streams.json', 'utf8'));
  const urls = new Set();
  Object.values(tvs.byHandle || {}).forEach((v) => (Array.isArray(v) ? v : [v]).forEach((u) => urls.add(u)));
  (tvs.sports || []).forEach((s) => (Array.isArray(s.m) ? s.m : [s.m]).forEach((u) => urls.add(u)));
  /* v-tv-sports-fresh: قائمة الرياضة الطازجة من الفهرس العامّ — روابطها تُفحص مع البقيّة. */
  try {
    const api = async (f) => (await fetch('https://iptv-org.github.io/api/' + f, { signal: AbortSignal.timeout(60000) })).json();
    const [chs, sts, blk] = await Promise.all([api('channels.json'), api('streams.json'), api('blocklist.json')]);
    freshSports = buildSports(chs, sts, blk);
    freshSports.forEach((e) => e.m.forEach((u) => urls.add(u)));
    console.log('قائمة رياضة طازجة: ' + freshSports.length + ' قناة من الفهرس');
  } catch (e) { console.log('قائمة الرياضة الطازجة تخطّت: ' + (e && e.message)); }
  const all = [...urls];
  console.log('\nفحص ' + all.length + ' رابط بث مباشر...');
  const CONC = 12;
  let idx = 0;
  async function worker() {
    while (idx < all.length) {
      const u = all[idx++];
      const st = { ok: false, cors: false };
      try {
        const r = await fetch(u, {
          headers: { 'User-Agent': HEADERS['User-Agent'], Origin: 'https://omran-ai-builder.vercel.app' },
          redirect: 'follow',
          signal: AbortSignal.timeout(9000),
        });
        st.code = r.status;
        if (r.ok) {
          const body = await r.text();
          const head = body.slice(0, 4000);
          st.ok = head.includes('#EXTM3U');
          const acao = r.headers.get('access-control-allow-origin') || '';
          st.cors = acao === '*' || acao.includes('omran-ai-builder.vercel.app');
          if (st.ok) {
            st.deep = await deepProbe(body, r.url || u);
            deepCounts[st.deep.why] = (deepCounts[st.deep.why] || 0) + 1;
          }
        }
        /* v-tv-geo: 403/451 من أمريكا ≠ رابط ميت — قنوات المنطقة (الكأس،
         * الشارقة…) تمنع خارجها وتعمل عند مستخدمينا. تُعلَّم geo ولا تُخفى. */
        if (!st.ok && (r.status === 403 || r.status === 451)) st.geo = true;
      } catch { /* رابط ميت/بطيء — يبقى ok:false */ }
      if (st.ok) mOk++;
      if (st.ok && st.cors) mCors++;
      streamsStatus[u] = st;
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  console.log('روابط شغالة: ' + mOk + ' — منها صالحة للمتصفح (CORS): ' + mCors);
  console.log('الفحص العميق (حتّى أوّل مقطع فيديو): ' + JSON.stringify(deepCounts));
} catch (e) { console.log('فحص الروابط تخطى: ' + (e && e.message)); }

/* v-tv-sports-fresh: لا يُكتب إلّا رابط وصل فهرسه (أو محجوب جغرافيًّا) — العميل يحسم الباقي بـdeep. */
const sportsOut = freshSports
  .map((e) => ({ n: e.n, c: e.c, m: e.m.filter((u) => streamsStatus[u] && (streamsStatus[u].ok || streamsStatus[u].geo)) }))
  .filter((e) => e.m.length);

/* v-tv-matches: جدول مباريات اليوم والغد (UTC) من لوحة ESPN العامّة — لقطة يوميّة، لا نتائج حيّة. */
let matches = [];
try {
  const now = Date.now();
  const days = [ymd(now), ymd(now + 864e5)];
  const got = [];
  for (const lg of MATCH_LEAGUES) {
    for (const d of days) {
      try {
        const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/' + lg + '/scoreboard?dates=' + d, { signal: AbortSignal.timeout(15000) });
        if (!r.ok) { console.log('مباريات ' + lg + ' ' + d + ': ' + r.status); continue; }
        got.push(...parseEspn(await r.json(), lg));
      } catch (e) { console.log('مباريات ' + lg + ' ' + d + ' تخطّت: ' + (e && e.message)); }
    }
  }
  matches = windowMatches(got, now);
  console.log('جدول المباريات: ' + matches.length + ' مباراة');
} catch (e) { console.log('جدول المباريات تخطّى: ' + (e && e.message)); }

const out = {
  checkedAt: new Date().toISOString(),
  counts: { total: list.length, ok: okCount, live: liveCount, repaired, streamsOk: mOk, streamsCors: mCors, streamsDeep: deepCounts, sportsFresh: sportsOut.length, matches: matches.length },
  channels,
  streams: streamsStatus,
  sports: sportsOut,
  matches,
};
await writeFile('tv-status.json', JSON.stringify(out) + '\n');
console.log('\nالخلاصة: ' + okCount + '/' + list.length + ' محلولة (منها ' + repaired + ' أُصلحت بالبحث)، ' + liveCount + ' حية الآن.');
