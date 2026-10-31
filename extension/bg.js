// Background: the only network calls the extension makes — asking the AI providers
// on the owner's TARYAM Cyber site for the next round's numbers (when switched on).
const BASE = 'https://taryam-cyber.vercel.app/api/';
const ALLOWED = new Set(['claude', 'openai', 'deepseek']);
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.type !== 'taryam-ask-ai' || !msg.body || !ALLOWED.has(msg.provider)) return undefined;
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 15000);
  fetch(BASE + msg.provider, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg.body), signal: ctl.signal })
    .then(async (r) => reply({ status: r.status, text: await r.text() }))
    .catch((e) => reply({ status: 0, text: String((e && e.message) || e) }))
    .finally(() => clearTimeout(timer));
  return true; // async reply
});
