// Vercel Serverless Function: reminders set by voice through مها (e.g. "ذكرني
// قبل صلاة العصر" / "صحّيني الساعة 7 للدوام"). Stored as one small JSON record
// per user (db/reminders/{username}.json), read/updated by the /api/check-reminders
// cron job every minute. Prayer-time reminders are resolved once per day via
// the free Aladhan API using the user's last-known device location.
const crypto = require('crypto');
const { kvGetJSON, kvPutJSON } = require('./kv.js');

const AUTH_SECRET = process.env.AUTH_SECRET || 'fallback-dev-secret-change-me';

function remindersPath(username) {
  return 'db/reminders/' + encodeURIComponent(username) + '.json';
}

function verifyToken(token) {
  try {
    const [payload, sig] = String(token).split('.');
    const expected = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp < Date.now()) return null;
    return data.u;
  } catch (e) {
    return null;
  }
}

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

module.exports = async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const username = verifyToken(token);
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
    const type = body.type === 'prayer' ? 'prayer' : (body.type === 'daily' ? 'daily' : 'once');
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
      reminder.timeISO = body.timeISO || null;
      if (!reminder.timeISO) { res.status(400).json({ error: 'missing timeISO' }); return; }
    } else if (type === 'daily') {
      reminder.hour = Math.max(0, Math.min(23, parseInt(body.hour, 10) || 0));
      reminder.minute = Math.max(0, Math.min(59, parseInt(body.minute, 10) || 0));
    } else if (type === 'prayer') {
      reminder.prayerName = body.prayerName || 'Asr'; // Fajr/Sunrise/Dhuhr/Asr/Maghrib/Isha
      reminder.offsetMinutes = parseInt(body.offsetMinutes, 10) || 0; // minutes BEFORE the prayer time
      reminder.lat = typeof body.lat === 'number' ? body.lat : null;
      reminder.lng = typeof body.lng === 'number' ? body.lng : null;
      if (reminder.lat == null || reminder.lng == null) { res.status(400).json({ error: 'missing location' }); return; }
    }

    const list = await getReminders(username);
    list.push(reminder);
    await putReminders(username, list);
    res.status(200).json({ ok: true, reminder });
    return;
  }

  if (req.method === 'DELETE') {
    const id = (req.query && req.query.id) || (req.body && req.body.id);
    const list = await getReminders(username);
    const next = list.filter((r) => r.id !== id);
    await putReminders(username, next);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
};

module.exports.getReminders = getReminders;
module.exports.putReminders = putReminders;
