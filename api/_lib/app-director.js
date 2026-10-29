'use strict';
/* api/_lib/app-director.js — v-app-director: عقل «مخرج التطبيق» (المرحلة ١) — للمالك وحده.
   المالك: «مثال أقوله سوّ لي أو عطني فكرة فيديو عن أنماط الصور ويعطيني فيديو عنه كامل… سوّ لي فيديو عن التطبيق
   ١٠ دقائق، يسوّيه مع الأفكار مع المتحدّثة مها أو عبدالله، وبأيّ لغة أريدها» — «ما أريد واحد غبي» — «ليس كلاود».
   إجراءان في api/ai.js:
     app-director-plan  : الطلب + اللغة + المتحدّث + المدّة + كتالوج التطبيق (app-catalog.js) → عنوان وفكرة ومشاهد
                          {type: screen|style_sample|title, target, text, highlight, narration, seconds} بجواب JSON من نموذج
                          المخرج (DIRECTOR_MODEL أو أحدث Pro)، مع إعادة على العابر وبدائل وتحقّق من JSON؛ الفيديو الطويل يُكتب أجزاءً.
     app-director-voice : جملة تعليق بالصوت الاحتياطيّ (حين يرفض مزوّد صوت مها/عبدالله) — WAV base64.
     app-director-token : رمز مهمّة قصير العمر (HMAC بسرّ الجسر CC_BRIDGE_SECRET، ساعتان، يحمل اسم المالك ومعرّف المهمّة)
                          يستعمله المتصفّح مع جسر Railway مباشرة لمسار /render؛ السرّ نفسه لا يبلغ المتصفّح، وعنوان الجسر
                          يعود مع الرمز من البيئة (CC_BRIDGE_URL) لا من العميل.
   لا نقاط ولا خصم: المالك بلا نقاط. لا اسم مزوّد في أيّ نصّ يصل العميل. */
const crypto = require('crypto');
const { isOwnerSession } = require('./_owner.js'); // v-audit-agent (srv-agent-3)
const { safeParse } = require('./safe-parse.js');
const CAT = require('./app-catalog.js');

/* v-app-director-reliable (المالك بلقطة «plan 502 plan_failed»: «شكل فقط ما يشتغل»): نداء واحد بلا إعادة ولا بديل كان يُسقط
   الفيديو كلّه عند أوّل زحام عابر أو مهلة عند المزوّد، والسبب لا يظهر. الآن: أحدث Pro أوّلًا، إعادة على الأعطال العابرة
   (429/5xx/شبكة)، ومهلة ← محاولة أسرع بتفكير أخفّ، ثمّ البديل التالي، ثمّ استكشاف قائمة النماذج، وآخر الحبل النموذج السريع
   — وسبب كلّ محاولة يعود للمالك في diag. `gemini-3-pro-preview` أُغلق في مارس ٢٠٢٦ فخرج من القائمة. */
const DEFAULT_MODELS = ['gemini-3.1-pro-preview', 'gemini-pro-latest', 'gemini-2.5-pro'];
const LAST_RESORT = ['gemini-3.8-flash', 'gemini-flash-latest'];
const PRO_RE = /^(?:models\/)?(gemini-(\d+(?:\.\d+)?)-pro(?:-preview[\w-]*)?)$/i;
const TRANSIENT = [429, 500, 502, 503, 504];
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';
const PLAN_BUDGET_MS = 270000;   // كلّ المحاولات تحت سقف دالّة Vercel (٣٠٠ ث)
const ATTEMPT_MS = 150000;       // مهلة المحاولة الواحدة (النموذج يفكّر قبل أوّل حرف)
const PART_MINUTES = 2.5;        // فيديو أطول من ٣ دقائق يُكتب أجزاءً: كلّ جزء نداء مستقلّ قصير
const TOKEN_TTL_MS = 2 * 3600 * 1000;
const MAX_REQUEST = 600;
/* v-director-story (المالك ٢٨ أكتوبر بفيديو «قصة سعيد وعمّي بلال»: «انا طالب قصة… سوالي كانفا يعني التصميم زفت»): القصّة تُقرأ
   كاملةً بكلام المالك — ٦٠٠ حرف قصّت قصّته (١٢٣٠) عند «ويوم تخرّجه» فلم تصل الورقة ولا النهاية. التقسيم في الكود لا في النموذج
   (النصّ حرفيّ مضمون)، والنموذج يكتب الصورة وحدها: عنوان وشخصيّات ثابتة وأسلوب واحد ولقطة لكلّ مقطع. */
const MAX_STORY = 3000;
const STORY_WORDS = 18;       // ≈ ٨ ثوانٍ كلامًا (WORDS_PER_SEC) — يُغلق المقطع عند بلوغه
const STORY_MAX_WORDS = 30;   // جملة أطول تُقسم عند الفواصل ثمّ بالكلمات
const MIN_MINUTES = 1, MAX_MINUTES = 10;
const SCENE_SECONDS = 8;      // متوسّط المشهد — الفعليّ على الجسر = مدّة الصوت + نصف ثانية
const WORDS_PER_SEC = 2.3;    // كلام مريح (كما في video-write)
const MAX_SCENES = 90;

const LANG_NAMES = {
  ar: 'Arabic (natural Gulf/Emirati dialect, warm and confident — never stiff formal Arabic)', en: 'English', fr: 'French', es: 'Spanish', tr: 'Turkish', ru: 'Russian',
  zh: 'Simplified Chinese', hi: 'Hindi', ur: 'Urdu', bn: 'Bengali', ne: 'Nepali', ml: 'Malayalam', id: 'Indonesian', fil: 'Filipino',
};

/** النماذج بالترتيب: DIRECTOR_MODEL أوّلًا إن وُجد، ثمّ أحدث Pro فالأقدم */
function directorModels(env) {
  const m = String((env || process.env).DIRECTOR_MODEL || '').trim();
  return m ? [m].concat(DEFAULT_MODELS.filter((x) => x !== m)) : DEFAULT_MODELS.slice();
}

