#!/usr/bin/env node
// scripts/face-lab.mjs — مختبر ثبات الوجه في فيديو «صورة + وصف» (المالك ١٨ أكتوبر: «تقيس قبل لا تصلّح»).
// يُشغَّل محلّيًّا في بيئة خاصّة فقط: node scripts/face-lab.mjs --spec "<مواصفة>" [--out <مجلّد خارج المستودع>]
//   face-check                       ← مجّانيّ: صلاحيّة رمز المالك على الموقع والمعاينة، وتنزيل الصور المرشّحة لتُراجَع
//   face|e=runway+veo|k=runway|p=man1+woman1+child1|base=preview
//        e = المحرّكات بالمسار المعتاد (الإطار المرسوم كما في الإنتاج)، k = المحرّكات نفسها مع keepPhoto (صورة المستخدم إطارًا أوّل)،
//        p = الصور من PHOTOS، base = prod (الافتراضيّ) أو preview (معاينة فرع الطلب)
// يشغّل صانع الفيديو الحقيقيّ في متصفّح بحساب المالك (كـvideo-samples): نفس الضغطات والطلبات التي يرسلها المستخدم، ويلتقط جسم طلب
// الإنشاء (الصورة التي وصلت الخادم فعلًا) ويحقن keepPhoto لذراع المقارنة فقط. ⚠ الذراعان e وk يصرفان على المحرّكات بأمر المالك.
// الخصوصيّة: المستودع عامّ والموقع ينشر media/ — فالمخرجات (الصور والإطارات والفيديو) تُكتب خارج المستودع حصرًا (--out، الافتراضيّ
// مجلّد مؤقّت)، ولا يُطبع شيء منها في السجلّ؛ يرفض أيّ مجلّد داخل المستودع.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const SPEC = String(argv[argv.indexOf('--spec') + 1] || 'face-check');
const parts = Object.fromEntries(SPEC.split('|').slice(1).map((p) => { const i = p.indexOf('='); return [p.slice(0, i), p.slice(i + 1)]; }));
const list = (k) => String(parts[k] || '').split('+').map((s) => s.trim()).filter(Boolean);
const CHECK = SPEC.startsWith('face-check');
const USER = process.env.SAMPLE_USER || 'omran';
const TOKEN = process.env.SAMPLE_TOKEN || '';
const PROD = process.env.BASE || 'https://omran-ai-builder.vercel.app';
const PREVIEW = 'https://omran-ai-builder-git-claude-funny-ride-5c3rjt-omran4.vercel.app';
const BASE = parts.base === 'preview' ? PREVIEW : PROD;
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = path.resolve(argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : path.join(os.tmpdir(), 'face-lab-' + STAMP + (CHECK ? '-check' : '')));
if (OUT === ROOT || OUT.startsWith(ROOT + path.sep)) { console.error('--out داخل المستودع مرفوض (المستودع عامّ والموقع ينشر media/)'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'face-lab-'));
const JOB_TIMEOUT = 16 * 60 * 1000;
const UA = 'omran-face-lab/1.0 (GitHub Actions; owner QA of face consistency)';

// صور حقيقيّة برخص مفتوحة من ويكيميديا (تُنزَّل في المشغّل؛ لا تُرفع إلى المستودع إلّا مشفّرة)
const PHOTOS = {
  man1: 'Smiling_Man_(Imagicity_97).jpg',
  man2: 'Flickr_-_Sukanto_Debnath_-_A_happy_man.jpg',
  man3: 'Face_portrait_(Unsplash).jpg',
  woman1: 'Portrait_in_hijab,_3064633.jpg',
  woman2: 'A_muslim_woman_wearing_hijab.jpg',
  woman3: 'Punjabi_woman_smile.jpg',
  woman4: 'Woman_with_bindi_smiles_(Unsplash).jpg',
  child1: 'A_boy_smiling.jpg',
  child2: 'Little_kid_smiling..jpg',
  child3: 'Smiling_face_of_a_Bangladeshi_child.jpg',
  child4: 'Smiling_boy.jpg',
};
// وصف عاديّ واحد للكلّ (بجنس الصورة): مشي هادئ نحو الكاميرا بابتسامة — بلا لفّ رأس ولا تغطية، فما يتغيّر هو ما يغيّره المسار نفسه
const DESC = {
  m: 'يمشي بهدوء على كورنيش البحر وقت الغروب ويبتسم للكاميرا، لقطة متوسطة سينمائية',
  f: 'تمشي بهدوء على كورنيش البحر وقت الغروب وتبتسم للكاميرا، لقطة متوسطة سينمائية',
};
const ACTOR_LINE = 'هلا والله! حياكم في تطبيق عمران، أسهل طريقة تسوّي فيديو بالذكاء الاصطناعي.';
const CREATE_RX = /\/api\/video(-create\b|\?action=(veo|minimax|omni|actor)-create\b)/;
const FAIL_RX = /❌|تعذّر|خطأ|فشل|error|failed|🔑|🔒|🕒/i;

