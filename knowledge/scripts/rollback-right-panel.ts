/**
 * تراجع فوري: إعادة index.html إلى ما قبل حذف اللوحة اليمنى.
 * خط الأساس: /tasklet/agent/home/design/work/index.html  (md5 9ba353037f6e66bc8d9698a38057b61b)
 * الالتزام الذي يُلغى: 068d8a2
 * التشغيل:  cd /tasklet/agent/home/scripts && bun -i rollback-right-panel.ts
 */
import { invokeTool } from '@tasklet/tools/v2';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const CONN = 'conn_v99nvvn81c6baxgr3m9w';
const BASE = '/tasklet/agent/home/design/work/index.html';
const EXPECT = '9ba353037f6e66bc8d9698a38057b61b';

const h = createHash('md5').update(readFileSync(BASE)).digest('hex');
if (h !== EXPECT) { console.log(`ABORT: خط الأساس تغيّر (${h}) — لا تدفع.`); process.exit(1); }

const r = await invokeTool({
  toolName: 'github_push_to_branch', connectionId: CONN,
  args: {
    owner: 'OMRAN77', repo: 'omran-ai-builder', branch: 'main',
    commitMessage: 'تراجع: إعادة اللوحة اليمنى (#omranRightPanel) — إلغاء 068d8a2',
    files: [{ repoPath: 'index.html', localPath: BASE }],
  },
});
if (!r.ok) { console.log('FAIL: ' + String(r.error).slice(0, 300)); process.exit(1); }
const d: any = await r.json();
console.log(`✓ تراجُع مُنفَّذ — commit ${String(d.commit?.sha).slice(0, 7)}`);