const SYSTEM = [
  'أنت مخرج عروض منتجات محترف تكتب سيناريو فيديو تسويقيّ عن تطبيق «om ai».',
  'إيقاعك سريع: جملة واحدة لكلّ فكرة، لا حشو ولا تكرار. تبدأ بخطّاف قويّ في أوّل جملة، وتختم بدعوة واضحة للتجربة.',
  'تكتب التعليق الصوتيّ باللغة المطلوبة وحدها، وبصيغة من يخاطب المشاهد مباشرة، وبأسماء الميزات والشاشات كما وردت في الكتالوج حرفيًّا.',
  'ممنوع ذكر اسم أيّ مزوّد أو نموذج ذكاء اصطناعيّ أو شركة تقنيّة (لا كلود ولا جيمناي ولا GPT ولا جوجل ولا غيرها) — الأسماء الوظيفيّة فقط.',
  'لا تَعِد بشيء ليس في الكتالوج. المساعد الصوتيّ اسمه مها، وصوت الرجل اسمه عبدالله.',
  'تعيد JSON واحدًا صالحًا فقط بلا أيّ نصّ خارجه ولا أسوار كود.',
].join('\n');

const STORY_SYSTEM = [
  'أنت مخرج أفلام قصيرة ورسّام لوحات قصصيّة. تستلم قصّة مقسّمة مقاطع مرقّمة يقرؤها الراوي كما هي حرفيًّا — لا تغيّر منها شيئًا ولا تُعِد كتابتها.',
  'مهمّتك الصورة وحدها: عنوان قصير، وشخصيّات ثابتة الملامح، وأسلوب بصريّ واحد للفيلم كلّه، ولكلّ مقطع لقطة واحدة تصوّر لحظته بدقّة.',
  'الأوصاف البصريّة بالإنجليزيّة وملموسة: من في اللقطة (باسم الشخصيّة وعمرها في تلك اللحظة)، والمكان، والوقت والإضاءة، وتعبير الوجه، وزاوية الكاميرا. الملابس والأماكن خليجيّة إماراتيّة حين تقتضي القصّة.',
  'لا كتابة ولا حروف ولا لافتات داخل اللقطة. لا إعلان ولا تطبيق ولا دعوة لتحميل شيء. ممنوع ذكر اسم أيّ مزوّد أو نموذج ذكاء اصطناعيّ.',
  'تعيد JSON واحدًا صالحًا فقط بلا أيّ نصّ خارجه ولا أسوار كود.',
].join('\n');

function sceneTarget(minutes) { return Math.max(4, Math.round((minutes * 60) / SCENE_SECONDS)); }
function wordsPerScene() { return Math.round(SCENE_SECONDS * WORDS_PER_SEC); }

/** عدد أجزاء الكتابة: حتّى ٣ دقائق نداء واحد، وما فوقها جزء لكلّ دقيقتين ونصف (١٠ دقائق = ٤ أجزاء) */
function partsFor(minutes) { return minutes <= 3 ? 1 : Math.ceil(minutes / PART_MINUTES); }

/** مخطّط الأجزاء منقّى: {focus, targets[]} لكلّ جزء — والناقص يُكمَل بتوزيع الشاشات بالتساوي كي لا يتعطّل جزء لاحق */
function cleanOutline(list, catalog, parts) {
  const out = [];
  for (const x of (Array.isArray(list) ? list : []).slice(0, parts)) {
    if (!x || typeof x !== 'object') continue;
    const targets = (Array.isArray(x.targets) ? x.targets : []).map((t) => clip(t, 40)).filter(Boolean).slice(0, 14);
    out.push({ focus: clip(x.focus, 200), targets });
  }
  const ids = catalog.screens.map((s) => s.id);
  const per = Math.max(1, Math.ceil(ids.length / parts));
  for (let i = out.length; i < parts; i++) out.push({ focus: '', targets: ids.slice(i * per, (i + 1) * per) });
  for (let i = 0; i < out.length; i++) if (!out[i].targets.length) out[i].targets = ids.slice(i * per, (i + 1) * per);
  return out;
}

