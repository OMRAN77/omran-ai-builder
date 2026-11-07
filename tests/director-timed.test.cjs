// tests/director-timed.test.cjs — v-director-timed (المالك ٧ نوفمبر ٢٠٢٦: «اريده الشخص نفسه يحط التوقيت مع الملاحظات لين ٥ دقائق»،
// ثمّ «ابدأ… في المخرج» واختار «فيديو AI»): النوع الثالث «بتوقيتي» في «مخرج التطبيق» — مقاطع بمدّة وملاحظة حتّى ٥ دقائق، تُقسَّم
// مشاهد ١٠/٥ ث بمحرّك «طويل (دقائق)» ثمّ تُلصق.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const app11 = read('js/app-11-video.js');
const vjs = read('js/video.js');
const J = (x) => JSON.parse(JSON.stringify(x)); /* مصفوفات vm من عالم آخر */
const cut = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); assert.ok(i >= 0 && j > i, 'مقطع: ' + a.slice(0, 40)); return src.slice(i, j); };
const ENGINE = cut(app11, '  window.__vmkTimelinePlan = function(segs){', '  /* v-audit-video (cli-video-4)');

function engine(over) {
  const calls = { scenes: [], balance: 0, joined: null };
  const sb = Object.assign({
    window: {}, SCENE_SECONDS_CONST: 10, bT: (a) => a, __swallow() {},
    isOwnerAccount: () => true, authGet: (k) => (k === 'aiapp_auth_token' ? 'tok' : ''), ownerToken: () => 'otok',
    fetch: async () => { calls.balance++; return { json: async () => ({ credits: 10000 }) }; },
    styleEl: { value: 'cinematic' }, ratioEl: { value: '1280:720' },
    sceneInSequence: (i, n, run) => run(),
    createSceneWithRetry: async (prompt, style, d, ratio, token, longMode) => { calls.scenes.push({ prompt, style, d, ratio, token, longMode }); return 'https://v/' + calls.scenes.length + '.mp4'; },
    concatScenes: async (urls) => { calls.joined = urls.slice(); return { type: 'video/mp4', size: 9 }; },
  }, over || {});
  vm.runInNewContext(ENGINE, sb);
  return { w: sb.window, calls };
}

test('١. التقسيم: كلّ مقطع مشاهد ١٠ ث وآخرها ٥ إن بقي، والتالية «استكمال نفس المشهد»، والمدّة محصورة ٥–٣٠', () => {
  const { w } = engine();
  const p = w.__vmkTimelinePlan([{ d: 30, n: 'السوق' }, { d: 15, n: 'المحلّ' }, { d: 5, n: 'القهوة' }, { d: 99, n: 'كثير' }, { d: 1, n: 'قليل' }, { d: 12, n: 'تقريب' }]);
  assert.deepEqual(J(p.map((x) => x.d)), [10, 10, 10, 10, 5, 5, 10, 10, 10, 5, 10]);
  assert.equal(p[0].prompt, 'السوق'); assert.equal(p[1].prompt, 'السوق (استكمال نفس المشهد، اللحظة التالية)');
  assert.equal(p[3].prompt, 'المحلّ'); assert.equal(p[5].prompt, 'القهوة');
  assert.equal(p.slice(6, 9).length, 3, '٩٩ ث ← ٣٠ (٣ مشاهد)'); assert.equal(p[9].d, 5, '١ ث ← ٥'); assert.equal(p[10].d, 10, '١٢ ث ← ١٠');
  assert.equal(w.__vmkTimelinePlan([]).length, 0);
});

