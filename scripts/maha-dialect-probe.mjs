// scripts/maha-dialect-probe.mjs — مسبار لهجة مها (أمر المالك ١٨ أكتوبر: «جرّبها كلها على مها، وسجّل لكل طلب: فهمته صح؟ ردّت
// بالخليجي مو بالفصحى؟ فتحت النافذة الصح؟ كم ثانية لين بدت تتكلم؟»).
//
// يشغّل معالج الجلسة الحقيقيّ api/_lib/realtime-session.js كما في الإنتاج — التعليمات والأدوات وكشف نهاية الكلام والنموذج
// والصوت من الكود نفسه — لمشترك يتحكّم في التطبيق، بذاكرة فارغة (لا بيانات مستخدم في السجلّ العامّ)، بتوقيت أبوظبي. ثمّ يكلّمها
// بصوت: كلّ طلب يُنطق بلهجة إماراتيّة (تحويل نصّ إلى كلام، يُخبّأ فتسمع التشغيلات كلّها الصوت نفسه)، ويُبثّ بإيقاع الكلام
// الحقيقيّ على WebSocket الجلسة، ويُسجَّل: أوّل صوت منها بعد نهاية الكلام (م.ث)، وكلامها مكتوبًا، والأدوات التي نادتها.
// الأدوات لا تُنفَّذ: ردّ نجاح مصطنع بشكل ردّ المتصفّح (فلا صورة ولا فيديو ولا تذكير ولا ذاكرة تُكتب ولا إنفاق).
//
// الشغل في GitHub Actions (maha-dialect-probe.yml) بمفتاح المستودع OPENAI_API_KEY. محلّيًّا:
//   OPENAI_API_KEY=… node scripts/maha-dialect-probe.mjs [--only 3,9] [--cache /tmp/maha-tts] [--out results.json]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i === -1 ? d : process.argv[i + 1]; };
const ONLY = String(arg('only', '') || '').split(',').map(Number).filter(Boolean);
const CACHE = arg('cache', process.env.MAHA_TTS_CACHE || path.join(ROOT, '.maha-tts-cache'));
const OUT = arg('out', process.env.MAHA_PROBE_OUT || 'maha-dialect-results.json');
const KEY = String(process.env.OPENAI_API_KEY || '').trim();
if (!KEY) { console.error('✗ OPENAI_API_KEY غائب'); process.exit(2); }

const REQUESTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'maha-dialect-requests.json'), 'utf8'))
  .filter((r) => !ONLY.length || ONLY.includes(r.id));

// ── ١) الصوت: كلّ طلب بلهجة إماراتيّة، PCM ‎24kHz 16‑bit أحاديّ (صيغة الجلسة نفسها)، مخبّأ ببصمة النصّ والإعداد ──
const TTS = { model: 'gpt-4o-mini-tts', voice: 'ash', instructions: 'You are a native Emirati man from Abu Dhabi talking casually to a voice assistant on the phone. Speak natural everyday Emirati Arabic exactly as written (pronounce چ as ch, ي in يديدة as y), relaxed conversational pace, no Fus-ha.' };
async function speech(text) {
  fs.mkdirSync(CACHE, { recursive: true });
  const f = path.join(CACHE, crypto.createHash('sha256').update(JSON.stringify([TTS, text])).digest('hex').slice(0, 24) + '.pcm');
  if (fs.existsSync(f)) return fs.readFileSync(f);
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...TTS, input: text, response_format: 'pcm' }),
  });
  if (!r.ok) throw new Error('tts ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(f, buf);
  return buf;
}
// نهاية الكلام الفعليّة داخل الصوت (بلا الصمت في ذيله): آخر نافذة ٢٠م.ث تتجاوز عتبة الطاقة
function speechEndMs(pcm) {
  const win = 480 * 2; // 20ms @24kHz × 2 بايت
  let last = 0;
  for (let o = 0; o + win <= pcm.length; o += win) {
    let s = 0;
    for (let i = o; i < o + win; i += 2) { const v = pcm.readInt16LE(i); s += v * v; }
    if (Math.sqrt(s / 480) > 500) last = o + win;
  }
  return Math.round(last / 48);
}

