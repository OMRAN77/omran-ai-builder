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
import { createHash } from 'node:crypto';

const JS = 'js';
const BUNDLE = `${JS}/app.bundle.js`;
const GUARD = 500; // أقصى عدد أسطر متغيّرة يُقبل بلا --force
const force = process.argv.includes('--force');

const names = (await readdir(JS)).filter((f) => /^app-\d\d-.+\.js$/.test(f)).sort();
if (names.length < 18) throw new Error(`توقّعتُ ١٨ جزءًا على الأقل، وجدتُ ${names.length}`);

// لا فاصل بين الأجزاء: كلّ جزءٍ شريحةٌ من الحزمة تنتهي بسطرٍ جديد.
const bundle = (await Promise.all(names.map((n) => readFile(`${JS}/${n}`, 'utf8')))).join('');

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

const hash = createHash('sha256').update(bundle).digest('hex').slice(0, 8);
await writeFile(BUNDLE, bundle);

// بصمة محتوى واحدة تحكم الترقيم في موضعين — لا رقم يدويّ بعد اليوم.
// العلامة اليدويّة (532- · -g534) تبقى: هي وسيلة كسر الكاش حين يتغيّر
// HTML/CSS وحده فلا تتغيّر بصمة الحزمة. نستبدل البصمة وحدها لا الوسم.
const HEX8 = /(?<![0-9a-f])[0-9a-f]{8}(?![0-9a-f])/;
const stamp = (v, fallback) => (HEX8.test(v) ? v.replace(HEX8, hash) : fallback);

let html = await readFile('index.html', 'utf8');
html = html.replace(/(app\.bundle\.js\?v=)([^"']*)/g, (_, k, v) => k + stamp(v, hash));
await writeFile('index.html', html);

let sw = await readFile('sw.js', 'utf8');
sw = sw.replace(/(CACHE_NAME = ')([^']*)(')/, (_, a, v, z) => a + stamp(v, `omran-ai-builder-${hash}`) + z);
await writeFile('sw.js', sw);

console.log(`✓ ${names.length} جزءًا · ${bundle.split('\n').length} سطرًا · بصمة ${hash}`);
