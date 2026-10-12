// Vercel Serverless Function: sends a user-approved (optionally edited) reply
// via the Gmail API, threaded onto the original message. Only ever called
// after the user explicitly clicks "send" on a draft in the UI.
//
// v-email-best: المستلم والموضوع والسلسلة تُقرأ من الرسالة الأصليّة نفسها بمعرّفها (id) لا ممّا يرسله العميل —
// كان `to` وMessage-ID يدخلان الترويسات خامًا (حقن CR/LF: Bcc مخفيّ)، وReply-To يُتجاهل، وReferences غائبة فتنقطع
// السلسلة عند بعض المستلمين. والنصّ صار base64 بترويسة ترميز النقل (UTF-8 خام بلا ترويسة كان يتشوّه عند بعض الخوادم).
// العميل القديم (بلا id) يبقى يعمل بحقوله القديمة بعد تنقيتها.
const G = require('./_gmail.js');

function encodeSubject(subject) {
  return '=?UTF-8?B?' + Buffer.from(String(subject), 'utf8').toString('base64') + '?=';
}

const MSGID_RE = /^<[^<>\s]{3,250}>$/;

function buildRawMessage(m) {
  let headers = 'To: ' + m.to.join(', ') + '\r\n' +
    'Subject: ' + encodeSubject(m.subject) + '\r\n' +
    'MIME-Version: 1.0\r\n' +
    'Content-Type: text/plain; charset="UTF-8"\r\n' +
    'Content-Transfer-Encoding: base64\r\n';
  if (m.inReplyTo) headers += 'In-Reply-To: ' + m.inReplyTo + '\r\n';
  if (m.references.length) headers += 'References: ' + m.references.join(' ') + '\r\n';
  const body = Buffer.from(String(m.text).replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');
  const raw = headers + '\r\n' + body;
  return Buffer.from(raw, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function replySubject(subject) {
  const s = String(subject || '').replace(/[\r\n]+/g, ' ').trim();
  return /^(re|aw|sv|رد)\s*:/i.test(s) ? s : (s ? 'Re: ' + s : 'Re:');
}

function referencesOf(refsHeader, inReplyTo) {
  const refs = String(refsHeader || '').split(/\s+/).filter((x) => MSGID_RE.test(x));
  if (inReplyTo && !refs.includes(inReplyTo)) refs.push(inReplyTo);
  return refs.slice(-20);
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
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const id = typeof body.id === 'string' && G.MSG_ID_RE.test(body.id) ? body.id : '';
    if (!text || (!id && !body.to)) { res.status(400).json({ error: 'الرد أو المستلم ناقص' }); return; }

    const sess = await G.gmailSession(body);
    if (sess.status) { res.status(sess.status).json(sess.json); return; }
    const { accessToken } = sess;

    let mail;
    if (id) {
      const g = await G.gmailGet(accessToken, 'messages/' + id + '?format=metadata');
      if (!g.ok) { res.status(g.status === 404 ? 404 : 502).json({ error: 'تعذر إرسال الرد' }); return; }
      const h = (g.data.payload && g.data.payload.headers) || [];
      const inReplyTo = G.headerOf(h, 'message-id').trim();
      const okId = MSGID_RE.test(inReplyTo) ? inReplyTo : '';
      const replyTo = G.addressesOf(G.headerOf(h, 'reply-to'));
      mail = {
        to: replyTo.length ? replyTo : G.addressesOf(G.headerOf(h, 'from')).slice(0, 1),
        subject: replySubject(G.headerOf(h, 'subject')),
        threadId: g.data.threadId || '',
        inReplyTo: okId,
        references: referencesOf(G.headerOf(h, 'references'), okId),
      };
    } else {
      const legacyId = String(body.messageIdHeader || '').trim();
      const okId = MSGID_RE.test(legacyId) ? legacyId : '';
      mail = {
        to: G.addressesOf(body.to).slice(0, 1),
        subject: replySubject(body.subject),
        threadId: /^[0-9a-f]{6,32}$/i.test(String(body.threadId || '')) ? String(body.threadId) : '',
        inReplyTo: okId,
        references: okId ? [okId] : [],
      };
    }
    if (!mail.to.length) { res.status(400).json({ error: 'الرد أو المستلم ناقص' }); return; }
    mail.text = text.slice(0, 20000);

    const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: buildRawMessage(mail), threadId: mail.threadId || undefined }),
      signal: AbortSignal.timeout(20000),
    });
    const sendData = await sendRes.json().catch(() => ({}));
    if (!sendRes.ok) {
      if (sendRes.status === 401) { res.status(401).json({ error: 'invalid_grant', notConnected: true, reconnect: true }); return; }
      res.status(500).json({ error: sendData.error && sendData.error.message ? sendData.error.message : 'تعذر إرسال الرد' });
      return;
    }
    res.status(200).json({ ok: true, id: sendData.id || '' });
  } catch (e) {
    res.status(500).json({ error: 'Email send error: ' + (e && e.message ? e.message : String(e)) });
  }
};
module.exports.buildRawMessage = buildRawMessage;
