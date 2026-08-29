// مجس التعليم: يوقّت فتح الصفحة (list) والحفظ والجلب على الإنتاج — تشخيص شكوى البطء.
const BASE = process.env.PROBE_BASE || 'https://omran-ai-builder.vercel.app';
const rnd = Math.random().toString(16).slice(2, 8);

const su = await fetch(BASE + '/api/account?action=auth', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'signup', username: 'zzcheck' + rnd, password: 'Pp1!' + rnd + rnd, lang: 'ar' }),
});
const sj = await su.json().catch(() => ({}));
if (!sj.token) { console.log('signup failed', su.status); process.exit(1); }
console.log('account ready');

async function timed(label, body) {
  const t0 = Date.now();
  try {
    const r = await fetch(BASE + '/api/edu', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, token: sj.token }),
    });
    const j = await r.json().catch(() => ({}));
    console.log(label + ': status=' + r.status + ' ' + (Date.now() - t0) + 'ms' + (j.error ? ' error=' + String(j.error).slice(0, 60) : ''));
    return j;
  } catch (e) { console.log(label + ': FAIL ' + String(e.message).slice(0, 80)); return {}; }
}

await timed('LIST بارد (0 درس)', { action: 'list' });
await timed('LIST ثاني (دافئ)', { action: 'list' });

// احفظ 5 دروس بحجم واقعي (ملخص ~20KB) ثم قس LIST من جديد
const bigSummary = ('## فصل\n\nشرح تفصيلي للدرس مع أمثلة وتمارين محلولة. '.repeat(400)).slice(0, 20000);
for (let i = 1; i <= 5; i++) {
  await timed('SAVE درس ' + i, { action: 'save', lesson: { title: 'درس تجريبي ' + i, subject: 'رياضيات', summary: bigSummary, flashcards: Array.from({ length: 20 }, (_, k) => ({ q: 'سؤال ' + k, a: 'جواب ' + k })), quiz: Array.from({ length: 12 }, (_, k) => ({ q: 'اختبار ' + k, opts: ['أ', 'ب', 'ج', 'د'], c: 0 })) } });
}
const l5 = await timed('LIST مع 5 دروس (فتح الصفحة)', { action: 'list' });
const firstId = l5 && l5.lessons && l5.lessons[0] && l5.lessons[0].id;
if (firstId) await timed('GET درس واحد', { action: 'get', id: firstId });
await timed('LIST أخير', { action: 'list' });
console.log('PROBE DONE');
