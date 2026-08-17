// api/_lib/_pack.js — ترتيب ملفّات الأرشيف بالأهمّيّة، ثمّ تعبئتها في ميزانيّة.
//
// العطب الذي وُجدت هذه الوحدة من أجله، مقيسًا على هذا المستودع نفسه:
// المنطق القديم يقرأ بترتيب ورود الملفّات في الأرشيف ثمّ يقصّ عند ١٢٠ ملفًّا.
// فعند رفع omran-ai-builder.zip كان `api/_lib/chat.js` رقم ١٢٨ ⇒ لا يصل
// النموذج أبدًا، بينما `app.bundle.js` (١.٣ م.ب، مولَّد) رقم ٢ ⇒ يبتلع
// ميزانيّة الـ٣٠٠ ألف حرف كلّها. النتيجة: المستخدم يرفع مشروعه فيقرأ التطبيق
// ناتجًا آليًّا ويتجاهل المصدر.
//
// ثلاث دوالّ خالصة، بلا شبكة ولا تابع — لتُختبَر وحدها (tests/pack.test.cjs).

'use strict';

// ما لا يُقرأ أبدًا: مجلّدات مولَّدة أو مستوردة.
const SKIP_DIR = /(^|\/)(node_modules|\.git|dist|build|out|coverage|vendor|\.next|\.nuxt|\.venv|__pycache__|__MACOSX|\.idea|\.vscode)\//;

// ناتج آليّ يحمل امتداد مصدر. أعلى سبب لهدر الميزانيّة.
const GENERATED = /(\.min\.(js|css)$|\.bundle\.js$|-lock\.json$|\.map$|\.d\.ts$)/i;

// وزن الامتداد: المصدر أوّلًا، ثمّ الإعداد، ثمّ البيانات.
const EXT_WEIGHT = [
  [/\.(js|jsx|ts|tsx|mjs|cjs|py|rb|php|java|go|rs|swift|kt|c|cpp|h|hpp|cs|vue|svelte)$/i, 100],
  [/\.(html?|css|scss|less)$/i, 80],
  [/\.(json|ya?ml|toml|ini|conf|env|sql|sh|bash)$/i, 60],
  [/\.(md|markdown|txt|csv|xml)$/i, 40],
];

// أسماء تُعرّف المشروع: من يقرؤها أوّلًا يفهم البقيّة.
const ENTRY = /(^|\/)(readme|package\.json|index|main|app|server|route|schema|config|vercel\.json|dockerfile|makefile)/i;

// شيفرة صحيحة لكنّها ليست المطلوب حين يُسأل «ما هذا المشروع».
const SECONDARY = /(^|\/)(tests?|__tests__|spec|fixtures?|examples?|docs?|locales?|i18n|migrations?)\//i;
const IS_TEST_FILE = /\.(test|spec)\.[a-z]+$/i;

function extWeight(name) {
  for (const [re, w] of EXT_WEIGHT) if (re.test(name)) return w;
  return 0;
}

/** كلمات السؤال التي تستحقّ المطابقة — الأقصر منها ضجيج. */
function queryTerms(query) {
  return String(query || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}_.-]+/u)
    .filter((t) => t.length >= 3)
    .slice(0, 12);
}

/**
 * يعطي كلّ ملفّ درجةً. الأعلى يُقرأ أوّلًا.
 * files: [{ name, size }]  ·  query: سؤال المستخدم إن وُجد.
 * يُرجع نفس المصفوفة مرتّبةً، وكلّ عنصر معه { score, skip }.
 */
function rankFiles(files, query) {
  const terms = queryTerms(query);
  const scored = (files || []).map((f) => {
    const name = String(f.name || '');
    const size = Number(f.size) || 0;
    const lower = name.toLowerCase();

    if (SKIP_DIR.test(name)) return { name, size, score: -1, skip: 'مجلّد مولَّد أو مستورد' };
    const w = extWeight(name);
    if (!w) return { name, size, score: -1, skip: 'ليس ملفًّا نصّيًّا' };
    if (GENERATED.test(name)) return { name, size, score: -1, skip: 'ناتج آليّ' };
    if (size === 0) return { name, size, score: -1, skip: 'فارغ' };

    let score = w;

    // عمق المسار: الجذر يعرّف المشروع، والعمق تفصيل.
    score -= Math.min(30, (name.split('/').length - 1) * 6);

    if (ENTRY.test(lower)) score += 45;
    if (SECONDARY.test(lower) || IS_TEST_FILE.test(lower)) score -= 35;

    // مطابقة السؤال تعلو على كلّ شيء: من يسأل عن «auth» يريد auth.js
    // ولو كان عميقًا. المطابقة في اسم الملفّ أقوى منها في المسار.
    if (terms.length) {
      const base = lower.split('/').pop();
      let hits = 0;
      for (const t of terms) {
        if (base.includes(t)) hits += 2;
        else if (lower.includes(t)) hits += 1;
      }
      score += Math.min(120, hits * 40);
    }

    // ملفّ ضخم جدًّا يزاحم عشرة ملفّات مفيدة — يُخفَّض لا يُمنع.
    if (size > 200000) score -= 40;
    else if (size > 60000) score -= 15;

    return { name, size, score, skip: null };
  });

  // ترتيب ثابت: الدرجة ثمّ الاسم — فلا يتغيّر الناتج بين تشغيلين.
  return scored.sort((a, b) => (b.score - a.score) || a.name.localeCompare(b.name));
}

