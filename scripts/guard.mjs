// scripts/guard.mjs — يمنع تكرار عطبين حدثا فعلًا في هذا المستودع.
//
// (أ) سرّ في حزمة العميل. `omran-monitor-2026` عاش في js/app-11-video.js
//     و app-05-ui.js حتى ٦ أغسطس ٢٠٢٦. لم يُستغلّ — دُوِّر قبل ذلك — لكن
//     أربع أدوات مالك بقيت ميتة بصمت لأربعة أيام.
// (ب) سرّ افتراضي منشور مع الشيفرة. `process.env.AUTH_SECRET ||
//     'fallback-dev-secret-change-me'` كان في ١٠+ ملفات: أي نشرة تفقد
//     المتغيّر تقبل رموز جلسة مُلفَّقة لأي مستخدم، والمالك ضمنهم.
//
// (ج) `catch {}` فارغة تمامًا. الفارغة تعني أنّ الخطأ لا يُرى إطلاقًا: لا في
//     الطرفية ولا في سجل المالك. هكذا عاش عطب الـservice worker شهورًا.
//     القاعدة: إمّا تسجيل (`logError` في الخادم، `__swallow` في الواجهة)
//     وإمّا تعليق صريح داخل الأقواس يشرح لماذا الصمت مقصود.
//
// (د) ترتيب التحميل بين js/app-NN-*.js. كل ملفّ سكربت مستقلّ: لا رفع تصريحات
//     بينها. اسمٌ يُستعمل وقت التحميل ويُعرَّف في ملفّ لاحق = undefined بصمت.
//     كلفته الحقيقية: `$('#btnSend').onclick = sendPrompt;` في app-06 و sendPrompt
//     في app-09 → زرّ الإرسال ميت، ١١ حادثة في سجل الأخطاء. والوجه الثاني:
//     `I18N` مُصرَّح بـ const في app-03، فقراءته العارية في app-01 ترمي
//     ReferenceError وتقتل الإقلاع — حادثتان. القاعدة: نداء متأخّر أو window.
//
// (و) قراءة SITE_URL الخام خارج api/_lib/_site.js. حدث فعلًا يوم ٢٥ أغسطس
//     ٢٠٢٦: الخانة في Vercel كان فيها سرّ عميل جوجل (GOCSPX-…) لا عنوان،
//     فبنى الخادم منه redirect_uri وأرسله إلى جوجل — وهو سبب
//     redirect_uri_mismatch — وجعله مقصد كلّ تحويل بعد الدخول، ورابطَ
//     استرجاع كلمة المرور المُرسَل بالبريد. أي أنّ السرّ كان يخرج في شريط
//     العنوان وفي صناديق البريد. _site.js يتحقّق أنّه عنوان https صالح
//     ويتجاهل ما عداه، فأيّ قراءة تلتفّ حوله تعيد الباب الذي أُغلق.

// (هـ) اسمٌ عُلويّ مكرَّر بين سكربتين تحمّلهما الصفحة نفسها. السكربتات
//     الكلاسيكيّة تتشارك نطاقًا معجميًّا عامًّا واحدًا، فإعادة تعريف let/const/
//     class فيه خطأ صياغة يقتل السكربت **الثاني** كاملًا قبل تنفيذ حرف منه.
//     كلفته الحقيقية: رقعة الدفع في partials-settings.js كرّرت ستّة أسماء من
//     app-06-checkout.js (داخل الحزمة) — 22 أغسطس 2026 — فمات app.bundle.js
//     كلّه: لا محادثة ولا تسجيل دخول، والمستخدم عالق على شاشة التسجيل يومين.
//     ولم يُنذر شيء: node --check يفحص كلّ ملفّ وحده، والتصادم لا يظهر إلّا
//     حين تجتمع الملفّات في صفحة واحدة. لذلك يُقرأ هنا وسم <script> من كلّ
//     صفحة HTML، وتُقارَن تعريفاتها العليا بعضها ببعض.
//
// يُشغَّل: node scripts/guard.mjs   ·   يخرج ١ عند أول اكتشاف.
// للاستثناء المتعمَّد: اكتب guard-ok في نفس السطر واشرح لماذا.

import { readFile, readdir } from 'node:fs/promises';

