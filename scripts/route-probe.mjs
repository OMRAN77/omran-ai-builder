#!/usr/bin/env node
// scripts/route-probe.mjs — أين تذهب الرسالة المكتوبة فعلًا؟ يقود window.sendPrompt الحقيقيّ في Chromium بخادم وهميّ
// (بلا شبكة ولا مفاتيح)، ويسجّل كلّ نداء /api/* ونافذة الفيديو وآخر ردّ لكلّ خطوة، ثمّ يحكم على المسار.
//
// الاستعمال:
//   node scripts/route-probe.mjs [--sets b1,c8|all] [--corpus ملف.json[,ملف2.json]] [--classifier oracle|null|none|image|video]
//        [--user sara|owner|guest] [--root مجلّد] [--jobs 2] [--out نتائج.jsonl] [--ask-modal 1|0]
//        [--max-hard 0] [--max-strict 2] [--only k1,f3] [--case-ms 9000] [--pw مسار playwright]
//
// المدوّنة: tests/fixtures/route-corpus/*.json (كلّ ملفّ مجموعة). كلّ حالة { id, text, expect|exp, clf|lane, attach, then:[خطوات] }:
//   expect (نصّ): chat · chat-search · vision · image · edit · edit-text · video · ad · ask · build-gate · build
//     · video-from-image (بعد صورة مولَّدة: الفيديو من الصورة نفسها — بطلها في صانع الفيديو أو imageBase64 في video-create)
//     · project-edit (مشروع مفتوح: محادثة بلا «موضوع جديد»، وللمالك ملاحظة «المشروع المفتوح = عدّله…»)
//   ctx: project (مشروع مفتوح فيه كود قبل الخطوة الأولى) — مراجعة الدفعة A (rel-2/rel-4).
//   exp (مصفوفة، مدوّنة الـ١١٥): CHAT · CHAT_IMG · IMG_GEN · IMG_EDIT · IMG_TEXT · VIDEO · AD · PHOTOS · LOGO_FETCH · BUILD_GATE · BUILD_HTML
//   attach: photo (صورة جوّال) أو shot (لقطة شاشة) تُرفق قبل الخطوة بـomranIngestFiles الحقيقيّة.
//   clf/lane: المسار الصحيح لمصنّف media-intent في وضع oracle. الحالات المتتابعة (then) في المحادثة نفسها،
//   فالمتابعة بعد صورة مولَّدة تجري على الحالة الحقيقيّة (lastMsgWasImageEdit…).
// المدوّنة القديمة (tests/fixtures/route-corpus.json: label T|M و ctx) تعمل كما هي: T = chat، M تُسجَّل بلا حكم.
//
// المصنّف لا يعمل بلا مفتاح، فـ--classifier يحدّد ما يردّه: oracle (المسار الصحيح للخطوة — الافتراضيّ)،
// null (تعذّر/مهلة فتحكم التعابير)، أو none/image/video ثابتًا.
// الحكم: hard = مسار خاطئ (صورة مدفوعة بدل محادثة، تعديل بدل شكر…)؛ soft = محادثة بدل مسار الوسائط المقصود.
// strict = hard + soft. --ask-modal 1 (الافتراضيّ): نافذة صانع الفيديو المجّانيّة بلا /api/video-create تُعدّ «سؤالًا» لطلب مبهم.
// يُنهي بالرمز 1 إن وقع خطأ صفحة، أو تجاوزت مجموعةٌ --max-hard / --max-strict (نسبًا مئويّة) إن أُعطيت.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };
const ROOT = path.resolve(String(opt('root', REPO)));
const CLASSIFIER = String(opt('classifier', 'oracle'));
const USER_OPT = String(opt('user', 'sara'));
const USER = USER_OPT === 'guest' ? '' : (USER_OPT === 'owner' ? 'omran' : USER_OPT);
const JOBS = Math.max(1, Number(opt('jobs', 2)) || 2);
const OUT = opt('out', '') ? String(opt('out', '')) : '';
const ASK_MODAL = String(opt('ask-modal', '1')) !== '0';
const MAX_HARD = opt('max-hard', null) === null ? null : Number(opt('max-hard'));
const MAX_STRICT = opt('max-strict', null) === null ? null : Number(opt('max-strict'));
const ONLY = new Set(String(opt('only', '') || '').split(',').filter(Boolean));
const CASE_MS = Number(opt('case-ms', 9000)) || 9000;

