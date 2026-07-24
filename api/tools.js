// Router: consolidates car/design/fashion/studio/portrait tool endpoints.
function load(action) {
  switch (action) {
    case 'car-tools': return require('./_lib/car-tools.js');
    case 'design-create': return require('./_lib/design-create.js');
    case 'construction-create': return require('./_lib/construction-create.js');
    case 'construction-view': return require('./_lib/construction-view.js');
    case 'construction-library': return require('./_lib/construction-library.js');
    case 'design-suggest': return require('./_lib/design-suggest.js');
    case 'fashion-create': return require('./_lib/fashion-create.js');
    case 'fashion-suggest': return require('./_lib/fashion-suggest.js');
    case 'studio-create': return require('./_lib/studio-create.js');
    case 'studio-suggest': return require('./_lib/studio-suggest.js');
    case 'portrait-style': return require('./_lib/portrait-style.js');
    case 'analyze-zip': return require('./_lib/analyze-zip.js');
    case 'stocks': return require('./_lib/stocks.js');
    default: return null;
  }
}

module.exports = async (req, res) => {
  const action = (req.query && req.query.action) || '';
  const handler = load(action);
  if (!handler) {
    res.status(404).json({ error: 'unknown tools route: ' + action });
    return;
  }
  return handler(req, res);
};
