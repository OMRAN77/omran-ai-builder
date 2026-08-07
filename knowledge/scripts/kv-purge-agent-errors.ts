// يمحو مدخلات الوكيل وحدها من سجل أخطاء العميل — انتقائيًّا، دون لمس حوادث المنتج.
// واجهة التطبيق لا تدعم إلا المحو الكامل (writeLog([])) لذا نكتب في المخزن مباشرة.
// الأسرار تُقرأ من Vercel وقت التشغيل ولا تُكتب في أيّ ملف.
// الاستخدام:  bun scripts/kv-purge-agent-errors.ts [--apply]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const KEY = 'db/client-errors/log.json';
const OUT = '/tasklet/agent/home/audit/errors';
// ua الذي يخصّني: وسم tasklet، أو متصفّح المِسبار بلا رأس (X11 Linux — لا يستعمله عمران ولا مستخدم حقيقيّ)
const AGENT_UA = /^tasklet|X11;\s*Linux x86_64/i;
const AGENT_SRC = /^(agent-verify|tasklet-probe)$/i; // مصادر مِسباري
const AGENT_HOST = /-omran4\.vercel\.app/;            // نشرات معاينة — لا يزورها إلا أنا وعمران

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

// ① أسرار Upstash من Vercel (نقطة المعرّف وحدها تفكّ التشفير)
const list = await (await fetch(
  `https://api.vercel.com/v9/projects/${vc.VERCEL_PROJECT}/env?teamId=${vc.VERCEL_TEAM}`,
  { headers: vh })).json() as any;
const creds: Record<string, string> = {};
for (const e of list.envs ?? []) {
  if (!/^UPSTASH_REDIS_REST_(URL|TOKEN)$/.test(e.key)) continue;
  const one = await (await fetch(
    `https://api.vercel.com/v9/projects/${vc.VERCEL_PROJECT}/env/${e.id}?teamId=${vc.VERCEL_TEAM}&decrypt=true`,
    { headers: vh })).json() as any;
  creds[e.key] = one.value;
}
const URL_ = creds.UPSTASH_REDIS_REST_URL, TOK = creds.UPSTASH_REDIS_REST_TOKEN;
if (!URL_ || !TOK) throw new Error('تعذّر فكّ أسرار Upstash');

async function redis(args: (string | number)[]) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOK}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const d = await r.json() as any;
  if (!r.ok || d?.error) throw new Error(`redis: ${d?.error ?? r.status}`);
  return d.result;
}

// ② القراءة + النسخ الاحتياطيّ قبل أيّ كتابة
const raw = await redis(['GET', KEY]) as string | null;
if (raw == null) throw new Error('المفتاح غير موجود');
mkdirSync(OUT, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const bk = `${OUT}/kv-backup-${stamp}.json`;
writeFileSync(bk, raw);

const items: any[] = JSON.parse(raw);
const mine = items.filter(e => AGENT_UA.test(e.ua ?? '') || AGENT_SRC.test(e.source ?? '') || AGENT_HOST.test(e.source ?? ''));
const keep = items.filter(e => !mine.includes(e));
const sum = (a: any[]) => a.reduce((n, e) => n + (e.count ?? 1), 0);

console.log(`نسخة احتياطيّة: ${bk}`);
console.log(`قبل : ${items.length} مدخلًا / ${sum(items)} حادثة`);
console.log(`لي  : ${mine.length} مدخلًا / ${sum(mine)}  →  ${mine.map(e => (e.ua ?? '') + ':' + (e.source ?? '')).join(' | ')}`);
console.log(`بعد : ${keep.length} مدخلًا / ${sum(keep)} حادثة`);

if (!APPLY) { console.log('— تجربة جافّة. أضف --apply للتنفيذ.'); process.exit(0); }
if (mine.length === 0) { console.log('لا شيء يُمحى.'); process.exit(0); }

// ③ الكتابة ثمّ التحقّق: الحوادث المحفوظة يجب أن تبقى مطابقةً حرفًا بحرف
await redis(['SET', KEY, JSON.stringify(keep)]);
const after = JSON.parse(await redis(['GET', KEY]) as string);
const same = JSON.stringify(after) === JSON.stringify(keep);
console.log(`تحقّق: ${after.length} مدخلًا / ${sum(after)} حادثة — مطابقة تامّة: ${same ? 'نعم' : 'لا'}`);
if (!same) { console.log(`⚠ استرجع من ${bk}`); process.exit(1); }
