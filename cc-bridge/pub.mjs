// cc-bridge/pub.mjs — v-socpub-bridge: تخزين مؤقّت لفيديو «انشر في حساباتي» على الجسر نفسه.
//
// المنصّات تجلب الفيديو من رابط عامّ، ومزوّد التخزين المؤقّت رفض (٤٠٣ — حسابه موقوف)، فلم يبلغ النشر أيّ منصّة.
// هنا: Vercel يصدر للمالك تذكرة رفع قصيرة العمر (HMAC بسرّ الجسر — السرّ لا يبلغ المتصفّح) لاسم عشوائيّ وحجم محدّد؛
// المتصفّح يرفع الملفّ مباشرة (PUT /pub/<اسم>)، والمنصّات تقرؤه من الاسم نفسه (GET/HEAD، بلا رمز: الاسم ١٢٨ بتًّا
// لا يُخمَّن) حتّى ينتهي عمره فيُمسح. لا شيء غير ملفّ رفعه المالك بتذكرة يُخدَم، ولا يُكتب خارج مجلّده.
'use strict';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, rename, rm, readdir, stat, statfs } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { join } from 'node:path';

export const PUB = { maxBytes: 500 * 1024 * 1024, ttlMs: 7 * 3600 * 1000, slackBytes: 64 * 1048576, ticketMs: 2 * 3600 * 1000 };
export const NAME_RE = /^[a-f0-9]{32}\.(mp4|webm|mov)$/;
const MIME = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };

/* ───────── تذكرة الرفع (نفس صيغة api/_lib/social-publish.js) — توقيعها على 'pub.' + الحمولة فلا تُستعمل تذكرة مهمّة مكانها ───────── */
export function signUpTicket(info, secret) {
  const p = Buffer.from(JSON.stringify({ n: String(info.name || ''), s: Number(info.size) || 0, exp: Number(info.exp) || (Date.now() + PUB.ticketMs) })).toString('base64url');
  return p + '.' + createHmac('sha256', String(secret)).update('pub.' + p).digest('base64url');
}
export function verifyUpTicket(ticket, secret, now) {
  try {
    const [p, sig] = String(ticket || '').split('.');
    if (!p || !sig || !secret) return { ok: false, why: 'malformed' };
    const want = createHmac('sha256', String(secret)).update('pub.' + p).digest('base64url');
    const a = Buffer.from(sig), b = Buffer.from(want);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, why: 'signature' };
    const d = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    if (!d || !NAME_RE.test(String(d.n || '')) || !(d.s > 0) || !(d.exp > (now || Date.now()))) return { ok: false, why: 'expired' };
    return { ok: true, name: String(d.n), size: Number(d.s), exp: d.exp };
  } catch (e) { return { ok: false, why: 'malformed' }; }
}

/** «bytes=a-b» ← { start, end } داخل الحجم، أو null (لا مدى أو لا يُفهم = الملفّ كلّه)، أو false (خارج الملفّ = ٤١٦) */
export function parseRange(h, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(h || '').trim());
  if (!m || (!m[1] && !m[2])) return null;
  let start, end;
  if (!m[1]) { const n = Number(m[2]); if (!(n > 0)) return false; start = Math.max(0, size - n); end = size - 1; }
  else { start = Number(m[1]); end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1; }
  if (!(start <= end) || start >= size) return false;
  return { start, end };
}

