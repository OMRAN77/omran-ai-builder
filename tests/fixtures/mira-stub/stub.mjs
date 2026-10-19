// محرّكات مزيّفة لاختبار مسلسل ميرا كاملًا (social-bot.mjs --mira) بلا شبكة ولا إنفاق: fetch موجّه بالرابط، والمؤقّتات فوريّة،
// وplaywright بديل (hooks.mjs)، وffmpeg/ffprobe بديلان في bin/. العدّادات تُكتب في STUB_COUNTS عند الخروج.
import { register } from 'node:module';
import fs from 'node:fs';
register(new URL('./hooks.mjs', import.meta.url));
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => realSetTimeout(fn, 0, ...a);
const C = {}; const inc = (k) => (C[k] = (C[k] || 0) + 1);
const modes = String(process.env.STUB_MODE || 'ok').split(','); const is = (m) => modes.includes(m);
// ok | clipfail | blip | fallback | dlfail | predict429 | predictnet | predictreset | predict400 | pending | veofail | veoblocked | frame503 | frametimeout
// | framejudgenet | clipjudgenet | tts503once | tts401 | tts1fail | issues500 | issuepost500
// | frame200bad | predictnoop | issuesbad | issuepost403  (عدّة أوضاع بفواصل)
const netErr = (code) => Object.assign(new TypeError('fetch failed'), { cause: { code } });
const json = (o, status = 200, headers = {}) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const uploads = [], issues = [], issueGets = [];
let blipped = false; const once = new Set(); const first = (k) => (is(k) && !once.has(k) ? (once.add(k), true) : false);
const fill = Number(process.env.STUB_FILL || 0);
const history = [...Array.from({ length: fill }, (_, i) => ({ external_id: process.env.STUB_FILL_ID || 'x-fill-' + i, upload_timestamp: '2026-01-01T00:00:00Z' })), ...JSON.parse(process.env.STUB_HISTORY || '[]')];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes('gemini-3-pro-image:generateContent')) { inc('frame'); if (is('frame503')) return json({ error: { message: 'down' } }, 503); if (first('frametimeout')) throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); if (first('frame200bad')) return new Response('<html>', { status: 200 }); return json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: Buffer.from('png').toString('base64') } }] } }] }); }
  if (u.includes(':generateContent')) {
    inc('judge');
    const n = JSON.parse(init.body).contents[0].parts.filter((p) => p.inlineData).length;
    if ((is('framejudgenet') && n <= 2) || (is('clipjudgenet') && n > 2)) throw new TypeError('fetch failed');
    const ok = !(n > 2 && is('clipfail'));
    return json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ same_character: ok, text_present: false, face_deformed: false, reasons: ok ? '' : 'stub' }) }] } }] });
  }
  if (u.includes(':predictLongRunning')) {
    inc('predict');
    if (first('predict429')) return json({ error: { message: 'busy' } }, 429);
    if (first('predictnet')) throw netErr('ECONNREFUSED'); // لم يصل Google: إعادة مجّانيّة
    if (first('predictreset')) throw netErr('ECONNRESET'); // انقطع بعد الإرسال: ربما حُوسب
    if (is('predict400')) return json({ error: { message: 'bad' } }, 400);
    if (is('predictnoop')) return json({});
    return json({ name: 'models/veo/operations/op' + C.predict });
  }
  if (u.includes('/operations/')) {
    inc('poll');
    if (is('blip') && !blipped) { blipped = true; throw new TypeError('fetch failed'); }
    if (is('pending')) return json({ done: false });
    if (is('veofail')) return json({ done: true, error: { message: 'Internal error' } });
    if (is('veoblocked')) return json({ done: true, response: { generateVideoResponse: { raiMediaFilteredReasons: ['child safety'] } } });
    return json({ done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: 'https://dl.example/v.mp4' } }] } } });
  }
  if (u.startsWith('https://dl.example/')) { inc('download'); return is('dlfail') ? new Response('no', { status: 503 }) : new Response(Buffer.from('mp4')); }
  if (u.includes('api.upload-post.com')) {
    if (u.includes('/uploadposts/history')) { inc('historyPage'); const p = Number(new URL(u).searchParams.get('page') || 1); return json({ history: history.slice((p - 1) * 100, p * 100) }); }
    if (u.includes('/uploadposts/users')) return json({ profiles: [{ username: 'omranaibuilder', social_accounts: { instagram: {}, x: {} } }] });
    if (u.includes('/uploadposts/status')) return json({ status: 'completed', results: [] });
    if (u.endsWith('/upload')) { inc('upload'); uploads.push(init.body.get('external_id')); return json({ request_id: 'r1' }, 202); }
    return json({});
  }
  if (u.includes('api.github.com')) {
    if ((init.method || 'GET') === 'POST') { inc('issue'); issues.push(JSON.parse(init.body).title); return is('issuepost500') ? json({ message: 'down' }, 500) : is('issuepost403') ? json({ message: 'forbidden' }, 403) : json({ number: 1 }, 201); }
    issueGets.push(u);
    if (is('issues500')) return json({ message: 'down' }, 500);
    if (is('issuesbad')) return json({ message: 'odd' });
    const sp = new URL(u).searchParams, want = sp.get('state') || 'open', pg = Number(sp.get('page') || 1), per = Number(sp.get('per_page') || 30);
    const all = [...Array.from({ length: Number(process.env.STUB_ISSUE_FILL || 0) }, (_, i) => ({ title: 'issue ' + i })), ...JSON.parse(process.env.STUB_ISSUES || '[]')];
    return json(all.filter((x) => want === 'all' || (x.state || 'open') === want).slice((pg - 1) * per, pg * per));
  }
  if (u.includes('/api/account')) return json({ token: 'tok' });
  if (u.includes('/api/points')) return json({ tier: 'vip' });
  if (u.includes('/api/tts')) {
    inc('tts');
    const text = JSON.parse(init.body).text;
    if (first('tts503once') || (is('tts1fail') && text === 'يالله نشوف')) return new Response('down', { status: 503 });
    if (is('tts401')) return new Response('no', { status: 401 });
    return new Response(Buffer.from('mp3'), { status: 200, headers: is('fallback') ? { 'X-TTS-Tier': 'fallback' } : {} });
  }
  return json({}, 404);
};
process.on('exit', () => { if (process.env.STUB_COUNTS) fs.writeFileSync(process.env.STUB_COUNTS, JSON.stringify({ ...C, uploads, issues, issueGets })); });
