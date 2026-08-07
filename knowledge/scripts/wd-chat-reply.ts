import { invokeTool } from '@tasklet/tools/v2';

const body = `هلا وغلا بعمران 👋

فحصتُ مواقعك السبعة الآن — **كلها حيّة وسريعة** ✅
أسرعها tarjiman-live (٥٧ مللي) وأبطأها omran-ai-builder (٣٠٣ مللي) — والكل ضمن الطبيعي.

وعندك **٣ اقتراحات تنتظر قرارك** في تبويب «الموافقات»، وأخطرها الأول: مفتاح المراقبة MONITOR_KEY مكشوف في مستودع عام. إصلاحه ٦ أسطر فقط.

اضغط عليه، واقرأ الخطة، ثم **موافق** — وأنفّذه فورًا في فرع منفصل، ولن ألمس main إطلاقًا.`;

const now = new Date().toISOString();
const q = `INSERT INTO wd_chat (created_at, role, body, handled) VALUES ('${now}', 'assistant', '${body.replace(/'/g, "''")}', 1)`;
let r = await invokeTool({ toolName: 'run_agent_memory_sql', args: { query: q } });
console.log('insert ok:', r.ok, r.ok ? '' : r.error);
r = await invokeTool({ toolName: 'run_agent_memory_sql', args: { query: `UPDATE wd_chat SET handled = 1 WHERE role = 'user' AND handled = 0` } });
console.log('mark ok:', r.ok, r.ok ? '' : r.error);
