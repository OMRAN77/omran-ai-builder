import { invokeTool } from '@tasklet/tools/v2';

const files = [
 'js/_floorplan-editor-client.js','js/app-00-swallow.js','js/app-02-tts.js','js/app-03-i18n-data.js',
 'js/app-04-i18n-state.js','js/app-06-checkout.js','js/app-07-voice.js','js/app-08-maha.js',
 'js/app-09-attach.js','js/app-10-features.js','js/app-11-video.js','js/app-12-studios.js',
 'js/app-13-stocks-init.js','js/app-14-tester.js','js/app-15-floorplan.js','js/app-16-snapbuild.js',
 'js/app-17-agent-tools.js'
];
for (const f of files) {
  const res = await invokeTool({
    toolName: 'github_download_file',
    connectionId: 'conn_v99nvvn81c6baxgr3m9w',
    args: { owner: 'OMRAN77', repo: 'omran-ai-builder', repoPath: f, destinationPath: '/tasklet/agent/home/repo_dl/' + f.replace('/', '_') },
  });
  if (!res.ok) { console.log('ERR', f, res.error); continue; }
  const data = await res.json();
  console.log(f, '->', data.size);
}
