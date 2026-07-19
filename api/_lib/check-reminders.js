// Vercel Cron target (runs every minute, see vercel.json "crons"). Scans every
// user's reminders blob, figures out which ones are due THIS minute, sends a
// real Web Push notification (wakes the device even if the app is closed),
// and updates/retires each reminder appropriately:
//   - "once"  reminders fire exactly once then get removed.
//   - "daily" reminders fire every day at the given hour/minute (local to the
//              user's last-known timezone offset stored at creation time).
//   - "prayer" reminders resolve the prayer time for today via the free
//              Aladhan API (cached once per calendar day per reminder) using
//              the user's last-known device coordinates, offset by N minutes.
const webpush = require('web-push');

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const BLOB_BASE = 'https://blob.vercel-storage.com';
const STORE_ID = process.env.BLOB_STORE_ID || '6tfgxvttzyoiavtu';
const PUBLIC_BASE = 'https://' + STORE_ID + '.public.blob.vercel-storage.com/';

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:ommntr77@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE);
}

async function listBlobs(prefix) {
  const out = [];
  let cursor;
  do {
    const url = new URL(BLOB_BASE + '/');
    url.searchParams.set('prefix', prefix);
    url.searchParams.set('limit', '1000');
    if (cursor) url.searchParams.set('cursor', cursor);
    const r = await fetch(url.toString(), { headers: { Authorization: 'Bearer ' + BLOB_TOKEN } });
    if (!r.ok) break;
    const data = await r.json();
    out.push(...(data.blobs || []));
    cursor = data.hasMore ? data.cursor : null;
  } while (cursor);
  return out;
}

async function getJson(pathname) {
  try {
    const res = await fetch(PUBLIC_BASE + pathname + '?_=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function putJson(pathname, value) {
  await fetch(BLOB_BASE + '/' + pathname, {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer ' + BLOB_TOKEN,
      'x-content-type': 'application/json',
      'x-add-random-suffix': '0',
    },
    body: JSON.stringify(value),
  });
}

function todayStr(d) { return d.toISOString().slice(0, 10); }

async function fetchPrayerTimeMs(lat, lng, prayerName, dateStr) {
  try {
    const url = `https://api.aladhan.com/v1/timings/${dateStr}?latitude=${lat}&longitude=${lng}&method=2`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    const timings = data && data.data && data.data.timings;
    if (!timings || !timings[prayerName]) return null;
    // timings look like "15:42" in the location's local time; the API also
    // gives us the UTC offset via data.data.meta.timezone - simplest robust
    // approach is to ask for the Gregorian date's timestamp back from the
    // same endpoint (data.data.date.timestamp is midnight UTC for that date),
    // so combine that with the timezone offset via Intl instead of guessing.
    const [hh, mm] = timings[prayerName].split(':').map((n) => parseInt(n, 10));
    // Build the local wall-clock time in the location's IANA timezone using
    // the tz name Aladhan returns, then convert to a real UTC instant.
    const tz = data.data.meta && data.data.meta.timezone;
    const [y, mo, da] = dateStr.split('-').map((n) => parseInt(n, 10));
    if (tz) {
      // Compute the UTC instant that displays as hh:mm on da/mo/y in tz, by
      // bisecting against Intl (avoids needing a timezone-database library).
      let guess = Date.UTC(y, mo - 1, da, hh, mm);
      for (let i = 0; i < 3; i++) {
        const fmt = new Intl.DateTimeFormat('en-US', {
          timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
        }).formatToParts(new Date(guess));
        const parts = {};
        fmt.forEach((p) => { parts[p.type] = p.value; });
        const shown = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour === 24 ? 0 : +parts.hour, +parts.minute);
        const target = Date.UTC(y, mo - 1, da, hh, mm);
        const diff = target - shown;
        guess += diff;
        if (diff === 0) break;
      }
      return guess;
    }
    return Date.UTC(y, mo - 1, da, hh, mm);
  } catch (e) {
    return null;
  }
}

module.exports = async (req, res) => {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) { res.status(200).json({ ok: false, reason: 'no vapid keys configured' }); return; }

  const now = new Date();
  const nowMs = now.getTime();
  const today = todayStr(now);

  const userBlobs = await listBlobs('db/reminders/');
  let sent = 0;

  for (const blob of userBlobs) {
    const pathname = blob.pathname;
    const usernameMatch = pathname.match(/^db\/reminders\/(.+)\.json$/);
    if (!usernameMatch) continue;
    const username = decodeURIComponent(usernameMatch[1]);

    const list = await getJson(pathname);
    if (!Array.isArray(list) || !list.length) continue;

    const sub = await getJson('db/push-subs/' + encodeURIComponent(username) + '.json');
    if (!sub || !sub.endpoint) continue;

    let changed = false;
    const nextList = [];

    for (const r of list) {
      if (r.active === false) { changed = true; continue; }
      let dueNow = false;

      if (r.type === 'once') {
        const t = Date.parse(r.timeISO);
        if (!isNaN(t) && nowMs >= t && nowMs - t < 90000) dueNow = true;
        if (!isNaN(t) && nowMs - t >= 90000) { changed = true; continue; } // missed window, drop silently
      } else if (r.type === 'daily') {
        if (r.lastSentDate !== today) {
          const nowH = now.getUTCHours(), nowM = now.getUTCMinutes();
          // hour/minute were captured from the client's local wall clock at
          // creation time and stored as UTC-equivalent hour/minute directly.
          if (nowH === r.hour && nowM === r.minute) dueNow = true;
        }
      } else if (r.type === 'prayer') {
        if (r.cachedDate !== today) {
          const targetMs = await fetchPrayerTimeMs(r.lat, r.lng, r.prayerName, today);
          if (targetMs != null) {
            r.cachedDate = today;
            r.cachedTargetMs = targetMs - (r.offsetMinutes || 0) * 60000;
            changed = true;
          }
        }
        if (r.cachedTargetMs && r.lastSentDate !== today && nowMs >= r.cachedTargetMs && nowMs - r.cachedTargetMs < 90000) {
          dueNow = true;
        }
      }

      if (dueNow) {
        try {
          await webpush.sendNotification(sub, JSON.stringify({
            title: 'مها',
            body: r.message || 'تذكير',
          }));
          sent++;
        } catch (e) {
          // subscription likely expired/invalid; leave reminder as-is, just skip this send
        }
        changed = true;
        if (r.type === 'once') { continue; } // drop after firing
        r.lastSentDate = today;
      }

      nextList.push(r);
    }

    if (changed) await putJson(pathname, nextList);
  }

  res.status(200).json({ ok: true, sent });
};
