/* v-no-lines-2 — أمر المالك: «الخطوط الزائده والموجوده الحينه كامله شلها، فقط عند تمرير الماوس على المكان يكون لون ذهبي، اريدها في التطبيق كامله،
   وتكون الخلفيه فقط لونين نفس درجة الاسود». css/بلا-خطوط.css يُحمَّل آخرًا ويخفي الإطارات الذهبيّة وحدود صندوق الكتابة والأدوات، والذهبيّ عند المرور فقط. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'بلا-خطوط.css'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const P = 'html:not([data-mode="light"]):not(.skin):not(.skin-wood):not(.bgimg)';
const bare = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
const rules = bare.replace(/\[style\*="[^"]*"\]/g, '[style]').split('}').filter((b) => b.includes('{')).map((b) => { const [s, d] = b.split('{'); return { sels: s.split(/,(?![^()]*\))/).map((x) => x.trim()).filter(Boolean), body: d.trim() }; });

test('١. الملفّ مربوط بوسم كاش بعد أدوات-أسود.css ورفع-الصور.css (آخر ورقة أنماط تغلب)', () => {
  const i = HTML.indexOf('href="css/بلا-خطوط.css?v=');
  assert.ok(i > 0, 'مربوط');
  assert.ok(i > HTML.indexOf('href="css/أدوات-أسود.css?v=') && i > HTML.indexOf('href="css/رفع-الصور.css?v=') && i > HTML.indexOf('href="css/إطارات-الجوال.css?v='));
});

test('٢. كلّ قاعدة للوضع الأسود وحده: لا الفاتح ولا الثيمات ولا الخشبيّ ولا صور الخلفيّة', () => {
  assert.ok(rules.length >= 10);
  for (const r of rules) for (const s of r.sels) assert.ok(s.startsWith(P + ' ') || s.startsWith(P + ':not(.mobile-ui) '), s);
});

test('٣. الألوان: شفّاف، أو ذهبيّ المرور rgba(212,175,55,.85)، أو #101013 — لا رماديّ ولا أبيض (قبل كتلة v-no-lines-3)', () => {
  const noAttr = bare.slice(0, bare.indexOf(':not(.mobile-ui) :is(#sidebar,#workarea,#omFrameCenter),')).replace(/\[style\*="[^"]*"\]/g, ''); /* محدِّدات [style*="…"] تطابق نصّ الحدّ داخل العنصر، ليست ألوانًا */
  const vals = noAttr.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi) || [];
  assert.ok(vals.length >= 8);
  for (const v of vals) assert.match(v.replace(/\s/g, ''), /^(rgba\(212,175,55,\.85\)|#101013)$/i, v);
});

/* v-no-lines-3 (المالك ١٨ أكتوبر بصورتين): الكمبيوتر في الأسود وحده — خطّان عموديّان بدل الإطارات، أسفل القائمة بلا صندوق وبخطّ رفيع فوقه،
   أزرار الشريط و«محادثة جديدة» بلا صندوق والإنارة بالنصّ/الأيقونة عند المرور. */