function buildPrompt(o) {
  const parts = o.parts || 1, part = o.part || 1;
  const total = sceneTarget(o.minutes);
  const scenes = parts === 1 ? total : Math.max(4, Math.round(total / parts));
  const words = wordsPerScene();
  const spk = o.speaker === 'male' ? 'عبدالله (صوت رجل)' : 'مها (صوت امرأة)';
  const L = [
    'الطلب من مالك التطبيق: «' + o.request + '»',
    'اللغة المطلوبة للتعليق الصوتيّ وبطاقات العناوين: ' + (LANG_NAMES[o.lang] || o.lang) + '.',
    'المتحدّث: ' + spk + '. المدّة الكلّيّة: ' + o.minutes + ' دقيقة ≈ ' + total + ' مشهدًا، كلّ مشهد نحو ' + SCENE_SECONDS + ' ثوانٍ = ' + words + ' كلمة تعليق تقريبًا (الحدّ ' + Math.round(words * 1.6) + ').',
  ];
  /* v-app-director-voice (المالك: «حط ميزه مع صوت ولا بدون»): بلا صوت يصير نصّ التعليق هو ما يُقرأ على الشاشة */
  if (o.silent) L.push('الفيديو بلا تعليق صوتيّ: حقل narration لن يُنطق بل يُعرض نصًّا على الشاشة، فاجعله جملة واحدة قصيرة واضحة (١٢ كلمة على الأكثر) تكفي وحدها لفهم المشهد.');
  let shape = '{"title":"عنوان الفيديو","idea":"سطران عن الفكرة","scenes":[';
  if (parts === 1) {
    L.push('أعد بالضبط ' + scenes + ' مشهدًا (±٢) تغطّي المدّة المطلوبة، تلتزم بالطلب (إن طلب موضوعًا واحدًا كأنماط الصور فركّز عليه وأرِ أمثلته، وإن طلب التطبيق كلّه فغطِّ الشاشات الأهمّ بالترتيب المنطقيّ).');
  } else if (part === 1) {
    L.push('الفيديو طويل فيُكتب على ' + parts + ' أجزاء متتالية، كلّ جزء في نداء مستقلّ. اكتب الآن ثلاثة أشياء: (١) العنوان والفكرة. (٢) "outline": مخطّط من ' + parts + ' عناصر بالضبط، لكلّ جزء ما يغطّيه بجملة ("focus") ومعرّفات الشاشات ومفاتيح الأنماط التي يعرضها هو وحده ("targets") — لا تتكرّر شاشة في جزأين، والشاشات الأهمّ تُغطّى بالترتيب المنطقيّ ملتزمًا بالطلب. (٣) مشاهد الجزء ١ فقط: ' + scenes + ' مشهدًا (±٢) تبدأ بالخطّاف وبطاقة العنوان، ولا تختم الفيديو لأنّ بعده أجزاء.');
    shape = '{"title":"عنوان الفيديو","idea":"سطران عن الفكرة","outline":[{"focus":"ما يغطّيه الجزء","targets":["screen id or style key"]}],"scenes":[';
  } else {
    const outline = cleanOutline(o.outline, o.catalog || { screens: [] }, parts);
    const cur = outline[part - 1] || { focus: '', targets: [] };
    L.push('الفيديو طويل ويُكتب على ' + parts + ' أجزاء متتالية. العنوان: «' + (o.title || '') + '». الفكرة: ' + (o.idea || '') + '.');
    L.push('المخطّط: ' + outline.map((x, i) => (i + 1) + ') ' + (x.focus || '') + ' [' + x.targets.join(', ') + ']').join(' | '));
    L.push('اكتب الآن مشاهد الجزء ' + part + ' فقط: ' + scenes + ' مشهدًا (±٢)' + (cur.focus ? ' عن: ' + cur.focus : '') + ' — أهدافه: ' + cur.targets.join(', ') + '. لا ترحّب ولا تُعِد ما غطّته الأجزاء الأخرى؛ ابدأ ببطاقة عنوان قصيرة للجزء أو بجملة انتقال.' +
      (part === parts ? ' هذا الجزء الأخير: اختم بدعوة واضحة للتجربة وبطاقة عنوان ختاميّة.' : ' لا تختم الفيديو؛ بعده جزء آخر.'));
  }
  L.push('أنواع المشاهد: "title" بطاقة عنوان (text ≤ ٦ كلمات، للافتتاح والفواصل والختام)، "screen" لقطة شاشة حقيقيّة (target = معرّف شاشة من الكتالوج)، "style_sample" صورة حقيقيّة تُولَّد بنمط صور (target = مفتاح نمط من PORTRAIT STYLES). نوّع بينها: افتح ببطاقة عنوان، ولا تضع أكثر من ثلاث لقطات متتالية للشاشة نفسها.');
  L.push('الصيغة المطلوبة: ' + shape + '{"type":"title|screen|style_sample","target":"screen id or style key","text":"نصّ قصير على الشاشة (اختياريّ لغير title)","highlight":"عنوان فرعيّ قصير يراه المشاهد تحت بطاقة العنوان — جملة للمشاهد لا ملاحظة إخراج","narration":"التعليق الصوتيّ لهذا المشهد","seconds":8}]}');
  L.push('كتالوج التطبيق:');
  L.push(o.catalogText);
  return L.join('\n');
}

function clip(s, n) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n); }
function extractJson(text) {
  const t = String(text || '').replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
}

/** يقرأ خطّة المخرج بحزم: الأنواع والأهداف تُطابَق على الكتالوج، والمجهول يسقط أو يُحوَّل، والمدد تُحصر. null إن لم يبقَ مشهد. */
function normalizePlan(obj, catalog, opts) {
  const o = opts || {};
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.scenes)) return null;
  const screenIds = new Set(catalog.screens.map((s) => s.id));
  const styleKeys = new Set(catalog.portraitStyles.map((s) => s.key));
  const scenes = [];
  for (const raw of obj.scenes.slice(0, MAX_SCENES)) {
    if (!raw || typeof raw !== 'object') continue;
    let type = String(raw.type || '').trim();
    let target = clip(raw.target, 60);
    const narration = clip(raw.narration, 700);
    const text = clip(raw.text, 80);
    if (!narration && !text) continue;
    if (type === 'style_sample') {
      if (!styleKeys.has(target)) { type = 'screen'; target = 'portrait'; }
    } else if (type === 'screen') {
      if (!screenIds.has(target)) target = screenIds.has(target.toLowerCase()) ? target.toLowerCase() : 'home';
    } else {
      type = 'title'; target = '';
    }
    const secs = Number(raw.seconds);
    scenes.push({
      type, target, text, highlight: clip(raw.highlight, 80), narration,
      seconds: Number.isFinite(secs) ? Math.max(3, Math.min(25, Math.round(secs))) : SCENE_SECONDS,
    });
  }
  if (scenes.length < 2) return null;
  const out = { title: clip(obj.title, 120) || clip(scenes[0].text, 120), idea: clip(obj.idea, 400), scenes };
  if (o.parts > 1) out.outline = cleanOutline((o.part || 1) === 1 ? obj.outline : o.outline, catalog, o.parts);
  return out;
}

