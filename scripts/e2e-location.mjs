// scripts/e2e-location.mjs — «وين أنا؟» كما يعيشها مستخدم حقيقيّ على الإنتاج:
// متصفّح حقيقيّ بإذن موقع ممنوح وإحداثيات عجمان الثابتة، يرسل السؤال في
// المحادثة الفعليّة ويلتقط: هل استُدعيت أداة get_location؟ ما الذي أعاده
// التحويل العكسي؟ وما نصّ الردّ النهائي؟ — مع لقطة شاشة تُرفع كملفّ.
import { chromium } from 'playwright';

const BASE = (process.argv[2] || 'https://omran-ai-builder.vercel.app').replace(/\/$/, '');
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✓ ' + m); };
const no = (m) => { fail++; console.log('  ✗ ' + m); };

const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: 1200, height: 800 },
  geolocation: { latitude: 25.4052, longitude: 55.5136, accuracy: 25 }, // عجمان — النعيمية تقريبًا
  permissions: ['geolocation'],
});
const p = await ctx.newPage();

const trail = { revgeo: null, toolResult: null, chatCalled: false };
p.on('request', (r) => {
  const u = r.url();
  if (u.includes('action=chat')) trail.chatCalled = true;
  if (u.includes('action=revgeo')) trail.revgeo = 'طُلب';
  if (u.includes('agent-tool-result')) {
    try { trail.toolResult = JSON.parse(r.postData() || '{}').output || null; } catch (e) { /* جسم غير JSON */ }
  }
});
p.on('response', async (r) => {
  if (r.url().includes('action=revgeo')) {
    try { const j = await r.json(); trail.revgeo = j.label || ('HTTP ' + r.status()); } catch (e) { trail.revgeo = 'HTTP ' + r.status(); }
  }
});

console.log('① فتح الصفحة');
await p.goto(BASE, { waitUntil: 'load', timeout: 45000 });
await p.waitForTimeout(4500);
const booted = await p.evaluate(() => typeof window.sendPrompt === 'function');
booted ? ok('الحزمة تعمل') : no('الحزمة لا تعمل');

console.log('② إرسال «وين انا» في المحادثة الحقيقيّة');
await p.fill('#prompt', 'وين انا');
await p.evaluate(() => document.getElementById('btnSend').click());

// ننتظر الردّ حتى ٩٠ ثانية — الأداة تحتاج جولتين للنموذج.
let reply = '';
for (let i = 0; i < 45; i++) {
  await p.waitForTimeout(2000);
  reply = await p.evaluate(() => {
    const els = document.querySelectorAll('#messages .msg.assistant .msg-text');
    const last = els[els.length - 1];
    return last ? last.innerText.trim() : '';
  });
  if (reply && !/يكتب|يبحث|يحدّد/.test(reply) && reply.length > 15 && i > 4) break;
}
await p.screenshot({ path: 'e2e-loc-1-الرد.png', fullPage: false });

console.log('\n─── ما التُقط ───');
console.log('نداء المحادثة:', trail.chatCalled ? '✅' : '❌');
console.log('التحويل العكسي (revgeo):', trail.revgeo || '❌ لم يُستدعَ');
console.log('ناتج الأداة الذي أُعيد للنموذج:', (trail.toolResult || '❌ لا شيء').slice(0, 160));
console.log('نصّ الردّ:', JSON.stringify(reply.slice(0, 300)));

trail.chatCalled ? ok('السؤال وصل الخادم') : no('السؤال لم يصل الخادم');
trail.revgeo && trail.revgeo !== 'طُلب' && /عجمان/.test(trail.revgeo)
  ? ok('get_location اشتغلت والتحويل أعاد عجمان: ' + trail.revgeo)
  : no('أداة الموقع لم تعمل كما يجب — revgeo: ' + (trail.revgeo || 'غائب'));
/عجمان|النعيمية|الراشدية|الجرف|مشيرف/.test(reply)
  ? ok('الردّ سمّى المنطقة الصحيحة')
  : no('الردّ لم يسمِّ عجمان — قال: ' + reply.slice(0, 120));

console.log(`\n${fail === 0 ? '✓ «وين أنا» تعمل على الإنتاج كما صُمّمت' : '✗ «وين أنا» تنكسر — والسطور أعلاه تسمّي أين'} — نجح ${pass} · فشل ${fail}`);
await b.close();
process.exit(fail === 0 ? 0 : 1);
