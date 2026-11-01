// v-tool-pages: يولّد صفحات الأدوات الثابتة للبحث (tools/<slug>.html عربيّ + en/tools/<slug>.html إنجليزيّ + صفحتا الفهرس)
// وsitemap.xml من scripts/tool-pages.json — مصدر واحد فلا تفترق الصفحات. node scripts/tool-pages.mjs [--check]
// --check لا يكتب: يخرج ١ إن اختلف أيّ ملفّ عمّا يولَّد (يستعمله tests/tool-pages.test.cjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BASE = 'https://omran-ai-builder.vercel.app';
const CSS = '/css/landing.css?v=2';
const ICONS = '<link rel="icon" href="/favicon.ico" sizes="48x48">\n<link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192-v2.png?icon=black-20261022">\n<link rel="apple-touch-icon" href="/icons/apple-touch-icon-v2.png?icon=black-20261022">';
const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&family=Inter:wght@400;700&display=swap">';

const UI = {
  ar: { dir: 'rtl', locale: 'ar_AR', home: 'الرئيسيّة', all: 'كلّ الأدوات', other: 'English', otherLang: 'en', what: 'ماذا يمكنك أن تفعل', how: 'كيف تستخدمها في ثلاث خطوات', faq: 'أسئلة شائعة', more: 'أدوات أخرى في om ai', privacy: 'الخصوصيّة', terms: 'الشروط', open: 'افتح التطبيق',
    hub: { title: 'أدوات om ai بالذكاء الاصطناعي — صور وفيديو وديكور ومستندات', description: 'كلّ أدوات om ai في مكان واحد: أنماط الصور، صانع الفيديو، الديكور، الأزياء، الستايل، الإعلانات، المستندات، الإيميل، البناء، التعليم، القبلة، والأسئلة الدينيّة.', h1: 'أدوات om ai بالذكاء الاصطناعي', lead: 'اختر الأداة التي تحتاجها، واقرأ ما تفعله وكيف تستخدمها، ثمّ افتحها مباشرةً في التطبيق من متصفّحك.' } },
  en: { dir: 'ltr', locale: 'en_US', home: 'Home', all: 'All tools', other: 'العربيّة', otherLang: 'ar', what: 'What you can do', how: 'How it works in three steps', faq: 'Frequently asked questions', more: 'More om ai tools', privacy: 'Privacy', terms: 'Terms', open: 'Open the app',
    hub: { title: 'om ai AI tools — photos, video, interior design and documents', description: 'All om ai tools in one place: photo styles, video maker, interior design, fashion, style, ads, documents, email, construction, education, Qibla and Islamic Q&A.', h1: 'om ai AI tools', lead: 'Pick the tool you need, read what it does and how to use it, then open it straight in the app from your browser.' } },
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pageUrl = (lang, slug) => (lang === 'ar' ? '' : '/en') + '/tools' + (slug ? '/' + slug : '');
const ctaHref = (lang, t) => (t.slug === 'ads' ? '/ad-studio.html' : (lang === 'ar' ? '/' : '/en') + '?open=' + t.slug);
const imgUrl = (t) => encodeURI(t.img);

function head(lang, { title, description, canonical, alt, image, ld }) {
  const u = UI[lang];
  return `<!doctype html>
<html lang="${lang}" dir="${u.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${BASE}${canonical}">
<link rel="alternate" hreflang="ar" href="${BASE}${lang === 'ar' ? canonical : alt}">
<link rel="alternate" hreflang="en" href="${BASE}${lang === 'en' ? canonical : alt}">
<link rel="alternate" hreflang="x-default" href="${BASE}${lang === 'ar' ? canonical : alt}">
<meta name="theme-color" content="#000000">
<meta property="og:type" content="website">
<meta property="og:site_name" content="om ai">
<meta property="og:locale" content="${u.locale}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${BASE}${canonical}">
<meta property="og:image" content="${BASE}${image}">
<meta name="twitter:card" content="summary_large_image">
${ICONS}
${FONTS}
<link rel="stylesheet" href="${CSS}">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>`;
}

function top(lang, alt) {
  const u = UI[lang];
  return `<header class="lp-top"><a class="lp-brand" href="${lang === 'ar' ? '/' : '/en'}">om ai</a><nav class="lp-nav"><a href="${pageUrl(lang)}">${u.all}</a><a href="${alt}" hreflang="${u.otherLang}" lang="${u.otherLang}">${u.other}</a></nav></header>`;
}
function foot(lang) {
  const u = UI[lang];
  return `<footer class="lp-foot"><a href="/privacy.html">${u.privacy}</a> · <a href="/terms.html">${u.terms}</a> · <a href="${lang === 'ar' ? '/' : '/en'}">${u.open}</a> · © 2026 om ai</footer>\n</body>\n</html>\n`;
}
function crumbs(lang, items) {
  return { '@type': 'BreadcrumbList', itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: BASE + url })) };
}

