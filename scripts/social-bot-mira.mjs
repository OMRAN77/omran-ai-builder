// مسلسل ميرا (طلب المالك ١٩ أكتوبر): نوع حلقة في بوت التسويق نفسه — لا صفحة ولا خدمة نشر جديدة.
// قصّتان × ٣٠ حلقة («ميرا والتطبيق السحري» و«ميرا تكتشف الإمارات») يوم من هذي ويوم من هذي، يوميًّا ٥ العصر بتوقيت الإمارات
// (وظيفة mira في social-bot.yml؛ حلقات البوت الحاليّة كلّ يومين ٨ المساء كما هي، ولا تلمس إحداهما رقم الأخرى ولا موعدها).
// كلّ حلقة: لكلّ مشهد إطار أوّل يُرسم من صورة ميرا الثابتة (assets/characters/c2.png) ← فحص الإطار بالذكاء قبل أيّ إنفاق على الفيديو
// ← مقطع ٨ ث بالمحرّك من ذلك الإطار ← فحص المقطع (نفس البنت، لا كتابة، لا وجه مشوّه) — الفشل يُعاد مرّة وحدة، والثاني = لا نشر وتنبيه
// للمالك. ثمّ ffmpeg: المقطعان + سرد إماراتيّ بصوت التطبيق (فاطمة) + ترجمة نرسمها نحن + بطاقة النهاية (الشعار والرابط).
// الحلقات في scripts/mira-episodes.json («live»: false حتّى يوافق المالك على حلقة DRY_RUN الأولى). الحالة من سجلّ Upload-Post
// بمعرّف mira-<قصّة>-<رقم> — لا يطابق omai-ep فلا يحرّك رقم حلقات البوت ولا بوّابة الـ٣٦ ساعة.
//
// البيئة (فوق بيئة social-bot.mjs): GEMINI_API_KEY (المحرّكات مباشرة من Actions) · MIRA_EP=app:3|uae:7 (حلقة محدّدة) ·
//   DRY_RUN=1 (صناعة بلا نشر؛ المعاينة في social-out/mira-preview) · GITHUB_TOKEN + GITHUB_REPOSITORY (مسألة تنبيه عند الفشل الثاني)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { log, gh, sleep, publish, resolvePlatforms, botAccount, upFetch, shortCaptions, qrSVG, SITE, QR_URL, W, H, FPS } from './social-bot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.env.OUT_DIR || path.join(ROOT, 'social-out'));
const BASE = (process.env.BASE || 'https://omran-ai-builder.vercel.app').replace(/\/$/, '');
const DRY = /^(1|true|yes)$/i.test(process.env.DRY_RUN || '');
const UP_KEY = process.env.UPLOAD_POST_API_KEY || '';
const UP_USER = process.env.UPLOAD_POST_USER || 'omranaibuilder';
const GKEY = () => String(process.env.GEMINI_API_KEY || '').trim();
const GL = 'https://generativelanguage.googleapis.com/v1beta';
export const EPISODES_FILE = process.env.MIRA_EPISODES_FILE ? path.resolve(process.env.MIRA_EPISODES_FILE) : path.join(ROOT, 'scripts/mira-episodes.json');
export const REF_IMAGE = path.join(ROOT, 'assets/characters/c2.png');
export const MODELS = { frame: 'gemini-3-pro-image', video: 'veo-3.1-fast-generate-preview', judge: 'gemini-flash-latest' };
export const CLIP_SEC = 8;
export const END_SEC = 3.5;
export const STORIES = { app: 'ميرا والتطبيق السحري', uae: 'ميرا تكتشف الإمارات' };
export const SERIES_NAME = 'مسلسل ميرا';
export const EVERY_H = 20; // يوميًّا: لا حلقتين خلال ٢٠ ساعة (إعادة تشغيل يدويّة أو تأخّر الجدول لا تنشر مرّتين)
export const MIRA_ID = (story, k) => 'mira-' + story + '-' + k;
export const MIRA_RE = /^mira-(app|uae)-(\d+)$/;
// قفل الشكل والنظافة يُلحق بكلّ أمر — الأوصاف في ملفّ الحلقات لا تعيد وصف وجهها.
export const NO_TEXT = 'Absolutely no text anywhere: no letters, numbers, words, subtitles, captions, signs, logos, watermarks or readable screens; any phone, tablet or laptop screen shows only glowing abstract colorful shapes and sparkles.';

export function loadEpisodes(file = EPISODES_FILE) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { live: j.live === true, character: String(j.character || ''), episodes: Array.isArray(j.episodes) ? j.episodes : [] };
}

// ───────── الحالة من سجلّ النشر ─────────
// آخر حلقة منشورة لكلّ قصّة، وآخر قصّة نُشرت ووقتها. صفوف السجلّ صفّ لكلّ منصّة — نفس المعرّف يتكرّر.
export function miraFromHistory(items) {
  const st = { app: 0, uae: 0, lastStory: '', lastAt: 0 };
  for (const it of items || []) {
    const m = MIRA_RE.exec(String((it && it.external_id) || ''));
    if (!m || it.success === false) continue;
    const story = m[1], k = Number(m[2]), at = Date.parse(it.upload_timestamp || '') || 0;
    st[story] = Math.max(st[story], k);
    if (at >= st.lastAt) { st.lastAt = at; st.lastStory = story; }
  }
  return st;
}

