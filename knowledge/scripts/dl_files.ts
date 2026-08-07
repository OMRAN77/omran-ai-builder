import { invokeTool } from '@tasklet/tools/v2';

const files = ['index.html', 'sw.js', 'js/app.bundle.js', 'js/app-05-ui.js', 'js/app-01-boot-auth.js'];
for (const f of files) {
  const res = await invokeTool({
    toolName: 'github_download_file',
    connectionId: 'conn_v99nvvn81c6baxgr3m9w',
    args: { owner: 'OMRAN77', repo: 'omran-ai-builder', repoPath: f, destinationPath: '/tasklet/agent/home/repo_dl/' + f.replace('/', '_') },
  });
  if (!res.ok) { console.log('ERR', f, res.error); continue; }
  const data = await res.json();
  console.log(f, '->', data.savedPath, data.size);
}
