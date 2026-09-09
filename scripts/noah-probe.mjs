// مِجسّ نصّ نوح — يرسل النصّ الدينيّ ويلتقط كلّ حدث من الخادم لكشف مصدر الصورة:
// هل يرسل الخادم حدث clientTool (generate_image) أم نصًّا فقط؟ يطبع أنواع الأحداث.
const BASE = process.env.PROBE_BASE || 'https://omran-ai-builder.vercel.app';
const rnd = Math.random().toString(16).slice(2, 8);
const USER = 'zznoah' + rnd;

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

async function signup() {
  const r = await fetch(BASE + '/api/account?action=auth', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'signup', username: USER, password: 'Pp1!' + rnd + rnd, lang: 'ar' }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.token) throw new Error('signup failed: ' + r.status);
  return j.token;
}

const token = await signup();
console.log('طول نصّ نوح:', NOAH.length, '· أسطر:', NOAH.split('\n').length);
console.log('القاعدة:', BASE, '\n');

const t0 = Date.now();
const res = await fetch(BASE + '/api/ai?action=chat', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ messages: [{ role: 'user', content: NOAH }], provider: 'claude', token }),
});
console.log('HTTP', res.status, '· أوّل بايت', Date.now() - t0, 'ms\n');

const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = '', full = '';
const eventTypes = {};
const statuses = [];
let sawClientTool = null, sawImageTool = false;

while (true) {
  const c = await reader.read();
  if (c.done) break;
  buf += dec.decode(c.value, { stream: true });
  const lines = buf.split('\n');
  buf = lines.pop();
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    let ev; try { ev = JSON.parse(line.slice(6)); } catch (e) { continue; }
    for (const k of Object.keys(ev)) eventTypes[k] = (eventTypes[k] || 0) + 1;
    if (ev.status) statuses.push(String(ev.status).slice(0, 50));
    if (ev.delta) full += ev.delta;
    if (ev.clientTool) { sawClientTool = ev.clientTool.name || 'unknown'; if (/image/i.test(ev.clientTool.name || '')) sawImageTool = true; }
  }
  if (Date.now() - t0 > 90000) break;
}

console.log('─── النتيجة ───');
console.log('أنواع الأحداث المُستلمة:', JSON.stringify(eventTypes));
console.log('الحالات:', statuses.join(' | ') || '(لا شيء)');
console.log('حدث clientTool (طلب أداة من المتصفّح):', sawClientTool || 'لا يوجد');
console.log('طلب توليد/تعديل صورة من الخادم؟', sawImageTool ? '⚠️ نعم — الخادم طلب صورة' : '✓ لا — نصّ فقط');
console.log('طول الردّ النصّي:', full.length, 'حرف');
console.log('عيّنة:', full.slice(0, 160).replace(/\n/g, ' ⏎ '));
if (sawImageTool) { console.log('\n✗ الخادم/النموذج طلب صورة رغم النصّ الدينيّ — القاعدة لم تُطبَّق أو الأدوات مفعّلة'); process.exit(1); }
console.log('\n✓ الخادم ردّ نصًّا فقط بلا طلب صورة — أي صورة تظهر فمصدرها العميل لا الخادم');