// الحلقة الجاية: القصّة الثانية غير آخر قصّة نُشرت (أوّلها «التطبيق السحري»)، ورقمها آخر منشور منها + 1. حلقة فشلت فحصها
// ولم تُنشر تُعاد في دور قصّتها التالي (لا تُتخطّى). قصّة خلصت ٣٠ ← الأخرى؛ خلصتا ← لا شيء.
// المراجعة: حلقة فشلت مرّتين لها مسألة تنبيه مفتوحة بعنوان «[mira-failed app:3]» — قصّتها تتوقّف (لا تُعاد كلّ يوم بإنفاق كامل)
// والقصّة الأخرى تكمل؛ إقفال المالك للمسألة يعيدها في دورها.
export const FAILED_TAG = (story, k) => '[mira-failed ' + story + ':' + k + ']';
export function blockedFrom(titles) {
  const out = new Set();
  for (const t of titles || []) { const m = /\[mira-failed (app|uae):(\d+)\]/.exec(String(t)); if (m) out.add(m[1] + ':' + Number(m[2])); }
  return out;
}
export function nextEpisode(st, episodes, forced, blocked) {
  const has = (story, k) => (blocked && blocked.has(story + ':' + k) ? null : episodes.find((e) => e.story === story && Number(e.k) === k) || null);
  if (forced) {
    const m = /^(app|uae)\s*:\s*(\d+)$/i.exec(String(forced).trim());
    if (!m) throw new Error('MIRA_EP should look like app:3 or uae:7');
    const ep = episodes.find((e) => e.story === m[1].toLowerCase() && Number(e.k) === Number(m[2])) || null; // المالك يفرضها ولو موقوفة
    if (!ep) throw new Error('episode ' + forced + ' is not in mira-episodes.json');
    return ep;
  }
  const first = st.lastStory === 'app' ? 'uae' : st.lastStory === 'uae' ? 'app' : 'app';
  for (const story of [first, first === 'app' ? 'uae' : 'app']) {
    const ep = has(story, (st[story] || 0) + 1);
    if (ep) return ep;
  }
  return null;
}

export const miraDue = (lastAt, nowMs, everyH = EVERY_H) => !lastAt || nowMs - lastAt >= everyH * 36e5;

// السجلّ كلّه (حتّى ٣٠٠٠ صفّ، قراءة مجّانيّة) لا آخر ٣٠٠ — صفّ لكلّ منصّة، فنافذة ثابتة صغيرة تُسقط الحلقات القديمة فيعود المسلسل من أوّله.
async function miraState() {
  const items = [];
  for (let page = 1; page <= 30; page++) {
    const r = await upFetch('/uploadposts/history?limit=100&status=success&page=' + page + '&profile_username=' + encodeURIComponent(UP_USER));
    if (!r.ok) throw new Error('upload history ' + r.status + ' ' + JSON.stringify(r.j).slice(0, 160));
    const h = (r.j && r.j.history) || [];
    items.push(...h);
    if (h.length < 100) break;
  }
  return miraFromHistory(items);
}

