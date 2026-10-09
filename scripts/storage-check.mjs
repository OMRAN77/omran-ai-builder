// scripts/storage-check.mjs — هل تقبل قاعدة البيانات الكتابة الآن؟ ولماذا لا؟
//
// «Auth error» عند إنشاء حساب (لقطة المالك ٩ أكتوبر) عرَضٌ له أسباب مختلفة تمامًا، وكلّها تنتهي
// إلى الردّ العامّ نفسه من auth.js لأنّ kv.js يبتلع أخطاء القراءة ويرمي عند الكتابة:
//
//   ① Upstash ترفض الكتابة: السعة امتلأت (٢٥٦ م.ب في المجّانيّة — حدث ٤ أكتوبر)، أو حدّ الطلبات،
//      أو رمز مرفوض، أو انقطاع. السجلّ الجديد لا يُحفظ، والدخول للحسابات القائمة يبدو سليمًا (قراءة).
//   ② الكتابة تُقبل، والعطب في التعمية (AUTH_SECRET) أو غيرها — يحسمه account-roundtrip.mjs.
//
// v-storage-check (٩ أكتوبر): كان يكتب سجلّ مشاركة بلا رمز، وv-share-guard جعل النشر برمز جلسة إلزاميّ
// (٨ أكتوبر) — فصار يردّ ٤٠١ ويحكم زورًا بأنّ «التخزين هو العطب». الآن يكتب عبر سجلّ أخطاء المتصفّح
// (POST /api/system?action=client-errors) — عامّ بلا رمز، ويكتب في نفس Redis، ويعيد نصّ Upstash نفسه
// عند الرفض. السطر بمصدر «diag:» فلا يُعدّ خطأً في لوحة المالك (isDiag)، ونصّه ثابت فيُدمج مع سابقه بعدّاد
// بدل أن يتكدّس سطر لكلّ تشغيل. بـMONITOR_KEY (اختياريّ) يقرأ فحص الصحّة وما يملأ القاعدة (قراءة فقط).
//
//   node scripts/storage-check.mjs [BASE_URL]      [MONITOR_KEY=… اختياريّ]
const BASE = (process.argv[2] || 'https://omran-ai-builder.vercel.app').replace(/\/$/, '');
const KEY = (process.env.MONITOR_KEY || '').trim();
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✓ ' + m); };
const no = (m) => { fail++; console.log('  ✗ ' + m); };

// نفس تصنيف redisWhy في api/_lib/health.js (الأطول أوّلًا: «quota» قد تكون السعة لا الطلبات — PITFALLS).
export function why(text) {
  const m = String(text || '');
  if (/capacity quota|DB capacity|OOM|maxmemory|max(?:imum)? (?:database|data|db) size/i.test(m)) return 'سعة قاعدة Upstash امتلأت — كلّ كتابة مرفوضة (حساب جديد، نقاط، حفظ). العلاج: حذف ما يملؤها أو رفع الباقة.';
  if (/limit exceeded|max (?:daily )?requests?|quota/i.test(m)) return 'تجاوز حدّ الطلبات في باقة Upstash — ينتظر تجدّد الحدّ أو رفع الباقة.';
  if (/missing UPSTASH_REDIS_REST/i.test(m)) return 'متغيّرا UPSTASH_REDIS_REST_URL/TOKEN ناقصان في Vercel.';
  if (/\b(?:401|403)\b|unauthori[sz]ed|invalid token|WRONGPASS|NOPERM/i.test(m)) return 'رمز Upstash مرفوض (تغيّر أو حُذف؟) — راجع UPSTASH_REDIS_REST_TOKEN في Vercel.';
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|aborted|timeout|network/i.test(m)) return 'لا اتّصال بخادم Upstash.';
  return '';
}

async function main() {
  console.log('① كتابة سطر تشخيص في نفس قاعدة بيانات الحسابات');
  let writes = false;
  try {
    const r = await fetch(BASE + '/api/system?action=client-errors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'storage-check write probe', source: 'diag:storage-check', line: 0 }),
    });
    const t = await r.text();
    if (r.status === 200 && !/"skipped"/.test(t)) { writes = true; ok('الكتابة قُبلت (٢٠٠)'); }
    else {
      no(`الكتابة → ${r.status} ${t.slice(0, 220)}`);
      const w = why(t);
      if (w) console.log('  · السبب: ' + w);
    }
  } catch (e) { no('الطلب نفسه تعذّر — ' + e.message); }

  if (KEY) {
    console.log('② فحص الصحّة بمفتاح المراقب (قراءة فقط)');
    try {
      const r = await fetch(BASE + '/api/system?action=health&key=' + encodeURIComponent(KEY));
      const d = await r.json().catch(() => null);
      if (!d) no('الصحّة → ' + r.status);
      else {
        (d.redisOk ? ok : no)('Redis: ' + (d.redisOk ? 'سليمة' : (d.redisWhy || 'لا تستجيب')));
        for (const e of (d.serverErrors || []).slice(0, 6)) console.log(`  · خطأ خادم: ${e.route || '?'} — ${String(e.message || '').slice(0, 140)} ×${e.count || 1} (${e.lastAt || e.at || ''})`);
      }
      const u = await fetch(BASE + '/api/system?action=health&usage=1&key=' + encodeURIComponent(KEY));
      const ud = await u.json().catch(() => null);
      const us = ud && ud.usage;
      if (us) {
        console.log(`  · ما يملأ القاعدة: ${us.totalKeys} مفتاحًا · ${(Number(us.totalBytes || 0) / 1048576).toFixed(1)} م.ب${us.truncated ? ' (عيّنة)' : ''}`);
        for (const g of (us.groups || []).slice(0, 8)) console.log('    ' + JSON.stringify(g).slice(0, 160));
      }
    } catch (e) { no('الصحّة تعذّرت — ' + e.message); }
  } else console.log('  · بلا MONITOR_KEY — لا قراءة لسبب الصحّة ولا لما يملأ القاعدة (زرّا «افحص الآن» و«ما يملأ القاعدة» في لوحة المالك يعرضانهما).');

  console.log('\nالخلاصة');
  if (writes && fail === 0) {
    console.log('  · القاعدة تقبل الكتابة الآن. إن بقي «Auth error» عند التسجيل فالعطب ليس في التخزين:');
    console.log('    شغّل الفحص نفسه بخيار account=true (ينشئ حساب zzcheck واحدًا) وابحث في سجلّ Vercel عن auth:handler.');
  } else if (!writes) {
    console.log('  · القاعدة لا تقبل الكتابة: كلّ حساب جديد يفشل بـ«Auth error» حتّى يُعالَج السبب أعلاه.');
  }
  console.log(`\n${fail === 0 ? '✓ التخزين يقبل الكتابة' : '✗ في التخزين عطب'} — نجح ${pass} · فشل ${fail} · ${BASE}`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) await main();
