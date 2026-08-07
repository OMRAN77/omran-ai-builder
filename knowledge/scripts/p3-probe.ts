import { invokeTool } from '@tasklet/tools/v2';
import { readFileSync } from 'node:fs';
const probe = readFileSync('/tasklet/agent/home/audit/p3/probe2.js','utf8');
const [, , ...urls] = process.argv;
for (const u of urls) {
  const [tag, url] = u.split('=');
  const out = `/tasklet/agent/home/audit/p3/${tag}.json`;
  const r = await invokeTool({ toolName: 'browser', args: { actions: [
    { navigate: { url, duration_seconds: 14 } },
    { evaluate: { expression: probe, destinationPath: out } },
  ] } });
  console.log(tag, r.ok ? 'ok' : 'FAIL ' + r.error);
}