/* ── المدوّنة ── */
const CORPUS_DIR = path.join(REPO, 'tests/fixtures/route-corpus');
function loadSets() {
  const files = [];
  if (opt('corpus', '')) for (const f of String(opt('corpus')).split(',')) files.push(path.resolve(REPO, f));
  else {
    const want = String(opt('sets', 'all'));
    const all = fs.readdirSync(CORPUS_DIR).filter((f) => f.endsWith('.json')).sort();
    for (const f of all) if (want === 'all' || want.split(',').includes(f.replace(/\.json$/, ''))) files.push(path.join(CORPUS_DIR, f));
  }
  return files.map((f) => {
    let cases = JSON.parse(fs.readFileSync(f, 'utf8'));
    // المدوّنة القديمة: label T|M مع سياقات fresh/afterImage/attached — حالة لكلّ سياق
    if (cases.length && cases[0].label) {
      cases = cases.flatMap((c, i) => (c.ctx || ['fresh']).map((cx) => ({ id: 'L' + (i + 1) + (cx === 'fresh' ? '' : '-' + cx), text: c.text, expect: c.label === 'T' ? 'chat' : 'make', ctx: cx })));
    }
    if (ONLY.size) cases = cases.filter((c) => ONLY.has(c.id));
    return { name: path.basename(f).replace(/\.json$/, ''), cases };
  }).filter((s) => s.cases.length);
}

