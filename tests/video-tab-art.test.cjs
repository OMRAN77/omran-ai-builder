// v-vmk-tab-art: تبويبات صانع الفيديو بصور مربّعة واحدة المقاس (240×240) من لوحة المالك، والاسم المترجم تحتها.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function jpegSize(file) {
  const b = fs.readFileSync(file);
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) throw new Error('bad jpeg ' + file);
    const m = b[i + 1], len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xc3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  throw new Error('no SOF ' + file);
}

test('صورة لكلّ قسم من السبعة بمقاس واحد ٣٢٠×٣٢٠ (v-video-modes-by-result: omni وhybrid خرجا من القائمة وصورتاهما تبقيان)', () => {
  const js = read('js/video.js');
  const tabs = JSON.parse(js.match(/var TABS=(\[[^\]]+\]);/)[1].replace(/'/g, '"'));
  assert.strictEqual(tabs.length, 7); // كانت ٩ قبل v-video-modes-by-result
  for (const t of tabs) {
    const f = path.join(root, 'assets/videos/tabs', t + '.jpg');
    assert.ok(fs.existsSync(f), t + '.jpg');
    assert.deepStrictEqual(jpegSize(f), { w: 320, h: 320 }, t);
  }
});

test('التبويب صورة ثمّ اسم مترجم، والصفّ لا يُعصر في الشبكة ولا في عمود الجوّال', () => {
  const js = read('js/video.js');
  /* v-vmk-tab-warm: الرابط من دالّة واحدة يرسم بها التبويب ويسخّن بها الذاكرة */
  assert.match(js, /function tabArt\(v\)\{ return TAB_ART\[v\]\|\|'\/assets\/videos\/tabs\/'\+v\+'\.jpg\?v=2'; \}/);
  assert.match(js, /im\.src=tabArt\(v\)/);
  assert.match(js, /lb\.className='vmk-tab-lbl'; lb\.textContent=tabLabel\(v\)/);
  assert.match(js, /b\.appendChild\(im\); b\.appendChild\(lb\); tb\.appendChild\(b\);/);
  const css = read('css/modules.css');
  assert.ok(css.includes('#videoMakerModal .vmk-tab-img{display:block;width:80px;height:80px;object-fit:cover'));
  assert.ok(css.includes('#videoMakerModal .vmk-tab{display:flex;flex-direction:column;align-items:center'));
  /* الحاسوب: بلا تمرير (صفّ التمرير يصفّر الحدّ الأدنى لارتفاعه في شبكة ثابتة الارتفاع فيُعصر إلى ١٨ بكسل — ثبت بالمسبار) */
  const desktop = css.slice(css.indexOf('/* v-vmk-tab-art'), css.indexOf('@media (max-width:640px){#videoMakerModal .vmk-tabs{flex-wrap:nowrap'));
  assert.ok(!/overflow-x:auto/.test(desktop), 'لا تمرير أفقيّ على الحاسوب');
  assert.ok(css.includes('@media (max-width:640px){#videoMakerModal .vmk-tabs{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;min-height:max-content;flex-shrink:0;width:100%}}'));
  const h = read('index.html');
  assert.ok(h.includes('src="/js/video.js?v=461"') && h.includes('modules.css?v=692'));
});

/* v-vmk-tab-warm (تدقيق ١٨–١٩ أكتوبر، لقطة ٠٠١): صور التبويبات فارغة ٢–٣ ثوانٍ عند الفتح — كانت loading='lazy' وتُنشأ عند الفتح فقط،
   بينما تبدأ شبكة الترندات ٤٥ صورة في اللحظة نفسها. الآن eager بأولويّة عالية، وتُسخَّن الذاكرة عند مرور المؤشّر أو التركيز أو اللمس
   على زرّ الصانع بالروابط نفسها التي تُرسم. */
test('صور التبويبات لا تنتظر التحميل الكسول، وتُسخَّن بالروابط نفسها المرسومة', () => {
  const vm = require('node:vm');
  const js = read('js/video.js');
  const bt = js.slice(js.indexOf('  function buildTabs(){'), js.indexOf('  function setTab(v){'));
  assert.ok(!/im\.loading='lazy'/.test(bt), 'صورة التبويب كسولة');
  /* v-tab-video: المربّع من tabMedia (فيديو القسم إن رُفع، وإلّا الصورة) — الصورة نفسها eager بأولويّة عالية */
  assert.ok(/var im=tabMedia\(v,tabArt\(v\)\);/.test(bt), 'المربّع من tabMedia');
  const tm = js.slice(js.indexOf('  function tabMedia('), js.indexOf('\n  }\n', js.indexOf('  function tabMedia(')) + 4);
  assert.ok(/el\.loading='eager'; el\.fetchPriority='high';/.test(tm), 'تُطلب فور إنشاء التبويب وقبل صور الترندات');
  const src = (n) => { const a = js.indexOf('  function ' + n + '('); assert.ok(a > 0, n); return js.slice(a, js.indexOf('\n  }\n', a) + 4); };
  const got = [];
  const tabs = ['trend', 'canvas', 'runway', 'veo', 'actor', 'clean'];
  const ctx = { TAB_ART: { actor: '/assets/studio/options/heritage-emirati.webp' }, tabsFor: () => tabs, Image: function () { const o = {}; Object.defineProperty(o, 'src', { set(v) { got.push(v); } }); return o; } };
  vm.createContext(ctx);
  vm.runInContext('var tabsWarm=false;\n' + src('tabArt') + '\n' + src('warmTabs'), ctx);
  ctx.warmTabs(); ctx.warmTabs();
  assert.deepStrictEqual(got, tabs.map((v) => ctx.TAB_ART[v] || '/assets/videos/tabs/' + v + '.jpg?v=2'), 'مرّة واحدة، وبالروابط نفسها');
  assert.match(js, /\['pointerenter','pointerdown','focus'\]\.forEach\(function\(ev\)\{ bvm\.addEventListener\(ev,warmTabs\); \}\);/);
});

/* v-tab-video (المالك ٢٨ أكتوبر: «الي اريده فيديو مصغر نفس المكان بجوده عاليه مش كانفا»): مربّع القسم فيديو قصير صامت يتكرّر
   حين يُرفع media/samples/tab-<القسم>.mp4 (index.json)، وصورته غلافه؛ بلا ملفّ أو مع «تقليل الحركة» تبقى الصورة. */
test('٤. مربّع القسم: فيديو صامت متكرّر بغلاف الصورة حين يُرفع، وإلّا الصورة؛ و«تعديل الفيديو» بالمربّع نفسه', () => {
  const vm = require('node:vm');
  const js = read('js/video.js');
  const src = (n) => { const a = js.indexOf('  function ' + n + '('); assert.ok(a > 0, n); return js.slice(a, js.indexOf('\n  }\n', a) + 4); };
  const mk = (tag) => ({ tagName: tag, attrs: {}, style: {}, setAttribute(k, v) { this.attrs[k] = v; }, play() { this.played = true; return Promise.resolve(); } });
  const run = (videos, reduce) => {
    const ctx = { VIDEOS: videos, document: { createElement: mk }, window: { matchMedia: () => ({ matches: !!reduce }) } };
    vm.createContext(ctx);
    vm.runInContext(src('tabVid') + '\n' + src('tabMedia'), ctx);
    return ctx.tabMedia('veo', '/assets/videos/tabs/veo.jpg?v=2');
  };
  const v = run({ 'tab-veo': true }, false);
  assert.equal(v.tagName, 'video');
  assert.equal(v.src, '/media/samples/tab-veo.mp4');
  assert.equal(v.poster, '/media/samples/tab-veo.jpg', 'غلافه لقطة من المقطع نفسه حتّى يبدأ');
  assert.ok(v.muted && v.loop && v.autoplay && v.playsInline && v.attrs.playsinline === '' && v.attrs.muted === '', 'صامت متكرّر يعمل على الجوّال');
  assert.equal(v.className, 'vmk-tab-img', 'مقاس المربّع وحوافه نفسها');
  assert.ok(v.played);
  const img = run({}, false);
  assert.equal(img.tagName, 'img', 'بلا فيديو مرفوع: الصورة كما كانت');
  assert.equal(img.src, '/assets/videos/tabs/veo.jpg?v=2');
  assert.equal(run({ 'tab-veo': true }, true).tagName, 'img', '«تقليل الحركة»: الصورة وحدها');
  assert.match(js, /if\(Object\.keys\(j\)\.some\(function\(k\)\{ return k\.indexOf\('tab-'\)===0; \}\)\) buildTabs\(\);/, 'المربّعات تُبنى ثانيةً بعد وصول القائمة');
  assert.match(read('js/video-edit.js'), /window\.__vmkTabMedia \? window\.__vmkTabMedia\('edit', TAB_ART\)/, '«تعديل الفيديو» بالمربّع نفسه');
});
