'use strict';
// v-text-replace — لقطات المالك «شوفلي موضوع الصور»: الطلب كلّه انطبع على الصورة، والنصّ الجديد تكدّس فوق القديم،
// و«حوز الكلام الي تحت» لخبط الكتابة، وطلبات بقيت على «جارٍ إنشاء الصورة» ثمّ اختفت بلا ردّ، ورفضٌ للكتابة العربيّة.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parseImageTextSpec, textRemoveIntent, textReplaceIntent, layerWordSwap, fixKnownPhrases } = require('../js/app-08-image-text.js');

const ISTIRJA = 'إِنَّا لِلَّهِ وَإِنَّا إِلَيْهِ رَاجِعُونَ';
const attach = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-09-attach.js'), 'utf8');
const chat = fs.readFileSync(path.join(__dirname, '..', 'api', '_lib', 'chat.js'), 'utf8');

test('١. وصف المشهد بعد النصّ لا يُطبع، والاسترجاع يُكتب برسم المصحف', () => {
  const s = parseImageTextSpec('ابغى صوره مكتوب عليها ان الله و ان اليه واجعون و الصوره تعبر عن وفات شخص عزيز');
  assert.equal(s.exactText, ISTIRJA);
  assert.match(s.visualPrompt, /تعبر عن وفات شخص عزيز/);
});

test('٢. صيغ الاسترجاع الشائعة تُصحَّح، وغيرها لا يُمسّ', () => {
  ['ان الله وانه اليه راجعون', 'انا لله وانا اليه راجعون', 'إنا لله وإنا إليه راجعون', 'ان لله و انا اليه واجعون'].forEach((v) => {
    assert.equal(fixKnownPhrases(v), ISTIRJA, v);
  });
  assert.equal(fixKnownPhrases('عمران الحربي'), 'عمران الحربي');
  assert.equal(fixKnownPhrases(ISTIRJA), ISTIRJA);
});

test('٣. «لا في الصوره بس مكتوب فيها…» تصحيح نصّ لا تعديل بصريّ', () => {
  const s = parseImageTextSpec('لا في الصوره بس مكتوب فيها ان الله وانه اليه راجعون');
  assert.equal(s.exactText, ISTIRJA);
  assert.equal(s.visualEdit, null);
});

test('٤. «اكتب قوف شكراً اخوي» = النصّ «شكراً اخوي» في الأعلى، والمنصَّص يبقى حرفيًّا', () => {
  const s = parseImageTextSpec('اكتب قوف شكراً اخوي');
  assert.equal(s.exactText, 'شكراً اخوي');
  assert.equal(s.position, 'top');
  assert.equal(s.positionAuto, false);
  assert.equal(parseImageTextSpec('اكتب «فوق السحاب»').exactText, 'فوق السحاب');
  assert.equal(parseImageTextSpec('اكتب الحب يعبر عن نفسه').exactText, 'الحب يعبر عن نفسه');
});

test('٥. «حوز الكلام الي تحت» حذف للكتابة لا نقلٌ لها', () => {
  assert.equal(textRemoveIntent('حوز الكلام الي تحت'), true);
  assert.equal(textRemoveIntent('امسح الكتابة'), true);
  assert.equal(textRemoveIntent('امسح الخلفية'), false);
  assert.equal(textRemoveIntent('اكتب عمران'), false);
  const s = parseImageTextSpec('حوز الكلام الي تحت');
  assert.ok(!s.styleEdit && !s.styleEditLoose, 'لا تنسيق موضع');
});

test('٦. النصّ الجديد يُكتب على الأساس النظيف (استبدال)، والحذف يرجع للأساس', () => {
  assert.match(attach, /function __textLayerOwnsImage\(c\)/);
  assert.match(attach, /let __wb64 = __prevLayer \? __prevLayer\.baseB64 : __b64/);
  const rm = attach.indexOf('window.__imageTextRemoveIntent(text) && __textLayerOwnsImage(cur)');
  assert.ok(rm > 0 && rm < attach.indexOf('v-font-ask'), 'الحذف قبل مسارات الخطّ والتعديل');
  assert.ok((attach.match(/outTail/g) || []).length >= 5, 'كلّ طبقة تحفظ بصمة ناتجها');
});

test('٧. انقطاع طلب الصورة يُعلَن ولا يختفي المربّع بصمت، ولا إعادة بعد محاولة طويلة', () => {
  assert.match(attach, /if\(e && e\.name === 'AbortError'\)\{ __imgAbortNote\(cur\); renderAll\(\); saveState\(\); return; \} \/\* v-img-silent-abort/);
  assert.match(attach, /if\(__t2 && Date\.now\(\) - __gT0 > 45000\) break;/);
});

