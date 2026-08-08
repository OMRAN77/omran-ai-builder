// «استوديو الإعلانات» — عقل المحادثة (Claude). يجمع بالحوار: نوع الإعلان
// والعنوان والمواصفات والسعر ورقم التواصل، ثم يُخرج سطر @@AD الذي تقرأه
// الواجهة (ad-studio.html) لتبني منه ثمانية تصاميم.
// حارسان قبل أي مفتاح: هويّة مُتحقَّقة (لا ضيوف) ثم سقف يوميّ لكل مستخدم.
const { checkAndConsumeCustom } = require('./_usage.js');
const { verifyPointsToken } = require('./points.js');

const DAILY = 30; // رسالة/يوم للمستخدم المسجَّل (المالك وVIP بلا حدّ)

const SYS = `أنت خبير إعلانات إماراتيّ محترف داخل «استوديو الإعلانات». تتكلّم عربيّة فصيحة قصيرة بنكهة خليجيّة مهذّبة.

أسلوبك ثابت في كلّ ردّ:
١. تعطي أوّلًا **فائدة حقيقيّة** — سطرين أو ثلاثة عن سبب نجاح أو فشل هذا النوع من الإعلانات تحديدًا (لا كلام عامّ، لا مجاملة).
٢. ثمّ تسأل **نقطتين بالضبط**، مرقّمتين، محدّدتين، لا أكثر.
لا تكرّر سؤالًا أُجيب عنه. لا تعتذر. لا تقل «بالتأكيد» ولا «رائع». لا تستعمل نجومًا للتنسيق.

مهمّتك جمع: نوع الإعلان · العنوان · المواصفات · السعر · رقم التواصل.
حين تكتمل هذه الخمسة (أو يقول المستخدم إنّه لا يريد ذكر واحدة)، اكتب ردًّا أخيرًا قصيرًا جدًّا (سطر واحد) ثمّ في **سطر منفصل أخير** هذا السطر بالضبط بلا أيّ شرح حوله:
@@AD{"cat":"...","title":"...","spec":"...","price":"...","unit":"...","tel":"...","kick":"...","chips":["...","...","..."],"facts":["...","..."],"place":"...","note":"..."}

قواعد سطر @@AD:
- cat واحدة من: car, flat, food, shop, clinic, salon, service, other
- title: عنوان الإعلان، ≤ ٣٢ حرفًا، جذّاب لا وصفيّ
- spec: سطر المواصفات، ≤ ١٠٠ حرف، النقاط مفصولة بـ ·
- price: الرقم فقط بالأرقام العربيّة الهنديّة مع فاصل ٬ (مثال: ٤٩٬٠٠٠). إن لم يُذكر سعر ضع ""
- unit: مثل «درهم» أو «درهم سنويًّا»
- tel: الرقم كما أعطاه المستخدم. إن لم يُذكر ضع ""
- kick: كلمتان فوق العنوان (مثال: «للبيع · دبي»)
- chips: ثلاث كلمات بيع قصيرة جدًّا من كلام المستخدم
- facts: حتّى ٨ تفاصيل قصيرة (كلّ واحدة ≤ ٢٦ حرفًا) مثل «الموديل: ٢٠٠٤» و«الممشى: ٢١٣٬٠٠٠ كم». إن لم تعرف ضع []
- place: مكان المعاينة أو الاستلام إن ذُكر، وإلّا ""
- note: سطر تنبيه واحد إن طلبه المستخدم (مثال: «أرجو عدم اتصال أصحاب المعارض»)، وإلّا ""
اكتب @@AD مرّة واحدة فقط في المحادثة كلّها، ولا تكتبه قبل أن تعرف نوع الإعلان وعنوانه على الأقلّ.`;

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') { res.status(405).end('{"error":"POST only"}'); return; }
  try {
    let b = req.body;
    if (typeof b === 'string') b = JSON.parse(b);
    b = b || {};

    // ① الهويّة قبل المفتاح — لا استدعاء مجهول من أيّ IP.
    const token = typeof b.token === 'string' ? b.token : '';
    const username = verifyPointsToken(token);
    if (!username) {
      res.status(401).end(JSON.stringify({ error: 'auth', message_ar: 'سجّل الدخول أوّلًا لاستخدام استوديو الإعلانات.' }));
      return;
    }
    // ② سقف يوميّ لكل مستخدم (المالك وVIP معفيان داخل الدالّة).
    const gate = await checkAndConsumeCustom(token, null, null, 'adchat', DAILY);
    if (!gate.allowed) {
      res.status(429).end(JSON.stringify({ error: 'limit', message_ar: 'بلغتَ حدّ اليوم (' + DAILY + ' رسالة) في استوديو الإعلانات. جرّب غدًا.' }));
      return;
    }

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) { res.status(500).end(JSON.stringify({ error: 'no key' })); return; }

    const msgs = (Array.isArray(b.messages) ? b.messages : [])
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-16)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 1200) }));
    while (msgs.length && msgs[msgs.length - 1].role !== 'user') msgs.pop();
    if (!msgs.length) { res.status(400).end(JSON.stringify({ error: 'empty' })); return; }

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 700, system: SYS, messages: msgs }),
    });
    const j = await r.json();
    if (!r.ok) { res.status(502).end(JSON.stringify({ error: (j && j.error && j.error.message) || 'upstream' })); return; }
    const text = (j.content || []).filter((p) => p && p.type === 'text').map((p) => p.text).join('').trim();
    res.status(200).end(JSON.stringify({ text, remaining: Number.isFinite(gate.remaining) ? gate.remaining : null }));
  } catch (e) {
    res.status(500).end(JSON.stringify({ error: String((e && e.message) || e) }));
  }
};
