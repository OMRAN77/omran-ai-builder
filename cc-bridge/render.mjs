// cc-bridge/render.mjs — v-app-director: تصوير شاشات التطبيق ودمج فيديو «مخرج التطبيق» على الجسر.
//
// المالك: «سوّ لي فيديو عن التطبيق ١٠ دقائق… مع مها أو عبدالله، وبأيّ لغة». المتصفّح يكتب الخطّة (Vercel) ويسجّل
// التعليق وصور الأنماط، ثمّ يرسل مانيفست المشاهد إلى هنا برمز مهمّة قصير العمر (HMAC بسرّ الجسر نفسه — السرّ لا
// يبلغ المتصفّح). الجسر: يصوّر كلّ شاشة مطلوبة من التطبيق المنشور بـChromium (١٩٢٠×١٠٨٠، دقّة مضاعفة، ثيم داكن،
// بلا نوافذ منبثقة)، يرسم بطاقات العناوين صفحةً بخطّ عربيّ واضح (لا drawtext)، ثمّ ffmpeg: كلّ مشهد صورة ثابتة
// بحركة كاميرا بطيئة (zoompan، يتبدّل اتّجاهها)، صوته عليه وخانته = مدّة صوته + نصف ثانية، وانتقال xfade مخبوز في آخر كلّ مقطع
// (من صورته وصورة تاليه) فيكون الدمج لصقًا بلا إعادة ترميز؛ الإخراج 1080p30 H.264 + AAC. الناتج يبقى ٢٤ ساعة ثمّ يُحذف.
//
// بناء أوامر ffmpeg دوالّ نقيّة (buildFfmpegArgs) تُختبر بلا ffmpeg. لا يطبع الرمز ولا السرّ في السجلّ.
'use strict';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile, rm, readdir, stat } from 'node:fs/promises';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { availableParallelism, totalmem } from 'node:os';
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
  scenes: 90, steps: 8, imageChars: 9e6, audioChars: 4e6, bodyBytes: 160e6, textChars: 180, subChars: 200,
  minSec: 2.5, maxSec: 40, ttlMs: 24 * 3600 * 1000, jobTimeoutMs: 55 * 60 * 1000, segmentTimeoutMs: 6 * 60 * 1000, joinTimeoutMs: 25 * 60 * 1000, sceneTimeoutMs: 3 * 60 * 1000,
};
/* v-director-render-robust (لقطتا المالك ١٢ أكتوبر: «المشهد ١ من ٤» ربع ساعة ثمّ «segment 2 failed:» بلا سبب):
   ffmpeg مقتول بإشارة على Railway (ضيق ذاكرة: مقطع واحد ٢٥٠–٣٩٠ م.ب مقيسًا، وحتّى أربعة بالتوازي مع كروميوم) كان يصل
   المالك رسالةً فارغة، وpage.evaluate بلا مهلة في Playwright يعلّق المشهد بلا حدّ. هنا: السبب يُقال، التزامن من ذاكرة
   الحاوية، ترميز أخفّ، إعادة وحيدة ثمّ صورة ثابتة بدل إسقاط الفيديو، ومهلة للمشهد كلّه، وسطر السجلّ الأخير في الحالة. */
const MB = 1024 * 1024;
/** حدّ ذاكرة الحاوية من cgroup (v2 ثمّ v1) وإلّا ذاكرة الجهاز؛ «max» أو رقم خرافيّ = بلا حدّ */
export function parseMemLimit(text, total) { const v = Number(String(text || '').trim()); return (Number.isFinite(v) && v > 0 && v < 1e15) ? Math.min(v, total) : total; }
export function memoryLimitBytes() {
  const total = totalmem();
  for (const p of ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes']) {
    try { return parseMemLimit(readFileSync(p, 'utf8'), total); } catch (e) { /* ليس في حاوية، أو إصدار cgroup آخر */ }
  }
  return total;
}
/** مقاطع ffmpeg المتوازية: ٧٠٠ م.ب لكروميوم وNode ثمّ ٤٠٠ م.ب لكلّ مقطع، بين ١ وسقف الأنوية (≤ ٤) */
export function autoConcurrency(limitBytes, coreCap) {
  const byMem = Math.floor((Number(limitBytes) - 700 * MB) / (400 * MB));
  return Math.max(1, Math.min(4, Number(coreCap) || 1, Number.isFinite(byMem) ? byMem : 1));
}
/** سبب فشل عمليّة: stderr إن وُجد، وإلّا الإشارة التي قتلتها (الذاكرة على الأرجح)، وإلّا رمز الخروج */
export function explainRun(r) {
  const e = String((r && r.err) || '').trim();
  if (e) return e.slice(-300);
  if (r && r.signal) return 'ffmpeg killed by ' + r.signal + ' — memory pressure likely';
  return 'ffmpeg exit ' + (r ? r.code : '?') + ' without output';
}
/** الأمر نفسه بترميز أخفّ للذاكرة (خيط واحد، نظرة قصيرة) للإعادة وحده — الملفّ الشخصيّ نفسه (ultrafast يُطفئ CABAC فيصير Baseline ويختلف SPS بين المقاطع الملصوقة) */
export function lightArgs(args) {
  const a = args.slice();
  const i = a.indexOf('-x264-params'); if (i >= 0) a[i + 1] = 'rc-lookahead=5:ref=1';
  const t = a.indexOf('-threads'); if (t >= 0) a[t + 1] = '1';
  return a;
}
/** true إن انقضت المهلة قبل الوعد (الوعد لا يُلغى — المنادي يستبدل ما علّق) */
export function raceTimeout(p, ms) {
  return new Promise((res) => {
    const t = setTimeout(() => res(true), ms);
    Promise.resolve(p).then(() => { clearTimeout(t); res(false); }, () => { clearTimeout(t); res(false); });
  });
}
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

