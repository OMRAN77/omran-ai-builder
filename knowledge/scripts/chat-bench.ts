// chat-bench.ts — يقيس جودة المحادثة على الموقع الحيّ.
// الاستعمال:
//   bun chat-bench.ts <action> <label> [base]
//     action: claude | chat
//     label : اسم ملف النتيجة
//     base  : https://omran-ai-builder.vercel.app (افتراضي)
// يحفظ: /tasklet/agent/home/audit/chat/bench-<label>.json
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const action = process.argv[2] || 'claude';
const label = process.argv[3] || action;
const base = process.argv[4] || 'https://omran-ai-builder.vercel.app';
const DIR = '/tasklet/agent/home/audit/chat';
mkdirSync(DIR, { recursive: true });

type Case = { id: number; need: string; q: string };
const cases: Case[] = JSON.parse(readFileSync(DIR + '/bench-cases.json', 'utf8'));

const guestId = 'bench_' + Math.random().toString(36).slice(2, 10);

// يحاكي ما يفعله متصفّح المستخدم: ينفّذ الكود ويعيد ناتجه إلى الخادم.
function serveClientTool(baseUrl: string, ct: any) {
  (async () => {
    let out = '';
    try {
      const logs: string[] = [];
      const orig = console.log;
      console.log = (...a: any[]) => logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
      try {
        const r = new Function(String(ct.input?.code || ''))();
        if (r !== undefined) logs.push(String(r));
      } finally { console.log = orig; }
      out = logs.join('\n') || '(لا مخرجات)';
    } catch (e: any) { out = '✗ خطأ: ' + (e?.message || e); }
    try {
      await fetch(baseUrl + '/api/agent-tool-result', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ct.id, output: out.slice(0, 4000) }),
      });
    } catch { /* الخادم سيبلغ عن عدم الاستجابة */ }
  })();
}

async function ask(c: Case) {
  const url = `${base}/api/ai?action=${action}`;
  const body =
    action === 'agent' || action === 'chat'
      ? { messages: [{ role: 'user', content: c.q }], guestId, projId: 'bench' }
      : { messages: [{ role: 'user', content: c.q }], stream: false, guestId };

  const t0 = Date.now();
  let text = '';
  const trail: string[] = [];
  let httpStatus = 0;
  let err = '';

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(process.env.BENCH_IP ? { 'x-forwarded-for': process.env.BENCH_IP } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180000),
    });
    httpStatus = r.status;
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('event-stream')) {
      const reader = (r.body as any).getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let ev: any;
          try { ev = JSON.parse(line.slice(6)); } catch { continue; }
          if (ev.delta) text += ev.delta;
          if (ev.status) trail.push(String(ev.status));
          if (ev.clientTool) { trail.push('CLIENT_TOOL:' + ev.clientTool.name); serveClientTool(base, ev.clientTool); }
          if (ev.error) err = String(ev.error).slice(0, 300);
        }
      }
    } else {
      const raw = await r.text();
      try {
        const d = JSON.parse(raw);
        if (d.error) err = String(d.error).slice(0, 300);
        text = Array.isArray(d.content)
          ? d.content.filter((x: any) => x.type === 'text').map((x: any) => x.text).join('\n')
          : (d.choices?.[0]?.message?.content || d.text || raw.slice(0, 2000));
      } catch { text = raw.slice(0, 2000); }
    }
  } catch (e: any) {
    err = String(e?.message || e).slice(0, 300);
  }

  return { id: c.id, need: c.need, q: c.q, ms: Date.now() - t0, httpStatus, err, trail, answer: text.slice(0, 4000) };
}

const out: any[] = [];
for (const c of cases) {
  const r = await ask(c);
  out.push(r);
  console.log(`#${r.id} [${r.need}] ${r.httpStatus} ${r.ms}ms tools=${r.trail.length} ${r.err ? 'ERR:' + r.err.slice(0, 60) : 'chars=' + r.answer.length}`);
}
const path = `${DIR}/bench-${label}.json`;
writeFileSync(path, JSON.stringify({ action, base, at: new Date().toISOString(), results: out }, null, 2));
console.log('\nsaved → ' + path);
