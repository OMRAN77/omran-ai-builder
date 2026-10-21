'use strict';
/* v-copy-png (تدقيق ١٨–١٩ أكتوبر، g05/generated-image-share): «نسخ الصورة» على الحاسوب فتح تبويبًا جديدًا وقال «اضغط عليها مطوّلًا».
   الجذر: copyImg يكتب للحافظة بنوع الملفّ الأصليّ (JPEG من التراجع والمحرّكات)، وحافظة كروم تقبل image/png وحدها فترفض، فيسقط إلى
   openFull بعبارة الجوّال. الدالّة الحقيقيّة (داخل __omranImgTools) تُشغَّل هنا بحافظة مزيّفة ترفض غير PNG كما يفعل كروم. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-09-attach.js'), 'utf8');
const AST = acorn.parse(SRC, { ecmaVersion: 'latest', sourceType: 'script' });
function copyImgSrc() {
  let found = null;
  (function walk(n) {
    if (!n || typeof n.type !== 'string' || found) return;
    if (n.type === 'VariableDeclarator' && n.id && n.id.name === 'copyImg' && n.init) { found = n; return; }
    for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); }
  })(AST);
  assert.ok(found, 'copyImg داخل __omranImgTools');
  return SRC.slice(found.init.start, found.init.end);
}
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };

function env() {
  const log = { items: [], hint: 0, open: 0, notes: [], flash: 0, png: 0 };
  const PNG = { type: 'image/png', size: 10, __png: true };
  class ClipboardItem { constructor(o) { this.types = Object.keys(o); this.data = o; log.items.push(this); } }
  const sb = {
    Promise, Object, console, ClipboardItem,
    navigator: { clipboard: { write: async (items) => {
      for (const it of items) {
        for (const ty of it.types) {
          if (ty !== 'image/png') throw new Error('NotAllowedError: Type ' + ty + ' not supported on write.');
          const v = await it.data[ty];
          if (!v || v.type !== 'image/png') throw new Error('bad png');
        }
      }
    } } },
    ar: false,
    flash: () => { log.flash++; },
    svg: () => '',
    note: (m) => { log.notes.push(m); return true; },
    hint: () => { log.hint++; },
    pngBlob: () => { log.png++; return Promise.resolve(PNG); },
    __swallow() {},
  };
  sb.window = sb;
  sb.window.open = () => { log.open++; return {}; };
  vm.createContext(sb);
  sb.copyImg = vm.runInContext('(' + copyImgSrc() + ')', sb);
  return { sb, log };
}

test('١. صورة JPEG تُنسخ بمفتاح image/png (تحويل بالكانفس داخل ClipboardItem) — لا تبويب ولا «اضغط مطوّلًا»', async () => {
  const { sb, log } = env();
  sb.copyImg({}, { type: 'image/jpeg', size: 99 });
  await flush();
  assert.equal(log.items.length, 1);
  assert.deepEqual(log.items[0].types, ['image/png'], 'المفتاح PNG');
  assert.ok(log.items[0].data['image/png'] && typeof log.items[0].data['image/png'].then === 'function', 'الوعد داخل ClipboardItem (إذن النقرة في سفاري)');
  assert.equal(log.png, 1, 'التحويل مرّة');
  assert.equal(log.hint, 0, 'لا سقوط إلى فتح الصورة');
  assert.equal(log.open, 0);
  assert.equal(log.flash, 1, 'علامة ✓ على الزرّ');
  assert.ok(log.notes.some((m) => /copied/i.test(m)), 'تنبيه النسخ');
});

test('٢. صورة PNG تُنسخ كما هي بلا تحويل، وWebP تُحوَّل', async () => {
  const { sb, log } = env();
  const bl = { type: 'image/png', size: 5 };
  sb.copyImg({}, bl);
  await flush();
  assert.equal(log.items[0].data['image/png'], bl, 'الملفّ نفسه');
  assert.equal(log.png, 0);
  sb.copyImg({}, { type: 'image/webp', size: 5 });
  await flush();
  assert.equal(log.png, 1);
  assert.equal(log.hint, 0);
});

test('٣. حافظة غير متاحة: يبقى الملاذ القديم (فتح الصورة/التلميح) كما كان', async () => {
  const { sb, log } = env();
  sb.navigator.clipboard = null;
  sb.copyImg({}, { type: 'image/jpeg' });
  await flush();
  assert.equal(log.hint, 1);
});
