// scripts/maha-dialect-probe.mjs — مسبار لهجة مها (أمر المالك ١٨ أكتوبر: «جرّبها كلها على مها، وسجّل لكل طلب: فهمته صح؟ ردّت
// بالخليجي مو بالفصحى؟ فتحت النافذة الصح؟ كم ثانية لين بدت تتكلم؟»).
//
// كلّ طلب من scripts/maha-dialect-requests.json يُنطق بصوت رجل إماراتيّ (مخبّأ: القبل والبعد يسمعان الصوت نفسه)، ويُبثّ بإيقاع
// الكلام الحقيقيّ على جلسة مها، ويُسجَّل: أوّل صوت منها بعد نهاية الكلام (م.ث)، وكلامها مكتوبًا، والأدوات التي نادتها.
// الأدوات لا تُنفَّذ: ردّ نجاح مصطنع بشكل ردّ المتصفّح (لا صورة ولا تذكير ولا ذاكرة تُكتب ولا إنفاق غير المكالمة نفسها).
//
// وضعان:
//   prod  (MAHA_TOKEN): الموقع المنشور نفسه — /api/realtime-session كما يناديه التطبيق، و/api/tts لصوت الطلب. الرمز رمز جلسة
//         المالك (SAMPLE_TOKEN)؛ ما لم تكن الجلسة بلا حدّ يتوقّف (لا تُخصم دقائق مشترك). ذاكرة المالك تصل مها، فكلامها ومعاملات
//         أدواتها تُختم بالمفتاح العامّ scripts/maha-probe-seal.pub.pem (السجلّ العامّ يرى الأرقام وأسماء الأدوات وحدها).
//   local (OPENAI_API_KEY): معالج الجلسة الحقيقيّ api/_lib/realtime-session.js في العمليّة نفسها لمالك بذاكرة فارغة.
//   --dry: يسكّ جلسة محلّيّة ويطبع ما يصل المزوّد بلا مكالمة (اختبار المسبار نفسه).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i === -1 ? d : process.argv[i + 1]; };
const DRY = process.argv.includes('--dry');
const ONLY = String(arg('only', '') || '').split(',').map(Number).filter(Boolean);
const CACHE = arg('cache', process.env.MAHA_TTS_CACHE || path.join(ROOT, '.maha-tts-cache'));
const OUT = arg('out', process.env.MAHA_PROBE_OUT || 'maha-dialect-results.json');
const BASE = String(process.env.MAHA_BASE || 'https://omran-ai-builder.vercel.app').replace(/\/+$/, '');
const TOKEN = String(process.env.MAHA_TOKEN || '').trim();
const KEY = String(process.env.OPENAI_API_KEY || '').trim();
const MODE = DRY ? 'local' : (TOKEN ? 'prod' : 'local');
if (MODE === 'local' && !KEY) { console.error('✗ لا MAHA_TOKEN ولا OPENAI_API_KEY'); process.exit(2); }

const REQUESTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'maha-dialect-requests.json'), 'utf8'))
  .filter((r) => !ONLY.length || ONLY.includes(r.id));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── ١) الصوت: PCM ‎24kHz 16‑bit أحاديّ (صيغة الجلسة)، مخبّأ ببصمة النصّ والإعداد ──
const TTS = { model: 'gpt-4o-mini-tts', voice: 'ash', instructions: 'You are a native Emirati man from Abu Dhabi talking casually to a voice assistant on the phone. Speak natural everyday Emirati Arabic exactly as written (pronounce چ as ch, ي in يديدة as y), relaxed conversational pace, no Fus-ha.' };
async function speech(text) {
  fs.mkdirSync(CACHE, { recursive: true });
  const f = path.join(CACHE, crypto.createHash('sha256').update(JSON.stringify([TTS, text])).digest('hex').slice(0, 24) + '.pcm');
  if (fs.existsSync(f)) return fs.readFileSync(f);
  let pcm;
  if (MODE === 'prod') {
    let mp3 = null;
    for (let a = 1; a <= 3 && !mp3; a++) {
      const r = await fetch(BASE + '/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...TTS, text, lang: 'ar', token: TOKEN }) });
      const b = Buffer.from(await r.arrayBuffer());
      if (r.ok && b.length > 2000) mp3 = b; else await sleep(3000 * a);
      if (!mp3 && a === 3) throw new Error('tts ' + r.status + ' ' + b.toString('utf8', 0, 160));
    }
    pcm = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-f', 's16le', '-ac', '1', '-ar', '24000', 'pipe:1'], { input: mp3, maxBuffer: 64 << 20 });
  } else {
    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...TTS, input: text, response_format: 'pcm' }),
    });
    if (!r.ok) throw new Error('tts ' + r.status + ' ' + (await r.text()).slice(0, 200));
    pcm = Buffer.from(await r.arrayBuffer());
  }
  fs.writeFileSync(f, pcm);
  return pcm;
}
// نهاية الكلام الفعليّة داخل الصوت (بلا صمت الذيل): آخر نافذة ٢٠م.ث تتجاوز عتبة الطاقة
function speechEndMs(pcm) {
  const win = 480 * 2;
  let last = 0;
  for (let o = 0; o + win <= pcm.length; o += win) {
    let s = 0;
    for (let i = o; i < o + win; i += 2) { const v = pcm.readInt16LE(i); s += v * v; }
    if (Math.sqrt(s / 480) > 500) last = o + win;
  }
  return Math.round(last / 48);
}