// ── ٢) الجلسة: معالج الإنتاج نفسه، بتخزين في الذاكرة وحصّة مفتوحة — مشترك (المالك) يتحكّم في التطبيق ──
process.env.AUTH_SECRET = process.env.AUTH_SECRET || crypto.randomBytes(24).toString('hex');
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
delete process.env.MAHA_TURN; // إعداد الإنتاج الافتراضيّ
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
const mahaApp = require(lib('maha-app.js'));
const handler = require(lib('realtime-session.js'));
const OWNER_TOKEN = auth.makeToken(require(lib('_owner.js')).ownerList()[0] || 'omran');

async function mintSession() {
  const body = {
    token: OWNER_TOKEN, timezone: 'Asia/Dubai', mode: 'assistant', voiceGender: 'female', voiceSpeed: 'normal',
    lastCallAgoMs: 2 * 86400000, // صديقة تعرفه: لا «أنا مها» في كلّ طلب
    app: { lang: 'ar', tools: mahaApp.knownTools('ar') }, desktop: true,
  };
  return new Promise((resolve, reject) => {
    const res = {
      _s: 200, setHeader() { return this; }, status(c) { this._s = c; return this; }, end() { reject(new Error('session ' + this._s)); },
      json(b) { (this._s === 200 && b.clientSecret) ? resolve(b) : reject(new Error('session ' + this._s + ' ' + JSON.stringify(b).slice(0, 300))); },
      send(t) { reject(new Error('session ' + this._s + ' ' + String(t).slice(0, 300))); },
    };
    Promise.resolve(handler({ method: 'POST', headers: {}, body }, res)).catch(reject);
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
      if (/جو|طقس|حرار|weather|العين/i.test(q)) return { ok: true, results: 'طقس العين غدًا: مشمس وحارّ نسبيًّا، العظمى ٣٧ والصغرى ٢٤، رطوبة منخفضة ورياح خفيفة.' };
      return { ok: false, message: 'No useful search results found; answer from your own knowledge and say briefly if unsure.' };
    }
    case 'set_reminder': return { ok: true, message: 'Reminder saved: ' + (args.message || '') };
    case 'remember_info': return { ok: true };
    case 'build_app': return { ok: true, message: 'Built and shown in the preview panel.' };
    default: return { ok: false, message: 'Not available in this call.' };
  }
}