/**
 * يملأ الميزانيّة على مرّتين: عرضٌ ثمّ عمق.
 *
 * المرّة الواحدة (الأعلى درجةً يأخذ ما يشاء) فشلت في قياس حقيقيّ: أرشيف من
 * ١٣٠ ملفًّا امتلأت ميزانيّته بـ٣٦ ملفًّا، فبقي `api/_lib/chat.js` — عقل
 * الخادم — خارج السياق تمامًا. النموذج لا يعرف أنّه فاته شيء، فيجيب بثقة
 * عن مشروعٍ رأى ربعه.
 *
 * المرّتان:
 *   ① لكلّ ملفّ مؤهَّل رأسٌ صغير (headSlice) — فلا ملفّ غائب كلّيًّا.
 *   ② ما بقي من الميزانيّة يُنفَق على الأعلى درجةً حتّى الحدّ الفرديّ.
 *
 * ranked: ناتج rankFiles  ·  read(name) -> نصّ الملفّ.
 */
function packFiles(ranked, read, opts) {
  const o = opts || {};
  const budget = o.budget || 300000;
  const maxFiles = o.maxFiles || 120;
  const head = o.headSlice || 2500;
  const list = ranked || [];
  const eligible = list.filter((f) => f.score >= 0);
  // ملفّ واحد يُعطى كاملًا؛ الحدّ الفرديّ يمنع ابتلاع الميزانيّة عند التعدّد.
  const perFile = eligible.length <= 1 ? budget : (o.perFile || 60000);

  const picked = [];
  const skipped = [];
  const cache = new Map();
  let used = 0;

  // ① العرض — رأسٌ لكلّ ملفّ.
  for (const f of list) {
    if (f.score < 0) { skipped.push({ name: f.name, size: f.size, why: f.skip }); continue; }
    if (picked.length >= maxFiles) { skipped.push({ name: f.name, size: f.size, why: 'تجاوز حدّ عدد الملفّات' }); continue; }
    if (budget - used < 200) { skipped.push({ name: f.name, size: f.size, why: 'نفدت الميزانيّة' }); continue; }

    let text;
    try { text = read(f.name); } catch (e) { skipped.push({ name: f.name, size: f.size, why: 'تعذّرت القراءة' }); continue; }
    if (typeof text !== 'string' || !text) { skipped.push({ name: f.name, size: f.size, why: 'فارغ' }); continue; }
    // بايت صفريّ = ثنائيّ يحمل امتداد نصّ. إدخاله يفسد السياق بضجيج.
    if (text.indexOf('\u0000') !== -1) { skipped.push({ name: f.name, size: f.size, why: 'محتوى ثنائيّ' }); continue; }

    cache.set(f.name, text);
    const room = Math.min(head, perFile, budget - used);
    const body = text.slice(0, room);
    picked.push({ name: f.name, size: f.size, text: body, truncated: body.length < text.length, fullChars: text.length });
    used += body.length;
  }

  // ② العمق — توسيع الأعلى درجةً بما بقي.
  for (const p of picked) {
    if (!p.truncated) continue;
    const room = Math.min(perFile - p.text.length, budget - used);
    if (room < 200) continue;
    const text = cache.get(p.name) || '';
    const body = text.slice(0, p.text.length + room);
    used += body.length - p.text.length;
    p.text = body;
    p.truncated = body.length < text.length;
  }

  return { picked, skipped, used };
}

/**
 * يصوغ الناتج للنموذج.
 *
 * سطران مقصودان هنا:
 * ① أرقام الأسطر — بلا رقم لا يستطيع النموذج أن يقتبس «auth.js:١٢٠»، فيصف
 *    بدل أن يشير، ويصير النقاش حول الملفّ تخمينًا.
 * ② بيان كامل بكلّ ملفّ حتّى غير المقروء — الصمت عن ملفّ يجعل النموذج يظنّه
 *    غير موجود فيبني على نقصٍ لا يعلمه.
 */
function renderPack(archiveName, all, pack) {
  const L = [];
  L.push('محتوى الأرشيف «' + (archiveName || 'archive') + '» — ' + all.length + ' ملفًّا.');
  L.push('قُرئ ' + pack.picked.length + ' ملفًّا (' + pack.used.toLocaleString('en-US') + ' حرفًا)، مرتّبةً بالأهمّيّة.');
  L.push('');
  L.push('=== البيان الكامل ===');
  for (const f of pack.picked) {
    L.push('✓ ' + f.name + '  (' + f.size + ' بايت' + (f.truncated ? '، مقروء جزئيًّا' : '') + ')');
  }
  for (const s of pack.skipped.slice(0, 200)) {
    L.push('· ' + s.name + '  (' + s.why + ')');
  }
  if (pack.skipped.length > 200) L.push('· … و' + (pack.skipped.length - 200) + ' ملفًّا آخر لم يُقرأ.');
  L.push('');
  L.push('=== المحتوى (الأرقام أرقام أسطر حقيقيّة — اقتبس بها) ===');
  for (const f of pack.picked) {
    L.push('');
    L.push('╭── ' + f.name);
    const lines = f.text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      L.push(String(i + 1).padStart(4, ' ') + '│ ' + lines[i]);
    }
    if (f.truncated) L.push('    │ … اقتُطع هنا (' + f.fullChars + ' حرفًا كاملة).');
    L.push('╰── نهاية ' + f.name);
  }
  return L.join('\n');
}

module.exports = { rankFiles, packFiles, renderPack, queryTerms, SKIP_DIR, GENERATED };