// عناوين مسائل التنبيه المفتوحة (للحلقات الموقوفة). بلا رمز GitHub (تشغيل محلّيّ) = لا شيء موقوف.
async function openAlertTitles() {
  const tok = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPOSITORY;
  if (!tok || !repo) return [];
  const r = await fetch('https://api.github.com/repos/' + repo + '/issues?state=open&per_page=100', { headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error('issues ' + r.status);
  const j = await r.json().catch(() => []);
  return (Array.isArray(j) ? j : []).filter((x) => x && !x.pull_request).map((x) => String(x.title || ''));
}

// ───────── الأوامر ─────────
export function framePrompt(character, ep, clip) {
  return [
    'Create one vertical 9:16 frame for a children\'s 3D animated series, in exactly the same 3D cartoon style as the reference image.',
    'The girl is Mira — the girl in the reference image: keep her face, eyes, proportions, black shayla and long black abaya exactly the same. ' + character,
    'Scene: ' + clip.scene,
    'Mira is clearly visible with her face large enough to recognize, warm cinematic lighting, rich detail, wholesome and modest.',
    NO_TEXT,
  ].join('\n');
}

export function clipPrompt(character, ep, clip) {
  return [
    'Animate this exact first frame for 8 seconds in the same 3D cartoon style. The girl is Mira from the frame; she stays the same character the whole time. ' + character,
    'Action: ' + clip.action,
    'Sound: ' + clip.sound + ' No speech, no dialogue, no narration, no singing.',
    NO_TEXT,
    'No new characters appear unless described; faces and hands stay well-formed.',
  ].join('\n');
}

export const JUDGE_PROMPT = 'You are a strict quality checker for a children\'s 3D cartoon series. Image 1 is the official reference of the main character, Mira ' +
  '(a young Emirati girl with big brown eyes, black shayla covering her hair, long black abaya). The other images are frames from one new shot. Answer ONLY JSON: ' +
  '{"same_character": boolean, "text_present": boolean, "face_deformed": boolean, "reasons": string}. same_character = true only if the girl in these frames is ' +
  'clearly the same character as the reference (same face, eyes, outfit and 3D style) in every frame where she appears, and she appears at least once. ' +
  'text_present = true if ANY letters, numbers, words, subtitles, signs, logos or writing appear anywhere. face_deformed = true if any face is distorted, melted, ' +
  'missing or extra features, or hands/limbs are clearly malformed. If unsure about same_character answer false; if unsure about text answer true.';

// حكم صارم: أيّ حقل ناقص أو غير منطقيّ = فشل (المالك: «لو فشلت مرّة ثانية، لا تنشر» — فحص لم يجرِ لا يُعدّ نجاحًا).
export function judgeVerdict(j) {
  if (!j || typeof j !== 'object') return { ok: false, why: 'no verdict' };
  const bad = [];
  if (j.same_character !== true) bad.push('not the same girl');
  if (j.text_present !== false) bad.push('text in frame');
  if (j.face_deformed !== false) bad.push('deformed face');
  return { ok: bad.length === 0, why: bad.length ? bad.join(', ') + (j.reasons ? ' — ' + String(j.reasons).slice(0, 200) : '') : 'ok' };
}

// ───────── المحرّكات (مباشرة من Actions بمفتاح المستودع) ─────────
// عطل شبكة أو ٤٢٩/٥xx يُعاد (الطلب الفاشل لا يُحاسَب) — لا يحرق إعادة الحلقة الوحيدة؛ الرفض الصريح (٤xx) يُرمى فورًا.
async function gpost(model, method, body, timeoutMs) {
  let last = null;
  for (let i = 0; i < 3; i++) {
    if (i) await sleep(8000 * i);
    let r;
    try {
      r = await fetch(GL + '/models/' + model + ':' + method, {
        method: 'POST', headers: { 'x-goog-api-key': GKEY(), 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs || 240000),
      });
    } catch (e) { last = new Error(model + ' network ' + ((e && e.message) || e)); continue; }
    const j = await r.json().catch(() => ({}));
    if (r.ok) return j;
    last = new Error(model + ' ' + r.status + ' ' + String((j.error && j.error.message) || JSON.stringify(j)).slice(0, 200));
    if (r.status !== 429 && r.status < 500) throw last;
  }
  throw last;
}
const b64 = (file) => fs.readFileSync(file).toString('base64');
const mimeOf = (file) => (/\.png$/i.test(file) ? 'image/png' : 'image/jpeg');

async function drawFrame(character, ep, clip, outFile) {
  const j = await gpost(MODELS.frame, 'generateContent', {
    contents: [{ parts: [{ text: framePrompt(character, ep, clip) }, { inlineData: { mimeType: mimeOf(REF_IMAGE), data: b64(REF_IMAGE) } }] }],
    generationConfig: { imageConfig: { aspectRatio: '9:16', imageSize: '2K' } },
  });
  const ps = ((((j.candidates || [])[0] || {}).content || {}).parts) || [];
  const ip = ps.find((x) => x.inlineData && x.inlineData.data);
  if (!ip) throw new Error('frame: no image (' + String(((j.candidates || [])[0] || {}).finishReason || 'none') + ')');
  const raw = outFile.replace(/\.jpg$/, '.raw');
  fs.writeFileSync(raw, Buffer.from(ip.inlineData.data, 'base64'));
  // تصغير لمقاس الفيديو (720×1280) — تصغير لا تكبير، Lanczos.
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', 'scale=720:1280:force_original_aspect_ratio=increase:flags=lanczos,crop=720:1280', '-q:v', '2', outFile]);
  fs.rmSync(raw, { force: true });
  return outFile;
}

async function judge(images) {
  const parts = [{ text: JUDGE_PROMPT }, { inlineData: { mimeType: mimeOf(REF_IMAGE), data: b64(REF_IMAGE) } }];
  for (const f of images) parts.push({ inlineData: { mimeType: mimeOf(f), data: b64(f) } });
  let last = null;
  for (let i = 0; i < 3; i++) { // الفحص نفسه يُعاد عند عطل الشبكة — عطله لا يحرق إعادة الحلقة
    try {
      const j = await gpost(MODELS.judge, 'generateContent', { contents: [{ parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } }, 120000);
      const t = (((((j.candidates || [])[0] || {}).content || {}).parts) || []).map((x) => x.text || '').join('');
      return { ...judgeVerdict(JSON.parse(t)), raw: t.slice(0, 500), ran: true };
    } catch (e) { last = e; await sleep(4000 * (i + 1)); }
  }
  return { ok: false, why: 'check could not run: ' + ((last && last.message) || 'unknown'), ran: false };
}

async function makeClip(character, ep, clip, frameFile, outFile) {
  const start = await gpost(MODELS.video, 'predictLongRunning', {
    instances: [{ prompt: clipPrompt(character, ep, clip), image: { bytesBase64Encoded: b64(frameFile), mimeType: 'image/jpeg' } }],
    parameters: { aspectRatio: '9:16', durationSeconds: CLIP_SEC },
  });
  const op = start.name;
  if (!op) throw new Error('video: no operation');
  for (let i = 0; i < 60; i++) {
    await sleep(10000);
    let r;
    try { r = await fetch(GL + '/' + op, { headers: { 'x-goog-api-key': GKEY() }, signal: AbortSignal.timeout(30000) }); }
    catch (e) { log('video poll: ' + ((e && e.message) || e)); continue; } // عطل شبكة أثناء الانتظار: نسأل عن المهمّة نفسها — لا إطار ولا مقطع جديد
    const d = await r.json().catch(() => ({}));
    if (!r.ok) continue;
    if (!d.done) continue;
    if (d.error) throw new Error('video failed: ' + String(d.error.message || '').slice(0, 200));
    const g = (d.response && (d.response.generateVideoResponse || d.response)) || {};
    const s = (g.generatedSamples || g.generatedVideos || [])[0];
    const uri = s && ((s.video && (s.video.uri || s.video.videoUri)) || s.uri);
    if (!uri) throw new Error('video blocked: ' + String((g.raiMediaFilteredReasons || []).join(' | ') || 'no video').slice(0, 200));
    let why = '';
    for (let t = 0; t < 4; t++) { // المقطع مدفوع وجاهز: يُنزَّل من الرابط نفسه مرّة ثانية، لا يُولَّد من جديد
      if (t) await sleep(5000 * t);
      try {
        const v = await fetch(uri, { headers: { 'x-goog-api-key': GKEY() }, signal: AbortSignal.timeout(120000) });
        if (!v.ok) { why = 'http ' + v.status; continue; }
        fs.writeFileSync(outFile, Buffer.from(await v.arrayBuffer()));
        return outFile;
      } catch (e) { why = String((e && e.message) || e); }
    }
    throw Object.assign(new Error('video download failed: ' + why), { noRegen: true });
  }
  throw Object.assign(new Error('video: still running after 10 min'), { noRegen: true }); // مهمّة مدفوعة ما زالت تعمل — لا نشغّل ثانية فوقها
}

// لقطات للفحص من المقطع الخامّ (قبل الترجمة وبطاقة النهاية — نصّنا نحن لا يُفحص).
function sampleFrames(clip, dir, tag) {
  const out = [];
  for (const [i, t] of [0.4, 2.4, 4.4, 6.4, 7.7].entries()) {
    const f = path.join(dir, tag + '-q' + i + '.jpg');
    try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(t), '-i', clip, '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '3', f]); if (fs.existsSync(f)) out.push(f); } catch (e) { /* guard-ok — مقطع أقصر من اللقطة؛ الفحص يرى البقيّة */ }
  }
  return out;
}

// مشهد واحد: محاولة + إعادة واحدة (المالك). الإطار يُفحص قبل الفيديو فلا يُصرف على إطار خطأ؛ فشل أيّهما = محاولة فاشلة.
async function makeScene(character, ep, ci, dir, report) {
  const clip = ep.clips[ci];
  let lastWhy = '', keep = null, content = true; // content=false: عطل نقل أو فحص لم يجرِ — لا يوقف القصّة // إطار نجح فحصه وفشل مقطعه وحده يُعاد تحريكه — لا نداء صورة مدفوع ثانٍ لإطار مقبول
  for (let attempt = 1; attempt <= 2; attempt++) {
    const tag = 'c' + (ci + 1) + 'a' + attempt;
    const rec = { scene: ci + 1, attempt };
    report.push(rec);
    try {
      let frame = keep;
      if (frame) rec.frame = { ok: true, why: 'reused (passed in attempt ' + (attempt - 1) + ')', ran: true };
      else {
        frame = await drawFrame(character, ep, clip, path.join(dir, tag + '-frame.jpg'));
        const fv = await judge([frame]);
        rec.frame = fv;
        log('scene ' + (ci + 1) + ' attempt ' + attempt + ' frame: ' + fv.why);
        if (!fv.ok) { lastWhy = 'frame: ' + fv.why; if (!fv.ran) { content = false; break; } continue; }
      }
      const mp4 = await makeClip(character, ep, clip, frame, path.join(dir, tag + '.mp4'));
      const cv = await judge(sampleFrames(mp4, dir, tag));
      rec.clip = cv;
      log('scene ' + (ci + 1) + ' attempt ' + attempt + ' clip: ' + cv.why);
      if (cv.ok) return { mp4, frame };
      lastWhy = 'clip: ' + cv.why;
      keep = frame;
      if (!cv.ran) { content = false; break; } // الفحص لم يجرِ ٣ مرّات = لا يُصرف على مقطع جديد؛ لا نشر وتنبيه
    } catch (e) {
      rec.error = String((e && e.message) || e).slice(0, 300);
      lastWhy = rec.error;
      log('scene ' + (ci + 1) + ' attempt ' + attempt + ' error: ' + rec.error);
      if (e && e.noRegen) { content = false; break; } // عطل نقل لا فشل فحص: لا إطار ولا مقطع مدفوع جديد
    }
  }
  throw Object.assign(new Error('scene ' + (ci + 1) + (content ? ' failed twice — ' : ' stopped — ') + lastWhy), { content });
}

// ───────── الصوت والصورة ─────────
// صوت فاطمة الإماراتيّ وحده: الاحتياط غير الإماراتيّ (X-TTS-Tier: fallback، ومدفوع) يُرفض بلا إعادة؛ الأعطال تُعاد قليلًا.
async function narrate(token, text, file) {
  let last = 'tts';
  for (let i = 0; i < 3; i++) {
    const r = await fetch(BASE + '/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice: 'maha', lang: 'ar', token, speed: 'normal' }), signal: AbortSignal.timeout(60000) })
      .catch((e) => ({ ok: false, status: 'net ' + ((e && e.message) || e), headers: { get: () => '' } }));
    if (r.ok) {
      if (String(r.headers.get('x-tts-tier') || '') === 'fallback') throw new Error('tts fallback voice (not the Emirati voice)');
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      return file;
    }
    last = 'tts ' + r.status;
    if (r.status === 401 || r.status === 402) break;
    await sleep(5000 * (i + 1));
  }
  throw new Error(last);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function overlayHTML(kind, data) {
  const icon = pathToFileURL(path.join(ROOT, 'icons/icon-512-v2.png')).href;
  const brand = pathToFileURL(path.join(ROOT, 'icons/brand-om-s.png')).href;
  const head = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@500;700;800;900&display=block" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0;padding:0}html,body{width:${W}px;height:${H}px;overflow:hidden;background:transparent;font-family:Tajawal,'Noto Sans Arabic',sans-serif;color:#fff}
.gold{background:linear-gradient(180deg,#ffe9a8,#e7b54a 55%,#b9822a);-webkit-background-clip:text;background-clip:text;color:transparent}
#wm{position:absolute;top:34px;left:34px;display:flex;align-items:center;gap:18px;padding:14px 30px 14px 22px;border-radius:999px;background:rgba(0,0,0,.6);border:2px solid rgba(231,181,74,.55)}
#wm img.i{width:60px;height:60px;border-radius:14px}#wm img.t{height:50px}
#ep{position:absolute;top:40px;right:34px;max-width:700px;white-space:nowrap;overflow:hidden;padding:12px 30px;border-radius:999px;background:linear-gradient(180deg,#ffe9a8,#e7b54a 55%,#b9822a);color:#1a1205;font-size:40px;font-weight:900;box-shadow:0 10px 30px rgba(0,0,0,.45)}
#sub{position:absolute;left:70px;right:70px;bottom:250px;text-align:center}
#sub span{display:inline-block;padding:22px 40px;border-radius:34px;background:rgba(8,8,10,.72);font-size:62px;font-weight:800;line-height:1.45;box-shadow:0 14px 40px rgba(0,0,0,.4)}
#end{position:absolute;inset:0;background:radial-gradient(120% 80% at 50% 30%,#2a2113 0%,#0b0a08 60%,#000 100%);text-align:center;padding-top:190px}
#end img.t{display:block;margin:0 auto;height:130px}#end .h{font-size:84px;font-weight:900;margin-top:46px;line-height:1.2}
#end .s{font-size:46px;font-weight:700;color:#efe7d2;margin-top:24px;padding:0 70px}
#end .qr{position:relative;width:500px;height:500px;margin:48px auto 0;padding:38px;background:#fff;border-radius:44px;border:6px solid #e7b54a;box-shadow:0 0 100px rgba(231,181,74,.4)}
#end .qr svg{display:block;width:100%;height:100%}
#end .qr img{position:absolute;left:50%;top:50%;width:104px;height:104px;margin:-52px 0 0 -52px;border-radius:24px;border:5px solid #e7b54a;box-shadow:0 0 0 9px #fff}
#end .u{display:inline-block;margin-top:40px;font-size:42px;font-weight:800;padding:18px 42px;border-radius:999px;border:3px solid #e7b54a;direction:ltr;color:#ffe9a8}
#end .nx{font-size:46px;font-weight:800;color:#efe7d2;margin-top:34px}
</style></head><body>`;
  // الشارة تصغر حتّى تدخل عرضها (لا قصّ) — نفس fitAll في استوديو البوت
  if (kind === 'hud') return head + `<div id="wm"><img class="i" src="${icon}"><img class="t" src="${brand}"></div><div id="ep">🎬 ${esc(data.badge)}</div><script>document.fonts.ready.then(()=>{const e=document.getElementById('ep');let f=40;while(e.scrollWidth>e.clientWidth+1&&f>24){f-=2;e.style.fontSize=f+'px';}});</script></body></html>`;
  if (kind === 'sub') return head + `<div id="sub"><span>${esc(data.text)}</span></div></body></html>`;
  return head + `<div id="end"><img class="t" src="${brand}"><div class="h">${esc(data.endH)}<br><span class="gold">ببلاش</span></div><div class="s">${esc(data.endS)}</div><div class="qr">${qrSVG(QR_URL)}<img src="${icon}"></div><div class="u">${SITE}</div><div class="nx">${esc(data.next)}</div></div></body></html>`;
}

async function renderOverlays(dir, ep, nextLine) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: process.env.CHROME_PATH ? ['--no-sandbox'] : [] });
  const files = {};
  try {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const shot = async (name, html, transparent) => {
      const f = path.join(dir, name + '.html'); fs.writeFileSync(f, html);
      await page.goto(pathToFileURL(f).href, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready).catch(() => {});
      await page.waitForTimeout(150); // ملاءمة الشارة بعد تحميل الخطّ
      const out = path.join(dir, name + '.png');
      await page.screenshot({ path: out, type: 'png', omitBackground: !!transparent });
      fs.rmSync(f, { force: true });
      return out;
    };
    files.hud = await shot('hud', overlayHTML('hud', { badge: STORIES[ep.story] + ' · الحلقة ' + ep.k }), true);
    files.sub1 = await shot('sub1', overlayHTML('sub', { text: ep.lines[0] }), true);
    files.sub2 = await shot('sub2', overlayHTML('sub', { text: ep.lines[1] }), true);
    files.end = await shot('end', overlayHTML('end', { endH: 'جرّب التطبيق السحري', endS: 'اكتب فكرتك… والذكاء الاصطناعي يسوّيها لك', next: nextLine }), false);
    await ctx.close();
  } finally { await browser.close(); }
  return files;
}

const probeDur = (f) => { try { return parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' })) || 0; } catch (e) { return 0; } };
const hasAudio = (f) => { try { return !!execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim(); } catch (e) { return false; } };

// المشهدان (١٠٨٠×١٩٢٠) + الشعار والشارة + الترجمة في وقتها + بطاقة النهاية بتلاشٍ؛ الصوت: صوت المشهد منخفضًا تحت السرد.
export function composeArgs(o) {
  const T = CLIP_SEC, total = 2 * T + END_SEC - 0.5;
  const args = ['-y', '-loglevel', 'error', '-i', o.clips[0], '-i', o.clips[1], '-loop', '1', '-t', String(END_SEC), '-i', o.end, '-i', o.hud, '-i', o.subs[0], '-i', o.subs[1]];
  let n = 6;
  const narr = o.narr.map((f) => { if (!f) return -1; args.push('-i', f); return n++; });
  const fit = (i) => '[' + i + ':v]scale=' + W + ':' + H + ':force_original_aspect_ratio=increase:flags=lanczos,crop=' + W + ':' + H + ',fps=' + FPS + ',setsar=1,trim=duration=' + T + ',setpts=PTS-STARTPTS';
  const f = [
    fit(0) + '[v0]', fit(1) + '[v1]', '[v0][v1]concat=n=2:v=1:a=0[vc]',
    '[vc][3:v]overlay=0:0[vh]',
    '[vh][4:v]overlay=0:0:enable=\'between(t,0.5,' + (T - 0.4) + ')\'[vs1]',
    '[vs1][5:v]overlay=0:0:enable=\'between(t,' + (T + 0.5) + ',' + (2 * T - 0.4) + ')\'[vs]',
    '[2:v]scale=' + W + ':' + H + ',fps=' + FPS + ',setsar=1,format=yuv420p,settb=1/' + FPS + '[ve]',
    '[vs]format=yuv420p,settb=1/' + FPS + '[vsf]', '[vsf][ve]xfade=transition=fade:duration=0.5:offset=' + (2 * T - 0.5) + '[v]',
  ];
  const a = [];
  for (const i of [0, 1]) a.push(o.audio[i] ? '[' + i + ':a]atrim=0:' + T + ',asetpts=PTS-STARTPTS,aresample=48000[a' + i + ']' : 'anullsrc=r=48000:cl=stereo,atrim=0:' + T + '[a' + i + ']');
  a.push('[a0][a1]concat=n=2:v=0:a=1,volume=0.35,apad,atrim=0:' + total.toFixed(2) + ',afade=t=out:st=' + (total - 1).toFixed(2) + ':d=1[bed]');
  const mix = ['[bed]'];
  narr.forEach((idx, i) => { if (idx < 0) return; a.push('[' + idx + ':a]aresample=48000,adelay=' + Math.round((i * T + 0.6) * 1000) + ':all=1,volume=1.0[n' + i + ']'); mix.push('[n' + i + ']'); });
  a.push(mix.join('') + 'amix=inputs=' + mix.length + ':duration=first:normalize=0[a]');
  args.push('-filter_complex', [...f, ...a].join(';'), '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-preset', 'medium', '-crf', '20', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '160k', '-t', total.toFixed(2), '-movflags', '+faststart', o.out);
  return { args, total };
}

// ───────── النصّ ─────────
export function miraCaption(ep, nextEp) {
  const story = STORIES[ep.story];
  const head = '🎬 ' + story + ' · الحلقة ' + ep.k + ': ' + ep.title;
  const next = nextEp ? ['تابعونا… باچر «' + STORIES[nextEp.story] + '» الحلقة ' + nextEp.k + ' 👀'] : [];
  const tags = [...new Set(['#مسلسل_ميرا', ...(ep.tags || []), '#OMAi', '#الامارات', '#ذكاء_اصطناعي'])].slice(0, 12);
  const top = [head, ep.caption];
  const cta = 'جرّب التطبيق السحري ببلاش';
  const ig = [...top, '', cta + ' 👈 الرابط في البايو 🔗', ...next, '', tags.join(' ')].join('\n');
  const fb = [...top, '', cta + ' 👈 https://' + SITE + '/?ref=fb', ...next, '', tags.join(' ')].join('\n');
  return { ig, fb, head: story + ' · الحلقة ' + ep.k + ': ' + ep.title, ...shortCaptions(top, cta, next, tags) };
}

// ───────── التنبيه ─────────
async function alertOwner(title, body) { // title يحمل FAILED_TAG للحلقة الموقوفة
  gh('error', title + ' — ' + body.slice(0, 300));
  const tok = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPOSITORY;
  if (!tok || !repo) return;
  const run = process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID ? process.env.GITHUB_SERVER_URL + '/' + repo + '/actions/runs/' + process.env.GITHUB_RUN_ID : '';
  const r = await fetch('https://api.github.com/repos/' + repo + '/issues', {
    method: 'POST', headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body: '@OMRAN77\n\n' + body + (run ? '\n\nالتشغيلة: ' + run : '') + '\n\n---\n_Generated by [Claude Code](https://claude.ai/code)_', labels: [] }),
  }).catch((e) => ({ ok: false, status: String(e && e.message) }));
  log('alert issue → ' + r.status);
}

// ───────── التشغيل ─────────
export async function gateMira() {
  let go = true, why = 'manual run';
  if (process.env.GITHUB_EVENT_NAME === 'schedule') {
    const eps = loadEpisodes();
    if (!eps.live) { go = false; why = 'series not live yet (mira-episodes.json live=false — waiting for the owner to approve the DRY_RUN episode)'; }
    else if (UP_KEY) {
      try {
        const st = await miraState(), blocked = blockedFrom(await openAlertTitles());
        const nx = nextEpisode(st, eps.episodes, '', blocked);
        go = !!nx && miraDue(st.lastAt, Date.now());
        why = !nx ? 'nothing due (both stories finished, or paused by an open [mira-failed] alert)' : 'next ' + nx.story + ':' + nx.k + ' · last mira ' + (st.lastStory || 'none') + ' ' + (st.lastAt ? ((Date.now() - st.lastAt) / 36e5).toFixed(1) + 'h ago' : '');
      } catch (e) { go = false; why = 'history unavailable (' + (e && e.message) + ') — skipping to avoid a double post'; }
    } else { go = false; why = 'UPLOAD_POST_API_KEY missing'; }
  }
  log('mira gate: go=' + (go ? 1 : 0) + ' · ' + why);
  if (!go) gh('notice', 'no Mira episode now · ' + why);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'go=' + (go ? 1 : 0) + '\n');
}

export async function mainMira() {
  const eps = loadEpisodes();
  const live = !DRY && !!UP_KEY;
  if (live && !eps.live) throw new Error('mira-episodes.json live=false — run with DRY_RUN until the owner approves');
  if (!GKEY()) throw new Error('GEMINI_API_KEY missing in the workflow env');
  let st = { app: 0, uae: 0, lastStory: '', lastAt: 0 };
  if (UP_KEY) { try { st = await miraState(); } catch (e) { if (live) throw e; log('history: ' + e.message); } }
  if (live && process.env.GITHUB_EVENT_NAME === 'schedule' && !miraDue(st.lastAt, Date.now())) { log('a Mira episode went out less than ' + EVERY_H + 'h ago'); return; }
  let blocked = new Set();
  try { blocked = blockedFrom(await openAlertTitles()); } catch (e) { if (live) throw new Error('cannot read alert issues: ' + e.message); log('alerts: ' + e.message); }
  const ep = nextEpisode(st, eps.episodes, process.env.MIRA_EP, blocked);
  if (!ep) { gh('notice', 'Mira: nothing due (both stories finished, or paused by an open [mira-failed] alert)'); return; }
  const after = nextEpisode({ ...st, [ep.story]: Number(ep.k), lastStory: ep.story }, eps.episodes, '', blocked);
  log('mira episode ' + ep.story + ':' + ep.k + ' «' + ep.title + '» · published so far app ' + st.app + ' · uae ' + st.uae + (live ? '' : ' · DRY_RUN'));
  const dir = path.join(OUT, 'mira'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const report = [];
  const scenes = [];
  try {
    for (const ci of [0, 1]) scenes.push(await makeScene(eps.character, ep, ci, dir, report)); // بالترتيب: فشل المشهد الأوّل مرّتين لا يُصرف على الثاني
  } catch (e) {
    fs.writeFileSync(path.join(dir, 'qa.json'), JSON.stringify({ episode: ep.story + ':' + ep.k, report }, null, 2));
    if (e && e.content) await alertOwner(FAILED_TAG(ep.story, ep.k) + ' مسلسل ميرا: الحلقة ' + ep.k + ' من «' + STORIES[ep.story] + '» لم تُنشر', 'فشل الفحص مرّتين فلم تُنشر.\n\nالسبب: ' + e.message + '\n\nالتفاصيل في qa.json داخل ملفّ التحميل. قصّة «' + STORIES[ep.story] + '» متوقّفة عند هذي الحلقة والقصّة الثانية تكمل يوميًّا. **اقفل هذي المسألة** عشان تنعاد الحلقة في دورها (عدّل وصف مشهدها في scripts/mira-episodes.json قبل إن احتاج).');
    else await alertOwner('مسلسل ميرا: الحلقة ' + ep.k + ' من «' + STORIES[ep.story] + '» لم تُنشر (عطل مؤقّت)', 'توقّفت الحلقة بعطل نقل أو فحص لم يجرِ — لا فشل محتوى، فلم يُعَد توليدها (لا إنفاق إضافيّ) ولا تتوقّف قصّتها.\n\nالسبب: ' + e.message + '\n\nتُعاد تلقائيًّا في دور قصّتها التالي.');
    throw e;
  }
  fs.writeFileSync(path.join(dir, 'qa.json'), JSON.stringify({ episode: ep.story + ':' + ep.k, report }, null, 2));
  // السرد بصوت التطبيق الإماراتيّ (فاطمة). في النشر الفعليّ تعذّره = لا نشر وتنبيه (اختيار المالك: سرد + ترجمة)؛ في DRY_RUN تحذير والمعاينة تُظهره.
  const acct = await botAccount().catch(() => null);
  const narr = await Promise.all(ep.lines.map((t, i) => (acct ? narrate(acct.token, t, path.join(dir, 'narr' + (i + 1) + '.mp3')) : Promise.reject(new Error('no bot account'))).catch((e) => { gh('warning', 'narration ' + (i + 1) + ': ' + e.message); return null; })));
  if (live && narr.some((f) => !f)) {
    await alertOwner('مسلسل ميرا: الحلقة ' + ep.k + ' من «' + STORIES[ep.story] + '» لم تُنشر (السرد)', 'تعذّر السرد الإماراتيّ (صوت فاطمة من /api/tts) فلم تُنشر الحلقة.\n\nالمقاطع وqa.json في ملفّ التحميل. الحلقة تُعاد في دور قصّتها التالي.');
    throw new Error('narration missing — not publishing');
  }
  const nextLine = after ? 'باچر: «' + STORIES[after.story] + '» 👀' : 'تابعونا… حلقات جديدة قريب 👀';
  const ov = await renderOverlays(dir, ep, nextLine);
  const mp4 = path.join(OUT, 'mira-episode.mp4');
  const { args, total } = composeArgs({ clips: scenes.map((s) => s.mp4), audio: scenes.map((s) => hasAudio(s.mp4)), narr, end: ov.end, hud: ov.hud, subs: [ov.sub1, ov.sub2], out: mp4 });
  execFileSync('ffmpeg', args, { stdio: 'inherit' });
  const cover = path.join(OUT, 'mira-cover.jpg');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '3', '-i', mp4, '-frames:v', '1', '-q:v', '2', cover]);
  const cap = miraCaption(ep, after);
  fs.writeFileSync(path.join(OUT, 'caption.txt'), cap.ig + '\n');
  fs.writeFileSync(path.join(OUT, 'caption-x.txt'), cap.x + '\n');
  fs.writeFileSync(path.join(OUT, 'caption-threads.txt'), cap.threads + '\n');
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({ series: 'mira', story: ep.story, k: ep.k, title: ep.title, seconds: +probeDur(mp4).toFixed(1), planned: total, narration: narr.map(Boolean) }, null, 2));
  log('mira video ' + probeDur(mp4).toFixed(1) + 's → ' + mp4 + ' (' + (fs.statSync(mp4).size / 1e6).toFixed(1) + 'MB)');
  if (!live) {
    if (UP_KEY) await resolvePlatforms().catch((e) => log('platforms: ' + e.message));
    gh('notice', 'Mira video ready (not published) · ' + ep.story + ':' + ep.k + ' · ' + ep.title);
    return;
  }
  const platforms = await resolvePlatforms();
  const pub = await publish(mp4, cover, cap, platforms, null, null, MIRA_ID(ep.story, ep.k));
  fs.writeFileSync(path.join(OUT, 'publish.json'), JSON.stringify(pub || {}, null, 2));
  gh('notice', 'Mira published ✓ ' + ep.story + ':' + ep.k + ' · ' + platforms.join(','));
}
