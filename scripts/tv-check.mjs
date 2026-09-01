/* فاحص قنوات التلفزيون — يشتغل على GitHub Actions (يوتيوب متاح هناك).
 * لكل معرّف قناة في app-25-tv.js:
 *   ١) هل القناة موجودة؟ (حل @handle إلى UC...)
 *   ٢) هل تبث حيًّا الآن؟ (صفحة /live)
 * النتيجة tv-status.json في جذر المشروع — يقدّمها Vercel للعميل الذي
 * يخفي الميت ويعلّم الحيّ. البند «شراء سمك في البحر» انتهى هنا.
 */
import { readFile, writeFile } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const HEADERS = {
  'User-Agent': UA,
  'Accept-Language': 'en',
  // تجاوز جدار الموافقة الأوروبي إن ظهر
  Cookie: 'CONSENT=YES+1; SOCS=CAI',
};

const src = await readFile('js/app-25-tv.js', 'utf8');
const handles = [...new Set([...src.matchAll(/h:\s*'([A-Za-z0-9_.\-]+)'/g)].map((m) => m[1]))];
console.log('فحص ' + handles.length + ' معرّف قناة...');

const channels = {};
let okCount = 0, liveCount = 0;

for (const h of handles) {
  const entry = { ok: false, live: false };
  try {
    const r = await fetch('https://www.youtube.com/@' + encodeURIComponent(h), {
      headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(15000),
    });
    if (r.ok) {
      const html = await r.text();
      const m = html.match(/"channelId":"(UC[\w-]{22})"/);
      if (m) {
        entry.ok = true;
        entry.id = m[1];
        okCount++;
        try {
          const lr = await fetch('https://www.youtube.com/channel/' + m[1] + '/live', {
            headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(15000),
          });
          const lh = await lr.text();
          if (/"isLive"\s*:\s*true|"isLiveNow"\s*:\s*true/.test(lh)
              && !/"status"\s*:\s*"LIVE_STREAM_OFFLINE"/.test(lh)) {
            entry.live = true;
            liveCount++;
          }
        } catch { /* فحص الحيّ رفاهية — القناة تبقى ok */ }
      }
    }
  } catch { /* شبكة — تبقى ok:false وتُعاد غدًا */ }
  channels[h] = entry;
  console.log((entry.live ? '🔴 ' : entry.ok ? '✅ ' : '❌ ') + h + (entry.id ? ' ' + entry.id : ''));
  await new Promise((res) => setTimeout(res, 250));
}

const out = {
  checkedAt: new Date().toISOString(),
  counts: { total: handles.length, ok: okCount, live: liveCount },
  channels,
};
await writeFile('tv-status.json', JSON.stringify(out, null, 1) + '\n');
console.log('\nالخلاصة: ' + okCount + '/' + handles.length + ' موجودة، منها ' + liveCount + ' تبث حيًّا الآن.');
