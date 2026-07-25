// Router: consolidates video creation/status/upscale/script endpoints.
function load(action) {
  switch (action) {
    case 'video-create': return require('./_lib/video-create.js');
    case 'video-balance': return require('./_lib/video-balance.js');
    case 'video-script': return require('./_lib/video-script.js');
    case 'video-status': return require('./_lib/video-status.js');
    case 'video-upscale-create': return require('./_lib/video-upscale-create.js');
    case 'veo-create': return require('./_lib/veo-create.js');
    case 'veo-status': return require('./_lib/veo-status.js');
    case 'veo-download': return require('./_lib/veo-download.js');
    default: return null;
  }
}

module.exports = async (req, res) => {
  const action = (req.query && req.query.action) || '';
  const handler = load(action);
  if (!handler) {
    res.status(404).json({ error: 'unknown video route: ' + action });
    return;
  }
  return handler(req, res);
};
