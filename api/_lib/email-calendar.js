// Vercel Serverless Function: adds a detected meeting/appointment from an email
// to the user's Google Calendar (primary calendar, in the user's own time zone — Asia/Dubai if unknown).
const { getUser, verifyToken } = require('./auth.js');
const { decrypt } = require('./_emailCrypto.js');
const { safeTz } = require('./_mail.js'); // v-email-safe

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

    /* v-email-safe: الوقت كان يُقرأ بتوقيت دبي دائمًا (+04:00) — مستخدم في الرياض أو لندن يُحجز موعده بساعة خطأ.
       الآن ساعة الحائط كما كتبها الموديل بمنطقة المستخدم نفسها (التي أُعطيت للموديل في email-list)، وجوجل
       تفسّرها بـtimeZone. الحساب بساعة الحائط (UTC كحاوية) والتحقّق قبل نداء جوجل. */
    const tz = safeTz(body.tz);
    const sm = String(start).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    const wall = sm ? Date.UTC(+sm[1], +sm[2] - 1, +sm[3], +sm[4], +sm[5]) : NaN;
    const wallStr = (ms) => new Date(ms).toISOString().slice(0, 19);
    if (!sm || isNaN(wall) || wallStr(wall).slice(0, 16) !== sm[0]) { res.status(400).json({ error: 'صيغة الوقت غير صحيحة' }); return; }
    const mins = Math.min(Number(durationMin) > 0 ? Number(durationMin) : 60, 24 * 60);

    const user = await getUser(username);
    if (!user || !user.emailAssist || !user.emailAssist.connected) {
      res.status(400).json({ error: 'لم يتم ربط Gmail بعد', notConnected: true });
      return;
    }
    const refreshToken = decrypt(user.emailAssist.refreshTokenEnc);
    if (!refreshToken) { res.status(400).json({ error: 'تعذر قراءة صلاحية Gmail، أعد الربط', notConnected: true }); return; }

    const accessToken = await getAccessToken(refreshToken);

    const evRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
      body: JSON.stringify({
        summary: title,
        description: description || 'أُضيف تلقائيًا من مساعد البريد الذكي — om ai',
        start: { dateTime: wallStr(wall), timeZone: tz },
        end: { dateTime: wallStr(wall + mins * 60000), timeZone: tz },
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
