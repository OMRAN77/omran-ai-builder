#!/usr/bin/env node
// scripts/social-post-file.mjs — نشر فيديو جاهز من المستودع على المنصّات عبر Upload-Post (v-post-file).
// المالك ٩ نوفمبر عن فيديو حوار سيف وميرا: «حمّله في التواصل الاجتماعي» ← اختار «الكامل على اللي تقبله»: الفيديو كما هو (٣:١٩، عرضيّ)
// على يوتيوب وتيك توك وفيسبوك (فيديو عاديّ لا ريلز)، بلا إنستغرام وإكس (طوله فوق حدّ الريلز ~٩٠ث/٣د وإكس ~٢:٢٠).
// يعمل في GitHub Actions (وظيفة file في social-bot.yml) بسرّ UPLOAD_POST_API_KEY نفسه — لا مفتاح في الجلسة ولا في المستودع.
// النصوص هنا في الكود (تُراجَع في طلب السحب)، والمعرّف الخارجيّ لا يطابق حلقات البوت (omai-ep-…) ولا ميرا (mira-…) فلا يحرّك ترقيمهما.
//   FILE=video/final/om-ai-tour-duo-ar.mp4 [PLATFORMS=auto|youtube,tiktok,facebook] [DRY_RUN=1] node scripts/social-post-file.mjs
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { upFetch, connectedPlatforms, platformResults, log, gh, sleep } from './social-bot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UP_USER = process.env.UPLOAD_POST_USER || 'omranaibuilder';
const DRY = /^(1|true|yes)$/i.test(process.env.DRY_RUN || '');
const LINK = 'https://omran-ai-builder.vercel.app/download'; // نفس رابط باركود آخر الفيديو
const TAGS = ['#OMAi', '#ذكاء_اصطناعي', '#AI', '#تطبيقات', '#الامارات', '#السعودية', '#الكويت', '#قطر', '#عمان', '#البحرين'];

export const POSTS = {
  'video/final/om-ai-tour-duo-ar.mp4': {
    id: 'omai-tour-duo-1',
    platforms: ['youtube', 'tiktok', 'facebook'],
    title: 'جولة في OM Ai مع سيف وميرا — كلّ أدوات التطبيق في ٣ دقائق',
    lines: [
      'سيف وميرا ياخذونك جولة في OM Ai مكان مكان 🇦🇪',
      'تبني تطبيق بجملة وحدة، وتسوّي فيديو، وتغيّر ديكورك، وتجرّب الأزياء والستايلات، وتتابع الأسهم، وتذاكر بالألعاب… وأكثر ✨',
    ],
  },
};

export function captions(p) {
  const tags = TAGS.join(' ');
  const withLink = [...p.lines, '', 'حمّل التطبيق ببلاش 👈 ' + LINK, 'أو امسح الباركود في آخر الفيديو.', '', tags].join('\n');
  return {
    youtubeTitle: p.title.slice(0, 100),
    youtube: withLink,
    facebook: withLink,
    tiktok: [...p.lines, '', 'حمّل التطبيق ببلاش 👈 الرابط في البايو 🔗', '', tags].join('\n').slice(0, 2200), // تيك توك لا يفتح الروابط في الوصف
  };
}

// هل المنشور ظاهر للناس فعلًا؟ (المالك: «ما وصل أيّ شي») — oEmbed العامّ لكلّ منصّة بلا تسجيل دخول: يردّ للعامّ والمخفيّ بالرابط،
// ويرفض الخاصّ والمحذوف. فيسبوك بلا oEmbed عامّ (يحتاج رمزًا) فيُطبع رمز HTTP لصفحة الفيديو وحده.
async function visibility(rows) {
  for (const it of rows) {
    const url = it.post_url || it.url || '';
    let res = 'لا رابط';
    try {
      if (/youtube\.com|youtu\.be/.test(url)) {
        const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url));
        res = r.status === 200 ? 'ظاهر للعامّ: ' + ((await r.json()).title || '') : 'غير ظاهر (HTTP ' + r.status + ' — خاصّ أو قيد المعالجة أو محذوف)';
      } else if (/tiktok\.com/.test(url)) {
        const r = await fetch('https://www.tiktok.com/oembed?url=' + encodeURIComponent(url));
        const j = await r.json().catch(() => ({}));
        // oEmbed تيك توك قد يحذف العنوان ويعطي المشغّل وحده — المشغّل (type=video وiframe) = ظاهر للعامّ
        const ok = r.status === 200 && (j.title !== undefined || j.type === 'video' || /<iframe/.test(String(j.html || '')));
        res = ok ? 'ظاهر للعامّ: ' + (j.author_name || 'مشغّل الفيديو متاح') + (j.title ? ' — ' + String(j.title).slice(0, 60) : '') : 'غير ظاهر (HTTP ' + r.status + ' ' + JSON.stringify(j).slice(0, 160) + ')';
      } else if (url) {
        const r = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0' } });
        res = 'HTTP ' + r.status + (r.headers.get('location') ? ' ← ' + String(r.headers.get('location')).slice(0, 80) : '');
      }
    } catch (e) { res = 'تعذّر الفحص: ' + String(e && e.message).slice(0, 80); }
    const line = it.platform + ': ' + res + ' · ' + url + ' · ' + (it.upload_timestamp || '');
    log(line); gh(/ظاهر للعامّ/.test(res) ? 'notice' : 'warning', line);
  }
}

