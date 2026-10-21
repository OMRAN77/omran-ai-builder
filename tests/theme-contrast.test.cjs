'use strict';
/* tests/theme-contrast.test.cjs — v-theme-contrast (أمر المالك ٢١ أكتوبر: «ألوان الخطوط والحدود والفواصل والأيقونات والأزرار لازم تتناسق
   مع كل ثيم وكل خلفية… تباين الكلام مع الخلفية ما يقل عن 4.5:1… اكتب اختبار تلقائي يقيس التباين في كل ثيم، ويطيح إذا نزل عن 4.5:1»).

   لكلّ ثيم من الأربعة والعشرين (الخشبيّ والثلاثة عشر والعشرة)، وللوضعين بلا ثيم، في الوضع الداكن والفاتح، حاسوبًا وجوّالًا:
   كلّ نصّ وخانة وأيقونة ظاهرة في الشاشات الرئيسيّة (المحادثة، والبداية، والقائمة الجانبيّة، والإعدادات وصفحتا الخلفيّات والحساب،
   وقائمتا + والهيدر، وصانع الفيديو) — سلاسلها الحقيقيّة كما قاسها scripts/theme-contrast-probe.mjs (tests/fixtures/theme-contrast-cases.json).
   اللون = التتالي الحقيقيّ لأوراق index.html (مع ما يضعه applyTheme على html، والأنماط المضمَّنة في الصفحة وفي الكود)، والخلفيّة = تركيب
   طبقات كلّ عنصر تحته حتّى صورة الثيم نفسها (بكسلات JPEG الحقيقيّة في موضعها)، والنسبة بصيغة WCAG — العُشر الأدنى من العيّنات.
   الحدّ ٤٫٥ للنصّ و٣ للأيقونة والرمز. ومعه: الألوان الثابتة التي كانت تكسر الثيمات لا تعود (الذهبيّ والأبيض على لون الثيم). */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('./_contrast.cjs');

const FIX = JSON.parse(C.rd('tests/fixtures/theme-contrast-cases.json'));
const VIEW = { d: { W: 1280, H: 900 }, m: { W: 400, H: 860 } };

// [المجلّد، المعرّف، فاتح؟، مشهد؟] — كما في js/app-25-خلفيات.js (الخشبيّ أوّلها بملفّه css/ثيم-خشبي.css)
const THEMES = [['خشبي', 'wood', true, false], ['خشب-داكن', 'darkwood', false, false], ['رخام', 'marble', false, false], ['برمجة', 'code', false, false],
  ['مركبات', 'cars', false, false], ['أطفال', 'kids', true, false], ['طهي', 'cuisine', true, false], ['غروب', 'sunset', false, true],
  ['شاطئ', 'beach', true, true], ['شتاء', 'winter', true, true], ['كراج', 'garage', false, true], ['أنمي', 'anime', false, true],
  ['أمن-سيبراني', 'cyber', false, true], ['فصل', 'school', false, true], ['أنمي-قتالي', 'tactical', false, true], ['ملاك', 'angel', true, true],
  ['أنمي-نيون', 'neonanime', false, true], ['محطّة', 'station', false, true], ['سباق', 'rally', false, true], ['دخان', 'smoke', false, true],
  ['مكتبة', 'library', true, true], ['مقهى', 'cafe', true, true], ['ورشة', 'workshop', false, true], ['عصري', 'modern', true, true]];
const htmlOf = (th) => (!th ? [] : th[1] === 'wood' ? ['bgimg', 'bgimg-light', 'skin-wood']
  : ['bgimg', th[2] ? 'bgimg-light' : 'bgimg-dark', 'skin', 'skin-' + th[1]].concat(th[3] ? ['skin-scene'] : []));

