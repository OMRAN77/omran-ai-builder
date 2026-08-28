// مجسّ المحادثة على الإنتاج — يقيس معمارية «العقل الواحد» بالأرقام:
// أول بايت، أول حرف، حدث المصادر، الزمن الكلي — لسؤال بحث حي وتحية.
// لا يطبع أي أسرار؛ حساب فحص zzcheck مؤقت (يُنظف من لوحة المالك 🧹).
const BASE = process.env.PROBE_BASE || 'https://omran-ai-builder.vercel.app';

const rnd = Math.random().toString(16).slice(2, 8);
const USER = 'zzcheck' + rnd;

async function signup() {
  const r = await fetch(BASE + '/api/account?action=auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'signup', username: USER, password: 'Pp1!' + rnd + rnd }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.token) throw new Error('signup failed: ' + r.status + ' ' + JSON.stringify(j).slice(0, 120));
  return j.token;
}

async function probeChat(token, text, label) {
  const t0 = Date.now();
  const res = await fetch(BASE + '/api/ai?action=chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: text }], provider: 'claude', token }),
  });
  const tHead = Date.now() - t0;
  if (!res.ok || !res.body) throw new Error(label + ': HTTP ' + res.status);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', full = '', tFirstDelta = 0, sourcesCount = 0, statuses = [], err = null;
  while (true) {
    const c = await reader.read();
    if (c.done) break;
    buf += dec.decode(c.value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      let ev; try { ev = JSON.parse(line.slice(6)); } catch (e) { continue; }
      if (ev.delta) { if (!tFirstDelta) tFirstDelta = Date.now() - t0; full += ev.delta; }
      if (Array.isArray(ev.sources)) sourcesCount += ev.sources.length;
      if (ev.status) statuses.push(String(ev.status).slice(0, 40));
      if (ev.error) err = String(ev.error).slice(0, 120);
    }
    if (Date.now() - t0 > 90000) break; // سقف صارم
  }
  const total = Date.now() - t0;
  const paras = (full.match(/\n\n/g) || []).length;
  console.log('== ' + label + ' ==');
  console.log('  first-byte : ' + tHead + 'ms');
  console.log('  first-delta: ' + tFirstDelta + 'ms');
  console.log('  total      : ' + total + 'ms');
  console.log('  reply-chars: ' + full.length + ' | blank-line-breaks: ' + paras);
  console.log('  sources    : ' + sourcesCount);
  console.log('  statuses   : ' + statuses.join(' | '));
  if (err) console.log('  ERROR      : ' + err);
  console.log('  sample     : ' + full.slice(0, 220).replace(/\n/g, ' ⏎ '));
  return { tHead, tFirstDelta, total, len: full.length, sourcesCount, err };
}

const token = await signup();
console.log('probe account ready (zzcheck…)');
const greet = await probeChat(token, 'مرحبا', 'GREETING');
const search = await probeChat(token, 'كم سعر الذهب اليوم في الإمارات؟', 'LIVE-SEARCH');
const fails = [];
if (greet.err || greet.len < 10) fails.push('greeting empty/error');
if (greet.tFirstDelta > 12000) fails.push('greeting first-delta > 12s');
if (search.err || search.len < 40) fails.push('search empty/error');
if (search.sourcesCount < 1) fails.push('no sources event');
if (search.tFirstDelta > 20000) fails.push('search first-delta > 20s');
if (fails.length) { console.log('PROBE FAILS: ' + fails.join(' · ')); process.exit(1); }
console.log('PROBE OK ✓ — العقل الواحد حي على الإنتاج');