test('٢. التشغيل: المالك وحده، الرصيد قبل أوّل مشهد، المشاهد بالترتيب بنمط الطويل، ثمّ اللصق', async () => {
  const e = engine();
  const out = await e.w.__vmkTimelineRun([{ d: 20, n: 'أ' }, { d: 5, n: 'ب' }], { status() {} });
  assert.equal(e.calls.balance, 1);
  assert.deepEqual(J(e.calls.scenes.map((s) => [s.d, s.longMode, s.style, s.ratio, s.token])), [[10, true, 'cinematic', '1280:720', 'tok'], [10, true, 'cinematic', '1280:720', 'tok'], [5, true, 'cinematic', '1280:720', 'tok']]);
  assert.deepEqual(J(e.calls.joined), ['https://v/1.mp4', 'https://v/2.mp4', 'https://v/3.mp4']);
  assert.ok(out.blob && out.urls.length === 3);
  // غير المالك: لا نداء أصلًا
  const g = engine({ isOwnerAccount: () => false });
  await assert.rejects(g.w.__vmkTimelineRun([{ d: 5, n: 'x' }]), (er) => er.code === 'owner_only');
  assert.equal(g.calls.balance + g.calls.scenes.length, 0);
  // رصيد لا يكفي: يتوقّف قبل أيّ مشهد (لا صرف على تشغيلة لا تكتمل)
  const b = engine({ fetch: async () => ({ json: async () => ({ credits: 120 }) }) });
  await assert.rejects(b.w.__vmkTimelineRun([{ d: 30, n: 'x' }]), (er) => er.code === 'tl_credits' && er.needed === 150 && er.credits === 120);
  assert.equal(b.calls.scenes.length, 0);
  // عطب في المنتصف: ما اكتمل يعود في e.partial (روابط تحميل — لا يضيع مدفوع)
  let n = 0;
  const f = engine({ createSceneWithRetry: async () => { n++; if (n === 3) throw Object.assign(new Error('boom'), { code: 'video_busy' }); return 'u' + n; } });
  await assert.rejects(f.w.__vmkTimelineRun([{ d: 30, n: 'x' }]), (er) => er.code === 'video_busy' && er.partial.join() === 'u1,u2');
  // تعذّر اللصق: المشاهد تعود روابط بلا فيديو واحد
  const j = engine({ concatScenes: async () => { throw new Error('oom'); } });
  const o2 = await j.w.__vmkTimelineRun([{ d: 10, n: 'x' }]);
  assert.equal(o2.blob, null); assert.deepEqual(J(o2.urls), ['https://v/1.mp4']);
});

test('٣. الواجهة: النوع الثالث يخفي حقول الجولة ويُظهر المحرّر، و«سوّ الفيديو» يشغّل الخطّ الزمنيّ بعد التحقّق وموافقة التكلفة', () => {
  assert.ok(vjs.includes("var kT=document.createElement('option'); kT.value='timed'; box.querySelector('#vdKind').appendChild(kT);"), 'الخيار الثالث يُضاف دون لمس السطر الذي يثبّته app-director-story');
  assert.ok(vjs.includes("+'<div class=\"vmk-tl\" id=\"vdTl\"></div>'") && vjs.includes("tlInit(box.querySelector('#vdTl'));"));
  assert.ok(vjs.includes("var timed=drTimed(); box.classList.toggle('vd-timed',timed);") && vjs.includes("if(timed) box.querySelector('.vmk-dir-head p').textContent=L('vdSubTimed');"));
  assert.ok(vjs.includes("    if(DR.busy||!drOwner()) return;\n    if(drTimed()) return drTimedRun();"), '«سوّ الفيديو» في النوع الثالث');
  assert.ok(vjs.includes('var TL_MAX=300, TL_DUR=[5,10,15,20,30]'), 'حدّ ٥ دقائق ومدد ٥–٣٠');
  const run = cut(vjs, '  async function drTimedRun(){', '  function drStep(') ;
  const iConfirm = run.indexOf('window.confirm('), iRun = run.indexOf('window.__vmkTimelineRun(');
  assert.ok(run.indexOf("tlErr(drT('vdTlNeedNote',{i:i+1}))") > 0 && run.indexOf("tlErr(L('vdTlEmpty'))") > 0, 'ملاحظة فارغة أو لا مقاطع: رسالة ولا نداء');
  assert.ok(iConfirm > 0 && iRun > iConfirm, 'موافقة التكلفة قبل أيّ توليد');
  assert.ok(run.includes("tlLinks(err.partial)") && run.includes("tlLinks(out&&out.urls)"), 'المكتمل روابط إن تعذّر اللصق أو توقّف');
  const css = read('css/modules.css');
  assert.ok(css.includes('#videoMakerModal #vmkDirector.vd-timed #vdReq,') && css.includes('#videoMakerModal #vmkDirector:not(.vd-timed) #vdTl{display:none!important}'));
  assert.ok(css.includes('@media (max-width:640px){#videoMakerModal .vmk-tl-head{display:none}'), 'الجوّال: صفّ المقطع يلتفّ');
});

test('٤. الحفظ على الجهاز: مدد غير مسموحة تسقط، والمجموع لا يتعدّى ٥ دقائق، وفارغ = مقطع واحد', () => {
  const blk = cut(vjs, '  var TL_MAX=300,', '  function tlErr(');
  const run = (stored) => {
    const ls = { getItem: () => stored, setItem() {} };
    const sb = { localStorage: ls, document: {}, window: {}, id: () => null };
    vm.runInNewContext(blk + '; tlLoad(); this.out = { segs: TL.segs, total: tlTotal(), fmt: [tlFmt(0), tlFmt(65), tlFmt(300)] };', sb);
    return J(sb.out);
  };
  const a = run(JSON.stringify([{ d: 30, n: 'x' }, { d: 7, n: 'bad' }, ...Array.from({ length: 12 }, () => ({ d: 30, n: 'y' }))]));
  assert.ok(a.total <= 300 && a.segs.every((s) => [5, 10, 15, 20, 30].includes(s.d)), JSON.stringify(a));
  assert.deepEqual(a.fmt, ['0:00', '1:05', '5:00']);
  assert.deepEqual(run(null).segs, [{ d: 10, n: '' }]);
  assert.deepEqual(run('{oops').segs, [{ d: 10, n: '' }], 'قيمة تالفة: بداية جديدة');
});