/* ───── v-director-story: التقسيم الحرفيّ ───── */
/** نصّ القصّة كما كتبه المالك: فواصل الأسطر تبقى (حدود الفقرات)، والمسافات تُوحَّد، والحدّ ٣٠٠٠ حرف */
function storyText(s) {
  return String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[ \t\f\v\u00a0]+/g, ' ').replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n').trim().slice(0, MAX_STORY).trim();
}
function wordsOf(s) { return String(s || '').split(/\s+/).filter(Boolean).length; }
/** جمل الفقرة: النقطة والتعجّب والاستفهام تُنهي الجملة (مع علامة التنصيص التي تليها) — «..» وقفة لا نهاية */
function storySentences(par) {
  const ch = Array.from(par), out = [];
  let cur = '';
  for (let i = 0; i < ch.length; i++) {
    cur += ch[i];
    if (!/[.!؟?]/.test(ch[i])) continue;
    if (ch[i] === '.' && (ch[i - 1] === '.' || ch[i + 1] === '.')) continue;
    let j = i + 1;
    while (j < ch.length && /[»"”'’)]/.test(ch[j])) { cur += ch[j]; j++; }
    if (j >= ch.length || /\s/.test(ch[j])) { if (cur.trim()) out.push(cur.trim()); cur = ''; i = j - 1; }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
/** جملة أطول من STORY_MAX_WORDS: عند الفواصل أوّلًا ثمّ بالكلمات — الربط بمسافة واحدة يعيد النصّ نفسه */
function splitLong(s) {
  if (wordsOf(s) <= STORY_MAX_WORDS) return [s];
  const out = [];
  let cur = '';
  for (const p of s.split(/(?<=[،,؛;:])\s+/)) {
    const t = cur ? cur + ' ' + p : p;
    if (cur && wordsOf(t) > STORY_MAX_WORDS) { out.push(cur); cur = p; } else cur = t;
  }
  if (cur) out.push(cur);
  const fin = [];
  for (const x of out) { const w = x.split(' '); for (let i = 0; i < w.length; i += STORY_MAX_WORDS) fin.push(w.slice(i, i + STORY_MAX_WORDS).join(' ')); }
  return fin;
}
/** مقاطع القصّة بالترتيب: كلّ مقطع جمل كاملة من فقرة واحدة نحو STORY_WORDS كلمة — ضمانٌ أنّ مقاطعها مربوطةً بمسافة = النصّ نفسه */
function splitStory(text) {
  const chunks = [];
  for (const par of storyText(text).split('\n')) {
    let cur = '';
    for (const sen of storySentences(par).flatMap(splitLong)) {
      const t = cur ? cur + ' ' + sen : sen;
      if (cur && (wordsOf(cur) >= STORY_WORDS || wordsOf(t) > STORY_MAX_WORDS)) { chunks.push(cur); cur = sen; } else cur = t;
    }
    if (cur) chunks.push(cur);
  }
  return chunks.slice(0, MAX_SCENES - 1);
}
function buildStoryPrompt(o) {
  return [
    'القصّة (' + o.chunks.length + ' مقطعًا مرقّمًا — يُقرأ نصّها كما هو):',
    o.chunks.map((c, i) => (i + 1) + ') ' + c).join('\n'),
    'لغة القصّة: ' + (LANG_NAMES[o.lang] || o.lang) + ' — العنوان بها، والأوصاف البصريّة بالإنجليزيّة.',
    'إن ظهرت شخصيّة في عمرين (طفلًا ثمّ كبيرًا) فاكتب لها في "characters" وصفين منفصلين بالملامح نفسها، وسمِّ في كلّ لقطة نسخة عمرها في تلك اللحظة.',
    'الصيغة: {"title":"عنوان قصير (٦ كلمات على الأكثر)","style":"one English line: the single visual style of every shot","characters":[{"name":"name (age)","look":"English: age, face, hair, skin tone, clothing — fixed details"}],"shots":[{"i":1,"visual":"English, 25-60 words: who is in frame by character name, action, place, time of day, lighting, expression, camera angle"}]}',
    'أعد "shots" بعدد المقاطع بالضبط (' + o.chunks.length + ') وبترتيبها، كلّ عنصر برقم مقطعه.',
  ].join('\n');
}
/** خطّة القصّة: المقاطع نفسها (لا ما قد يعيد النموذج صياغته) + لقطة كلّ مقطع؛ نموذج أسقط أغلب اللقطات = null فيُعاد */
function normalizeStory(obj, chunks) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.shots) || !chunks.length) return null;
  const byI = {};
  obj.shots.forEach((x, k) => {
    if (!x || typeof x !== 'object') return;
    const i = Math.round(Number(x.i)) || (k + 1), v = clip(x.visual, 500);
    if (v && i >= 1 && i <= chunks.length && !byI[i]) byI[i] = v;
  });
  if (Object.keys(byI).length < Math.ceil(chunks.length * 0.6)) return null;
  const characters = (Array.isArray(obj.characters) ? obj.characters : []).slice(0, 8)
    .map((c) => ({ name: clip(c && c.name, 60), look: clip(c && c.look, 300) })).filter((c) => c.name && c.look);
  const title = clip(obj.title, 80) || clip(chunks[0], 40);
  const scenes = [{ type: 'title', target: '', text: title, highlight: '', narration: '', seconds: 3 }];
  chunks.forEach((c, k) => scenes.push({
    type: 'story', target: '', text: '', highlight: '', narration: c, visual: byI[k + 1] || '',
    seconds: Math.max(3, Math.min(25, Math.round(wordsOf(c) / WORDS_PER_SEC) + 1)),
  }));
  return { kind: 'story', title, idea: '', style: clip(obj.style, 300), characters, scenes };
}

function geminiBody(prompt, nudge, thinking, system) {
  const parts = [{ text: prompt }];
  if (nudge) parts.push({ text: nudge });
  const generationConfig = { temperature: 0.9, maxOutputTokens: 32768, responseMimeType: 'application/json' };
  if (thinking) generationConfig.thinkingConfig = { thinkingLevel: thinking };
  return { systemInstruction: { parts: [{ text: system || SYSTEM }] }, contents: [{ role: 'user', parts }], generationConfig };
}
function partsText(d) { return String((((((d || {}).candidates || [])[0] || {}).content || {}).parts || []).map((p) => p.text || '').join('')); }

/** نداء واحد: {ok, text, finish} أو {ok:false, why: timeout|network|http_NNN, status, msg} — لا يرمي */
async function callModel(o) {
  const t0 = Date.now();
  let r = null, d = null;
  try {
    r = await o.fetchImpl(ENDPOINT + o.model + ':generateContent?key=' + o.apiKey, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(Math.max(5000, o.timeoutMs)), /* إشارة صريحة: مهلة أوّل بايت العامّة (٣٠ ث) لا تكفي نموذجًا يفكّر */
      body: JSON.stringify(geminiBody(o.prompt, o.nudge, o.thinking, o.system)),
    });
    d = await r.json().catch(() => null);
  } catch (e) {
    const timeout = !!(e && (e.name === 'TimeoutError' || e.name === 'AbortError' || /timed? ?out|aborted/i.test(String(e.message))));
    return { ok: false, status: 0, why: timeout ? 'timeout' : 'network', msg: clip(e && e.message, 100), ms: Date.now() - t0 };
  }
  if (!r.ok) {
    let retryAfter = 0;
    try { retryAfter = Number(r.headers && r.headers.get && r.headers.get('retry-after')) || 0; } catch (e) { retryAfter = 0; /* ترويسة غير مقروءة = بلا مهلة مقترحة */ }
    return { ok: false, status: r.status, why: 'http_' + r.status, msg: clip(d && d.error && d.error.message, 140), retryAfter, ms: Date.now() - t0 };
  }
  const cand = ((d || {}).candidates || [])[0] || {};
  return { ok: true, status: 200, text: partsText(d), finish: String(cand.finishReason || ''), block: String(((d || {}).promptFeedback || {}).blockReason || ''), ms: Date.now() - t0 };
}

