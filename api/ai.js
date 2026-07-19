// Router: consolidates the 9 AI provider proxy functions into a single
// Vercel Serverless Function to stay under the Hobby plan's function limit.
// Old public paths (e.g. /api/openai) are preserved via vercel.json rewrites
// that append ?action=<name>. Requires use literal paths so Vercel's file
// tracer (@vercel/nft) includes each module in the deployment bundle.
function load(action) {
  switch (action) {
    case 'openai': return require('./_lib/openai.js');
    case 'gemini': return require('./_lib/gemini.js');
    case 'groq': return require('./_lib/groq.js');
    case 'claude': return require('./_lib/claude.js');
    case 'cohere': return require('./_lib/cohere.js');
    case 'deepseek': return require('./_lib/deepseek.js');
    case 'mistral': return require('./_lib/mistral.js');
    case 'openrouter': return require('./_lib/openrouter.js');
    case 'perplexity': return require('./_lib/perplexity.js');
    default: return null;
  }
}

module.exports = async (req, res) => {
  const action = (req.query && req.query.action) || '';
  const handler = load(action);
  if (!handler) {
    res.status(404).json({ error: 'unknown ai route: ' + action });
    return;
  }
  return handler(req, res);
};
