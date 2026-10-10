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

test('أوامر ffmpeg: خفيف وقويّ، والصوت يبقى، والمدّة محدودة، والمخرج قابل للتشغيل في كلّ مكان', () => {
  assert.equal(typeof args, 'function');
  const a = args({ input: '/clin/input', output: 'clout.mp4', level: 'light', w: 1280, h: 720, maxSec: 60 });
  const vf = a[a.indexOf('-vf') + 1];
  assert.ok(vf.includes('hqdn3d=1.5:1.5:4:4') && vf.includes('cas=0.3') && vf.includes('eq=contrast=1.03'));
  assert.ok(!vf.includes('deband') && !vf.includes('iw*2'), 'لا تضخيم ولا deband في الخفيف لـ720');
  assert.ok(vf.endsWith('scale=trunc(iw/2)*2:trunc(ih/2)*2'), 'أبعاد زوجيّة لـyuv420p');
  ['-map', '0:a:0?', 'libx264', 'yuv420p', 'aac', '+faststart'].forEach((x) => assert.ok(a.includes(x), x));
  assert.ok(!a.includes('0:a?'), 'كلّ مسارات الصوت (صوت مكانيّ إضافيّ) تكسر aac — الأوّل فقط');
  assert.equal(a[a.indexOf('-t') + 1], '60', 'حدّ المدّة داخل الأداة لا في المعاينة وحدها');
  assert.ok(a.indexOf('-t') > a.indexOf('-i'), '-t للمخرج');
  assert.equal(a[a.length - 1], 'clout.mp4');
  const s = args({ input: 'x', level: 'strong', w: 1280, h: 720 });
  const sv = s[s.indexOf('-vf') + 1];
  assert.ok(sv.includes('hqdn3d=4:3:6:4.5') && sv.includes('deband') && sv.includes('cas=0.5'));
  assert.equal(s[s.indexOf('-t') + 1], '60', 'الافتراضيّ ٦٠');
});

test('سقف ١٠٨٠ على الضلع الأقصر دائمًا (حتّى بلا أبعاد)، والمضاعفة لما ضلعه الأقصر ≤٥٤٠ فقط', () => {
  const CAP = "scale='if(gt(iw,ih),-2,min(iw,1080))':'if(gt(iw,ih),min(ih,1080),-2)':flags=lanczos";
  [{ w: 3840, h: 2160 }, { w: 1080, h: 1920 }, {}].forEach((d) => {
    const v = args(Object.assign({ input: 'x', level: 'light' }, d));
    assert.ok(v[v.indexOf('-vf') + 1].startsWith(CAP + ','), JSON.stringify(d));
  });
  const up = args({ input: 'x', level: 'light', upscale: true, w: 854, h: 480 });
  assert.ok(up[up.indexOf('-vf') + 1].includes('scale=iw*2:ih*2:flags=lanczos'));
  const upP = args({ input: 'x', level: 'light', upscale: true, w: 480, h: 854 });
  assert.ok(upP[upP.indexOf('-vf') + 1].includes('iw*2'), 'الطوليّ ٤٨٠×٨٥٤ صغير أيضًا');
  const no = args({ input: 'x', level: 'light', upscale: true, w: 1280, h: 720 });
  assert.ok(!no[no.indexOf('-vf') + 1].includes('iw*2'), 'لا تضخيم لـ720 حتّى لو طُلب');
  const noP = args({ input: 'x', level: 'light', upscale: true, w: 720, h: 1280 });
  assert.ok(!noP[noP.indexOf('-vf') + 1].includes('iw*2'), 'ولا للطوليّ ٧٢٠×١٢٨٠ (ارتفاعه وحده كان يُخدع)');
  const unk = args({ input: 'x', level: 'light', upscale: true });
  assert.ok(!unk[unk.indexOf('-vf') + 1].includes('iw*2'), 'بلا أبعاد لا تضخيم');
});

test('الإلغاء برمز تشغيل: يوقف التحميل نفسه، ولا يكتب تشغيلٌ قديم فوق الحالة', () => {
  assert.ok(js.includes('var my=++CL.run;'), 'كلّ تشغيل برمز');
  const run = js.slice(js.indexOf('async function clRun(){'), js.indexOf('function clCancel(){'));
  assert.ok((run.match(/if\(my!==CL\.run\) return;/g) || []).length >= 5, 'فحص بعد كلّ انتظار وفي الخطأ');
  assert.ok(!run.includes('CL.cancelled'), 'لا علم إلغاء يتسرّب إلى التشغيل التالي');
  const cancel = js.slice(js.indexOf('function clCancel(){'), js.indexOf('function syncClean(){'));
  assert.ok(cancel.includes('CL.run++') && cancel.includes('[CL.ff,CL.ffLoading]') && cancel.includes('clLoad=null'));
  assert.ok(js.includes('CL.ffLoading=ff;'), 'النسخة تُحفظ قبل load فيقدر الإلغاء على إنهائها');
  assert.ok(js.includes('if(clLoad) return clLoad;'), 'ضغطتان = تحميل واحد');
  assert.ok(js.includes('accept(isFinite(d)&&d>0?d:0'), 'مدّة Infinity (WebM) = غير معروفة لا «أطول من الحدّ»');
  assert.ok(js.includes("clRender(); clMsg(L('vclLoading'));") && js.includes('if(CL.msg) clMsg(CL.msg.text,CL.msg.err);'), 'رسالة التحميل لا تمحوها إعادة الرسم');
});

test('عارض مستقلّ: نتيجة المولّد لا تُمسّ، ولا يظهر خارج قسمه، والجوّال لا ينهار', () => {
  assert.ok(js.includes("clv.id='vmkClView'"), 'عنصر خاصّ بالقسم');
  const stage = js.slice(js.indexOf('function clStage(url){'), js.indexOf('function clMsg('));
  assert.ok(!stage.includes('videoMakerResult'), 'لا يكتب فوق نتيجة المولّد');
  assert.ok(stage.includes("v.removeAttribute('src')"), 'ملفّ بلا معاينة يفرّغ العارض');
  assert.ok(stage.includes('stageDims()'), 'نسبة المسرح وأبعاده تتبع المعروض');
  assert.ok(js.includes("clStage(w?url:'')"));
  const css = read('css/modules.css');
  assert.ok(css.includes('.vmk-studio:not(.vmk-tab-clean) #vmkClView{display:none!important}'));
  ['#videoMakerResult', '#videoMakerStatus', '#videoMakerDownloadLink', '#filmSceneLinks'].forEach((x) =>
    assert.ok(css.includes('.vmk-studio.vmk-tab-clean ' + x), x + ' مخفيّ في القسم'));
  assert.ok(css.includes('.vmk-studio.vmk-tab-clean>.vmk-side{align-self:stretch;width:100%}'), 'الجوّال: العمود لا ينكمش إلى ٤×٢');
  assert.ok(css.includes('.vmk-cl-drop:focus-within{outline:'), 'مؤشّر تركيز للوحة الرفع');
  assert.ok(css.includes('html[data-mode="light"] #videoMakerModal #vmkClCancel'), 'الإلغاء ظاهر في الفاتح');
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
  assert.ok(js.includes('if(f) f.terminate();'), 'الإلغاء يوقف العامل فعلًا');
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
  assert.ok(h.includes('src="/js/video.js?v=439"') && h.includes('modules.css?v=675'));
  assert.ok(read('js/app-04-i18n-state.js').includes(".js?v=732'"));
});
