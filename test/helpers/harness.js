// Shared helpers for the api/ tests: load a handler fresh with a given env, call it
// with a minimal Vercel-style req/res, and replace Vercel Blob with an in-memory fake.
// Nothing here talks to the network.
const path = require('path');

const API_DIR = path.join(__dirname, '..', '..', 'api');
const STRONG_SECRET = 'test-auth-secret-0123456789abcdef-0123456789';

// Env values persist after loading: some handlers read keys at load, others per request.
function loadApi(name, env = {}) {
  for (const k of Object.keys(require.cache)) if (k.startsWith(API_DIR + path.sep)) delete require.cache[k];
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return require(path.join(API_DIR, name + '.js'));
}

function callApi(handler, { method = 'POST', body = {}, query = {}, headers = {} } = {}) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
      getHeader(k) { return this.headers[k.toLowerCase()]; },
      status(c) { this.statusCode = c; return this; },
      json(o) { resolve({ status: this.statusCode, body: o, headers: this.headers }); return this; },
      send(d) {
        let b = d;
        if (typeof d === 'string') { try { b = JSON.parse(d); } catch (e) { /* keep text */ } }
        resolve({ status: this.statusCode, body: b, headers: this.headers });
        return this;
      },
      end(d) { resolve({ status: this.statusCode, body: d, headers: this.headers }); return this; },
    };
    Promise.resolve(handler({ method, body, query, headers }, res))
      .catch((e) => resolve({ status: 'threw', body: e.message }));
  });
}

// In-memory Vercel Blob. Handles PUT/list on blob.vercel-storage.com and public GETs on
// <store>.public.blob.vercel-storage.com; anything else goes to `upstream` (or throws).
function createBlobFake({ token = 'test-blob-token' } = {}) {
  const files = new Map();
  const log = [];
  function fetchImpl(upstream) {
    return async (url, opts = {}) => {
      const u = new URL(String(url));
      const method = (opts.method || 'GET').toUpperCase();
      const auth = (opts.headers && (opts.headers.Authorization || opts.headers.authorization)) || '';
      if (u.hostname === 'blob.vercel-storage.com') {
        if (auth !== 'Bearer ' + token) return new Response('{"error":"forbidden"}', { status: 403 });
        if (method === 'PUT') {
          const p = decodeURIComponent(u.pathname.slice(1));
          files.set(p, String(opts.body));
          log.push({ method, path: p });
          return new Response(JSON.stringify({ pathname: p }), { status: 200 });
        }
        if (method === 'GET' && u.pathname === '/') {
          const prefix = u.searchParams.get('prefix') || '';
          const blobs = [...files.keys()].filter((p) => p.startsWith(prefix))
            .map((p) => ({ pathname: p, url: 'https://teststore.public.blob.vercel-storage.com/' + p }));
          return new Response(JSON.stringify({ blobs, hasMore: false }), { status: 200 });
        }
      }
      if (u.hostname.endsWith('.public.blob.vercel-storage.com')) {
        const p = decodeURIComponent(u.pathname.slice(1));
        log.push({ method: 'GET', path: p });
        return files.has(p) ? new Response(files.get(p), { status: 200 }) : new Response('not found', { status: 404 });
      }
      if (upstream) return upstream(String(url), opts);
      throw new Error('unexpected network call in test: ' + url);
    };
  }
  return { files, log, token, fetchImpl };
}

function installFetch(fn) {
  const prev = global.fetch;
  global.fetch = fn;
  return () => { global.fetch = prev; };
}

module.exports = { loadApi, callApi, createBlobFake, installFetch, STRONG_SECRET, API_DIR };
