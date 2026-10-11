// cc-bridge/render.mjs — v-app-director: تصوير شاشات التطبيق ودمج فيديو «مخرج التطبيق» على الجسر.
//
// المالك: «سوّ لي فيديو عن التطبيق ١٠ دقائق… مع مها أو عبدالله، وبأيّ لغة». المتصفّح يكتب الخطّة (Vercel) ويسجّل
// التعليق وصور الأنماط، ثمّ يرسل مانيفست المشاهد إلى هنا برمز مهمّة قصير العمر (HMAC بسرّ الجسر نفسه — السرّ لا
// يبلغ المتصفّح). الجسر: يصوّر كلّ شاشة مطلوبة من التطبيق المنشور بـChromium (١٩٢٠×١٠٨٠، دقّة مضاعفة، ثيم داكن،
// بلا نوافذ منبثقة)، يرسم بطاقات العناوين صفحةً بخطّ عربيّ واضح (لا drawtext)، ثمّ ffmpeg: كلّ مشهد صورة ثابتة
// بحركة كاميرا بطيئة (zoompan، يتبدّل اتّجاهها)، صوته عليه ومدّته = مدّة صوته + نصف ثانية، انتقالات xfade/acrossfade،
// وإخراج 1080p30 H.264 + AAC. الناتج يبقى ٢٤ ساعة ثمّ يُحذف.
//
// بناء أوامر ffmpeg دوالّ نقيّة (buildFfmpegArgs) تُختبر بلا ffmpeg. لا يطبع الرمز ولا السرّ في السجلّ.
'use strict';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile, rm, readdir, stat } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export const FPS = 30;
export const OUT_W = 1920, OUT_H = 1080;
/* نافذة التصوير ١٢٨٠×٧٢٠ بدقّة ×٣ (= ٣٨٤٠×٢١٦٠): نوافذ الأدوات (≤ ١٠٠٠ بكسل عرضًا) تملأ الإطار ونصّها يُقرأ في الفيديو،
   بينما ١٩٢٠ تترك النافذة عمودًا ضيّقًا وسط فراغ. بطاقات العناوين تُرسم ١٩٢٠×١٠٨٠ ×٢. */
export const VIEW_W = 1280, VIEW_H = 720, VIEW_SCALE = 3;
export const WORK_W = 2560, WORK_H = 1440;   // مقاس العمل قبل zoompan: أكبر من الإخراج فلا يفقد الزوم حدّته، وأصغر من ٤K فلا يبطئ
export const XFADE = 0.5;                    // ثانية الانتقال
export const TAIL = 0.5;                     // ما يُضاف بعد نهاية الصوت
export const LIMITS = {
  scenes: 90, steps: 8, imageChars: 9e6, audioChars: 4e6, bodyBytes: 160e6, textChars: 80, subChars: 120,
  minSec: 2.5, maxSec: 40, ttlMs: 24 * 3600 * 1000, jobTimeoutMs: 55 * 60 * 1000, segmentTimeoutMs: 6 * 60 * 1000, joinTimeoutMs: 25 * 60 * 1000,
};
const RTL = new Set(['ar', 'ur']);
const STEP_CLICK = /^#[A-Za-z0-9_-]{1,60}$/, STEP_TAB = /^[a-z]{2,20}$/, STEP_SETTINGS = /^[A-Za-z]{2,40}Section$/, STEP_FOCUS = /^[#.][A-Za-z0-9_ .#>-]{1,80}$/;

/* ───────── رمز المهمّة (نفس صيغة api/_lib/app-director.js) ───────── */
export function signJobToken(info, secret, ttlMs) {
  const p = Buffer.from(JSON.stringify({ u: String(info.user || ''), j: String(info.jobId || ''), exp: Number(info.exp) || (Date.now() + (ttlMs || 2 * 3600 * 1000)) })).toString('base64url');
  return p + '.' + createHmac('sha256', String(secret)).update(p).digest('base64url');
}
export function verifyJobToken(token, secret, now) {
  try {
    const [p, sig] = String(token || '').split('.');
    if (!p || !sig || !secret) return { ok: false, why: 'malformed' };
    const want = createHmac('sha256', String(secret)).update(p).digest('base64url');
    const a = Buffer.from(sig), b = Buffer.from(want);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, why: 'signature' };
    const d = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    if (!d || !d.j || !(d.exp > (now || Date.now()))) return { ok: false, why: 'expired' };
    return { ok: true, user: String(d.u || ''), jobId: String(d.j), exp: d.exp };
  } catch (e) { return { ok: false, why: 'malformed' }; }
}

