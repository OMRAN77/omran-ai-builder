import { invokeTool } from '@tasklet/tools/v2';
import { readFileSync } from 'node:fs';
const p2 = readFileSync('/tasklet/agent/home/audit/p3/probe2.js','utf8');
const p6 = readFileSync('/tasklet/agent/home/audit/p3/probe-s6.js','utf8');
const [, , ...urls] = process.argv;
for (const u of urls) {
  const [tag, url] = u.split('=');
  const r = await invokeTool({ toolName: 'browser', args: { actions: [
    { navigate: { url, duration_seconds: 14 } },
    { evaluate: { expression: "localStorage.setItem('aiapp_lang','ar'); localStorage.setItem('panelWidthSidebar','250'); localStorage.removeItem('tickerCollapsed'); localStorage.removeItem('waCollapsed'); 'pinned'" } },
    { navigate: { url, duration_seconds: 14 } },
    { evaluate: { expression: p2, destinationPath: `/tasklet/agent/home/audit/p3/${tag}.json` } },
    { evaluate: { expression: p6, destinationPath: `/tasklet/agent/home/audit/p3/${tag}-s6.json` } },
  ] } });
  console.log(tag, r.ok ? 'ok' : 'FAIL ' + r.error);
}
