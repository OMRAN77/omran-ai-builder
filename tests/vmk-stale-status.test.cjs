'use strict';
/* v-vmk-stale-status — تدقيق الإنتاج ١٨–١٩ أكتوبر (صانع الفيديو، حاسوب عربيّ): فشل «سينمائي» يكتب «تعذّر توليد الفيديو الآن» في #videoMakerStatus،
   ثمّ التبديل إلى تبويب آخر (فيديو AI، ممثل يتكلم…) يُبقي الرسالة تحت المعاينة كأنّ القسم الجديد فشل. setTab (js/video.js) وupdateModeUI
   (app-11) لا يمسّان السطر. الإصلاح: setTab يمسحه ما لم يكن توليد جاريًا (زرّ «إنشاء» معطَّل طوال التوليد، وسطر التقدّم وبطاقة الانتظار
   في app-34 يقرآنه). setTab الحقيقيّ يُشغَّل في vm بما يلزمه وحده. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'video.js'), 'utf8');

function setTabSource() {
  const a = SRC.indexOf('  function setTab(v){');
  assert.ok(a > 0, 'setTab في js/video.js');
  const b = SRC.indexOf('\n  }\n', a);
  return SRC.slice(a, b + 4);
}

function boot({ busy = false } = {}) {
  const els = {
    videoMakerMode: { value: 'veo', changes: 0, dispatchEvent() { this.changes++; } },
    videoMakerStatus: { textContent: 'تعذّر توليد الفيديو الآن. أعد المحاولة لاحقًا.', style: { display: 'block' } },
    videoMakerGenerateBtn: { disabled: busy },
  };
  const calls = [];
  const ctx = {
    tab: 'veo', id: (k) => els[k] || null, Event: class { constructor(t) { this.type = t; } },
    tabsFor: () => ['trend', 'canvas', 'runway', 'veo', 'actor', 'clean'], drOwner: () => false,
    buildTabs: () => calls.push('buildTabs'), sync: () => calls.push('sync'), scrub: () => calls.push('scrub'),
  };
  vm.createContext(ctx);
  vm.runInContext(setTabSource(), ctx);
  return { ctx, els, calls };
}

test('١. فشل «سينمائي» ثمّ التبديل إلى تبويب آخر: سطر الخطأ يُمسح ويختفي', () => {
  for (const to of ['runway', 'actor', 'trend', 'clean', 'canvas']) {
    const { ctx, els, calls } = boot();
    ctx.setTab(to);
    assert.equal(els.videoMakerStatus.textContent, '', to + ': الرسالة بقيت بعد التبديل');
    assert.equal(els.videoMakerStatus.style.display, 'none', to);
    assert.equal(ctx.tab, to);
    assert.deepEqual(calls, ['buildTabs', 'sync', 'scrub'], to + ': بقيّة setTab كما كانت');
  }
});

test('٢. أثناء التوليد (زرّ «إنشاء» معطَّل) لا يُمسح سطر التقدّم — بطاقة الانتظار تقرؤه', () => {
  const { ctx, els } = boot({ busy: true });
  els.videoMakerStatus.textContent = '⏳ جاري توليد الفيديو…';
  ctx.setTab('runway');
  assert.equal(els.videoMakerStatus.textContent, '⏳ جاري توليد الفيديو…');
  assert.equal(els.videoMakerStatus.style.display, 'block');
});

test('٣. تبويب غير متاح (وضع المالك لغير المالك) لا يغيّر شيئًا', () => {
  const { ctx, els } = boot();
  ctx.setTab('omni');
  assert.equal(ctx.tab, 'veo');
  assert.notEqual(els.videoMakerStatus.textContent, '');
});

test('٤. وسم video.js مرفوع (النسخة المخبّأة بلا المسح)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = /src="\/js\/video\.js\?v=(\d+)"/.exec(html);
  assert.ok(m && Number(m[1]) >= 453, 'وسم video.js');
});
