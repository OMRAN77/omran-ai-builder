// Router: consolidates TTS/STT/translate/image-gen/upload endpoints.
// Installs a time-to-first-byte timeout on every outbound fetch (see _lib/_fetch-timeout.js).
require('./_lib/_fetch-timeout.js');
// Nothing thrown in this router escapes unrecorded (see _lib/_errors.js).
const { withErrorCapture } = require('./_lib/_errors.js');

function load(action) {
  switch (action) {
    case 'tts': return require('./_lib/tts.js');
    case 'stt': return require('./_lib/stt.js');
    case 'translate': return require('./_lib/translate.js');
    case 'maha-image': return require('./_lib/maha-image.js');
    case 'blob-client-upload': return require('./_lib/blob-client-upload.js');
    default: return null;
  }
}

module.exports = withErrorCapture('media', async (req, res) => {
  const action = (req.query && req.query.action) || '';
  const handler = load(action);
  if (!handler) {
    res.status(404).json({ error: 'unknown media route: ' + action });
    return;
  }
  return handler(req, res);
});
