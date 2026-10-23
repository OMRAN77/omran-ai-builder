'use strict';
/* api/_lib/app-catalog.js — v-app-director: كتالوج التطبيق الذي يقرؤه «مخرج التطبيق» قبل أن يكتب السيناريو.
   المالك: «سوّ لي فيديو عن أنماط الصور… أو فيديو عن التطبيق ١٠ دقائق، مع مها أو عبدالله، وبأيّ لغة».
   المخرج لا يعرف التطبيق إلّا من هنا، فكلّ ما يمكن اشتقاقه من الكود يُشتقّ منه لا يُكتب يدويًّا:
   أنماط الصور من portrait-style.js، وميزات الستوديو من studio-styles.js (مع كتالوج المئة)، وتصاميم الأزياء
   من fashion-variety.js، وترندات الفيديو من video-trends.js. الشاشات وحدها سجلّ صغير هنا (كيف تُفتح كلّ شاشة
   وبأيّ مفتاح ترجمة تُسمّى) لأنّ الخادم لا يرى ملفّات الواجهة؛ وأسماؤها باللغة المطلوبة تصل من المتصفّح
   (labels) من قاموس الترجمة نفسه، فيكتب المخرج اسم الميزة كما يراه المستخدم.
   بيانات صرف: لا سرّ ولا قراءة بيئة ولا شبكة. مكتبات الأنماط تُحمَّل عند الطلب (portrait-style يقرأ الأسرار
   في نطاقه فلا يُحمَّل في نطاق هذه الوحدة). */

/* الأدوات الموقوفة (OMRAN_PAUSED_TOOLS في app-05-ui.js) لا تُصوَّر — لا بطاقة لها في شاشة الأدوات. */
const PAUSED = ['btnExpense', 'btnCV', 'btnOmranTV', 'btnQuickTemplates'];

/* الشاشات: المعرّف، الاسم الاحتياطيّ (عربيّ/إنجليزيّ)، مفتاح الاسم والوصف في الترجمة، ما تفعله (للمخرج)،
   وخطوات فتحها في المتصفّح — click على معرّف زرّ، vtab قسم في صانع الفيديو، settings صفحة إعدادات، wait مهلة،
   focus عنصر تُقصّ عليه اللقطة (نافذة الأداة بدل الشاشة كلّها). */
