// scripts/run-tests.mjs — مشغّل الاختبارات المتوازي (v-parallel-tests).
//
// العرض: سلسلة `&&` في سكربت test كانت تشغّل ٣٥٠+ ملفًّا واحدًا بعد الآخر: ~١٠ دقائق جدارًا مقابل
// ~٢٫٥ دقيقة معالجًا (٧٥٪ انتظار)، وتقف عند أوّل فشل فتخفي كلّ ما بعده.
// القرار: القائمة المسجّلة تبقى في package.json — سكربت test وما يناديه pretest — مصدرَ حقيقة وحيدًا
// (يُسجَّل الاختبار الجديد كما كان: `&& node tests/x.test.cjs` في آخر السلسلة). هذا السكربت يقرؤها
// ويشغّل كلّ ملفّ في عمليّة مستقلّة بتجمّع N عامل (عدد المعالجات)، الأطول أوّلًا من
// scripts/test-durations.json، ويجمع كلّ الإخفاقات ثمّ يخرج ١ إن فشل ملفّ واحد.
//
//   node scripts/run-tests.mjs              الكلّ بالتوازي (npm run ci يناديه)
//   node scripts/run-tests.mjs --jobs 2     تجمّع أصغر (أو TEST_JOBS=2)
//   node scripts/run-tests.mjs --list       اطبع القائمة المسجّلة فقط
//   node scripts/run-tests.mjs --record     اكتب المدد المقيسة في scripts/test-durations.json
//   node scripts/run-tests.mjs --root DIR   شغّل قائمة package.json في مجلّد آخر (اختبار المشغّل نفسه)
//   npm run test:serial                     الاحتياط: السلسلة كما هي، ملفًّا بعد ملفّ
//
// مهلة الملفّ الواحد TEST_FILE_TIMEOUT_MS (افتراضيًّا ١٠ دقائق؛ أبطأ ملفّ اليوم دون ٩٠ ثانية):
// ملفّ معلّق يُقتل ويُعدّ فاشلًا بدل أن يعلّق CI كلّه.

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(HERE, '..');
export const DURATIONS_REL = 'scripts/test-durations.json';
const FILE_RE = /^tests\/\S+\.test\.cjs$/;

/** يقرأ سكربتات package.json ويعيد [{file, args}] بترتيب التسجيل: pretest ثمّ test.
 *  كلّ مقطع بين `&&` واحد من ثلاثة: `npm run X` (يُفكّ)، `node --test f1 f2…`، `node f`.
 *  ما سواها يرمي — مدخل مشوّه مثل «node a node a» يُرى ولا يُبتلع. */
export function registered(pkg) {
  const scripts = (pkg && pkg.scripts) || {};
  const out = [];
  const seen = new Set();
  const bad = [];
  const visit = (name, stack) => {
    if (stack.includes(name)) throw new Error('حلقة في السكربتات: ' + stack.concat(name).join(' → '));
    const cmd = scripts[name];
    if (typeof cmd !== 'string') throw new Error('سكربت غير موجود: ' + name);
    for (const seg of cmd.split('&&').map((s) => s.trim()).filter(Boolean)) {
      const words = seg.split(/\s+/);
      const npm = /^npm (?:run )?([\w:.-]+)$/.exec(seg);
      if (npm) { visit(npm[1], stack.concat(name)); continue; }
      if (words[0] === 'node' && words[1] === '--test' && words.length > 2 && words.slice(2).every((w) => FILE_RE.test(w))) {
        for (const f of words.slice(2)) if (!seen.has(f)) { seen.add(f); out.push({ file: f, args: ['--test', f] }); }
        continue;
      }
      if (words[0] === 'node' && words.length === 2 && FILE_RE.test(words[1])) {
        if (!seen.has(words[1])) { seen.add(words[1]); out.push({ file: words[1], args: [words[1]] }); }
        continue;
      }
      bad.push(name + ': ' + seg);
    }
  };
  if (scripts.pretest) visit('pretest', []);
  visit('test', []);
  if (bad.length) throw new Error('مقاطع غير مفهومة في package.json:\n  ' + bad.join('\n  '));
  return out;
}

