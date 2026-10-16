/* v-models-live — الفحص الدوريّ للموديلات الحيّة (يشغّله .github/workflows/model-probe.yml أسبوعيًّا أو يدويًّا).
 *
 *   node scripts/models-live.mjs                 تقرير على الطرفيّة (المفاتيح من البيئة؛ الناقص = «لم يُفحص»)
 *   node scripts/models-live.mjs --out r.md      ويكتب التقرير Markdown في ملفّ
 *
 * رمز الخروج: 0 كلّ المفحوص حيّ · 2 اسم ميّت أو أكثر · 1 عطل في الفحص نفسه. لا يطبع مفتاحًا أبدًا. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const lib = createRequire(import.meta.url)('./lib/models-live.cjs');
const root = new URL('..', import.meta.url).pathname;
const ignore = JSON.parse(readFileSync(new URL('./models-live-ignore.json', import.meta.url), 'utf8'));

const { models, errors } = lib.extractModels(root, ignore);
const catalogs = await lib.fetchCatalogs(process.env);
const result = lib.classify(models, catalogs);
const md = lib.report(result, catalogs, errors);

console.log(md);
const i = process.argv.indexOf('--out');
if (i > 0 && process.argv[i + 1]) writeFileSync(process.argv[i + 1], md + '\n');
// المزوّد العامّ (OpenRouter) لم يُجلب = الفحص نفسه معطوب (شبكة)، لا «كلّ شيء سليم».
if (!(catalogs.openrouter instanceof Set)) process.exit(1);
process.exit(result.dead.length ? 2 : 0);
