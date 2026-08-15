// Streams a finished Veo 3 video file to the browser, adding the server's
// API key on the way (the Gemini file URI requires the key to download).
const { fetchPublicUrl } = require('./safe-url.js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const uri = (req.query && req.query.uri) || '';
    if (!uri) {
      res.status(400).json({ error: 'Bad uri' });
      return;
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { res.status(500).json({ error: 'Server is missing GEMINI_API_KEY' }); return; }

    const upstream = await fetchPublicUrl(uri, { headers: { 'x-goog-api-key': apiKey } }, {
      allowedHosts: ['generativelanguage.googleapis.com'],
    });
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'Veo download error: ' + upstream.status });
      return;
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).end(buf);
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
