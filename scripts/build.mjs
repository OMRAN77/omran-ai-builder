/* المرحلة ٠ — مصدر حقيقة واحد للحزمة.
 *
 * قبل اليوم: app.bundle.js يُوصَل يدويًّا، ويُرقَّع مباشرةً، فتتأخّر أجزاؤه
 * بصمت. في ٦ أغسطس ٢٠٢٦ كانت الأجزاء متأخّرة ١٢٢ سطرًا: أيّ بناءٍ ساذج
 * كان سيمحو ثلاثة أيام عمل بلا صوت.
 *
 * بعد اليوم: الأجزاء js/app-NN-*.js شرائح متلاصقة، والحزمة نتيجةٌ لا مصدر.
 * ومن حاول أن يبني بناءً يمحو الكثير، أوقفناه.
 *
 *   node scripts/build.mjs            بناء + بصمة
 *   node scripts/build.mjs --force    تجاوز حدّ الأمان (بقصدٍ صريح)
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

// v-auto-bundle: خطوات البناء نفسها في وحدة مشتركة — أداة الرفع على الخادم (github-write.js) تبني بها الحزمة
// داخل رفعة المزوّد، فلا تنحرف عن هذا السكربت ولا عن verify حرفًا.
const core = createRequire(import.meta.url)('../api/_lib/bundle-core.js');

const JS = 'js';
const BUNDLE = `${JS}/app.bundle.js`;
const GUARD = 500; // أقصى عدد أسطر متغيّرة يُقبل بلا --force
const force = process.argv.includes('--force');

const names = core.partNames(await readdir(JS));
const parts = {};
await Promise.all(names.map(async (n) => { parts[n] = await readFile(`${JS}/${n}`, 'utf8'); }));
const { bundle, hash } = core.buildBundle(parts); // لا فاصل بين الأجزاء؛ ويرمي تحت ١٨ جزءًا

const prev = await readFile(BUNDLE, 'utf8').catch(() => null);
if (prev !== null && prev !== bundle) {
  const a = prev.split('\n'), b = bundle.split('\n');
  const set = new Set(a);
  const changed = b.filter((l) => !set.has(l)).length + Math.max(0, a.length - b.length);
  if (changed > GUARD && !force) {
    throw new Error(
      `أوقفتُ البناء: ${changed} سطرًا متغيّرًا يتجاوز حدّ ${GUARD}. ` +
      `إن كان هذا مقصودًا فأعِد الأمر مع --force.`
    );
  }
}

await writeFile(BUNDLE, bundle);

// بصمة محتوى واحدة تحكم الترقيم في موضعين — لا رقم يدويّ بعد اليوم.
// العلامة اليدويّة (532- · -g534) تبقى: هي وسيلة كسر الكاش حين يتغيّر
// HTML/CSS وحده فلا تتغيّر بصمة الحزمة. نستبدل البصمة وحدها لا الوسم (core.stampHtml/stampSw).
await writeFile('index.html', core.stampHtml(await readFile('index.html', 'utf8'), hash));
await writeFile('sw.js', core.stampSw(await readFile('sw.js', 'utf8'), hash));

console.log(`✓ ${names.length} جزءًا · ${bundle.split('\n').length} سطرًا · بصمة ${hash}`);
