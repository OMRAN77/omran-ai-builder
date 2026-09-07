// مِجسّ «النصّ الطويل ما يرد» بشكل الطلب الحقيقيّ للتطبيق: يرسل رسائل system
// (كتاب القواعد + قاعدة الموضوع + ملاحظة النصّ الملصوق) ثمّ رسالة المستخدم —
// تمامًا كما يبنيها callChatWithTools — ويقيس هل يردّ الخادم نصًّا أم يصمت.
// كما يجرّب سيناريو «محادثة فيها ردّ سابق» ليكشف إن غيّر التاريخُ سلوك الخادم.
const BASE = process.env.PROBE_BASE || 'https://omran-ai-builder.vercel.app';
const rnd = Math.random().toString(16).slice(2, 8);
const USER = 'zzfull' + rnd;

const NOAH = `تاريخ النبوة والرسالة يحتوي على محطات فاصلة في تاريخ البشرية، وتعتبر قصة نبي الله نوح عليه السلام—شيخ الأنبياء وأول رسل الله إلى أهل الأرض—من أكثر القصص ملحمية، إذ تمثل نقطة التحول الكبرى بين عالم قديم غرق في الشرك وعالم جديد بني على التوحيد.
بداية الانحراف والشرك في الأرض
 * عاش الناس قروناً طويلة بعد آدم عليه السلام على التوحيد، حتى مات رجال صالحون منهم.
 * وسوس الشيطان للقوم أن يصنعوا تماثيل للصالحين ليذكروا عباداتهم.
 * مرّت الأجيال ومات العارفون، فنسي القوم الغاية من التماثيل وعبدوا الأصنام من دون الله.
بعثة نوح عليه السلام ودعوته
 * اختار الله تعالى نوحاً عليه السلام ليحمل رسالة التوحيد، ويعيد الناس إلى عبادة الله وحده.
 * صبر نوح على دعوة قومه تسعمائة وخمسين سنة متواصلة دون كتمان.
الأمر ببناء السفينة
 * أمره الله ببناء سفينة ضخمة في مكان صحراوي بعيد عن الماء.
 * استمر نوح في جمع الخشب وصنع السفينة بدقة، متوكلاً على أمر ربه.
حلول الطوفان العظيم
 * جاءت علامة بداية العذاب بفوران التنور خروج الماء بكثرة من منازلهم.
 * ارتفعت أمواج البحر كالجبال، وعمّ الماء الأرض حتى غطى رؤوس الجبال.
استقرار السفينة
 * استقرت السفينة على جبل الجودي، وقيل بعداً للقوم الظالمين.
 * أصبحت ذريته هم الباقين في الأرض، وسمي نوح "الأب الثاني للبشرية".`;

// نُقلّد رسائل النظام التي يحقنها العميل (نصّها المختصر يكفي للسلوك):
const SYS = 'أنت مساعد ذكي في تطبيق Omran AI من فريق عمران AI.';
const TOPIC = 'قاعدة الموضوع (أولوية قصوى): أجب عن رسالة المستخدم الأخيرة وحدها.';
const PASTED = 'رسالة المستخدم الأخيرة نصٌّ ملصوق (تقرير أو رسالة أو سجل أخطاء) وليست طلب بناء. حلّله بلغة المستخدم. ممنوع بناء أي كود.';

async function signup() {
  const r = await fetch(BASE + '/api/account?action=auth', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'signup', username: USER, password: 'Pp1!' + rnd + rnd, lang: 'ar' }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.token) throw new Error('signup failed: ' + r.status);
  return j.token;
}

