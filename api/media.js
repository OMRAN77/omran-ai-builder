// Router: consolidates TTS/STT/translate/image-gen/upload endpoints.
// Installs a time-to-first-byte timeout on every outbound fetch (see _lib/_fetch-timeout.js).
require('./_lib/_fetch-timeout.js');
// Nothing thrown in this router escapes unrecorded (see _lib/_errors.js).
const { withErrorCapture } = require('./_lib/_errors.js');
const { installCors } = require('./_lib/cors.js');

function load(action) {
  switch (action) {
    case 'tts': return require('./_lib/tts.js');
    case 'stt': return require('./_lib/stt.js');
    case 'translate': return require('./_lib/translate.js');
    case 'maha-image': return require('./_lib/maha-image.js');
    case 'blob-client-upload': return require('./_lib/blob-client-upload.js');
    case 'img': return require('./_lib/img-share.js'); // v627 — رابط الصورة العامّ
    case 'pdf': return require('./_lib/pdf-share.js'); // v-pdf-link — تنزيل PDF داخل الأغلفة
    default: return null;
  }
}

module.exports = withErrorCapture('media', async (req, res) => {
  installCors(req, res);
  const action = (req.query && req.query.action) || '';
  const handler = load(action);
  if (!handler) {
    res.status(404).json({ error: 'unknown media route: ' + action });
    return;
  }
  return handler(req, res);
});