/** يستكشف أحدث نماذج Pro من قائمة النماذج عند المزوّد (حين تسقط الأسماء المعروفة كلّها) — الأحدث أوّلًا، والثابت قبل المعاينة */
async function discoverPro(apiKey, fetchImpl) {
  try {
    const r = await fetchImpl(ENDPOINT.replace(/\/$/, '') + '?pageSize=200&key=' + apiKey, { signal: AbortSignal.timeout(8000) });
    if (!r || !r.ok) return [];
    const d = await r.json();
    const found = [];
    for (const m of ((d && d.models) || [])) {
      const mm = PRO_RE.exec(String((m && m.name) || ''));
      if (!mm) continue;
      if (Array.isArray(m.supportedGenerationMethods) && !m.supportedGenerationMethods.includes('generateContent')) continue;
      found.push({ id: mm[1], v: parseFloat(mm[2]) || 0, preview: /preview/i.test(mm[1]) });
    }
    found.sort((a, b) => (b.v - a.v) || ((a.preview ? 1 : 0) - (b.preview ? 1 : 0)));
    return found.map((x) => x.id).slice(0, 3);
  } catch (e) { return []; /* القائمة ترف: تعذّرها = لا مرشّحين إضافيّين */ }
}

/** سطر تشخيص للمالك: كلّ محاولة بنموذجها وسببها وزمنها — بلا مفتاح */
function diagOf(attempts) {
  const rows = [];
  for (const a of (attempts || [])) {
    const head = a.model + (a.thinking ? '/' + a.thinking : '') + ':' + a.why;
    const last = rows[rows.length - 1];
    if (last && last.head === head) { last.n++; last.ms += a.ms || 0; continue; }
    rows.push({ head, n: 1, ms: a.ms || 0, msg: a.msg || '' });
  }
  return rows.map((r) => r.head + (r.n > 1 ? ' ×' + r.n : '') + ' ' + Math.round(r.ms / 1000) + 's' + (r.msg ? ' «' + String(r.msg).slice(0, 70) + '»' : ''))
    .join(' → ').replace(/key=[\w-]+/gi, 'key=…').slice(0, 480);
}

/**
 * يطلب الخطّة (أو جزءًا منها) من نموذج المخرج. opts: {request, lang, speaker, minutes, catalog, apiKey, env, part, parts, outline, title, idea,
 * fetchImpl, timeoutMs, budgetMs, sleep}. يعيد {ok, plan, model, fallback, attempts} أو {ok:false, why, attempts}.
 * الترتيب: DIRECTOR_MODEL ← أحدث Pro ← استكشاف القائمة ← النموذج السريع. لكلّ نموذج: إعادة واحدة على العابر (429/5xx/شبكة)،
 * مهلة ← محاولة بتفكير أخفّ، JSON فاسد ← محاولة ثانية بتنبيه؛ وكلّ ما عدا ذلك ينتقل للنموذج التالي.
 */
async function requestPlan(opts) {
  const o = opts || {};
  const fetchImpl = o.fetchImpl || fetch;
  const sleep = o.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const catalog = o.catalog;
  const parts = o.parts || 1, part = o.part || 1;
  const story = o.kind === 'story';
  const prompt = story ? buildStoryPrompt({ chunks: o.chunks, lang: o.lang })
    : buildPrompt({ request: o.request, lang: o.lang, speaker: o.speaker, minutes: o.minutes, silent: !!o.silent, part, parts, outline: o.outline, title: o.title, idea: o.idea, catalog, catalogText: CAT.catalogText(catalog) });
  const system = story ? STORY_SYSTEM : SYSTEM;
  const deadline = Date.now() + (o.budgetMs || PLAN_BUDGET_MS);
  const left = () => deadline - Date.now();
  const attempts = [], tried = new Set();
  const queue = directorModels(o.env);
  const pinned = String((o.env || process.env).DIRECTOR_MODEL || '').trim();
  let discovered = false, lastResort = false, why = 'unavailable';
  for (;;) {
    if (!queue.length) {
      if (!discovered) { discovered = true; for (const m of await discoverPro(o.apiKey, fetchImpl)) if (!tried.has(m)) queue.push(m); if (queue.length) continue; }
      if (!lastResort) { lastResort = true; for (const m of LAST_RESORT) if (!tried.has(m)) queue.push(m); if (queue.length) continue; }
      break;
    }
    const model = queue.shift();
    if (tried.has(model)) continue;
    tried.add(model);
    let nudge = '', thinking = '', transient = 0, jsonTries = 0, timeouts = 0;
    for (let i = 0; i < 4; i++) {
      if (left() < 20000) return { ok: false, why: why === 'unavailable' ? 'budget' : why, attempts };
      const r = await callModel({ model, prompt, nudge, thinking, system, apiKey: o.apiKey, fetchImpl, timeoutMs: Math.min(o.timeoutMs || ATTEMPT_MS, left() - 5000) });
      const rec = { model, thinking, why: r.ok ? 'ok' : r.why, ms: r.ms, msg: r.msg || '' };
      attempts.push(rec);
      if (!r.ok) {
        why = r.why;
        if (r.why === 'timeout') { if (++timeouts === 1 && thinking !== 'low') { thinking = 'low'; continue; } break; }
        if (r.why === 'network' || TRANSIENT.includes(r.status)) {
          if (++transient > 1) break;
          await sleep(Math.min(Math.max((r.retryAfter || 0) * 1000, 2000), 6000));
          continue;
        }
        if (r.status === 400 && thinking && /thinking/i.test(r.msg || '')) { thinking = ''; timeouts = 2; continue; } /* النموذج لا يقبل مستوى التفكير */
        break; /* 400/401/403/404…: النموذج التالي */
      }
      const plan = story ? normalizeStory(extractJson(r.text), o.chunks) : normalizePlan(extractJson(r.text), catalog, { parts, part, outline: o.outline });
      if (plan) return { ok: true, plan, model, fallback: !(model === pinned || /(^|-)pro(-|$)/i.test(model)), attempts };
      why = rec.why = 'bad_json' + (r.finish && r.finish !== 'STOP' ? ':' + r.finish : '') + (r.block ? ':' + r.block : '');
      if (++jsonTries >= 2) break;
      nudge = 'الجواب السابق لم يكن JSON صالحًا بالصيغة المطلوبة. أعد الآن JSON واحدًا صالحًا فقط بالحقول نفسها، بلا أيّ نصّ قبله أو بعده.';
    }
  }
  return { ok: false, why, attempts };
}