const SCREENS = [
  { id: 'home', name: { ar: 'المحادثة', en: 'Chat' }, what: 'the main chat: ask anything, attach files and photos, generate images inside the conversation, build a site or an app from one sentence', steps: [] },
  { id: 'tools', name: { ar: 'شاشة الأدوات', en: 'Tools board' }, what: 'the tools board: every tool as a card on shelves', steps: [{ click: '#btnToolsBox' }, { wait: 900 }] },
  { id: 'video', name: { ar: 'صانع الفيديو', en: 'Video maker' }, titleKey: 'videoMakerTitle', subKey: 'tcSub_btnVideoMaker', what: 'the video maker, opened on the trends section: one-tap trend videos (Pixar story, heritage, old photo, product ad…), modes by result (fast with sound, high quality, cinematic with speech, talking actor, free templates), hero photo, writing assistant, characters, and a video cleaner', steps: [{ click: '#btnVideoMaker' }, { wait: 1200 }, { focus: '#videoMakerModal .vmk-studio' }] },
  { id: 'video-modes', name: { ar: 'أوضاع صانع الفيديو', en: 'Video maker modes' }, titleKey: 'videoMakerTitle', what: 'the video maker on a generation mode: description, three ready examples, hero photo, writing assistant, length and shape, create button', steps: [{ click: '#btnVideoMaker' }, { wait: 1200 }, { vtab: 'runway' }, { wait: 600 }, { focus: '#videoMakerModal .vmk-studio' }] },
  { id: 'video-clean', name: { ar: 'تحسين فيديو', en: 'Video cleaner' }, titleKey: 'videoTabClean', what: 'clean a blurry or noisy video on the device for free (light or strong, optional 2x upscale, before/after)', steps: [{ click: '#btnVideoMaker' }, { wait: 1200 }, { vtab: 'clean' }, { wait: 600 }, { focus: '#videoMakerModal .vmk-studio' }] },
  { id: 'portrait', name: { ar: 'أنماط الصور', en: 'Portrait styles' }, titleKey: 'portraitBtnTitle', subKey: 'tcSub_btnPortraitStyle', what: 'portrait styles: upload a photo and redraw yourself in dozens of art styles (anime, Pixar, oil painting, Ghibli, LEGO, heritage…) plus photo tools (passport, restore, colorize, background)', steps: [{ click: '#btnPortraitStyle' }, { wait: 1200 }] },
  { id: 'studio', name: { ar: 'ستايل AI', en: 'Style AI' }, titleKey: 'studioAiTitle', subKey: 'tcSub_btnStudioAI', what: 'style studio: try hair, beard, makeup, nails, skin, glasses, tattoos, anime looks and heritage outfits on your own photo, 100+ options per feature', steps: [{ click: '#btnStudioAI' }, { wait: 1200 }] },
  { id: 'fashion', name: { ar: 'أزياء AI', en: 'Fashion AI' }, titleKey: 'fashionAiTitle', subKey: 'tcSub_btnFashionAI', what: 'fashion AI: dress yourself in evening, formal, abaya, traditional, street and dozens more styles, 100+ designs per style, colours and accessories', steps: [{ click: '#btnFashionAI' }, { wait: 1200 }] },
  { id: 'design', name: { ar: 'ديكور AI', en: 'Design AI' }, titleKey: 'designAiTitle', subKey: 'tcSub_btnDesignAI', what: 'interior design: upload a room photo and restyle it (modern, classic, Gulf, luxury…)', steps: [{ click: '#btnDesignAI' }, { wait: 1200 }] },
  { id: 'ad', name: { ar: 'استوديو الإعلانات', en: 'Ad Studio' }, titleKey: 'adStudioHint', subKey: 'tcSub_btnAdStudio', what: 'ad studio: build a product ad by chatting — image, text and layout', steps: [{ click: '#btnAdStudio' }, { wait: 1200 }] },
  { id: 'construction', name: { ar: 'تصاميم المقاولات', en: 'Construction design' }, titleKey: 'constructionTitle', subKey: 'tcSub_btnConstruction', what: 'construction and contracting: describe a villa or building in one sentence and get plans, 3D views, bill of quantities and a PDF report', steps: [{ click: '#btnConstruction' }, { wait: 1200 }] },
  { id: 'edu', name: { ar: 'التعليم', en: 'Education' }, titleKey: 'omranEduTitle', subKey: 'tcSub_btnOmranEdu', what: 'education hub: courses, lessons, homework help and uploads', steps: [{ click: '#btnOmranEdu' }, { wait: 1200 }] },
  { id: 'docs', name: { ar: 'مساعد المستندات', en: 'Document assistant' }, titleKey: 'docsTitle', subKey: 'tcSub_btnDocs', what: 'document assistant: summarise, analyse and convert documents and PDFs', steps: [{ click: '#btnDocs' }, { wait: 1200 }] },
  { id: 'religion', name: { ar: 'التفسير الديني', en: 'Religious insights' }, titleKey: 'religionModalTitle', subKey: 'tcSub_btnReligion', what: 'religious insights: verse, hadith and dream interpretation', steps: [{ click: '#btnReligion' }, { wait: 1200 }] },
  { id: 'qibla', name: { ar: 'القبلة والمواقيت', en: 'Qibla & prayer times' }, titleKey: 'qiblaTitle', subKey: 'tcSub_btnQibla', what: 'qibla direction and prayer times for your location', steps: [{ click: '#btnQibla' }, { wait: 1200 }] },
  { id: 'stocks', name: { ar: 'سوق الأسهم', en: 'Stock market' }, titleKey: 'stocksTitle', subKey: 'tcSub_btnStocks', what: 'global stock market with a live chart and ticker', steps: [{ click: '#btnStocks' }, { wait: 1200 }] },
  { id: 'email', name: { ar: 'مساعد البريد', en: 'Email assistant' }, titleKey: 'emailAssistTitle', subKey: 'tcSub_btnEmailAssist', what: 'smart email assistant: reads your inbox and drafts replies you approve', steps: [{ click: '#btnEmailAssist' }, { wait: 1200 }] },
  { id: 'maha', name: { ar: 'مها', en: 'Maha' }, titleKey: 'mahaTitle', what: 'Maha, the voice assistant: a live voice call in Gulf Arabic and other languages; Abdullah is the male voice', steps: [{ click: '#btnMaha' }, { wait: 1500 }] },
  { id: 'themes', name: { ar: 'الثيمات والمظهر', en: 'Themes & appearance' }, titleKey: 'themeSectionLabel', what: 'settings: themes, colours and appearance (light and dark, ten themes)', steps: [{ settings: 'themeSection' }, { wait: 700 }, { focus: '#settingsDialog' }] },
  { id: 'languages', name: { ar: 'اللغات', en: 'Languages' }, what: 'settings: the app in 14 languages', steps: [{ settings: 'langSection' }, { wait: 700 }, { focus: '#settingsDialog' }] },
];

function clip(s, n) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n); }
/* وصف قصير من أمر النمط: الجملة الأولى بلا متغيّرات القالب */
function brief(text, n) { return clip(String(text || '').replace(/\{[^}]*\}/g, '').replace(/[.:;].*$/s, ''), n || 110); }

function portraitStyles() {
  const P = require('./portrait-style.js');
  const out = [];
  for (const [key, desc] of Object.entries(P.STYLE_PROMPTS || {})) out.push({ key, desc: brief(desc, 120) });
  const tools = Object.keys(P.EDIT_PROMPTS || {});
  const backdrops = Object.keys(P.BACKDROP_PROMPTS || {});
  return { styles: out, tools, backdrops };
}