const ROOT = new URL('..', import.meta.url).pathname;
const found = [];
const seen = new Set();   // js/app.bundle.js يظهر في القائمة وفي جرد المجلّد

// ما يصل متصفّح الزائر فعلًا. الأجزاء js/app-NN-*.js مُستثناة في
// .vercelignore ولا تُنشر — الحزمة وحدها تُنشر، فهي المقياس.
const CLIENT = [
  'js/app.bundle.js', 'sw.js', 'legal-strings.js', 'templates-data.js',
  'index.html', 'explore.html', 'privacy.html', 'terms.html', 'p.html',
];

const SECRETS = [
  ['OpenAI',       /\bsk-[A-Za-z0-9_-]{20,}/],
  ['Anthropic',    /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['Google',       /\bAIza[0-9A-Za-z_-]{35}/],
  ['AWS',          /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub',       /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})/],
  ['Vercel Blob',  /\bvercel_blob_rw_[A-Za-z0-9_]{20,}/],
  ['Slack',        /\bxox[abpsr]-[A-Za-z0-9-]{10,}/],
  ['Stripe حيّ',   /\b(sk|rk)_live_[A-Za-z0-9]{20,}/],
  ['مفتاح خاصّ',   /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['مفتاح المراقبة', /\bomran-monitor-\d{4}\b/],
  ['سرّ مُسنَد لنصّ', /\b(?:AUTH_SECRET|MONITOR_KEY|[A-Z0-9_]*(?:API_KEY|_TOKEN|_PASSWORD))\s*[:=]\s*['"`][^'"`\n]{8,}['"`]/],
];

// اسمٌ سرّيّ له بديل حرفيّ = سرّ منشور مع المصدر.
const PUBLISHED_DEFAULT =
  /process\.env\.([A-Z0-9_]*(?:SECRET|KEY|TOKEN|PASSWORD|SIGNING|WEBHOOK|CREDENTIAL)[A-Z0-9_]*)\s*\|\|\s*['"`]([^'"`\n]{6,})['"`]/;

const mask = (s) => (s.length <= 10 ? s : `${s.slice(0, 4)}…${s.slice(-2)} (${s.length} حرفًا)`);

async function scan(rel, tests, { skipComments = false } = {}) {
  if (seen.has(rel)) return;
  seen.add(rel);
  let text;
  try { text = await readFile(ROOT + rel, 'utf8'); } catch { return; }  // ملف غائب ليس عطبًا
  text.split('\n').forEach((line, i) => {
    if (line.includes('guard-ok')) return;
    const t = line.trim();
    if (skipComments && (t.startsWith('//') || t.startsWith('*'))) return;
    for (const [label, re] of tests) {
      const m = line.match(re);
      if (m) found.push(`${rel}:${i + 1}  ${label} → ${mask(m[0])}`);
    }
  });
}

// (أ) كل ما يُنشر للعميل.
for (const f of CLIENT) await scan(f, SECRETS);
for (const d of ['i18n', 'js']) {
  let names = [];
  try { names = await readdir(ROOT + d); } catch { /* المجلّد اختياري */ }
  for (const n of names) {
    if (!/\.(js|json)$/.test(n) || /^app-\d\d-/.test(n)) continue;
    await scan(`${d}/${n}`, SECRETS);
  }
}

// (ب) كل شيفرة الخادم. التعليقات مُستثناة: توثيق عطب قديم ليس عطبًا.
const apiFiles = [];
for (const d of ['api', 'api/_lib']) {
  let names = [];
  try { names = await readdir(ROOT + d); } catch { /* */ }
  for (const n of names) if (n.endsWith('.js')) apiFiles.push(`${d}/${n}`);
}
for (const f of apiFiles) await scan(f, [['بديل سرّيّ منشور', PUBLISHED_DEFAULT]], { skipComments: true });
// (ج) لا كتمة صامتة. النصوص الحرفيّة تُفرَّغ أوّلًا وإلّا صار `catch(e){}` داخل
// شيفرة مُولَّدة اكتشافًا كاذبًا. والتعليقات تُستبدل بحرف **غير** فراغ: التعليق
// الصريح هو صيغة الصمت المسموحة، فبقاؤه يمنع مطابقة «الجسم الفارغ».
const blank = (t) => t.replace(/[^\n]/g, ' ');
const keep = (t) => t.replace(/[^\n]/g, '#');
function strip(src) {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); const j = e < 0 ? src.length : e + 2; out += keep(src.slice(i, j)); i = j; continue; }
    if (c === '/' && n === '/') { let j = src.indexOf('\n', i); if (j < 0) j = src.length; out += keep(src.slice(i, j)); i = j; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; j++; }
      out += c + blank(src.slice(i + 1, j)) + (src[j] || ''); i = j + 1; continue;
    }
    out += c; i++;
  }
  return out;
}

const EMPTY_CATCH = /catch\s*(\([^)]*\))?\s*\{\s*\}/g;
async function catches(rel) {
  let text;
  try { text = await readFile(ROOT + rel, 'utf8'); } catch { return; }
  const clean = strip(text);
  const lines = text.split('\n');
  let m;
  EMPTY_CATCH.lastIndex = 0;
  while ((m = EMPTY_CATCH.exec(clean))) {
    const ln = clean.slice(0, m.index).split('\n').length;
    if ((lines[ln - 1] || '').includes('guard-ok')) continue;
    found.push(`${rel}:${ln}  كتمة صامتة → ${m[0].replace(/\s+/g, ' ')}`);
  }
}
const own = ['sw.js', ...apiFiles];
for (const d of ['js', 'scripts']) {
  let names = [];
  try { names = await readdir(ROOT + d); } catch { /* */ }
  for (const n of names) if (/\.(js|mjs)$/.test(n) && n !== 'app.bundle.js') own.push(`${d}/${n}`);
}
for (const f of own) await catches(f);

// ④ ترتيب التحميل بين الملفّات المقسّمة (العطب «د»).
const appFiles = (await readdir(ROOT + 'js')).filter((f) => /^app-\d\d-.*\.js$/.test(f)).sort();
const declaredIn = {};
const bodies = {};
for (let i = 0; i < appFiles.length; i++) {
  bodies[appFiles[i]] = await readFile(ROOT + 'js/' + appFiles[i], 'utf8');
  for (const m of bodies[appFiles[i]].matchAll(/^(?:async\s+)?(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/gm))
    if (declaredIn[m[1]] === undefined) declaredIn[m[1]] = i;
}
for (let i = 0; i < appFiles.length; i++) {
  const rel = 'js/' + appFiles[i];
  const lines = bodies[appFiles[i]].split('\n');
  lines.forEach((L, k) => {
    if (L.includes('guard-ok')) return;
    // (د-١) إسناد اسمٍ مجرّد يُعرَّف لاحقًا: onclick = fn;  ← يخزّن undefined
    const a = L.match(/=\s*([A-Za-z_$][\w$]*)\s*;\s*$/);
    if (a && declaredIn[a[1]] > i)
      found.push(`${rel}:${k + 1}  إسناد مبكّر → ${a[1]} يُعرَّف في ${appFiles[declaredIn[a[1]]]}؛ استخدم نداءً متأخّرًا`);
    // (د-٢) قراءة I18N عارية في ملفّ يسبق مُصرِّحها
    if (declaredIn.I18N !== undefined && i < declaredIn.I18N &&
        /(?<![A-Za-z0-9_.$])I18N(?![A-Za-z0-9_])/.test(L.replace(/\/\/.*$/, '')))
      found.push(`${rel}:${k + 1}  I18N عارٍ قبل ${appFiles[declaredIn.I18N]} → استخدم window.I18N`);
  });
}

// ⑤ اسمٌ عُلويّ مكرَّر بين سكربتَي صفحة واحدة (العطب «هـ»).
// تُجمع تعريفات let/const/class في المستوى الأعلى فقط: ما كان داخل قوس معقوف
// أو هلاليّ أو مربّع فهو محليّ ولا يتصادم. (حدّ معروف: `const a = 1, b = 2;`
// يُلتقط منه الأوّل فقط — والنمط نادر هنا، والأهمّ أنّ ما يُلتقط صحيح دائمًا.)
function topLevelLexical(src) {
  const s = strip(src);
  const out = new Map();
  let brace = 0, paren = 0, brack = 0;
  const put = (n, i) => { if (!out.has(n)) out.set(n, s.slice(0, i).split('\n').length); };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '{') { brace++; continue; }
    if (c === '}') { brace--; continue; }
    if (c === '(') { paren++; continue; }
    if (c === ')') { paren--; continue; }
    if (c === '[') { brack++; continue; }
    if (c === ']') { brack--; continue; }
    if (brace > 0 || paren > 0 || brack > 0) continue;
    if (c !== 'l' && c !== 'c') continue;              // let · const · class
    if (i > 0 && /[\w$.]/.test(s[i - 1])) continue;    // جزء من اسم أطول
    const kw = (/^(let|const|class)\b/.exec(s.slice(i, i + 6)) || [])[1];
    if (!kw) continue;
    let j = i + kw.length;
    if (kw === 'class') {
      const nm = /^\s+([A-Za-z_$][\w$]*)/.exec(s.slice(j, j + 80));
      if (nm) put(nm[1], i);
      i = j;
      continue;
    }
    let k = j, d = 0;                                  // رأس التصريح حتى = أو ; أو سطر جديد
    while (k < s.length) {
      const ch = s[k];
      if (ch === '{' || ch === '[' || ch === '(') d++;
      else if (ch === '}' || ch === ']' || ch === ')') d--;
      else if (d === 0 && (ch === '=' || ch === ';' || ch === '\n')) break;
      k++;
    }
    for (const nm of (s.slice(j, k).match(/[A-Za-z_$][\w$]*/g) || [])) put(nm, i);
    i = k - 1;
  }
  return out;
}

const pages = (await readdir(ROOT)).filter((f) => f.endsWith('.html'));
const lexCache = new Map();
for (const page of pages) {
  let html = '';
  try { html = await readFile(ROOT + page, 'utf8'); } catch { continue; }
  const srcs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)]
    .map((m) => m[1].split('?')[0])
    .filter((u) => u.startsWith('/') || u.startsWith('./') || !/^[a-z]+:/i.test(u))
    .map((u) => u.replace(/^\.?\//, ''));
  const owner = new Map();                             // اسم → أوّل ملفّ عرّفه
  for (const rel of srcs) {
    if (!lexCache.has(rel)) {
      let src = null;
      try { src = await readFile(ROOT + rel, 'utf8'); } catch { /* ملفّ خارجيّ أو غائب */ }
      lexCache.set(rel, src === null ? null : topLevelLexical(src));
    }
    const names = lexCache.get(rel);
    if (!names) continue;
    for (const [n, ln] of names) {
      const prev = owner.get(n);
      if (prev) found.push(`${rel}:${ln}  اسمٌ عُلويّ مكرَّر → ${n} مُعرَّف أيضًا في ${prev.rel}:${prev.ln}؛ ${page} تحمّل الاثنين فيموت الثاني`);
      else owner.set(n, { rel, ln });
    }
  }
}

// (و) SITE_URL يُقرأ من موضع واحد. _site.js وحده يملك التحقّق؛ وأيّ قراءة خام
// في مكان آخر تبني عناوين من قيمة لم يفحصها أحد. التعليقات مُستثناة عبر strip.
for (const f of apiFiles) {
  if (f === 'api/_lib/_site.js') continue;
  let text;
  try { text = await readFile(ROOT + f, 'utf8'); } catch { continue; }
  strip(text).split('\n').forEach((line, i) => {
    if (/process\.env\.SITE_URL/.test(line) && !/guard-ok/.test(line)) {
      found.push(`${f}:${i + 1}  قراءة SITE_URL خام — استعمل siteUrl() من _lib/_site.js`);
    }
  });
}

if (found.length) {
  console.error(`\n✗ الحارس: ${found.length} اكتشافًا — لا نشر.\n`);
  for (const f of found) console.error(`  ${f}`);
  console.error('\nإن كان مقصودًا: اكتب guard-ok في السطر واشرح السبب.\n');
  process.exit(1);
}
console.log(`✓ الحارس: ${seen.size} ملفًا نظيفًا — لا سرّ في العميل، لا بديل منشور، لا كتمة صامتة، ولا اسمٌ قبل تعريفه، ولا تصادم أسماء بين سكربتَي صفحة، ولا قراءة SITE_URL خام.`);
