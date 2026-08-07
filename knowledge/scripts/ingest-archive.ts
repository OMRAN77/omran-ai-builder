#!/usr/bin/env bun
/**
 * ingest-archive.ts — استقبال ملفّ مضغوط كبير وفهرسته.
 *
 * الاستخدام:
 *   bun /tasklet/agent/home/scripts/ingest-archive.ts                 # يفهرس كل أرشيف في uploads
 *   bun .../ingest-archive.ts /tasklet/agent/uploads/x.zip            # أرشيف محدّد
 *   bun .../ingest-archive.ts x.zip --keep                            # ينسخ المحتوى إلى home/intake
 *
 * يفكّ في /tmp/intake (سريع) ثم يكتب فهرسًا في
 *   /tasklet/agent/home/intake/<name>/INDEX.md
 * ولا ينسخ المحتوى نفسه إلى /tasklet إلّا مع --keep.
 */
import { readdirSync, statSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { basename, extname, join } from 'node:path';

const UPLOADS = '/tasklet/agent/uploads';
const OUT = '/tasklet/agent/home/intake';
const TMP = '/tmp/intake';

const ARCHIVE_RE = /\.(zip|tgz|tar|tar\.gz|tar\.bz2|tar\.xz|7z|rar|gz|bz2|xz)$/i;
const args = process.argv.slice(2);
const keep = args.includes('--keep');
const targets = args.filter((a) => !a.startsWith('--'));

function sh(cmd: string) {
  return execSync(cmd, { encoding: 'utf8', maxBuffer: 1 << 28 });
}
function have(bin: string) {
  try { sh(`command -v ${bin}`); return true; } catch { return false; }
}
function human(n: number) {
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)}${u[i]}`;
}

function extract(file: string, dest: string) {
  mkdirSync(dest, { recursive: true });
  const f = file.toLowerCase();
  if (f.endsWith('.zip')) {
    if (!have('unzip')) throw new Error('unzip مفقود');
    sh(`unzip -q -o ${JSON.stringify(file)} -d ${JSON.stringify(dest)}`);
  } else if (/\.(tgz|tar\.gz|tar|tar\.bz2|tar\.xz)$/.test(f)) {
    sh(`tar -xf ${JSON.stringify(file)} -C ${JSON.stringify(dest)}`);
  } else if (f.endsWith('.7z')) {
    if (!have('7z')) sh('apt-get install -y -qq p7zip-full >/dev/null 2>&1');
    sh(`7z x -y -o${JSON.stringify(dest)} ${JSON.stringify(file)} >/dev/null`);
  } else if (f.endsWith('.rar')) {
    if (!have('unrar')) sh('apt-get install -y -qq unrar-free >/dev/null 2>&1 || apt-get install -y -qq unar >/dev/null 2>&1');
    if (have('unrar')) sh(`unrar x -o+ ${JSON.stringify(file)} ${JSON.stringify(dest)}/ >/dev/null`);
    else sh(`unar -q -o ${JSON.stringify(dest)} ${JSON.stringify(file)}`);
  } else if (/\.(gz|bz2|xz)$/.test(f)) {
    const out = join(dest, basename(file).replace(/\.(gz|bz2|xz)$/i, ''));
    const tool = f.endsWith('.gz') ? 'gzip' : f.endsWith('.bz2') ? 'bzip2' : 'xz';
    sh(`${tool} -dc ${JSON.stringify(file)} > ${JSON.stringify(out)}`);
  } else throw new Error(`نوع غير مدعوم: ${file}`);
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.isFile()) acc.push(p);
  }
  return acc;
}

function index(name: string, root: string) {
  const files = walk(root);
  let total = 0;
  const byExt = new Map<string, { n: number; bytes: number }>();
  const rows: { p: string; bytes: number }[] = [];
  for (const f of files) {
    const b = statSync(f).size;
    total += b;
    rows.push({ p: f.slice(root.length + 1), bytes: b });
    const e = (extname(f) || '(بلا امتداد)').toLowerCase();
    const cur = byExt.get(e) ?? { n: 0, bytes: 0 };
    cur.n++; cur.bytes += b; byExt.set(e, cur);
  }
  rows.sort((a, b) => b.bytes - a.bytes);
  const exts = [...byExt.entries()].sort((a, b) => b[1].bytes - a[1].bytes);
  const tops = readdirSync(root, { withFileTypes: true }).map((e) => (e.isDirectory() ? `${e.name}/` : e.name));

  const L: string[] = [];
  L.push(`# فهرس الأرشيف — ${name}`, '');
  L.push(`- التاريخ: ${new Date().toISOString()}`);
  L.push(`- عدد الملفّات: **${files.length}** · الحجم المفكوك: **${human(total)}**`);
  L.push(`- مكان الفكّ المؤقّت: \`${root}\` (يزول بانتهاء الجلسة)`);
  L.push('', '## الجذر', '', tops.map((t) => `- \`${t}\``).join('\n'));
  L.push('', '## بحسب النوع', '', '| نوع | عدد | حجم |', '|---|---|---|');
  for (const [e, v] of exts.slice(0, 30)) L.push(`| \`${e}\` | ${v.n} | ${human(v.bytes)} |`);
  L.push('', '## أكبر ٤٠ ملفًّا', '', '| ملفّ | حجم |', '|---|---|');
  for (const r of rows.slice(0, 40)) L.push(`| \`${r.p}\` | ${human(r.bytes)} |`);
  L.push('', '## كلّ المسارات', '', '```', ...rows.map((r) => r.p).sort(), '```', '');

  const dest = join(OUT, name);
  mkdirSync(dest, { recursive: true });
  writeFileSync(join(dest, 'INDEX.md'), L.join('\n'));
  return { files: files.length, total, dest, exts, tops };
}

const list = targets.length
  ? targets.map((t) => (t.startsWith('/') ? t : join(UPLOADS, t)))
  : readdirSync(UPLOADS).filter((f) => ARCHIVE_RE.test(f)).map((f) => join(UPLOADS, f));

if (!list.length) { console.log('لا أرشيف في uploads.'); process.exit(0); }

for (const file of list) {
  if (!existsSync(file)) { console.log(`❌ غير موجود: ${file}`); continue; }
  const name = basename(file).replace(ARCHIVE_RE, '').replace(/[^\w\u0600-\u06FF.-]+/g, '_');
  const root = join(TMP, name);
  console.log(`\n=== ${basename(file)} (${human(statSync(file).size)} مضغوط) ===`);
  try {
    sh(`rm -rf ${JSON.stringify(root)}`);
    extract(file, root);
    const r = index(name, root);
    console.log(`✅ ${r.files} ملفًّا · ${human(r.total)} · فهرس: ${r.dest}/INDEX.md`);
    console.log(`   الجذر: ${r.tops.slice(0, 12).join(' ')}`);
    console.log(`   الأنواع: ${r.exts.slice(0, 8).map(([e, v]) => `${e}×${v.n}`).join(' ')}`);
    if (keep) {
      sh(`mkdir -p ${JSON.stringify(join(r.dest, 'files'))} && cp -a ${JSON.stringify(root)}/. ${JSON.stringify(join(r.dest, 'files'))}/`);
      console.log(`   📦 نُسخ المحتوى إلى ${r.dest}/files`);
    }
  } catch (e: any) {
    console.log(`❌ فشل: ${e.message}`);
  }
}