export function createPub(cfg) {
  const c = Object.assign({ dir: './pub-work', ttlMs: PUB.ttlMs, maxBytes: PUB.maxBytes, corsAllowed: () => false, log: (s) => console.log('[pub] ' + s) }, cfg || {});
  if (!c.secret) throw new Error('secret required');
  const fileOf = (name) => join(c.dir, name);
  function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); }
  function cors(req, res) {
    const origin = String(req.headers.origin || '');
    if (!c.corsAllowed(origin)) return;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  async function freeBytes() {
    if (typeof c.diskFree === 'function') return c.diskFree(); /* الاختبار */
    try { const s = await statfs(c.dir); return Number(s.bavail) * Number(s.bsize); } catch (e) { return Infinity; } /* لا يُعرف = لا يُمنع */
  }
  /** ما مضى عمره (والرفع الذي لم يكتمل) يُمسح — عند كلّ رفع وكلّ ساعة */
  async function sweep(now) {
    const t = now || Date.now();
    let n = 0;
    try {
      for (const name of await readdir(c.dir)) {
        try { const st = await stat(fileOf(name)); if (t - st.mtimeMs > c.ttlMs) { await rm(fileOf(name), { force: true }); n++; } } catch (e) { /* زال */ }
      }
    } catch (e) { /* لا مجلّد بعد */ }
    return n;
  }
  /** جسم الطلب إلى ملفّ مؤقّت ثمّ يُسمّى باسمه — الحجم كما في التذكرة بالضبط، وما زاد يُقطع */
  function receive(req, part, size) {
    return new Promise((resolve) => {
      const out = createWriteStream(part);
      let got = 0, done = false;
      const end = (r) => { if (done) return; done = true; resolve(r); };
      req.on('data', (b) => { got += b.length; if (got > size) { req.unpipe(out); out.destroy(); end({ ok: false, code: 413, error: 'too_big' }); } });
      req.on('aborted', () => { out.destroy(); end({ ok: false, code: 400, error: 'aborted' }); });
      req.on('error', () => { out.destroy(); end({ ok: false, code: 400, error: 'aborted' }); });
      out.on('error', (e) => end({ ok: false, code: /ENOSPC/.test(String(e && e.code)) ? 507 : 500, error: /ENOSPC/.test(String(e && e.code)) ? 'disk_full' : 'write' }));
      out.on('finish', () => end(got === size ? { ok: true } : { ok: false, code: 400, error: 'size_mismatch' }));
      req.pipe(out);
    });
  }

  async function handle(req, res, url) {
    const path = url.pathname;
    if (!path.startsWith('/pub/')) return false;
    const name = path.slice(5);
    if (!NAME_RE.test(name)) { json(res, 404, { error: 'not found' }); return true; }
    cors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return true; }
    if (req.method === 'PUT') {
      const t = verifyUpTicket(url.searchParams.get('t'), c.secret);
      if (!t.ok || t.name !== name) { json(res, 401, { error: 'unauthorized', why: t.ok ? 'name' : t.why }); return true; }
      if (t.size > c.maxBytes) { json(res, 413, { error: 'too_big' }); return true; }
      const len = Number(req.headers['content-length']);
      if (Number.isFinite(len) && len !== t.size) { json(res, 400, { error: 'size_mismatch' }); return true; }
      await mkdir(c.dir, { recursive: true });
      await sweep();
      if ((await freeBytes()) < t.size + PUB.slackBytes) { json(res, 507, { error: 'disk_full' }); return true; }
      const part = fileOf(name + '.part');
      const r = await receive(req, part, t.size);
      if (!r.ok) { await rm(part, { force: true }).catch(() => null); json(res, r.code, { error: r.error }); return true; }
      await rename(part, fileOf(name));
      c.log('stored ' + name.slice(0, 6) + '… ' + Math.round(t.size / 1048576) + ' MB');
      json(res, 200, { ok: true });
      return true;
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      let st = null;
      try { st = await stat(fileOf(name)); } catch (e) { /* لا ملفّ */ }
      if (!st || Date.now() - st.mtimeMs > c.ttlMs) { json(res, 404, { error: 'not found' }); return true; }
      const head = { 'Content-Type': MIME[name.split('.')[1]], 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=300', 'X-Robots-Tag': 'noindex' };
      const rg = parseRange(req.headers.range, st.size);
      if (rg === false) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); res.end(); return true; }
      const start = rg ? rg.start : 0, end = rg ? rg.end : st.size - 1;
      head['Content-Length'] = String(end - start + 1);
      if (rg) head['Content-Range'] = 'bytes ' + start + '-' + end + '/' + st.size;
      res.writeHead(rg ? 206 : 200, head);
      if (req.method === 'HEAD' || st.size === 0) { res.end(); return true; }
      createReadStream(fileOf(name), { start, end }).pipe(res);
      return true;
    }
    json(res, 405, { error: 'method' });
    return true;
  }

  const timer = setInterval(() => { sweep().catch(() => null); }, 3600 * 1000);
  if (timer.unref) timer.unref();
  sweep().catch(() => null);
  return { handle, sweep, fileOf };
}
