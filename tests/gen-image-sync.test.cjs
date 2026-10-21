'use strict';
/* v-gen-thumb (تدقيق ١٨–١٩ أكتوبر، g05/plus-create-image؛ أمر المالك ٢٠ أكتوبر، الدفعة ٤؛ من 03390a70 في ten-a): الصور المولَّدة تظهر مكسورة «image.png» حين تُفتح المحادثة من جهاز ثانٍ.
   الجذر: مرفقات المستخدم وحدها تحصل على مصغّرة الخادم (serverThumb) عند الرفع، فصورة المساعد الكبيرة تصل الخادم «[media]» أو فارغة؛
   وفي الجهاز الثاني كان العرض لا يقبل إلّا الأصل الكبير (__isBigDataImg)، فحتّى المصغّرة الصغيرة لا تُرسم.
   الدوالّ الحقيقيّة من js/app-04-i18n-state.js تُشغَّل هنا في vm: __vaultAssign (الحفظ) ثمّ __msgForServer (نسخة المزامنة)، وكتلة
   العرض نفسها من renderMessages. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-04-i18n-state.js'), 'utf8');
const AST = acorn.parse(SRC, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true });
/* تصريحات أعلى الجزء بأسمائها (ما غاب يُتخطّى، فيفشل الاختبار بالتأكيد لا بالتحميل) */
function decls(names) {
  const out = [];
  for (const n of AST.body) {
    if (n.type === 'FunctionDeclaration' && n.id && names.includes(n.id.name)) out.push(SRC.slice(n.start, n.end));
    else if (n.type === 'VariableDeclaration' && n.declarations.some((d) => d.id && names.includes(d.id.name))) out.push(SRC.slice(n.start, n.end));
  }
  return out.join('\n');
}
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
const BIG = 'data:image/png;base64,' + 'A'.repeat(200000);
const THUMB = 'data:image/jpeg;base64,VEhVTUI=';

function env() {
  const calls = { thumb: 0, sync: 0 };
  const sb = {
    console, Promise, JSON, String, Array, Object, Math, Date, WeakSet, WeakMap, Set, Number,
    __swallow() {},
    scheduleChatsServerSync() { calls.sync++; },
  };
  sb.window = sb;
  sb.makeServerThumb = (u) => { calls.thumb++; return Promise.resolve(typeof u === 'string' && u.length > 1000 ? THUMB : ''); };
  vm.createContext(sb);
  vm.runInContext(decls(['VAULT_MIN', '__vaultSeq', '__vaultEach', '__PROJ_BLOBS', '__projBlobEach', '__vaultAssign', '__msgForServer',
    '__isBigDataImg', '__viewQ', '__slimCache', '__genThumbTried', '__genThumbKick']), sb);
  return { sb, calls };
}

test('١. صورة مساعد كبيرة بلا مصغّرة: الحفظ يصنع لها مصغّرة مرّة واحدة، ونسخة المزامنة ترفع المصغّرة لا «[media]» ولا فراغ', async () => {
  const { sb, calls } = env();
  const att = { name: 'image.png', isImage: true, mime: 'image/png', dataUrl: BIG };
  const msg = { role: 'assistant', content: '', attachments: [att] };
  sb.projects = [{ id: 'p1', messages: [{ role: 'user', content: 'ارسم قطة' }, msg] }];
  vm.runInContext('__slimCache = "stale"; this.puts = __vaultAssign(projects, 1);', sb);
  assert.equal(sb.puts.length, 1, 'الأصل يُكتب في المخزن كما كان');
  await flush();
  assert.equal(att.serverThumb, THUMB, 'المصغّرة صُنعت للصورة المولَّدة');
  assert.equal(vm.runInContext('__slimCache', sb), null, 'نسخة المزامنة المخبّأة أُبطلت');
  assert.ok(calls.sync >= 1, 'مزامنة مجدولة بعد وصول المصغّرة');
  const up = vm.runInContext('__msgForServer', sb)(msg);
  assert.equal(up.attachments[0].dataUrl, THUMB, 'الخادم يستلم المصغّرة');
  assert.ok(!('serverThumb' in up.attachments[0]), 'بلا تكرار الحقل');
  /* بعد إخلاء الأصل من الذاكرة (خارج نافذة العرض) تبقى المصغّرة هي المرفوعة */
  att.dataUrl = '';
  assert.equal(vm.runInContext('__msgForServer', sb)(msg).attachments[0].dataUrl, THUMB, 'المُخلاة من الذاكرة ترفع مصغّرتها');
  /* حفظ ثانٍ لا يعيد الصنع */
  att.dataUrl = BIG;
  vm.runInContext('__vaultAssign(projects, 2);', sb);
  await flush();
  assert.equal(calls.thumb, 1, 'مصغّرة واحدة لكلّ صورة');
});

