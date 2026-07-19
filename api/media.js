// Router: consolidates TTS/STT/translate/image-gen/upload endpoints.
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

module.exports = async (req, res) => {
  const action = (req.query && req.query.action) || '';
  const handler = load(action);
  if (!handler) {
    res.status(404).json({ error: 'unknown media route: ' + action });
    return;
  }
  return handler(req, res);
};
