// اختبار «الدوام»: يقارن معاينة بالإنتاج على نقطة الاستئناف، بلا استهلاك حصّة.
const BASES = { PROD: 'https://omran-ai-builder.vercel.app', PREVIEW: process.argv[2] || '' };
async function post(url: string, body: unknown) {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return `${r.status} ${(await r.text()).slice(0, 140).replace(/\s+/g, ' ')}`;
  } catch (e: any) { return 'ERR ' + e.message; }
}
for (const [label, base] of Object.entries(BASES)) {
  if (!base) continue;
  console.log(`\n──── ${label} ────`);
  console.log('T1 استئناف بلا رمز        :', await post(base + '/api/ai?action=agent', { runState: true }));
  console.log('T2 استئناف برمز مزوّر     :', await post(base + '/api/ai?action=agent', { runState: true, token: 'ZmFrZQ.c2ln' }));
  console.log('T3 استئناف برمز فارغ      :', await post(base + '/api/ai?action=agent', { runState: true, token: '' }));
  console.log('T4 نداء عادي بلا رسائل    :', await post(base + '/api/ai?action=agent', {}));
  console.log('T5 قفل نتيجة الأداة (يوم١):', await post(base + '/api/agent-tool-result', { id: 'c' + Math.random().toString(36).slice(2, 10), output: 'x' }));
}