function toolPage(lang, t, all) {
  const c = t[lang], u = UI[lang];
  const canonical = pageUrl(lang, t.slug), alt = pageUrl(lang === 'ar' ? 'en' : 'ar', t.slug);
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebPage', name: c.title, description: c.description, url: BASE + canonical, inLanguage: lang, isPartOf: { '@type': 'WebSite', name: 'om ai', url: BASE + '/' } },
    crumbs(lang, [[u.home, lang === 'ar' ? '/' : '/en'], [u.all, pageUrl(lang)], [t.name[lang], canonical]]),
  ] };
  const others = all.filter((o) => o.slug !== t.slug).map((o) => `<li><a href="${pageUrl(lang, o.slug)}">${esc(o.name[lang])}</a></li>`).join('\n');
  return `${head(lang, { title: c.title, description: c.description, canonical, alt, image: imgUrl(t), ld })}
<body>
${top(lang, alt)}
<main class="lp">
<section class="lp-hero">
<h1>${esc(c.h1)}</h1>
<p class="lp-lead">${esc(c.lead)}</p>
<a class="lp-cta" href="${ctaHref(lang, t)}">${esc(c.cta)}</a>
<p class="lp-note">${esc(c.note)}</p>
<figure class="lp-fig"><img${t.fit === 'full' ? ' class="lp-full"' : ''} src="${imgUrl(t)}" alt="${esc(c.h1)}" width="${t.w}" height="${t.h}" decoding="async"></figure>
</section>
<section><h2>${u.what}</h2>
<ul class="lp-feat">
${c.features.map((f) => `<li>${esc(f)}</li>`).join('\n')}
</ul></section>
<section><h2>${u.how}</h2>
<ol class="lp-steps">
${c.steps.map((s) => `<li>${esc(s)}</li>`).join('\n')}
</ol></section>
<section class="lp-faq"><h2>${u.faq}</h2>
${c.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n')}
</section>
<section class="lp-more"><h2>${u.more}</h2>
<ul>
${others}
</ul></section>
</main>
${foot(lang)}`;
}

function hubPage(lang, all) {
  const u = UI[lang], h = u.hub;
  const canonical = pageUrl(lang), alt = pageUrl(lang === 'ar' ? 'en' : 'ar');
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'CollectionPage', name: h.title, description: h.description, url: BASE + canonical, inLanguage: lang, isPartOf: { '@type': 'WebSite', name: 'om ai', url: BASE + '/' } },
    crumbs(lang, [[u.home, lang === 'ar' ? '/' : '/en'], [u.all, canonical]]),
  ] };
  const cards = all.map((t) => `<li class="lp-card"><a href="${pageUrl(lang, t.slug)}"><img src="${encodeURI(t.thumb)}" alt="${esc(t.name[lang])}" width="600" height="360" loading="lazy" decoding="async"><b>${esc(t.name[lang])}</b><span>${esc(t[lang].description)}</span></a></li>`).join('\n');
  return `${head(lang, { title: h.title, description: h.description, canonical, alt, image: '/icons/og-omran.jpg', ld })}
<body>
${top(lang, alt)}
<main class="lp">
<section class="lp-hero">
<h1>${esc(h.h1)}</h1>
<p class="lp-lead">${esc(h.lead)}</p>
<a class="lp-cta" href="${lang === 'ar' ? '/' : '/en'}">${u.open}</a>
</section>
<ul class="lp-grid">
${cards}
</ul>
</main>
${foot(lang)}`;
}

function sitemap(all) {
  const locs = ['/', '/tools', '/en/tools', ...all.flatMap((t) => [pageUrl('ar', t.slug), pageUrl('en', t.slug)])];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locs.map((l) => `  <url><loc>${BASE}${l}</loc></url>`).join('\n')}
</urlset>
`;
}

export function render() {
  const all = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/tool-pages.json'), 'utf8')).tools;
  const out = { 'tools/index.html': hubPage('ar', all), 'en/tools/index.html': hubPage('en', all), 'sitemap.xml': sitemap(all) };
  for (const t of all) {
    out['tools/' + t.slug + '.html'] = toolPage('ar', t, all);
    out['en/tools/' + t.slug + '.html'] = toolPage('en', t, all);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let bad = 0;
  for (const [rel, text] of Object.entries(render())) {
    const f = path.join(ROOT, rel);
    const cur = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
    if (cur === text) continue;
    if (check) { console.error('✗ يختلف عن المولَّد: ' + rel); bad++; continue; }
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
    console.log('✓ ' + rel);
  }
  if (check && bad) process.exit(1);
  if (check) console.log('✓ صفحات الأدوات تطابق مصدرها');
}