/* صورة PNG صغيرة حقيقيّة (٦٤×٦٤) يردّها المولّد الوهميّ — المتابعات تجري على صورة لا على فراغ */
function tinyPng() {
  const T = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const W = 64, H = 64, raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; for (let x = 0; x < W; x++) { const o = y * (W * 3 + 1) + 1 + x * 3; raw[o] = 60 + x * 2; raw[o + 1] = 140; raw[o + 2] = 90 + y * 2; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}
const IMG = tinyPng();

/* ── الخادم الوهميّ ── */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const inflight = new Set(); // الخطوات الجارية (لمصنّف oracle مع عمّال متوازين: يُطابَق نصّ الطلب)
const sse = (res, parts) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); for (const p of parts) res.write('data: ' + JSON.stringify(p) + '\n\n'); res.end(); };
const srv = http.createServer((rq, res) => {
  const u = new URL(rq.url, 'http://x');
  let p = decodeURIComponent(u.pathname);
  if (p === '/') p = '/index.html';
  if (p.startsWith('/api/')) {
    let body = '';
    rq.on('data', (d) => { body += d; if (body.length > 4e6) body = body.slice(0, 4e6); });
    rq.on('end', () => {
      let j = {}; try { j = JSON.parse(body || '{}') || {}; } catch (e) { j = {}; }
      const act = u.searchParams.get('action') || '';
      const json = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (p === '/api/tools' && act === 'media-intent') {
        if (CLASSIFIER === 'null') return json({ lane: null });
        if (CLASSIFIER !== 'oracle') return json({ lane: CLASSIFIER, confidence: 0.95 });
        const t = String(j.text || '');
        const st = [...inflight].find((s) => String(s.text).slice(0, 400) === t);
        return json({ lane: (st && (st.clf || st.lane)) || 'none', confidence: 0.95, source: 'llm' });
      }
      const sysOf = () => String(typeof j.system === 'string' ? j.system : JSON.stringify(j.system || '')) + (j.messages || []).filter((m) => m.role === 'system').map((m) => String(m.content)).join('\n');
      if (p === '/api/ai' && act === 'chat') {
        const sys = sysOf();
        let reply = 'هذا ردّ تجريبيّ من المسبار على رسالتك. النقطة الأولى: كذا. النقطة الثانية: كذا. وفي الختام خلاصة قصيرة.';
        if (/ممنوع أن تبنيه الآن/.test(sys)) reply = 'سأبني لك صفحة فيها الأقسام الرئيسية. تبيني أبدأ البناء الحين؟';
        if (/وافق المستخدم على البناء/.test(sys)) reply = 'تفضّل:\n```html\n<!doctype html><html><body><h1>مرحبا</h1></body></html>\n```';
        return sse(res, [{ status: 'يفكّر…' }, ...reply.match(/[\s\S]{1,40}/g).map((d) => ({ delta: d })), { done: true }]);
      }
      if (p === '/api/claude' || (p === '/api/ai' && act === 'claude')) {
        const reply = /ممنوع أن تبنيه الآن/.test(sysOf()) ? 'سأبني لك صفحة فيها الأقسام الرئيسية. تبيني أبدأ البناء الحين؟' : 'ردّ المسار القديم: جواب تجريبيّ.';
        return sse(res, reply.match(/[\s\S]{1,40}/g).map((t) => ({ type: 'content_block_delta', delta: { type: 'text_delta', text: t } })));
      }
      if (p === '/api/maha-image' || (p === '/api/media' && act === 'maha-image') || (p === '/api/tools' && act === 'adimage')) return json({ imageBase64: IMG, mimeType: 'image/png', engine: 'probe', caption: '' });
      if (p === '/api/search') return json({ results: [], images: [] });
      return json({});
    });
    return;
  }
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

/* ── تلخيص نداء /api/* ── */
const NOISE = /action=(?:client-errors|chats_save|chats_load|memory|usage-status|feedback)|\/api\/(?:usage-status|points|vip)/;
function summarize(r) {
  const u = new URL(r.url());
  const act = u.searchParams.get('action') || '';
  const o = { ep: u.pathname + (act ? '?action=' + act : ''), t: Date.now() };
  let j = null; try { j = JSON.parse(r.postData() || ''); } catch (e) { /* ليس JSON */ }
  if (!j) return o;
  const msgs = Array.isArray(j.messages) ? j.messages : [];
  const sys = msgs.filter((m) => m.role === 'system').map((m) => String(m.content)).concat(j.system ? [typeof j.system === 'string' ? j.system : JSON.stringify(j.system)] : []).join('\n');
  if (/ممنوع أن تبنيه الآن/.test(sys)) o.gateAsk = true;
  if (/وافق المستخدم على البناء/.test(sys)) o.gateBuild = true;
  if (/BUILD request|ابنِه الآن/.test(sys)) o.build = true;
  const lu = msgs.filter((m) => m.role === 'user').slice(-1)[0];
  if (lu) {
    o.img = Array.isArray(lu.content) && lu.content.some((c) => c && (c.type === 'image' || c.type === 'image_url'));
    o.lastUser = String(typeof lu.content === 'string' ? lu.content : (lu.content || []).filter((c) => c && c.type === 'text').map((c) => c.text).join(' ')).replace(/\s+/g, ' ').slice(0, 80);
  }
  o.ownerNote = /المشروع المفتوح = عدّله/.test(sys); o.topicNew = /موضوع جديد مختلف/.test(sys); // rel-4
  if (j.imageBase64) o.vidImg = true; // rel-2: الفيديو من صورة
  if (j.editImageBase64) o.edit = true;
  if (j.layoutOnly) o.layoutOnly = true;
  if (j.prompt && !j.messages) o.prompt = String(j.prompt).replace(/\s+/g, ' ').slice(0, 60);
  if (u.pathname === '/api/search') { o.images = !!j.images; o.q = String(j.query || '').slice(0, 60); }
  return o;
}

/* ── الحكم ── */
const FREE = /media-intent/;
function sigOf(row) { // مسار الخطوة بمفردات expect
  const c = row.calls.filter((x) => !FREE.test(x.ep));
  if (c.some((x) => x.gateAsk)) return 'GATE';
  if (c.some((x) => x.gateBuild)) return 'BUILD';
  if (c.some((x) => /studio-preview|video-create|veo-create|action=video|^\/api\/video(?:\?|$)/.test(x.ep)) || row.ui.video) return 'VIDEO';
  const f = c[0];
  if (!f) return /عن شو|of what|about what|وش تبي|اكتب وش/.test(row.ui.lastA || '') ? 'ASK' : '(none)';
  if (/action=chat|^\/api\/claude/.test(f.ep)) return f.img ? 'CHAT+img' : 'CHAT';
  if (/maha-image/.test(f.ep)) return f.edit ? 'IMG-EDIT' : (f.prompt ? 'IMG' : 'IMG-TEXT');
  if (/adimage/.test(f.ep)) return 'AD';
  if (/^\/api\/search/.test(f.ep)) return 'SEARCH';
  return f.ep.slice(0, 40);
}
function judgeExpect(row) {
  const s = sigOf(row), e = row.expect;
  const freeModal = ASK_MODAL && s === 'VIDEO' && !row.calls.some((x) => /video-create|veo-create/.test(x.ep));
  if (/^chat/.test(e)) return [/^CHAT/.test(s) ? 'OK' : 'HARD', s];
  if (e === 'make') return ['N/A', s];
  if (e === 'vision') return [s === 'CHAT+img' ? 'OK' : 'HARD', s];
  if (e === 'image') return [(s === 'IMG' || s === 'IMG-TEXT') ? 'OK' : ((s === 'CHAT' || s === 'AD') ? 'SOFT' : 'HARD'), s];
  if (e === 'edit') return [s === 'IMG-EDIT' ? 'OK' : (s === 'CHAT+img' ? 'SOFT' : 'HARD'), s];
  if (e === 'edit-text') return [(s === 'IMG-EDIT' || s === 'IMG-TEXT') ? 'OK' : (s === 'CHAT+img' ? 'SOFT' : 'HARD'), s];
  if (e === 'video') return [s === 'VIDEO' ? 'OK' : (/^CHAT/.test(s) ? 'SOFT' : 'HARD'), s];
  if (e === 'video-from-image') { // rel-2: صانع فيديو بلا الصورة = فيديو نصّيّ مدفوع من أمر بلا معنى («ابي فيديو منها»)
    const fromImg = !!(row.ui.hero || row.calls.some((x) => x.vidImg));
    return [s === 'VIDEO' && fromImg ? 'OK' : (/^CHAT/.test(s) ? 'SOFT' : 'HARD'), s + (s === 'VIDEO' && !fromImg ? '(no-image)' : '')];
  }
  if (e === 'project-edit') { // rel-4
    const c = row.calls.filter((x) => !FREE.test(x.ep));
    const topic = c.some((x) => x.topicNew), note = c.some((x) => x.ownerNote);
    return [/^CHAT/.test(s) && !topic && (USER_OPT !== 'owner' || note) ? 'OK' : 'HARD', s + (topic ? '+topicNew' : '') + (USER_OPT === 'owner' && !note ? '-ownerNote' : '')];
  }
  if (e === 'ad') return [(s === 'AD' || s === 'IMG' || s === 'IMG-TEXT') ? 'OK' : (/^CHAT/.test(s) ? 'SOFT' : 'HARD'), s];
  if (e === 'ask') return [(s === 'ASK' || s === 'CHAT' || freeModal) ? 'OK' : 'HARD', s];
  if (e === 'build-gate') return [s === 'GATE' ? 'OK' : (/^CHAT/.test(s) ? 'SOFT' : 'HARD'), s];
  if (e === 'build') return [s === 'BUILD' ? 'OK' : 'HARD', s];
  return ['N/A', s];
}
const MEDIA = new Set(['IMG_GEN', 'IMG_EDIT', 'VIDEO', 'AD', 'PHOTOS', 'LOGO_FETCH', 'IMG_TEXT']);
function route115(row) { // مسار الخطوة بمفردات مدوّنة الـ١١٥
  if (row.ui.video) return 'VIDEO';
  const sig = row.calls.filter((c) => /^\/api\/(ai\?action=(chat|agent)|maha-image|search|tools\?action=(adimage|stamps|card-extract)|video|claude$|openai$|gemini$|groq$)/.test(c.ep));
  if (!sig.length) return 'NONE';
  const c = sig[0];
  if (c.ep.startsWith('/api/video')) return 'VIDEO';
  if (c.ep === '/api/tools?action=adimage') return 'AD';
  if (c.ep === '/api/tools?action=stamps') return 'STAMPS';
  if (c.ep === '/api/ai?action=agent') return 'AGENT';
  if (c.ep === '/api/search') return /logo png$/.test(c.q || '') ? 'LOGO_FETCH' : (c.images ? 'PHOTOS' : 'SEARCH');
  if (c.ep === '/api/maha-image') return sig.some((x) => x.ep === '/api/maha-image' && x.layoutOnly) ? 'IMG_TEXT' : (sig.some((x) => x.ep === '/api/maha-image' && x.edit) ? 'IMG_EDIT' : 'IMG_GEN');
  if (c.ep === '/api/ai?action=chat') return c.img ? 'CHAT_IMG' : 'CHAT';
  if (/^\/api\/(claude|openai|gemini|groq)$/.test(c.ep)) return c.gateAsk ? 'BUILD_GATE' : (c.build ? 'BUILD_HTML' : 'LEGACY_CHAT');
  return c.ep;
}
function judgeExp(row) {
  const got = route115(row), exp = row.exp || [];
  if (exp.includes(got)) return ['OK', got];
  if (exp.some((e) => MEDIA.has(e)) && (got === 'CHAT' || got === 'CHAT_IMG')) return ['SOFT', got];
  return ['HARD', got];
}
const judge = (row) => (Array.isArray(row.exp) ? judgeExp(row) : judgeExpect(row));

/* ── المتصفّح ── */
async function loadPlaywright() {
  const explicit = opt('pw', '');
  const req = createRequire(import.meta.url);
  for (const c of (explicit ? [String(explicit)] : ['playwright', 'playwright-core'])) {
    try { return await import(pathToFileURL(req.resolve(c)).href); } catch (e) { /* التالي */ }
  }
  throw new Error('playwright غير موجود — npm i --no-save playwright-core (أو --pw مسار)');
}
function chromiumPath() {
  for (const p of [process.env.PW_CHROMIUM, '/opt/pw-browsers/chromium', '/usr/bin/google-chrome', '/usr/bin/chromium']) if (p && fs.existsSync(p)) return p;
  return undefined;
}

async function runCase(browser, base, set, c) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript((u) => {
    try { sessionStorage.setItem('omran_sess_v1', '1'); } catch (e) { /* لا شيء */ }
    try {
      localStorage.setItem('aiapp_intro', '0'); localStorage.setItem('aiapp_privacy_ack', '1'); localStorage.setItem('aiapp_lang', 'ar');
      if (u) { localStorage.setItem('aiapp_username', u); localStorage.setItem('aiapp_auth_token', 'local'); }
    } catch (e) { /* لا شيء */ }
    window.confirm = () => false; window.alert = () => {};
  }, USER);
  const page = await ctx.newPage();
  let calls = [];
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message || e).slice(0, 160)));
  page.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/') && !NOISE.test(u.pathname + u.search)) calls.push(summarize(r)); });
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.evaluate(({ ctxName, IMG }) => {
    ['omranIntro', 'privacyConsent'].forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });
    if (!ctxName || ctxName === 'fresh') return;
    const id = 'p_probe_' + Date.now();
    const p = { id, title: 'probe', messages: [], code: '' };
    if (ctxName === 'afterImage') {
      p.messages.push({ role: 'user', content: 'ارسم قطة' });
      p.messages.push({ role: 'assistant', content: '', attachments: [{ name: 'generated.png', isImage: true, mime: 'image/png', dataUrl: 'data:image/png;base64,' + IMG }] });
      p.lastEditedImage = { b64: IMG, mime: 'image/png' }; p.lastMsgWasImageEdit = true;
    }
    if (ctxName === 'project') { // rel-4: مشروع مفتوح فيه كود (ردّ بناء سابق)
      p.code = '<!doctype html><html><head><title>متجر</title></head><body><header><h1>متجر الورد</h1><button id="buy">اشتر الآن</button></header><section id="products"><div class="card">ورد أحمر</div></section></body></html>';
      p.messages.push({ role: 'user', content: 'ابني لي صفحة متجر ورد' }); p.messages.push({ role: 'assistant', content: 'تفضّل الصفحة.', code: p.code });
    }
    state.projects.push(p); state.currentId = id;
    if (ctxName === 'attached') pendingAttachments.push({ name: 'photo.png', isImage: true, mime: 'image/png', dataUrl: 'data:image/png;base64,' + IMG });
  }, { ctxName: c.ctx || 'fresh', IMG });
  const rows = [];
  const steps = [c, ...(c.then || [])];
  for (let si = 0; si < steps.length; si++) {
    const st = steps[si];
    inflight.add(st);
    calls = [];
    const t0 = Date.now();
    await page.evaluate(async (s) => {
      try { const vm = document.getElementById('videoMakerModal'); if (vm) vm.style.display = 'none'; const hp = document.getElementById('videoMakerHeroPreview'); if (hp) { hp.removeAttribute('src'); hp.style.display = 'none'; } } catch (e) { /* لا شيء */ }
      if (s.attach) {
        const cv = document.createElement('canvas');
        const [w, h] = s.attach === 'shot' ? [1280, 720] : [900, 1200];
        cv.width = w; cv.height = h; const g = cv.getContext('2d');
        if (s.attach === 'shot') { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#c00'; g.fillRect(300, 250, 680, 200); g.fillStyle = '#000'; g.font = '40px sans-serif'; g.fillText('Error 0x80070005 Access denied', 330, 360); }
        else { g.fillStyle = '#6a8'; g.fillRect(0, 0, w, h); g.fillStyle = '#fc0'; g.beginPath(); g.arc(450, 500, 200, 0, 7); g.fill(); }
        const blob = await new Promise((r) => cv.toBlob(r, s.attach === 'photo' ? 'image/jpeg' : 'image/png', 0.9));
        const name = s.attach === 'photo' ? 'IMG_2201.jpg' : 'Screenshot 2026-10-10 101500.png';
        await omranIngestFiles([new File([blob], name, { type: blob.type })], s.attach === 'photo' ? {} : { pasted: true });
      }
      const b = document.getElementById('btnSend'); if (b && !(typeof genAbortController !== 'undefined' && genAbortController)) b.disabled = false;
      document.getElementById('prompt').value = s.text;
      sendPrompt();
    }, { text: st.text, attach: st.attach || '' });
    // انتظر حتّى يهدأ: لا نداءات جديدة ١٫٥ث والزرّ غير مقفل، بحدّ أقصى case-ms
    let lastN = -1, stable = 0;
    while (Date.now() - t0 < (st.wait || CASE_MS)) {
      await page.waitForTimeout(300);
      const busy = await page.evaluate(() => { try { return !!(document.getElementById('btnSend') || {}).disabled; } catch (e) { return false; } });
      if (calls.length === lastN && !busy) { stable += 300; if (stable >= 1500 && (calls.length || stable >= 2400)) break; } else { stable = 0; lastN = calls.length; }
    }
    const ui = await page.evaluate(() => {
      const vm = document.getElementById('videoMakerModal');
      const vis = (el) => !!el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden'; // النافذة position:fixed فـoffsetParent فارغ دائمًا
      const cur = (typeof getCurrent === 'function') ? getCurrent() : null;
      const la = [...(cur ? cur.messages : [])].reverse().find((m) => m.role === 'assistant');
      const hp = document.getElementById('videoMakerHeroPreview'); // rel-2: بطل صانع الفيديو صورةٌ فعلًا
      return { hero: !!(hp && /^data:/.test(hp.getAttribute('src') || '') && hp.style.display !== 'none'), video: vis(vm), lastA: la ? String(la.content || '').replace(/\s+/g, ' ').slice(0, 90) : '', gate: window.__mediaGate };
    });
    inflight.delete(st);
    const sig = calls.filter((x) => !FREE.test(x.ep));
    const row = { set, id: c.id + (si ? '.' + si : ''), text: st.text, attach: st.attach || '-', expect: st.expect, exp: st.exp, clfCalled: calls.filter((x) => FREE.test(x.ep)).length,
      firstMs: sig.length ? sig[0].t - t0 : -1, calls: calls.map(({ t, ...rest }) => rest), ui, errs: errs.splice(0) };
    const [v, got] = judge(row); row.v = v; row.got = got;
    rows.push(row);
  }
  await ctx.close();
  return rows;
}