/* ───── v-app-director-voice: المعلّق الاحتياطيّ (للمالك وحده) ─────
   المالك بعد لقطة «voice 15/15 401» (مفتاح صوت مها/عبدالله مرفوض في الإنتاج، ورصيد المسار الآخر منتهٍ): «تمام ابدا فيه» — صوت
   احتياطيّ من المزوّد الذي يعمل (نفسه الذي يكتب السيناريو) كي يكتمل الفيديو. ليس صوت مها/عبدالله الأصليّ، فتعلنه الواجهة.
   واجهة الصوت كما في التوثيق الرسميّ (ai.google.dev/gemini-api/docs/speech-generation، فُحص ١١ أكتوبر ٢٠٢٦): POST /v1beta/interactions
   والمفتاح في ترويسة x-goog-api-key؛ الصوت base64 في steps[type=model_output].content[type=audio].data، وافتراضيّه WAV ‏24kHz
   أحاديّ ١٦ بت. الأشكال الأقدم تُقرأ احتياطًا، وPCM بلا ترويسة يُغلَّف WAV. */
const VOICE_MODELS = ['gemini-3.8-flash-tts', 'gemini-3.1-flash-tts-preview', 'gemini-3.8-flash-lite-tts', 'gemini-2.5-pro-preview-tts'];
const VOICE_NAMES = { female: 'Kore', male: 'Charon' };
const VOICE_STYLE = { ar: 'warm, confident promo narrator with a natural Gulf Arabic delivery', _: 'warm, confident, upbeat promo narrator' };
const INTERACTIONS = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MAX_VOICE_CHARS = 900;

function voiceModels(env) {
  const m = String((env || process.env).DIRECTOR_TTS_MODEL || '').trim();
  return m ? [m].concat(VOICE_MODELS.filter((x) => x !== m)) : VOICE_MODELS.slice();
}
function voiceName(speaker, env) {
  const e = env || process.env, male = speaker === 'male';
  const v = String((male ? e.DIRECTOR_VOICE_MALE : e.DIRECTOR_VOICE_FEMALE) || '').trim();
  return /^[A-Za-z]{2,30}$/.test(v) ? v : VOICE_NAMES[male ? 'male' : 'female'];
}
function voiceBody(model, text, speaker, lang, env) {
  return {
    model,
    input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style: VOICE_STYLE[lang] || VOICE_STYLE._ }] }] }],
    response_format: { type: 'audio' },
    generation_config: { speech_config: [{ voice: voiceName(speaker, env) }] },
    store: false, /* لا يُحفظ الطلب عند المزوّد */
  };
}
/** يستخرج الصوت من الردّ: آخر محتوى صوتيّ في خطوات model_output (وأشكال أقدم احتياطًا) — base64 أو '' */
function pickAudio(d) {
  let hit = '';
  for (const st of ((d && d.steps) || [])) {
    if (!st || st.type !== 'model_output') continue;
    for (const c of (st.content || [])) if (c && c.type === 'audio' && typeof c.data === 'string' && c.data.length > 100) hit = c.data;
  }
  if (!hit && d && d.output_audio && typeof d.output_audio.data === 'string') hit = d.output_audio.data;
  if (!hit) for (const p of ((((d && d.candidates) || [])[0] || {}).content || {}).parts || []) if (p && p.inlineData && typeof p.inlineData.data === 'string') hit = p.inlineData.data;
  return hit;
}
/** WAV صالح دائمًا: ما وصل بلا ترويسة RIFF (PCM خام 24kHz أحاديّ ١٦ بت) يُغلَّف */
function toWav(b64) {
  const buf = Buffer.from(String(b64 || ''), 'base64');
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') return buf;
  const h = Buffer.alloc(44), rate = 24000;
  h.write('RIFF', 0); h.writeUInt32LE(36 + buf.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(buf.length, 40);
  return Buffer.concat([h, buf]);
}
/**
 * جملة واحدة بالصوت الاحتياطيّ. opts: {text, speaker, lang, apiKey, env, fetchImpl, timeoutMs, prefer: نموذج نجح قبلُ فيُجرَّب أوّلًا إن كان في القائمة}. يعيد {ok, wav, model} أو {ok:false, status, why, attempts}.
 * نموذج مرفوض (400/403/404) أو بلا صوت ← التالي؛ العابر (429/5xx) يعود للعميل بحالته فهو من ينتظر ويعيد (حدّ الطلبات في الدقيقة).
 */
async function requestVoice(opts) {
  const o = opts || {};
  const fetchImpl = o.fetchImpl || fetch;
  const attempts = [];
  let last = { status: 0, why: 'unavailable' };
  const list = voiceModels(o.env);
  if (o.prefer && list.includes(o.prefer)) { list.splice(list.indexOf(o.prefer), 1); list.unshift(o.prefer); }
  for (const model of list) {
    const t0 = Date.now();
    let r = null, d = null;
    try {
      r = await fetchImpl(INTERACTIONS, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': o.apiKey },
        signal: AbortSignal.timeout(o.timeoutMs || 60000),
        body: JSON.stringify(voiceBody(model, o.text, o.speaker, o.lang, o.env)),
      });
      d = await r.json().catch(() => null);
    } catch (e) {
      attempts.push({ model, why: 'network', ms: Date.now() - t0, msg: clip(e && e.message, 100) });
      last = { status: 0, why: 'network' };
      continue;
    }
    if (!r.ok) {
      attempts.push({ model, why: 'http_' + r.status, ms: Date.now() - t0, msg: clip(d && d.error && (d.error.message || d.error), 140) });
      last = { status: r.status, why: 'http_' + r.status };
      if (TRANSIENT.includes(r.status)) break;
      continue;
    }
    const wav = toWav(pickAudio(d));
    if (wav.length > 44 + 2400) return { ok: true, wav, model, attempts }; /* أكثر من عُشر ثانية */
    attempts.push({ model, why: 'no_audio', ms: Date.now() - t0, msg: clip(d ? JSON.stringify(d).slice(0, 90) : '', 90) });
    last = { status: 502, why: 'no_audio' };
  }
  return { ok: false, status: last.status, why: last.why, attempts };
}