test('٥. النصوص الثلاثة والعشرون بالـ١٤ لغة بلا اسم مزوّد، والوسوم مرفوعة', () => {
  const KEYS = ['vdKindTimed', 'vdSubTimed', 'vdTlLeft', 'vdTlTime', 'vdTlNote', 'vdTlDur', 'vdTlPh', 'vdTlAdd', 'vdTlSplit', 'vdTlSec', 'vdTlSum', 'vdTlFull', 'vdTlOver', 'vdTlEmpty', 'vdTlNeedNote', 'vdTlDel', 'vdTlScene', 'vdTlJoin', 'vdTlDone', 'vdTlConfirm', 'vdTlCredits', 'vdTlNoJoin', 'vdTlScenePart'];
  const BANNED = /claude|anthropic|gemini|google|gpt|openai|runway|veo|kling|minimax|luma|sora/i; /* بحدود الكلمة: «lumang» فلبينيّة لا Luma */
  const core = read('js/app-03-i18n-data.js');
  const base = { $: () => null, document: { getElementById: () => null, querySelector: () => null }, window: {}, localStorage: { getItem: () => null } }; base.window = base;
  vm.runInNewContext(core, base);
  const seen = new Set();
  for (const lg of ['ar', 'en']) for (const k of KEYS) { const v = base.I18N[lg][k]; assert.ok(v && v.length > 1, lg + ' ' + k); assert.doesNotMatch(v, BANNED, lg + ' ' + k); }
  for (const lg of ['fr', 'es', 'tr', 'ru', 'zh', 'hi', 'ur', 'bn', 'ne', 'ml', 'id', 'fil']) {
    const m = read('i18n/' + lg + '.js').match(/v-director-timed[^\n]*Object\.assign\(I18N\["(\w+)"\], (\{.*\})\);/);
    assert.ok(m && m[1] === lg, lg + ' كتلة الترجمة');
    const o = JSON.parse(m[2]);
    for (const k of KEYS) { assert.ok(o[k] && o[k].trim().length > 1, lg + ' ' + k); assert.doesNotMatch(o[k], BANNED, lg + ' ' + k); }
    for (const k of ['vdTlLeft', 'vdTlSum', 'vdTlScene', 'vdTlConfirm', 'vdTlCredits']) { const want = (base.I18N.en[k].match(/\{\w+\}/g) || []).sort().join(); assert.equal((o[k].match(/\{\w+\}/g) || []).sort().join(), want, lg + ' ' + k + ': الخانات'); }
    seen.add(o.vdSubTimed);
  }
  assert.equal(seen.size, 12, 'ترجمات لا نسخ');
  /* المفاتيح التي تقرؤها الواجهة: L('…') وdrT('…') وdata-k="…" (لا معرّفات العناصر vdTlList وأخواتها) */
  const used = new Set([...vjs.matchAll(/(?:\bL|drT)\('(vd(?:KindTimed|SubTimed|Tl\w+))'/g)].map((m) => m[1]).concat([...vjs.matchAll(/data-k="(vdTl\w+)"/g)].map((m) => m[1])));
  for (const k of used) assert.ok(KEYS.includes(k), 'غير معرَّف: ' + k);
  for (const k of KEYS) assert.ok(used.has(k), 'غير مستعمل: ' + k);
  const tag = read('js/app-04-i18n-state.js').match(/\.js\?v=(\d+)';[^\n]* v-director-timed \((\d+)\): /);
  assert.ok(tag && Number(tag[1]) >= Number(tag[2]) && Number(tag[2]) === 785, 'وسم اللغات مرفوع وسببه في التعليق (آخره كما ٧٨٤ — hw-resubmit يثبّت أوّله)');
  const h = read('index.html');
  assert.ok(Number((/\/js\/video\.js\?v=(\d+)"/.exec(h) || [])[1]) >= 464 && Number((/css\/modules\.css\?v=(\d+)"/.exec(h) || [])[1]) >= 694);
  assert.ok(read('js/app.bundle.js').includes('window.__vmkTimelineRun = async function(segs, hooks){'), 'شغّل npm run bundle');
});