/* ───────── أوامر ffmpeg (نقيّة) ─────────
   v-app-director-reliable: كان الدمج سلسلة xfade واحدة لكلّ المقاطع — قيس محلّيًّا: ٢٠ مشهدًا = ١٨١ ث و٢٫٤ غ.ب، والذاكرة تكبر مع
   العدد (كلّ المدخلات تُفكّ معًا وتُخزَّن إطاراتها حتّى يحين دورها)، فكان فيديو ١٠ دقائق (٧٥ مشهدًا) سيُسقط الحاوية. الآن الانتقال
   يُخبَز في المقطع نفسه: كلّ مقطع يُرسم من صورته وصورة المشهد التالي (حركتاهما حتميّتان لأنّهما صورتان ثابتتان)، آخره ذوبان نصف
   ثانية في أوّل حركة التالي، والتالي يبدأ حركته من حيث انتهى الذوبان. فالدمج لصق بلا إعادة ترميز: ثوانٍ، وذاكرة ثابتة مهما طال.
   التوقيت: خانة المشهد = صوته + نصف ثانية؛ الصوت يملأ الخانة إلّا نصفها الأخير (صمت أثناء الانتقال)، والمدّة الكلّيّة = مجموع الخانات. */
const MOTIONS = ['in', 'out', 'right', 'left'];
export const XF = Math.round(XFADE * FPS); // إطارات الانتقال
/** إطارات خانة المشهد (عدد صحيح: كلّ مقطع يبدأ وينتهي على حدّ إطار) */
export function slotFrames(scene) { return Math.max(XF * 2, Math.round(scene.seconds * FPS)); }
/** حركة الكاميرا لـd إطارًا تبدأ من الإطار on0 من أصل total — المقام ثابت فسرعة الحركة واحدة بين مقدّمة المشهد (في ذوبان سابقه) وبقيّته */
function zoomFilter(kind, total, on0, d) {
  const n = '(on+' + on0 + ')/' + Math.max(1, total);
  let z, x = "x='iw/2-(iw/zoom/2)'";
  const y = "y='ih/2-(ih/zoom/2)'";
  if (kind === 'in') z = "z='1+0.08*" + n + "'";
  else if (kind === 'out') z = "z='1.08-0.08*" + n + "'";
  else if (kind === 'right') { z = "z='1.06'"; x = "x='(iw-iw/zoom)*" + n + "'"; }
  else { z = "z='1.06'"; x = "x='(iw-iw/zoom)*(1-" + n + ")'"; }
  return 'zoompan=' + z + ':' + x + ':' + y + ':d=' + Math.max(1, d) + ':s=' + OUT_W + 'x' + OUT_H + ':fps=' + FPS;
}
/** ملء الإطار: لقطة ١٦:٩ تُحشى، وصورة ليست ١٦:٩ (نموذج نمط مربّع) على خلفيّة مموّهة من نفسها بدل شريطين أسودين */
function fitFilter(type, tag) {
  return type === 'style_sample'
    ? 'split[bg' + tag + '][fg' + tag + '];[bg' + tag + ']scale=' + WORK_W + ':' + WORK_H + ':force_original_aspect_ratio=increase,crop=' + WORK_W + ':' + WORK_H + ',gblur=sigma=40,eq=brightness=-0.12[bgb' + tag + '];[fg' + tag + ']scale=' + WORK_W + ':' + WORK_H + ':force_original_aspect_ratio=decrease[fgs' + tag + '];[bgb' + tag + '][fgs' + tag + ']overlay=(W-w)/2:(H-h)/2,setsar=1'
    : 'scale=' + WORK_W + ':' + WORK_H + ':force_original_aspect_ratio=decrease,pad=' + WORK_W + ':' + WORK_H + ':(ow-iw)/2:(oh-ih)/2:color=0x07080c,setsar=1';
}
/** نموذج نمط وصل بنسبة ١٦:٩ (التعليق مرسوم عليه في المتصفّح) يُعامل كلقطة: بلا خلفيّة مموّهة (أسرع) */
function fitType(scene) { return scene.type === 'style_sample' && !scene.wide ? 'style_sample' : 'screen'; }
export function isWide(size) { return !!(size && size.w > 0 && size.h > 0 && Math.abs(size.w / size.h - 16 / 9) < 0.03); }
/** امتداد ملفّ الصوت من محتواه: RIFF/WAVE = wav (الصوت الاحتياطيّ)، وغيره mp3 */
export function audioExtOf(buf) { return (buf && buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') ? 'wav' : 'mp3'; }
/* الانتقال: ذوبان حول بطاقات العناوين، وانزلاق ناعم باتّجاه القراءة كلّ ثالث مشهد */
function transitionFor(i, scenes, dir) {
  if (scenes[i].type === 'title' || scenes[i - 1].type === 'title') return 'fade';
  if (i % 3 === 1) return dir === 'rtl' ? 'smoothright' : 'smoothleft';
  return 'fade';
}
/** مرشّح فيديو المقطع i: حركته من الإطار lead (مقدّمته ظهرت في ذوبان سابقه) ثمّ ذوبان في مقدّمة التالي إن وُجد */
export function sceneVideoFilter(scenes, index, dir) {
  const s = scenes[index], next = scenes[index + 1];
  const F = slotFrames(s), lead = index > 0 ? XF : 0;
  const own = '[0:v]' + fitFilter(fitType(s), 'a') + ',' + zoomFilter(MOTIONS[index % MOTIONS.length], F + lead, lead, F) + ',format=yuv420p';
  if (!next) return own + '[v]';
  const nx = '[1:v]' + fitFilter(fitType(next), 'b') + ',' + zoomFilter(MOTIONS[(index + 1) % MOTIONS.length], slotFrames(next) + XF, 0, XF) + ',format=yuv420p';
  return own + '[own];' + nx + '[nx];[own][nx]xfade=transition=' + transitionFor(index + 1, scenes, dir) + ':duration=' + XFADE + ':offset=' + ((F - XF) / FPS).toFixed(3) + '[v]';
}
/** أمر مقطع واحد: صورته (+ صورة التالي للذوبان) + صوته أو صمت → مقطع 1080p30 بطول خانته بالضبط */
export function sceneArgs(scenes, index, files, dir) {
  const s = scenes[index], hasNext = index < scenes.length - 1;
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', files.image];
  if (hasNext) args.push('-i', files.nextImage);
  if (files.audio) args.push('-i', files.audio); else args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');
  const fc = sceneVideoFilter(scenes, index, dir) + ';[' + (hasNext ? 2 : 1) + ':a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,apad[a]';
  /* الإعدادات واحدة في كلّ المقاطع (الملفّ الشخصيّ والمستوى وطول المجموعة) كي يصحّ لصقها بلا إعادة ترميز */
  args.push('-filter_complex', fc, '-map', '[v]', '-map', '[a]', '-t', (slotFrames(s) / FPS).toFixed(3),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-profile:v', 'high', '-level:v', '4.1', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-g', String(FPS * 2),
    '-threads', '2', '-x264-params', 'rc-lookahead=10:ref=1', /* v-director-render-robust: أخفّ للذاكرة (−١٧٪) وأسرع (−٤٠٪) مقيسًا بلا فرق مرئيّ على صور ثابتة */
    '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-movflags', '+faststart', files.out);
  return args;
}
/** الاحتياط الأخير لمقطع يفشل ترميزه: صورته ثابتة بلا حركة ولا ذوبان (بالملفّ الشخصيّ نفسه فيُلصق مع الباقي).
 *  الصورة تُفكّ مرّة واحدة ويولّد zoompan الثابت إطاراتها (١٦٤ م.ب مقيسًا) — لا `-loop 1` الذي يفكّ PNG لكلّ إطار (٣١٤ م.ب وأبطأ أربع مرّات). */
export function plainSceneArgs(scenes, index, files) {
  const s = scenes[index];
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', files.image];
  if (files.audio) args.push('-i', files.audio); else args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');
  const fit = fitType(s) === 'style_sample' ? fitFilter('style_sample', 'a') + ',scale=' + OUT_W + ':' + OUT_H
    : 'scale=' + OUT_W + ':' + OUT_H + ':force_original_aspect_ratio=decrease,pad=' + OUT_W + ':' + OUT_H + ':(ow-iw)/2:(oh-ih)/2:color=0x07080c,setsar=1';
  const fc = '[0:v]' + fit + ",zoompan=z='1':x=0:y=0:d=" + slotFrames(s) + ':s=' + OUT_W + 'x' + OUT_H + ':fps=' + FPS + ',format=yuv420p[v];[1:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,apad[a]';
  args.push('-filter_complex', fc, '-map', '[v]', '-map', '[a]', '-t', (slotFrames(s) / FPS).toFixed(3),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-profile:v', 'high', '-level:v', '4.1', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-g', String(FPS * 2),
    '-threads', '1', '-x264-params', 'rc-lookahead=5:ref=1', /* veryfast لا ultrafast: الملفّ الشخصيّ High نفسه فيُلصق بلا تعثّر */
    '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-movflags', '+faststart', files.out);
  return args;
}
/** أمر الدمج: لصق المقاطع — الفيديو نسخًا بلا إعادة ترميز، والصوت يُعاد ترميزه (ثوانٍ) فيخرج متّصلًا بلا فجوات عند الحدود */
export function concatArgs(listFile, out, copyAudio) {
  const a = copyAudio ? ['-c', 'copy'] : ['-c:v', 'copy', '-af', 'aresample=async=1:first_pts=0', '-c:a', 'aac', '-b:a', '160k'];
  return ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile].concat(a, ['-movflags', '+faststart', out]);
}
/** نصّ قائمة اللصق (مسارات بشرطة مائلة أماميّة: الشرطة الخلفيّة داخل الاقتباس هروب عند ffmpeg) */
export function concatList(files) { return files.map((f) => "file '" + String(f).replace(/\\/g, '/').replace(/'/g, "'\\''") + "'").join('\n') + '\n'; }
export function totalSeconds(scenes) { return scenes.reduce((a, s) => a + slotFrames(s) / FPS, 0); }
export function sceneImage(scene, i, d) { return join(d, scene.type === 'style_sample' ? 'img_' + i + (scene.mime === 'image/jpeg' ? '.jpg' : scene.mime === 'image/webp' ? '.webp' : '.png') : 'shot_' + i + '.png'); }
/** كلّ الأوامر لمانيفست مدده محسومة: المقاطع (كلّ مقطع يحتاج صورته وصورة تاليه) ثمّ اللصق (dir: مجلّد المهمّة) */
export function buildFfmpegArgs(manifest, dir) {
  const d = dir || '.';
  const sc = manifest.scenes;
  const segs = sc.map((s, i) => {
    const out = join(d, 'seg_' + i + '.mp4');
    const files = { image: sceneImage(s, i, d), nextImage: i < sc.length - 1 ? sceneImage(sc[i + 1], i + 1, d) : '', audio: s.audio ? join(d, 'audio_' + i + '.' + (s.audioExt || 'mp3')) : '', out };
    return { index: i, out, needs: [i].concat(i < sc.length - 1 ? [i + 1] : []), args: sceneArgs(sc, i, files, manifest.dir), plain: plainSceneArgs(sc, i, files) };
  });
  const out = join(d, 'video.mp4'), list = join(d, 'concat.txt');
  return { segments: segs, list, listText: concatList(segs.map((x) => x.out)), join: { out, args: concatArgs(list, out, false) }, fallback: { out, args: concatArgs(list, out, true) }, total: totalSeconds(sc) };
}

/* ───────── بطاقة العنوان (صفحة تُصوَّر — الخطّ العربيّ من المتصفّح لا من ffmpeg) ───────── */
function esc(s) { return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
export function titleCardHtml(o) {
  const dir = o.dir === 'rtl' ? 'rtl' : 'ltr';
  const big = String(o.text || '').length > 28 ? 84 : 112;
  return '<!doctype html><html lang="' + esc(o.lang || 'ar') + '" dir="' + dir + '"><head><meta charset="utf-8">' +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@500;700;800&family=Noto+Sans:wght@500;700;800&display=block" rel="stylesheet">' +
    '<style>*{box-sizing:border-box;margin:0}html,body{width:1920px;height:1080px;overflow:hidden;background:radial-gradient(1100px 820px at 18% 8%,rgba(122,90,32,.5),transparent 70%),radial-gradient(1000px 800px at 88% 96%,rgba(27,42,74,.7),transparent 70%),#07080c;color:#eef1f6;font-family:Tajawal,"Noto Sans","Noto Sans Arabic","Noto Sans Devanagari","Noto Sans Bengali","Noto Sans Malayalam","Noto Sans CJK SC","WenQuanYi Zen Hei",system-ui,sans-serif}' +
    '.c{position:absolute;left:120px;right:120px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:34px}' +
    '.t{font-weight:800;font-size:' + big + 'px;line-height:1.28;background:linear-gradient(180deg,#fff4d6,#e8c27a 55%,#b9873e);-webkit-background-clip:text;color:transparent}' +
    '.s{font-weight:500;font-size:44px;line-height:1.55;color:#c9cfdb;max-width:1400px}.line{width:420px;height:4px;border-radius:4px;background:linear-gradient(90deg,transparent,#e8c27a,transparent)}' +
    '.brand{position:absolute;bottom:64px;inset-inline-end:84px;font-weight:700;font-size:30px;color:#e8c27a;letter-spacing:.3px;opacity:.9}</style></head><body>' +
    '<div class="c"><div class="t">' + esc(o.text) + '</div><div class="line"></div>' + (o.sub ? '<div class="s">' + esc(o.sub) + '</div>' : '') + '</div>' +
    '<div class="brand">' + esc(o.brand || 'عمران AI') + '</div></body></html>';
}
/** شريط تعليق يُحقن في صفحة التطبيق قبل اللقطة (نصّ المشهد القصير) ثمّ يُزال — يعمل داخل المتصفّح */
export function addCaption(arg) {
  var t = arg[0], dir = arg[1], bottom = arg[2];
  var old = document.getElementById('__dirCap'); if (old) old.remove();
  if (!t) return;
  var d = document.createElement('div'); d.id = '__dirCap'; d.dir = dir; d.textContent = t;
  d.style.cssText = 'position:fixed;left:50%;bottom:' + (bottom || 56) + 'px;transform:translateX(-50%);z-index:2147483647;max-width:72vw;padding:10px 24px;border-radius:' + (String(t).length > 48 ? '18px' : '999px') + ';background:rgba(7,8,12,.84);border:1px solid rgba(232,194,122,.55);color:#f6e7c3;font:700 20px/1.45 Tajawal,system-ui,sans-serif;box-shadow:0 20px 50px -20px rgba(0,0,0,.9);pointer-events:none;text-align:center';
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
    child.on('close', (code, signal) => { done = true; clearTimeout(timer); resolve({ code: code == null ? -1 : code, signal: signal || '', out, err }); }); /* الإشارة تُقال لا تُبتلع */
  });
}
export async function probeSize(ffprobe, file) {
  const r = await run(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file], { timeoutMs: 30000 });
  const m = /^(\d+)x(\d+)/.exec(String(r.out || '').trim());
  return (r.code === 0 && m) ? { w: Number(m[1]), h: Number(m[2]) } : null;
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

/* ───────── المهمّة ───────── */
export function createRenderer(cfg) {
  const c = Object.assign({ appUrl: 'https://omran-ai-builder.vercel.app', ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', workDir: './render-work', repoDir: '', log: (s) => console.log('[render] ' + s), ttlMs: LIMITS.ttlMs, maxQueued: 3 }, cfg || {});
  if (!(c.concurrency > 0)) c.concurrency = autoConcurrency(c.memoryLimitBytes || memoryLimitBytes(), Math.max(1, Math.min(4, availableParallelism() - 1))); /* مقاطع ffmpeg المتوازية: أنوية الجهاز ناقص واحد بسقف ٤، ثمّ ما تسعه ذاكرة الحاوية (١ على الخطط الصغيرة) */
  const exec = c.run || run; /* للاختبار: ffmpeg وهميّ */
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
    return { jobId: j.id, state: j.state, step: j.step, done: j.done, total: j.total, message: j.message || '', seconds: j.seconds || 0, fallbacks: j.fallbacks || 0, segFallbacks: j.segFallbacks || 0, stepSeconds: j.stepAt ? Math.round((Date.now() - j.stepAt) / 1000) : 0, lastLog: (j.logs || []).slice(-2).join(' · '), url: j.state === 'done' ? '/render/' + j.id + '/video.mp4' : '', expiresAt: j.expiresAt || 0, queued: queue.indexOf(j) + 1 };
  }
  function set(j, patch) { if (patch.step && patch.step !== j.step) j.stepAt = Date.now(); Object.assign(j, patch); }
  /** سطر سجلّ للمهمّة: يُطبع ويُحفظ آخر ثلاثة في الحالة العامّة (المالك يرى ما يحدث بدل صمت ربع ساعة) */
  function jlog(j, line) { j.logs = (j.logs || []).concat(new Date().toISOString().slice(11, 19) + ' ' + line).slice(-3); c.log('job ' + j.id + ' ' + line); }

  async function writeAssets(j) {
    const d = jobDir(j.id);
    await mkdir(d, { recursive: true });
    const m = j.manifest;
    for (let i = 0; i < m.scenes.length; i++) {
      const s = m.scenes[i];
      if (s.audio) {
        const ab = Buffer.from(s.audio, 'base64');
        s.audioExt = audioExtOf(ab);
        await writeFile(join(d, 'audio_' + i + '.' + s.audioExt), ab); s.hasAudio = true; s.audio = 'file';
      }
      if (s.image) { await writeFile(join(d, 'img_' + i + (s.mime === 'image/jpeg' ? '.jpg' : s.mime === 'image/webp' ? '.webp' : '.png')), Buffer.from(s.image, 'base64')); s.image = 'file'; }
      j.done = i + 1;
    }
    for (let i = 0; i < m.scenes.length; i++) {
      const s = m.scenes[i];
      const a = s.hasAudio ? await probeSeconds(c.ffprobe, join(d, 'audio_' + i + '.' + (s.audioExt || 'mp3'))) : 0;
      s.seconds = resolveSeconds(s, a);
      if (s.type === 'style_sample') s.wide = isWide(await probeSize(c.ffprobe, sceneImage(s, i, d)));
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

  /* v-app-director-reliable: لقطة واحدة علّقت ٣٠ ث فأسقطت المهمّة كلّها (ثبت بتشغيل المسار كاملًا محلّيًّا). الآن: سياق لبطاقات العناوين
     وسياق للتطبيق (لا صفحة ١٩٢٠×١٠٨٠ بدقّة ×٣ = ١٨ ميغابكسل)، الصفحة المصوَّرة في الواجهة، الحركات موقوفة عند اللقطة، إعادة واحدة،
     ولقطة شاشة تعذّرت مرّتين تصير بطاقة عنوان بنصّ المشهد بدل فشل الفيديو — وزمن كلّ لقطة في السجلّ. */
  const SHOT = { type: 'png', animations: 'disabled', caret: 'hide', timeout: 60000 };
  async function shootCard(pg, s, m, file) {
    await pg.bringToFront();
    await pg.setContent(titleCardHtml({ text: s.text || s.target || '', sub: s.sub, dir: m.dir, lang: m.lang }), { waitUntil: 'load' });
    try { await pg.evaluate(() => document.fonts.ready); } catch (e) { /* خطّ النظام يكفي */ }
    await pg.waitForTimeout(250);
    await pg.screenshot(Object.assign({ path: file }, SHOT));
  }
  async function shootScreen(pg, s, m, file, state) {
    await pg.bringToFront();
    const key = JSON.stringify(s.steps || []);
    if (state.key !== key) { /* مشاهد متتالية للشاشة نفسها: لا إعادة تحميل، يتبدّل شريط التعليق وحده */
      state.key = '';
      await pg.goto(c.appUrl + '/', { waitUntil: 'load' });
      await pg.waitForTimeout(1800);
      await pg.evaluate(cleanPage);
      try { await runSteps(pg, s.steps || []); } catch (e) { c.log('steps failed: ' + String(e && e.message || e).slice(0, 120)); }
      await pg.evaluate(cleanPage);
      state.key = key;
    }
    const fc = (s.steps || []).find((st) => st.focus);
    let clipRect = null;
    if (fc) clipRect = await pg.evaluate(focusRect, fc.focus).catch(() => null);
    await pg.evaluate(addCaption, [s.text || '', m.dir, clipRect ? Math.round(VIEW_H - (clipRect.y + clipRect.height)) + Math.round(clipRect.height * 0.08) : 56]).catch(() => null);
    await pg.waitForTimeout(300);
    await pg.screenshot(Object.assign({ path: file }, SHOT, clipRect ? { clip: clipRect } : {}));
  }
  async function capture(j, onShot) {
    const d = jobDir(j.id);
    const m = j.manifest;
    const todo = m.scenes.map((s, i) => ({ s, i })).filter((x) => x.s.type !== 'style_sample');
    j.total = todo.length; j.done = 0; j.fallbacks = 0;
    if (!todo.length) return;
    const chromium = await loadPlaywright(c.repoDir);
    const launch = { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] };
    if (c.chromiumPath) launch.executablePath = c.chromiumPath;
    const browser = await chromium.launch(launch);
    try {
      const appCtx = await browser.newContext({ viewport: { width: VIEW_W, height: VIEW_H }, deviceScaleFactor: VIEW_SCALE, colorScheme: 'dark', locale: m.lang, permissions: ['microphone'] });
      await appCtx.addInitScript((lg) => {
        try { sessionStorage.setItem('omran_sess_v1', '1'); } catch (e) { /* لا شيء */ }
        try { localStorage.setItem('aiapp_intro', '0'); localStorage.setItem('aiapp_privacy_ack', '1'); localStorage.setItem('aiapp_lang', lg); } catch (e) { /* لا شيء */ }
      }, m.lang);
      const cardCtx = await browser.newContext({ viewport: { width: OUT_W, height: OUT_H }, deviceScaleFactor: 2, colorScheme: 'dark', locale: m.lang });
      let page = await appCtx.newPage();
      page.setDefaultTimeout(45000);
      let shotGen = 0;
      const card = await cardCtx.newPage();
      const state = { key: '' };
      for (const { s, i } of todo) {
        const file = join(d, 'shot_' + i + '.png');
        const t0 = Date.now();
        let ok = false, lastErr = '';
        const gen = ++shotGen; /* v-director-render-robust: مهلة للمشهد كلّه — page.evaluate بلا مهلة في Playwright؛ ما يتجاوزها يصير بطاقة عنوان وتُستبدل الصفحة المعلّقة */
        const timedOut = await raceTimeout((async () => {
          for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
            if (gen !== shotGen) return;
            try {
              if (s.type === 'title') await shootCard(card, s, m, file); else await shootScreen(page, s, m, file, state);
              if (gen === shotGen) ok = true;
            } catch (e) { lastErr = String(e && e.message || e).split('\n')[0].slice(0, 160); state.key = ''; }
          }
        })(), LIMITS.sceneTimeoutMs);
        if (timedOut) {
          shotGen++; ok = false; lastErr = 'scene timeout ' + Math.round(LIMITS.sceneTimeoutMs / 1000) + 's'; state.key = '';
          await raceTimeout(page.close().catch(() => null), 10000);
          page = await appCtx.newPage(); page.setDefaultTimeout(45000);
        }
        if (!ok) {
          jlog(j, 'scene ' + i + ' (' + s.type + ' ' + (s.target || '') + ') capture failed twice: ' + lastErr + ' — title card instead');
          await shootCard(card, s, m, file); /* بطاقة بنصّ المشهد؛ إن فشلت هي أيضًا فالمتصفّح نفسه معطوب والمهمّة تفشل بسببها */
          j.fallbacks++;
        }
        const ms = Date.now() - t0;
        if (ms > 15000 || !ok) jlog(j, 'scene ' + i + ' ' + s.type + ' ' + (s.target || '') + ' took ' + Math.round(ms / 1000) + 's');
        j.done++;
        if (onShot) onShot(i);
      }
      await appCtx.close(); await cardCtx.close();
    } finally { await browser.close(); }
  }

  /* v-app-director-reliable: الترميز يبدأ أثناء التصوير — كلّ مقطع يُرمَّز فور توفّر صورته وصورة تاليه (واحد في كلّ مرّة ما دام المتصفّح
     يصوّر كي لا يختنق، ثمّ بالتوازي)، فالزمن الكلّيّ ≈ الأطول من التصوير والترميز لا مجموعهما. */
  function makeEncoder(j, plan) {
    const n = plan.segments.length;
    const ready = new Set(), started = new Set();
    let active = 0, done = 0, capturing = true, failed = null, wake = null;
    const limit = () => (capturing ? 1 : c.concurrency);
    let waiting = 0; const quietWaiters = [];
    /* ينتظر حتّى لا يبقى ترميز جارٍ غير المنتظِرين (منتظران معًا يُطلقان واحدًا بعد واحد) */
    const quiet = () => new Promise((res) => {
      waiting++;
      const check = () => { if (active - waiting <= 0) { waiting--; res(); return true; } return false; };
      if (!check()) quietWaiters.push(check);
    });
    const releaseQuiet = () => { for (const ck of quietWaiters.splice(0)) if (!ck()) quietWaiters.push(ck); };
    async function encode(seg) {
      let r = await exec(c.ffmpeg, seg.args, { timeoutMs: LIMITS.segmentTimeoutMs });
      if (r.code !== 0) r = await exec(c.ffmpeg, seg.args, { timeoutMs: LIMITS.segmentTimeoutMs });
      if (r.code !== 0) {
        /* v-director-render-robust: فشل مرّتين (غالبًا مقتول لضيق الذاكرة): انتظر خلوّ الترميز ثمّ أعد وحده أخفّ، وإلّا صورة ثابتة */
        jlog(j, 'segment ' + seg.index + ' failed twice (' + explainRun(r) + ') — waiting for the others, then alone with lighter encoding');
        await quiet();
        r = await exec(c.ffmpeg, lightArgs(seg.args), { timeoutMs: LIMITS.segmentTimeoutMs });
        if (r.code !== 0 && seg.plain) {
          jlog(j, 'segment ' + seg.index + ' lighter encoding failed (' + explainRun(r) + ') — still picture instead of camera motion');
          r = await exec(c.ffmpeg, seg.plain, { timeoutMs: LIMITS.segmentTimeoutMs });
          if (r.code === 0) j.segFallbacks = (j.segFallbacks || 0) + 1;
        }
        if (r.code !== 0) throw new Error('segment ' + seg.index + ' failed: ' + explainRun(r));
      }
    }
    function pump() {
      if (failed || waiting) return; /* منتظِر الهدوء يمنع بدء مقاطع جديدة */
      for (const seg of plan.segments) {
        if (active >= limit()) break;
        if (started.has(seg.index) || !seg.needs.every((k) => ready.has(k))) continue;
        started.add(seg.index); active++;
        encode(seg).then(() => { done++; if (j.step === 'segments') j.done = done; }, (e) => { failed = failed || e; })
          .then(() => { active--; releaseQuiet(); pump(); if (wake) wake(); });
      }
    }
    return {
      markReady(i) { ready.add(i); pump(); },
      captureDone() { capturing = false; pump(); },
      count() { return done; },
      async finish() { for (;;) { if (failed) throw failed; if (done >= n) return; await new Promise((r) => { wake = r; }); } },
    };
  }

  async function joinSegments(j, plan) {
    const d = jobDir(j.id);
    await writeFile(plan.list, plan.listText);
    let r = await run(c.ffmpeg, plan.join.args, { timeoutMs: LIMITS.joinTimeoutMs });
    if (r.code !== 0) {
      c.log('join with audio re-encode failed, copying both streams: ' + r.err.slice(-200));
      r = await run(c.ffmpeg, plan.fallback.args, { timeoutMs: LIMITS.joinTimeoutMs });
      if (r.code !== 0) throw new Error('join failed: ' + r.err.slice(-300));
    }
    for (const s of plan.segments) rm(s.out, { force: true }).catch(() => null);
    rm(plan.list, { force: true }).catch(() => null);
    for (let i = 0; i < plan.segments.length; i++) for (const f of ['shot_' + i + '.png', 'audio_' + i + '.mp3', 'audio_' + i + '.wav', 'img_' + i + '.png', 'img_' + i + '.jpg', 'img_' + i + '.webp']) rm(join(d, f), { force: true }).catch(() => null);
    return plan.join.out;
  }

  async function execute(j) {
    const started = Date.now();
    const guard = setTimeout(() => { set(j, { state: 'error', step: 'timeout', message: 'انتهت مهلة الإخراج.' }); }, LIMITS.jobTimeoutMs);
    try {
      set(j, { state: 'running', step: 'assets', total: j.manifest.scenes.length, done: 0 });
      await writeAssets(j);
      const plan = buildFfmpegArgs(j.manifest, jobDir(j.id));
      const enc = makeEncoder(j, plan);
      j.manifest.scenes.forEach((s, i) => { if (s.type === 'style_sample') enc.markReady(i); });
      set(j, { step: 'capture' });
      try { await capture(j, (i) => enc.markReady(i)); } finally { enc.captureDone(); }
      set(j, { step: 'segments', total: plan.segments.length, done: enc.count() });
      await enc.finish();
      set(j, { step: 'join', total: 1, done: 0 });
      const out = await joinSegments(j, plan);
      j.done = 1;
      if (j.state === 'error') return;
      set(j, { state: 'done', step: 'done', file: out, expiresAt: Date.now() + c.ttlMs, message: '' });
      c.log('job ' + j.id + ' done in ' + Math.round((Date.now() - started) / 1000) + 's, ' + j.seconds + 's of video, ' + j.manifest.scenes.length + ' scenes');
      j.manifest = { lang: j.manifest.lang, dir: j.manifest.dir, scenes: [] };
    } catch (e) {
      const msg = String(e && e.message || e).replace(/\u001b\[[0-9;]*m/g, '').split('\n')[0].slice(0, 300); /* سطر واحد بلا ألوان الطرفيّة */
      jlog(j, 'failed at ' + j.step + ': ' + msg);
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
  return { handle, jobs, sweep, corsAllowed, _execute: execute, _capture: capture, _makeEncoder: makeEncoder, _joinSegments: joinSegments, _publicState: publicState, _set: set };
}