/* ───── رمز المهمّة: base64url(JSON{u,j,exp}).base64url(HMAC-SHA256) بسرّ الجسر ───── */
function b64u(buf) { return Buffer.from(buf).toString('base64url'); }
function signJobToken(info, secret, ttlMs) {
  const payload = JSON.stringify({ u: String(info.user || ''), j: String(info.jobId || ''), exp: Number(info.exp) || (Date.now() + (ttlMs || TOKEN_TTL_MS)) });
  const p = b64u(payload);
  const sig = crypto.createHmac('sha256', String(secret)).update(p).digest('base64url');
  return p + '.' + sig;
}
function verifyJobToken(token, secret, now) {
  try {
    const [p, sig] = String(token || '').split('.');
    if (!p || !sig || !secret) return { ok: false, why: 'malformed' };
    const want = crypto.createHmac('sha256', String(secret)).update(p).digest('base64url');
    const a = Buffer.from(sig), b = Buffer.from(want);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, why: 'signature' };
    const data = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    if (!data || !data.j || !(data.exp > (now || Date.now()))) return { ok: false, why: 'expired' };
    return { ok: true, user: String(data.u || ''), jobId: String(data.j), exp: data.exp };
  } catch (e) { return { ok: false, why: 'malformed' }; }
}
/* v-app-director-bridge-check (لقطة المالك «bridge offline» بعد أن كُتب السيناريو ووُلّدت النماذج): الجسر على Railway كان يشغّل نسخة
   من ٢٠ سبتمبر لا تعرف مسار /render (خدمته تنشر من فرع قديم لا من main)، فردّ على طلب المتصفّح 401 بلا ترويسات CORS وظهر «منقطعًا».
   الخادم يسأل الجسر عن صحّته قبل إصدار الرمز (خادم لخادم، بلا CORS): جسر لا يردّ = bridge_offline، وجسر يردّ بلا حقل renderJobs
   (حقل أضافه المصوِّر نفسه) = bridge_outdated — والواجهة تنادي هذا أوّل شيء فلا يُصرف على خطّة ولا صوت ولا صور لجسر لا يصوّر. */
