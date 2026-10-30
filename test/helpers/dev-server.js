// Local stand-in for Vercel used by the browser tests: serves the repo's static
// files and runs api/*.js handlers in-process, unmodified. Listens on 127.0.0.1 only.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.mp4': 'video/mp4', '.xml': 'application/xml', '.txt': 'text/plain',
  '.css': 'text/css', '.csv': 'text/csv', '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
};

function startServer() {
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://local');
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
    res.send = (d) => { res.end(typeof d === 'string' || Buffer.isBuffer(d) ? d : JSON.stringify(d)); return res; };
    if (u.pathname.startsWith('/api/')) {
      const file = path.join(ROOT, 'api', u.pathname.slice(5).replace(/[^a-z0-9_-]/gi, '') + '.js');
      if (!fs.existsSync(file)) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
      let raw = '';
      for await (const c of req) raw += c;
      req.query = Object.fromEntries(u.searchParams);
      try { req.body = raw ? JSON.parse(raw) : {}; } catch (e) { req.body = raw; }
      try { await require(file)(req, res); } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: e.message })); }
      return;
    }
    const p = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
    if (!p.startsWith(ROOT + path.sep)) { res.statusCode = 403; res.end(); return; }
    fs.readFile(p, (e, d) => {
      if (e) { res.statusCode = 404; res.end('not found'); return; }
      res.setHeader('Content-Type', TYPES[path.extname(p)] || 'application/octet-stream');
      res.end(d);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      url: 'http://127.0.0.1:' + server.address().port,
      close: () => new Promise((r) => server.close(r)),
    }));
  });
}

module.exports = { startServer, ROOT };
