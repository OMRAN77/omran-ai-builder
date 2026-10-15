'use strict';
/* v-branch-shots (المالك ١٤ أكتوبر: «يعني ماتقدر تعطيهم هذي. الجهاز الي عندك» ثمّ «ابدا»): Claude Code في جلسة الويب يصوّر الواجهة
   (scripts/ui-shot.mjs) قبل أن يقول «تمّ»، والمزوّدون في التطبيق لا جهاز لهم — يعدّلون عبر GitHub ولا يرون الشاشة. الآن: جهاز GitHub
   (branch-shots.yml) يصوّر فرعهم حاسوبًا وجوّالًا بلا خادم ولا مفاتيح، ويقرؤون اللقطتين بـmanage_github action=shots فتصلهم صورًا.
   أوامر ثابتة لا يكتبها النموذج: المدخلان الوحيدان (قسم إعدادات، معرّف زرّ يُضغط) يمرّان بهذين الفاحصين في الخادم وفي سكربت الجهاز
   نفسه، فنصّ من صفحة ويب لا يصير أمرًا على الجهاز. هذا الملفّ دوالّ نقيّة يتشاركها الخادم والسكربت (يُختبر بلا شبكة). */

const WORKFLOW = 'branch-shots.yml';
const ARTIFACT = 'shots';
const SETTINGS_RE = /^[A-Za-z]{2,40}Section$/;
const CLICK_RE = /^#[A-Za-z][A-Za-z0-9_-]{0,59}$/;
const BRANCH_RE = /^(?![./-])(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._\/-]{1,120}$/;
const SHOT_FILES = ['desktop.png', 'mobile.png'];

/** مدخلات العرض: فارغ = الصفحة الرئيسيّة. غير الصالح يُرفض بسببه (لا يُصحَّح بصمت). */
function viewOf(i) {
  const s = String((i && i.settings) || '').trim();
  const c = String((i && i.click) || '').trim();
  if (s && !SETTINGS_RE.test(s)) return { error: 'settings يقبل معرّف قسم إعدادات فقط مثل accountSection (حروف لاتينيّة تنتهي بـSection).' };
  if (c && !CLICK_RE.test(c)) return { error: 'click يقبل معرّف زرّ فقط مثل #btnPortraitStyles (# ثمّ حروف وأرقام و_-).' };
  return { settings: s, click: c };
}

/** عنوان التشغيل كما يكتبه run-name في الورك فلو — به يُعرف تشغيل هذا الفرع وهذا العرض من غيره. */
function titleOf(ref, v) {
  return norm('shots ' + ref + ' ' + ((v && v.settings) || '') + ' ' + ((v && v.click) || ''));
}
function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

/** أمر ui-shot نفسه (مصفوفة وسائط بلا صدفة): الصفحة الرئيسيّة حاسوبًا وجوّالًا كمالك، ثمّ القسم/الزرّ إن صلحا. */
function shotArgs(out, v) {
  const args = ['scripts/ui-shot.mjs', '--out', out, '--user', 'omran', '--both'];
  if (v && v.settings && SETTINGS_RE.test(v.settings)) args.push('--settings', v.settings);
  if (v && v.click && CLICK_RE.test(v.click)) args.push('--eval', '(function(){var el=document.querySelector(' + JSON.stringify(v.click) + ');if(el)el.click();})()', '--settle', '900');
  return args;
}

/** ملفّات الأرشيف ← اللقطتان والملخّص. */
function pickShots(files) {
  const out = { images: [], summary: null };
  for (const f of Array.isArray(files) ? files : []) {
    const base = String(f.name || '').split('/').pop();
    if (SHOT_FILES.indexOf(base) !== -1 && f.data && f.data.length) out.images.push({ name: base, b64: Buffer.from(f.data).toString('base64'), bytes: f.data.length });
    else if (base === 'summary.json') { try { out.summary = JSON.parse(Buffer.from(f.data).toString('utf8')); } catch (e) { out.summary = null; } } // guard-ok — ملخّص تالف = بلا ملخّص
  }
  out.images.sort((a, b) => SHOT_FILES.indexOf(a.name) - SHOT_FILES.indexOf(b.name));
  return out;
}

module.exports = { WORKFLOW, ARTIFACT, SETTINGS_RE, CLICK_RE, BRANCH_RE, SHOT_FILES, viewOf, titleOf, norm, shotArgs, pickShots };
