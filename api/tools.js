// Router: consolidates car/design/fashion/studio/portrait tool endpoints.
// Installs a time-to-first-byte timeout on every outbound fetch (see _lib/_fetch-timeout.js).
require('./_lib/_fetch-timeout.js');
// Nothing thrown in this router escapes unrecorded (see _lib/_errors.js).
const { withErrorCapture } = require('./_lib/_errors.js');
const { installCors } = require('./_lib/cors.js');
// حارس الميزات المتقاعدة — يُفحص قبل أي تحميل وحدة أو استخدام مفتاح.
const { isRetired, retiredResponse } = require('./_lib/_retired.js');

// ملاحظة: مسار السيارات أُزيل من هذا الجدول عمدًا — حارس _retired.js يرفضه.
// المقاولات باقية شغالة بقرار المالك.
function load(action) {
  switch (action) {
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
    case 'adchat': return require('./_lib/adchat.js');
    case 'adimage': return require('./_lib/adimage.js');
    case 'stamps': return require('./_lib/stamps.js');
    case 'card-extract': return require('./_lib/card-extract.js');
    default: return null;
  }
}

module.exports = withErrorCapture('tools', async (req, res) => {
  installCors(req, res);
  const action = (req.query && req.query.action) || '';
  if (isRetired(action)) { retiredResponse(res, action); return; }
  const handler = load(action);
  if (!handler) {
    res.status(404).json({ error: 'unknown tools route: ' + action });
    return;
  }
  return handler(req, res);
});
