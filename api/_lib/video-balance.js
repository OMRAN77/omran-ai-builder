// Returns the Runway credit balance (max across configured keys) so the
// frontend can verify there is enough credit BEFORE starting any generation.
// This prevents charging the owner for partial films that fail midway.
const { getKeys } = require('./runway-keys.js');

module.exports = async (req, res) => {
  try {
    const keys = getKeys();
    if (!keys.length) return res.status(200).json({ credits: 0, keys: 0 });
    let best = 0;
    for (const key of keys) {
      try {
        const r = await fetch('https://api.dev.runwayml.com/v1/organization', {
          headers: {
            Authorization: 'Bearer ' + key,
            'X-Runway-Version': '2024-11-06',
          },
        });
        if (!r.ok) continue;
        const data = await r.json();
        const c = Number(data && data.creditBalance) || 0;
        if (c > best) best = c;
      } catch (e) { /* try next key */ }
    }
    res.status(200).json({ credits: best, keys: keys.length });
  } catch (e) {
    res.status(200).json({ credits: -1, error: String(e && e.message || e) });
  }
};
