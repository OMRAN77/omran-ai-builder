// scripts/arch-ratchet.mjs — سقّاطة البنية (v-arch-ratchet). يناديه scripts/guard.mjs.
//
// العرض: كلّ مقياس نموّ قيس في تدقيقَي ١٠ و١١ أكتوبر ساء بينهما ولا شيء يوقفه: __sendPromptCore
// (js/app-09-attach.js) صار ٣٬٦٧٢ سطرًا بـ٢٦٤ تعبيرًا نمطيًّا و٣٠٦ نداء .test( (كان ٣٬٤٨٢ و٢٢٧ و٢٥٤)،
// و١٧ نسخة من `function verifyToken` في api/ (نسخة تنحرف = ثغرة جلسة)، واختبارات تثبّت وسوم ?v= حرفيًّا.
// القرار: كلّ مقياس له أساس في scripts/arch-baseline.json، والحارس يفشل إن تجاوزه. الأساس ينزل ولا يرتفع
// (tests/arch-ratchet.test.cjs يثبّت سقفه)؛ حين يتحسّن مقياس يطبع الحارس تلميحًا بخفض أساسه.
// القياس بمحلّل acorn لا بنصّ خام: التعابير النمطيّة رموزٌ يميّزها المحلّل من القسمة والتعليقات والنصوص.

import * as acorn from 'acorn';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASELINE_REL = 'scripts/arch-baseline.json';
export const CORE_FILE = 'js/app-09-attach.js';
export const CORE_FN = '__sendPromptCore';

export const METRICS = {
  sendPromptCoreLines: `أسطر ${CORE_FN} (${CORE_FILE}) — ضع المنطق الجديد في دالّة/جزء خارجها`,
  sendPromptCoreRegex: `تعابير نمطيّة حرفيّة داخل ${CORE_FN}`,
  sendPromptCoreTests: `نداءات .test( داخل ${CORE_FN}`,
  verifyTokenDefs: 'تعريفات دالّة verifyToken في api/ — استعمل sessionUser من api/_lib/_session.js بدل نسخة جديدة',
  vPinTests: 'ملفّات tests/*.test.cjs تثبّت وسم ?v= حرفيًّا — اقرأ الرقم من index.html بدل تثبيته',
};

const PARSE = { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true, allowHashBang: true, locations: true };

/** { lines, regex, tests } لـ__sendPromptCore في نصّ الجزء؛ أصفار إن لم توجد الدالّة. */
export function sendPromptCoreStats(src) {
  const tokens = [];
  const ast = acorn.parse(src, Object.assign({}, PARSE, { onToken: tokens }));
  const fn = ast.body.find((n) => n.type === 'FunctionDeclaration' && n.id && n.id.name === CORE_FN);
  if (!fn) return { lines: 0, regex: 0, tests: 0 };
  let regex = 0, tests = 0;
  const inside = tokens.filter((t) => t.start >= fn.start && t.end <= fn.end);
  for (let i = 0; i < inside.length; i++) {
    const t = inside[i], label = t.type.label;
    if (label === 'regexp') regex++;
    else if (label === 'name' && t.value === 'test' && i > 0 && i + 1 < inside.length
      && (inside[i - 1].type.label === '.' || inside[i - 1].type.label === '?.') && inside[i + 1].type.label === '(') tests++;
  }
  return { lines: fn.loc.end.line - fn.loc.start.line + 1, regex, tests };
}

