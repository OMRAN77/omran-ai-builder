// Vercel Serverless Function: checks a real gambling site from what it exposes to
// any visitor and returns evidence-backed findings (see _casino.js):
//   - the page itself: licence claims, payment methods, contact channels, bonus
//     terms, responsible-gaming tools, game providers and where content loads from;
//   - the domain's registration date (RDAP) and TLS certificate;
//   - the server's location and network (ipwho.is), and the security headers.
// Private and local addresses are refused, so the function cannot be pointed at
// internal services. Lightweight per-IP daily throttling, as the other scanners.
const dns = require('dns').promises;
const net = require('net');
const tls = require('tls');
const C = require('./_casino');

const BLOB_BASE = 'https://blob.vercel-storage.com';
const DAILY_LIMIT = 20;
const MAX_HTML = 1.5 * 1024 * 1024;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TaryamCyber-CasinoCheck/1.0';

function publicBase() {
  return 'https://' + (process.env.BLOB_STORE_ID || '6tfgxvttzyoiavtu') + '.public.blob.vercel-storage.com/';
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function usagePath(id) { return 'taryam/db/casino_check_usage/' + encodeURIComponent(id) + '.json'; }
async function readBlobJson(path, fallback) {
  try {
    const res = await fetch(publicBase() + path + '?_=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return fallback;
    return await res.json();
  } catch (e) { return fallback; }
}
async function writeBlobJson(path, data) {
  try {
    await fetch(BLOB_BASE + '/' + path, {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + process.env.BLOB_READ_WRITE_TOKEN, 'x-content-type': 'application/json', 'x-add-random-suffix': '0', 'x-cache-control-max-age': '0' },
      body: JSON.stringify(data),
    });
  } catch (e) { /* best effort */ }
}

function normalizeUrl(input) {
  let u = String(input || '').trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    const parsed = new URL(u);
    if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname.includes('.')) return null;
    parsed.hash = '';
    return parsed;
  } catch (e) { return null; }
}

// RFC 1918/4193, loopback, link-local, CGNAT, metadata and unspecified ranges.
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v6 = ip.toLowerCase();
  if (v6 === '::1' || v6 === '::') return true;
  if (/^f[cd]/.test(v6) || /^fe[89ab]/.test(v6)) return true;
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
  return false;
}

async function resolveHost(host) {
  if (net.isIP(host)) return [host];
  const out = [];
  try { out.push(...await dns.resolve4(host)); } catch (e) { /* no A */ }
  if (!out.length) { try { out.push(...await dns.resolve6(host)); } catch (e) { /* no AAAA */ } }
  return out;
}

function withTimeout(ms) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(t) };
}

async function fetchPage(url) {
  const { signal, done } = withTimeout(9000);
  try {
    const res = await fetch(url.toString(), { redirect: 'follow', signal, headers: { 'User-Agent': UA, 'Accept-Language': 'ar,en;q=0.8', Accept: 'text/html,*/*' } });
    const headers = {};
    res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    const reader = res.body && res.body.getReader ? res.body.getReader() : null;
    let html = '';
    if (reader) {
      const dec = new TextDecoder();
      let size = 0;
      while (size < MAX_HTML) {
        const { value, done: end } = await reader.read();
        if (end) break;
        size += value.length;
        html += dec.decode(value, { stream: true });
      }
      try { await reader.cancel(); } catch (e) { /* stream already closed */ }
    } else html = await res.text();
    return { ok: true, status: res.status, finalUrl: res.url || url.toString(), headers, html };
  } catch (e) {
    return { ok: false, error: e && e.name === 'AbortError' ? 'timeout' : String(e && e.message || e) };
  } finally { done(); }
}

