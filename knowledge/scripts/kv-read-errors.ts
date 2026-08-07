// قراءة فقط: يطبع سجلّ أخطاء العميل بالوقت والرسالة.
import { readFileSync, writeFileSync } from 'node:fs';
function envFile(p: string): Record<string, string> {
  const o: Record<string, string> = {};
  for (const l of readFileSync(p, 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return o;
}
const vc = envFile('/tasklet/agent/home/.secrets/vercel.env');
const vh = { Authorization: `Bearer ${vc.VERCEL_TOKEN}` };
const list = await (await fetch(`https://api.vercel.com/v9/projects/${vc.VERCEL_PROJECT}/env?teamId=${vc.VERCEL_TEAM}`, { headers: vh })).json() as any;
const creds: Record<string, string> = {};
for (const e of list.envs ?? []) {
  if (!/^UPSTASH_REDIS_REST_(URL|TOKEN)$/.test(e.key)) continue;
  const one = await (await fetch(`https://api.vercel.com/v9/projects/${vc.VERCEL_PROJECT}/env/${e.id}?teamId=${vc.VERCEL_TEAM}&decrypt=true`, { headers: vh })).json() as any;
  creds[e.key] = one.value;
}
const r = await fetch(creds.UPSTASH_REDIS_REST_URL, { method: 'POST', headers: { Authorization: `Bearer ${creds.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(['GET', 'db/client-errors/log.json']) });
const d = await r.json() as any;
const items: any[] = JSON.parse(d.result ?? '[]');
writeFileSync('/tmp/client-errors.json', JSON.stringify(items, null, 1));
console.log('مدخلات:', items.length);
for (const e of items) {
  const t = e.lastSeen ?? e.time ?? e.ts ?? e.at ?? '';
  const when = typeof t === 'number' ? new Date(t).toISOString() : String(t);
  console.log('-', when, '| n=' + (e.count ?? 1), '|', String(e.message ?? e.msg ?? '').slice(0, 70), '|', String(e.source ?? '').slice(-45), '|', String(e.ua ?? '').slice(0, 28));
}