// ── ٢) الجلسة ──
const SESSION_BODY = (tools) => ({
  timezone: 'Asia/Dubai', mode: 'assistant', voiceGender: 'female', voiceSpeed: 'normal',
  lastCallAgoMs: 2 * 86400000, // صديقة تعرفه: لا «أنا مها» في كلّ طلب
  app: { lang: 'ar', tools }, desktop: true,
});
let localHandler = null, localToken = '', localTools = null;
function loadLocal() {
  if (localHandler) return;
  process.env.AUTH_SECRET = process.env.AUTH_SECRET || crypto.randomBytes(24).toString('hex');
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
  delete process.env.MAHA_TURN;
  const lib = (f) => require.resolve(path.join(ROOT, 'api', '_lib', f));
  const mock = (f, exports) => { const id = lib(f); require.cache[id] = { id, filename: id, loaded: true, exports }; };
  const store = new Map();
  const kv = {
    kvGetJSON: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
    kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
    kvGetRaw: async (k) => (store.has(k) ? store.get(k) : null),
    kvSetRaw: async (k, v) => { store.set(k, String(v)); },
    kvSetIfAbsent: async (k, v) => { if (store.has(k)) return false; store.set(k, String(v)); return true; },
    kvIncr: async (k) => { const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
    kvIncrBy: async (k, n) => { const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; },
    kvDecrBy: async (k, n) => { const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
    kvDel: async (k) => { store.delete(k); },
    kvExpire: async () => {},
    kvList: async (p) => [...store.keys()].filter((k) => k.startsWith(p)),
  };
  mock('kv.js', new Proxy(kv, { get: (t, p) => t[p] || (async () => null) }));
  mock('log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
  mock('_usage.js', { checkAndConsume: async () => ({ allowed: true }), DAILY_LIMIT: 99, clientIp: () => '203.0.113.7' });
  const auth = require(lib('auth.js'));
  localTools = require(lib('maha-app.js')).knownTools('ar');
  localHandler = require(lib('realtime-session.js'));
  localToken = auth.makeToken(require(lib('_owner.js')).ownerList()[0] || 'omran');
}
function appTools() {
  if (MODE === 'local') { loadLocal(); return localTools; }
  // أدوات الشاشة كما يرسلها المتصفّح — من مصدرها في الخادم (بلا تحميل معالج الجلسة)
  return require(path.join(ROOT, 'api', '_lib', 'maha-app.js')).knownTools('ar');
}
// رمز غير المالك = دقائق تُخصم من حساب آخر: التحقّق من صاحب الرمز (verify لا يخصم شيئًا) قبل أيّ جلسة.
let ownerChecked = false;
async function ownerCheck() {
  if (ownerChecked) return;
  const r = await fetch(BASE + '/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'verify', token: TOKEN }) });
  const j = await r.json().catch(() => ({}));
  const owners = String(process.env.MAHA_OWNER || 'omran').toLowerCase().split(',').map((x) => x.trim());
  if (!r.ok || !owners.includes(String(j.username || '').trim().toLowerCase())) {
    console.error('✗ الرمز ليس رمز المالك (' + (r.ok ? 'حساب آخر' : 'HTTP ' + r.status) + ') — لا مكالمة');
    process.exit(3);
  }
  ownerChecked = true;
}
async function mintSession() {
  if (MODE === 'prod') {
    await ownerCheck();
    const r = await fetch(BASE + '/api/realtime-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: TOKEN, ...SESSION_BODY(appTools()) }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.clientSecret) throw new Error('session ' + r.status + ' ' + String(j.error || '').slice(0, 160));
    if (!(j.mahaBudget && j.mahaBudget.unlimited) && process.env.MAHA_ALLOW_PAID !== '1') { console.error('✗ الرمز ليس للمالك (الجلسة تُخصم دقائق) — توقّف'); process.exit(3); }
    return j;
  }
  loadLocal();
  const body = { token: localToken, ...SESSION_BODY(localTools) };
  return new Promise((resolve, reject) => {
    const res = {
      _s: 200, setHeader() { return this; }, status(c) { this._s = c; return this; }, end() { reject(new Error('session ' + this._s)); },
      json(b) { (this._s === 200 && b.clientSecret) ? resolve(b) : reject(new Error('session ' + this._s + ' ' + JSON.stringify(b).slice(0, 300))); },
      send(t) { reject(new Error('session ' + this._s + ' ' + String(t).slice(0, 300))); },
    };
    Promise.resolve(localHandler({ method: 'POST', headers: {}, body }, res)).catch(reject);
  });
}

// ── ٣) الأدوات: ردود نجاح بشكل ردود المتصفّح، بلا تنفيذ ──
function fakeOutput(name, args) {
  switch (name) {
    case 'open_in_app': return { ok: true, message: 'The ' + args.target + ' screen is open on the user\'s screen now.' };
    case 'app_action': return args.action === 'read_last_reply' ? { ok: true, text: 'آخر ردّ في المحادثة كان عن وصفة لقيمات.' } : { ok: true, message: 'Done: ' + args.action };
    case 'generate_image': case 'edit_image': return { ok: true, message: 'The picture was created and is shown on the user\'s screen now - do not describe it in detail, just confirm briefly.' };
    case 'find_real_photo': return { ok: true, message: 'A real photo was found on the web and shown to the user on screen - do not describe it in detail, just briefly confirm you found and showed it.' };
    case 'search_web': {
      const q = String(args.query || '');
      if (/جو|طقس|حرار|weather|العين|al ?ain/i.test(q)) return { ok: true, results: 'طقس العين غدًا: مشمس وحارّ نسبيًّا، العظمى ٣٧ والصغرى ٢٤، رطوبة منخفضة ورياح خفيفة.' };
      return { ok: false, message: 'No useful search results found; answer from your own knowledge and say briefly if unsure.' };
    }
    case 'set_reminder': return { ok: true, message: 'Reminder saved: ' + (args.message || '') };
    case 'remember_info': return { ok: true };
    case 'build_app': return { ok: true, message: 'Built and shown in the preview panel.' };
    default: return { ok: false, message: 'Not available in this call.' };
  }
}

// ── ٤) مكالمة واحدة لكلّ طلب ──
// كالمايك المفتوح: الكلام بإيقاعه ثمّ صمت متّصل حتّى تنتهي المكالمة. التشغيلة الأولى (39155532362) أوقفت الصمت عند أوّل
// speech_stopped، فوقفة عند فاصلة وسط الجملة («مها، أبا…») أنهت البثّ قبل أن تكمل الجملة — سبعة طلبات بلا ردّ لم تكن من مها.
async function runOne(reqItem) {
  const pcm = await speech(reqItem.text);
  const speechEnd = speechEndMs(pcm);
  const sess = await mintSession();
  const { default: WebSocket } = await import('ws');
  const ws = new WebSocket('wss://api.openai.com/v1/realtime?model=' + encodeURIComponent(sess.model), { headers: { Authorization: 'Bearer ' + sess.clientSecret } });
  const out = { id: reqItem.id, text: reqItem.text, kind: reqItem.kind, speechMs: speechEnd, turn: sess.turn, appControl: sess.appControl, tools: [], transcript: [], cut: [], earlyStops: 0, errors: [] };
  const t = () => Date.now();
  let tSpeechEnd = 0, tStopped = 0, tFirstAudio = 0, tEarlyAudio = 0, responses = 0, pendingCalls = 0, done = false;
  const said = new Map(); // كلامها لكلّ ردّ — الردّ الذي قطعته بقيّة جملته (cancelled) يُعزل في cut
  const finish = new Promise((resolve) => {
    const cap = setTimeout(() => { out.errors.push('timeout'); resolve(); }, 45000);
    let idle = null;
    const settle = () => { clearTimeout(idle); idle = setTimeout(() => { if (!pendingCalls) { done = true; clearTimeout(cap); resolve(); } }, 2500); };
    ws.on('message', (raw) => {
      let e; try { e = JSON.parse(raw.toString()); } catch (x) { return; }
      const now = t();
      if (e.type === 'error') out.errors.push((e.error && (e.error.code || e.error.message)) || 'error');
      if (e.type === 'input_audio_buffer.speech_started') clearTimeout(idle);
      // وقفة وسط جملته (قبل نهايتها بأكثر من ٣٠٠م.ث) ليست نهاية كلامه
      if (e.type === 'input_audio_buffer.speech_stopped') { if (now < tSpeechEnd - 300) out.earlyStops++; else if (!tStopped) tStopped = now; }
      if (e.type === 'response.output_audio.delta' || e.type === 'response.audio.delta') {
        if (now >= tSpeechEnd) { if (!tFirstAudio) tFirstAudio = now; } else if (!tEarlyAudio) tEarlyAudio = now; // تكلّمت وهو لم يكمل
      }
      if (e.type === 'response.output_audio_transcript.done' || e.type === 'response.audio_transcript.done') {
        const k = e.response_id || '';
        if (!said.has(k)) said.set(k, []);
        said.get(k).push(e.transcript || '');
      }
      if (e.type === 'response.created') { responses++; clearTimeout(idle); }
      if (e.type === 'response.function_call_arguments.done') {
        let a = {}; try { a = JSON.parse(e.arguments || '{}'); } catch (x) { a = {}; }
        out.tools.push({ name: e.name, args: a, atMs: tSpeechEnd ? now - tSpeechEnd : null });
        pendingCalls++;
        ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: e.call_id, output: JSON.stringify(fakeOutput(e.name, a)) } }));
      }
      if (e.type === 'response.done') {
        const id = (e.response && e.response.id) || '';
        const cancelled = e.response && e.response.status === 'cancelled';
        (cancelled ? out.cut : out.transcript).push(...(said.get(id) || []));
        said.delete(id);
        if (pendingCalls) { pendingCalls = 0; ws.send(JSON.stringify({ type: 'response.create' })); } // كالمتصفّح: الردّ بعد ناتج الأداة
        else if (!cancelled && now >= tSpeechEnd) settle();
      }
    });
  });
  await new Promise((resolve, reject) => {
    ws.on('error', reject);
    ws.on('message', function first(raw) { const e = JSON.parse(raw.toString()); if (e.type === 'session.created' || e.type === 'session.updated') { ws.off('message', first); resolve(); } });
  });
  // بإيقاع الكلام الحقيقيّ على جدول مطلق (١٠٠م.ث لكلّ قطعة، بلا انجراف يؤخّر نهاية الجملة عن tSpeechEnd)
  const CH = 4800;
  const tStream = t();
  tSpeechEnd = tStream + speechEnd;
  let n = 0;
  const pace = () => sleep(Math.max(0, tStream + ++n * 100 - t()));
  for (let o = 0; o < pcm.length; o += CH) {
    ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: pcm.subarray(o, o + CH).toString('base64') }));
    await pace();
  }
  let ended = false;
  finish.then(() => { ended = true; });
  const silence = Buffer.alloc(CH).toString('base64');
  while (!ended && ws.readyState === 1) { ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: silence })); await pace(); }
  await finish;
  ws.close();
  out.firstVoiceMs = tFirstAudio ? tFirstAudio - tSpeechEnd : null; // من نهاية كلامه إلى أوّل صوت منها
  out.vadMs = tStopped ? tStopped - tSpeechEnd : null;           // متى قرّرت أنّه خلّص
  out.talkedOverMs = tEarlyAudio ? tEarlyAudio - tSpeechEnd : null; // سالب = بدأت تتكلّم قبل أن يكمل
  out.responses = responses;
  out.done = done;
  return out;
}

