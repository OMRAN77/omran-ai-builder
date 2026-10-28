// tests/owner-modes.test.cjs — v-owner-modes (المالك ١٧ أكتوبر: «أخفي الثلاثة وخلها لي المالك فقط»):
// «فيديو اقتصادي» و«فيديو سينمائي» (Omni) و«دمج الاثنين» تختفي لغير المالك، وصورة «ممثل يتكلم» رجل إماراتيّ.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'js/video.js'), 'utf8');

function load(owner, mode) {
  const start = js.indexOf('  var OWNER_MODES=');
  const end = js.indexOf('\n  }\n', js.indexOf('function guardModes(')) + 4;
  assert.ok(start > 0 && end > start);
  const opts = ['canvas', 'runway', 'minimax', 'omni', 'hybrid', 'veo', 'actor'].map((v) => ({ value: v, hidden: false, disabled: false }));
  const sel = { value: mode, options: opts, changes: 0, dispatchEvent() { this.changes++; } };
  const TABS = ['trend', 'canvas', 'runway', 'minimax', 'omni', 'hybrid', 'veo', 'actor', 'clean'];
  const f = new Function('TABS', 'drOwner', 'id', 'Event', js.slice(start, end) + '\nreturn {tabsFor:tabsFor,guardModes:guardModes};');
  const api = f(TABS, () => owner, () => sel, function Event() {});
  return { api, sel, opts };
}

/* v-video-durations (٢٧ أكتوبر): «ممثل يتكلم» للمالك حتّى تنجح تجربته — كان ظاهرًا للزبون بسعره ثمّ «🔒 مقتصر على المالك».
   v-five-sections (٢٨ أكتوبر): «جودة عالية» و«بدون ذكاء» للمالك، و«فيديو سريع» للجميع وافتراضيّ الزبون */
test('غير المالك: الترندات و«فيديو سريع» و«سينمائي» و«تحسين الجودة» (و«تعديل الفيديو» يُدخله video-edit)، والخيارات مخفيّة، ووضعه يرجع إلى «فيديو سريع»', () => {
  const { api, sel, opts } = load(false, 'omni');
  assert.deepStrictEqual(api.tabsFor(), ['trend', 'minimax', 'veo', 'clean']);
  api.guardModes();
  assert.strictEqual(sel.value, 'minimax');
  assert.strictEqual(sel.changes, 1);
  assert.deepStrictEqual(opts.filter((o) => o.hidden && o.disabled).map((o) => o.value), ['canvas', 'runway', 'omni', 'hybrid', 'actor']);
});

test('المالك: كلّ الأقسام التسعة ووضعه لا يتغيّر', () => {
  const { api, sel, opts } = load(true, 'hybrid');
  assert.strictEqual(api.tabsFor().length, 9);
  api.guardModes();
  assert.strictEqual(sel.value, 'hybrid');
  assert.strictEqual(sel.changes, 0);
  assert.ok(opts.every((o) => !o.hidden && !o.disabled));
});

test('التوصيل: التبويب والبطاقة والفتح يمرّون بالحارس', () => {
  assert.ok(js.includes("tabsFor().concat(drOwner()?['director']:[]).forEach("));
  assert.ok(js.includes("if(tabsFor().indexOf(v)<0&&!(v==='director'&&drOwner())) return;"));
  assert.ok(js.includes("if(o.hidden&&sel.id==='videoMakerMode') return;"));
  assert.ok(js.includes('loadManifest(); guardModes(); build();'));
  assert.ok(js.includes("var TAB_ART={actor:'/assets/studio/options/heritage-emirati.webp'};"));
  /* v-vmk-tab-warm: الرابط من tabArt (يرسم التبويب ويسخّن الذاكرة بالرابط نفسه) */
  assert.ok(js.includes("function tabArt(v){ return TAB_ART[v]||'/assets/videos/tabs/'+v+'.jpg") && js.includes('im.src=tabArt(v);') && js.includes("if(TAB_ART[v]) im.style.objectPosition='50% 0';"));
  assert.ok(fs.existsSync(path.join(root, 'assets/studio/options/heritage-emirati.webp')), 'صورة الرجل الإماراتيّ موجودة');
});
