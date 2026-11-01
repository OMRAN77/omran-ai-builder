// tests/tool-pages.test.cjs — v-tool-pages (المالك ١ نوفمبر «ابدأ»: Search Console يعرف الصفحة الرئيسيّة وحدها، ٤٣ ظهورًا في ٣ أشهر):
// صفحة ثابتة لكلّ أداة بالعربيّة (/tools/<slug>) والإنجليزيّة (/en/tools/<slug>) مولّدة من scripts/tool-pages.json، في sitemap.xml،
// وزرّها يفتح الأداة بـ/?open=<slug>؛ ووصف الصفحة الرئيسيّة بلا أسماء مزوّدين.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const BASE = 'https://omran-ai-builder.vercel.app';
const BANNED = /OpenAI|ChatGPT|\bGPT|Gemini|Claude|Anthropic|Groq|Llama|Mistral|DeepSeek|Cohere|Grok|Qwen|Runway|\bVeo\b|MiniMax|Kling|Replicate|Disney|Pixar|Ghibli|LEGO|Barbie|Marvel|SpongeBob|Mickey|LinkedIn|Polaroid|CrossFit|عمران AI|Omran AI|موثوق|trusted|مجاني بالكامل|مجانيّ بالكامل|completely free|unlimited|غير محدود/i;
const data = JSON.parse(read('scripts/tool-pages.json')).tools;
const visible = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ');
const attr = (html, re) => { const m = re.exec(html); return m ? m[1] : null; };

test('١. الصفحات وخريطة الموقع تطابق مولّدها (scripts/tool-pages.mjs من tool-pages.json) — لا تحرير يدويّ', async () => {
  const { render } = await import(pathToFileURL(path.join(root, 'scripts/tool-pages.mjs')).href);
  const out = render();
  assert.equal(Object.keys(out).length, 3 + data.length * 2);
  for (const [rel, text] of Object.entries(out)) assert.equal(read(rel), text, rel + ' يختلف — شغّل node scripts/tool-pages.mjs');
});

test('٢. كلّ صفحة: لغتها واتّجاهها، canonical لنفسها، hreflang متبادل، عنوان ووصف بطولهما، صورة موجودة، وزرّ يفتح أداتها', () => {
  assert.equal(data.length, 12, '١٢ أداة');
  for (const t of data) {
    for (const lang of ['ar', 'en']) {
      const rel = (lang === 'ar' ? '' : 'en/') + 'tools/' + t.slug + '.html';
      const html = read(rel);
      const url = (lang === 'ar' ? '' : '/en') + '/tools/' + t.slug, alt = (lang === 'ar' ? '/en' : '') + '/tools/' + t.slug;
      assert.match(html, new RegExp('<html lang="' + lang + '" dir="' + (lang === 'ar' ? 'rtl' : 'ltr') + '">'), rel);
      assert.equal(attr(html, /<link rel="canonical" href="([^"]+)">/), BASE + url, rel + ': canonical');
      assert.equal(attr(html, /hreflang="ar" href="([^"]+)"/), BASE + (lang === 'ar' ? url : alt), rel + ': ar');
      assert.equal(attr(html, /hreflang="en" href="([^"]+)"/), BASE + (lang === 'en' ? url : alt), rel + ': en');
      assert.equal(attr(html, /hreflang="x-default" href="([^"]+)"/), BASE + '/tools/' + t.slug, rel + ': x-default = العربيّة');
      const title = attr(html, /<title>([^<]+)<\/title>/), desc = attr(html, /<meta name="description" content="([^"]+)">/);
      assert.ok(title && title.length <= 70 && / — om ai$/.test(title), rel + ': العنوان «… — om ai» ≤ ٧٠: ' + title);
      assert.ok(desc && desc.length >= 70 && desc.length <= 170, rel + ': الوصف ' + (desc || '').length);
      assert.equal((html.match(/<h1>/g) || []).length, 1, rel + ': h1 واحد');
      const img = decodeURI(attr(html, /<figure class="lp-fig"><img(?: class="lp-full")? src="([^"]+)"/) || '');
      assert.ok(img && fs.existsSync(path.join(root, img)), rel + ': الصورة ' + img);
      assert.equal(attr(html, /<meta property="og:image" content="([^"]+)">/), BASE + encodeURI(img), rel + ': og:image مطلق');
      const cta = attr(html, /<a class="lp-cta" href="([^"]+)">/);
      assert.equal(cta, t.slug === 'ads' ? '/ad-studio.html' : (lang === 'ar' ? '/' : '/en') + '?open=' + t.slug, rel + ': الزرّ');
      assert.doesNotMatch(visible(html) + ' ' + title + ' ' + desc, BANNED, rel + ': كلمة ممنوعة');
      assert.match(html, /<link rel="stylesheet" href="\/css\/landing\.css\?v=\d+">/);
      assert.ok(fs.existsSync(path.join(root, 'css/landing.css')));
    }
  }
});

