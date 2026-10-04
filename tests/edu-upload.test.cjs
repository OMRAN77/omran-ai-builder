'use strict';
/* v-edu-upload + v-media-autopurge (المالك ٤ أكتوبر: «طالبة في الجامعة رفعت الملف لكن بدون أي تحليل… والآيفون لا أستطيع
   تحميل الملفات ولا الصور — صلحه»):
   ١) رفع المحاضرة: جسم الطلب في Vercel ~4.5 م.ب والملفّ يكبر الثلث بالترميز — صور الآيفون تُصغَّر JPEG، والـPDF الكبير
      يُقرأ نصّه أو تُصوَّر صفحاته؛ وردّ غير JSON (413) رسالة مفهومة؛ وفشل حفظ الدرس لا يرمي التحليل الجاهز.
   ٢) روابط التحميل: حفظها في القاعدة الممتلئة يُرفض — تنظيف روابط المشاركة القديمة تلقائيًّا ثمّ إعادة الحفظ مرّة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function fnSrc(src, head) {
  const a = src.indexOf(head); assert.ok(a >= 0, head);
  let d = 0, i = src.indexOf('{', a);
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) break; } }
  return src.slice(a, i + 1);
}

test('١. api(): ردّ 413 نصّيّ من Vercel = رسالة «الملف كبير» لا خطأ تحليل غامض؛ والنجاح كما كان', async () => {
  const src = read('js/edu.js');
  const ctx = { T: (k) => ({ tooBig: 'TOO_BIG', err: 'ERR' }[k]), getToken: () => '', AbortController, setTimeout, clearTimeout, JSON, Error };
  vm.createContext(ctx);
  vm.runInContext(fnSrc(src, 'function api(payload){'), ctx);
  ctx.fetch = async () => new Response('Request Entity Too Large', { status: 413 });
  await assert.rejects(() => vm.runInContext('api({action:"process"})', ctx), /TOO_BIG/);
  ctx.fetch = async () => new Response('<html>oops</html>', { status: 502 });
  await assert.rejects(() => vm.runInContext('api({})', ctx), /ERR/);
  ctx.fetch = async () => { throw new TypeError('Load failed'); };
  await assert.rejects(() => vm.runInContext('api({})', ctx), /ERR/);
  ctx.fetch = async () => new Response(JSON.stringify({ error: 'وصلت للحد اليومي' }), { status: 402 });
  await assert.rejects(() => vm.runInContext('api({})', ctx), /وصلت للحد اليومي/);
  ctx.fetch = async () => new Response(JSON.stringify({ ok: true, lesson: { summary: 's' } }), { status: 200 });
  const j = await vm.runInContext('api({})', ctx);
  assert.equal(j.lesson.summary, 's');
});

test('٢. الرفع: الصور تُصغَّر JPEG، والـPDF الكبير نصّ/صفحات، والتحليل يُعرض ولو فشل حفظه — والوسم مرفوع', () => {
  const s = read('js/edu.js');
  assert.ok(s.includes('var EDU_B64_BUDGET=3200000;'));
  assert.ok(s.includes('eduImagesForUpload(imgs)') && !s.includes("Promise.all(imgs.map(function(f){ return fileToBase64(f)"), 'الصور لا تُرسل خامًا');
  assert.ok(s.includes('eduPdfPayload(f0).then(function(pl){ pl.lang=appLang(); processContent(pl); })'));
  assert.ok(s.includes("if(b64.length<=EDU_B64_BUDGET) return {fileBase64:b64,mime:'application/pdf',fileName:file.name};"), 'PDF الصغير كما كان');
  assert.ok(s.includes('window.extractPdfText(file)'), 'نصّ الـPDF الكبير');
  assert.ok(s.includes("if(!allImg&&total>10*1024*1024){ alert(T('tooBig')); return; }"), 'صور الآيفون لا تُرفض قبل التصغير');
  assert.ok(s.includes("return persistLesson(lesson).catch(function(){"), 'فشل الحفظ لا يرمي التحليل');
  assert.ok(s.includes("return listLessons().catch(function(){ return {lessons:[]}; })"));
  assert.ok(read('js/app.bundle.js').includes('async function extractPdfText(file){'), 'الدالة متاحة عالميًّا من الحزمة');
  assert.ok(read('index.html').includes('/js/edu.js?v=667'));
});

test('٣. حفظ رابط مشاركة في قاعدة ممتلئة: تنظيف القديم مرّة ثمّ إعادة الحفظ — وخطأ آخر (حدّ الطلبات) يُرمى بلا تنظيف', async () => {
  const mp = require('../api/_lib/media-purge.js');
  mp._resetAuto();
  const D = 86400;
  const store = new Map([['db/img/old', 30 * D - 15 * D], ['db/users/u', -1]]);
  let full = true, purges = 0;
  const kv = {
    kvList: async (p) => [...store.keys()].filter((k) => k.startsWith(p)),
    kvPipeline: async (cmds) => cmds.map((c) => {
      if (c[0] === 'TTL') return store.has(c[1]) ? store.get(c[1]) : -2;
      if (c[0] === 'DEL') { purges++; c.slice(1).forEach((k) => store.delete(k)); full = false; return 1; }
      return null;
    }),
    kvSetIfAbsent: async (k) => { if (full) throw new Error("Upstash error: OOM command not allowed when used memory > 'maxmemory'."); store.set(k, 7 * D); return true; },
  };
  assert.equal(await mp.setIfAbsentWithRoom(kv, 'db/img/new', 'x', 7 * D), true);
  assert.equal(purges, 1);
  assert.ok(!store.has('db/img/old') && store.has('db/users/u') && store.has('db/img/new'), 'القديم حُذف، والحسابات باقية');

  mp._resetAuto();
  let calls = 0;
  const kv2 = Object.assign({}, kv, { kvSetIfAbsent: async () => { calls++; throw new Error('Upstash error: ERR max daily request limit exceeded'); } });
  await assert.rejects(() => mp.setIfAbsentWithRoom(kv2, 'k', 'v', 1), /request limit/);
  assert.equal(calls, 1, 'لا تنظيف ولا إعادة لحدّ الطلبات');
});

test('٤. نقاط المشاركة الثلاث تمرّ بالحفظ مع التنظيف', () => {
  for (const f of ['api/_lib/img-share.js', 'api/_lib/file-share.js', 'api/_lib/pdf-share.js']) {
    const s = read(f);
    assert.ok(!/await kvSetIfAbsent\(/.test(s), f + ': لا حفظ مباشر');
    assert.ok(s.includes('await setIfAbsentWithRoom(KV, '), f);
  }
});
