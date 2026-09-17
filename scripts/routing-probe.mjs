#!/usr/bin/env node
// scripts/routing-probe.mjs — يتتبّع أيّ فرع يأخذه الطلب فعلًا، فيثبت أنّ
// knowledge/ROUTING.md تصف السلوك الحيّ لا قراءة الكود وحدها.
//
// الاستعمال: node scripts/routing-probe.mjs
// بلا شبكة وبلا مفاتيح حقيقيّة: نستدعي الدوالّ المصدَّرة من api/ai.js مباشرة
// (__resolveMode · __injectNote · __stripAppSystem) ونقرأ ما كُتب في جسم الطلب.

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'probe-secret-' + 'x'.repeat(40);
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ai = require('../api/ai.js');
const tier = require('../api/_lib/tier.js');

const out = [];
const rec = (name, expected, actual) =>
  out.push({ حالة: name, المتوقّع: expected, الفعليّ: actual, مطابق: expected === actual });

// ── §٢-أ: resolveMode ──
rec('مستخدم عاديّ بلا mode', 'balanced', ai.__resolveMode({}));
rec('المالك (__ownerFactory)', 'factory', ai.__resolveMode({ __ownerFactory: true }));
rec('mode صريح يتقدّم على المالك', 'balanced', ai.__resolveMode({ __ownerFactory: true, mode: 'balanced' }));
rec("minimal يُقنَّن إلى balanced", 'balanced', ai.__resolveMode({ mode: 'minimal' }));
rec('mode مجهول يسقط للافتراضيّ', 'balanced', ai.__resolveMode({ mode: 'nonsense' }));

// ── §٢: stripAppSystem ينزع طبقة التطبيق للمالك ──
const b1 = { messages: [{ role: 'system', content: 'طبقة التطبيق' }, { role: 'user', content: 'هلا' }] };
ai.__stripAppSystem('claude', b1);
rec('stripAppSystem يحذف رسائل system', 1, b1.messages.length);

// ── §٢-أ: factory لغير المالك = لا حقن إطلاقًا ──
const b2 = { mode: 'factory', system: '', messages: [{ role: 'user', content: 'هلا' }] };
ai.__injectNote('claude', b2, 'AE');
rec('factory لغير المالك: لا حقن', '', String(b2.system || ''));

// ── §٢-أ: factory للمالك = سطر الصراحة وحده ──
const b3 = { mode: 'factory', __ownerFactory: true, system: '', messages: [{ role: 'user', content: 'هلا' }] };
ai.__injectNote('claude', b3, 'AE');
const ownerOnly = String(b3.system || '');
rec('factory للمالك: سطر الصراحة فقط', true, ownerOnly.includes('تعليمات المالك') && ownerOnly.length < 600);

// ── §٢-أ: balanced يحقن الطبقة كاملة ──
const b4 = { mode: 'balanced', system: '', messages: [{ role: 'user', content: 'وش أخبار السوق اليوم؟' }] };
ai.__injectNote('claude', b4, 'AE');
const balanced = String(b4.system || '');
rec('balanced يحقن طبقة أكبر بكثير', true, balanced.length > ownerOnly.length * 3);
rec('balanced يحمل كتلة النبرة (tone.js)', true, /مطابقة الأسلوب/.test(balanced));

// ── §١: مسار chat لا يمرّ بـinjectNote أصلًا (أساس §٦) ──
// injectNote لا يُستدعى إلّا لأعضاء PROVIDERS داخل المعالج؛ نثبت هنا أنّ
// استدعاءه بـ'chat' لا يكتب في حقل النظام الذي يقرأه chat.js.
const b5 = { system: '', messages: [{ role: 'user', content: 'هلا' }] };
ai.__injectNote('chat', b5, 'AE');
rec('injectNote("chat") لا يكتب body.system', '', String(b5.system || ''));

// ── §٣-ب: resolveTier ──
const t = async () => {
  rec('بلا اسم → ضيف', 'guest', (await tier.resolveTier(null)).tier);
  const g = await tier.resolveTier(null);
  rec('الضيف غير مشترك (freeLane)', false, g.subscriber);
  const o = await tier.resolveTier('omran', { noCache: true });
  rec('المالك مشترك بلا سقف', true, o.subscriber && o.cap === Infinity);

  // ── §٣-ب: حارس المزوّد المدفوع ──
  rec('claude مزوّد مدفوع', true, tier.isPaidProvider('claude'));
  rec('gemini ليس مدفوعًا', false, tier.isPaidProvider('gemini'));

  // ── §٤: ترتيب السلسلة المجانيّة ومزوّد بلا مفتاح يُستبعد ──
  const chain = tier.freeChain({ GEMINI_API_KEY: 'k', GROQ_API_KEY: 'k' });
  rec('السلسلة تتبع DEFAULT_CHAIN وتستبعد بلا مفتاح', 'gemini,groq', chain.map((c) => c.id).join(','));
  const custom = tier.freeChain({ FREE_CHAIN: 'groq,gemini', GEMINI_API_KEY: 'k', GROQ_API_KEY: 'k' });
  rec('FREE_CHAIN من البيئة يعيد الترتيب', 'groq,gemini', custom.map((c) => c.id).join(','));
  rec('بلا أيّ مفتاح → سلسلة فارغة', 0, tier.freeChain({}).length);

  const bad = out.filter((r) => !r.مطابق);
  console.log(JSON.stringify({ فحوص: out.length, فشل: bad.length, التفاصيل: out }, null, 1));
  if (bad.length) { console.error('✗ الخريطة لا تطابق السلوك الحيّ في ' + bad.length + ' نقطة'); process.exit(1); }
  console.log('✓ routing-probe: ' + out.length + ' نقطة قرار تطابق knowledge/ROUTING.md');
};
t();