test('٨. أدوات المحادثة لا تقول إنّ العربيّ يتشوّه ولا تنصح بتطبيق خارجيّ', () => {
  const tools = chat.slice(chat.indexOf('\nconst TOOLS = ['), chat.indexOf('\nconst TOOLS_NOTE'));
  const edit = tools.slice(tools.indexOf("name: 'edit_image'"), tools.indexOf("name: 'generate_video'"));
  assert.match(edit, /كتابة نصّ عربيّ جديد في الصورة[^']*مدعومة/);
  assert.match(edit, /تنصح بتطبيق تصميم خارجيّ/);
  assert.doesNotMatch(edit, /النصوص الكثيفة داخل الصورة \(لقطات شاشة\) قد تتشوّه/);
  const gen = tools.slice(tools.indexOf("name: 'generate_image'"), tools.indexOf("name: 'edit_image'"));
  assert.match(gen, /العربيّة تبقى عربيّة/);
});

test('٩. ذيول الوصف والتنسيق لا تُطبع (فحص الشكاوى الثاني)', () => {
  const cases = [
    ['ابي صوره بحر مكتوب عليها جمعة مباركة و الخلفيه زرقاء', 'جمعة مباركة'],
    ['سوي لي صورة مكتوب فيها عيد مبارك وتكون فيها العاب نارية', 'عيد مبارك'],
    ['اكتب مبروك يا احمد و خلي الصوره فيها بالونات', 'مبروك يا احمد'],
    ['اكتب اسمي عمران بالذهبي', 'عمران'],
    ['اكتب شكرا لك يا صديقي في الاعلى', 'شكرا لك يا صديقي'],
    ['صورة قمر وعليها «ليلة سعيدة»', 'ليلة سعيدة'],
    ['اكتب نور على نور', 'نور على نور'],
    ['اكتب الحب في القلب', 'الحب في القلب'],
  ];
  cases.forEach(([req, want]) => assert.equal(parseImageTextSpec(req).exactText, want, req));
  assert.equal(parseImageTextSpec('اكتب شكرا لك يا صديقي في الاعلى').position, 'top');
  assert.equal(parseImageTextSpec('اكتب اسمي عمران بالذهبي').color, '#f4cf65');
  assert.match(parseImageTextSpec('ابي صوره بحر مكتوب عليها جمعة مباركة و الخلفيه زرقاء').visualPrompt, /الخلفيه زرقاء/);
});

test('١٠. «غير الكلام الى…» و«غير X الى Y» تستبدل نصّ طبقتنا، والتنسيق يبقى تنسيقًا', () => {
  assert.equal(textReplaceIntent('غير الكلام الى مبروك'), 'مبروك');
  assert.equal(textReplaceIntent('خلي الكتابه مبروك'), 'مبروك');
  assert.equal(textReplaceIntent('بدل الكتابة الى «عيد سعيد»'), 'عيد سعيد');
  assert.equal(textReplaceIntent('خلي الكتابه ذهبي'), null);
  assert.equal(textReplaceIntent('غير الخلفية الى البحر'), null);
  assert.equal(layerWordSwap('غير اخوي الى صديقي', 'شكراً اخوي'), 'شكراً صديقي');
  assert.equal(layerWordSwap('غير الخلفية الى البحر', 'شكراً اخوي'), null);
  assert.match(attach, /window\.__layerWordSwap\(text, cur\.imageTextLayer\.text\)\) \|\| window\.__imageTextReplace\(text\)/);
});

test('١١. تعديل بصريّ على صورة كتبنا عليها: المحرّك يأخذ الأساس ثمّ يُعاد رسم النصّ نفسه', () => {
  assert.match(attach, /const __pendingImageEditSource = __keepLayer \? \{ b64:__keepLayer\.baseB64/);
  assert.match(attach, /cur\.imageTextLayer = __keptLayer;/);
});

test('١٢. الكتابة على الصور ثقيلة وواضحة، مع حدّ ووشاح قويّين بلا تغطية كبيرة', () => {
  assert.match(attach, /maxWidth=c\.width\*\(__side\?\.\[1\]\?0\.32:0\.88\), maxHeight=c\.height\*\(__side\?0\.48:0\.28\)/);
  assert.match(attach, /ctx\.font = '800 '/);
  assert.match(attach, /rgba\(0,0,0,\.52\)/);
  assert.match(attach, /ctx\.lineWidth = Math\.max\(3, Math\.floor\(fs \/ 10\)\)/);
});
