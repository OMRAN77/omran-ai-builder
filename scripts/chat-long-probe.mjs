// مجس المحادثة: يرسل رسالة طويلة (عربي+إنجليزي+كود) لنقطة البثّ /api/ai?action=chat
// ويسجّل كل حدث SSE (status/delta/clientTool/error) + التوقيت — لكشف سبب «الرسالة
// الطويلة ما ترد». لا ينفّذ الأدوات (لا عميل)، لكن يكشف: هل الخادم يبثّ نصًّا؟
// يطلب أداة؟ يخطئ؟ يصمت؟
const BASE = process.env.PROBE_BASE || 'https://omran-ai-builder.vercel.app';

// رسالة تشبه ما لصقه المالك: شرح عربي + كود بايثون إنجليزي (يُكتشف كلغة أجنبية/أدوات).
const LONG = `شرح لي كيف تعمل نماذج الرؤية-اللغة بالتفصيل، وأعطني مثال كود عملي.
لتوليد نص يعتمد على صورة (مثل Gemini Nano أو نماذج الرؤية Vision-Language Models) تتم العملية عبر خطوات: معالجة الصورة عبر Vision Encoder مثل Vision Transformer، ثم الربط والمحاذاة Multimodal Alignment، ثم توليد النص Text Generation بناءً على الطلب. وهذا مثال عملي بلغة بايثون باستخدام Gemini API:

import google.generativeai as genai
from PIL import Image
genai.configure(api_key="YOUR_API_KEY")
model = genai.GenerativeModel('gemini-1.5-flash')
img = Image.open('image.jpg')
response = model.generate_content(["اشرح ما يوجد في هذه الصورة بالتفصيل:", img])
print(response.text)

اشرح لي كل سطر في هذا الكود، ووش الفرق بين التشغيل السحابي والتشغيل المحلي على الجهاز (Gemini Nano / Android AICore)، وأيهما أفضل لتطبيقي.`;

function guestId() { return 'probe-' + Math.random().toString(16).slice(2, 10); }

async function run() {
  const t0 = Date.now();
  const el = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';
  console.log('BASE=' + BASE + ' | msg length=' + LONG.length + ' chars @ ' + new Date().toISOString());
  let res;
  try {
    res = await fetch(BASE + '/api/ai?action=chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: LONG }],
        provider: 'claude',
        tz: 'Asia/Riyadh',
        guestId: guestId(),
      }),
    });
  } catch (e) { console.log('❌ fetch failed @' + el() + ': ' + e.message); return; }
  console.log('headers @' + el() + ' status=' + res.status + ' ok=' + res.ok);
  if (!res.ok || !res.body) { console.log('body: ' + (await res.text().catch(() => '')).slice(0, 200)); return; }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', firstDelta = null, deltaChars = 0, kaCount = 0, events = {}, err = null, sawTool = null, lastByte = t0;
  // حارس صلب: أقصى ١٠٠ث للمجس
  const HARD = setTimeout(() => { try { reader.cancel(); } catch (e) {} }, 100000);
  while (true) {
    let r;
    try { r = await reader.read(); } catch (e) { console.log('read error @' + el() + ': ' + e.message); break; }
    if (r.done) { console.log('STREAM DONE @' + el()); break; }
    lastByte = Date.now();
    const text = dec.decode(r.value, { stream: true });
    // عدّ نبضات الإبقاء (تعليقات SSE)
    kaCount += (text.match(/(^|\n):\s*ka/g) || []).length;
    buf += text;
    const lines = buf.split('\n'); buf = lines.pop();
    for (const line of lines) {
      if (line.indexOf('data: ') !== 0) continue;
      let ev; try { ev = JSON.parse(line.slice(6)); } catch (e) { continue; }
      const k = Object.keys(ev).join('+');
      events[k] = (events[k] || 0) + 1;
      if (ev.status) { /* حالة */ }
      if (ev.clientTool && !sawTool) { sawTool = ev.clientTool.name || JSON.stringify(ev.clientTool).slice(0, 60); console.log('🔧 clientTool @' + el() + ': ' + sawTool); }
      if (ev.delta) { if (firstDelta === null) { firstDelta = Date.now() - t0; console.log('✍️  first delta @' + el()); } deltaChars += ev.delta.length; }
      if (ev.error) { err = ev.error; console.log('⚠️ error event @' + el() + ': ' + String(ev.error).slice(0, 140)); }
      if (ev.done) console.log('✅ done event @' + el());
    }
  }
  clearTimeout(HARD);
  console.log('--- الخلاصة ---');
  console.log('firstDelta=' + (firstDelta === null ? 'NONE ❌' : (firstDelta / 1000).toFixed(1) + 's') +
    ' | deltaChars=' + deltaChars + ' | keepalive(:ka)=' + kaCount + ' | tool=' + (sawTool || 'none') + ' | error=' + (err || 'none'));
  console.log('eventKinds=' + JSON.stringify(events));
  console.log(deltaChars > 0 ? '✅ الخادم ردّ بنصّ' : '❌ الخادم ما ردّ بأي نصّ');
}
await run();
console.log('PROBE DONE');