/* ───────── المانيفست ───────── */
function clip(s, n) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n); }
function b64(s, max) {
  let v = String(s || '');
  const m = v.match(/^data:([a-z]+\/[a-z0-9.+-]+);base64,/i);
  let mime = '';
  if (m) { mime = m[1].toLowerCase(); v = v.slice(m[0].length); }
  if (!v || v.length > max || !/^[A-Za-z0-9+/=\s]+$/.test(v)) return null;
  return { data: v.replace(/\s+/g, ''), mime };
}
function cleanSteps(list) {
  if (!Array.isArray(list)) return null;
  if (list.length > LIMITS.steps) return null;
  const out = [];
  for (const st of list) {
    if (!st || typeof st !== 'object') return null;
    if (typeof st.click === 'string' && STEP_CLICK.test(st.click)) out.push({ click: st.click });
    else if (typeof st.vtab === 'string' && STEP_TAB.test(st.vtab)) out.push({ vtab: st.vtab });
    else if (typeof st.settings === 'string' && STEP_SETTINGS.test(st.settings)) out.push({ settings: st.settings });
    else if (typeof st.focus === 'string' && STEP_FOCUS.test(st.focus)) out.push({ focus: st.focus }); /* قصّ اللقطة على عنصر (نافذة الأداة) بنسبة ١٦:٩ */
    else if (Number.isFinite(Number(st.wait))) out.push({ wait: Math.max(100, Math.min(6000, Math.round(Number(st.wait)))) });
    else return null;
  }
  return out;
}
/** يتحقّق من المانيفست ويعيده منقّى — {ok, manifest} أو {ok:false, error} */
export function validateManifest(m) {
  if (!m || typeof m !== 'object') return { ok: false, error: 'manifest_required' };
  const lang = /^[a-z]{2,3}$/.test(String(m.lang || '')) ? String(m.lang) : 'ar';
  const dir = RTL.has(lang) ? 'rtl' : 'ltr';
  const scenes = Array.isArray(m.scenes) ? m.scenes : null;
  if (!scenes || !scenes.length) return { ok: false, error: 'scenes_required' };
  if (scenes.length > LIMITS.scenes) return { ok: false, error: 'too_many_scenes' };
  const out = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    if (!s || typeof s !== 'object') return { ok: false, error: 'scene_' + i + '_invalid' };
    const type = String(s.type || '');
    const sc = { type, text: clip(s.text, LIMITS.textChars), sub: clip(s.sub, LIMITS.subChars), seconds: 0, audio: null, image: null, steps: null, target: clip(s.target, 60) };
    const secs = Number(s.seconds);
    if (Number.isFinite(secs) && secs > 0) sc.seconds = Math.max(LIMITS.minSec, Math.min(LIMITS.maxSec, secs));
    if (s.audio != null && s.audio !== '') {
      const a = b64(s.audio, LIMITS.audioChars);
      if (!a) return { ok: false, error: 'scene_' + i + '_audio' };
      sc.audio = a.data;
    }
    if (type === 'screen') {
      sc.steps = cleanSteps(s.steps == null ? [] : s.steps);
      if (!sc.steps) return { ok: false, error: 'scene_' + i + '_steps' };
    } else if (type === 'style_sample') {
      const im = b64(s.image, LIMITS.imageChars);
      if (!im) return { ok: false, error: 'scene_' + i + '_image' };
      const mime = im.mime || String(s.mime || 'image/png').toLowerCase();
      if (!/^image\/(png|jpeg|webp)$/.test(mime)) return { ok: false, error: 'scene_' + i + '_image_type' };
      sc.image = im.data; sc.mime = mime;
    } else if (type === 'title') {
      if (!sc.text) return { ok: false, error: 'scene_' + i + '_text' };
    } else return { ok: false, error: 'scene_' + i + '_type' };
    out.push(sc);
  }
  return { ok: true, manifest: { lang, dir, title: clip(m.title, 120), scenes: out } };
}

