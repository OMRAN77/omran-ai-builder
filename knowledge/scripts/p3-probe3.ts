import { invokeTool } from '@tasklet/tools/v2';
import { readFileSync } from 'node:fs';
const probe = readFileSync('/tasklet/agent/home/audit/p3/probe3.js','utf8');
for (const u of process.argv.slice(2)) {
  const [tag, url] = u.split('=');
  const r = await invokeTool({ toolName: 'browser', args: { actions: [
    { navigate: { url, duration_seconds: 10 } },
    { evaluate: { expression: probe, destinationPath: `/tasklet/agent/home/audit/p3/${tag}.json` } },
  ] } });
  console.log(tag, r.ok ? 'ok' : 'FAIL ' + r.error);
}
