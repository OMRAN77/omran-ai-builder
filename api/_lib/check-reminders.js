// Vercel Cron target (runs every minute, see vercel.json "crons"). Scans every
// user's reminders record, figures out which ones are due THIS minute, sends a
// real Web Push notification (wakes the device even if the app is closed),
// and updates/retires each reminder appropriately:
//   - "once"  reminders fire exactly once then get removed.
//   - "daily" reminders fire every day at the given hour/minute (local to the
//              user's last-known timezone offset stored at creation time).
//   - "prayer" reminders resolve the prayer time for today via the free
//              Aladhan API (cached once per calendar day per reminder) using
//              the user's last-known device coordinates, offset by N minutes.
const webpush = require('web-push');
const { kvList, kvGetJSON, kvPutJSON, kvDel } = require('./kv.js');
const { withRemindersLock, PRAYER_NAMES } = require('./reminders.js');
const { cleanSubscription } = require('./push-subscribe.js');

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:ommntr77@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE);
}

async function getJson(key) {
  return kvGetJSON(key);
}

async function putJson(key, value) {
  await kvPutJSON(key, value);
}

function todayStr(d) { return d.toISOString().slice(0, 10); }
function addDays(dateStr, n) { const d = new Date(dateStr + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return todayStr(d); }

const PRAYER_WINDOW_MS = 10 * 60000;

async function fetchPrayerTimeMs(lat, lng, prayerName, dateStr, method, memo) {
  try {
    const m = Number.isFinite(method) ? method : 4; /* v-prayer-method: نفس طريقة الشاشة (الافتراضي أم القرى) */
    // v-qibla-dir-hijri (تدقيق ١٨–١٩ أكتوبر): aladhan يقرأ DD-MM-YYYY — YYYY-MM-DD كان يجيب عن سنة أخرى (٢٠١٩).
    // dateStr يبقى Y-M-D للحساب أدناه؛ الرابط وحده يُقلب.
    const urlDate = String(dateStr).split('-').reverse().join('-');
    const url = `https://api.aladhan.com/v1/timings/${urlDate}?latitude=${lat}&longitude=${lng}&method=${m}`;
    /* v-audit-mahakv (srv-maha-5): ذاكرة الدورة (memo) — صلوات موقع واحد يومها جلبة واحدة لا جلبة لكلّ تذكير،
       والفشل (مهلة أو عطل) يُحفظ للدورة نفسها فلا يُعاد لكلّ تذكير بعده. */
    let data = memo ? memo.get(url) : undefined;
    if (data === undefined) {
      data = null;
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (r.ok) data = await r.json();
      } catch (e) { data = null; /* عطل الشبكة = فشل يُحفظ للدورة */ }
      if (memo) memo.set(url, data);
    }
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
  // ‏Vercel Cron يرسل Authorization: Bearer CRON_SECRET؛ ونقبل أيضًا مفتاح المراقبة للتشغيل اليدوي.
  // بلا هذا كانت النقطة مفتوحة: أي زائر يشغّل دورة كاملة تمسح كل المستخدمين
  // وترسل إشعاراتهم — استنزاف بلا فائدة، وإزعاج للمستخدمين.
  {
    /* v-audit-mahakv (srv-maha-1): كانت ترويسة User-Agent «vercel-cron» أو x-vercel-cron تكفي — والعميل يكتبهما كما يشاء،
       فتتخطّى المفتاح والقفل معًا (٢٠ طلبًا متوازيًا = ٢٠ إشعارًا لكلّ تذكير مستحقّ). الآن Bearer CRON_SECRET وحده (نمط
       email-sweep)، وكلّ مسار — الكرون والمفتاح والنبضة — يأخذ القفل نفسه فلا تتزامن دورتان. */
    const cronSecret = String(process.env.CRON_SECRET || '').trim();
    const isVercelCron = !!cronSecret && String((req.headers && req.headers.authorization) || '') === 'Bearer ' + cronSecret;
    // v-ext-cron: نقبل مفتاح المراقبة من الرابط (?key=) أو من ترويسة
    // (x-monitor-key أو Authorization: Bearer) — الترويسة أأمن لأنها لا تظهر
    // في سجلّات خدمة الكرون الخارجية (cron-job.org) كما يظهر رابط الاستعلام.
    const hdrKey = req.headers
      ? (req.headers['x-monitor-key'] || String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, ''))
      : '';
    const key = ((req.query && req.query.key) || hdrKey || '').trim();
    const monitor = (process.env.MONITOR_KEY || '').trim();
    // v405 — «نبضة» مدفوعة بحركة المستخدمين: خطة Hobby لا تسمح بكرون كل دقيقة،
    // فالتطبيق المفتوح عند أي مستخدم ينبض كل دقيقة. قفل Redis (55 ثانية) يضمن
    // أن آلاف النبضات المتزامنة تنفّذ دورة واحدة فقط — والمهاجم الذي يستدعيها
    // يدويًا لا يحقق أكثر مما يحققه الكرون المقصود نفسه.
    const isTick = !!(req.query && req.query.tick);
    if (!isVercelCron && !(monitor && key === monitor) && !isTick) { res.status(401).json({ error: 'unauthorized' }); return; }
    try {
      const { kvSetIfAbsent } = require('./kv.js');
      const got = await kvSetIfAbsent('reminders:tick-lock', String(Date.now()), 55);
      if (!got) { res.status(200).json({ ok: true, skipped: 'locked' }); return; }
    } catch (e) { res.status(200).json({ ok: false, reason: 'lock-failed' }); return; }
  }

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) { res.status(200).json({ ok: false, reason: 'no vapid keys configured' }); return; }

  const now = new Date();
  const nowMs = now.getTime();
  const today = todayStr(now);

  const userKeys = await kvList('db/reminders/');
  let sent = 0;
  /* v-audit-mahakv (srv-maha-5): ذاكرة مواقيت الدورة، وميزانيّة ٤٠ث لجلب Aladhan — عطله أو بطؤه لا يمدّ الدورة
     فوق قفلها (٥٥ث) ولا يحرم من بعده من إشعاراتهم المحسوبة؛ ما لم يُجلب يُجلب في الدورة التالية. */
  const prayerMemo = new Map();
  const fetchUntil = Date.now() + 40000;

  /* v-news-off (أمر المالك ٣ أكتوبر «شيل موضوع الأخبار»): لا جلب أخبار ولا دفعها بعد اليوم. */

  for (const key of userKeys) {
    const usernameMatch = String(key).match(/^db\/reminders\/(.+)\.json$/);
    if (!usernameMatch) continue;
    const username = decodeURIComponent(usernameMatch[1]);

    const list = await getJson(key);
    if (!Array.isArray(list) || !list.length) continue;

    // v-audit-mahakv (srv-maha-3): اشتراك قديم خُزّن قبل التحقّق بمضيف غير خدمة دفع معروفة لا يُرسل إليه
    const subKey = 'db/push-subs/' + encodeURIComponent(username) + '.json';
    const sub = cleanSubscription(await getJson(subKey));
    if (!sub) continue;
    let subGone = false;

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
        /* v-audit-mahakv (srv-maha-2): كان الموعد يُحسب من مواقيت «تاريخ UTC الحاليّ»، فالفجر شرق UTC+5:30 (جاكرتا ٠٤:١٥ =
           ٢١:١٥ UTC من اليوم السابق) والعشاء في الأمريكيّتين بعد منتصف ليل UTC يُخزَّن موعدًا مضى ولا يصل أبدًا. الآن أقرب
           موعد لم تفُت نافذته من مواقيت أيّام البلد المحيطة (تاريخ Aladhan = التاريخ المحلّيّ للموقع)، وcachedDate
           وlastSentDate بذلك التاريخ المحلّيّ. يُعاد الحساب حين تفوت نافذة الموعد المخزَّن، والفشل يؤجَّل ١٠ دقائق. */
        const off = (Number(r.offsetMinutes) || 0) * 60000;
        const stale = !(r.cachedTargetMs > 0) || nowMs - r.cachedTargetMs >= PRAYER_WINDOW_MS;
        if (stale && PRAYER_NAMES.includes(r.prayerName) && !(r.retryAt > nowMs) && Date.now() < fetchUntil) {
          let pick = null;
          for (let k = -1; k <= 2 && !pick; k++) {
            const d = addDays(today, k);
            if (r.lastSentDate && d <= r.lastSentDate) continue;
            const ms = await fetchPrayerTimeMs(r.lat, r.lng, r.prayerName, d, r.method, prayerMemo);
            if (ms == null) break;
            if (ms - off + PRAYER_WINDOW_MS > nowMs) pick = { d, t: ms - off };
          }
          if (pick) { r.cachedDate = pick.d; r.cachedTargetMs = pick.t; delete r.retryAt; }
          else r.retryAt = nowMs + 10 * 60000;
          changed = true;
        }
        // v-prayer-window: النبض يأتي من التطبيقات المفتوحة فقط وقد يتأخر (خلفية/خمول)؛
        // نافذة 10 دقائق تُوصل تنبيهًا متأخرًا قليلًا بدل إسقاطه كليًا.
        if (r.cachedTargetMs && r.lastSentDate !== r.cachedDate && nowMs >= r.cachedTargetMs && nowMs - r.cachedTargetMs < PRAYER_WINDOW_MS) {
          dueNow = true;
        }
      }

      if (r.type === 'news') {
        // v-news-off: اشتراك أخبار قديم يبقى في سجلّ صاحبه كما هو (لا نمسّ بياناته) ولا يُدفع منه شيء.
        nextList.push(r);
        continue;
      }

      if (dueNow && !subGone) {
        try {
          // v-audit-mahakv (srv-maha-3): مهلة ١٠ث — خادم دفع يمسك الاتّصال كان يعلّق الدورة حتّى تُقتل عند ٣٠٠ث
          await webpush.sendNotification(sub, JSON.stringify({
            title: 'مها',
            body: r.message || 'تذكير',
          }), { timeout: 10000 });
          sent++;
        } catch (e) {
          // subscription likely expired/invalid; leave reminder as-is, just skip this send
          // v-audit-mahakv: 404/410 = خدمة الدفع ألغت الاشتراك نهائيًّا — يُحذف فلا يُطرق كلّ دقيقة؛ والتطبيق يجدّده عند التفعيل
          if (e && (e.statusCode === 404 || e.statusCode === 410)) {
            subGone = true;
            await kvDel(subKey);
          }
        }
        changed = true;
        if (r.type === 'once') { continue; } // drop after firing
        r.lastSentDate = r.type === 'prayer' ? r.cachedDate : today;
      }

      nextList.push(r);
    }

    if (changed) {
      /* v-audit-mahakv (srv-maha-9): كانت القائمة المقروءة قبل انتظار Aladhan والدفع تُكتب كاملة، فيُمحى تذكير أُضيف
         أثناءها ويعود محذوف. الآن تحت قفل المستخدم تُعاد القراءة ويُدمج بالمعرّف: ما أسقطته الدورة يسقط، وما حدّثته
         يُحدَّث، وما أضافه المستخدم أو حذفه في الأثناء يبقى كما فعل. */
      const seen = new Set(list.map((x) => x && x.id).filter(Boolean));
      const updated = new Map(nextList.filter((x) => x && x.id).map((x) => [x.id, x]));
      try {
        await withRemindersLock(username, async () => {
          const fresh = await kvGetJSON(key, { strict: true });
          if (!Array.isArray(fresh)) return; // حُذف السجلّ (حذف الحساب) — لا نعيده
          const merged = fresh
            .filter((x) => !(x && x.id && seen.has(x.id) && !updated.has(x.id)))
            .map((x) => (x && x.id && updated.has(x.id) ? updated.get(x.id) : x));
          await putJson(key, merged);
        });
      } catch (e) { /* قراءة متعذّرة أو قفل مشغول — الدورة التالية تعيد الحساب، ولا كتابة فوق ما لم يُقرأ */ }
    }
  }

  res.status(200).json({ ok: true, sent });
};