/** الأطول أوّلًا؛ ما لا مدّة له يبقى بترتيب تسجيله بعد المعروف (الفرز ثابت). */
export function schedule(list, durations) {
  const d = durations || {};
  return list.slice().sort((a, b) => (Number(d[b.file]) || 0) - (Number(d[a.file]) || 0));
}

/** يجمع عدّادات node:test من مخرجات ملفّ: TAP (`# pass 3`) أو spec (`ℹ pass 3`). */
export function counts(text) {
  const c = { tests: 0, pass: 0, fail: 0 };
  for (const m of String(text).matchAll(/^(?:#|ℹ) (tests|pass|fail) (\d+)\s*$/gm)) c[m[1]] += Number(m[2]);
  return c;
}

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); }
  catch (e) { return null; } // ملفّ المدد اختياريّ: غيابه يعني ترتيب التسجيل
}

function argValue(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

const TAIL = 64 * 1024;
const live = new Set();

/* مراجعة الدفعة A (arch-3): كان الحكم على 'close' وحده، و'close' ينتظر كلّ من يمسك الأنابيب — حفيد هرب من مجموعة العمليّات
   (detached/setsid) يمسكها فيعلّق المشغّل حتّى يخرج (وللأبد لو كان خادمًا)، ولا تصله kill(-pid)، والملفّ الذي خرج ٠ يُعدّ «timeout».
   الآن: الحكم يُسجَّل عند 'exit' ويُلغى المؤقّت، ثمّ مهلة قصيرة لـ'close' وبعدها تُقطع الأنابيب ويُحسم؛ والمهلة تقطعها أيضًا بعد
   القتل — فكلّ ملفّ يُحسم خلال مهلته + EXIT_GRACE على الأكثر. */
const EXIT_GRACE_MS = () => Number(process.env.TEST_EXIT_GRACE_MS) || 2000;

function runOne(root, entry, env, timeoutMs) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, entry.args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    live.add(child);
    let out = '';
    const take = (d) => { out += d; if (out.length > 4 * TAIL) out = out.slice(-2 * TAIL); };
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8'); // حرف عربيّ مقسوم بين قطعتين لا يصير �
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    let timedOut = false, verdict, settled = false, grace = null;
    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); clearTimeout(grace);
      live.delete(child);
      child.stdout.destroy(); child.stderr.destroy(); // حفيد هارب يمسك الأنابيب لا يُبقي المشغّل حيًّا
      resolve({ file: entry.file, code: timedOut ? 'timeout' : verdict, ms: Date.now() - t0, out });
    };
    const timer = setTimeout(() => { timedOut = true; kill(child); grace = setTimeout(settle, EXIT_GRACE_MS()); }, timeoutMs);
    child.on('error', (e) => { out += '\n' + String(e && e.stack || e); });
    child.on('exit', (code, signal) => {
      verdict = code === null ? signal : code;
      if (!timedOut) { clearTimeout(timer); grace = setTimeout(settle, EXIT_GRACE_MS()); }
    });
    child.on('close', (code, signal) => {
      if (verdict === undefined) verdict = code === null ? signal : code;
      settle();
    });
  });
}

function kill(child) {
  try { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); }
  catch (e) { try { child.kill('SIGKILL'); } catch (e2) { /* انتهت العمليّة قبل القتل — لا شيء يُقتل */ } }
}