function certInfo(host) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    try {
      const socket = tls.connect({ host, port: 443, servername: host, timeout: 7000, rejectUnauthorized: false }, () => {
        const cert = socket.getPeerCertificate();
        finish({
          authorized: socket.authorized,
          error: socket.authorizationError ? String(socket.authorizationError) : null,
          issuer: cert && cert.issuer ? (cert.issuer.O || cert.issuer.CN || null) : null,
          subject: cert && cert.subject ? cert.subject.CN || null : null,
          validFrom: cert && cert.valid_from ? new Date(cert.valid_from).toISOString() : null,
          validTo: cert && cert.valid_to ? new Date(cert.valid_to).toISOString() : null,
        });
        socket.end();
      });
      socket.on('timeout', () => { socket.destroy(); finish(null); });
      socket.on('error', () => finish(null));
    } catch (e) { finish(null); }
  });
}

// The registry's RDAP server for a TLD, from IANA's bootstrap file.
async function rdapBase(tld, signal) {
  const res = await fetch('https://data.iana.org/rdap/dns.json', { signal, headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const j = await res.json();
  for (const [tlds, urls] of j.services || []) if (tlds.map((t) => t.toLowerCase()).includes(tld)) return urls.find((u) => u.startsWith('https://')) || urls[0];
  return null;
}

async function rdap(domain) {
  const { signal, done } = withTimeout(7000);
  try {
    const headers = { Accept: 'application/rdap+json, application/json', 'User-Agent': UA };
    let res = await fetch('https://rdap.org/domain/' + encodeURIComponent(domain), { signal, redirect: 'follow', headers });
    if (!res.ok || !/json/i.test(res.headers.get('content-type') || '')) {
      const base = await rdapBase(domain.split('.').pop(), signal);
      if (!base) return null;
      res = await fetch(base.replace(/\/?$/, '/') + 'domain/' + encodeURIComponent(domain), { signal, redirect: 'follow', headers });
      if (!res.ok) return null;
    }
    const j = await res.json();
    const ev = (j.events || []).find((e) => e.eventAction === 'registration');
    const exp = (j.events || []).find((e) => e.eventAction === 'expiration');
    let registrar = null;
    for (const ent of j.entities || []) {
      if ((ent.roles || []).includes('registrar')) {
        const v = ent.vcardArray && ent.vcardArray[1];
        const fn = Array.isArray(v) ? v.find((x) => x[0] === 'fn') : null;
        registrar = fn ? fn[3] : ent.handle || null;
      }
    }
    return { registered: ev ? ev.eventDate : null, expires: exp ? exp.eventDate : null, registrar, status: j.status || [] };
  } catch (e) { return null; } finally { done(); }
}

async function geo(ip) {
  const { signal, done } = withTimeout(6000);
  try {
    const res = await fetch('https://ipwho.is/' + encodeURIComponent(ip), { signal });
    if (!res.ok) return null;
    const j = await res.json();
    if (j.success === false) return null;
    const org = (j.connection && (j.connection.org || j.connection.isp)) || '';
    const cdn = /cloudflare/i.test(org) ? 'Cloudflare' : /akamai/i.test(org) ? 'Akamai' : /fastly/i.test(org) ? 'Fastly' : /amazon|cloudfront/i.test(org) ? 'Amazon CloudFront' : /ddos-guard/i.test(org) ? 'DDoS-Guard' : null;
    return { ip, country: j.country || null, countryCode: j.country_code || null, city: j.city || null, isp: j.connection ? j.connection.isp : null, org: j.connection ? j.connection.org : null, asn: j.connection ? j.connection.asn : null, cdn };
  } catch (e) { return null; } finally { done(); }
}

function headerGrade(headers) {
  const keys = ['strict-transport-security', 'content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy'];
  const present = keys.filter((k) => headers && headers[k]);
  return { present, missing: keys.filter((k) => !present.includes(k)), server: headers ? headers.server || null : null };
}

async function check(url) {
  const host = url.hostname.toLowerCase();
  const ips = await resolveHost(host);
  if (!ips.length) return { error: 'unresolvable', message: 'تعذّر العثور على عنوان لهذا النطاق' };
  if (ips.some(isPrivateIp)) return { error: 'private', message: 'العنوان داخلي أو محلي؛ لا يُفحص' };
  const domain = C.registrable(host);
  const [page, cert, reg, where] = await Promise.all([fetchPage(url), certInfo(host), rdap(domain), geo(ips[0])]);
  if (page.ok) {
    const finalHost = (() => { try { return new URL(page.finalUrl).hostname; } catch (e) { return host; } })();
    const finalIps = finalHost === host ? ips : await resolveHost(finalHost);
    if (finalIps.some(isPrivateIp)) return { error: 'private', message: 'الموقع يعيد التوجيه إلى عنوان داخلي؛ لا يُفحص' };
  }
  const analysis = page.ok ? C.analyzeHtml(page.html, page.finalUrl) : null;
  const findings = [];
  if (!page.ok) findings.push({ id: 'unreachable', severity: 'low', ar: `تعذّر تحميل الصفحة (${page.error}). قد يكون الموقع محجوبًا أو يرفض الزوار الآليين؛ باقي الفحوص من النطاق والشهادة.`, en: `The page could not be loaded (${page.error}). The site may be blocked or refuse automated visitors; the other checks come from the domain and certificate.`, evidence: null });
  else if (page.status >= 400) findings.push({ id: 'http-error', severity: 'low', ar: `الموقع ردّ بالحالة ${page.status}.`, en: `The site answered with status ${page.status}.`, evidence: page.finalUrl });
  if (page.ok && C.registrable(C.registrable((new URL(page.finalUrl)).hostname)) !== domain) findings.push({ id: 'redirected', severity: 'medium', ar: `الرابط يحوّل إلى نطاق آخر: ${new URL(page.finalUrl).hostname}. هذا نمط «الروابط البديلة».`, en: `The link redirects to another domain: ${new URL(page.finalUrl).hostname}. That is the "mirror link" pattern.`, evidence: page.finalUrl });
  if (analysis) findings.push(...analysis.findings);
  findings.push(...C.ageFindings({ registered: reg && reg.registered, certFrom: cert && cert.validFrom, certIssuer: cert && cert.issuer, certAuthorized: cert ? cert.authorized : null }));
  findings.push(...C.hostingFindings(where));
  const hdr = page.ok ? headerGrade(page.headers) : null;
  const { risk, level } = C.score(findings);
  return {
    url: url.toString(), finalUrl: page.ok ? page.finalUrl : null, host, domain, ips, status: page.ok ? page.status : null,
    checkedAt: new Date().toISOString(),
    page: analysis ? { title: analysis.title, lang: analysis.lang, isGambling: analysis.isGambling, targetsUae: analysis.targetsUae, licences: analysis.licences, providers: analysis.providers, providerHosts: analysis.providerHosts, externalHosts: analysis.externalHosts, payments: analysis.payments } : null,
    registration: reg, cert, geo: where, headers: hdr,
    findings, risk, level,
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  try {
    const body = req.body || {};
    const url = normalizeUrl(body.url);
    if (!url) { res.status(400).json({ error: 'invalid', message: 'أدخل رابط الموقع، مثل example.com' }); return; }
    const id = String(body.guestId || req.headers['x-forwarded-for'] || 'anon').slice(0, 100);
    const today = todayStr();
    let usage = await readBlobJson(usagePath(id), null);
    if (!usage || usage.date !== today) usage = { date: today, count: 0 };
    if (usage.count >= DAILY_LIMIT) {
      res.status(429).json({ error: 'limit', message: 'وصلت للحد اليومي المسموح لهذه الأداة (' + DAILY_LIMIT + ' فحوصات/يوم). حاول غدًا.' });
      return;
    }
    usage.count += 1;
    await writeBlobJson(usagePath(id), usage);
    const result = await check(url);
    if (result.error) { res.status(400).json(result); return; }
    res.status(200).json({ ...result, remaining: DAILY_LIMIT - usage.count });
  } catch (e) {
    res.status(500).json({ error: 'failed', message: 'فشل الفحص: ' + (e && e.message ? e.message : String(e)) });
  }
};

module.exports._internal = { normalizeUrl, isPrivateIp, check };
