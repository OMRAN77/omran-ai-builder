#!/usr/bin/env node
// scripts/inspire/build.mjs — يبني inspire/city/<id>.html من inspire/src/<id>.html بلصق core.js مكان <!--CITYKIT-->.
// كلّ تجربة تبقى ملفًّا واحدًا مستقلًّا (المشروع الذي يُفتح للمستخدم يُحفظ ويُشارك كملفّ واحد). --check: يفشل إن كان المبنيّ قديمًا.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'inspire/src'), OUT = path.join(ROOT, 'inspire/city');
export function buildOne(id) {
  const core = fs.readFileSync(path.join(SRC, 'core.js'), 'utf8');
  const html = fs.readFileSync(path.join(SRC, id + '.html'), 'utf8');
  if (!html.includes('<!--CITYKIT-->')) throw new Error(id + ': لا علامة <!--CITYKIT-->');
  return html.replace('<!--CITYKIT-->', '<script>\n' + core + '\n</script>');
}
export function ids() { return fs.readdirSync(SRC).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)).sort(); }
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const check = process.argv.includes('--check'); let stale = [];
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv.includes('--only') ? [process.argv[process.argv.indexOf('--only') + 1]] : null;
  for (const id of (only || ids())) {
    const out = buildOne(id), file = path.join(OUT, id + '.html');
    if (check) { if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== out) stale.push(id); }
    else fs.writeFileSync(file, out);
  }
  if (check && stale.length) { console.error('inspire: قديم — شغّل node scripts/inspire/build.mjs: ' + stale.join(', ')); process.exit(1); }
  console.log(check ? 'inspire: مطابق' : 'inspire: بُني ' + ids().length);
}
