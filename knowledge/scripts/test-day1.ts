// اختبار حزمة يوم ١: يقارن معاينة بالإنتاج على ثلاث نقاط، بلا استهلاك حصّة.
const BASES = {
  PROD: 'https://omran-ai-builder.vercel.app',
  PREVIEW: process.argv[2] || '',
};
const fakeId = 'c' + Math.random().toString(36).slice(2, 10);

async function post(url: string, body: unknown) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const t = (await r.text()).slice(0, 160).replace(/\s+/g, ' ');
    return `${r.status} ${t}`;
  } catch (e: any) { return 'ERR ' + e.message; }
}

for (const [label, base] of Object.entries(BASES)) {
  if (!base) continue;
  console.log(`\n──── ${label} ────`);
  console.log('T1 قفل نقطة النتيجة (معرّف مزوّر):');
  console.log('   ', await post(base + '/api/agent-tool-result', { id: fakeId, output: 'حشو من غريب' }));
  console.log('T2 تحميل وحدة الوكيل (بلا رسائل، لا يستهلك حصّة):');
  console.log('   ', await post(base + '/api/ai?action=agent', {}));
  console.log('T3 تحميل وحدة الذاكرة (عملية مجهولة):');
  console.log('   ', await post(base + '/api/system?action=memory', { op: 'nope' }));
}