test('٢. مرفق المستخدم بمصغّرته لا يُعاد صنعها، والصورة الصغيرة (دون حدّ المخزن) تبقى كما هي بلا مصغّرة', async () => {
  const { sb, calls } = env();
  const user = { name: 'a.jpg', isImage: true, mime: 'image/jpeg', dataUrl: BIG, serverThumb: THUMB };
  const small = { name: 's.png', isImage: true, mime: 'image/png', dataUrl: 'data:image/png;base64,QUJD' };
  sb.projects = [{ id: 'p1', messages: [{ role: 'user', attachments: [user] }, { role: 'assistant', attachments: [small] }] }];
  vm.runInContext('__vaultAssign(projects, 1);', sb);
  await flush();
  assert.equal(calls.thumb, 0, 'لا مصغّرة جديدة');
  assert.equal(small.serverThumb, undefined);
  assert.equal(vm.runInContext('__msgForServer', sb)({ role: 'assistant', attachments: [small] }).attachments[0].dataUrl, small.dataUrl);
});

test('٣. العرض في الجهاز الثاني: مرفق مخزون (vaultId) بلا أصل محلّيّ ومصغّرته dataUrl — تُرسم المصغّرة لا صورة بلا src', async () => {
  const head = '          const __chipThumb = ';
  const tail = "} else img.src = a.dataUrl === '[media]' ? '' : (a.dataUrl || '');";
  const i = SRC.indexOf(head);
  const j = SRC.indexOf(tail, i);
  assert.ok(i > 0 && j > i, 'كتلة العرض في renderMessages');
  const block = SRC.slice(i, j + tail.length);
  for (const role of ['assistant', 'user']) {
    const shown = [];
    const sb = {
      Promise, String, console,
      m: { role }, a: { name: 'image.png', isImage: true, vaultId: 'v1', dataUrl: THUMB },
      img: { src: '' },
      __showSrc: (u) => shown.push(u),
      __imgView: () => Promise.resolve(''), /* الجهاز الثاني: لا نسخة عرض ولا أصل في مخزنه */
      __swallow() {},
    };
    vm.createContext(sb);
    vm.runInContext(decls(['VAULT_MIN', '__isBigDataImg', '__vaultDegraded']) + '\n' + block, sb);
    await flush();
    const drawn = sb.img.src || shown.filter(Boolean).pop() || '';
    assert.equal(drawn, THUMB, role + ': المصغّرة تُرسم');
  }
});

test('٤. الأصل الكبير في الجهاز نفسه يبقى طريقه كما كان: نسخة العرض أوّلًا، والأصل احتياطًا', async () => {
  const head = '          const __chipThumb = ';
  const tail = "} else img.src = a.dataUrl === '[media]' ? '' : (a.dataUrl || '');";
  const block = SRC.slice(SRC.indexOf(head), SRC.indexOf(tail, SRC.indexOf(head)) + tail.length);
  const shown = [];
  const sb = {
    Promise, String, console,
    m: { role: 'assistant' }, a: { name: 'image.png', isImage: true, vaultId: 'v1', dataUrl: BIG },
    img: { src: '' },
    __showSrc: (u) => shown.push(u),
    __imgView: () => Promise.resolve('data:image/jpeg;base64,VklFVw=='),
    __swallow() {},
  };
  vm.createContext(sb);
  vm.runInContext(decls(['VAULT_MIN', '__isBigDataImg', '__vaultDegraded']) + '\n' + block, sb);
  await flush();
  assert.deepEqual(shown, ['data:image/jpeg;base64,VklFVw=='], 'نسخة العرض');
});