/* الأنماط المضمَّنة: من وسوم index.html والأجزاء (بالمعرّف)، ومن الكود الذي يكتبها (وسم «محتوى مولّد» في js/app-04-i18n-state.js) */
const MARKUP = C.rd('index.html') + C.rd('js/partials-core.js') + C.rd('js/partials-settings.js') + C.rd('js/app-11-video-trends.js');
const INLINE = new Map();
for (const m of MARKUP.matchAll(/<[a-z][\w-]*\b([^>]*?)\bid="([\w-]+)"([^>]*)>/g)) {
  const st = (m[1] + ' ' + m[3]).match(/\bstyle="([^"]*)"/); if (st && !INLINE.has(m[2])) INLINE.set(m[2], st[1]);
}
const AI_TAG = (C.rd('js/app-04-i18n-state.js').match(/aiTag\.style\.cssText\s*=\s*'([^']*)'/) || [])[1] || '';
const withInline = (desc) => {
  const id = (desc.match(/#([\w-]+)/) || [])[1];
  if (id && INLINE.has(id)) return [desc, INLINE.get(id)];
  if (/\.aiGenTag\b/.test(desc)) return [desc, AI_TAG];
  return desc;
};

/* صندوق العنصر (بالبكسل) لموضع التدرّجات والصور، ومنطقة العيّنات = صندوق أعمق عنصر معروف في السلسلة */
function boxer(vp) {
  const B = FIX.boxes[vp];
  return (desc, parents) => {
    const id = (desc.match(/#([\w-]+)/) || [])[1];
    if (id && B['#' + id]) return B['#' + id];
    if (/^header\b/.test(desc) && parents && /^body\b/.test(parents[parents.length - 1] || '')) return B['body > header'] || null;
    for (const k of ['.msg.user', '.msg.assistant', '.msgActionBar', '.hist-item', '.inputbar-tools-below', '.settingsNavGroup']) {
      const cls = k.slice(1).split('.');
      if (cls.every((c) => new RegExp('\\.' + c + '(\\.|$)').test(desc)) && B[k]) return B[k];
    }
    if (/\.vmk-studio\b/.test(desc) && B['#videoMakerModal .vmk-studio']) return B['#videoMakerModal .vmk-studio'];
    return null;
  };
}
const memoSurf = new Map();
function measure(ctx, vp, kind, chain) {
  const o = Object.assign({ mobile: vp === 'm' }, ctx);
  let descs = chain.split(' > ').map(withInline);
  const pe = kind === 'ph' ? 'placeholder' : null;
  const box = boxer(vp);
  /* سهم طيّ القائمة على الحاسوب يُرسم فوق زرّ «محادثة جديدة» (v-frame-design ٢) — سطحه الزرّ */
  let surfDescs = descs;
  if (vp === 'd' && /#sidebarCloseBtn\b/.test(chain)) surfDescs = descs.slice(0, descs.findIndex((d) => /#sidebarCloseBtn/.test(d))).concat(['button#omranNewChatBtn']);
  const plain = descs.map((d) => (Array.isArray(d) ? d[0] : d));
  let ink;
  if (kind === 'icon') {
    const ch = C.chainOf(descs, o);
    const st = C.cssValue(ch, 'stroke', o), fi = C.cssValue(ch, 'fill', o);
    const pick = [st, fi].find((w) => w && C.parseColor(w.value));
    ink = pick ? { c: C.parseColor(pick.value), where: pick.where } : C.inkOf(descs, o);
  } else ink = C.inkOf(descs, o, pe);
  if (!ink.c) return null;
  const key = JSON.stringify([ctx, vp, surfDescs]);
  let surf = memoSurf.get(key);
  if (!surf) { surf = C.surfaceOf(surfDescs, o, VIEW[vp], box); memoSurf.set(key, surf); }
  let region = null;
  for (let i = plain.length - 1; i >= 0 && !region; i--) region = box(plain[i], plain.slice(0, i));
  region = region || [0, 0, VIEW[vp].W, VIEW[vp].H];
  /* أسماء الشريط السفليّ على الجوّال تحت أيقوناتها: النصف الأسفل من الشريط (حيث يغمق نحاس الخشبيّ) */
  if (/#omranBottomNav\b/.test(chain) && /> span(\.[\w-]+)?$/.test(chain)) { const h = region[3] - region[1]; region = [region[0], region[1] + h * 0.5, region[2], region[3] - h * 0.04]; }
  /* زرّ أو كبسولة أو صفّ: السطر في وسطه (كمستطيلات السطور في مسبار البكسلات) لا على حافّتيه */
  else if (region[3] - region[1] < 80) { const h = region[3] - region[1]; region = [region[0], region[1] + h * 0.22, region[2], region[3] - h * 0.22]; }
  const r = C.contrastOn(ink.c, C.samples(surf.stack, region, 12), surf.opacity);
  return { r, ink: C.hex(ink.c), where: ink.where };
}
function audit(ctx) {
  const bad = [];
  for (const vp of ['d', 'm']) for (const [kind, vps, chain] of FIX.cases) {
    if (!vps.includes(vp)) continue;
    const m = measure(ctx, vp, kind, chain); if (!m) continue;
    const need = kind === 'icon' || kind === 'sym' ? 3 : 4.5;
    if (m.r < need) bad.push((vp === 'd' ? 'حاسوب' : 'جوّال') + ' ' + m.r.toFixed(2) + ' < ' + need + ' ' + m.ink + ' ' + chain.split(' > ').slice(-3).join(' > ') + '  ⇐ ' + (m.where || '').slice(0, 110));
  }
  return bad;
}
const report = (name, bad) => {
  if (process.env.CX_LIST) bad.forEach((x) => console.log('CX ' + name + ' ' + x)); // للتطوير: كلّ ما تحت الحدّ باسم ثيمه
  assert.equal(bad.length, 0, name + ': ' + bad.length + ' عنصرًا تحت الحدّ:\n  ' + bad.slice(0, 30).join('\n  '));
};

test('١. بلا ثيم — الوضع الداكن والفاتح: كلّ نصّ ≥ ٤٫٥ وكلّ أيقونة ≥ ٣ على سطحه', () => {
  report('بلا ثيم', ['dark', 'light'].flatMap((mode) => audit({ mode, html: [] }).map((x) => mode + ' ' + x)));
});

for (const th of THEMES) {
  test('٢. ثيم «' + th[0] + '» — الداكن والفاتح، حاسوب وجوّال: كلّ نصّ ≥ ٤٫٥ وكلّ أيقونة ≥ ٣ على سطحه', () => {
    report(th[0], ['dark', 'light'].flatMap((mode) => audit({ mode, html: htmlOf(th) }).map((x) => mode + ' ' + x)));
  });
}

/* خلفيّات الشاشة والثلاثيّة: ما فوق الصورة في المحادثة (رسالتا المساعد والمستخدم وأيقونات الرسالة) */
const OVER = [['text', 'body > main > div#chatcol > div#messages > div > div.msg.assistant.om3-line > div.msg-text > div.md-line > span.tts-word'],
  ['text', 'body > main > div#chatcol > div#messages > div > div.msg.user.om3-line > div.msg-text'],
  ['icon', 'body > main > div#chatcol > div#messages > div > div.msgActionBar.msgReplyActions > button > svg']];
function auditOver(ctx) {
  const bad = [];
  for (const vp of ['d', 'm']) for (const [kind, chain] of OVER) {
    const m = measure(ctx, vp, kind, chain); if (!m) continue;
    const need = kind === 'icon' ? 3 : 4.5;
    if (m.r < need) bad.push((vp === 'd' ? 'حاسوب' : 'جوّال') + ' ' + m.r.toFixed(2) + ' < ' + need + ' ' + m.ink + ' ' + chain.split(' > ').slice(-2).join(' > '));
  }
  return bad;
}

test('٤. خلفيّات الشاشة الـ١١٥ (الصورة الحقيقيّة ووشاحها، الداكن والفاتح): الرسائل وأيقوناتها ≥ ٤٫٥ و٣ فوق كلّ صورة', () => {
  const idx = JSON.parse(C.rd('assets/خلفيات/فهرس.json')).صور;
  assert.ok(idx.length >= 100, 'الفهرس: ' + idx.length);
  const bad = [];
  for (const e of idx) for (const mode of ['dark', 'light']) {
    /* المصغّر نسخة مصغّرة من الصورة نفسها (النسبة نفسها) — بكسلاته تكفي للتوزيع وأسرع ١٥ مرّة */
    const url = 'assets/خلفيات/مصغّرات/' + e.ملف;
    for (const x of auditOver({ mode, html: ['bgimg', e.فاتحة ? 'bgimg-light' : 'bgimg-dark'], bgimgUrl: '/' + url })) bad.push(e.ملف + ' ' + mode + ' ' + x);
  }
  report('خلفيّات الشاشة', bad);
});

test('٥. الخلفيّات الثلاثيّة: الرسائل وأيقوناتها ≥ ٤٫٥ و٣ أيًّا كان ما ترسمه (فوق الأبيض والأسود معًا)، في الوضعين', () => {
  const bad = [];
  for (const mode of ['dark', 'light']) for (const canvas of ['#ffffff', '#000000', '#7f7f7f']) {
    for (const x of auditOver({ mode, html: [], body: ['vantaActive'], canvas })) bad.push(mode + ' ' + canvas + ' ' + x);
  }
  report('الخلفيّات الثلاثيّة', bad);
});

test('٣. الألوان الثابتة التي كسرت الثيمات صارت من لوحة الثيم: الرابط والشرارة وصفّ المالك والكتابة على لون الثيم', () => {
  const css = C.rd('css/ثيمات.css');
  assert.match(css, /html\.skin #messages \.msg a, html\.skin #messages \.msg-text a\{color:var\(--th-link\) !important;\}/, 'الرابط بلون الثيم');
  assert.match(css, /html\.skin #stockTickerToggle\.tickerAiCollapsed #stockTickerAiIcon\{color:var\(--th-spark\);\}/, 'الشرارة بلون الثيم');
  assert.match(css, /\.settingsNavOwner \.settingsNavLabel\{color:var\(--th-accent-ink\) !important;\}/, 'صفّ المالك');
  assert.match(css, /html\.skin \.bgImgRotOpt\.active, html\.skin \.bgImgOpt\.active::after\{color:var\(--th-on-accent\);\}/, 'الاختيار المفعَّل بحبر الثيم');
  /* والفعل في التتالي: رابط «غروب» داكنًا ليس الذهبيّ الثابت */
  const o = { mode: 'dark', html: htmlOf(THEMES[7]) };
  const a = C.inkOf(['body', 'main', 'div#chatcol', 'div#messages', 'div', 'div.msg.assistant.om3-line', 'div.msg-text', 'div.md-line', 'span.tts-word', 'a'], o);
  assert.notEqual(a.value, '#e3b341', 'رابط الفقاعة: ' + a.where);
});
