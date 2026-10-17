// v-canvas-mux-fast: فيديو القوالب + تعليق صوتي كان يعلق عند «جاري دمج الصوت» (libx264 بالمتصفّح دقائق).
// الدمج ينسخ صورة WebM ويضيف opus، والترميز احتياط ultrafast بمهلة.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-11-video.js'), 'utf8');
const i = src.indexOf('async function muxNarrationAny');
assert(i > 0, 'muxNarrationAny موجودة');
const body = src.slice(i, src.indexOf('async function runCanvasOnly', i));
assert(/'-c:v', 'copy', '-c:a', 'libopus'/.test(body), 'نسخ الصورة + opus أوّلًا');
assert(/'muxout\.webm'\], 60000\)/.test(body), 'مهلة لخطوة النسخ');
assert(/'-preset', 'ultrafast'/.test(body), 'الترميز الاحتياطي ultrafast');
assert(/180000\) !== 0\) throw/.test(body), 'مهلة وفحص نتيجة الاحتياط');
assert(!/'libx264', '-pix_fmt'/.test(body), 'لا ترميز بالإعداد البطيء الافتراضي');
assert(/type: 'video\/webm'/.test(body), 'الناتج WebM');
const bundle = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.bundle.js'), 'utf8');
assert(bundle.includes("'muxout.webm'], 60000)"), 'الحزمة مبنيّة بالتعديل');
console.log('canvas-mux-fast OK');