const isFn = (n) => !!n && (n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression');
const named = (n, name) => !!n && ((n.type === 'Identifier' && n.name === name) || (n.type === 'Literal' && n.value === name));

/** عدد تعريفات دالّة باسم verifyToken في نصّ وحدة: تصريح، أو `const verifyToken = (…) =>`، أو
 *  `x.verifyToken = function`، أو `{ verifyToken() {} }`. الإسناد والاستيراد (`= verifyToken`) لا يُعدّان. */
export function verifyTokenDefs(src) {
  if (!String(src).includes('verifyToken')) return 0;
  const ast = acorn.parse(src, PARSE);
  let n = 0;
  const walk = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if ((node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') && named(node.id, 'verifyToken')) n++;
    else if (node.type === 'VariableDeclarator' && named(node.id, 'verifyToken') && isFn(node.init) && !named(node.init.id, 'verifyToken')) n++;
    else if (node.type === 'AssignmentExpression' && isFn(node.right) && !named(node.right.id, 'verifyToken')
      && (named(node.left, 'verifyToken') || (node.left.type === 'MemberExpression' && !node.left.computed && named(node.left.property, 'verifyToken')))) n++;
    else if (node.type === 'Property' && !node.computed && named(node.key, 'verifyToken') && isFn(node.value) && !named(node.value.id, 'verifyToken')) n++;
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v);
    }
  };
  walk(ast);
  return n;
}

/** وسم ?v= حرفيّ على ملفّ أصول (`app.js?v=694` نصًّا أو `\.js\?v=610` نمطًا)، لا ?v=(\d+) ولا ?v=' + hash
 *  ولا رابط يوتيوب watch?v=. */
export const V_PIN = /\.(?:m?js|css|json|html|png|jpe?g|webp|svg|ico|webmanifest)\\?\?v=[0-9A-Za-z]/;

/** io: { read(rel) → نصّ أو null، list(dir) → أسماء } — قرص حقيقيّ عبر fsIO أو مجلّد وهميّ في الاختبار. */
export function measure(io) {
  const core = io.read(CORE_FILE);
  const s = core === null ? { lines: 0, regex: 0, tests: 0 } : sendPromptCoreStats(core);
  const vt = [];
  for (const d of ['api', 'api/_lib']) {
    for (const f of io.list(d).filter((x) => x.endsWith('.js')).sort()) {
      const rel = d + '/' + f;
      const k = verifyTokenDefs(io.read(rel) || '');
      if (k) vt.push(rel + (k > 1 ? ' ×' + k : ''));
    }
  }
  const pins = io.list('tests').filter((f) => f.endsWith('.test.cjs')).sort().filter((f) => V_PIN.test(io.read('tests/' + f) || ''));
  return {
    metrics: {
      sendPromptCoreLines: s.lines,
      sendPromptCoreRegex: s.regex,
      sendPromptCoreTests: s.tests,
      verifyTokenDefs: vt.reduce((a, x) => a + (Number((/×(\d+)$/.exec(x) || [])[1]) || 1), 0),
      vPinTests: pins.length,
    },
    detail: { verifyTokenDefs: vt, vPinTests: pins.map((f) => 'tests/' + f) },
  };
}

/** يقارن بالأساس: worse = تجاوزه (يُفشل الحارس)، better = نزل تحته (تلميح بخفض الأساس). */
export function compare(metrics, baseline) {
  const worse = [], better = [];
  for (const key of Object.keys(METRICS)) {
    const base = Number(baseline && baseline[key]);
    if (!Number.isFinite(base)) { worse.push({ key, now: metrics[key], base: 'غائب' }); continue; }
    if (metrics[key] > base) worse.push({ key, now: metrics[key], base });
    else if (metrics[key] < base) better.push({ key, now: metrics[key], base });
  }
  return { worse, better };
}

export function fsIO(root) {
  return {
    read(rel) { try { return readFileSync(path.join(root, rel), 'utf8'); } catch (e) { return null; } }, // غياب الملفّ = لا شيء يُقاس
    list(dir) { try { return readdirSync(path.join(root, dir)); } catch (e) { return []; } }, // المجلّد اختياريّ في المستودعات الوهميّة
  };
}

// `node scripts/arch-ratchet.mjs` يطبع المقاييس الحاليّة — لخفض السقف بعد تحسّن.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(measure(fsIO(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'))).metrics, null, 1));
}
