// tests/img-format.test.cjs — لقطة المالك ١١ أكتوبر (GPT-6 Astra):
//  (١) «بدل بليدر حط om ai» على لقطة → «حدّد النص بين علامتي تنصيص» مرّتين: حارس v574 يسبق مسار v-text-swap (v-swap-before-ask).
//  (٢) «حول الصوره لي صيغة pig» → «⚠️ ما تنفّذ التعديل… [nano-pro:not_done]»: تغيير الصيغة ذهب لمحرّر الصور فرجعت كما هي (v-img-format).
//  (٣) زرّ حفظ الصورة يسمّي الملف «.png» دائمًا — JPG المحوَّلة كانت تُحفظ باسم PNG.
// أُعيد إنتاج (١) و(٢) بـPlaywright قبل الإصلاح (ردّ التنصيص بلا نداء، وطلبات الصيغة كلّها إلى /api/maha-image حتّى «حولها jpg» رجعت png)
// وبعده (نداء textSwap واحد؛ PNG وJPG محلّيًّا بلا نداء؛ سؤال للصيغة المجهولة).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const attach = read('js/app-09-attach.js');
const fn = (head) => { const i = attach.indexOf(head); assert.ok(i >= 0, head); return attach.slice(i, attach.indexOf('\n}\n', i) + 2); };
const ctx = vm.createContext({});
vm.runInContext(fn('function __imgFormatIntent(s){') + fn('function __textSwapIntent(s){'), ctx);

test('format intent: names, Arabic spellings, a one-letter typo ("pig" → PNG, said out loud), unknown → ask; not video, not other edits, not text swaps', () => {
  const I = (s) => { const r = ctx.__imgFormatIntent(s); return r && { ...r }; }; // كائن من سياق vm → كائن عاديّ للمقارنة الصارمة
  assert.deepEqual(I('حول الصوره لي صيغة pig'), { fmt: 'png', guess: 'pig' }, 'لقطة المالك');
  assert.deepEqual(I('حولها jpg'), { fmt: 'jpeg', guess: '' });
  assert.deepEqual(I('ابيها jpeg'), { fmt: 'jpeg', guess: '' });
  assert.deepEqual(I('احفظها webp'), { fmt: 'webp', guess: '' });
  assert.deepEqual(I('غير الصيغة إلى بي ان جي'), { fmt: 'png', guess: '' });
  assert.deepEqual(I('حولها جي بي جي'), { fmt: 'jpeg', guess: '' });
  assert.deepEqual(I('convert to PNG'), { fmt: 'png', guess: '' });
  assert.deepEqual(I('حول الصيغة jpq'), { fmt: 'jpeg', guess: 'jpq' });
  assert.deepEqual(I('حول الصورة لصيغة ثانية'), { fmt: null, guess: '' }, 'صيغة بلا اسم = سؤال');
  for (const s of ['حول الصورة لفيديو', 'حول الصورة لصيغة فيديو', 'بدل بليدر حط om ai', 'غير الخلفية', 'اكتب png على الصورة', 'png', 'غير الخلفية وخلها png', 'حولها pdf', 'صغرها وخلها jpg', 'كيف حالك'])
    assert.equal(I(s), null, s);
});

test('the guard no longer answers "put the text in quotes" when the request is a text swap, and the swap path follows it', () => {
  assert.equal(ctx.__textSwapIntent('بدل بليدر حط om ai'), true, 'رسالة المالك تبديل');
  assert.equal(ctx.__textSwapIntent('بدل بليدر حط om ai كتبه لك على نفس الصورة بدون أي تغيير فيها'), true);
  const g = attach.indexOf("window.__imageWriteIntent(text) && !(__b64 && __textSwapIntent(text))){");
  const s = attach.indexOf('if(__b64 && __textSwapIntent(text)){');
  assert.ok(g > 0 && s > g, 'الحارس يتخطّى التبديل، ومسار التبديل بعده مباشرةً');
  assert.ok(s - g < 1200, 'لا شيء بينهما يعترض');
});

test('conversion runs locally before any engine: canvas, white under JPG, verified type, image becomes the next edit source', () => {
  const branch = attach.indexOf('const __isNewImageSource = !!(__srcImg && !__srcImg._fromMemory);');
  const call = attach.indexOf('const __fmtReq = __b64 ? __imgFormatIntent(text) : null;');
  const decor = attach.indexOf('if(__decorRe.test(text) && __b64){');
  assert.ok(branch > 0 && call > branch && decor > call, 'قبل الديكور وكلّ مسارات المحرّك في الفرع نفسه');
  const block = attach.slice(call, decor);
  assert.ok(!/fetch\(/.test(block), 'بلا أيّ نداء شبكة');
  assert.match(block, /t\('imgConvertAsk'\)/);
  assert.match(block, /t\('imgConvertSame'\)/);
  assert.match(block, /t\('imgConvertDone'\)/);
  assert.match(block, /t\('imgConvertFail'\)/);
  assert.match(block, /cur\.lastEditedImage = \{ b64:__cvUrl\.split\(','\)\[1\] \|\| '', mime:__cvMime \};/);
  const conv = fn('async function __omranConvertImageFormat(b64, mime, fmt){');
  assert.match(conv, /if\(fmt === 'jpeg'\)\{ g\.fillStyle = '#ffffff'; g\.fillRect/, 'JPG بلا شفافيّة');
  assert.match(conv, /if\(url\.slice\(5, 5 \+ type\.length\) !== type\) throw new Error\('format_unsupported'\)/, 'متصفّح لا يكتب webp لا يُخدع');
});

test('the save button names the file by its real type', () => {
  const line = attach.split('\n').find((l) => l.includes('const nmOf = (bl) =>'));
  assert.ok(line, 'nmOf يأخذ الملفّ');
  const c = vm.createContext({ Date: { now: () => 1 } });
  vm.runInContext(line.trim(), c);
  const nm = (t) => vm.runInContext('nmOf(' + JSON.stringify(t ? { type: t } : null) + ')', c);
  assert.equal(nm('image/jpeg'), 'image-1.jpg');
  assert.equal(nm('image/webp'), 'image-1.webp');
  assert.equal(nm('image/png'), 'image-1.png');
  assert.equal(nm(''), 'image-1.png');
  assert.ok(!attach.includes('nmOf()'), 'كلّ النداءات تمرّر الملفّ');
});

test('five new messages in all 14 languages with their placeholders, and the language tag bumped', () => {
  const K = ['imgConvertDone', 'imgConvertSame', 'imgConvertAsk', 'imgConvertGuess', 'imgConvertFail'];
  const data = read('js/app-03-i18n-data.js');
  for (const k of K) assert.equal((data.match(new RegExp('\\b' + k + ': "', 'g')) || []).length, 2, k + ' بالعربيّة والإنجليزيّة');
  for (const l of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
    const f = read('i18n/' + l + '.js');
    for (const k of K) assert.match(f, new RegExp('"' + k + '": "'), l + ': ' + k);
    const m = /Object\.assign\(I18N\['[a-z]+'\], (\{"imgConvertDone"[^\n]*\})\);/.exec(f);
    assert.ok(m, l);
    const o = JSON.parse(m[1]);
    assert.ok(o.imgConvertDone.includes('{fmt}') && o.imgConvertSame.includes('{fmt}') && o.imgConvertGuess.includes('{fmt}') && o.imgConvertGuess.includes('{word}'), l + ': العلامات');
  }
  assert.ok(read('js/app-04-i18n-state.js').includes("sc.src = 'i18n/' + lg + '.js?v=763';"));
});
