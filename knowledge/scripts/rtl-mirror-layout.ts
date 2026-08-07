import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
const SRC = '/tasklet/agent/home/design/deploy/index.html';
const OUT = '/tasklet/agent/home/design/deploy/index-rtl-mirror.html';
let h = readFileSync(SRC, 'utf8');
const before = h;
let n = 0;
function sub(name: string, from: string, to: string) {
  const c = h.split(from).length - 1;
  if (c !== 1) { console.log(`✗ ${name}: عدد المطابقات ${c} (المطلوب 1)`); process.exit(1); }
  h = h.replace(from, to); n++;
  console.log(`✓ ${name}`);
}

// (1) حذف السطر الذي يُلغي انعكاس التخطيط + الشطبين !important على الحدود
sub('CSS: إلغاء row-reverse واستعادة الحدود الحسّاسة للاتجاه',
`/* ---------------- Desktop layout: sidebar يسار ---------------- */
@media (min-width:861px){
  html[dir="rtl"]:not(.mobile-ui) main{flex-direction:row-reverse;}
  html:not(.mobile-ui) #sidebar{border-left:none !important; border-right:1px solid var(--border) !important;}
  html:not(.mobile-ui) #chatcol{border-left:none !important; border-right:1px solid var(--border) !important;}
  html:not(.mobile-ui) body.omranWelcome #workarea,`,
`/* ------- Desktop layout: ينعكس تلقائيًا مع اتجاه اللغة (عربي: الشريط يمين) ------- */
@media (min-width:861px){
  html:not(.mobile-ui) body.omranWelcome #workarea,`);

// (2) السحب: يحسب جهته من موضع المقبض نفسه — يصحّ في كل لغة
sub('JS: تعريف إشارة الاتجاه',
`    var startX = 0, startW = 0, dragging = false;
    function move(x){
      var w = startW + (x - startX);`,
`    var startX = 0, startW = 0, dragging = false, sgn = 1;
    function move(x){
      var w = startW + sgn * (x - startX);`);

sub('JS: حساب الجهة عند بداية السحب',
`      dragging = true; startX = e.clientX; startW = panel.getBoundingClientRect().width;
      el.classList.add('dragging');`,
`      dragging = true; startX = e.clientX; startW = panel.getBoundingClientRect().width;
      sgn = (el.getBoundingClientRect().left < panel.getBoundingClientRect().left) ? -1 : 1;
      el.classList.add('dragging');`);

sub('تعليق: تصحيح وصف المقابض',
`/* ---------- 11) إعادة ربط المقابض (الترتيب البصري صار من اليسار) ---------- */`,
`/* ---------- 11) إعادة ربط المقابض (الجهة تُحسب تلقائيًا من موضع المقبض) ---------- */`);

writeFileSync(OUT, h);
const lb = before.split('\n').length, la = h.split('\n').length;
console.log(`\nالتعديلات: ${n}/4`);
console.log(`الأسطر: ${lb} → ${la}  (صافي ${la - lb})`);
console.log(`الحجم: ${before.length} → ${h.length} بايت`);
console.log(`الناتج: ${OUT}`);
