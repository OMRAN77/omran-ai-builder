// Vercel Serverless Function: adds a detected meeting/appointment from an email
// to the user's Google Calendar (primary calendar, Asia/Dubai timezone).
const { getUser, verifyToken } = require('./auth.js');
const { decrypt } = require('./_emailCrypto.js');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

async function getAccessToken(refreshToken) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'refresh_failed');
  return d.access_token;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const { token, title, start, durationMin, description } = body;
    const username = verifyToken(token);
    if (!username) { res.status(401).json({ error: 'الجلسة منتهية، سجل الدخول من جديد' }); return; }
    if (!title || !start) { res.status(400).json({ error: 'بيانات الموعد ناقصة' }); return; }

    const user = await getUser(username);
    if (!user || !user.emailAssist || !user.emailAssist.connected) {
      res.status(400).json({ error: 'لم يتم ربط Gmail بعد', notConnected: true });
      return;
    }
    const refreshToken = decrypt(user.emailAssist.refreshTokenEnc);
    if (!refreshToken) { res.status(400).json({ error: 'تعذر قراءة صلاحية Gmail، أعد الربط', notConnected: true }); return; }

    const accessToken = await getAccessToken(refreshToken);

    // start format: YYYY-MM-DDTHH:MM (Dubai local time)
    const startISO = String(start).length === 16 ? start + ':00' : start;
    const startDate = new Date(startISO + '+04:00');
    if (isNaN(startDate.getTime())) { res.status(400).json({ error: 'صيغة الوقت غير صحيحة' }); return; }
    const endDate = new Date(startDate.getTime() + (Number(durationMin) > 0 ? Number(durationMin) : 60) * 60000);

    const evRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
      body: JSON.stringify({
        summary: title,
        description: description || 'أُضيف تلقائيًا من مساعد البريد الذكي — Omran AI Builder',
        start: { dateTime: startDate.toISOString(), timeZone: 'Asia/Dubai' },
        end: { dateTime: endDate.toISOString(), timeZone: 'Asia/Dubai' },
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] },
      }),
    });
    const ev = await evRes.json();
    if (!evRes.ok) {
      const msg = (ev.error && ev.error.message) || 'calendar_error';
      const needsReauth = evRes.status === 403 || /insufficient/i.test(msg);
      res.status(evRes.status).json({ error: msg, needsReauth });
      return;
    }
    res.status(200).json({ ok: true, eventLink: ev.htmlLink || '' });
  } catch (e) {
    res.status(500).json({ error: 'Calendar error: ' + (e && e.message ? e.message : String(e)) });
  }
};
