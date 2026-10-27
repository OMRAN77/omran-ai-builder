// Vercel Serverless Function: reminders set by voice through مها (e.g. "ذكرني
// قبل صلاة العصر" / "صحّيني الساعة 7 للدوام"). Stored as one small JSON record
// per user (db/reminders/{username}.json), read/updated by the /api/check-reminders
// cron job every minute. Prayer-time reminders are resolved once per day via
// the free Aladhan API using the user's last-known device location.
const crypto = require('crypto');
const { kvGetJSON, kvPutJSON, kvSetIfAbsent, kvGetRaw, kvDel } = require('./kv.js');

/* v-audit-mahakv: أسماء الصلوات كما يعيدها Aladhan (اسم آخر كان يُخزَّن فيجلب الكرون المواقيت كلّ دقيقة بلا نتيجة)،
   وسقف لعدد التذكيرات (لا حدّ كان = آلاف الجلبات المتتالية تقتل دورة الكرون قبل بقيّة المستخدمين). */
const PRAYER_NAMES = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const MAX_REMINDERS = 30;


function remindersPath(username) {
  return 'db/reminders/' + encodeURIComponent(username) + '.json';
}

// v-session-shape (الدفعة A، أمان): نسخة verifyToken اليدويّة هنا كانت تقبل حمولة موقّعة بلا exp (تذكرة مهمّة البناء) جلسةً
// لا تنتهي، وتقرأ السرّ في نطاق الوحدة. الآن _session.sessionUser: u نصّ وexp رقم في المستقبل، والسرّ عند النداء.
const { sessionUser } = require('./_session.js');

