// scripts/edu-bg-css.mjs — يولّد css/تعليم-خلفية.css من assets/edu-bg/meta.json (v-edu-mock-bg).
//   node scripts/edu-bg-css.mjs            # يكتب الملفّ
//   node scripts/edu-bg-css.mjs --check    # يخرج 1 إن كان الملفّ المكتوب يختلف عن المولَّد (يستعمله الاختبار)
// meta.json: themes (لون التطبيق ← أرقام الصور: d حاسوب، dl حاسوب فاتح، m جوّال/نموذج، ml جوّال فاتح)، palette (ألوان مقيسة من كلّ صورة)،
// erase (مستطيلات الواجهة المرسومة التي مُسحت، بالبكسل على الأصل)، sizes (أبعاد الأصل). الألوان تُكتب كما قيست؛ الاستثناء الوحيد: نصّ يقلّ
// تباينه عن ٣:١ (أو ٤:١ لنصّ الجسم) على خلفيّة مكان المسح يُمال نحو الأبيض/الأسود بخطوات ١٠٪ حتّى يُقرأ، وتُطبع هذه الحالات.
import { readFileSync, writeFileSync } from 'node:fs';

const META = JSON.parse(readFileSync('assets/edu-bg/meta.json', 'utf8'));
const { themes: T, palette: P, erase: E, sizes: SZ } = META;
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hx = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const lum = (c) => { const ch = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]); };
const contrast = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
const adj = [];
function readable(h, bg, need, who) {
  let c = rgb(h); const b = rgb(bg);
  if (contrast(c, b) >= need) return h;
  const target = lum(b) < 0.4 ? [255, 255, 255] : [0, 0, 0];
  for (let k = 0.1; contrast(c, b) < need && k <= 1.0; k += 0.1) c = c.map((v, i) => v * (1 - k) + target[i] * k);
  adj.push(who + ': ' + h + ' ' + bg + '→' + hx(c)); return hx(c);
}
const f = (v) => String(+v.toFixed(4));
const area = (r) => (r[2] - r[0]) * (r[3] - r[1]);
/* هندسة اللوح: المستطيل الرئيسيّ (الأكبر) + المستطيل السفليّ (الثاني إن تجاوز ٣٪ من الصورة) → صندوق يجمعهما، واللوح مقصوص بشكل L
   يستثني ما ليس ممسوحًا: زاوية علويّة يمنى (x > رئيسيّ.x1 فوق السفليّ) وزاوية سفليّة يسرى (x < سفليّ.x0 تحت الرئيسيّ). كلّها كسور من أبعاد الصورة
   (الصندوق: x0 x1 y0 y1؛ القصّ: cx1 يمين الرئيسيّ، cy0 أعلى السفليّ، cbl يسار السفليّ، cy1 أسفل الرئيسيّ) وتُحوَّل بكسلًا في CSS فلا تتأثّر بقصّ الصورة
   على الحوافّ. أسماء الجوّال بسابقة m — لا تستعمل m + اسم آخر يصنع تصادمًا (--edu-mx1 هو x1 الجوّال). */