// --dry: يسكّ جلسة محلّيّة ويطبع ما وصل المزوّد (طول التعليمات، الأدوات، كشف نهاية الكلام) بلا مكالمة — فحص المسبار نفسه.
if (DRY) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('/realtime/client_secrets')) {
      const c = JSON.parse(opts.body).session;
      console.log('MAHA_DRY ' + JSON.stringify({ model: c.model, instructionsChars: c.instructions.length, tools: c.tools.map((x) => x.name), turn: c.audio.input.turn_detection, voice: c.audio.output.voice, speed: c.audio.output.speed }));
      return new Response(JSON.stringify({ value: 'ek_dry' }), { status: 200 });
    }
    return realFetch(url, opts);
  };
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-dry';
  const s = await mintSession();
  console.log('MAHA_DRY_SESSION ' + JSON.stringify({ turn: s.turn, appControl: s.appControl, model: s.model }));
  process.exit(0);
}

// MAHA_SESSION_PATCH (الوضع المحلّيّ وحده): تجربة إعداد جلسة على الطلبات نفسها قبل كتابته في المعالج — JSON يُدمج في session
// قبل وصوله المزوّد (null يحذف الحقل). مثال: {"reasoning":{"effort":"minimal"}}. الرفض يظهر خطأ «session 400» في الصفّ.
const PATCH = (() => { try { return JSON.parse(process.env.MAHA_SESSION_PATCH || 'null'); } catch (e) { console.error('✗ MAHA_SESSION_PATCH ليس JSON'); process.exit(2); } })();
if (PATCH && MODE === 'local') {
  const realFetch = globalThis.fetch;
  const merge = (a, b) => {
    for (const [k, v] of Object.entries(b)) {
      if (v === null) delete a[k];
      else if (typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object') merge(a[k], v);
      else a[k] = v;
    }
    return a;
  };
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('/realtime/client_secrets')) {
      const b = JSON.parse(opts.body);
      merge(b.session, PATCH);
      opts = { ...opts, body: JSON.stringify(b) };
    }
    return realFetch(url, opts);
  };
  console.log('MAHA_PATCH ' + JSON.stringify(PATCH));
}