test('٣. sitemap.xml: الرئيسيّة والفهرسان و٢٤ صفحة، وكلّ رابط يصل ملفًّا عبر إعادة التوجيه في vercel.json', () => {
  const locs = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(BASE, ''));
  assert.equal(locs.length, 3 + data.length * 2);
  assert.deepEqual(locs.slice(0, 3), ['/', '/tools', '/en/tools']);
  assert.match(read('robots.txt'), /Sitemap: https:\/\/omran-ai-builder\.vercel\.app\/sitemap\.xml/);
  const rewrites = JSON.parse(read('vercel.json')).rewrites;
  const resolve = (p) => {
    if (p === '/') return 'index.html';
    for (const r of rewrites) {
      const keys = [];
      const re = new RegExp('^' + r.source.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
      const m = re.exec(p);
      if (!m) continue;
      let d = r.destination;
      keys.forEach((k, i) => { d = d.replace(':' + k, m[i + 1]); });
      return d.replace(/^\//, '');
    }
    return null;
  };
  for (const l of locs) { const f = resolve(l); assert.ok(f && fs.existsSync(path.join(root, f)), l + ' → ' + f); }
  assert.equal(resolve('/en'), 'index.html', '/en ما زال التطبيق رغم مجلّد en/');
});

test('٤. /?open=<slug>: قائمة ثابتة تطابق الصفحات، يُحذف من الرابط، ينتظر الخصوصيّة، ولا يفتح الموقوف أو المخفيّ', () => {
  const src = read('js/app-10-features.js');
  const m = /\/\* v-tool-pages[\s\S]*?\n\(function\(\)\{[\s\S]*?\n\}\)\(\);/.exec(src);
  assert.ok(m, 'كتلة ?open= موجودة');
  const block = m[0].slice(m[0].indexOf('(function(){'));
  const OPEN = JSON.parse('{' + /const OPEN = \{([\s\S]*?)\};/.exec(block)[1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"') + '}');
  assert.deepEqual(Object.keys(OPEN).sort(), data.filter((t) => t.slug !== 'ads').map((t) => t.slug).sort(), 'كلّ صفحة (عدا الإعلانات) لها مفتاح والعكس');
  for (const [slug, id] of Object.entries(OPEN)) {
    assert.equal(data.find((t) => t.slug === slug).btn, id, slug);
    assert.match(read('index.html') + read('js/partials-core.js'), new RegExp('id="' + id + '"'), id + ' موجود');
  }
  function run({ href, present = [], paused = [], hidden = [], ready = 'loading' }) {
    const clicks = [], timers = [], listeners = {};
    let replaced = null;
    const els = {};
    for (const id of Object.values(OPEN)) els[id] = { id, click: () => clicks.push(id) };
    for (const id of present) els[id] = { id };
    const ctx = {
      URL, location: { href }, OMRAN_PAUSED_TOOLS: paused,
      history: { state: null, replaceState: (s, t, u) => { replaced = u; } },
      getComputedStyle: (el) => ({ display: hidden.includes(el.id) ? 'none' : 'flex' }),
      __swallow: (e) => { throw e; },
      setTimeout: (fn, ms) => timers.push({ fn, ms }),
      document: { readyState: ready, getElementById: (id) => els[id] || null, addEventListener: (ev, fn) => { listeners['d:' + ev] = fn; } },
      window: { addEventListener: (ev, fn) => { listeners['w:' + ev] = fn; } },
    };
    vm.runInNewContext(block, ctx);
    const flush = () => { let n = 0; while (timers.length && n++ < 1000) timers.shift().fn(); };
    return { clicks, timers, listeners, flush, els, get replaced() { return replaced; } };
  }
  const a = run({ href: BASE + '/en?open=decor&ref=x' });
  assert.equal(a.replaced, '/en?ref=x', 'open وحده يُحذف، وبقيّة الرابط تبقى');
  assert.equal(a.clicks.length, 0, 'لا فتح قبل DOMContentLoaded (المستندات والتعليم في سكربتات مؤجَّلة)');
  a.listeners['d:DOMContentLoaded'](); a.listeners['w:load'](); a.flush();
  assert.deepEqual(a.clicks, ['btnDesignAI'], 'يفتح مرّة واحدة');
  const b = run({ href: BASE + '/?open=docs', present: ['privacyConsent'], ready: 'complete' });
  b.timers.shift().fn();
  assert.equal(b.clicks.length, 0, 'تحت بطاقة الخصوصيّة: ينتظر');
  delete b.els.privacyConsent; b.flush();
  assert.deepEqual(b.clicks, ['btnDocs'], 'بعد الموافقة يفتح');
  const c = run({ href: BASE + '/?open=btnCV', ready: 'complete' }); c.flush();
  assert.equal(c.clicks.length, 0, 'معرّف حرّ من الرابط لا يُقبل');
  assert.equal(c.replaced, '/', 'ويُحذف');
  const d = run({ href: BASE + '/?open=qibla', paused: ['btnQibla'], ready: 'complete' }); d.flush();
  assert.equal(d.clicks.length, 0, 'أداة موقوفة');
  const e = run({ href: BASE + '/?open=email', hidden: ['btnEmailAssist'], ready: 'complete' }); e.flush();
  assert.equal(e.clicks.length, 0, 'أداة مخفيّة');
  const f = run({ href: BASE + '/?open=__proto__', ready: 'complete' }); f.flush();
  assert.equal(f.clicks.length, 0, '__proto__ لا يُقبل');
  const g = run({ href: BASE + '/?q=hi' });
  assert.equal(g.replaced, null, 'بلا open لا يمسّ الرابط');
});

test('٥. وصف الصفحة الرئيسيّة في البحث والمعاينة بلا أسماء مزوّدين ولا «مجاني بالكامل»، وhreflang بلا «en» على الرابط نفسه', () => {
  const html = read('index.html');
  const headTxt = html.slice(0, html.indexOf('</head>'));
  const metas = [
    attr(headTxt, /<meta name="description" content="([^"]+)">/),
    attr(headTxt, /<meta name="keywords" content="([^"]+)">/),
    attr(headTxt, /<meta property="og:description" content="([^"]+)">/),
    attr(headTxt, /<meta name="twitter:description" content="([^"]+)">/),
    ...[...headTxt.matchAll(/"description": "([^"]+)"/g)].map((m) => m[1]),
  ];
  assert.equal(metas.filter(Boolean).length, metas.length);
  for (const m of metas) assert.doesNotMatch(m, /OpenAI|ChatGPT|Gemini|Claude|Groq|DeepSeek|Mistral|Cohere|مجاني بالكامل|ومجاني بالكامل|4 نماذج/, m.slice(0, 60));
  assert.match(metas[0], /^om ai — أنشئ تطبيقات/);
  assert.doesNotMatch(headTxt, /hreflang="en" href="https:\/\/omran-ai-builder\.vercel\.app\/"/, 'لغتان على رابط واحد = hreflang باطل');
});
