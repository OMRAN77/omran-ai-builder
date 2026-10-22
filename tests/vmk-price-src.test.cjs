// tests/vmk-price-src.test.cjs — v-vmk-price-src (تدقيق ١٨ أكتوبر «زرّ الإنشاء مكتوب 60 نقطة والتأكيد يقول بيخصم 55»، وأمر المالك
// ٢٠ أكتوبر، الدفعة ١: «الرقم اللي على الزر لازم يطلع من نفس المصدر اللي يخصم، ويطابقه بالضبط»).
// السعر في صانع الفيديو = COSTS في الخادم (ما يخصمه video-create وveo-create وactor-create ويسأل تأكيده) × عدد المشاهد التي
// يطلبها اختيار المدّة فعلًا؛ بلا أسعار من الخادم لا رقم أبدًا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const VIDEO = read('js/video.js');

function pricing(o) {
  const opt = o || {};
  const s = VIDEO.indexOf('var PTS_KEY=');
  const e = VIDEO.indexOf('function ensureCosts(){');
  assert.ok(s > 0 && e > s, 'جدول الأسعار من COSTS بحدوده');
  const ctx = {
    window: { __omranCosts: opt.costs },
    document: { getElementById: (id) => (id === 'videoMakerDuration' ? { value: opt.dur || '5' } : null) },
    authGet: (k) => (k === 'aiapp_username' ? (opt.user || 'sara') : ''),
    ar: () => opt.lang !== 'en', String,
  };
  vm.createContext(ctx);
  vm.runInContext(VIDEO.slice(s, e) + '; this.priceOf = priceOf; this.priceLabel = priceLabel;', ctx);
  return (mode) => ctx.priceLabel(ctx.priceOf(mode));
}

const C = { runway_video: 55, veo_video: 175, minimax_video: 40, omni_video: 120 };

test('١. الزرّ = COSTS نفسه: فيديو AI ٥٥ (كان ٦٠)، السينمائيّ والممثّل ١٧٥ (كانا ٤٠٠)، والقوالب مجّانيّة', () => {
  const p = pricing({ costs: C });
  assert.equal(p('runway'), '55 نقطة');
  assert.equal(p('veo'), '175 نقطة');
  assert.equal(p('actor'), '175 نقطة');
  assert.equal(p('minimax'), '40 نقطة');
  assert.equal(p('omni'), '120 نقطة');
  assert.equal(p('hybrid'), '55 نقطة', 'الدمج = مشهد فيديو AI واحد بين المقدّمة والخاتمة المجّانيّتين');
  assert.equal(p('canvas'), 'مجاني');
  assert.equal(pricing({ costs: C, lang: 'en' })('runway'), '55 pts');
});

test('٢. عدد المشاهد من المدّة كما يطلبها app-11: «20 (مشهدين)» ٢×، و«فيلم متكامل» ٣× (والمالك ٥×)، وكلّ مشهد بسؤاله', () => {
  assert.equal(pricing({ costs: C, dur: 'long20' })('runway'), '110 نقطة · 2×55');
  assert.equal(pricing({ costs: C, dur: 'film' })('runway'), '165 نقطة · 3×55');
  assert.equal(pricing({ costs: C, dur: 'film', user: 'omran' })('runway'), '275 نقطة · 5×55');
  assert.equal(pricing({ costs: C, dur: 'film' })('hybrid'), '', 'الفيلم لا يعمل إلا مع فيديو AI — لا رقم لما لن يجري');
  assert.equal(pricing({ costs: C, dur: 'longMinutes' })('runway'), '', 'عدد مشاهده من السكربت');
  for (const d of ['5', '8', '10', 'adspot', 'reels']) assert.equal(pricing({ costs: C, dur: d })('runway'), '55 نقطة', d);
  // المطابقة مع مسار التوليد الحقيقيّ في app-11
  const a11 = read('js/app-11-video.js');
  assert.match(a11, /const filmScenes = isOwnerAccount\(\) \? 5 : 3;/);
  assert.match(a11, /if\(isLong\)\{\s*const scenePrompts = \[\s*text[^\n]*\n\s*text[^\n]*\n\s*\];/, 'مشهدان بالضبط لـ«20»');
});

test('٣. بلا أسعار من الخادم لا رقم (لا تخمين)، ولا جدول أرقام ثابت في الواجهة', () => {
  assert.equal(pricing({})('runway'), '');
  assert.equal(pricing({ costs: { runway_video: 'x' } })('runway'), '');
  assert.doesNotMatch(VIDEO, /runway:\s*60|veo:\s*400|actor:\s*400|var PTS=\{/);
  const a6 = read('js/app-06-checkout.js');
  assert.match(a6, /function omranLoadCosts\(\)\{/);
  assert.match(a6, /if\(d && d\.costs\) window\.__omranCosts = d\.costs; \/\/ v-vmk-price-src\n\s*if\(d && d\.ok && d\.authed\)\{\n\s*row\.style\.display = 'flex';/, 'صفّ الرصيد يحفظ الأسعار');
});

test('٤. الخادم: الرقم الذي يُعرض هو الذي يُسأل تأكيده ويُخصم في كلّ وضع', () => {
  const pts = read('api/_lib/points.js');
  assert.match(pts, /runway_video: 55,/);
  const vc = read('api/_lib/video-create.js');
  assert.match(vc, /requireConfirmation\(body, pointsLib\.COSTS\.runway_video,/);
  assert.match(vc, /spendPoints\(usageResult\.username, pointsLib\.COSTS\.runway_video, 'runway_video'\)/);
  const veo = read('api/_lib/veo-create.js');
  assert.match(veo, /requireConfirmation\(body, pointsLib\.COSTS\.veo_video, 'فيديو سينمائي بالصوت'\)/);
  const actor = read('api/_lib/actor-create.js');
  assert.match(actor, /COST = pointsLib\.COSTS\.veo_video;/);
  assert.match(pts, /if \(!username\) \{ res\.status\(200\)\.json\(\{ ok: true, authed: false, points: 0, costs: COSTS \}\); return; \}/, 'الزائر يصله المصدر نفسه');
});

test('٥. الزرّ والشريحة وبطاقات الأوضاع تُحدَّث من priceOf في كلّ sync، والأسعار تُطلب مرّة إن غابت', () => {
  const i = VIDEO.indexOf('  function sync(){');
  const body = VIDEO.slice(i, VIDEO.indexOf('syncWrite(); syncChars();', i));
  assert.match(body, /ensureCosts\(\);/);
  assert.match(body, /var gbn=id\('videoMakerGenerateBtn'\), pc=priceOf\(\(mg\|\|\{\}\)\.value\), pl=priceLabel\(pc\);/);
  assert.match(body, /\[\]\.forEach\.call\(mg2\.children,function\(c\)\{ var s=c\.querySelector\('s'\);/);
  assert.match(VIDEO, /el\.querySelector\('s'\)\.textContent=priceLabel\(priceOf\(o\.value\)\);/);
  assert.match(VIDEO, /window\.omranLoadCosts\(\)\.then\(function\(c\)\{ if\(c\) sync\(\); \}\);/);
});
