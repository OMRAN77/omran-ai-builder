// api/_lib/bundle-core.js — v-auto-bundle: منطق بناء الحزمة وحده، صرفًا بلا قرص ولا شبكة.
//
// المالك ١١ أكتوبر: «المزوّد يقرأ ويرفع ويدمج بنفسه، وClaude Code ما يكون الأساسيّ». العائق كان تقنيًّا: أجزاء
// الواجهة js/app-NN-*.js تُبنى إلى js/app.bundle.js بـnpm run bundle، ولا أداة في المحادثة تبنيها، فرفعة المزوّد
// تُفشل CI (verify) وتُبقي المعاينة قديمة — فيُحال كلّ تعديل واجهة إلى Claude Code على حساب Anthropic.
// هنا الخطوات نفسها التي ينفّذها scripts/build.mjs، يستدعيها هو (القرص) وgithub-write.js (شجرة GitHub) — مصدر
// واحد فلا تنحرف الحزمة المبنيّة على الخادم عن verify حرفًا.
'use strict';

const crypto = require('crypto');

const PART_NAME_RE = /^app-\d\d-.+\.js$/; // build.mjs: readdir('js') ثمّ هذا الفلتر — المجلّد وحده لا ما تحته
const PART_PATH_RE = /^js\/app-\d\d-[^/]+\.js$/;
const BUNDLE_PATH = 'js/app.bundle.js';
const MIN_PARTS = 18;
const HEX8 = /(?<![0-9a-f])[0-9a-f]{8}(?![0-9a-f])/;

function isPartPath(p) { return PART_PATH_RE.test(String(p || '').replace(/^\/+/, '')); }
function partNames(names) { return names.filter((n) => PART_NAME_RE.test(n)).sort(); }

/** parts: { 'app-01-x.js': text, ... } → { bundle, hash, count }. لا فاصل بين الأجزاء: كلّ جزء شريحة تنتهي بسطر جديد. */
function buildBundle(parts) {
  const names = partNames(Object.keys(parts || {}));
  if (names.length < MIN_PARTS) throw new Error('توقّعتُ ' + MIN_PARTS + ' جزءًا على الأقل، وجدتُ ' + names.length);
  const bundle = names.map((n) => parts[n]).join('');
  const hash = crypto.createHash('sha256').update(bundle).digest('hex').slice(0, 8);
  return { bundle, hash, count: names.length };
}

// بصمة المحتوى تحكم الموضعين؛ العلامة اليدويّة (532- · -g534) تبقى ويُستبدل الرقم السداسيّ عشريّ وحده.
const stamp = (v, hash, fallback) => (HEX8.test(v) ? v.replace(HEX8, hash) : fallback);
function stampHtml(html, hash) { return String(html).replace(/(app\.bundle\.js\?v=)([^"']*)/g, (_, k, v) => k + stamp(v, hash, hash)); }
function stampSw(sw, hash) { return String(sw).replace(/(CACHE_NAME = ')([^']*)(')/, (_, a, v, z) => a + stamp(v, hash, 'omran-ai-builder-' + hash) + z); }

module.exports = { PART_NAME_RE, PART_PATH_RE, BUNDLE_PATH, MIN_PARTS, isPartPath, partNames, buildBundle, stampHtml, stampSw };
