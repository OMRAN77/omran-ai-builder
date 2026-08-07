import { invokeTool } from '@tasklet/tools/v2';
import { readFileSync } from 'node:fs';
const p2 = readFileSync('/tasklet/agent/home/audit/p3/probe2.js','utf8');
const pe = readFileSync('/tasklet/agent/home/audit/p3/probe-edu.js','utf8');
const [, , ...urls] = process.argv;
for (const u of urls) {
  const [tag, url] = u.split('=');
  const r = await invokeTool({ toolName: 'browser', args: { actions: [
    { navigate: { url, duration_seconds: 14 } },
    { evaluate: { expression: p2, destinationPath: `/tasklet/agent/home/audit/p3/${tag}.json` } },
    { evaluate: { expression: pe, destinationPath: `/tasklet/agent/home/audit/p3/${tag}-edu.json` } },
  ] } });
  console.log(tag, r.ok ? 'ok' : 'FAIL ' + r.error);
}
