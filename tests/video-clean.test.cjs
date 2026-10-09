// tests/video-clean.test.cjs — v-vmk-clean-video (المالك: «كيف أضيف الفيديو إذا كان مغبّش؟ أريد تنظيفه»)
// تحسين فيديو المستخدم في جهازه بـffmpeg.wasm الموجود: مجّانيّ، بلا خادم ولا مزوّد.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const js = read('js/video.js');

// الدالّة الحقيقيّة: تُكشف قبل أيّ اعتماد على الصفحة
const ctx = { document: { getElementById: () => null }, window: {} };
ctx.window = ctx;
vm.runInNewContext(js, ctx);
const args = ctx.__vmkCleanArgs;

test('أوامر ffmpeg: خفيف وقويّ، والصوت يبقى، والمخرج قابل للتشغيل في كلّ مكان', () => {
  assert.equal(typeof args, 'function');
  const a = args({ input: '/clin/input', output: 'clout.mp4', level: 'light', h: 720 });
  const vf = a[a.indexOf('-vf') + 1];
  assert.ok(vf.startsWith('hqdn3d=1.5:1.5:4:4') && vf.includes('cas=0.3') && vf.includes('eq=contrast=1.03'));
  assert.ok(!vf.includes('deband') && !vf.includes('iw*2'), 'لا تضخيم ولا deband في الخفيف لـ720');
  assert.ok(vf.endsWith('scale=trunc(iw/2)*2:trunc(ih/2)*2'), 'أبعاد زوجيّة لـyuv420p');
  ['-map', '0:a?', 'libx264', 'yuv420p', 'aac', '+faststart'].forEach((x) => assert.ok(a.includes(x), x));
  assert.equal(a[a.length - 1], 'clout.mp4');
  const s = args({ input: 'x', level: 'strong', h: 720 });
  const sv = s[s.indexOf('-vf') + 1];
  assert.ok(sv.startsWith('hqdn3d=4:3:6:4.5') && sv.includes('deband') && sv.includes('cas=0.5'));
});

test('مضاعفة الدقّة للمصدر الصغير فقط (≤٥٤٠)، وما فوق ١٠٨٠ يُنزَّل أوّلًا', () => {
  const up = args({ input: 'x', level: 'light', upscale: true, h: 480 });
  assert.ok(up[up.indexOf('-vf') + 1].includes('scale=iw*2:ih*2:flags=lanczos'));
  const no = args({ input: 'x', level: 'light', upscale: true, h: 720 });
  assert.ok(!no[no.indexOf('-vf') + 1].includes('iw*2'), 'لا تضخيم لـ720 حتّى لو طُلب');
  const big = args({ input: 'x', level: 'light', h: 2160 });
  assert.ok(big[big.indexOf('-vf') + 1].startsWith('scale=-2:1080:flags=lanczos'));
});

test('القسم: تبويب «تحسين فيديو» لا يغيّر الوضع ولا يُظهر زرّ الإنشاء المدفوع، ولا خادم ولا مزوّد', () => {
  assert.ok(js.includes("var TABS=['trend','canvas','runway','minimax','omni','hybrid','veo','actor','clean'];"));
  assert.ok(js.includes("if(v!=='trend'&&v!=='clean'&&sel&&sel.value!==v)"), 'لا يضبط الـselect');
  const css = read('css/modules.css');
  assert.ok(css.includes('.vmk-studio.vmk-tab-clean .vmk-main>:not(#vmkClean){display:none!important}'), 'كلّ ما عدا القسم مخفيّ، ومنه زرّ الإنشاء');
  assert.ok(css.includes('.vmk-studio:not(.vmk-tab-clean) #vmkClean{display:none!important}'));
  assert.ok(js.includes("import('/ffmpeg/lib/index.js')") && !/fetch\('\/api\/[^']*clean/.test(js), 'في الجهاز لا الخادم');
  assert.ok(js.includes('var CL_MAX_SEC=60') && js.includes('?80:200'), 'حدود المدّة والحجم');
  assert.ok(js.includes("ff.mount('WORKERFS',{blobs:[{name:'input',data:CL.file}]},'/clin')"), 'يُقرأ الملفّ من الجهاز بلا نسخه كلّه في الذاكرة، باسم ثابت');
  assert.ok(js.includes('CL.ff.terminate()'), 'الإلغاء يوقف العامل فعلًا');
});

test('النصوص بالـ١٤ لغة والوسوم مرفوعة', () => {
  const KEYS = ['videoTabClean', 'vclTitle', 'vclSub', 'vclPick', 'vclDrop', 'vclLight', 'vclStrong', 'vclUpscale', 'vclStart', 'vclWorking', 'vclCancel', 'vclDownload', 'vclBefore', 'vclAfter', 'vclTooLong', 'vclTooBig', 'vclFail', 'vclNote', 'vclLoading'];
  const base = read('js/app-03-i18n-data.js');
  KEYS.forEach((k) => assert.equal((base.match(new RegExp('\\b' + k + ': "', 'g')) || []).length, 2, k));
  ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'].forEach((lg) => {
    const s = read('i18n/' + lg + '.js');
    KEYS.forEach((k) => assert.ok(new RegExp('^\\s*' + k + ': "[^"]+",', 'm').test(s), lg + ' ← ' + k));
    ['vclDrop', 'vclTooLong'].forEach((k) => assert.ok(/\{s\}/.test(s.match(new RegExp(k + ': "([^"]+)"'))[1]), lg + ' ' + k + ' {s}'));
    assert.ok(/\{n\}/.test(s.match(/vclTooBig: "([^"]+)"/)[1]), lg + ' vclTooBig {n}');
  });
  const h = read('index.html');
  assert.ok(h.includes('src="/js/video.js?v=438"') && h.includes('modules.css?v=674'));
  assert.ok(read('js/app-04-i18n-state.js').includes(".js?v=732'"));
});
