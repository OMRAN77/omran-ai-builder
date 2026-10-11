#!/usr/bin/env node
// scripts/route-probe.mjs — أين تذهب الرسالة المكتوبة فعلًا؟ يقود window.sendPrompt الحقيقيّ في Chromium
// بلا شبكة ولا مفاتيح، ويسجّل كلّ نداء /api/* وكلّ نافذة تُفتح وكلّ حوار confirm/alert لكلّ رسالة في المدوّنة.
//
// الاستعمال:
//   node scripts/route-probe.mjs [--corpus tests/fixtures/route-corpus.json] [--persona owner|user|both]
//        [--classifier null|none|image|video] [--out /tmp/route.json] [--only T|M] [--pw مسار playwright-core]
//
// الوجهة لكلّ رسالة (أوّل ما يحدث):
//   paid:<نقطة>  نداء نقطة توليد مدفوعة (صورة/فيديو/إعلان/طوابع/تصميم…) قبل أن يرى النموذج الرسالة
//   window:<دالّة> فتح نافذة صانع (فيديو/استوديو…) بدل الردّ
//   dialog      حوار confirm/alert أصليّ (يُرفض)
//   model       وصلت المحادثة /api/ai?action=chat (أو المسار القديم للمزوّد)
//   none        لا شيء من ذلك
// الوسم في المدوّنة: T = كلام/سؤال/طلب أمثلة (أيّ وجهة غير model خطأ)، M = طلب صنع صريح (يُسجَّل للمقارنة).
// المصنّف (/api/tools?action=media-intent) لا يمكن تشغيله بلا مفتاح: --classifier يحدّد ما يردّه
// (null = متعذّر فتحكم التعابير — الافتراضيّ، none/image/video = يردّ ذلك دائمًا).
// يُنهي بالرمز 1 إن ذهبت رسالة T لغير النموذج أو وقع خطأ صفحة.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };
const CORPUS = path.resolve(ROOT, String(opt('corpus', 'tests/fixtures/route-corpus.json')));
const PERSONA = String(opt('persona', 'both'));
const CLASSIFIER = String(opt('classifier', 'null'));
const OUT = opt('out', '') ? String(opt('out', '')) : '';
const ONLY = String(opt('only', '') || '');
const CASE_MS = Number(opt('case-ms', 12000)) || 12000;

// النقاط التي تصرف (نقاطًا أو مالًا) أو تفتح مسار توليد — لا يجوز أن تُنادى من رسالة مكتوبة قبل النموذج.
const PAID = [
  /^\/api\/maha-image/, /^\/api\/media\?action=(?:maha-image|img)/, /^\/api\/video-create/, /^\/api\/video\?action=(?:veo|omni|minimax|actor)-create/,
  /^\/api\/video-upscale-create/, /^\/api\/video-prompt/, /^\/api\/video-script/, /^\/api\/tools\?action=(?:adimage|stamps|video-write|card-extract|construction-brief)/,
  /^\/api\/studio-create/, /^\/api\/fashion-create/, /^\/api\/design-create/, /^\/api\/design-ideas/, /^\/api\/construction-view/, /^\/api\/search/,
];
const MODEL = [/^\/api\/ai\?action=chat/, /^\/api\/ai(?:\?(?!action=agent)|$)/, /^\/api\/groq/, /^\/api\/gemini/];

async function loadPlaywright() {
  const explicit = opt('pw', '');
  const cands = explicit ? [String(explicit)] : ['playwright', 'playwright-core'];
  const req = createRequire(import.meta.url);
  for (const c of cands) {
    try { return await import(pathToFileURL(req.resolve(c)).href); } catch (e) { /* التالي */ }
  }
  throw new Error('playwright غير موجود — npm i --no-save playwright-core (أو --pw مسار)');
}
function chromiumPath() {
  for (const p of [process.env.PW_CHROMIUM, '/opt/pw-browsers/chromium', '/usr/bin/google-chrome', '/usr/bin/chromium']) if (p && fs.existsSync(p)) return p;
  return undefined;
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const calls = [];
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let p = decodeURIComponent(u.pathname);
  if (p.startsWith('/api/')) {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 2e6) body = body.slice(0, 2e6); });
    req.on('end', () => {
      const key = p + (u.search || '');
      let j = null; try { j = JSON.parse(body); } catch (e) { /* ليس JSON */ }
      calls.push({ at: Date.now(), key, confirmed: !!(j && j.confirmed), noTools: !!(j && j.noTools) });
      if (/^\/api\/ai\?action=chat/.test(key)) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end('data: ' + JSON.stringify({ delta: 'تمام.' }) + '\n\n');
        return;
      }
      if (/^\/api\/tools\?action=media-intent/.test(key)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(CLASSIFIER === 'null' ? '{}' : JSON.stringify({ lane: CLASSIFIER, conf: 0.9 }));
        return;
      }
      if (PAID.some((r) => r.test(key))) { res.writeHead(402, { 'Content-Type': 'application/json' }); res.end('{"error":"probe"}'); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}');
    });
    return;
  }
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port;

// صورة صغيرة حقيقيّة (PNG ١×١) للسياقات «بعد صورة» و«صورة مرفقة».
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function destOf(rows, opens, dialogs, navs) {
  const paid = rows.find((c) => PAID.some((r) => r.test(c.key)));
  if (paid) return 'paid:' + paid.key.replace(/[?&](?:token|id|op)=[^&]*/g, '').slice(0, 48);
  if (opens.length) return 'window:' + opens[0];
  if (navs.length) return 'window:nav ' + navs[0];
  if (dialogs.length) return 'dialog';
  if (rows.some((c) => MODEL.some((r) => r.test(c.key)))) return 'model';
  return 'none';
}

