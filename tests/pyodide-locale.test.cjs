'use strict';
/* v-py-locale (تدقيق ١٨ أكتوبر، g06/work-tabs): «تشغيل الكود» في بايثون يقول «حدث خطأ» و«Program terminated with exit(1)»
   لكلّ من لغة متصفّحه عربيّة (ar، ar-AE، ar-SA)، ويعمل بالإنجليزيّة والفرنسيّة.
   الجذر (مُثبت بمسبار Playwright على v0.26.4): مُشغِّل بايثون (Emscripten _tzset_js) يأخذ اسم المنطقة الزمنيّة من
   toLocaleTimeString(undefined, {hour12:false, timeZoneName:'short'}).split(' ')[1] بلغة المتصفّح — بالعربيّة «غرينتش+4»
   يُقصّ في ٧ بايتات وسط حرف، فيفشل بايثون في فكّه أثناء الإقلاع (init_fs_encoding). تمرير env:{LANG:'C.UTF-8'} لم يُصلحه.
   القرار: أثناء loadPyodide وحده يُجاب هذا النداء بعينه بالإنجليزيّة ثمّ تعود الدالّة كما كانت؛ وفشل تحميل البيئة نفسها
   يذهب نصّه الخامّ (الإنجليزيّ التقنيّ) للكونسول ويرى المستخدم سطر الحالة بلغته — وأخطاء كود المستخدم تبقى ظاهرة كما هي. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
function block(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const a = src.indexOf('let pyodideInstance = null;');
  const b = src.indexOf('function renderAll(keepScroll){', a);
  assert.ok(a > 0 && b > a, file + ': كتلة بايثون');
  return src.slice(a, b);
}

function harness(file, loadImpl) {
  const els = { '#pyStatus': { textContent: '' }, '#pyOutput': { textContent: '', scrollTop: 0, scrollHeight: 0 }, '#btnRunPython': { disabled: false } };
  const logs = [];
  const ctx = {
    $: (s) => els[s], t: (k) => 'T:' + k, logs,
    console: { warn: (...a) => logs.push(a.map(String).join(' ')), error: (...a) => logs.push(a.map(String).join(' ')), log() {} },
    document: { createElement() { throw new Error('لا تحميل سكربت في الاختبار'); }, head: { appendChild() {} } },
    __swallow() {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  /* متصفّح بلغة عربيّة ومنطقة +4: النداء بلا لغة يخرج بالعربيّة (كما يرى Emscripten في المتصفّح) */
  vm.runInContext(`
    var __nativeTlt = Date.prototype.toLocaleTimeString;
    Date.prototype.toLocaleTimeString = function(l, o){
      return __nativeTlt.call(this, l === undefined ? 'ar-AE' : l, Object.assign({ timeZone: 'Asia/Dubai' }, o || {}));
    };
    var __browserTlt = Date.prototype.toLocaleTimeString;
    /* ما يفعله Emscripten حرفيًّا في _tzset_js */
    function extractZone(date){ return date.toLocaleTimeString(undefined, { hour12: false, timeZoneName: 'short' }).split(' ')[1]; }
  `, ctx);
  ctx.window.loadPyodide = loadImpl(ctx);
  vm.runInContext(block(file), ctx);
  return { ctx, els, logs };
}
const ASCII = /^[\x20-\x7e]+$/;

for (const file of ['js/app-05-ui.js', 'js/app.bundle.js']) {
  test(file + ': ١. اسم المنطقة الذي يقرؤه مُشغِّل بايثون وقت التحميل لاتينيّ مهما كانت لغة المتصفّح، والدالّة تعود بعده', async () => {
    let seen = null, cfg = null;
    const h = harness(file, (ctx) => async (c) => {
      cfg = c;
      seen = vm.runInContext('[extractZone(new Date(2026, 0, 1)), extractZone(new Date(2026, 6, 1))]', ctx);
      return { fake: true };
    });
    const browserZone = vm.runInContext('extractZone(new Date(2026, 0, 1))', h.ctx);
    assert.ok(!ASCII.test(browserZone), 'المتصفّح العربيّ يعطي اسمًا عربيًّا (شرط إعادة الإنتاج): ' + browserZone);
    const inst = await vm.runInContext('getPyodideInstance()', h.ctx);
    assert.deepEqual(inst, { fake: true });
    assert.ok(seen && seen.every((z) => ASCII.test(z)), 'وقت التحميل: ' + JSON.stringify(seen));
    assert.equal(cfg.indexURL, 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/', 'الإصدار نفسه');
    assert.equal(vm.runInContext('Date.prototype.toLocaleTimeString === __browserTlt', h.ctx), true, 'الدالّة الأصليّة رجعت بعد التحميل');
    assert.equal(vm.runInContext("new Date(2026,0,1).toLocaleTimeString(undefined, {hour:'2-digit'})", h.ctx),
      vm.runInContext("__nativeTlt.call(new Date(2026,0,1), 'ar-AE', {timeZone:'Asia/Dubai', hour:'2-digit'})", h.ctx), 'بقيّة التطبيق بلغته');
  });

  test(file + ': ٢. فشل تحميل البيئة: الدالّة تعود، والنصّ الخامّ للكونسول لا للمستخدم، وسطر الحالة بلغته', async () => {
    const h = harness(file, () => async () => { throw new Error('Program terminated with exit(1)'); });
    await vm.runInContext("runPythonCode('print(1)')", h.ctx);
    assert.equal(vm.runInContext('Date.prototype.toLocaleTimeString === __browserTlt', h.ctx), true);
    assert.equal(h.els['#pyStatus'].textContent, 'T:pythonError');
    assert.ok(!/exit\(1\)/.test(h.els['#pyOutput'].textContent), 'لا «exit(1)» في المخرجات: ' + JSON.stringify(h.els['#pyOutput'].textContent));
    assert.ok(h.logs.some((l) => /exit\(1\)/.test(l)), 'النصّ الخامّ في الكونسول');
    assert.equal(h.els['#btnRunPython'].disabled, false);
  });

  test(file + ': ٣. خطأ في كود المستخدم نفسه يبقى ظاهرًا في المخرجات (هو ناتج البرنامج)', async () => {
    const h = harness(file, () => async () => ({
      setStdout() {}, setStderr() {},
      runPythonAsync: async () => { throw new Error('Traceback ... NameError: name x is not defined'); },
    }));
    await vm.runInContext("runPythonCode('print(x)')", h.ctx);
    assert.match(h.els['#pyOutput'].textContent, /NameError/);
    assert.equal(h.els['#pyStatus'].textContent, 'T:pythonError');
  });
}