async function getReminders(username) {
  try {
    const data = await kvGetJSON(remindersPath(username));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

async function putReminders(username, list) {
  await kvPutJSON(remindersPath(username), list);
}

/* v-audit-mahakv (srv-maha-4): قراءة صارمة قبل كتابة القائمة كاملة — عطل KV عابر كان يصير [] فتُكتب القائمة الجديدة
   وحدها فوق كلّ القديم. غير الموجود = []، والعطل يرمي (المنادي يردّ 503 بلا كتابة). */
async function readRemindersStrict(username) {
  const data = await kvGetJSON(remindersPath(username), { strict: true });
  if (data == null) return [];
  if (!Array.isArray(data)) throw new Error('reminders_unreadable');
  return data;
}

/* v-audit-mahakv (srv-maha-9): قفل قصير لكلّ مستخدم حول «اقرأ ثمّ اكتب القائمة كاملة». moveAlertsTo يرسل POST لكلّ جرس
   معًا، والكرون يكتب بعد انتظار Aladhan — فكان طلب يكتب فوق آخر: يضيع تذكير جديد أو يعود محذوف. ينتظر حامله حتّى waitMs
   ثمّ يرمي (503)؛ والقفل ينتهي وحده بعد LOCK_TTL_SEC إن مات حامله. */
const LOCK_TTL_SEC = 10;
function lockKey(username) { return 'reminders:lock:' + encodeURIComponent(username); }
async function withRemindersLock(username, fn, waitMs) {
  const key = lockKey(username);
  const mine = crypto.randomBytes(6).toString('hex');
  const until = Date.now() + (waitMs == null ? 6000 : waitMs);
  while (!(await kvSetIfAbsent(key, mine, LOCK_TTL_SEC))) {
    if (Date.now() >= until) throw new Error('reminders_busy');
    await new Promise((r) => setTimeout(r, 60 + Math.floor(Math.random() * 90)));
  }
  try {
    return await fn();
  } finally {
    try { if ((await kvGetRaw(key)) === mine) await kvDel(key); } catch (e) { /* القفل ينتهي وحده بعد LOCK_TTL_SEC */ }
  }
}

module.exports = async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const username = sessionUser(token);
  if (!username) {
    res.status(401).json({ error: 'auth' });
    return;
  }

  if (req.method === 'GET') {
    const list = await getReminders(username);
    res.status(200).json({ reminders: list.filter((r) => r.active !== false) });
    return;
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const type = body.type === 'prayer' ? 'prayer' : (body.type === 'daily' ? 'daily' : (body.type === 'news' ? 'news' : 'once'));
    const reminder = {
      id: Date.now() + '-' + crypto.randomBytes(4).toString('hex'),
      type,
      message: String(body.message || 'تذكير').slice(0, 200),
      active: true,
      createdAt: new Date().toISOString(),
    };
    if (type === 'once') {
      // timeISO: absolute ISO timestamp computed client-side from the user's
      // local time (the model only knows relative wording like "in 20 minutes"
      // or "at 7pm", the client converts using its own clock/timezone).
      if (!body.timeISO) { res.status(400).json({ error: 'missing timeISO' }); return; }
      // v-audit-mahakv: تاريخ صالح بين دقيقتين مضتا (فرق الساعات) وسنة وشهر قادمين — غير ذلك لا يصل أبدًا
      const t = Date.parse(body.timeISO);
      if (!Number.isFinite(t) || t < Date.now() - 120000 || t > Date.now() + 400 * 86400000) { res.status(400).json({ error: 'bad timeISO' }); return; }
      reminder.timeISO = new Date(t).toISOString();
    } else if (type === 'daily') {
      reminder.hour = Math.max(0, Math.min(23, parseInt(body.hour, 10) || 0));
      reminder.minute = Math.max(0, Math.min(59, parseInt(body.minute, 10) || 0));
    } else if (type === 'prayer') {
      reminder.prayerName = body.prayerName || 'Asr'; // Fajr/Sunrise/Dhuhr/Asr/Maghrib/Isha
      if (!PRAYER_NAMES.includes(reminder.prayerName)) { res.status(400).json({ error: 'bad prayerName' }); return; }
      // minutes BEFORE the prayer time — v-audit-mahakv: محدودة بثلاث ساعات (قيمة بلا حدّ = موعد لا يأتي يُعاد حسابه كلّ دقيقة)
      reminder.offsetMinutes = Math.max(-180, Math.min(180, parseInt(body.offsetMinutes, 10) || 0));
      reminder.lat = typeof body.lat === 'number' && Math.abs(body.lat) <= 90 ? body.lat : null;
      reminder.lng = typeof body.lng === 'number' && Math.abs(body.lng) <= 180 ? body.lng : null;
      if (reminder.lat == null || reminder.lng == null) { res.status(400).json({ error: 'missing location' }); return; }
      // v-prayer-method: طريقة الحساب نفسها التي يراها المستخدم في الشاشة (الافتراضي 4 أم القرى) —
      // كان الخادم يحسب بطريقة ISNA (2) فيختلف وقت التنبيه عن الوقت المعروض.
      const mth = parseInt(body.method, 10);
      reminder.method = Number.isFinite(mth) && mth >= 0 && mth <= 23 ? mth : 4;
    }

    let full = false;
    try {
      await withRemindersLock(username, async () => {
        let list = await readRemindersStrict(username);
        if (type === 'news') {
          // v-news-push: اشتراك واحد للأخبار العاجلة لكل حساب — التفعيل من الإعدادات يستبدل القديم
          reminder.sentIds = [];
          list = list.filter((r) => r.type !== 'news');
        }
        if (list.length >= MAX_REMINDERS) { full = true; return; }
        list.push(reminder);
        await putReminders(username, list);
      });
    } catch (e) {
      res.status(503).json({ error: 'reminders_unavailable' });
      return;
    }
    if (full) { res.status(400).json({ error: 'reminders_limit' }); return; }
    res.status(200).json({ ok: true, reminder });
    return;
  }

  if (req.method === 'DELETE') {
    const id = (req.query && req.query.id) || (req.body && req.body.id);
    try {
      await withRemindersLock(username, async () => {
        const list = await readRemindersStrict(username);
        const next = list.filter((r) => r.id !== id);
        if (next.length !== list.length) await putReminders(username, next);
      });
    } catch (e) {
      res.status(503).json({ error: 'reminders_unavailable' });
      return;
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
};

module.exports.getReminders = getReminders;
module.exports.putReminders = putReminders;
module.exports.withRemindersLock = withRemindersLock;
module.exports.PRAYER_NAMES = PRAYER_NAMES;