/* المخرجات ملفّات عاديّة في OUT (خارج المستودع): <الوسم>/<الاسم> */
function seal(name, buf) { const p = path.join(OUT, name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); }
function writeKey() { /* لا تشفير — المخرجات لا تغادر البيئة الخاصّة */ }

async function getPhoto(key) {
  const file = PHOTOS[key];
  if (!file) throw new Error('صورة غير معروفة: ' + key);
  const url = 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(file) + '?width=1280';
  const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!r.ok) throw new Error('تنزيل ' + key + ' ← ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  const p = path.join(WORK, key + '.jpg');
  fs.writeFileSync(p, buf);
  return { p, buf };
}

async function ownerCheck(base) {
  const out = { base: base.replace(/^https:\/\//, '') };
  try {
    const home = await fetch(base + '/', { redirect: 'manual' });
    out.home = home.status;
    const r = await fetch(base + '/api/video?action=video-balance&token=' + encodeURIComponent(TOKEN));
    out.balance = r.status;
    const j = await r.json().catch(() => null);
    if (j && typeof j === 'object') { out.keys = j.keys; out.credits = j.credits; out.error = j.error; }
  } catch (e) { out.fail = String(e && e.message || e).slice(0, 120); }
  return out;
}

if (CHECK) {
  console.log('face-check: رمز المالك ' + (TOKEN ? 'موجود' : 'مفقود (SAMPLE_TOKEN)'));
  for (const b of [PROD, PREVIEW]) console.log('face-check:', JSON.stringify(TOKEN ? await ownerCheck(b) : { base: b, skipped: 'no token' }));
  writeKey();
  let got = 0;
  for (const k of Object.keys(PHOTOS)) {
    try { const { buf } = await getPhoto(k); seal('photo-' + k + '.jpg', buf); got++; console.log('face-check: صورة', k, (buf.length / 1024).toFixed(0) + 'KB'); }
    catch (e) { console.log('face-check: ✗', k, String(e && e.message || e).slice(0, 120)); }
  }
  console.log('النتيجة: فحص فقط — ' + got + ' صور في ' + OUT + '، بلا توليد ولا صرف');
  process.exit(0);
}

/* ── التشغيل المدفوع ── */
if (!TOKEN) { console.error('SAMPLE_TOKEN مفقود — رمز جلسة المالك كسرّ في المستودع.'); process.exit(2); }
const ENGINES = list('e'), KEEP = list('k'), PICK = list('p');
if (!PICK.length || !(ENGINES.length || KEEP.length)) { console.error('المواصفة ناقصة: p= ومعها e= أو k='); process.exit(2); }
const req = createRequire(import.meta.url);
let pw; for (const c of ['playwright', 'playwright-core']) { try { pw = await import(pathToFileURL(req.resolve(c)).href); break; } catch (e) { /* التالي */ } }
if (!pw) throw new Error('playwright غير موجود');
const chromium = pw.chromium || pw.default.chromium;
const exe = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
writeKey();

const photos = {};
for (const k of PICK) { const ph = await getPhoto(k); photos[k] = ph.p; seal(k + '/original.jpg', ph.buf); }
const jobs = [];
for (const k of PICK) {
  for (const e of ENGINES) jobs.push({ photo: k, engine: e, arm: 'frame' });
  for (const e of KEEP) jobs.push({ photo: k, engine: e, arm: 'keep' });
}
console.log('face-lab:', jobs.length, 'فيديو على', BASE.replace(/^https:\/\//, ''));
const browser = await chromium.launch({ executablePath: exe });

function frames(raw, tag) {
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', raw], { encoding: 'utf8' }).trim()) || 0;
  const pts = { f0: null, f25: dur * 0.25, f50: dur * 0.5, f75: dur * 0.75, fend: 'end' };
  const out = {};
  for (const [name, t] of Object.entries(pts)) {
    const p = path.join(WORK, tag + '-' + name + '.jpg');
    const a = t === null ? ['-i', raw, '-vf', 'select=eq(n\\,0)', '-vframes', '1']
      : t === 'end' ? ['-sseof', '-0.15', '-i', raw, '-update', '1', '-vframes', '1'] : ['-ss', String(t), '-i', raw, '-vframes', '1'];
    try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error'].concat(a, ['-q:v', '2', p])); out[name] = fs.readFileSync(p); } catch (e) { /* إطار ناقص يُسجَّل غيابه في meta */ }
  }
  for (let s = 1; s < dur; s += 1) {
    const p = path.join(WORK, tag + '-s' + s + '.jpg');
    try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(s), '-i', raw, '-vframes', '1', '-q:v', '3', p]); out['s' + String(s).padStart(2, '0')] = fs.readFileSync(p); } catch (e) { /* كما فوق */ }
  }
  const small = path.join(WORK, tag + '-480.mp4');
  try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', 'scale=-2:480', '-c:v', 'libx264', '-crf', '26', '-an', small]); out.video = fs.readFileSync(small); } catch (e) { /* المعاينة ترف */ }
  return { dur, out };
}

async function runJob(job) {
  const tag = job.photo + '-' + job.engine + '-' + job.arm;
  const meta = Object.assign({ tag, base: BASE.replace(/^https:\/\//, ''), started: new Date().toISOString() }, job);
  const t0 = Date.now();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(([u, t]) => {
    try { sessionStorage.setItem('omran_sess_v1', '1'); localStorage.setItem('aiapp_intro', '0'); localStorage.setItem('aiapp_privacy_ack', '1'); localStorage.setItem('aiapp_lang', 'ar'); localStorage.setItem('aiapp_username', u); localStorage.setItem('aiapp_auth_token', t); } catch (e) { /* لا شيء */ }
  }, [USER, TOKEN]);
  const page = await ctx.newPage();
  page.on('dialog', (d) => { meta.dialog = String(d.message()).slice(0, 160); d.accept().catch(() => {}); });
  let sentB64 = '';
  await page.route(CREATE_RX, async (route) => {
    const r = route.request();
    if (r.method() !== 'POST') return route.continue();
    let body = null; try { body = JSON.parse(r.postData() || '{}'); } catch (e) { body = null; }
    if (!body) return route.continue();
    meta.action = (r.url().match(/action=([\w-]+)/) || [, 'video-create'])[1];
    sentB64 = String(body.imageBase64 || body.image || '');
    meta.sent = { mime: body.imageMime || '', len: sentB64.length, keepPhoto: !!body.keepPhoto, style: body.style || '', trend: body.trend || '' };
    if (job.arm === 'keep') body.keepPhoto = true;
    meta.injected = job.arm === 'keep';
    return route.continue({ postData: JSON.stringify(body) });
  });
  page.on('response', async (res) => {
    if (!CREATE_RX.test(res.url()) || res.request().method() !== 'POST') return;
    meta.createStatus = res.status();
    try { const j = await res.json(); meta.createKeys = Object.keys(j || {}); meta.createError = j && (j.error || j.message) ? String(j.error || j.message).slice(0, 200) : ''; } catch (e) { /* ليس JSON */ }
  });
  try {
    await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(2500);
    await page.evaluate(() => { ['omranIntro', 'privacyConsent'].forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); }); });
    await page.evaluate(() => document.getElementById('btnVideoMaker').click()); await page.waitForSelector('#vmkTabs', { timeout: 15000 });
    await page.click('#vmkTabs [data-tab="' + job.engine + '"]'); await page.waitForTimeout(600);
    await page.setInputFiles('#videoMakerHeroInput', photos[job.photo]);
    await page.waitForFunction(() => { const p = document.getElementById('videoMakerHeroPreview'); return p && p.src && p.src.startsWith('data:'); }, null, { timeout: 15000 });
    const g = /^woman/.test(job.photo) ? 'f' : 'm';
    if (job.engine === 'actor') await page.fill('#videoMakerActorSpeech', ACTOR_LINE);
    await page.fill('#videoMakerPrompt', DESC[g]);
    meta.desc = DESC[g];
    await page.click('#videoMakerGenerateBtn');
    let src = '', lastSt = '';
    while (Date.now() - t0 < JOB_TIMEOUT) {
      await page.waitForTimeout(6000);
      src = await page.evaluate(() => { const v = document.getElementById('videoMakerResult'); return v && getComputedStyle(v).display !== 'none' ? (v.currentSrc || v.getAttribute('src') || '') : ''; });
      if (src) break;
      const st = await page.evaluate(() => (document.getElementById('videoMakerStatus') || {}).innerText || '');
      if (st && st !== lastSt) { lastSt = st; (meta.statuses = meta.statuses || []).push(st.replace(/\s+/g, ' ').slice(0, 160)); }
      if (FAIL_RX.test(st)) throw new Error('الصانع أعلن فشلًا: ' + st.replace(/\s+/g, ' ').slice(0, 160));
    }
    if (!src) throw new Error('انتهت المهلة بلا فيديو');
    const b64 = await page.evaluate(async ([s, tk]) => {
      const direct = /^blob:/.test(s) || s.startsWith(location.origin) || s.startsWith('/');
      const r = await fetch(direct ? s : '/api/video-download?url=' + encodeURIComponent(s), { headers: { Authorization: 'Bearer ' + tk } });
      if (!r.ok) throw new Error('تنزيل ' + r.status);
      const buf = new Uint8Array(await r.arrayBuffer()); let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return btoa(bin);
    }, [src, TOKEN]);
    const raw = path.join(WORK, tag + '.mp4'); fs.writeFileSync(raw, Buffer.from(b64, 'base64'));
    const { dur, out } = frames(raw, tag);
    meta.duration = dur; meta.frames = Object.keys(out); meta.ok = true;
    if (sentB64) seal(tag + '/sent.jpg', Buffer.from(sentB64, 'base64'));
    for (const [name, buf] of Object.entries(out)) seal(tag + '/' + name + (name === 'video' ? '.mp4' : '.jpg'), buf);
    console.log('✓', tag, dur.toFixed(1) + 's', Math.round((Date.now() - t0) / 1000) + 's');
  } catch (e) {
    meta.ok = false; meta.error = String(e && e.message || e).slice(0, 240);
    if (sentB64) seal(tag + '/sent.jpg', Buffer.from(sentB64, 'base64'));
    console.error('✗', tag, meta.error);
  } finally {
    meta.ms = Date.now() - t0;
    seal(tag + '/meta.json', Buffer.from(JSON.stringify(meta, null, 1)));
    await ctx.close();
  }
  return meta.ok;
}

// ثلاثة في وقت واحد، ولا يتزامن محرّكان متماثلان (خانة Runway واحدة على المفتاح المشترك)
let ok = 0, fail = 0;
const queue = jobs.slice(), busy = new Set();
async function worker() {
  for (;;) {
    const i = queue.findIndex((j) => !busy.has(j.engine));
    if (i < 0) { if (!queue.length) return; await new Promise((r) => setTimeout(r, 3000)); continue; }
    const job = queue.splice(i, 1)[0];
    busy.add(job.engine);
    try { (await runJob(job)) ? ok++ : fail++; } finally { busy.delete(job.engine); }
  }
}
try { await Promise.all([worker(), worker(), worker()]); } finally { await browser.close(); }
console.log(`النتيجة: ${ok} نجح · ${fail} فشل — المخرجات في ${OUT}`);
process.exit(ok > 0 ? 0 : 1);