async function main() {
  const file = String(process.env.FILE || '').trim();
  const post = POSTS[file];
  if (!post) throw new Error('ملفّ غير معروف للنشر: «' + file + '» — المعروف: ' + Object.keys(POSTS).join(', '));
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) throw new Error('الملفّ غير موجود في هذا الفرع: ' + file);
  if (!process.env.UPLOAD_POST_API_KEY) throw new Error('UPLOAD_POST_API_KEY غير موجود');
  const raw = (process.env.PLATFORMS || 'auto').trim().toLowerCase();
  const want = raw === 'auto' ? post.platforms : raw.split(',').map((x) => x.trim()).filter((x) => post.platforms.includes(x));

  // المنصّات الموصولة فعلًا في ملفّ Upload-Post
  const u = await upFetch('/uploadposts/users');
  const profs = (u.j && (u.j.profiles || (u.j.profile ? [u.j.profile] : []))) || [];
  const prof = profs.find((x) => x && x.username === UP_USER) || null;
  const on = connectedPlatforms((prof && prof.social_accounts) || {}, want);
  const off = want.filter((x) => !on.includes(x));
  log('مطلوب: ' + want.join(',') + ' · موصول: ' + (on.join(',') || 'لا شيء') + (off.length ? ' · غير موصول: ' + off.join(',') : ''));
  if (off.length) gh('warning', 'غير موصول في Upload-Post: ' + off.join(', '));
  if (!on.length) throw new Error('لا منصّة موصولة من المطلوبة');

  // لا نشر مرّتين: المعرّف نفسه منشور بنجاح ⇐ توقّف
  const h = await upFetch('/uploadposts/history?limit=100&status=success&page=1&profile_username=' + encodeURIComponent(UP_USER));
  const doneRows = ((h.j && h.j.history) || []).filter((it) => it && it.external_id === post.id && it.success !== false);
  const done = doneRows.map((it) => it.platform);
  const todo = on.filter((x) => !done.includes(x));
  if (done.length) { log('منشور من قبل بهذا المعرّف على: ' + [...new Set(done)].join(',')); await visibility(doneRows); }
  if (!todo.length) { gh('notice', 'منشور من قبل على كلّ المنصّات — لا شيء'); return; }

  const cap = captions(post);
  log('العنوان: ' + cap.youtubeTitle);
  log('الوصف:\n' + cap.youtube);
  if (DRY) { gh('notice', 'DRY_RUN — سيُنشر على: ' + todo.join(', ')); log('DRY_RUN: لا نشر'); return; }

  const fd = new FormData();
  fd.append('user', UP_USER);
  for (const p of todo) fd.append('platform[]', p);
  fd.append('title', cap.youtubeTitle);
  fd.append('video', new Blob([fs.readFileSync(abs)], { type: 'video/mp4' }), path.basename(file));
  if (todo.includes('youtube')) {
    fd.append('youtube_title', cap.youtubeTitle); fd.append('youtube_description', cap.youtube);
    fd.append('privacyStatus', 'public'); fd.append('selfDeclaredMadeForKids', 'false');
    for (const t of ['OM Ai', 'ذكاء اصطناعي', 'تطبيقات', 'الامارات']) fd.append('tags[]', t);
  }
  if (todo.includes('tiktok')) {
    fd.append('tiktok_title', cap.tiktok); fd.append('privacy_level', 'PUBLIC_TO_EVERYONE'); fd.append('brand_organic_toggle', 'true');
  }
  if (todo.includes('facebook')) {
    const pg = await upFetch('/uploadposts/facebook/pages?profile=' + encodeURIComponent(UP_USER));
    const pages = (pg.j && pg.j.pages) || [];
    const page = pages.find((x) => /om\s*ai/i.test(x.name || '')) || pages[0];
    if (page) { fd.append('facebook_page_id', String(page.id)); log('صفحة فيسبوك: ' + page.name); } else log('لا صفحة فيسبوك (' + pg.status + ')');
    fd.append('facebook_title', cap.youtubeTitle); fd.append('facebook_description', cap.facebook);
    fd.append('facebook_media_type', 'VIDEO'); // فيديو عاديّ: الريلز حدّها أقصر من ٣:١٩
  }
  const reqId = 'omai-file-' + Date.now().toString(36) + randomBytes(3).toString('hex');
  fd.append('request_id', reqId); fd.append('async_upload', 'true'); fd.append('external_id', post.id);
  const r = await upFetch('/upload', { method: 'POST', body: fd, headers: { 'Idempotency-Key': reqId } });
  log('upload → ' + r.status + ' ' + JSON.stringify(r.j).slice(0, 300));
  if (!r.ok && r.status !== 202) throw new Error('upload failed ' + r.status);
  const id = r.j.request_id || reqId;
  for (let i = 0; i < 90; i++) {
    await sleep(10000);
    const s = await upFetch('/uploadposts/status?request_id=' + encodeURIComponent(id));
    const st = s.j && s.j.status;
    if (['completed', 'failed', 'not_found'].includes(st)) {
      const rows = platformResults(s.j);
      for (const x of rows) gh(x.ok ? 'notice' : 'warning', x.platform + ': ' + (x.ok ? (x.url || 'تمّ') : x.error));
      log('status: ' + st + ' ' + JSON.stringify(rows));
      if (st !== 'completed' || rows.some((x) => !x.ok)) process.exitCode = 1;
      return;
    }
  }
  gh('warning', 'الحالة ما زالت قيد الرفع بعد ١٥ دقيقة — راجع لوحة Upload-Post');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { gh('error', String(e && e.message || e)); console.error(e); process.exit(1); });
}