// ── ٤) مكالمة واحدة لكلّ طلب ──
async function runOne(reqItem) {
  const pcm = await speech(reqItem.text);
  const speechEnd = speechEndMs(pcm);
  const sess = await mintSession();
  const { default: WebSocket } = await import('ws');
  const ws = new WebSocket('wss://api.openai.com/v1/realtime?model=' + encodeURIComponent(sess.model), { headers: { Authorization: 'Bearer ' + sess.clientSecret } });
  const ev = [];
  const out = { id: reqItem.id, text: reqItem.text, kind: reqItem.kind, speechMs: speechEnd, turn: sess.turn, appControl: sess.appControl, tools: [], transcript: [], errors: [] };
  const t = () => Date.now();
  let tStream = 0, tSpeechEnd = 0, tStopped = 0, tFirstAudio = 0, responses = 0, pendingCalls = 0, done = false;
  const finish = new Promise((resolve) => {
    const cap = setTimeout(() => { out.errors.push('timeout'); resolve(); }, 45000);
    let idle = null;
    const settle = () => { clearTimeout(idle); idle = setTimeout(() => { if (!pendingCalls) { done = true; clearTimeout(cap); resolve(); } }, 2500); };
    ws.on('message', (raw) => {
      let e; try { e = JSON.parse(raw.toString()); } catch (x) { return; }
      ev.push(e.type);
      if (e.type === 'error') out.errors.push((e.error && (e.error.code || e.error.message)) || 'error');
      if (e.type === 'input_audio_buffer.speech_stopped' && !tStopped) tStopped = t();
      if ((e.type === 'response.output_audio.delta' || e.type === 'response.audio.delta') && !tFirstAudio) tFirstAudio = t();
      if (e.type === 'response.output_audio_transcript.done' || e.type === 'response.audio_transcript.done') out.transcript.push(e.transcript || '');
      if (e.type === 'response.created') { responses++; clearTimeout(idle); }
      if (e.type === 'response.function_call_arguments.done') {
        let a = {}; try { a = JSON.parse(e.arguments || '{}'); } catch (x) { a = {}; }
        out.tools.push({ name: e.name, args: a, atMs: tSpeechEnd ? t() - tSpeechEnd : null });
        pendingCalls++;
        ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: e.call_id, output: JSON.stringify(fakeOutput(e.name, a)) } }));
      }
      if (e.type === 'response.done') {
        if (pendingCalls) { pendingCalls = 0; ws.send(JSON.stringify({ type: 'response.create' })); } // كالمتصفّح: الردّ بعد ناتج الأداة
        else settle();
      }
    });
  });
  await new Promise((resolve, reject) => {
    ws.on('error', reject);
    ws.on('message', function first(raw) { const e = JSON.parse(raw.toString()); if (e.type === 'session.created' || e.type === 'session.updated') { ws.off('message', first); resolve(); } });
  });
  // بإيقاع الكلام الحقيقيّ: ١٠٠م.ث كلّ ١٠٠م.ث، ثمّ صمت حتّى تقرّر الجلسة أنّ الجملة انتهت (٤ث على الأكثر)
  const CH = 4800;
  tStream = t();
  tSpeechEnd = tStream + speechEnd;
  for (let o = 0; o < pcm.length; o += CH) {
    ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: pcm.subarray(o, o + CH).toString('base64') }));
    await new Promise((r) => setTimeout(r, 100));
  }
  const silence = Buffer.alloc(CH).toString('base64');
  for (let i = 0; i < 40 && !tStopped; i++) { ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: silence })); await new Promise((r) => setTimeout(r, 100)); }
  await finish;
  ws.close();
  out.firstVoiceMs = tFirstAudio ? tFirstAudio - tSpeechEnd : null; // من نهاية كلامه إلى أوّل صوت منها
  out.vadMs = tStopped ? tStopped - tSpeechEnd : null;           // متى قرّرت أنّه خلّص
  out.responses = responses;
  out.done = done;
  return out;
}

// --dry: يسكّ جلسة واحدة ويطبع ما وصل المزوّد (طول التعليمات، الأدوات، كشف نهاية الكلام) بلا مكالمة — فحص المسبار نفسه.
if (process.argv.includes('--dry')) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('/realtime/client_secrets')) {
      const c = JSON.parse(opts.body).session;
      console.log('MAHA_DRY ' + JSON.stringify({ model: c.model, instructionsChars: c.instructions.length, tools: c.tools.map((x) => x.name), turn: c.audio.input.turn_detection, voice: c.audio.output.voice, speed: c.audio.output.speed }));
      return new Response(JSON.stringify({ value: 'ek_dry' }), { status: 200 });
    }
    return realFetch(url, opts);
  };
  const s = await mintSession();
  console.log('MAHA_DRY_SESSION ' + JSON.stringify({ turn: s.turn, appControl: s.appControl, model: s.model }));
  process.exit(0);
}

const results = [];
for (const r of REQUESTS) {
  let res;
  try { res = await runOne(r); } catch (e) { res = { id: r.id, text: r.text, kind: r.kind, errors: [String(e && e.message || e).slice(0, 300)] }; }
  results.push(res);
  console.log('MAHA_RESULT ' + JSON.stringify(res));
}
fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), requests: REQUESTS.length, results }, null, 2));
const ok = results.filter((r) => r.firstVoiceMs != null).map((r) => r.firstVoiceMs).sort((a, b) => a - b);
const med = ok.length ? ok[Math.floor(ok.length / 2)] : null;
console.log('MAHA_SUMMARY ' + JSON.stringify({ runs: results.length, voiced: ok.length, medianFirstVoiceMs: med, errors: results.filter((r) => r.errors && r.errors.length).length }));
process.exit(0);