const D = P + ':not(.mobile-ui) ';
const block = bare.slice(bare.indexOf(D + ':is(#sidebar,#workarea,#omFrameCenter),'));
test('٦. v-no-lines-3: الإطارات الذهبيّة تختفي عن اللوحات الثلاث حتّى عند المرور، و#omFrameCenter أسود، وكلّ القواعد للكمبيوتر في الأسود وحده', () => {
  assert.ok(block.length > 500, 'الكتلة موجودة');
  for (const r of block.split('}').filter((b) => b.includes('{'))) for (const s of r.split('{')[0].split(/,(?![^()]*\))/).map((x) => x.trim()).filter(Boolean)) assert.ok(s.startsWith(D), s);
  const panels = block.slice(0, block.indexOf('}'));
  assert.ok(panels.includes(':is(#sidebar,#workarea,#omFrameCenter):hover') && panels.includes('main:has(#chatcol:hover) > #omFrameCenter'));
  assert.ok(/--om-gold-line:linear-gradient\(transparent,transparent\); --om-dots:linear-gradient\(transparent,transparent\); --om-glow:linear-gradient\(transparent,transparent\); border-color:transparent !important; box-shadow:none !important;/.test(panels));
  assert.ok(block.includes(D + '#omFrameCenter{background:#000 !important;}'));
});
test('٧. الخطّان العموديّان: ::before على المقبضين، من أعلى الشاشة إلى أسفلها (−13px حشوة الصفحة)، 1px، التدرّج والتوهّج المطلوبان، بلا التقاط للماوس', () => {
  const m = block.match(/\.resizer::before\{([^}]*)\}/); assert.ok(m, 'القاعدة');
  const b = m[1].replace(/\s+/g, ' ');
  for (const frag of ['content:""', 'position:absolute', 'top:-13px', 'bottom:-13px', 'left:50%', 'width:1px', 'translateX(-50%)', 'pointer-events:none',
    'linear-gradient(to bottom, rgba(240,222,170,0) 0%, rgba(240,222,170,.55) 8%, rgba(240,222,170,.55) 92%, rgba(240,222,170,0) 100%)',
    'box-shadow:0 0 6px rgba(240,222,170,.22), 0 0 14px rgba(240,222,170,.08)']) assert.ok(b.includes(frag), frag);
});
test('٨. أسفل القائمة: بلا صندوق (حتّى عند المرور والتركيز) وخطّ رفيع فوقه من ١٢٪ إلى ١٢٪', () => {
  const foot = block.match(/#omranSidebarFoot#omranSidebarFoot,[^{]*#omranSidebarFoot#omranSidebarFoot:is\(:hover,:focus-within\)\{([^}]*)\}/); assert.ok(foot, 'قاعدة الصندوق');
  assert.ok(/position:relative; background:transparent !important; border:0 !important; box-shadow:none !important;/.test(foot[1]));
  const line = block.match(/#omranSidebarFoot::before\{([^}]*)\}/); assert.ok(line, 'الخطّ');
  const l = line[1].replace(/\s+/g, ' ');
  for (const frag of ['top:0', 'left:12%', 'right:12%', 'height:1px', 'linear-gradient(90deg, rgba(240,222,170,0), rgba(240,222,170,.45), rgba(240,222,170,0))']) assert.ok(l.includes(frag), frag);
});
test('٩. أزرار الشريط: rgba(255,255,255,.86) بلا خلفيّة ولا إطار ولا brightness؛ عند المرور أبيض متوهّج والأيقونة بيضاء بظلّ، انتقال .2s', () => {
  const rest = block.match(/#omranSidebarFoot :is\(\.omNavBtn,\.omIconBtn,\.omModeNav\)\{([^}]*)\}/); assert.ok(rest);
  for (const frag of ['color:rgba(255,255,255,.86) !important', 'background:transparent !important', 'border:0 !important', 'filter:none !important', 'transition:color .2s']) assert.ok(rest[1].includes(frag), frag);
  const hov = block.match(/#omranSidebarFoot :is\(\.omNavBtn,\.omIconBtn,\.omModeNav\):is\(:hover,:focus-visible\)\{([^}]*)\}/); assert.ok(hov);
  assert.ok(hov[1].includes('color:#fff !important; text-shadow:0 0 8px rgba(255,255,255,.7), 0 0 16px rgba(255,255,255,.3); background:transparent !important; filter:none !important'));
  const svg = block.match(/#omranSidebarFoot :is\(\.omNavBtn,\.omIconBtn,\.omModeNav\):is\(:hover,:focus-visible\) svg\{([^}]*)\}/); assert.ok(svg);
  assert.ok(svg[1].includes('stroke:#fff; filter:drop-shadow(0 0 5px rgba(255,255,255,.8))'));
});
test('١٠. «محادثة جديدة»: بلا إطار ولا خلفيّة ولا ظلّ في الحالتين؛ النصّ rgba(255,255,255,.9) → أبيض متوهّج؛ «+» تتوهّج ذهبيًّا', () => {
  const box = block.match(/#omranNewChatBtn#omranNewChatBtn,[^{]*#omranNewChatBtn#omranNewChatBtn:is\(:hover,:focus-visible\)\{([^}]*)\}/); assert.ok(box);
  assert.ok(box[1].includes('background:transparent !important; background-image:none !important; border:0 !important; box-shadow:none !important;'));
  assert.ok(block.includes(D + '#omranNewChatBtn .ncLabel{color:rgba(255,255,255,.9); transition:color .2s, text-shadow .2s;}'));
  assert.ok(block.includes(D + '#omranNewChatBtn:is(:hover,:focus-visible) .ncLabel{color:#fff; text-shadow:0 0 8px rgba(255,255,255,.75), 0 0 18px rgba(255,255,255,.35);}'));
  assert.ok(block.includes(D + '#omranNewChatBtn:is(:hover,:focus-visible) svg{filter:drop-shadow(0 0 6px rgba(240,222,170,.9));}'));
  const tag = HTML.match(/href="css\/بلا-خطوط\.css\?v=(\d+)"/); assert.ok(tag && Number(tag[1]) >= 2, 'الوسم مرفوع فوق 1 (الذي شحن v-no-lines-2)');
});

test('٤. الإطار الذهبيّ ونقاط الخلفيّة وحبيبات الضجيج تختفي، واللوحات تتذهّب عند المرور فقط', () => {
  assert.ok(bare.includes(P + ' body{--om-gold-line:linear-gradient(transparent,transparent); --om-dots:linear-gradient(transparent,transparent);}'));
  const hov = rules.find((r) => r.sels.some((s) => s.includes(':is(#sidebar,#workarea,#omFrameCenter):hover')));
  assert.ok(hov && hov.sels.some((s) => s.includes('main:has(#chatcol:hover) > #omFrameCenter')) && /--om-gold-line:linear-gradient\(rgba\(212,175,55,\.85\)/.test(hov.body));
  assert.ok(bare.includes(P + ' body::after{background-image:none !important;}'));
});

test('٥. صندوق الكتابة وزرّ الإرسال وأسفل الشريط وخطوط om3-line: شفّافة، وذهبيّة عند المرور أو التركيز', () => {
  const find = (frag, val) => rules.some((r) => r.sels.some((s) => s.includes(frag)) && r.body.includes('border-color:' + val + ' !important'));
  for (const f of ['#composerBox#composerBox', '#composerBox > #btnSend', '#omranSidebarFoot#omranSidebarFoot', '.om3-line:not(#om3-a#om3-b)', '.omUpArt.omUpArt', '.pstyleCard']) assert.ok(find(f, 'transparent'), f);
  for (const f of ['#composerBox#composerBox:is(:hover,:focus-within)', '#composerBox > #btnSend:is(:hover', '.om3-hot.om3-line:not(#om3-a#om3-b):hover', '.omUpArt.omUpArt:is(:hover', '#videoMakerModal .vmk-tab:hover']) assert.ok(find(f, 'rgba(212,175,55,.85)'), f);
  /* om3 (أولويّة معرّفين) يسبق قواعد صندوق الكتابة، وإلّا غلب تذهيبَه عند المرور */
  assert.ok(bare.indexOf('.om3-line:not(#om3-a#om3-b){') < bare.indexOf('#composerBox#composerBox:is(:hover'));
});
