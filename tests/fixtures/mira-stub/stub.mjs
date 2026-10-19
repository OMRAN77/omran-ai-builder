// محرّكات مزيّفة لاختبار مسلسل ميرا كاملًا (social-bot.mjs --mira) بلا شبكة ولا إنفاق: fetch موجّه بالرابط، والمؤقّتات فوريّة،
// وplaywright بديل (hooks.mjs)، وffmpeg/ffprobe بديلان في bin/. العدّادات تُكتب في STUB_COUNTS عند الخروج.
import { register } from 'node:module';
import fs from 'node:fs';
register(new URL('./hooks.mjs', import.meta.url));
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => realSetTimeout(fn, 0, ...a);
const C = {}; const inc = (k) => (C[k] = (C[k] || 0) + 1);
const mode = process.env.STUB_MODE || 'ok'; // ok | clipfail | blip | fallback | dlfail
const json = (o, status = 200, headers = {}) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const uploads = [], issues = [];
let blipped = false;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes('gemini-3-pro-image:generateContent')) { inc('frame'); return json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: Buffer.from('png').toString('base64') } }] } }] }); }
  if (u.includes(':generateContent')) {
    inc('judge');
    const n = JSON.parse(init.body).contents[0].parts.filter((p) => p.inlineData).length;
    const ok = !(n > 2 && mode === 'clipfail');
    return json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ same_character: ok, text_present: false, face_deformed: false, reasons: ok ? '' : 'stub' }) }] } }] });
  }
  if (u.includes(':predictLongRunning')) { inc('predict'); return json({ name: 'models/veo/operations/op' + C.predict }); }
  if (u.includes('/operations/')) {
    inc('poll');
    if (mode === 'blip' && !blipped) { blipped = true; throw new TypeError('fetch failed'); }
    return json({ done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: 'https://dl.example/v.mp4' } }] } } });
  }
  if (u.startsWith('https://dl.example/')) { inc('download'); return mode === 'dlfail' ? new Response('no', { status: 503 }) : new Response(Buffer.from('mp4')); }
  if (u.includes('api.upload-post.com')) {
    if (u.includes('/uploadposts/history')) return json({ history: JSON.parse(process.env.STUB_HISTORY || '[]') });
    if (u.includes('/uploadposts/users')) return json({ profiles: [{ username: 'omranaibuilder', social_accounts: { instagram: {}, x: {} } }] });
    if (u.includes('/uploadposts/status')) return json({ status: 'completed', results: [] });
    if (u.endsWith('/upload')) { inc('upload'); uploads.push(init.body.get('external_id')); return json({ request_id: 'r1' }, 202); }
    return json({});
  }
  if (u.includes('api.github.com')) {
    if ((init.method || 'GET') === 'POST') { inc('issue'); issues.push(JSON.parse(init.body).title); return json({ number: 1 }, 201); }
    return json(JSON.parse(process.env.STUB_ISSUES || '[]'));
  }
  if (u.includes('/api/account')) return json({ token: 'tok' });
  if (u.includes('/api/points')) return json({ tier: 'vip' });
  if (u.includes('/api/tts')) { inc('tts'); return new Response(Buffer.from('mp3'), { status: 200, headers: mode === 'fallback' ? { 'X-TTS-Tier': 'fallback' } : {} }); }
  return json({}, 404);
};
process.on('exit', () => { if (process.env.STUB_COUNTS) fs.writeFileSync(process.env.STUB_COUNTS, JSON.stringify({ ...C, uploads, issues })); });
