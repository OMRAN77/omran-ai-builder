// v-canvas-mux-fast: فيديو القوالب + تعليق صوتي كان يعلق عند «جاري دمج الصوت» (libx264 بالمتصفّح دقائق).
// الدمج ينسخ صورة WebM ويضيف opus، والترميز احتياط ultrafast بمهلة.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-11-video.js'), 'utf8');
const i = src.indexOf('async function muxNarrationAny');
assert(i > 0, 'muxNarrationAny موجودة');
const body = src.slice(i, src.indexOf('async function runCanvasOnly', i));
assert(/'-c:v', 'copy', '-c:a', 'libopus', '-af', 'apad'/.test(body), 'نسخ الصورة + opus أوّلًا، والصوت يُمدّ بصمت');
assert((body.match(/'-af', 'apad'/g) || []).length === 2, 'المدّة المختارة تبقى في المسارين');
assert(/'muxout\.webm'\], 60000\)/.test(body), 'مهلة لخطوة النسخ');
assert(/'-preset', 'ultrafast'/.test(body), 'الترميز الاحتياطي ultrafast');
assert(/180000\) !== 0\) throw/.test(body), 'مهلة وفحص نتيجة الاحتياط');
assert(!/'libx264', '-pix_fmt'/.test(body), 'لا ترميز بالإعداد البطيء الافتراضي');
assert(/type: 'video\/webm'/.test(body), 'الناتج WebM');
const bundle = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.bundle.js'), 'utf8');
assert(bundle.includes("'muxout.webm'], 60000)"), 'الحزمة مبنيّة بالتعديل');
console.log('canvas-mux-fast OK');
// v-canvas-font: خطّ عربيّ حقيقيّ (Tajawal) لا «sans-serif» العامّ، وننتظره قبل التسجيل
const rec = src.slice(src.indexOf('function recordCanvasClip'), src.indexOf('function makeWatermarkPng'));
assert(/return canvasFontsReady\(/.test(rec), 'التسجيل ينتظر الخطّ');
assert(!/px sans-serif'/.test(rec), 'لا sans-serif عامّ في فيديو القوالب');
assert(/const CANVAS_FONT = "Tajawal/.test(src), 'Tajawal أوّلًا');
assert(/document\.fonts\.load\('bold 40px Tajawal', sample\)/.test(src) && /setTimeout\(r, 2500\)/.test(src), 'تحميل الحروف العربيّة بمهلة');
console.log('canvas-font OK');