function report(name, rows) {
  const n = rows.filter((r) => r.v !== 'N/A').length;
  const hard = rows.filter((r) => r.v === 'HARD').length, soft = rows.filter((r) => r.v === 'SOFT').length;
  const lat = rows.map((r) => r.firstMs).filter((x) => x >= 0).sort((a, b) => a - b);
  const pe = rows.reduce((a, r) => a + r.errs.length, 0);
  const pct = (x) => (n ? (100 * x / n) : 0);
  const byExp = {};
  for (const r of rows) { const k = Array.isArray(r.exp) ? r.exp.join('|') : r.expect; byExp[k] = byExp[k] || { n: 0, bad: 0 }; byExp[k].n++; if (r.v === 'HARD' || r.v === 'SOFT') byExp[k].bad++; }
  console.log(`${name.padEnd(6)} steps ${String(n).padStart(3)}  hard ${String(hard).padStart(2)} (${pct(hard).toFixed(1)}%)  soft ${String(soft).padStart(2)}  strict ${pct(hard + soft).toFixed(1)}%  pageErrs ${pe}  firstCall ms median ${lat[lat.length >> 1] ?? '-'} p90 ${lat[Math.floor(lat.length * 0.9)] ?? '-'}`);
  console.log('       per-expect: ' + Object.entries(byExp).map(([k, v]) => k + ' ' + v.bad + '/' + v.n).join(', '));
  for (const r of rows) if (r.v === 'HARD' || r.v === 'SOFT') console.log(`       ${r.v.padEnd(4)} ${String(r.id).padEnd(6)} ${r.text.slice(0, 46)}${r.attach !== '-' ? ' [' + r.attach + ']' : ''} => ${r.got} (exp ${Array.isArray(r.exp) ? r.exp.join('|') : r.expect}) clf=${r.clfCalled}`);
  return { n, hard, soft, pe, hardPct: pct(hard), strictPct: pct(hard + soft) };
}