/* ───────── أوامر ffmpeg (نقيّة) ───────── */
const MOTIONS = ['in', 'out', 'right', 'left'];
function zoomFilter(kind, frames) {
  const F = Math.max(1, frames);
  const cx = "x='iw/2-(iw/zoom/2)'", cy = "y='ih/2-(ih/zoom/2)'";
  let z, x = cx, y = cy;
  if (kind === 'in') z = "z='1+0.08*on/" + F + "'";
  else if (kind === 'out') z = "z='1.08-0.08*on/" + F + "'";
  else if (kind === 'right') { z = "z='1.06'"; x = "x='(iw-iw/zoom)*on/" + F + "'"; }
  else { z = "z='1.06'"; x = "x='(iw-iw/zoom)*(1-on/" + F + ")'"; }
  return 'zoompan=' + z + ':' + x + ':' + y + ':d=' + F + ':s=' + OUT_W + 'x' + OUT_H + ':fps=' + FPS;
}
export function sceneVideoFilter(scene, index) {
  const frames = Math.round(scene.seconds * FPS);
  const fit = scene.type === 'style_sample'
    /* صورة ليست ١٦:٩ (نموذج نمط مربّع): خلفيّة مموّهة من الصورة نفسها بدل شريطين أسودين */
    ? 'split[bg][fg];[bg]scale=' + WORK_W + ':' + WORK_H + ':force_original_aspect_ratio=increase,crop=' + WORK_W + ':' + WORK_H + ',gblur=sigma=40,eq=brightness=-0.12[bgb];[fg]scale=' + WORK_W + ':' + WORK_H + ':force_original_aspect_ratio=decrease[fgs];[bgb][fgs]overlay=(W-w)/2:(H-h)/2,setsar=1'
    : 'scale=' + WORK_W + ':' + WORK_H + ':force_original_aspect_ratio=decrease,pad=' + WORK_W + ':' + WORK_H + ':(ow-iw)/2:(oh-ih)/2:color=0x07080c,setsar=1';
  return fit + ',' + zoomFilter(MOTIONS[index % MOTIONS.length], frames) + ',format=yuv420p';
}
/** أمر مشهد واحد: صورة + صوته (أو صمت) → مقطع 1080p30 بمدّته بالضبط */
export function sceneArgs(scene, index, files) {
  const D = scene.seconds.toFixed(3);
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', files.image];
  if (files.audio) args.push('-i', files.audio); else args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');
  const fc = '[0:v]' + sceneVideoFilter(scene, index) + '[v];[1:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,apad[a]';
  args.push('-filter_complex', fc, '-map', '[v]', '-map', '[a]', '-t', D,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-movflags', '+faststart', files.out);
  return args;
}
/* الانتقال: ذوبان حول بطاقات العناوين، وانزلاق ناعم باتّجاه القراءة كلّ ثالث مشهد */
function transitionFor(i, scenes, dir) {
  if (scenes[i].type === 'title' || scenes[i - 1].type === 'title') return 'fade';
  if (i % 3 === 1) return dir === 'rtl' ? 'smoothright' : 'smoothleft';
  return 'fade';
}
/** أمر الدمج: xfade بين المقاطع وacrossfade للصوت، والمدّة الكلّيّة = المجموع − الانتقالات */
export function joinArgs(scenes, files, dir) {
  const n = scenes.length;
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  for (const f of files.segments) args.push('-i', f);
  if (n === 1) { args.push('-c', 'copy', '-movflags', '+faststart', files.out); return args; }
  const parts = [];
  let off = 0, vPrev = '[0:v]', aPrev = '[0:a]';
  for (let i = 1; i < n; i++) {
    off += scenes[i - 1].seconds - XFADE;
    const vOut = i === n - 1 ? '[vout]' : '[v' + i + ']', aOut = i === n - 1 ? '[aout]' : '[a' + i + ']';
    parts.push(vPrev + '[' + i + ':v]xfade=transition=' + transitionFor(i, scenes, dir) + ':duration=' + XFADE + ':offset=' + off.toFixed(3) + vOut);
    parts.push(aPrev + '[' + i + ':a]acrossfade=d=' + XFADE + ':c1=tri:c2=tri' + aOut);
    vPrev = vOut; aPrev = aOut;
  }
  args.push('-filter_complex', parts.join(';'), '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', files.out);
  return args;
}
/** احتياط الدمج إن عجز xfade (موارد): لصق مباشر بلا إعادة ترميز */
export function concatArgs(listFile, out) {
  return ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-movflags', '+faststart', out];
}
export function totalSeconds(scenes) { return scenes.reduce((a, s) => a + s.seconds, 0) - XFADE * Math.max(0, scenes.length - 1); }
/** كلّ الأوامر لمانيفست مدده محسومة: المقاطع ثمّ الدمج (dir: مجلّد المهمّة) */
export function buildFfmpegArgs(manifest, dir) {
  const d = dir || '.';
  const segs = manifest.scenes.map((s, i) => {
    const image = join(d, s.type === 'style_sample' ? 'img_' + i + (s.mime === 'image/jpeg' ? '.jpg' : s.mime === 'image/webp' ? '.webp' : '.png') : 'shot_' + i + '.png');
    const out = join(d, 'seg_' + i + '.mp4');
    return { index: i, out, args: sceneArgs(s, i, { image, audio: s.audio ? join(d, 'audio_' + i + '.mp3') : '', out }) };
  });
  const out = join(d, 'video.mp4');
  return { segments: segs, join: { out, args: joinArgs(manifest.scenes, { segments: segs.map((x) => x.out), out }, manifest.dir) }, concat: { list: join(d, 'concat.txt'), args: concatArgs(join(d, 'concat.txt'), out) }, total: totalSeconds(manifest.scenes) };
}

/* ───────── بطاقة العنوان (صفحة تُصوَّر — الخطّ العربيّ من المتصفّح لا من ffmpeg) ───────── */
function esc(s) { return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
export function titleCardHtml(o) {
  const dir = o.dir === 'rtl' ? 'rtl' : 'ltr';
  const big = String(o.text || '').length > 28 ? 84 : 112;
  return '<!doctype html><html lang="' + esc(o.lang || 'ar') + '" dir="' + dir + '"><head><meta charset="utf-8">' +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@500;700;800&family=Noto+Sans:wght@500;700;800&display=block" rel="stylesheet">' +
    '<style>*{box-sizing:border-box;margin:0}html,body{width:1920px;height:1080px;overflow:hidden;background:#07080c;color:#eef1f6;font-family:Tajawal,"Noto Sans","Noto Sans Arabic","Noto Sans Devanagari","Noto Sans Bengali","Noto Sans Malayalam","Noto Sans CJK SC","WenQuanYi Zen Hei",system-ui,sans-serif}' +
    '.glow{position:absolute;border-radius:50%;filter:blur(120px);opacity:.42}.g1{width:980px;height:980px;background:#7a5a20;left:-260px;top:-360px}.g2{width:860px;height:860px;background:#1b2a4a;right:-200px;bottom:-380px}' +
    '.c{position:absolute;left:120px;right:120px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:34px}' +
    '.t{font-weight:800;font-size:' + big + 'px;line-height:1.28;background:linear-gradient(180deg,#fff4d6,#e8c27a 55%,#b9873e);-webkit-background-clip:text;color:transparent}' +
    '.s{font-weight:500;font-size:44px;line-height:1.55;color:#c9cfdb;max-width:1400px}.line{width:420px;height:4px;border-radius:4px;background:linear-gradient(90deg,transparent,#e8c27a,transparent)}' +
    '.brand{position:absolute;bottom:64px;inset-inline-end:84px;font-weight:700;font-size:30px;color:#e8c27a;letter-spacing:.3px;opacity:.9}</style></head><body>' +
    '<div class="glow g1"></div><div class="glow g2"></div><div class="c"><div class="t">' + esc(o.text) + '</div><div class="line"></div>' + (o.sub ? '<div class="s">' + esc(o.sub) + '</div>' : '') + '</div>' +
    '<div class="brand">' + esc(o.brand || 'عمران AI') + '</div></body></html>';
}
/** شريط تعليق يُحقن في صفحة التطبيق قبل اللقطة (نصّ المشهد القصير) ثمّ يُزال — يعمل داخل المتصفّح */
export function addCaption(arg) {
  var t = arg[0], dir = arg[1], bottom = arg[2];
  var old = document.getElementById('__dirCap'); if (old) old.remove();
  if (!t) return;
  var d = document.createElement('div'); d.id = '__dirCap'; d.dir = dir; d.textContent = t;
  d.style.cssText = 'position:fixed;left:50%;bottom:' + (bottom || 56) + 'px;transform:translateX(-50%);z-index:2147483647;max-width:72vw;padding:10px 24px;border-radius:999px;background:rgba(7,8,12,.84);border:1px solid rgba(232,194,122,.55);color:#f6e7c3;font:700 20px/1.45 Tajawal,system-ui,sans-serif;box-shadow:0 20px 50px -20px rgba(0,0,0,.9);pointer-events:none;text-align:center';
  document.body.appendChild(d);
}
/** مستطيل القصّ حول عنصر: يُوسَّع إلى ١٦:٩ مع هامش ويُحصر في الشاشة — null إن غاب العنصر */
export function focusRect(sel) {
  var el = document.querySelector(sel); if (!el) return null;
  var r = el.getBoundingClientRect(); if (!(r.width > 80 && r.height > 80)) return null;
  var W = innerWidth, H = innerHeight, pad = 20;
  var x = r.left - pad, y = r.top - pad, w = r.width + 2 * pad, h = r.height + 2 * pad;
  if (w / h < 16 / 9) { var nw = h * 16 / 9; x -= (nw - w) / 2; w = nw; } else { var nh = w * 9 / 16; y -= (nh - h) / 2; h = nh; }
  if (w > W) { w = W; h = W * 9 / 16; }
  if (h > H) { h = H; w = H * 16 / 9; }
  x = Math.max(0, Math.min(W - w, x)); y = Math.max(0, Math.min(H - h, y));
  return { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) };
}
/** تنظيف النوافذ المنبثقة والرسائل العابرة قبل اللقطة — يعمل داخل المتصفّح */
export function cleanPage() {
  ['omranIntro', 'privacyConsent', 'installBanner', 'pwaInstallBar', 'cookieBar', 'offlineBar'].forEach(function (id) { var e = document.getElementById(id); if (e) e.remove(); });
  document.querySelectorAll('.toast,.snackbar,[data-toast],#settingsToast').forEach(function (e) { try { e.remove(); } catch (x) { /* زال */ } });
}

/* ───────── أدوات التشغيل ───────── */
export function run(bin, args, opts) {
  const o = opts || {};
  return new Promise((resolve) => {
    let child;
    try { child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { resolve({ code: -1, out: '', err: String(e && e.message || e) }); return; }
    let out = '', err = '', done = false;
    const timer = setTimeout(() => { if (!done) { try { child.kill('SIGKILL'); } catch (e) { /* انتهى */ } err += '\n[timeout]'; } }, o.timeoutMs || 10 * 60 * 1000);
    child.stdout.on('data', (d) => { out = (out + d).slice(-20000); });
    child.stderr.on('data', (d) => { err = (err + d).slice(-6000); });
    child.on('error', (e) => { done = true; clearTimeout(timer); resolve({ code: -1, out, err: err + String(e && e.message || e) }); });
    child.on('close', (code) => { done = true; clearTimeout(timer); resolve({ code: code == null ? -1 : code, out, err }); });
  });
}
export async function probeSeconds(ffprobe, file) {
  const r = await run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { timeoutMs: 30000 });
  const n = parseFloat(String(r.out || '').trim());
  return (r.code === 0 && Number.isFinite(n) && n > 0) ? n : 0;
}
/** مدّة كلّ مشهد: صوته + نصف ثانية (محصورة)، وبلا صوت المدّة المطلوبة أو ٥ ثوانٍ */
export function resolveSeconds(scene, audioSeconds) {
  const want = audioSeconds > 0 ? audioSeconds + TAIL : (scene.seconds || 5);
  return Math.round(Math.max(LIMITS.minSec, Math.min(LIMITS.maxSec, want)) * 1000) / 1000;
}

async function loadPlaywright(repoDir) {
  const req = createRequire(import.meta.url);
  const cands = ['playwright', '/usr/local/lib/node_modules/playwright', join(repoDir || '', 'node_modules/playwright'), 'playwright-core'];
  for (const c of cands) {
    try { const mod = await import(pathToFileURL(req.resolve(c)).href); return mod.chromium || (mod.default && mod.default.chromium); }
    catch (e) { /* التالي */ }
  }
  throw new Error('playwright غير موجود في الحاوية');
}

async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i], i); }
  });
  await Promise.all(workers);
  return results;
}

