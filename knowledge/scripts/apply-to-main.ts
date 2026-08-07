import { invokeTool } from '@tasklet/tools/v2';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const CONN = 'conn_v99nvvn81c6baxgr3m9w';
const owner = 'OMRAN77', repo = 'omran-ai-builder';
const md5 = (p: string) => createHash('md5').update(readFileSync(p)).digest('hex');

const BASE = '/tasklet/agent/home/design/work/index.html';      // ما نزّلته من main
const NEW  = '/tasklet/agent/home/design/ready/index.html';     // المعدَّل
const CHK  = '/tasklet/agent/home/design/verify/main-index.html';

// 1) اجلب نسخة main الحالية
const dl = await invokeTool({
  toolName: 'github_download_file', connectionId: CONN,
  args: { owner, repo, repoPath: 'index.html', ref: 'main', destinationPath: CHK },
});
if (!dl.ok) { console.log('ABORT: تعذّر جلب main — ' + String(dl.error).slice(0,200)); process.exit(1); }

const baseHash = md5(BASE), liveHash = md5(CHK), newHash = md5(NEW);
console.log(`baseline=${baseHash}\nlive_main=${liveHash}\nnew=${newHash}`);

if (liveHash !== baseHash) {
  console.log('ABORT: main تغيّر منذ التنزيل — لن أدفع فوق تعديل جديد. راجع الفرق أولًا.');
  process.exit(1);
}
if (liveHash === newHash) { console.log('لا شيء لدفعه — main مطابق للملف المعدَّل بالفعل.'); process.exit(0); }
console.log('✓ main سليم ومطابق لخط الأساس — أدفع الآن.');

// 2) ادفع إلى main
const push = await invokeTool({
  toolName: 'github_push_to_branch', connectionId: CONN,
  args: {
    owner, repo, branch: 'main',
    commitMessage: 'حذف اللوحة اليمنى (#omranRightPanel) من سطح المكتب\n\nاستئصال كامل للوحة الجانبية اليمنى: عنصر <aside> + قواعد CSS + منطق JS المرتبط.\nأدوات الجوال السريعة (#omranQuickListMobile) لم تُمَس.\nمطابق لمحتوى طلب الدمج #1 — طُبّق مباشرة بتفويض صريح من المالك.\n\n-33 سطرًا، 0 مضاف.',
    files: [{ repoPath: 'index.html', localPath: NEW }],
  },
});
if (!push.ok) { console.log('FAIL الدفع: ' + String(push.error).slice(0,300)); process.exit(1); }
const r: any = await push.json();
console.log(`✓ دُفع إلى main — commit ${String(r.commit?.sha).slice(0,7)} — ملفات: ${r.filesChanged}`);

// 3) تحقّق من main بعد الدفع
const v = await invokeTool({
  toolName: 'github_download_file', connectionId: CONN,
  args: { owner, repo, repoPath: 'index.html', ref: 'main', destinationPath: '/tasklet/agent/home/design/verify/main-after.html' },
});
if (v.ok) {
  const after = md5('/tasklet/agent/home/design/verify/main-after.html');
  console.log(`main بعد الدفع: ${after} ${after === newHash ? '✓ مطابق تمامًا للملف المعدَّل' : '✗ غير مطابق!'}`);
  const txt = readFileSync('/tasklet/agent/home/design/verify/main-after.html','utf8');
  const bad = ['omranRightPanel','omranBalanceCard','omranBalanceTop','omranTopUpBtn',"'#omranQuickList'"].filter(k => txt.includes(k));
  console.log(bad.length ? `✗ بقايا في main: ${bad.join(', ')}` : '✓ صفر بقايا للوحة في main');
  console.log(`✓ أدوات الجوال باقية: ${txt.includes('omranQuickListMobile')}`);
  console.log(`أسطر main الآن: ${txt.split('\n').length}`);
}