const sets = loadSets();
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port;
const pw = await loadPlaywright();
const chromium = pw.chromium || (pw.default && pw.default.chromium);
const browser = await chromium.launch({ executablePath: chromiumPath() });
const queue = sets.flatMap((s) => s.cases.map((c, i) => ({ set: s.name, c, i })));
const done = new Map();
const total = queue.length;
try {
  await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
    while (queue.length) {
      const q = queue.shift();
      done.set(q.set + '#' + q.i, await runCase(browser, base, q.set, q.c));
      if (done.size % 25 === 0) process.stderr.write(`… ${done.size}/${total} حالة\n`);
    }
  }));
} finally { await browser.close(); srv.close(); }

console.log(`route-probe · root ${path.relative(REPO, ROOT) || '.'} · classifier ${CLASSIFIER} · user ${USER_OPT} · ask-modal ${ASK_MODAL ? 1 : 0}`);
const all = [];
let failed = false, tot = { n: 0, hard: 0, soft: 0, pe: 0 };
for (const s of sets) {
  const rows = s.cases.flatMap((c, i) => done.get(s.name + '#' + i) || []);
  all.push(...rows);
  const r = report(s.name, rows);
  tot.n += r.n; tot.hard += r.hard; tot.soft += r.soft; tot.pe += r.pe;
  if (r.pe || (MAX_HARD !== null && r.hardPct > MAX_HARD) || (MAX_STRICT !== null && r.strictPct > MAX_STRICT)) failed = true;
}
console.log(`TOTAL  steps ${tot.n}  hard ${tot.hard} (${(100 * tot.hard / Math.max(1, tot.n)).toFixed(1)}%)  soft ${tot.soft}  strict ${(100 * (tot.hard + tot.soft) / Math.max(1, tot.n)).toFixed(1)}%  pageErrs ${tot.pe}`);
if (OUT) fs.writeFileSync(OUT, all.map((r) => JSON.stringify(r)).join('\n') + '\n');
if (failed) process.exit(1);
