// Background: the only network call the extension makes — asking the AI in the
// owner's TARYAM Cyber site for the next round's numbers (when switched on).
const AI_URL = 'https://taryam-cyber.vercel.app/api/claude';
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.type !== 'taryam-ask-ai' || !msg.body) return undefined;
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 25000);
  fetch(AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg.body), signal: ctl.signal })
    .then(async (r) => reply({ status: r.status, text: await r.text() }))
    .catch((e) => reply({ status: 0, text: String((e && e.message) || e) }))
    .finally(() => clearTimeout(timer));
  return true; // async reply
});