function geom(idx, p) {
  const [W, H] = SZ[idx]; const rs = [...E[idx]].sort((a, b) => area(b) - area(a));
  const main = rs[0]; const bot = rs[1] && area(rs[1]) > 0.03 * W * H ? rs[1] : null;
  const U = bot ? [Math.min(main[0], bot[0]), Math.min(main[1], bot[1]), Math.max(main[2], bot[2]), Math.max(main[3], bot[3])] : main;
  const v = { R: f(W / H), x0: f(U[0] / W), x1: f(U[2] / W), y0: f(U[1] / H), y1: f(U[3] / H),
    cx1: f(main[2] / W), cy0: f((bot ? bot[1] : U[3]) / H), cbl: f((bot ? bot[0] : U[0]) / W), cy1: f(main[3] / H) };
  return Object.entries(v).map(([k, val]) => '--edu-' + p + k + ':' + val + ';').join('');
}
function block(name, pd, pm, mode) {
  const d = P[pd]; const bg = d.bg; const suf = mode === 'light' ? '-light' : '';
  const title = readable(d.title, bg, 3.0, name + '/title'), text = readable(d.text, bg, 4.0, name + '/text'), muted = readable(d.muted, bg, 3.0, name + '/muted');
  const v = { 'art-d': `url("/assets/edu-bg/${name}-desktop${suf}.webp?v=1")`, bg, title, text, muted, bar: d.bar, plus: d.plus,
    'plus-ink': readable(title, d.plus, 3.0, name + '/plus-ink'), 'bar-ink': readable(title, d.bar, 3.0, name + '/bar-ink'),
    t1: d.t1, t2: d.t2, t3: d.t3, t4: d.t4, card: d.card, 'card-rgb': rgb(d.card).join(','), video: d.video };
  let g = geom(pd, '');
  if (pm != null) {
    const m = P[pm];
    v['art-m'] = `url("/assets/edu-bg/${name}-mobile${suf}.webp?v=1")`;
    v['f-title'] = readable(m.title, m.bg, 3.0, name + '/f-title'); v['f-label'] = readable(m.label || m.title, m.bg, 3.0, name + '/f-label');
    v['f-field'] = m.field || m.card || d.card; v['f-btn'] = m.btn || m.bar || d.bar; v['f-drop'] = m.drop || v['f-field'];
    v['f-btn-ink'] = readable(v['f-title'], v['f-btn'], 3.0, name + '/f-btn-ink'); v['f-bg'] = m.bg; v['f-ink'] = readable(m.title, m.field || m.bg, 4.0, name + '/f-ink');
    v['f-card-rgb'] = rgb(m.card || m.field || d.card).join(',');
    g += geom(pm, 'm');
  } else {
    Object.assign(v, { 'art-m': v['art-d'], 'f-title': title, 'f-label': text, 'f-field': d.card, 'f-btn': d.bar, 'f-drop': d.card, 'f-btn-ink': v['bar-ink'], 'f-bg': bg, 'f-ink': text, 'f-card-rgb': v['card-rgb'] });
    g += geom(pd, 'm');
  }
  return Object.entries(v).map(([k, val]) => '--edu-' + k + ':' + val + ';').join('') + g;
}
const out = [`/* v-edu-mock-bg — خلفيّات قسم «التعليم» من نماذج المالك (٢٠ أكتوبر: «رتّبهم في التعليم مع تنسيق الألوان، والمتكرّر لا تحطّه، ودقّق ١٠٠٪»).
   كلّ لون من ألوان التطبيق الثمانية (دائرة الإعدادات) له صورة حاسوب (عرضيّة) وصورة جوّال/نموذج «إضافة محاضرة» (طوليّة) من صوره؛ الواجهة
   المرسومة داخل الصورة مُسحت محلّيًّا (assets/edu-bg/meta.json: المستطيلات والألوان المقيسة بالبكسل) والزينة على الأطراف بقيت. اللوح .eduWrap
   يوضع على مستطيلات المسح بالضبط (كسور من أبعاد الصورة + وحدات الحاوية cqw/cqh لحساب موضع الصورة بـcover، وقصّ L يستثني ما لم يُمسح:
   الكتاب أسفل اليسار والكرة أعلى اليمين) ويغطّيها زجاجًا: اللوح ٢٢٪ + البطاقة فوقه ٢٢٪ = ٣٩٪ تعتيمًا كلّيًّا (≤ ٤٠٪ بشرط المالك) مع تغبيش 7px.
   ألوان الأزرار والنصّ من الصورة نفسها (معدَّلة فقط حين يقلّ التباين عن ٣:١ — مذكورة في DECISIONS). js/edu.js يضع data-edu-bg=<اللون> على
   #eduHubModal ويتابعه فيتبدّل فورًا. يُحمَّل آخرًا لأنّ خلفيّة eduWrap في أربعة ملفّات قبله بـ!important.
   *** ملفّ مولَّد: node scripts/edu-bg-css.mjs — عدّل meta.json أو السكربت ثمّ ولّد، لا تحرّره بالعين (الاختبار يقارنه بالمولَّد). *** */`];