// الختم: في الإنتاج تصل ذاكرة المالك مها — كلامها ومعاملات أدواتها لا تُطبع في السجلّ العامّ إلّا مختومة.
function seal(obj) {
  const pubF = path.join(ROOT, 'scripts', 'maha-probe-seal.pub.pem');
  const k = crypto.randomBytes(32), iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  const ek = crypto.publicEncrypt({ key: fs.readFileSync(pubF, 'utf8'), oaepHash: 'sha256', padding: crypto.constants.RSA_PKCS1_OAEP_PADDING }, k);
  return [ek, iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}
const brief = (r) => ({ id: r.id, firstVoiceMs: r.firstVoiceMs, vadMs: r.vadMs, talkedOverMs: r.talkedOverMs, earlyStops: r.earlyStops, responses: r.responses, tools: (r.tools || []).map((x) => x.name + (x.args && x.args.target ? ':' + x.args.target : x.args && x.args.action ? ':' + x.args.action : '')), spokeChars: (r.transcript || []).join(' ').length, errors: r.errors });

console.log('MAHA_MODE ' + MODE + (MODE === 'prod' ? ' ' + BASE : ''));
const results = [];
for (const r of REQUESTS) {
  let res;
  try { res = await runOne(r); } catch (e) { res = { id: r.id, text: r.text, kind: r.kind, tools: [], transcript: [], errors: [String(e && e.message || e).slice(0, 300)] }; }
  results.push(res);
  console.log((MODE === 'prod' ? 'MAHA_ROW ' + JSON.stringify(brief(res)) : 'MAHA_RESULT ' + JSON.stringify(res)));
}
const payload = { at: new Date().toISOString(), mode: MODE, base: MODE === 'prod' ? BASE : null, requests: REQUESTS.length, results };
if (MODE === 'prod') {
  const blob = seal(payload);
  for (let i = 0; i < blob.length; i += 3000) console.log('MAHA_SEALED ' + Math.floor(i / 3000) + ' ' + blob.slice(i, i + 3000));
  fs.writeFileSync(OUT, JSON.stringify({ sealed: blob }));
} else fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
const ok = results.filter((r) => r.firstVoiceMs != null).map((r) => r.firstVoiceMs).sort((a, b) => a - b);
console.log('MAHA_SUMMARY ' + JSON.stringify({ mode: MODE, runs: results.length, voiced: ok.length, medianFirstVoiceMs: ok.length ? ok[Math.floor(ok.length / 2)] : null, errors: results.filter((r) => r.errors && r.errors.length).length }));
process.exit(0);
