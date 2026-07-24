// Vercel Serverless Function: fetches the user's recent Gmail inbox messages,
// classifies priority + detects language, and generates an AI-drafted reply
// (in the SAME language as the incoming email) for each — the core of the
// "AI Email Assistant" feature. Nothing is ever sent automatically; the user
// must approve/edit each draft (see email-send.js).
const { getUser, putUser, verifyToken } = require('./auth.js');
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

function b64urlDecode(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function extractPlainText(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) return b64urlDecode(payload.body.data);
  if (payload.parts) {
    for (const p of payload.parts) {
      const t = extractPlainText(p);
      if (t) return t;
    }
  }
  if (payload.body && payload.body.data) return b64urlDecode(payload.body.data);
  return '';
}

function stripHtml(s) {
  return String(s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

// ✍️ Style learning: builds (and caches for 7 days) a short profile of how the
// user writes, based on their recent SENT emails, so drafts match their style.
async function getStyleProfile(accessToken, user, username) {
  try {
    const cached = user.emailAssist && user.emailAssist.styleProfile;
    if (cached && cached.text && (Date.now() - (cached.at || 0)) < 7 * 24 * 3600 * 1000) return cached.text;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return '';
    const listRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=8&labelIds=SENT',
      { headers: { Authorization: 'Bearer ' + accessToken } }
    );
    const listData = await listRes.json();
    const msgs = (listData.messages || []).slice(0, 8);
    if (!msgs.length) return '';
    const samples = [];
    for (const m of msgs) {
      const msgRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + m.id + '?format=full', {
        headers: { Authorization: 'Bearer ' + accessToken },
      });
      const msg = await msgRes.json();
      let t = stripHtml(extractPlainText(msg && msg.payload) || (msg && msg.snippet) || '');
      // Drop quoted previous messages (common reply separators)
      t = t.split(/On .{5,60} wrote:|في .{5,60} كتب|-----Original Message-----|________________________________/)[0].trim();
      if (t) samples.push(t.slice(0, 500));
      if (samples.length >= 6) break;
    }
    if (!samples.length) return '';
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Below are emails written by one person. Describe their writing style in 3-4 short bullet points (tone, greeting/closing habits, formality, typical length, language quirks). Reply with the bullet points only.\n\n' + samples.map((s, i) => '--- Email ' + (i + 1) + ' ---\n' + s).join('\n') }],
        temperature: 0.2,
      }),
    });
    const d = await r.json();
    const text = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content || '').trim().slice(0, 1200);
    if (!text) return '';
    try {
      const fresh = await getUser(username);
      if (fresh && fresh.emailAssist) {
        fresh.emailAssist.styleProfile = { text, at: Date.now() };
        await putUser(username, fresh);
      }
    } catch (e) { /* cache write failure is non-fatal */ }
    return text;
  } catch (e) {
    return '';
  }
}

async function draftReply(fromName, subject, bodyText, styleProfile) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { priority: 'normal', lang: 'ar', draft: '', meeting: null };
  const nowDubai = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Dubai', hour12: false });
  const prompt = 'You are an email assistant. Today (Dubai time) is: ' + nowDubai + '. Given this email, respond with JSON ONLY in this exact shape: ' +
    '{"priority":"urgent|normal|low","lang":"<ISO 639-1 code of the language THIS email is written in>","draft":"<a polite, concise reply written in the SAME language as the email, professional but warm tone, do not include a subject line>",' +
    '"meeting":<if the email proposes/mentions a specific meeting, appointment, call, or event with a date, return {"title":"<short event title>","start":"YYYY-MM-DDTHH:MM (Dubai local time; if no time mentioned use 10:00)","durationMin":60}; otherwise null>}\n\n' +
    (styleProfile ? 'IMPORTANT — write the draft imitating the user\'s personal writing style:\n' + styleProfile + '\n\n' : '') +
    'From: ' + fromName + '\nSubject: ' + subject + '\nBody: ' + bodyText.slice(0, 3000);
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        response_format: { type: 'json_object' },
      }),
    });
    const d = await r.json();
    const parsed = JSON.parse(d.choices[0].message.content);
    return {
      priority: ['urgent', 'normal', 'low'].includes(parsed.priority) ? parsed.priority : 'normal',
      lang: parsed.lang || 'ar',
      draft: parsed.draft || '',
      meeting: (parsed.meeting && parsed.meeting.start && parsed.meeting.title) ? parsed.meeting : null,
    };
  } catch (e) {
    return { priority: 'normal', lang: 'ar', draft: '', meeting: null };
  }
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
    const { token } = body;
    const username = verifyToken(token);
    if (!username) { res.status(401).json({ error: 'الجلسة منتهية، سجل الدخول من جديد' }); return; }

    const user = await getUser(username);
    if (!user || !user.emailAssist || !user.emailAssist.connected) {
      res.status(400).json({ error: 'لم يتم ربط Gmail بعد', notConnected: true });
      return;
    }
    const refreshToken = decrypt(user.emailAssist.refreshTokenEnc);
    if (!refreshToken) { res.status(400).json({ error: 'تعذر قراءة صلاحية Gmail، أعد الربط', notConnected: true }); return; }

    const accessToken = await getAccessToken(refreshToken);
    const styleProfile = await getStyleProfile(accessToken, user, username);
    const listRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=' +
      encodeURIComponent('in:inbox -in:chats -category:promotions -category:social newer_than:7d'),
      { headers: { Authorization: 'Bearer ' + accessToken } }
    );
    const listData = await listRes.json();
    const ignoreList = user.emailAssist.ignoreList || [];
    const msgs = listData.messages || [];

    const detailed = await Promise.all(msgs.map(async (m) => {
      const msgRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + m.id + '?format=full', {
        headers: { Authorization: 'Bearer ' + accessToken },
      });
      return msgRes.json();
    }));

    const results = [];
    for (const msg of detailed) {
      if (!msg || !msg.payload) continue;
      const headers = msg.payload.headers || [];
      const from = (headers.find((h) => h.name === 'From') || {}).value || '';
      const subject = (headers.find((h) => h.name === 'Subject') || {}).value || '(بدون عنوان)';
      const messageIdHeader = (headers.find((h) => h.name === 'Message-ID' || h.name === 'Message-Id') || {}).value || '';
      if (ignoreList.some((pattern) => from.toLowerCase().includes(String(pattern).toLowerCase()))) continue;
      let bodyText = extractPlainText(msg.payload) || msg.snippet || '';
      bodyText = stripHtml(bodyText);
      const ai = await draftReply(from, subject, bodyText, styleProfile);
      results.push({
        id: msg.id, threadId: msg.threadId, messageIdHeader, from, subject,
        snippet: msg.snippet || '', priority: ai.priority, lang: ai.lang, draft: ai.draft, meeting: ai.meeting || null,
      });
    }
    const order = { urgent: 0, normal: 1, low: 2 };
    results.sort((a, b) => (order[a.priority] ?? 1) - (order[b.priority] ?? 1));

    res.status(200).json({ ok: true, gmailAddress: user.emailAssist.gmailAddress, emails: results });
  } catch (e) {
    res.status(500).json({ error: 'Email list error: ' + (e && e.message ? e.message : String(e)) });
  }
};
