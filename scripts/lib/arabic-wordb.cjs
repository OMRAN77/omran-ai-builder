'use strict';
/* scripts/lib/arabic-wordb.cjs — `\b` الملاصق لحرف عربيّ في تعبير JS حرفيّ ميّت: \w في JS لاتينيّ فقط (بلا علم u)،
   فـ`\b(?:كيف|ليش)` لا يطابق أبدًا، و`الهند\b` لا يطابق «الهند» وحدها. وقع في ٩ تعابير حتّى ١١ أكتوبر ٢٠٢٦
   (مرّتان في PITFALLS قبلها). يستعمله الحارس (scripts/guard.mjs، القاعدة «ز») والاختبار tests/arabic-wordb.test.cjs.
   الكشف: \b قبله أو بعده حرف عربيّ مباشرة، أو قبله «)» أو بعده «(» لمجموعة فيها بديل عربيّ. داخل [] لا يُعدّ (\b هناك = backspace). */
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const AR = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

/* مواضع \b خارج الأقواس المربّعة، مع تخطّي الهروب */
function wordBoundaries(p) {
  const out = [];
  let inClass = false;
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '\\') { if (!inClass && p[i + 1] === 'b') out.push(i); i++; continue; }
    if (inClass) { if (c === ']') inClass = false; continue; }
    if (c === '[') inClass = true;
  }
  return out;
}
/* نصّ المجموعة التي تبدأ بـ«(» عند open، أو تنتهي بـ«)» عند close */
function groupFrom(p, open) {
  let d = 0, inClass = false;
  for (let i = open; i < p.length; i++) {
    const c = p[i];
    if (c === '\\') { i++; continue; }
    if (inClass) { if (c === ']') inClass = false; continue; }
    if (c === '[') { inClass = true; continue; }
    if (c === '(') d++;
    else if (c === ')') { d--; if (d === 0) return p.slice(open, i + 1); }
  }
  return '';
}
function groupTo(p, close) {
  // نمشي من البداية ونسجّل أين فُتحت كلّ مجموعة، ثمّ نأخذ التي تُغلق عند close
  const stack = [];
  let inClass = false;
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '\\') { i++; continue; }
    if (inClass) { if (c === ']') inClass = false; continue; }
    if (c === '[') { inClass = true; continue; }
    if (c === '(') stack.push(i);
    else if (c === ')') { const o = stack.pop(); if (i === close) return o === undefined ? '' : p.slice(o, i + 1); }
  }
  return '';
}

/* عدد مواضع \b الميّتة في نمط واحد */
function deadBoundaries(pattern) {
  let hits = 0;
  for (const i of wordBoundaries(pattern)) {
    const prev = pattern[i - 1] || '', next = pattern[i + 2] || '';
    const escapedPrev = i >= 2 && pattern[i - 2] === '\\';
    if (AR.test(next) || (AR.test(prev) && !escapedPrev)) { hits++; continue; }
    if (next === '(' && AR.test(groupFrom(pattern, i + 2))) { hits++; continue; }
    if (prev === ')' && !escapedPrev && AR.test(groupTo(pattern, i - 1))) { hits++; continue; }
  }
  return hits;
}

function parse(src) {
  for (const sourceType of ['script', 'module']) {
    try { return acorn.parse(src, { ecmaVersion: 'latest', sourceType, allowHashBang: true, locations: true, allowReturnOutsideFunction: true }); } catch (e) { /* النوع الآخر */ }
  }
  return null;
}

/* كلّ تعبير حرفيّ في الملفّ فيه \b ميّت: [{ line, hits, pattern }] — السطر الذي يحمل guard-ok مستثنى */
function scanSource(src) {
  const ast = parse(src);
  if (!ast) return [];
  const lines = src.split('\n');
  const out = [];
  (function walk(n) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'Literal' && n.regex) {
      const hits = deadBoundaries(n.regex.pattern);
      if (hits && !(lines[n.loc.start.line - 1] || '').includes('guard-ok')) out.push({ line: n.loc.start.line, hits, pattern: n.regex.pattern });
    }
    for (const k in n) {
      if (k === 'loc') continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v.type === 'string') walk(v);
    }
  })(ast);
  return out;
}

/* ملفّات التطبيق الحيّة: أجزاء الواجهة والسكربتات المحمّلة منفصلة (لا الحزمة المولَّدة)، وكلّ شيفرة الخادم */
function targetFiles(root) {
  const ls = (d) => { try { return fs.readdirSync(path.join(root, d)); } catch (e) { return []; } };
  const files = [];
  for (const n of ls('js')) if (n.endsWith('.js') && n !== 'app.bundle.js') files.push('js/' + n);
  for (const d of ['api', 'api/_lib']) for (const n of ls(d)) if (n.endsWith('.js')) files.push(d + '/' + n);
  if (fs.existsSync(path.join(root, 'sw.js'))) files.push('sw.js');
  return files.sort();
}

function scanTree(root) {
  const out = [];
  for (const rel of targetFiles(root)) {
    let src;
    try { src = fs.readFileSync(path.join(root, rel), 'utf8'); } catch (e) { continue; } // ملفّ اختفى أثناء الجرد ليس عطبًا
    for (const r of scanSource(src)) out.push(Object.assign({ file: rel }, r));
  }
  return out;
}

module.exports = { deadBoundaries, scanSource, scanTree, targetFiles };
