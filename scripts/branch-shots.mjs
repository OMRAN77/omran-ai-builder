#!/usr/bin/env node
// scripts/branch-shots.mjs — v-branch-shots: «جهاز» المزوّدين للتحقّق البصريّ. يشغّله .github/workflows/branch-shots.yml على فرع المزوّد.
//
// لقطتا حاسوب وجوّال بـscripts/ui-shot.mjs (بلا خادم ولا مفاتيح) كمالك، وأخطاء الصفحة، في .shots/ مع summary.json.
// المدخلان الوحيدان من البيئة (SHOT_SETTINGS قسم إعدادات، SHOT_CLICK معرّف زرّ) يمرّان بفاحصَي api/_lib/branch-shots.js نفسيهما
// قبل أيّ تشغيل، ويُمرَّران وسائط لا نصّ صدفة. ينتهي دائمًا بالرمز 0: تشغيل أحمر على التزام الطلب يوقف دمجه، والنتيجة
// (ومنها أخطاء الصفحة) في الملخّص يقرؤه المزوّد.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BS = createRequire(import.meta.url)(path.join(ROOT, 'api/_lib/branch-shots.js'));
const OUT = path.join(ROOT, '.shots');
fs.mkdirSync(OUT, { recursive: true });

const v = BS.viewOf({ settings: process.env.SHOT_SETTINGS, click: process.env.SHOT_CLICK });
const summary = { settings: v.settings || '', click: v.click || '', rejected: v.error || '', ok: false, pageErrors: [], consoleErrors: [], note: '' };
const r = spawnSync(process.execPath, BS.shotArgs(OUT, v.error ? {} : v), { cwd: ROOT, encoding: 'utf8', timeout: 240000, maxBuffer: 8 * 1024 * 1024 });
const out = String(r.stdout || '');
try {
  const j = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
  summary.pageErrors = (j.pageErrors || []).slice(0, 20);
  summary.consoleErrors = (j.consoleErrors || []).slice(0, 20);
  summary.ok = BS.SHOT_FILES.every((f) => fs.existsSync(path.join(OUT, f)));
} catch (e) {
  summary.note = 'تعذّرت قراءة ملخّص اللقطة: ' + String((e && e.message) || e).slice(0, 160) + ' · ' + String(r.stderr || (r.error && r.error.message) || '').slice(-600);
}
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
process.exit(0);
