/* safeParse للسيرفر: جسم طلب مشوّه كان يرمي استثناءً غير مُلتقَط، فترجع
 * Vercel «500» عارية بلا سجلّ ولا سبب. هنا يُرجَع البديل ويُسجَّل الفشل. */
const { logError } = require('./log-error.js');
function safeParse(raw, fallback, scope) {
  if (raw === null || raw === undefined || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try { const v = JSON.parse(raw); return (v === null || v === undefined) ? fallback : v; }
  catch (e) { logError('parse:' + (scope || 'unknown'), e, { action: 'safeParse' }); return fallback; }
}
module.exports = { safeParse };
