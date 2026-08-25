// scripts/e2e-prod.mjs — التجربة التي يعيشها المستخدم، على النطاق الحقيقيّ،
// بمتصفّح حقيقيّ: تسجيل حساب ← إعادة تحميل ← تبويب جديد ← لوحة التشخيص.
//
// لماذا وُجد: يوم كامل والخادم أخضر (٤/٤ مرّتين) والعميل أخضر محلّيًّا،
// والمالك يرى «التسجيل ما يثبت». الحلقة الوحيدة غير المقيسة كانت: المتصفّح
// الحقيقيّ على النطاق الحقيقيّ. هذا يقيسها، ويرفع لقطات شاشة يراها المالك
// بعينه بدل أن يصدّق سطورًا خضراء.
//
// يترك حسابًا واحدًا باسم zzcheck… (كسائر فحوص الحسابات — يُحذف من الإدارة).
import { chromium } from 'playwright';
import { randomBytes } from 'node:crypto';

const BASE = (process.argv[2] || 'https://omran-ai-builder.vercel.app').replace(/\/$/, '');
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✓ ' + m); };
const no = (m) => { fail++; console.log('  ✗ ' + m); };

const user = 'zzcheck' + randomBytes(3).toString('hex');
const pw = randomBytes(12).toString('base64url');

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1000, height: 800 } });
const p = await ctx.newPage();
const pageErrs = [];
p.on('pageerror', (e) => pageErrs.push(e.message.slice(0, 160)));

const state = () => p.evaluate(() => ({
  overlay: (() => { const o = document.querySelector('#authOverlay'); if (!o) return 'لا عنصر'; const s = getComputedStyle(o); return (s.display === 'none' || s.visibility === 'hidden') ? 'مخفيّ' : 'ظاهر'; })(),
  tokL: !!localStorage.getItem('aiapp_auth_token'),
  tokC: /aiapp_auth_token=/.test(document.cookie),
  user: localStorage.getItem('aiapp_username') || sessionStorage.getItem('aiapp_username') || null,
}));

console.log('① الصفحة تفتح والواجهة تُبنى');
await p.goto(BASE, { waitUntil: 'load', timeout: 45000 });
await p.waitForTimeout(4000);
const boot = await p.evaluate(() => ({ scripts: document.querySelectorAll('script[src]').length, send: typeof window.sendPrompt }));
boot.send === 'function' ? ok(`الحزمة تعمل (${boot.scripts} سكربتًا، sendPrompt دالّة)`) : no(`الحزمة لا تعمل — sendPrompt=${boot.send}`);
await p.screenshot({ path: 'e2e-1-فتح.png', fullPage: false });

console.log('② تسجيل حساب جديد من الواجهة نفسها');
await p.evaluate(() => { const hb = document.querySelector('#headerLoginBtn'); if (hb) hb.click(); else { const o = document.querySelector('#authOverlay'); if (o) o.style.display = 'flex'; } });
await p.waitForTimeout(700);
await p.click('#authTabSignup', { timeout: 15000 });
await p.fill('#authUsername', user);
await p.fill('#authPassword', pw);
await p.screenshot({ path: 'e2e-2-قبل-الإرسال.png' });
await p.click('#authSubmitBtn');
await p.waitForTimeout(3500);
const modal = await p.evaluate(() => { const m = document.querySelector('#authRecoveryModal'); return m && getComputedStyle(m).display !== 'none'; });
if (modal) { ok('نافذة رمز الاسترجاع ظهرت — الحساب أُنشئ'); await p.click('#authAckRecoveryBtn'); await p.waitForTimeout(1200); }
else {
  const err = await p.evaluate(() => (document.querySelector('#authError') || {}).textContent || '');
  no('لم تظهر نافذة الاسترجاع' + (err ? ' — رسالة الخطأ: ' + err : ''));
}
let s1 = await state();
await p.screenshot({ path: 'e2e-3-بعد-التسجيل.png' });
(s1.overlay === 'مخفيّ' && s1.user === user) ? ok(`داخل التطبيق باسم ${s1.user}`) : no(`الحالة بعد التسجيل: شاشة=${s1.overlay} مستخدم=${s1.user}`);
s1.tokL ? ok('التوكن في localStorage') : no('لا توكن في localStorage');
s1.tokC ? ok('التوكن في الكوكي') : no('لا توكن في الكوكي');

console.log('③ إعادة تحميل الصفحة — هل تثبت الجلسة؟');
await p.reload({ waitUntil: 'load' });
await p.waitForTimeout(4500);
const s2 = await state();
await p.screenshot({ path: 'e2e-4-بعد-إعادة-التحميل.png' });
(s2.overlay === 'مخفيّ' && s2.user === user) ? ok('ما زال داخلًا بعد إعادة التحميل') : no(`خرج بعد إعادة التحميل: شاشة=${s2.overlay} مستخدم=${s2.user}`);

console.log('④ تبويب جديد — نفس المتصفّح');
const p2 = await ctx.newPage();
await p2.goto(BASE, { waitUntil: 'load' });
await p2.waitForTimeout(4500);
const s3 = await p2.evaluate(() => ({
  overlay: (() => { const o = document.querySelector('#authOverlay'); if (!o) return 'لا عنصر'; const s = getComputedStyle(o); return (s.display === 'none' || s.visibility === 'hidden') ? 'مخفيّ' : 'ظاهر'; })(),
  user: localStorage.getItem('aiapp_username'),
}));
(s3.overlay === 'مخفيّ' && s3.user === user) ? ok('ما زال داخلًا في تبويب جديد') : no(`تبويب جديد: شاشة=${s3.overlay} مستخدم=${s3.user}`);

console.log('⑤ لوحة التشخيص تقول رأيها');
await p.goto(BASE + '/?diag=1', { waitUntil: 'load' });
await p.waitForTimeout(3500);
const rows = await p.evaluate(() => [...document.querySelectorAll('#sessionDiagBox tr')].map(tr => [...tr.children].map(td => td.textContent.trim())));
await p.screenshot({ path: 'e2e-5-لوحة-التشخيص.png', fullPage: true });
if (rows && rows.length) { ok('اللوحة ظهرت:'); rows.forEach(([k, v]) => console.log('     ' + k + ' : ' + v)); }
else no('لوحة التشخيص لم تظهر');

if (pageErrs.length) { console.log('\nأخطاء صفحة:'); [...new Set(pageErrs)].slice(0, 8).forEach(e => console.log('  ' + e)); }
console.log(`\n  · احذف الحساب ${user} من لوحة الإدارة متى شئت.`);
console.log(`\n${fail === 0 ? '✓ التجربة كاملة تعمل على النطاق الحقيقيّ' : '✗ التجربة تنكسر — والسطور أعلاه تسمّي أين'} — نجح ${pass} · فشل ${fail} · ${BASE}`);
await b.close();
process.exit(fail === 0 ? 0 : 1);
