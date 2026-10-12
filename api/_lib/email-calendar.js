// Vercel Serverless Function: adds a detected meeting/appointment from an email
// to the user's Google Calendar (primary calendar).
// v-email-best: بمنطقة المستخدم الزمنيّة (tz من الواجهة) لا دبيّ لكلّ أحد — كان موعد «١٠ صباحًا» في الرياض أو القاهرة
// يُسجَّل بتوقيت دبيّ فيزيح ساعة أو اثنتين. الوقت يُرسل لجوجل محلّيًّا مع timeZone فيحسب جوجل الإزاحة والتوقيت الصيفيّ.
const G = require('./_gmail.js');

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** «YYYY-MM-DDTHH:MM[:SS]» + دقائق، على ساعة الحائط (بلا منطقة) — أو null إن لم يكن تاريخًا حقيقيًّا. */
function addMinutesLocal(start, minutes) {
  const m = LOCAL_RE.exec(String(start || ''));
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  const d = new Date(t);
  if (isNaN(t) || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3] || +m[4] > 23 || +m[5] > 59) return null;
  return {
    start: d.toISOString().slice(0, 19),
    end: new Date(t + minutes * 60000).toISOString().slice(0, 19),
  };
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
    const { title, start, durationMin, description } = body;
    if (!title || !start) { res.status(400).json({ error: 'بيانات الموعد ناقصة' }); return; }
    const dur = Number(durationMin) > 0 ? Math.min(1440, Math.round(Number(durationMin))) : 60;
    const span = addMinutesLocal(start, dur);
    if (!span) { res.status(400).json({ error: 'صيغة الوقت غير صحيحة' }); return; }

    const sess = await G.gmailSession(body);
    if (sess.status) { res.status(sess.status).json(sess.json); return; }
    const tz = G.validTz(body.tz);

    const evRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sess.accessToken },
      body: JSON.stringify({
        summary: String(title).slice(0, 200),
        description: String(description || 'أُضيف تلقائيًا من مساعد البريد الذكي — Omran AI Builder').slice(0, 2000),
        start: { dateTime: span.start, timeZone: tz },
        end: { dateTime: span.end, timeZone: tz },
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const ev = await evRes.json().catch(() => ({}));
    if (!evRes.ok) {
      const msg = (ev.error && ev.error.message) || 'calendar_error';
      if (evRes.status === 401) { res.status(401).json({ error: 'invalid_grant', notConnected: true, reconnect: true }); return; }
      const needsReauth = evRes.status === 403 || /insufficient/i.test(msg);
      res.status(evRes.status).json({ error: msg, needsReauth });
      return;
    }
    res.status(200).json({ ok: true, eventLink: ev.htmlLink || '' });
  } catch (e) {
    res.status(500).json({ error: 'Calendar error: ' + (e && e.message ? e.message : String(e)) });
  }
};
module.exports.addMinutesLocal = addMinutesLocal;