for (const [name, t] of Object.entries(T)) {
  out.push(`html:root:root #eduHubModal[data-edu-bg="${name}"]{${block(name, String(t.d), t.m != null ? String(t.m) : null, 'dark')}}`);
  if (t.dl != null) out.push(`html[data-mode="light"]:root:root #eduHubModal[data-edu-bg="${name}"]{${block(name, String(t.dl), t.ml != null ? String(t.ml) : null, 'light')}}`);
}
out.push(String.raw`
/* ===== الخلفيّة على الصفحة كلّها، واللوح على مستطيلات المسح بالضبط =====
   موضع الصورة بـcover داخل الحاوية: عرضها المعروض iw = max(عرض الحاوية, ارتفاعها×R) وارتفاعها ih = max(ارتفاع الحاوية, عرضها÷R)، متمركزة؛
   فحافة اللوح = إزاحة التمركز + الكسر × البعد المعروض، ولا تخرج عن الحاوية (max(0px,…)) حين تُقصّ الصورة على الجوّال.
   القصّ L بالبكسل: (0,0)→(Xc,0)→(Xc,Yc)→(100%,Yc)→(100%,100%)→(Xb,100%)→(Xb,Yb)→(0,Yb) — مستطيل عاديّ حين لا مستطيل سفليّ. */
html:root:root #eduHubModal[data-edu-bg]{background:var(--edu-art-d) center/cover no-repeat, var(--edu-bg) !important;color:var(--edu-text);backdrop-filter:none !important;-webkit-backdrop-filter:none !important;container-type:size;}
html:root:root #eduHubModal[data-edu-bg] .eduWrap{
  --iw:max(100cqw, calc(100cqh * var(--edu-R)));--ih:max(100cqh, calc(100cqw / var(--edu-R)));
  --ox:calc((100cqw - var(--iw)) / 2);--oy:calc((100cqh - var(--ih)) / 2);
  --pl:max(0px, calc(var(--ox) + var(--edu-x0) * var(--iw)));--pr:max(0px, calc(var(--ox) + (1 - var(--edu-x1)) * var(--iw)));
  --pt:max(0px, calc(var(--oy) + var(--edu-y0) * var(--ih)));--pb:max(0px, calc(var(--oy) + (1 - var(--edu-y1)) * var(--ih)));
  --Xc:calc(var(--ox) + var(--edu-cx1) * var(--iw) - var(--pl));--Yc:calc(var(--oy) + var(--edu-cy0) * var(--ih) - var(--pt));
  --Xb:calc(var(--ox) + var(--edu-cbl) * var(--iw) - var(--pl));--Yb:calc(var(--oy) + var(--edu-cy1) * var(--ih) - var(--pt));
  --edu-nrpx:max(0px, calc(100cqw - var(--pl) - var(--pr) - var(--Xc)));--edu-nlpx:max(0px, var(--Xb));
  position:absolute;left:var(--pl);right:var(--pr);top:var(--pt);bottom:var(--pb);
  width:auto !important;height:auto !important;max-width:none !important;margin:0 !important;
  clip-path:polygon(0 0, var(--Xc) 0, var(--Xc) var(--Yc), 100% var(--Yc), 100% 100%, var(--Xb) 100%, var(--Xb) var(--Yb), 0 var(--Yb));
  background:rgba(var(--edu-card-rgb),.22) !important;-webkit-backdrop-filter:blur(7px);backdrop-filter:blur(7px);
  border:1px solid rgba(255,255,255,.14) !important;border-radius:22px;box-shadow:none !important;overflow:hidden;}
/* الصفوف لا تدخل الزاويتين المستثناتين: الكلّ يترك الزاوية العلويّة اليمنى، والصفوف الأخيرة تترك السفليّة اليسرى (اتّجاه فيزيائيّ لأنّه هندسة الصورة) */
html:root:root #eduHubModal[data-edu-bg] .eduHead{background:transparent !important;border-bottom:none !important;padding:14px 18px 8px;margin-right:var(--edu-nrpx);}
html:root:root #eduHubModal[data-edu-bg] .eduBody{background:transparent;padding:4px 18px 20px;}
html:root:root #eduHubModal[data-edu-bg] .eduMain{display:flex;flex-direction:column;gap:12px;margin-right:var(--edu-nrpx);}
html:root:root #eduHubModal[data-edu-bg] :is(.eduTwo,#eduUpWrap,#eduOldEduRow){margin-left:var(--edu-nlpx) !important;}
@media (max-width:700px){
  html:root:root #eduHubModal[data-edu-bg]{background-image:var(--edu-art-m) !important;--edu-R:var(--edu-mR);--edu-x0:var(--edu-mx0);--edu-x1:var(--edu-mx1);--edu-y0:var(--edu-my0);--edu-y1:var(--edu-my1);--edu-cx1:var(--edu-mcx1);--edu-cy0:var(--edu-mcy0);--edu-cbl:var(--edu-mcbl);--edu-cy1:var(--edu-mcy1);--edu-card-rgb:var(--edu-f-card-rgb);--edu-title:var(--edu-f-title);--edu-text:var(--edu-f-ink);--edu-muted:var(--edu-f-label);--edu-bar:var(--edu-f-btn);--edu-bar-ink:var(--edu-f-btn-ink);}
  html:root:root #eduHubModal[data-edu-bg] .eduWrap{border-radius:16px;}
  html:root:root #eduHubModal[data-edu-bg] .eduHead{padding:calc(10px + min(var(--omran-sat, env(safe-area-inset-top,0px)), 62px)) 12px 6px;}
  html:root:root #eduHubModal[data-edu-bg] .eduBody{padding:2px 12px 16px;}
}
html.mobile-ui:root:root #eduHubModal[data-edu-bg]{background-image:var(--edu-art-m) !important;--edu-R:var(--edu-mR);--edu-x0:var(--edu-mx0);--edu-x1:var(--edu-mx1);--edu-y0:var(--edu-my0);--edu-y1:var(--edu-my1);--edu-cx1:var(--edu-mcx1);--edu-cy0:var(--edu-mcy0);--edu-cbl:var(--edu-mcbl);--edu-cy1:var(--edu-mcy1);--edu-card-rgb:var(--edu-f-card-rgb);--edu-title:var(--edu-f-title);--edu-text:var(--edu-f-ink);--edu-muted:var(--edu-f-label);--edu-bar:var(--edu-f-btn);--edu-bar-ink:var(--edu-f-btn-ink);}
html.mobile-ui:root:root #eduHubModal[data-edu-bg] .eduWrap{border-radius:16px;}
html.mobile-ui:root:root #eduHubModal[data-edu-bg] .eduBody{padding:2px 12px 16px;}

/* ===== البطاقات داخل اللوح: ٢٢٪ أخرى (المجموع ٣٩٪) بلا تغبيش ثانٍ ===== */
html:root:root #eduHubModal[data-edu-bg] :is(.eduBx,.eduLessonRow,#eduCurricBtn){background:rgba(var(--edu-card-rgb),.22) !important;border:1px solid rgba(255,255,255,.16) !important;border-radius:16px !important;box-shadow:none;color:var(--edu-text) !important;}
html:root:root #eduHubModal[data-edu-bg] .eduHead h2{background:none !important;-webkit-text-fill-color:var(--edu-title) !important;color:var(--edu-title) !important;font-size:26px;font-weight:800;}
html:root:root #eduHubModal[data-edu-bg] .eduHead h2 svg{stroke:var(--edu-title) !important;}
html:root:root #eduHubModal[data-edu-bg] .eduIconBtn{color:var(--edu-title) !important;border-color:rgba(255,255,255,.18) !important;background:rgba(var(--edu-card-rgb),.22) !important;}
html:root:root #eduHubModal[data-edu-bg] .eduStreak{color:var(--edu-title) !important;border-color:var(--edu-title) !important;background:rgba(var(--edu-card-rgb),.22) !important;}
html:root:root #eduHubModal[data-edu-bg] :is(.eduPasteToggle,.eduLinkBtn){color:var(--edu-muted) !important;font-size:13px;}
html:root:root #eduHubModal[data-edu-bg] .eduNote{color:var(--edu-muted) !important;}
/* شريط الرفع: لون شريط الصورة وقرص «+» بلونه (زرّ ملوّن كالنموذج، لا تعتيم) */
html:root:root #eduHubModal[data-edu-bg] .eduUploadBtn{display:flex;align-items:center;justify-content:center;gap:16px;padding:15px;border:1px solid rgba(255,255,255,.22) !important;border-radius:20px !important;background:var(--edu-bar) !important;color:var(--edu-bar-ink) !important;box-shadow:0 8px 24px rgba(0,0,0,.25) !important;}
html:root:root #eduHubModal[data-edu-bg] .eduUploadBtn svg{box-sizing:border-box;width:40px;height:40px;padding:9px;border-radius:50%;background:var(--edu-plus);color:var(--edu-plus-ink);stroke-width:3;flex:0 0 auto;}
html:root:root #eduHubModal[data-edu-bg] .eduUpTxt{display:flex;flex-direction:column;text-align:start;}
html:root:root #eduHubModal[data-edu-bg] .eduUpTxt b{font-size:22px;font-weight:800;}
html:root:root #eduHubModal[data-edu-bg] .eduUpTxt small{font-size:13px;opacity:.8;font-weight:600;}
html:root:root #eduHubModal[data-edu-bg] .eduPasteToggle{align-self:flex-start;margin:-4px 4px -8px;}
html:root:root #eduHubModal[data-edu-bg] :is(#eduCurricBtn,.eduLessonRow){display:flex;align-items:center;gap:12px;padding:12px 20px;font-size:15.5px;margin:0 !important;min-height:0;justify-content:flex-start;font-weight:500;text-align:start;}
html:root:root #eduHubModal[data-edu-bg] .eduLessonRow .eduLessonTitle{font-size:15.5px;color:var(--edu-text) !important;flex:1;}
html:root:root #eduHubModal[data-edu-bg] #eduOldEduRow svg{color:var(--edu-title);opacity:1 !important;}
/* البطاقات الأربع بألوان بطاقات الصورة (أزرار ملوّنة كالنموذج) */
html:root:root #eduHubModal[data-edu-bg] .eduPlusGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;}
html:root:root #eduHubModal[data-edu-bg] .eduPlusTile{position:relative;overflow:hidden;min-height:112px;padding:14px;display:block;text-align:start;background:linear-gradient(160deg,rgba(255,255,255,.14),transparent 60%),color-mix(in srgb,var(--c) 40%,transparent) !important;border:1px solid color-mix(in srgb,var(--c) 70%,white) !important;border-radius:16px !important;box-shadow:none;}
html:root:root #eduHubModal[data-edu-bg] .eduPlusTile:nth-child(4n+1){--c:var(--edu-t1);}
html:root:root #eduHubModal[data-edu-bg] .eduPlusTile:nth-child(4n+2){--c:var(--edu-t2);}
html:root:root #eduHubModal[data-edu-bg] .eduPlusTile:nth-child(4n+3){--c:var(--edu-t3);}
html:root:root #eduHubModal[data-edu-bg] .eduPlusTile:nth-child(4n+4){--c:var(--edu-t4);}
html:root:root #eduHubModal[data-edu-bg] .eduPlusIcon{display:grid;place-items:center;width:44px;height:44px;border-radius:12px;font-size:22px;background:color-mix(in srgb,var(--c) 55%,white 10%) !important;border:1px solid rgba(255,255,255,.35) !important;box-shadow:none !important;margin-bottom:8px;}
html:root:root #eduHubModal[data-edu-bg] .eduPlusTitle{display:block;font-size:16px;font-weight:700;margin-bottom:4px;color:var(--edu-text) !important;}
html:root:root #eduHubModal[data-edu-bg] .eduPlusSub{display:block;font-size:12.5px;color:var(--edu-muted) !important;}
html:root:root #eduHubModal[data-edu-bg] .eduPlusTile:hover{border-color:var(--c) !important;}
@media (max-width:700px){html:root:root #eduHubModal[data-edu-bg] .eduPlusGrid{grid-template-columns:1fr 1fr;}}
/* بطاقتا «لغة امتحاني» و«موادي» */
html:root:root #eduHubModal[data-edu-bg] .eduTwo{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
@media (max-width:700px){html:root:root #eduHubModal[data-edu-bg] .eduTwo{grid-template-columns:1fr;}}
html:root:root #eduHubModal[data-edu-bg] .eduLangCard{padding:12px 18px;}
html:root:root #eduHubModal[data-edu-bg] .eduLangCard>div:first-child{display:flex !important;flex-direction:column !important;align-items:stretch !important;gap:0 !important;margin:0 !important;}
html:root:root #eduHubModal[data-edu-bg] .eduLangCard>div:first-child>span{font-size:16px;font-weight:700;opacity:1 !important;color:var(--edu-text);}
html:root:root #eduHubModal[data-edu-bg] .eduLangCard select{margin-top:8px;padding:9px 14px !important;border:1px solid rgba(255,255,255,.25) !important;border-radius:12px !important;font-size:14px !important;color:var(--edu-text) !important;background:rgba(var(--edu-card-rgb),.22) !important;}
html:root:root #eduHubModal[data-edu-bg] .eduLangCard>div:last-child{font-size:12px !important;opacity:1 !important;color:var(--edu-muted);margin:6px 0 0 !important;}
html:root:root #eduHubModal[data-edu-bg] .eduSubjCard{padding:12px 18px;text-align:center;}
html:root:root #eduHubModal[data-edu-bg] .eduSubjCard .eduSecTitle{margin:0 0 10px;font-size:16px;font-weight:700;color:var(--edu-title) !important;text-align:start;}
html:root:root #eduHubModal[data-edu-bg] .eduEmpty{border:none;background:none;padding:0;font-size:14px;color:var(--edu-muted) !important;text-align:center;}
html:root:root #eduHubModal[data-edu-bg] .eduSecTitle{color:var(--edu-title) !important;}
html:root:root #eduHubModal[data-edu-bg] .eduPrimary{background:var(--edu-bar) !important;color:var(--edu-bar-ink) !important;border-radius:14px !important;font-weight:800;border:1px solid rgba(255,255,255,.22) !important;}
/* ===== نموذج «إضافة محاضرة»: صورته الطوليّة خلفه بطبقة لونيّة ٣٠٪ (≤ ٤٠٪) وحقوله بألوانها ===== */
html:root:root #eduHubModal[data-edu-bg] .eduUpOv{background:rgba(0,0,0,.25) !important;}
html:root:root #eduHubModal[data-edu-bg] .eduUpCard{background:linear-gradient(color-mix(in srgb,var(--edu-f-bg) 30%,transparent),color-mix(in srgb,var(--edu-f-bg) 30%,transparent)),var(--edu-art-m) center/cover no-repeat, var(--edu-f-bg) !important;color:var(--edu-f-ink) !important;border:1px solid rgba(255,255,255,.3) !important;border-radius:22px !important;padding:22px 44px 20px !important;box-shadow:0 18px 50px rgba(0,0,0,.35) !important;}
html:root:root #eduHubModal[data-edu-bg] .eduUpLab{color:var(--edu-f-label) !important;text-shadow:0 1px 2px rgba(0,0,0,.25);}
html:root:root #eduHubModal[data-edu-bg] .eduUpFld{background:var(--edu-f-field) !important;border:1px solid color-mix(in srgb,var(--edu-f-btn) 45%,transparent) !important;border-radius:12px !important;color:var(--edu-f-ink) !important;}
html:root:root #eduHubModal[data-edu-bg] .eduUpDrop{background:var(--edu-f-drop) !important;border:1.5px dashed color-mix(in srgb,var(--edu-f-btn) 60%,transparent) !important;border-radius:14px !important;color:var(--edu-f-ink) !important;}
html:root:root #eduHubModal[data-edu-bg] .eduUpPick{background:var(--edu-f-btn) !important;color:var(--edu-f-btn-ink) !important;border:none !important;font-weight:700;}
html:root:root #eduHubModal[data-edu-bg] .eduUpCard .eduPrimary{background:var(--edu-f-btn) !important;color:var(--edu-f-btn-ink) !important;}
html:root:root #eduHubModal[data-edu-bg] .eduUpCard .eduUpFiles{color:var(--edu-f-label) !important;}
/* بلا ثيم: الشكل القديم كما كان */
#eduHubModal:not([data-edu-bg]) .eduUpTxt small{display:none;}
#eduHubModal:not([data-edu-bg]) .eduUpTxt b{font-weight:inherit;}
`);
const css = out.join('\n');
if (process.argv.includes('--check')) {
  const cur = readFileSync('css/تعليم-خلفية.css', 'utf8');
  if (cur !== css) { console.log('✗ css/تعليم-خلفية.css يختلف عن المولَّد — شغّل node scripts/edu-bg-css.mjs'); process.exit(1); }
  console.log('✓ مطابق'); process.exit(0);
}
writeFileSync('css/تعليم-خلفية.css', css);
console.log('✓ css/تعليم-خلفية.css · ' + adj.length + ' تعديل تباين:\n  ' + adj.join('\n  '));