export async function main(argv = process.argv.slice(2)) {
  const root = path.resolve(argValue(argv, '--root') || DEFAULT_ROOT);
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  let list;
  try { list = registered(pkg); }
  catch (e) { console.error('✗ ' + e.message); return 2; }
  const missing = list.filter((e) => !existsSync(path.join(root, e.file)));
  if (missing.length) { console.error('✗ ملفّات مسجّلة غير موجودة:\n  ' + missing.map((e) => e.file).join('\n  ')); return 2; }
  if (argv.includes('--list')) { for (const e of list) console.log(e.file); return 0; }

  const jobs = Math.max(1, Number(argValue(argv, '--jobs') || process.env.TEST_JOBS) || (os.availableParallelism ? os.availableParallelism() : os.cpus().length));
  const timeoutMs = Number(process.env.TEST_FILE_TIMEOUT_MS) || 10 * 60 * 1000;
  const durations = readJson(path.join(root, DURATIONS_REL)) || {};
  const queue = schedule(list, durations);
  if (!queue.length) { console.error('✗ لا ملفّ اختبار مسجّل — تشغيل فارغ لا يُعدّ نجاحًا'); return 2; } // arch-2
  const env = Object.assign({}, process.env);
  delete env.NODE_TEST_CONTEXT; // لو شُغّل المشغّل نفسه تحت node --test لصار كلّ ملفّ «اختبارًا فرعيًّا» صامتًا

  console.log(`▶ ${queue.length} ملفّ اختبار · ${jobs} عامل متوازٍ · الأطول أوّلًا`);
  const t0 = Date.now();
  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < queue.length) {
      const r = await runOne(root, queue[next++], env, timeoutMs);
      results.push(r);
      const ok = r.code === 0;
      console.log(`${ok ? '✓' : '✗'} ${r.file}  ${(r.ms / 1000).toFixed(1)}s${ok ? '' : '  (' + r.code + ')'}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, worker));
  const wall = (Date.now() - t0) / 1000;

  const fails = results.filter((r) => r.code !== 0);
  const total = results.reduce((c, r) => { const k = counts(r.out); c.tests += k.tests; c.pass += k.pass; c.fail += k.fail; return c; }, { tests: 0, pass: 0, fail: 0 });
  for (const f of fails) {
    console.log(`\n━━━━ ✗ ${f.file} (${f.code}) ━━━━`);
    console.log(f.out.length > TAIL ? '…' + f.out.slice(-TAIL) : f.out);
  }
  const slow = results.slice().sort((a, b) => b.ms - a.ms).slice(0, 8);
  console.log('\nالأبطأ: ' + slow.map((r) => path.basename(r.file) + ' ' + (r.ms / 1000).toFixed(1) + 's').join(' · '));
  console.log(`اختبارات node:test: ${total.tests} · نجح ${total.pass} · فشل ${total.fail}`);
  console.log(`${fails.length ? '✗' : '✓'} ${results.length - fails.length}/${results.length} ملفًّا نجح · ${wall.toFixed(1)}s جدارًا · ${(results.reduce((a, r) => a + r.ms, 0) / 1000).toFixed(1)}s مجموع`);
  if (fails.length) console.log('الفاشلة:\n  ' + fails.map((f) => f.file).join('\n  '));

  if (argv.includes('--record')) {
    const rec = { _note: 'مدد ملفّات الاختبار بالمللي ثانية (≥ ثانية) — تلميح ترتيب لـscripts/run-tests.mjs فقط؛ يُحدَّث بـ --record.' };
    for (const r of results.slice().sort((a, b) => b.ms - a.ms)) if (r.ms >= 1000) rec[r.file] = Math.round(r.ms / 100) * 100;
    writeFileSync(path.join(root, DURATIONS_REL), JSON.stringify(rec, null, 1) + '\n');
  }
  return fails.length ? 1 : 0;
}

/* مراجعة الدفعة A (arch-2): المقارنة بالمسار الحقيقيّ — Node يُبقي argv[1] رابطًا رمزيًّا وimport.meta.url حقيقيّ، فالنداء
   عبر مسار فيه رابط (macOS: ‎/tmp → ‎/private/tmp، أو مستودع مربوط) كان يخرج ٠ بلا اختبار واحد: نجاح كاذب صامت. */
export function isEntry(argv1, metaUrl) {
  try { return !!argv1 && realpathSync(argv1) === realpathSync(fileURLToPath(metaUrl)); }
  catch (e) { return false; } // argv[1] ليس ملفًّا (‎-e أو REPL): ليس نقطة دخول
}

if (isEntry(process.argv[1], import.meta.url)) {
  // العمّال في مجموعات عمليّات مستقلّة (لتُقتل المهلة بأحفادها)، فلا يصلهم Ctrl-C تلقائيًّا: نقتلهم نحن.
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { for (const c of live) kill(c); process.exit(130); });
  main().then((code) => { process.exitCode = code; }, (e) => { console.error(e && e.stack || e); process.exitCode = 2; });
}
