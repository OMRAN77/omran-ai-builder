import { invokeTool } from '@tasklet/tools/v2';
const C = { owner: 'OMRAN77', repo: 'omran-ai-builder' };
const conn = 'conn_v99nvvn81c6baxgr3m9w';
await new Promise(r => setTimeout(r, 35000)); // فخّ: الواصفة تكذب فور الدفع

const dir = await invokeTool({ toolName: 'github_get_file_content', connectionId: conn,
  args: { ...C, repoPath: 'icons', ref: 'main' } });
if (dir.ok) {
  const j: any = await dir.json();
  console.log('icons/ على main:');
  for (const e of j.entries) console.log(`  ${e.name} | ${e.size}B | ${e.sha.slice(0,10)}`);
} else console.log('✗ icons:', dir.error);

const f = await invokeTool({ toolName: 'github_get_file_content', connectionId: conn,
  args: { ...C, repoPath: 'index.html', ref: 'main' } });
if (f.ok) {
  const j: any = await f.json();
  const txt = Buffer.from(j.content ?? '', j.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8');
  console.log('index.html: حجم', j.size, '| og-omran =', (txt.match(/og-omran\.jpg/g) ?? []).length,
              '| og-image =', (txt.match(/og-image\.png/g) ?? []).length);
} else console.log('✗ index.html:', f.error);