const corpus = JSON.parse(fs.readFileSync(CORPUS, 'utf8')).filter((c) => !ONLY || c.label === ONLY);
const personas = PERSONA === 'both' ? ['owner', 'user'] : [PERSONA];
const pwMod = await loadPlaywright();
const chromium = pwMod.chromium || (pwMod.default && pwMod.default.chromium);
const browser = await chromium.launch({ executablePath: chromiumPath() });
const results = [];
const pageErrors = [];
try {
  for (const persona of personas) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript((u) => {
      try { sessionStorage.setItem('omran_sess_v1', '1'); } catch (e) { /* لا شيء */ }
      try {
        localStorage.setItem('aiapp_intro', '0'); localStorage.setItem('aiapp_privacy_ack', '1'); localStorage.setItem('aiapp_lang', 'ar');
        localStorage.setItem('aiapp_username', u); localStorage.setItem('aiapp_auth_token', 'local');
      } catch (e) { /* لا شيء */ }
    }, persona === 'owner' ? 'omran' : 'probe_user');
    const page = await ctx.newPage();
    let dialogs = [], navs = [];
    page.on('dialog', (d) => { dialogs.push(d.type() + ': ' + d.message().slice(0, 80)); d.dismiss().catch(() => {}); });
    page.on('pageerror', (e) => pageErrors.push(persona + ': ' + String(e && e.message || e).slice(0, 200)));
    page.on('framenavigated', (fr) => { if (fr === page.mainFrame() && !fr.url().startsWith(base + '/') ) navs.push(fr.url()); else if (fr === page.mainFrame() && !/\/(?:index\.html)?(?:[?#].*)?$/.test(new URL(fr.url()).pathname)) navs.push(new URL(fr.url()).pathname); });
    await page.goto(base + '/', { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      ['omranIntro', 'privacyConsent'].forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });
      window.__probeOpens = [];
      for (const k of Object.keys(window)) {
        if (/^omranOpen|^openVideoMaker$|^omranVideoMaker/.test(k) && typeof window[k] === 'function') {
          window[k] = function () { window.__probeOpens.push(k); };
        }
      }
    });
    for (const c of corpus) {
      for (const ctxName of (c.ctx || ['fresh'])) {
        dialogs = []; navs = [];
        await page.evaluate(({ ctxName, PNG }) => {
          try { if (typeof genAbortController !== 'undefined' && genAbortController) genAbortController.abort(); } catch (e) { /* لا شيء */ }
          window.__probeOpens = [];
          window.__chatEditRequest = null;
          const id = 'p_probe_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
          const p = { id, title: 'probe', messages: [], code: '' };
          if (ctxName === 'afterImage') {
            p.messages.push({ role: 'user', content: 'ارسم قطة' });
            p.messages.push({ role: 'assistant', content: '', attachments: [{ name: 'generated.png', isImage: true, mime: 'image/png', dataUrl: 'data:image/png;base64,' + PNG }] });
            p.lastEditedImage = { b64: PNG, mime: 'image/png' };
            p.lastMsgWasImageEdit = true;
          }
          state.projects.push(p); state.currentId = id;
          pendingAttachments.length = 0;
          if (ctxName === 'attached') pendingAttachments.push({ name: 'photo.png', isImage: true, mime: 'image/png', dataUrl: 'data:image/png;base64,' + PNG });
          const b = document.getElementById('btnSend'); if (b) b.disabled = false;
        }, { ctxName, PNG });
        const from = calls.length;
        await page.fill('#prompt', c.text);
        await page.evaluate((ms) => Promise.race([Promise.resolve().then(() => sendPrompt()).catch((e) => String(e)), new Promise((r) => setTimeout(r, ms))]), CASE_MS);
        await page.waitForTimeout(250);
        const opens = await page.evaluate(() => window.__probeOpens.slice());
        const rows = calls.slice(from);
        const dest = destOf(rows, opens, dialogs, navs);
        results.push({ persona, ctx: ctxName, label: c.label, text: c.text, dest, ok: c.label !== 'T' || dest === 'model', api: rows.map((r) => r.key).filter((k) => !/client-errors|memory|usage-status|auth|points|vapid|reminders|chats|account/.test(k)).slice(0, 6) });
        if (navs.length) { await page.goto(base + '/', { waitUntil: 'load' }); await page.waitForTimeout(800); }
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.close();
}

const summ = {};
for (const r of results) {
  const k = r.persona + ' · ' + r.label;
  summ[k] = summ[k] || { total: 0, model: 0, wrong: 0, dests: {} };
  summ[k].total++;
  if (r.dest === 'model') summ[k].model++;
  if (!r.ok) summ[k].wrong++;
  const d = r.dest.replace(/^(paid|window):.*?(\/api\/[a-z-]+|omran\w+).*$/, '$1:$2');
  summ[k].dests[d] = (summ[k].dests[d] || 0) + 1;
}
const bad = results.filter((r) => !r.ok);
const report = { classifier: CLASSIFIER, summary: summ, wrongT: bad.map((r) => `${r.persona}/${r.ctx}: «${r.text}» → ${r.dest}`), made: results.filter((r) => r.label === 'M').map((r) => `${r.persona}/${r.ctx}: «${r.text}» → ${r.dest}`), pageErrors };
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ report, results }, null, 1));
console.log(JSON.stringify(report, null, 1));
if (bad.length || pageErrors.length) process.exit(1);