function studioFeatures() {
  const S = require('./studio-styles.js');
  return Object.keys(S.STYLE_TEXT).map((f) => {
    const keys = Object.keys(S.STYLE_TEXT[f]);
    return { key: f, what: S.PREVIEW_FEATURE_NAME[f] || f, count: keys.length, examples: keys.slice(0, 5).map((k) => ({ key: k, desc: brief(S.STYLE_TEXT[f][k], 70) })) };
  });
}

function fashionCatalog() {
  const F = require('./fashion-variety.js');
  const cats = Object.keys(F.CATALOG).map((g) => ({ key: g, styles: Object.keys(F.CATALOG[g]) }));
  return { categories: cats, accessories: Object.keys(F.ACCESSORIES || {}), designsPerStyle: '100+' };
}

function videoTrends() {
  const T = require('./video-trends.js').TRENDS;
  return Object.keys(T).map((k) => ({ key: k, engine: T[k].engine, ratio: T[k].ratio, needsPhoto: T[k].photo, desc: brief(T[k].prompt, 110) }));
}

const LANGS = ['ar', 'en', 'fr', 'es', 'tr', 'ru', 'zh', 'hi', 'ur', 'bn', 'ne', 'ml', 'id', 'fil'];

/** موضوع ثابت مناسب لنموذج نمط صور (بلا صورة مرجعيّة): شخص خليجيّ يتبادل جنسه بالترتيب كي لا تتشابه النماذج */
function samplePrompt(styleKey, desc, index) {
  const who = (index % 2) ? 'a smiling young Emirati woman in an elegant dark abaya and hijab' : 'a smiling young Emirati man in a white kandura';
  return 'A friendly waist-up portrait of ' + who + ', rendered as ' + (desc || styleKey) + '. Centered subject, clean composition, high quality, no text, no watermark.';
}

/** يبني الكتالوج كاملًا. labels: أسماء الشاشات باللغة المطلوبة من قاموس الواجهة (المتصفّح يرسلها). */
function buildCatalog(opts) {
  const o = opts || {};
  const lang = LANGS.includes(o.lang) ? o.lang : 'ar';
  const labels = (o.labels && typeof o.labels === 'object') ? o.labels : {};
  const strip = (s) => clip(String(s || '').replace(/[\u{1F000}-\u{1FFFF}\u{2190}-\u{21FF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, ''), 80);
  const screens = SCREENS.map((s) => ({
    id: s.id,
    name: strip(labels[s.titleKey] || s.name[lang === 'ar' ? 'ar' : 'en'] || s.name.en),
    sub: strip(labels[s.subKey] || ''),
    what: s.what,
    steps: s.steps,
  }));
  const pt = portraitStyles();
  return {
    app: { name: 'om ai', languages: LANGS.length, assistant: { female: 'مها', male: 'عبدالله' } },
    screens,
    portraitStyles: pt.styles,
    portraitTools: pt.tools,
    portraitBackdrops: pt.backdrops,
    studio: studioFeatures(),
    fashion: fashionCatalog(),
    trends: videoTrends(),
  };
}

/** نسخة مضغوطة للمخرج (نصّ واحد يُلصق في الطلب) */
function catalogText(c) {
  const L = [];
  L.push('APP: ' + c.app.name + ' — ' + c.app.languages + ' languages; voice assistant: ' + c.app.assistant.female + ' (female) / ' + c.app.assistant.male + ' (male).');
  L.push('SCREENS (id → name — what it does):');
  for (const s of c.screens) L.push('- ' + s.id + ' → ' + s.name + (s.sub ? ' (' + s.sub + ')' : '') + ' — ' + s.what);
  L.push('PORTRAIT STYLES (key → look), ' + c.portraitStyles.length + ' styles:');
  for (const p of c.portraitStyles) L.push('- ' + p.key + ' → ' + p.desc);
  L.push('PORTRAIT TOOLS: ' + c.portraitTools.join(', ') + '. BACKDROPS: ' + c.portraitBackdrops.join(', ') + '.');
  L.push('STYLE STUDIO FEATURES (feature: options count; examples):');
  for (const f of c.studio) L.push('- ' + f.key + ' (' + f.what + '): ' + f.count + ' options; e.g. ' + f.examples.map((e) => e.desc).join(' | '));
  L.push('FASHION: ' + c.fashion.categories.map((g) => g.key + ' [' + g.styles.join(', ') + ']').join('; ') + '. ' + c.fashion.designsPerStyle + ' designs per style. Accessories: ' + c.fashion.accessories.join(', ') + '.');
  L.push('VIDEO TRENDS (key → idea), ' + c.trends.length + ' trends:');
  for (const t of c.trends) L.push('- ' + t.key + ' → ' + t.desc);
  return L.join('\n');
}

module.exports = { SCREENS, PAUSED, LANGS, buildCatalog, catalogText, samplePrompt, brief };
