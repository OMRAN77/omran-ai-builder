'use strict';

const dns = require('node:dns').promises;
const net = require('node:net');

function isPrivateIpv4(address) {
  const [a, b] = address.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a === 169 && b === 254 ||
    a === 192 && b === 168 || a === 172 && b >= 16 && b <= 31;
}

function isPrivateAddress(address) {
  const value = String(address || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (net.isIP(value) === 4) return isPrivateIpv4(value);
  if (net.isIP(value) === 6) {
    return value === '::1' || value === '::' || value.startsWith('fc') ||
      value.startsWith('fd') || /^fe[89ab]/.test(value);
  }
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