async function probeBridge(bridge, opts) {
  const o = opts || {};
  const fetchImpl = o.fetchImpl || fetch;
  let last = { error: 'bridge_offline', why: 'network' };
  for (let a = 1; a <= 2; a++) {
    try {
      const r = await fetchImpl(bridge + '/health', { signal: AbortSignal.timeout(o.timeoutMs || 8000) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d || d.ok !== true) { last = { error: 'bridge_offline', why: 'health_' + r.status }; continue; }
      if (typeof d.renderJobs !== 'number') return { ok: false, error: 'bridge_outdated', why: 'no_render_route' };
      return { ok: true, renderJobs: d.renderJobs, busy: !!d.busy };
    } catch (e) { last = { error: 'bridge_offline', why: e && e.name === 'TimeoutError' ? 'timeout' : 'network' }; }
  }
  return Object.assign({ ok: false }, last);
}
function newJobId() { return 'd' + Date.now().toString(36) + crypto.randomBytes(5).toString('hex'); }

function sessionUser(token) {
  try {
    const payload = String(token || '').split('.')[0];
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return String((data && data.u) || '').slice(0, 60);
  } catch (e) { return ''; }
}

function cleanLabels(labels) {
  const out = {};
  if (!labels || typeof labels !== 'object') return out;
  let n = 0;
  for (const k of Object.keys(labels)) {
    if (n++ >= 400) break;
    if (/^[A-Za-z0-9_]{1,60}$/.test(k) && typeof labels[k] === 'string') out[k] = labels[k].slice(0, 120);
  }
  return out;
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  let body = req.body;
  if (!body || typeof body === 'string') body = safeParse(body, {}, 'app-director:body');
  const action = String((req.query && req.query.action) || '');
  if (!isOwnerSession({ query: req.query || {}, body })) { res.status(403).json({ error: 'owner_only' }); return; } // v-audit-agent (srv-agent-3): إنفاق ورمز مهمّة للجسر — جلسة المالك وحدها

  if (action === 'app-director-token') {
    const secret = String(process.env.CC_BRIDGE_SECRET || '').trim();
    const bridge = String(process.env.DIRECTOR_BRIDGE_URL || process.env.CC_BRIDGE_URL || '').trim().replace(/\/+$/, '');
    if (!secret || !/^https?:\/\//.test(bridge)) { res.status(503).json({ error: 'bridge_unconfigured' }); return; }
    const health = await probeBridge(bridge);
    if (!health.ok) {
      try { require('./log-error.js').logError('app-director/bridge', new Error(health.error), { why: health.why }); } catch (e) { console.error('[app-director] bridge ' + health.error + ' ' + health.why); }
      res.status(502).json({ error: health.error, why: health.why });
      return;
    }
    const jobId = newJobId();
    const exp = Date.now() + TOKEN_TTL_MS;
    res.status(200).json({ token: signJobToken({ user: sessionUser(body.token), jobId, exp }, secret), jobId, bridge, exp });
    return;
  }

  if (action === 'app-director-plan') {
    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) { res.status(503).json({ error: 'director_unconfigured' }); return; }
    const kind = body.kind === 'story' ? 'story' : 'app';
    const request = kind === 'story' ? storyText(body.request) : clip(body.request, MAX_REQUEST);
    if (!request) { res.status(400).json({ error: 'request_required' }); return; }
    const lang = CAT.LANGS.includes(body.lang) ? body.lang : 'ar';
    const speaker = body.speaker === 'male' ? 'male' : 'female';
    if (kind === 'story') {
      const chunks = splitStory(request);
      let rs;
      try { rs = await requestPlan({ kind, chunks, lang, apiKey, env: process.env }); }
      catch (e) { rs = { ok: false, why: 'exception', attempts: [{ model: '-', why: 'exception', ms: 0, msg: clip(e && e.message, 100) }] }; }
      if (!rs.ok) {
        const diag = diagOf(rs.attempts);
        try { require('./log-error.js').logError('app-director/story', new Error(rs.why), { diag: diag.slice(0, 160) }); } catch (e) { console.error('[app-director] story failed: ' + rs.why); }
        res.status(502).json({ error: 'plan_failed', why: rs.why, diag });
        return;
      }
      res.status(200).json({ plan: rs.plan, kind, lang, speaker, part: 1, parts: 1, model: rs.model, fallback: !!rs.fallback, attempts: rs.attempts.length });
      return;
    }
    const minutes = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.round(Number(body.minutes) || 2)));
    const catalog = CAT.buildCatalog({ lang, labels: cleanLabels(body.labels) });
    const parts = partsFor(minutes);
    const part = Math.max(1, Math.min(parts, Math.round(Number(body.part) || 1)));
    let r;
    try {
      r = await requestPlan({ request, lang, speaker, minutes, catalog, apiKey, env: process.env, part, parts, silent: body.voice === false,
        outline: part > 1 ? body.outline : undefined, title: clip(body.title, 120), idea: clip(body.idea, 400) });
    } catch (e) { r = { ok: false, why: 'exception', attempts: [{ model: '-', why: 'exception', ms: 0, msg: clip(e && e.message, 100) }] }; }
    if (!r.ok) {
      /* السبب الحقيقيّ يُرى من أوّل فشل: في سجلّ المالك، وفي الردّ (المسار للمالك وحده) فتعرضه الواجهة بين قوسين */
      const diag = diagOf(r.attempts);
      try { require('./log-error.js').logError('app-director/plan', new Error(r.why), { part, parts, diag: diag.slice(0, 160) }); } catch (e) { console.error('[app-director] plan failed: ' + r.why); }
      res.status(502).json({ error: 'plan_failed', why: r.why, diag });
      return;
    }
    const out = { plan: r.plan, lang, speaker, minutes, part, parts, model: r.model, fallback: !!r.fallback, attempts: r.attempts.length };
    if (part === 1) {
      const styles = {};
      catalog.portraitStyles.forEach((s, i) => { styles[s.key] = { desc: s.desc, prompt: CAT.samplePrompt(s.key, s.desc, i) }; });
      out.catalog = { screens: catalog.screens.map((s) => ({ id: s.id, name: s.name, steps: s.steps })), styles };
    }
    res.status(200).json(out);
    return;
  }
  if (action === 'app-director-voice') {
    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) { res.status(503).json({ error: 'voice_unconfigured' }); return; }
    const text = clip(body.text, MAX_VOICE_CHARS);
    if (!text) { res.status(400).json({ error: 'text_required' }); return; }
    const lang = CAT.LANGS.includes(body.lang) ? body.lang : 'ar';
    const speaker = body.speaker === 'male' ? 'male' : 'female';
    let r;
    try { r = await requestVoice({ text, speaker, lang, apiKey, env: process.env, prefer: clip(body.model, 60) }); }
    catch (e) { r = { ok: false, status: 0, why: 'exception', attempts: [{ model: '-', why: 'exception', ms: 0, msg: clip(e && e.message, 100) }] }; }
    if (!r.ok) {
      const diag = diagOf(r.attempts);
      try { require('./log-error.js').logError('app-director/voice', new Error(r.why), { diag: diag.slice(0, 160) }); } catch (e) { console.error('[app-director] voice failed: ' + r.why); }
      /* العابر بحالته (العميل ينتظر ويعيد)، وكلّ ما عداه 502 نهائيّ: النماذج كلّها جُرّبت */
      res.status(TRANSIENT.includes(r.status) ? r.status : 502).json({ error: 'voice_failed', why: r.why, diag });
      return;
    }
    res.status(200).json({ audio: r.wav.toString('base64'), mime: 'audio/wav', model: r.model });
    return;
  }
  res.status(404).json({ error: 'unknown action' });
}

module.exports = handler;
module.exports.__test = { storyText, splitStory, buildStoryPrompt, normalizeStory, STORY_SYSTEM, MAX_STORY, probeBridge, directorModels, buildPrompt, normalizePlan, requestPlan, signJobToken, verifyJobToken, extractJson, sceneTarget, SYSTEM, TOKEN_TTL_MS, DEFAULT_MODELS, LAST_RESORT, cleanLabels, partsFor, cleanOutline, discoverPro, diagOf, callModel, requestVoice, voiceBody, voiceModels, voiceName, pickAudio, toWav, VOICE_MODELS };
