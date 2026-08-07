import { invokeTool } from '@tasklet/tools/v2';
import { writeFile } from 'node:fs/promises';

const res = await invokeTool({
  toolName: 'github_get_file_content',
  connectionId: 'conn_v99nvvn81c6baxgr3m9w',
  args: { owner: 'OMRAN77', repo: 'omran-ai-builder', repoPath: 'index.html' },
});
if (!res.ok) { console.log('ERR', res.error); process.exit(1); }
const data = await res.json();
console.log('encoding', data.encoding, 'size', data.size, 'contentLen', data.content ? data.content.length : null);
if (data.content) {
  const buf = data.encoding === 'base64' ? Buffer.from(data.content, 'base64') : Buffer.from(data.content, 'utf8');
  await writeFile('/tmp/repo/index.html', buf);
  console.log('written bytes', buf.length);
} else {
  console.log('downloadUrl', data.downloadUrl);
}
