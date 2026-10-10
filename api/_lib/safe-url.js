'use strict';

const dns = require('node:dns').promises;
const net = require('node:net');

/* v-sec-ssrf: تدقيق ١٠ أكتوبر — «اقرأ هذه الصفحة» (fetch_page) كانت تفتح عناوين داخليّة بصيغ لم يعرفها
   الحارس: IPv6 الحامل لعنوان IPv4 (‎[::ffff:127.0.0.1]‎ يصير في URL ‎[::ffff:7f00:1]‎ فيفوت فحص البادئة)،
   وCGNAT ‏100.64/10 (شبكات المزوّدين الداخليّة)، و198.18/15، والبثّ المتعدّد 224/4، والمحجوز 240/4،
   وsite-local ‏fec0::/10، وNAT64 ‏64:ff9b::/96 حين يحمل عنوانًا خاصًّا — المسبار: ١٨ عنوانًا خاصًّا مسموحًا.
   الآن يُفكّ عنوان IPv6 إلى ثماني خانات، ويُستخرج منه IPv4 المضمّن (mapped/compatible/NAT64/6to4)
   فيُفحص بقواعد IPv4 نفسها. العناوين العامّة كما كانت. */
function isPrivateIpv4(address) {
  const [a, b] = address.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a === 169 && b === 254 ||
    a === 192 && b === 168 || a === 172 && b >= 16 && b <= 31 ||
    a === 100 && b >= 64 && b <= 127 || // CGNAT 100.64.0.0/10
    a === 198 && (b === 18 || b === 19) || // 198.18.0.0/15 (قياس الأداء)
    a >= 224; // 224.0.0.0/4 بثّ متعدّد + 240.0.0.0/4 محجوز (ومعه 255.255.255.255)
}

/** IPv6 نصًّا ← ثماني خانات عدديّة (16 بت)، أو null إن تعذّر. يقبل ذيل IPv4 المنقّط. */
function ipv6Hextets(value) {
  let v = value;
  const dotted = v.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    if (net.isIP(dotted[2]) !== 4) return null;
    const o = dotted[2].split('.').map(Number);
    v = dotted[1] + ((o[0] << 8) | o[1]).toString(16) + ':' + ((o[2] << 8) | o[3]).toString(16);
  }
  const halves = v.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const parts = head.concat(new Array(fill).fill('0'), tail).map((h) => parseInt(h, 16));
  return parts.length === 8 && parts.every((n) => n >= 0 && n <= 0xffff) ? parts : null;
}

const v4From = (hi, lo) => [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.');

function isPrivateIpv6(value) {
  const h = ipv6Hextets(value);
  if (!h) return true; // عنوان IPv6 لا نفهمه = مغلق لا مفتوح
  const zeros = (from, to) => h.slice(from, to).every((n) => n === 0);
  // ::a.b.c.d (متوافق، ومعه :: و::1) و::ffff:a.b.c.d (mapped) — المضمّن يُفحص بقواعد IPv4
  if (zeros(0, 6) || (zeros(0, 5) && h[5] === 0xffff)) return isPrivateIpv4(v4From(h[6], h[7]));
  // NAT64 المعروف 64:ff9b::/96 — يمرّ إلى IPv4 المضمّن، فيُحكم بحكمه
  if (h[0] === 0x64 && h[1] === 0xff9b && zeros(2, 6)) return isPrivateIpv4(v4From(h[6], h[7]));
  // 6to4 ‏2002:AABB:CCDD::/48 — IPv4 في الخانتين الثانية والثالثة
  if (h[0] === 0x2002) return isPrivateIpv4(v4From(h[1], h[2]));
  return (h[0] & 0xfe00) === 0xfc00 || // fc00::/7 محلّيّ فريد
    (h[0] & 0xffc0) === 0xfe80 || // fe80::/10 رابط محلّيّ
    (h[0] & 0xffc0) === 0xfec0 || // fec0::/10 site-local (مهجور، وما زال يُوجَّه داخليًّا)
    (h[0] & 0xff00) === 0xff00; // ff00::/8 بثّ متعدّد
}

function isPrivateAddress(address) {
  const value = String(address || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  if (net.isIP(value) === 4) return isPrivateIpv4(value);
  if (net.isIP(value) === 6) return isPrivateIpv6(value);
  return false;
}

function parsePublicUrl(raw, { allowedHosts } = {}) {
  let url;
  try { url = new URL(String(raw || '')); } catch { throw new Error('invalid_outbound_url'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('invalid_outbound_scheme');
  if (url.username || url.password || !url.hostname) throw new Error('invalid_outbound_url');
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.local') || host === 'metadata.google.internal' || isPrivateAddress(host)) {
    throw new Error('blocked_outbound_host');
  }
  if (allowedHosts && !allowedHosts.includes(host)) throw new Error('unapproved_outbound_host');
  return url;
}

async function validatePublicUrl(raw, options = {}) {
  const url = parsePublicUrl(raw, options);
  const lookup = options.lookup || dns.lookup;
  const records = await lookup(url.hostname, { all: true, verbatim: true });
  if (!Array.isArray(records) || !records.length || records.some((record) => isPrivateAddress(record.address))) {
    throw new Error('blocked_outbound_host');
  }
  return url;
}

async function fetchPublicUrl(raw, init = {}, options = {}) {
  const fetchFn = options.fetchFn || fetch;
  const maxRedirects = options.maxRedirects == null ? 3 : options.maxRedirects;
  let url = String(raw || '');
  for (let redirects = 0; redirects <= maxRedirects; redirects++) {
    const checked = await validatePublicUrl(url, options);
    const response = await fetchFn(checked, Object.assign({}, init, { redirect: 'manual' }));
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location || redirects === maxRedirects) throw new Error('outbound_redirect_rejected');
    url = new URL(location, checked).href;
  }
  throw new Error('outbound_redirect_rejected');
}

module.exports = { isPrivateAddress, parsePublicUrl, validatePublicUrl, fetchPublicUrl };