async function runOnce(label, messages, token) {
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(BASE + '/api/ai?action=chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, provider: 'claude', tz: 'Asia/Riyadh', token, guestId: '' }),
    });
  } catch (e) { console.log(`\n[${label}] fetch فشل:`, e.message); return; }
  console.log(`\n[${label}] HTTP ${res.status} · أوّل بايت ${Date.now() - t0}ms`);
  if (!res.body) { console.log(`[${label}] لا جسم`); return; }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', full = '', err = null, sawImg = false;
  const kinds = {};
  while (true) {
    let c; try { c = await reader.read(); } catch (e) { console.log(`[${label}] read فشل:`, e.message); break; }
    if (c.done) break;
    buf += dec.decode(c.value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      let ev; try { ev = JSON.parse(line.slice(6)); } catch (e) { continue; }
      for (const k of Object.keys(ev)) kinds[k] = (kinds[k] || 0) + 1;
      if (ev.delta) full += ev.delta;
      if (ev.clientTool && /image/i.test(ev.clientTool.name || '')) sawImg = true;
      if (ev.error) err = ev.error;
    }
    if (Date.now() - t0 > 90000) { console.log(`[${label}] ⏱️ تجاوز 90ث`); break; }
  }
  console.log(`[${label}] أحداث: ${JSON.stringify(kinds)}`);
  console.log(`[${label}] خطأ خادم: ${err || 'لا'} · طلب صورة: ${sawImg ? '⚠️ نعم' : 'لا'}`);
  const hasCode = /```html|<!doctype|<html[\s>]/i.test(full);
  const textOnly = full.replace(/```[\s\S]*?```/g, '').trim();
  console.log(`[${label}] طول الردّ: ${full.length} حرف · نصّ بلا كود: ${textOnly.length} · كتلة كود: ${hasCode ? '⚠️ نعم (يروح للمعاينة لا المحادثة)' : 'لا'} · الزمن ${Date.now() - t0}ms`);
  console.log(`[${label}] عيّنة: ${full.slice(0, 120).replace(/\n/g, ' ⏎ ') || '(فارغ — لا ردّ)'}`);
  if (!full.trim()) console.log(`[${label}] ✗✗ ردّ فارغ — هذا هو «مافي أي رد»`);
  else if (hasCode && textOnly.length < 40) console.log(`[${label}] ✗✗ كود فقط بلا نصّ محادثة — يبدو «مافي أي رد» لأنّ الكود يروح للمعاينة`);
  else console.log(`[${label}] ✓ وصل ردّ نصّي في فقاعة المحادثة`);
}

const token = await signup();
console.log('القاعدة:', BASE, '· طول نوح:', NOAH.length);

// السيناريو ١: رسالة أولى (لا تاريخ) — مثل أوّل لصق في محادثة جديدة.
await runOnce('جديدة', [
  { role: 'system', content: SYS },
  { role: 'system', content: TOPIC },
  { role: 'system', content: PASTED },
  { role: 'user', content: NOAH },
], token);

// السيناريو ٢: محادثة فيها ردّ سابق ثمّ لصق نوح — مثل جهاز المالك بعد اختبارات.
await runOnce('بتاريخ', [
  { role: 'system', content: SYS },
  { role: 'user', content: 'مرحبا' },
  { role: 'assistant', content: 'هلا وغلا! كيف أقدر أساعدك اليوم؟' },
  { role: 'system', content: TOPIC },
  { role: 'system', content: PASTED },
  { role: 'user', content: NOAH },
], token);

// السيناريو ٣: يعيد إنتاج الخطأ — نُمرّر قاعدة الملصق (كما كان العميل يفعل حين
// طابقت «دعوة» __dsnRe) بلا ملاحظة «حلّل»، ونقيس: هل يردّ الخادم بكتلة كود ```html
// (ملصق) بدل نصّ؟ إن نعم، تأكّد أنّ سبب «مافي أي رد» هو توجيه الكود للمعاينة.
// نستخرج قاعدة الملصق الحقيقيّة كاملةً من المصدر (لا نسخة مختصرة) لنعيد إنتاج
// ما كان العميل يرسله فعلًا حين طابقت «دعوة» __dsnRe — الاختبار الحاسم.
import { readFileSync } from 'node:fs';
let REAL_POSTER = '';
try {
  const src = readFileSync(new URL('../js/app-06-checkout.js', import.meta.url), 'utf8');
  const m = src.match(/const DESIGN_POSTER_RULE = '([\s\S]*?)';\n/);
  if (m) REAL_POSTER = m[1].replace(/\\n/g, '\n').replace(/\\'/g, "'");
} catch (e) { console.log('تعذّر استخراج القاعدة:', e.message); }
console.log('\nطول قاعدة الملصق الحقيقيّة المُستخرجة:', REAL_POSTER.length, 'حرف');
await runOnce('ملصق-الخطأ (القاعدة الكاملة)', [
  { role: 'system', content: SYS + '\n' + REAL_POSTER },
  { role: 'user', content: NOAH },
], token);
