// Vercel Serverless Function: sends a user-approved (optionally edited) reply
// via the Gmail API, threaded onto the original message. Only ever called
// after the user explicitly clicks "send" on a draft in the UI.
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

function encodeSubject(subject) {
  return '=?UTF-8?B?' + Buffer.from(String(subject), 'utf8').toString('base64') + '?=';
}

function buildRawMessage(to, subject, bodyText, inReplyTo) {
  let headers = 'To: ' + to + '\r\n' +
    'Subject: ' + encodeSubject(subject) + '\r\n' +
    'Content-Type: text/plain; charset="UTF-8"\r\n' +
    'MIME-Version: 1.0\r\n';
  if (inReplyTo) {
    headers += 'In-Reply-To: ' + inReplyTo + '\r\n' + 'References: ' + inReplyTo + '\r\n';
  }
  const raw = headers + '\r\n' + bodyText;
  return Buffer.from(raw, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
    const { token, threadId, to, subject, text, messageIdHeader } = body;
    const username = verifyToken(token);
    if (!username) { res.status(401).json({ error: 'الجلسة منتهية، سجل الدخول من جديد' }); return; }
    if (!to || !text) { res.status(400).json({ error: 'الرد أو المستلم ناقص' }); return; }

    const user = await getUser(username);
    if (!user || !user.emailAssist || !user.emailAssist.connected) {
      res.status(400).json({ error: 'لم يتم ربط Gmail بعد', notConnected: true });
      return;
    }
    const refreshToken = decrypt(user.emailAssist.refreshTokenEnc);
    const accessToken = await getAccessToken(refreshToken);

    const raw = buildRawMessage(to, subject && !/^re:/i.test(subject) ? 'Re: ' + subject : (subject || ''), text, messageIdHeader);
    const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw, threadId: threadId || undefined }),
    });
    const sendData = await sendRes.json();
    if (!sendRes.ok) { res.status(500).json({ error: sendData.error && sendData.error.message ? sendData.error.message : 'تعذر إرسال الرد' }); return; }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Email send error: ' + (e && e.message ? e.message : String(e)) });
  }
};
