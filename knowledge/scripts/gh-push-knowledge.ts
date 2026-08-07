// يدفع مجلّد معرفة إلى main. الاستخدام: bun gh-push-knowledge.ts <srcDir> <repoPrefix> "<رسالة>"
import { invokeTool } from '@tasklet/tools/v2';
import { readFileSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const CONN = 'conn_v99nvvn81c6baxgr3m9w', owner = 'OMRAN77', repo = 'omran-ai-builder', branch = 'main';
const [srcDir, prefix, msg] = process.argv.slice(2);
const names = readdirSync(srcDir).filter(n => n.endsWith('.md')).sort();
const STAGE = `/tasklet/agent/home/sync/push/${Date.now()}`;
mkdirSync(STAGE, { recursive: true });
for (const n of names) copyFileSync(`${srcDir}/${n}`, `${STAGE}/${n}`);
const files = names.map(n => ({ repoPath: `${prefix}/${n}`, localPath: `${STAGE}/${n}` }));
const res = await invokeTool({ connectionId: CONN, toolName: 'github_push_to_branch',
  args: { owner, repo, branch, commitMessage: msg, files } });
if (!res.ok) { console.log('✗ فشل الدفع: ' + res.error); process.exit(1); }
console.log('دُفِع: ' + JSON.stringify(await res.json()).slice(0, 300));
const blob = (b: Buffer) => createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b])).digest('hex');
let good = 0;
for (const n of names) {
  const r = await invokeTool({ connectionId: CONN, toolName: 'github_get_file_content', args: { owner, repo, repoPath: `${prefix}/${n}` } });
  if (!r.ok) { console.log(`✗ ${n} — لم يُقرأ: ${r.error}`); continue; }
  const j: any = await r.json();
  if (j.sha === blob(readFileSync(`${srcDir}/${n}`))) good++; else console.log(`✗ ${n} — بصمة مختلفة`);
}
console.log(`تحقّق البصمة: ${good}/${names.length}`);