/* ───────── المهمّة ───────── */
export function createRenderer(cfg) {
  const c = Object.assign({ appUrl: 'https://omran-ai-builder.vercel.app', ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', workDir: './render-work', repoDir: '', log: (s) => console.log('[render] ' + s), ttlMs: LIMITS.ttlMs, maxQueued: 3 }, cfg || {});
  if (!c.secret) throw new Error('secret required');
  const jobs = new Map();
  const queue = [];
  let running = null;
  const jobDir = (id) => join(c.workDir, 'jobs', id);
  const appOrigin = (() => { try { return new URL(c.appUrl).origin; } catch (e) { return ''; } })();

  function corsAllowed(origin) {
    if (!origin) return false;
    if (origin === appOrigin) return true;
    if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return true;
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
    return (c.extraOrigins || []).includes(origin);
  }
  function cors(req, res) {
    const origin = String(req.headers.origin || '');
    if (corsAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '600');
    }
  }
  function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); }
  function bearer(req, url) {
    const h = String(req.headers.authorization || '');
    return h.startsWith('Bearer ') ? h.slice(7).trim() : (url && url.searchParams.get('t')) || '';
  }
  async function readBody(req) {
    const chunks = []; let size = 0;
    for await (const ch of req) { size += ch.length; if (size > LIMITS.bodyBytes) throw Object.assign(new Error('body too large'), { code: 413 }); chunks.push(ch); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { throw Object.assign(new Error('bad json'), { code: 400 }); }
  }

  function publicState(j) {
    return { jobId: j.id, state: j.state, step: j.step, done: j.done, total: j.total, message: j.message || '', seconds: j.seconds || 0, url: j.state === 'done' ? '/render/' + j.id + '/video.mp4' : '', expiresAt: j.expiresAt || 0, queued: queue.indexOf(j) + 1 };
  }
  function set(j, patch) { Object.assign(j, patch); }

  async function writeAssets(j) {
    const d = jobDir(j.id);
    await mkdir(d, { recursive: true });
    const m = j.manifest;
    for (let i = 0; i < m.scenes.length; i++) {
      const s = m.scenes[i];
      if (s.audio) { await writeFile(join(d, 'audio_' + i + '.mp3'), Buffer.from(s.audio, 'base64')); s.hasAudio = true; s.audio = 'file'; }
      if (s.image) { await writeFile(join(d, 'img_' + i + (s.mime === 'image/jpeg' ? '.jpg' : s.mime === 'image/webp' ? '.webp' : '.png')), Buffer.from(s.image, 'base64')); s.image = 'file'; }
      j.done = i + 1;
    }
    for (let i = 0; i < m.scenes.length; i++) {
      const s = m.scenes[i];
      const a = s.hasAudio ? await probeSeconds(c.ffprobe, join(d, 'audio_' + i + '.mp3')) : 0;
      s.seconds = resolveSeconds(s, a);
    }
    j.seconds = Math.round(totalSeconds(m.scenes));
  }

  async function runSteps(page, steps) {
    for (const st of steps) {
      if (st.click) { await page.evaluate((sel) => { const el = document.querySelector(sel); if (el) el.click(); }, st.click); await page.waitForTimeout(500); }
      else if (st.wait) await page.waitForTimeout(st.wait);
      else if (st.focus) continue; /* يُقرأ عند اللقطة */
      else if (st.vtab) { await page.evaluate((v) => { const b = document.querySelector('#vmkTabs [data-tab="' + v + '"]'); if (b) b.click(); }, st.vtab); await page.waitForTimeout(500); }
      else if (st.settings) {
        await page.evaluate((sid) => {
          const d = document.getElementById('settingsDialog');
          if (d) { try { d.showModal(); } catch (e) { d.setAttribute('open', ''); } }
          if (typeof renderSettingsNavList === 'function') renderSettingsNavList();
          if (typeof showSettingsPage === 'function') showSettingsPage(sid);
        }, st.settings);
        await page.waitForTimeout(500);
      }
    }
  }

  async function capture(j) {
    const d = jobDir(j.id);
    const m = j.manifest;
    const todo = m.scenes.map((s, i) => ({ s, i })).filter((x) => x.s.type !== 'style_sample');
    j.total = todo.length; j.done = 0;
    if (!todo.length) return;
    const chromium = await loadPlaywright(c.repoDir);
    const launch = { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] };
    if (c.chromiumPath) launch.executablePath = c.chromiumPath;
    const browser = await chromium.launch(launch);
    try {
      const ctx = await browser.newContext({ viewport: { width: VIEW_W, height: VIEW_H }, deviceScaleFactor: VIEW_SCALE, colorScheme: 'dark', locale: m.lang, permissions: ['microphone'] });
      await ctx.addInitScript((lg) => {
        try { sessionStorage.setItem('omran_sess_v1', '1'); } catch (e) { /* لا شيء */ }
        try { localStorage.setItem('aiapp_intro', '0'); localStorage.setItem('aiapp_privacy_ack', '1'); localStorage.setItem('aiapp_lang', lg); } catch (e) { /* لا شيء */ }
      }, m.lang);
      const page = await ctx.newPage();
      page.setDefaultTimeout(45000);
      const card = await ctx.newPage();
      await card.setViewportSize({ width: OUT_W, height: OUT_H });
      for (const { s, i } of todo) {
        const file = join(d, 'shot_' + i + '.png');
        if (s.type === 'title') {
          await card.setContent(titleCardHtml({ text: s.text, sub: s.sub, dir: m.dir, lang: m.lang }), { waitUntil: 'load' });
          try { await card.evaluate(() => document.fonts.ready); } catch (e) { /* خطّ النظام يكفي */ }
          await card.waitForTimeout(250);
          await card.screenshot({ path: file, type: 'png' });
        } else {
          await page.goto(c.appUrl + '/', { waitUntil: 'load' });
          await page.waitForTimeout(1800);
          await page.evaluate(cleanPage);
          try { await runSteps(page, s.steps || []); } catch (e) { c.log('steps failed for scene ' + i + ': ' + String(e && e.message || e).slice(0, 120)); }
          await page.evaluate(cleanPage);
          const fc = (s.steps || []).find((st) => st.focus);
          let clipRect = null;
          if (fc) clipRect = await page.evaluate(focusRect, fc.focus).catch(() => null);
          if (s.text) await page.evaluate(addCaption, [s.text, m.dir, clipRect ? Math.round(VIEW_H - (clipRect.y + clipRect.height)) + Math.round(clipRect.height * 0.08) : 56]).catch(() => null);
          await page.waitForTimeout(300);
          await page.screenshot(clipRect ? { path: file, type: 'png', clip: clipRect } : { path: file, type: 'png' });
        }
        j.done++;
      }
      await ctx.close();
    } finally { await browser.close(); }
  }

  async function assemble(j) {
    const d = jobDir(j.id);
    const plan = buildFfmpegArgs(j.manifest, d);
    j.step = 'segments'; j.total = plan.segments.length; j.done = 0;
    await pool(plan.segments, Math.max(1, c.concurrency || 2), async (seg) => {
      let r = await run(c.ffmpeg, seg.args, { timeoutMs: LIMITS.segmentTimeoutMs });
      if (r.code !== 0) r = await run(c.ffmpeg, seg.args, { timeoutMs: LIMITS.segmentTimeoutMs });
      if (r.code !== 0) throw new Error('segment ' + seg.index + ' failed: ' + r.err.slice(-300));
      j.done++;
    });
    j.step = 'join'; j.total = 1; j.done = 0;
    let r = await run(c.ffmpeg, plan.join.args, { timeoutMs: LIMITS.joinTimeoutMs });
    if (r.code !== 0) {
      c.log('xfade join failed, falling back to concat: ' + r.err.slice(-200));
      await writeFile(plan.concat.list, plan.segments.map((s) => "file '" + s.out.replace(/'/g, "'\\''") + "'").join('\n') + '\n');
      r = await run(c.ffmpeg, plan.concat.args, { timeoutMs: LIMITS.joinTimeoutMs });
      if (r.code !== 0) throw new Error('join failed: ' + r.err.slice(-300));
    }
    j.done = 1;
    for (const s of plan.segments) rm(s.out, { force: true }).catch(() => null);
    for (let i = 0; i < j.manifest.scenes.length; i++) for (const f of ['shot_' + i + '.png', 'audio_' + i + '.mp3', 'img_' + i + '.png', 'img_' + i + '.jpg', 'img_' + i + '.webp']) rm(join(d, f), { force: true }).catch(() => null);
    return plan.join.out;
  }

  async function execute(j) {
    const started = Date.now();
    const guard = setTimeout(() => { set(j, { state: 'error', step: 'timeout', message: 'انتهت مهلة الإخراج.' }); }, LIMITS.jobTimeoutMs);
    try {
      set(j, { state: 'running', step: 'assets', total: j.manifest.scenes.length, done: 0 });
      await writeAssets(j);
      set(j, { step: 'capture' });
      await capture(j);
      const out = await assemble(j);
      if (j.state === 'error') return;
      set(j, { state: 'done', step: 'done', file: out, expiresAt: Date.now() + c.ttlMs, message: '' });
      c.log('job ' + j.id + ' done in ' + Math.round((Date.now() - started) / 1000) + 's, ' + j.seconds + 's of video, ' + j.manifest.scenes.length + ' scenes');
      j.manifest = { lang: j.manifest.lang, dir: j.manifest.dir, scenes: [] };
    } catch (e) {
      const msg = String(e && e.message || e).slice(0, 300);
      c.log('job ' + j.id + ' failed at ' + j.step + ': ' + msg);
      set(j, { state: 'error', message: msg });
    } finally { clearTimeout(guard); }
  }
  async function drain() {
    if (running || !queue.length) return;
    running = queue.shift();
    try { await execute(running); } finally { running = null; setImmediate(drain); }
  }

  async function sweep() {
    const now = Date.now();
    for (const [id, j] of jobs) if ((j.expiresAt && now > j.expiresAt) || (j.state === 'error' && now - j.createdAt > c.ttlMs)) { jobs.delete(id); rm(jobDir(id), { recursive: true, force: true }).catch(() => null); }
    try {
      const base = join(c.workDir, 'jobs');
      if (!existsSync(base)) return;
      for (const name of await readdir(base)) {
        if (jobs.has(name)) continue;
        try { const st = await stat(join(base, name)); if (now - st.mtimeMs > c.ttlMs) await rm(join(base, name), { recursive: true, force: true }); } catch (e) { /* زال */ }
      }
    } catch (e) { /* لا مجلّد */ }
  }

  async function handle(req, res, url) {
    cors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return true; }
    const path = url.pathname;
    if (!(path === '/render' || path.startsWith('/render/'))) return false;
    const auth = verifyJobToken(bearer(req, url), c.secret);
    if (!auth.ok) { json(res, 401, { error: 'unauthorized', why: auth.why }); return true; }
    if (req.method === 'POST' && path === '/render') {
      let body;
      try { body = await readBody(req); } catch (e) { json(res, e.code || 400, { error: e.message }); return true; }
      const v = validateManifest(body);
      if (!v.ok) { json(res, 400, { error: v.error }); return true; }
      if (jobs.has(auth.jobId)) { json(res, 409, { error: 'job_exists', jobId: auth.jobId }); return true; }
      if (queue.length >= c.maxQueued) { json(res, 429, { error: 'busy' }); return true; }
      const j = { id: auth.jobId, user: auth.user, state: 'queued', step: 'queued', done: 0, total: v.manifest.scenes.length, manifest: v.manifest, createdAt: Date.now(), expiresAt: 0, seconds: 0 };
      jobs.set(j.id, j); queue.push(j);
      c.log('job ' + j.id + ' queued: ' + v.manifest.scenes.length + ' scenes, lang ' + v.manifest.lang);
      json(res, 202, publicState(j));
      drain();
      return true;
    }
    const m = path.match(/^\/render\/([A-Za-z0-9_-]{4,64})(\/video\.mp4)?$/);
    if (req.method === 'GET' && m) {
      const j = jobs.get(m[1]);
      if (!j || j.id !== auth.jobId) { json(res, 404, { error: 'no_such_job' }); return true; }
      if (!m[2]) { json(res, 200, publicState(j)); return true; }
      if (j.state !== 'done' || !j.file || !existsSync(j.file)) { json(res, 409, { error: 'not_ready', state: j.state }); return true; }
      const size = (await stat(j.file)).size;
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': String(size), 'Content-Disposition': 'attachment; filename="omran-director.mp4"', 'Cache-Control': 'private, max-age=0' });
      createReadStream(j.file).pipe(res);
      return true;
    }
    json(res, 404, { error: 'not found' });
    return true;
  }

  const timer = setInterval(sweep, 3600 * 1000);
  if (timer.unref) timer.unref();
  sweep().catch(() => null);
  return { handle, jobs, sweep, corsAllowed, _execute: execute, _capture: capture, _assemble: assemble };
}
