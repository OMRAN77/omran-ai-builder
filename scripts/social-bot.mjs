// بوت التسويق الآلي (طلب المالك): سلسلة «سوّها بـ OM Ai» — حلقة كلّ يومين، والنوع يتبدّل وحده:
// 🌐 موقع ← 🎬 فيديو ترند ← 🖼️ أنماط صور ← … (وإذا تعثّر نوع جرّب اللي بعده بدل ما تفوت الحلقة).
// يختار فكرة من ترندات البحث في الخليج (وإلّا من القائمة الثابتة)، يبنيها بـ OM Ai الحقيقي
// على الإنتاج من حساب البوت، يصوّر العملية فيديو عموديًّا 1080×1920 («الحلقة N» + «سوّيته في X ثانية»
// + الشعار)، ثمّ ينشره على كلّ منصّة موصولة في Upload-Post. الزمن المكتوب هو الزمن الفعليّ
// من ضغطة الإرسال إلى اكتمال الموقع — لا رقم مُختلَق. رقم الحلقة من سجلّ النشر نفسه (external_id).
//
// البيئة:
//   UPLOAD_POST_API_KEY  مفتاح Upload-Post (بدونه: يُصنع الفيديو ولا يُنشر)
//   UPLOAD_POST_USER     ملفّ Upload-Post (الافتراضيّ omranaibuilder)
//   PLATFORMS            auto (الافتراضيّ: كلّ الموصول من instagram,facebook,tiktok,youtube,x,threads) أو قائمة بفواصل
//   MONITOR_KEY          اختياريّ: يضيف حساب البوت لقائمة VIP تلقائيًّا (وإلّا يضيفه المالك من لوحة التحكّم)
//                        كلمة سرّ حساب البوت مشتقّة من UPLOAD_POST_API_KEY — لا سرّ جديد
//   BOT_USER             اسم حساب البوت (الافتراضيّ omaisocial)
//   IDEA_INDEX           رقم فكرة محدّد من القائمة؛ وإلّا فكرة من الترند (IDEA_SOURCE=list للقائمة وحدها)
//                        أو نوع الحلقة: video (اسكتش بيكسار من الترند) · video:<ترند> · styles · styles:<man|falcon|grandpa|woman>
//   KIND                 مثل خانة idea للنوع (site|video|styles)؛ بدونهما النوع بالدور من رقم الحلقة
//   EPISODE              رقم حلقة محدّد؛ وإلّا آخر حلقة منشورة + 1
//   --gate               فحص خفيف قبل التثبيت: الجدول يومي، والحلقة تنزل إذا مرّ 36 ساعة على السابقة
//   DRY_RUN=1            صناعة الفيديو دون نشر (ويُقرأ الموصول من Upload-Post قراءةً فقط ليظهر في السجلّ)
//   idea=accounts        فحص بلا تكلفة: المنصّات الموصولة ونصوص X وThreads التجريبيّة، بلا فيديو ولا نشر
//   BASE                 الموقع (الافتراضيّ الإنتاج) · OUT_DIR مجلّد المخرجات · CHROME_PATH متصفّح محلّيّ
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.BASE || 'https://omran-ai-builder.vercel.app').replace(/\/$/, '');
const OUT = path.resolve(process.env.OUT_DIR || path.join(ROOT, 'social-out'));
const DRY = /^(1|true|yes)$/i.test(process.env.DRY_RUN || '');
const UP_KEY = process.env.UPLOAD_POST_API_KEY || '';
const UP_USER = process.env.UPLOAD_POST_USER || 'omranaibuilder';
const UP_API = 'https://api.upload-post.com/api';
const PLATFORMS_RAW = (process.env.PLATFORMS || 'auto').trim().toLowerCase();
const AUTO_PLATFORMS = ['instagram', 'facebook', 'tiktok', 'youtube', 'x', 'threads'];
const MONITOR_KEY = process.env.MONITOR_KEY || '';
const BOT_USER = (process.env.BOT_USER || 'omaisocial').trim().toLowerCase();
const CHROME = process.env.CHROME_PATH || undefined;
export const SITE = 'omran-ai-builder.vercel.app';
export const QR_URL = 'https://' + SITE + '/app?ref=omran'; // نفس رابط باركود المالك

export const W = 1080, H = 1920, FPS = 30;
const VW = 432, VH = 768, DPR = 2.5;
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const BUILD_TIMEOUT_MS = 300000;
const SERIES = 'سوّها بـ OM Ai';
const SEASON_LEN = 30;
const EVERY_H = 36; // الجدول يوميّ؛ الحلقة تنزل إذا مرّ 36 ساعة على السابقة = كلّ يومين بالضبط حتى آخر الشهر
// external_id للحلقة: omai-ep-N-<نوع> (الحلقات الأولى بلا نوع: يُعرف من نصّها).
const EP_ID = (n, kind) => 'omai-ep-' + n + (kind ? '-' + kind : '');
const EP_RE = /^omai-ep-(\d+)(?:-(site|video|styles))?$/;
const TREND_GEOS = ['AE', 'SA', 'KW', 'QA'];
const SERIES2 = SERIES;
// أنواع الحلقات: 🌐 موقع من ترند اليوم · 🎬 فيديو ترند من صانع الفيديو · 🖼️ صورة وحدة بعدّة أنماط.
// النوع بالدور من رقم الحلقة (1 موقع، 2 فيديو، 3 أنماط، 4 موقع…)، ويُفرض من خانة idea: site · video · video:legofy · styles · styles:falcon
export const KINDS = {
  site: { tag: 'موقع بجملة', series: SERIES },
  video: { tag: 'ترند فيديو', series: SERIES2 },
  styles: { tag: 'أنماط الصور', series: SERIES2 },
};
const ROTATION = ['site', 'video', 'styles'];
export const kindFor = (epN) => ROTATION[((Math.max(1, Number(epN) || 1) - 1) % ROTATION.length)];
// نوع الحلقة أوّلًا، ثمّ البقيّة بالترتيب: لو تعثّر نوع (موقع هزيل، توليد فشل) تنزل الحلقة بالنوع اللي بعده.
// الدور يمشي من نوع آخر حلقة منشورة فعلًا (لو نزلت حلقة بنوع احتياطيّ ما يتكرّر نفس النوع)، وإلّا من رقم الحلقة.
export const kindOrder = (epN, lastKind) => {
  const j = ROTATION.indexOf(lastKind), k = j >= 0 ? (j + 1) % ROTATION.length : ROTATION.indexOf(kindFor(epN));
  return ROTATION.map((_, i) => ROTATION[(k + i) % ROTATION.length]);
};
export function kindOfCaption(t) {
  t = String(t || '');
  if (/سوّيت موقع/.test(t)) return 'site';
  if (/أنماط/.test(t)) return 'styles';
  if (/اسكتش|ترند «|فيديو الترند/.test(t)) return 'video';
  return '';
}
export function parseKind(raw) {
  const m = /^\s*(site|video|styles?)\s*(?:[:=]\s*([a-z0-9_-]{2,30}))?\s*$/i.exec(String(raw || ''));
  return m ? { kind: /^style/i.test(m[1]) ? 'styles' : m[1].toLowerCase(), arg: (m[2] || '').toLowerCase() } : null;
}
const escH = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const log = (...a) => console.log('[social-bot]', ...a);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => performance.now() / 1000;

// ───────── الفكرة ─────────
export function pickIdea(ideas, idxRaw, runNumber, dayNumber) {
  let idx = Number.parseInt(String(idxRaw ?? '').trim(), 10);
  if (!Number.isFinite(idx)) idx = Number.parseInt(String(runNumber ?? ''), 10);
  if (!Number.isFinite(idx)) idx = dayNumber;
  const n = ideas.length;
  return { idx: ((idx % n) + n) % n, idea: ideas[((idx % n) + n) % n] };
}

// ───────── النصّ المنشور ─────────
export function secWord(n) {
  if (n === 1) return 'ثانية وحدة';
  if (n === 2) return 'ثانيتين';
  if (n >= 3 && n <= 10) return n + ' ثواني';
  return n + ' ثانية';
}

// رقم الحلقة المطلق → حلقة الموسم (30 حلقة لكلّ موسم).
export function epLabel(n, series = SERIES) {
  const season = Math.floor((n - 1) / SEASON_LEN) + 1, ep = ((n - 1) % SEASON_LEN) + 1;
  const sx = season > 1 ? ' · الموسم ' + season : '';
  return { n, season, ep, short: 'الحلقة ' + ep + sx, full: 'الحلقة ' + ep + ' من ' + series + sx };
}

// المدّة بالكلام: «دقيقة و24 ثانية» (الفيديو يأخذ أكثر من دقيقة).
export function durWord(n) {
  n = Math.max(1, Math.round(n));
  if (n < 60) return secWord(n);
  const mi = Math.floor(n / 60), se = n % 60;
  const mw = mi === 1 ? 'دقيقة' : mi === 2 ? 'دقيقتين' : mi + ' دقايق';
  return se ? mw + ' و' + secWord(se) : mw;
}
const clock = (n) => { n = Math.max(0, Math.round(n)); return n < 60 ? String(n) : Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0'); };

// X وThreads (v-social-xthreads): X حدّه ٢٨٠ «موزونة» (العربيّ ١ والإيموجي ٢) وUpload-Post يحذف الروابط منه — فالنصّ بلا رابط
// ولا اسم نطاق؛ وThreads حدّه ٥٠٠ (الإيموجي بطول بايتاته) ووسم واحد فقط يصير موضوعًا. السطور تُقصّ من الآخر حتّى تدخل الحدّ.
export const xLen = (s) => { let n = 0; for (const ch of String(s)) { const c = ch.codePointAt(0); n += (c <= 0x10FF || (c >= 0x2000 && c <= 0x200D) || (c >= 0x2010 && c <= 0x201F) || (c >= 0x2032 && c <= 0x2037)) ? 1 : 2; } return n; };
export const threadsLen = (s) => { let n = 0; for (const ch of String(s)) n += ch.codePointAt(0) > 0xFFFF ? 4 : 1; return n; };
// الأساس (رقم الحلقة والعنوان) والدعوة والوسوم تبقى؛ السطور الإضافيّة ثمّ «الحلقة الجاية» تُشال أوّلًا حتّى يدخل الحدّ.
function fitLines(core, extras, cta, next, tail, max, len) {
  const ex = [...extras], nx = [...next];
  const join = () => [...core, ...ex, cta, ...nx, tail].filter(Boolean).join('\n');
  while (len(join()) > max && (ex.length || nx.length)) { if (ex.length) ex.pop(); else nx.pop(); }
  let t = join();
  while (len(t) > max) t = Array.from(t).slice(0, -2).join('');
  return t;
}
export function shortCaptions(top, cta, next, tags) {
  const lines = top.filter(Boolean), core = lines.slice(0, 2), extras = lines.slice(2);
  const x = fitLines(core, extras, cta + ' 👈 الرابط في البايو', next, tags.slice(0, 3).join(' '), 280, xLen);
  const threads = fitLines(core, extras, cta + ' 👈 https://' + SITE + '/?ref=threads', next, tags[0] || '', 500, threadsLen);
  return { x, threads };
}

export function buildCaption(idea, secs, epN) {
  const base = ['#ذكاء_اصطناعي', '#تصميم_مواقع', '#برمجة', '#مواقع', '#مشاريع', '#OMAi', '#AI', '#الامارات', '#السعودية', '#الكويت', '#قطر', '#عمان', '#البحرين'];
  const ep = epN ? epLabel(epN) : null;
  const tags = [...new Set([...(idea.tags || []), ...base])].slice(0, 20).join(' ');
  const head = 'سوّيت موقع ' + idea.name + ' كامل في ' + secWord(secs) + ' بس 🤯';
  const top = [ep ? '🎬 ' + ep.full : '', head, idea.label ? '🔥 الفكرة من ترند اليوم: ' + idea.label : '', 'كتبت جملة وحدة… وOM Ai سوّى الباقي ✨'].filter(Boolean);
  const next = ep ? ['تابعنا… ' + epLabel(epN + 1).short + ' بعد يومين 👀'] : [];
  const ig = [...top, '', 'جرّب تسوّي موقعك ببلاش 👈 الرابط في البايو 🔗', ...next, '', tags].join('\n');
  const fb = [...top, '', 'جرّب تسوّي موقعك ببلاش 👈 https://' + SITE + '/?ref=fb', ...next, '', tags].join('\n');
  return { ig, fb, head, ...shortCaptions(top, 'جرّب تسوّي موقعك ببلاش', next, ['#OMAi', '#ذكاء_اصطناعي', '#تصميم_مواقع']) };
}

const GULF_TAGS = ['#OMAi', '#AI', '#ذكاء_اصطناعي', '#الامارات', '#السعودية', '#الكويت', '#قطر', '#عمان', '#البحرين'];
function captionOf(epN, kind, top, cta, tags) {
  const ep = epN ? epLabel(epN, KINDS[kind].series) : null;
  const t = [...new Set(tags)].slice(0, 20).join(' ');
  const head = top[0];
  const lines = [ep ? '🎬 ' + ep.full : '', ...top].filter(Boolean);
  const next = ep ? ['تابعنا… ' + epLabel(epN + 1).short + ' بعد يومين 👀'] : [];
  return { ig: [...lines, '', cta + ' 👈 الرابط في البايو 🔗', ...next, '', t].join('\n'), fb: [...lines, '', cta + ' 👈 https://' + SITE + '/?ref=fb', ...next, '', t].join('\n'), head,
    ...shortCaptions(lines, cta, next, ['#OMAi', ...[...new Set(tags)].filter((x) => x !== '#OMAi')]) };
}

export function buildVideoCaption(vi, secs, epN) {
  const sketch = vi.key === SKETCH_KEY;
  const head = sketch ? 'كتبت سطر واحد… وطلع اسكتش بيكسار خليجي بالصوت في ' + durWord(secs) + ' 🤯' : 'ترند «' + vi.cardTitle + '» جاهز في ' + durWord(secs) + ' 🤯';
  return captionOf(epN, 'video', [head, vi.label ? '🔥 الفكرة من ترند اليوم: ' + vi.label : '', sketch ? '🎭 الموقف: ' + vi.scene : '', 'اخترت الترند من صانع الفيديو في OM Ai… والباقي عليه ✨'],
    'سوّ فيديو الترند حقّك ببلاش', ['#ترند', '#فيديو_ذكاء_اصطناعي', ...(sketch ? ['#بيكسار', '#اسكتش'] : []), ...(vi.tags || []), ...GULF_TAGS]);
}

export function buildStylesCaption(plan, res, epN) {
  const n = res.items.length;
  const head = 'صورة وحدة… صارت ' + n + ' أنماط، كل نمط في ' + secWord(res.avg) + ' 🤯';
  return captionOf(epN, 'styles', [head, '🎨 ' + res.items.map((x) => x.label).join(' · '), 'ارفع صورتك واختر النمط… وOM Ai يسوّي الباقي ✨', '📸 الشخص في الفيديو مولّد بالذكاء الاصطناعي'],
    'حوّل صورتك ببلاش', ['#أنماط_الصور', '#جيبلي', '#تعديل_الصور', '#صور_ذكاء_اصطناعي', ...GULF_TAGS]);
}

// ───────── السلسلة: رقم الحلقة والموعد من سجلّ النشر ─────────
export function seriesFromHistory(items) {
  let last = 0, lastAt = 0, lastKind = ''; const names = [];
  for (const it of items || []) {
    const mm = EP_RE.exec(String((it && it.external_id) || ''));
    if (!mm || it.success === false) continue;
    const text = String(it.post_title || it.post_caption || ''), n = Number(mm[1]);
    const kind = mm[2] || kindOfCaption(text);
    if (n > last || (n === last && !lastKind)) lastKind = kind;
    last = Math.max(last, n);
    lastAt = Math.max(lastAt, Date.parse(it.upload_timestamp || '') || 0);
    const nm = /سوّيت موقع (.+?) كامل في/.exec(text);
    if (nm && !names.includes(nm[1])) names.push(nm[1]);
  }
  return { last, lastAt, lastKind, names };
}

export const dueNow = (lastAt, nowMs, everyH = EVERY_H) => !lastAt || nowMs - lastAt >= everyH * 36e5;

async function seriesState() {
  const items = [];
  for (let page = 1; page <= 3; page++) {
    const r = await upFetch('/uploadposts/history?limit=100&status=success&page=' + page + '&profile_username=' + encodeURIComponent(UP_USER));
    if (!r.ok) throw new Error('upload history ' + r.status + ' ' + JSON.stringify(r.j).slice(0, 160));
    const h = (r.j && r.j.history) || [];
    items.push(...h);
    if (h.length < 100) break;
  }
  return seriesFromHistory(items);
}

// ───────── فكرة من الترند ─────────
const unXml = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();

export function parseTrendsRss(xml) {
  const out = [];
  for (const it of String(xml || '').split('<item>').slice(1)) {
    const title = unXml((/<title>([\s\S]*?)<\/title>/.exec(it) || [])[1]);
    if (!title || !/^[\p{Script=Arabic}\p{Script=Latin}\p{N}\s\-–'’.&:،,!؟?()]+$/u.test(title)) continue; // عربيّ/إنجليزيّ فقط
    const traffic = parseInt(String((/<ht:approx_traffic>([^<]*)/.exec(it) || [])[1] || '').replace(/\D/g, ''), 10) || 0;
    const news = unXml((/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/.exec(it) || [])[1]).slice(0, 110);
    out.push({ title, traffic, news });
  }
  return out;
}

async function fetchTrends() {
  const seen = new Set(), all = [];
  for (const g of TREND_GEOS) {
    try {
      const r = await fetch('https://trends.google.com/trending/rss?geo=' + g, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) { log('trends ' + g + ' → ' + r.status); continue; }
      for (const t of parseTrendsRss(await r.text())) { const k = t.title.toLowerCase(); if (!seen.has(k)) { seen.add(k); all.push(t); } }
    } catch (e) { log('trends ' + g + ' failed: ' + (e && e.message)); }
  }
  return all.sort((a, b) => b.traffic - a.traffic).slice(0, 25);
}

// يُرفض ما يمسّ السياسة والحروب والدين والأشخاص الحقيقيّين والبنوك… حتى لو مرّ من النموذج.
const BAD_TOPIC = /سياس|حرب|حروب|جيش|عسكر|صاروخ|هجوم|قصف|وفا[ةه]|توفي|مقتل|قتل|حادث|جريم|سجن|إيران|ايران|إسرائيل|اسرائيل|غزة|هرمز|بنك|مصرف|قمار|رهان|خمر|كحول|حزب|انتخاب|شيخ|أمير|ملك |رئيس/;

// بوّابة جودة الموقع قبل النشر باسم البراند: لا موقع هزيل، ولا ذكر لمحرّم (نموذج ضعيف كتب «جعة ليمون» مرّة).
const HARAM_RE = /(?<!\p{L})(?:[وفبل])?(?:ال)?(جعة|بيرة|نبيذ|خمر|خمور|كحولية|فودكا|ويسكي|خنزير|كازينو)(?!\p{L})|\b(beer|wine|vodka|whiske?y|pork|bacon|casino)\b/iu;
export function siteText(code) {
  return String(code || '').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/data:[^"')\s]+/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ');
}
export function siteProblem(code, min = 5000) {
  const n = String(code || '').length;
  if (n < min) return 'generated site too small (' + n + ' < ' + min + ' chars)';
  const bad = HARAM_RE.exec(siteText(code));
  return bad ? 'generated site mentions «' + (bad[1] || bad[2]) + '»' : '';
}

// تشخيص الموقع الهزيل: ما الذي أجاب فعلًا؟ ملخّص بثّ المحادثة (data: {…}) بلا نصّ الردّ نفسه —
// عدد الحروف، وأنواع الأحداث، وسطور الحالة/الخطأ/الطبقة التي يرسلها الخادم.
export function sseSummary(text) {
  const s = { chars: 0, events: {}, notes: [] };
  const t = String(text || '').trim();
  const note = (k, v) => { if (s.notes.length < 8) s.notes.push(k + ': ' + String(typeof v === 'object' ? JSON.stringify(v) : v).slice(0, 160)); };
  if (t[0] === '{') { // ردّ JSON عاديّ (مسار المزوّد القديم)
    try { const j = JSON.parse(t); Object.keys(j).forEach((k) => { s.events[k] = 1; }); s.chars = String(j.reply || j.text || j.content || '').length; if (j.error) note('error', j.error); } catch (e) { note('parse', 'bad json'); }
    return s;
  }
  for (const line of t.split('\n')) {
    const m = /^data:\s*(\{.*\})\s*$/.exec(line.trim()); if (!m) continue;
    let ev; try { ev = JSON.parse(m[1]); } catch (e) { continue; }
    for (const k of Object.keys(ev)) s.events[k] = (s.events[k] || 0) + 1;
    if (typeof ev.delta === 'string') s.chars += ev.delta.length;
    for (const k of ['status', 'error', 'tier', 'tierDiag', 'modelLabel', 'limit']) if (ev[k] !== undefined && ev[k] !== null && ev[k] !== '') note(k, ev[k]);
  }
  return s;
}
// سطر واحد للملخّص: المسار (tools = مسار الخادم، fallback = المسار القديم بعد فشله) والمزوّد وطول الردّ،
// ونداءات /api/ai بحالتها، وسطور «… يكتب…» التي ظهرت للمستخدم.
export function diagLine(d) {
  if (!d) return 'no diag';
  const t = d.turn || {};
  const parts = ['path=' + (t.path || '?') + ' provider=' + (t.provider || '?') + ' reply=' + (t.replyLen ?? '?')];
  if (t.toolsErr) parts.push('toolsErr=' + String(t.toolsErr).slice(0, 100));
  if (t.err) parts.push('err=' + String(t.err).slice(0, 100));
  const calls = (d.calls || []).filter((c) => c.action !== 'models');
  if (calls.length) parts.push('calls ' + calls.map((c) => (c.action || '?') + ' ' + c.status + (c.chars !== undefined ? ' ' + c.chars + 'ch' : '') + (c.notes && c.notes.length ? ' [' + c.notes.join(' | ') + ']' : '')).join(', '));
  if (d.statuses && d.statuses.length) parts.push('status: ' + d.statuses.join(' | '));
  return parts.join(' · ').slice(0, 900);
}

// الأسعار بالدرهم: المشاريع إماراتيّة، والنموذج كتب «ر.س» لمّا ما انقال له (تجربة ١٦ أكتوبر).
export function withAED(prompt) {
  const p = String(prompt || '').trim().replace(/[.،!؟\s]+$/u, '');
  return /درهم|دراهم|AED|د\.إ/i.test(p) ? p : p + ' والأسعار بالدرهم';
}

export function validTrendIdea(j) {
  if (!j || typeof j !== 'object') return null;
  const name = String(j.name || '').trim(), prompt = String(j.prompt || '').trim(), label = String(j.label || '').trim();
  if (!name || name.length > 28 || !/«[^»]{2,18}»/.test(name)) return null;
  if (!/^سو/.test(prompt) || prompt.length < 35 || prompt.length > 100 || !prompt.includes(name.replace(/^.*«/, '').replace(/».*$/, ''))) return null;
  if (!label || label.length > 30) return null;
  const tags = (Array.isArray(j.tags) ? j.tags : []).map((t) => String(t).trim()).filter((t) => /^#[^\s#]{2,30}$/.test(t)).slice(0, 4);
  if (BAD_TOPIC.test([name, prompt, label, j.trend || '', ...tags].join(' '))) return null;
  return { name, prompt, tags, label, trend: String(j.trend || '').slice(0, 80), src: 'trend' };
}

export function trendAsk(trends, recent, today) {
  const list = trends.map((t, i) => (i + 1) + '. ' + t.title + (t.traffic ? ' | ' + t.traffic + '+ بحث' : '') + (t.news ? ' | ' + t.news : '')).join('\n');
  return [
    'أنت مخطّط محتوى لحساب OM Ai (منصّة تبني مواقع كاملة بالذكاء الاصطناعي من جملة وحدة). عندنا سلسلة ريلز «' + SERIES + '»، وحلقة اليوم: نبني موقع لمشروع تجاري خليجي من جملة وحدة.',
    'اليوم ' + today + '. هذي ترندات البحث الحين في الإمارات والسعودية والكويت وقطر (العنوان | البحث | خبر):',
    list || '(ما في ترندات اليوم)',
    '',
    'اختر ترند واحد يُلهم فكرة مشروع تجاري محلّي لطيف ومناسب للعائلة (مقهى، مطعم، متجر، خدمة، نادي، فعالية…). إذا ما في ترند مناسب، اختر مناسبة أو موسم خليجي قريب من تاريخ اليوم.',
    'ممنوع منعًا باتًا: السياسة والحروب والجيش والأخبار العاجلة والوفيات والحوادث والجرائم والدين والبنوك والقمار والكحول، والشخصيات الحقيقية (حكّام، شيوخ، مشاهير، لاعبين)، وأيّ شي حزين أو مثير للجدل.',
    'الاسم التجاري من تأليفك وقصير، وممنوع يحتوي اسم علامة تجارية أو نادي أو شخص حقيقي.',
    recent && recent.length ? 'لا تكرّر هذي الأفكار المنشورة: ' + recent.join('، ') : '',
    'رجّع JSON فقط بلا أيّ كلام ثاني، بهالشكل:',
    '{"trend":"عنوان الترند كما هو","label":"وصف قصير للترند بالعربي من 2 إلى 4 كلمات","name":"نوع المشروع «الاسم»","prompt":"سوّ لي موقع …","tags":["#وسم","#وسم","#وسم"]}',
    'الشروط: name أقصاه 24 حرف مثل: مقهى «ركن الديربي». prompt بلهجة خليجية يبدأ بـ «سوّ لي موقع»، طوله من 50 إلى 95 حرف، فيه الاسم نفسه بين «» ومحتوى الموقع (منيو أو خدمات أو أسعار أو حجز أو واتساب). tags ثلاث وسوم عربية بلا مسافات للمشروع والترند (بدون أسماء أشخاص).',
  ].filter(Boolean).join('\n');
}

async function askAI(token, text) {
  const r = await postJSON(BASE + '/api/ai?action=gemini', { token, contents: [{ role: 'user', parts: [{ text }] }] });
  const parts = (r.j && r.j.candidates && r.j.candidates[0] && r.j.candidates[0].content && r.j.candidates[0].content.parts) || [];
  if (!r.ok) throw new Error('ai ' + r.status + ' ' + String((r.j && r.j.error) || '').slice(0, 120));
  return parts.map((p) => p.text || '').join('');
}

export async function trendIdea(token, recent) {
  const trends = await fetchTrends();
  log('trends: ' + trends.length + (trends.length ? ' · ' + trends.slice(0, 8).map((t) => t.title).join(' | ') : ''));
  const today = new Intl.DateTimeFormat('ar-AE', { dateStyle: 'full', timeZone: 'Asia/Dubai' }).format(new Date());
  const ask = trendAsk(trends, recent, today);
  for (let i = 0; i < 2; i++) {
    try {
      const txt = await askAI(token, ask);
      const mm = /\{[\s\S]*\}/.exec(txt);
      const idea = validTrendIdea(mm ? JSON.parse(mm[0]) : null);
      if (idea && !recent.includes(idea.name)) return idea;
      log('trend idea rejected: ' + String(txt).replace(/\s+/g, ' ').slice(0, 200));
    } catch (e) { log('trend idea failed: ' + (e && e.message)); }
  }
  return null;
}

// ───────── 🎬 فكرة فيديو الترند: موقف كوميديّ خليجيّ لاسكتش بيكسار من ترند اليوم ─────────
const SKETCH_KEY = 'pixarsketch';
const VIDEO_SCENES = [
  { label: 'حرّ الصيف', title: 'المكيّف خرب', scene: 'أبو سعيد يحاول يصلّح المكيّف بنفسه في عزّ الحرّ، وأم سعيد والعيال يضحكون عليه من ورا الباب', tags: ['#الصيف', '#مكيف'] },
  { label: 'الواجبات المدرسية', title: 'الواجب بالذكاء', scene: 'حمدان يقنع أبوه إنه حلّ الواجب بنفسه، والأب يكتشف إن الجواب مكتوب فيه «بصفتي ذكاء اصطناعي»', tags: ['#المدرسة', '#واجبات'] },
  { label: 'سيلفي العائلة', title: 'سيلفي اليدّة', scene: 'اليدّة تتعلّم تصوّر سيلفي لأوّل مرة، وكل الصور تطلع لإصبعها، والعيال يحاولون يعلّمونها', tags: ['#سيلفي', '#العائلة'] },
  { label: 'الطلبات أونلاين', title: 'الدليفري الغلط', scene: 'أبو خالد يطلب عشا دليفري ويستنّى ساعة، وبعدين يكتشف إن المطعم في البيت اللي جنبه', tags: ['#دليفري', '#عشا'] },
  { label: 'نظارة الوالدة', title: 'وين النظارة؟', scene: 'أم راشد تدوّر نظارتها في كل البيت والكل يدوّر معها، والنظارة طول الوقت فوق راسها', tags: ['#البيت', '#ضحك'] },
];

export function validVideoIdea(j) {
  if (!j || typeof j !== 'object') return null;
  const scene = String(j.scene || '').trim(), title = String(j.title || '').trim(), label = String(j.label || '').trim();
  if (scene.length < 30 || scene.length > 150 || !/\p{Script=Arabic}/u.test(scene)) return null;
  if (!title || title.length > 24 || !label || label.length > 30) return null;
  const tags = (Array.isArray(j.tags) ? j.tags : []).map((t) => String(t).trim()).filter((t) => /^#[^\s#]{2,30}$/.test(t)).slice(0, 3);
  if (BAD_TOPIC.test([scene, title, label, j.trend || '', ...tags].join(' '))) return null;
  return { scene, title, label, tags, trend: String(j.trend || '').slice(0, 80), src: 'trend' };
}

export function videoAsk(trends, today) {
  const list = trends.map((t, i) => (i + 1) + '. ' + t.title + (t.news ? ' | ' + t.news : '')).join('\n');
  return [
    'أنت كاتب كوميديا خليجية لحساب OM Ai. نسوّي اسكتش قصير بأسلوب بيكسار ثلاثي الأبعاد (عائلة خليجية، حوار بلهجة خليجية) من ترند اليوم.',
    'اليوم ' + today + '. هذي ترندات البحث الحين في الإمارات والسعودية والكويت وقطر (العنوان | خبر):',
    list || '(ما في ترندات اليوم)',
    '',
    'اختر ترند واحد يصلح لموقف عائلي يومي مضحك ولطيف (طقس، مدرسة، أكل، سفر، مباراة، تقنية، مناسبة…). إذا ما في مناسب، خذ موقف من الحياة اليومية في الخليج قريب من تاريخ اليوم.',
    'ممنوع منعًا باتًا: السياسة والحروب والأخبار العاجلة والوفيات والحوادث والجرائم والدين والبنوك والقمار، والشخصيات الحقيقية (حكّام، شيوخ، مشاهير، لاعبين)، والسخرية من أيّ شعب أو فئة.',
    'رجّع JSON فقط بلا أيّ كلام ثاني، بهالشكل:',
    '{"trend":"عنوان الترند كما هو","label":"وصف قصير للترند من 2 إلى 4 كلمات","title":"عنوان الموقف من 2 إلى 3 كلمات","scene":"الموقف بسطر واحد","tags":["#وسم","#وسم"]}',
    'الشروط: scene بلهجة خليجية من 60 إلى 130 حرف: شخصيتين أو ثلاث بأسماء خليجية خيالية (أبو سعيد، أم راشد، حمدان…) وموقف واضح فيه مفارقة مضحكة. tags وسمين عربية بلا مسافات.',
  ].join('\n');
}

export async function videoIdea(token, epN) {
  try {
    const trends = await fetchTrends();
    log('trends: ' + trends.length);
    const today = new Intl.DateTimeFormat('ar-AE', { dateStyle: 'full', timeZone: 'Asia/Dubai' }).format(new Date());
    for (let i = 0; i < 2; i++) {
      try {
        const txt = await askAI(token, videoAsk(trends, today));
        const mm = /\{[\s\S]*\}/.exec(txt);
        const idea = validVideoIdea(mm ? JSON.parse(mm[0]) : null);
        if (idea) return idea;
        log('video idea rejected: ' + String(txt).replace(/\s+/g, ' ').slice(0, 200));
      } catch (e) { log('video idea failed: ' + (e && e.message)); }
    }
  } catch (e) { log('trends failed: ' + (e && e.message)); }
  return { ...VIDEO_SCENES[((epN || 1) - 1) % VIDEO_SCENES.length], src: 'list' };
}

// ───────── 🖼️ أنماط الصور: صورة شخص مولّدة (لا شخص حقيقيّ) + خمسة أنماط من التطبيق ─────────
const PHOTO_SUBJECTS = [
  { key: 'man', ar: 'شاب إماراتي', prompt: 'Photorealistic vertical 3:4 smartphone portrait photo of a smiling young Emirati man in his late twenties wearing a crisp white kandura and white ghutra with black agal, standing outdoors in a modern Dubai street at golden hour, natural skin texture, sharp face, upper body, no text, no watermark' },
  { key: 'falcon', ar: 'صقّار', prompt: 'Photorealistic vertical 3:4 portrait photo of a proud young Emirati man in a beige kandura and white ghutra holding a falcon on a leather glove, desert dunes at sunset behind him, natural skin texture, sharp face, upper body, no text, no watermark' },
  { key: 'grandpa', ar: 'الوالد', prompt: 'Photorealistic vertical 3:4 portrait photo of a cheerful Emirati grandfather in his sixties with a neat white beard, white kandura and ghutra, sitting in a traditional majlis with an Arabic coffee dallah, warm light, sharp face, upper body, no text, no watermark' },
  { key: 'woman', ar: 'شابة إماراتية', prompt: 'Photorealistic vertical 3:4 portrait photo of a smiling young Emirati woman wearing an elegant black abaya and a modest black shayla hijab, in a bright modern cafe, natural skin texture, sharp face, upper body, no text, no watermark' },
];
const STYLE_AR = { ghibli: 'جيبلي', disney: 'بيكسار', lego: 'ليغو', anime: 'أنمي', figurine: 'فيغر أكشن', claymation: 'صلصال', chibi: 'تشيبي', royal: 'لوحة ملكية', cyberpunk: 'سايبربنك', statue: 'تمثال رخام', gulf: 'تراثي إماراتي', superhero: 'بطل خارق', oil: 'لوحة زيتية', comic: 'كوميكس', watercolor: 'ألوان مائية' };
const STYLE_POOL = Object.keys(STYLE_AR);
export const STYLES_PER_EP = 5;

export function stylesPlan(epN, arg) {
  const k = Math.max(0, (Number(epN) || 1) - 1);
  const subject = PHOTO_SUBJECTS.find((x) => x.key === arg) || PHOTO_SUBJECTS[k % PHOTO_SUBJECTS.length];
  const start = (k * STYLES_PER_EP) % STYLE_POOL.length;
  const styles = Array.from({ length: STYLES_PER_EP }, (_, i) => STYLE_POOL[(start + i) % STYLE_POOL.length]);
  return { subject, styles: styles.map((key) => ({ key, label: STYLE_AR[key] })) };
}

const b64Ext = (mime) => (/png/i.test(mime || '') ? '.png' : /webp/i.test(mime || '') ? '.webp' : '.jpg');

// صورة الشخص من مولّد الصور في التطبيق نفسه (حساب البوت VIP: بلا خصم).
async function makePhoto(acct, subject, dir) {
  for (let i = 0; i < 2; i++) {
    const r = await postJSON(BASE + '/api/maha-image', { prompt: subject.prompt, userText: subject.prompt, token: acct.token });
    if (r.j && r.j.imageBase64) {
      const file = path.join(dir, 'source' + b64Ext(r.j.mimeType));
      fs.writeFileSync(file, Buffer.from(r.j.imageBase64, 'base64'));
      log('source photo (' + subject.key + ') ' + (fs.statSync(file).size / 1e3).toFixed(0) + 'KB');
      return { file, b64: r.j.imageBase64, mime: r.j.mimeType || 'image/png' };
    }
    log('source photo failed ' + r.status + ' ' + JSON.stringify(r.j).slice(0, 160));
  }
  throw new Error('source photo failed');
}

export async function makeStyles(acct, plan, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const src = await makePhoto(acct, plan.subject, dir);
  const items = [];
  const one = async (st) => {
    for (let a = 0; a < 2; a++) {
      const t0 = Date.now();
      const r = await postJSON(BASE + '/api/portrait-style', { imageBase64: src.b64, mimeType: src.mime, style: st.key, token: acct.token });
      if (r.j && r.j.imageBase64) {
        const file = path.join(dir, st.key + b64Ext(r.j.mimeType));
        fs.writeFileSync(file, Buffer.from(r.j.imageBase64, 'base64'));
        return { ...st, file, secs: (Date.now() - t0) / 1000 };
      }
      log('style ' + st.key + ' failed ' + r.status + ' ' + JSON.stringify(r.j).slice(0, 140));
    }
    return null;
  };
  // اثنين اثنين: أسرع، وكلّ نمط يُحسب زمنه وحده (الزمن المكتوب = متوسّط النمط الواحد الفعليّ).
  for (let i = 0; i < plan.styles.length; i += 2) {
    const got = await Promise.all(plan.styles.slice(i, i + 2).map(one));
    for (const g of got) if (g) items.push(g);
  }
  if (items.length < 3) throw new Error('styles: only ' + items.length + ' of ' + plan.styles.length + ' worked — not publishing');
  const avg = Math.max(1, Math.round(items.reduce((a, x) => a + x.secs, 0) / items.length));
  log('styles ' + items.map((x) => x.key + ' ' + x.secs.toFixed(0) + 's').join(' · ') + ' · avg ' + avg + 's');
  return { src: src.file, items, avg };
}

// ───────── المنصّات الموصولة ─────────
// مفتاح X في social_accounts غير موثَّق (x أو twitter) — نقبل الاثنين، والمحتاج إعادة ربط لا يُعدّ موصولًا.
export function connectedPlatforms(sa, list = AUTO_PLATFORMS) {
  const acc = (p) => (sa && (sa[p] || (p === 'x' ? sa.twitter : null))) || null;
  return list.filter((p) => { const a = acc(p); return !!a && typeof a === 'object' && !a.reauth_required; });
}
export async function resolvePlatforms() {
  if (PLATFORMS_RAW !== 'auto') return PLATFORMS_RAW.split(',').map((s) => s.trim()).filter(Boolean);
  const fallback = ['instagram', 'facebook'];
  if (!UP_KEY) return fallback;
  const r = await upFetch('/uploadposts/users').catch(() => ({ ok: false, j: {} }));
  const profs = (r.j && (r.j.profiles || (r.j.profile ? [r.j.profile] : []))) || [];
  const prof = profs.find((p) => p && p.username === UP_USER) || null;
  const sa = (prof && prof.social_accounts) || {};
  const on = connectedPlatforms(sa);
  log('connected: ' + (on.join(',') || 'none') + ' · accounts keys: ' + (Object.keys(sa).join(',') || 'none') + (r.ok ? '' : ' (users ' + r.status + ')'));
  return on.length ? on : fallback;
}

// ───────── حساب البوت ─────────
async function postJSON(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, j };
}

// تعليقات GitHub تظهر في ملخّص التشغيل (تُقرأ بلا صلاحية سجلّات).
export const gh = (level, msg) => { if (process.env.GITHUB_ACTIONS) console.log('::' + level + ' title=social-bot::' + String(msg).replace(/\r?\n/g, ' ')); };

async function tierOf(token) {
  const r = await postJSON(BASE + '/api/points', { action: 'balance', token }).catch(() => ({ j: {} }));
  return (r.j && r.j.tier) || (r.j && r.j.vip ? 'vip' : 'free');
}

// حساب البوت ثابت: كلمة سرّه مشتقّة من سرّ موجود في المستودع (لا سرّ جديد).
// صلاحية VIP: تلقائيًّا بـ MONITOR_KEY إن وُجد، وإلّا يضيفه المالك مرّة من لوحة التحكّم ← ⭐ صلاحيات VIP.
export async function botAccount() {
  const seeds = [UP_KEY, MONITOR_KEY].filter(Boolean);
  const pwOf = (seed) => 'Sb!' + createHash('sha256').update('omai-social|' + BOT_USER + '|' + seed).digest('hex').slice(0, 24);
  const diag = ['monitorKey=' + (MONITOR_KEY ? 'yes' : 'no')];
  let token = '';
  for (const seed of seeds) {
    const r = await postJSON(BASE + '/api/account?action=auth', { action: 'login', username: BOT_USER, password: pwOf(seed), lang: 'ar' });
    if (r.j.token) { token = r.j.token; diag.push('login=ok'); break; }
  }
  if (!token && seeds.length) {
    const r = await postJSON(BASE + '/api/account?action=auth', { action: 'signup', username: BOT_USER, password: pwOf(seeds[0]), lang: 'ar' });
    if (r.j.token) { token = r.j.token; diag.push('signup=ok'); } else diag.push('signup=' + r.status);
  }
  if (token) {
    if (MONITOR_KEY) {
      const v = await postJSON(BASE + '/api/account?action=vip&key=' + encodeURIComponent(MONITOR_KEY), { id: BOT_USER });
      diag.push('vipAdd=' + v.status);
      if (v.ok) await sleep(1500);
    }
    const tier = await tierOf(token);
    diag.push('tier=' + tier);
    log('bot account ' + BOT_USER + ' · ' + diag.join(' '));
    gh('notice', 'account ' + BOT_USER + ' · ' + diag.join(' '));
    return { user: BOT_USER, token, vip: tier === 'vip' || tier === 'owner', tier };
  }
  log('bot account unavailable (' + diag.join(' ') + ') — temporary free account');
  gh('warning', 'bot account unavailable · ' + diag.join(' '));
  const u = 'zzcheck' + randomBytes(3).toString('hex');
  const r = await postJSON(BASE + '/api/account?action=auth', { action: 'signup', username: u, password: 'Pp1!' + randomBytes(8).toString('hex'), lang: 'ar' });
  if (!r.j.token) throw new Error('signup failed: ' + r.status);
  return { user: u, token: r.j.token, vip: false, tier: 'free' };
}

// ───────── التصوير ─────────
// صفحة التطبيق الحقيقيّ بحساب البوت (جوال)، بلا نوافذ الترحيب.
async function appPage(browser, acct) {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, locale: 'ar', userAgent: IPHONE_UA });
  await ctx.addInitScript(([t, u]) => {
    try {
      sessionStorage.setItem('omran_sess_v1', '1');
      localStorage.setItem('aiapp_intro', '0'); localStorage.setItem('aiapp_privacy_ack', '1'); localStorage.setItem('aiapp_lang', 'ar');
      localStorage.setItem('aiapp_auth_token', t); localStorage.setItem('aiapp_username', u);
    } catch (e) { /* لا شيء */ }
  }, [acct.token, acct.user]);
  const page = await ctx.newPage();
  await page.goto(BASE + '/?ref=bot', { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('#prompt', { timeout: 30000 });
  await page.waitForTimeout(3500);
  await page.evaluate(() => {
    ['omranIntro', 'privacyConsent'].forEach((id) => { const e = document.getElementById(id); if (e) e.remove(); });
    document.documentElement.classList.remove('oiOn');
    // وضوح الطلب في الفيديو فقط: خطّ أكبر قليلًا في خانة الكتابة.
    const st = document.createElement('style'); st.textContent = '#prompt{font-size:17px!important;line-height:1.45!important}'; document.head.appendChild(st);
  });
  await page.waitForTimeout(600);
  return { ctx, page };
}

// تسجيل الشاشة إطارًا إطارًا (CDP)؛ كلّ إطار يحمل زمنه ومقطعه (A قبل الإرسال، B بعده).
async function startRec(ctx, page, dir) {
  const frames = []; let seg = 'A';
  const cdp = await ctx.newCDPSession(page);
  cdp.on('Page.screencastFrame', (f) => {
    const fn = path.join(dir, String(frames.length).padStart(5, '0') + '.jpg');
    fs.writeFileSync(fn, Buffer.from(f.data, 'base64'));
    frames.push({ t: now(), seg, fn });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  return { frames, seg: (x) => { seg = x; }, stop: () => cdp.send('Page.stopScreencast').catch(() => {}) };
}

async function capture(browser, acct, idea, dir) {
  const { ctx, page } = await appPage(browser, acct);
  const rec = await startRec(ctx, page, dir);
  const frames = rec.frames;
  const m = { a0: now() };
  await page.waitForTimeout(900);
  await page.locator('#prompt').tap().catch(() => page.locator('#prompt').click());
  await page.waitForTimeout(350);
  m.type0 = now();
  const DELAY = Math.max(28, Math.min(55, Math.round(3600 / idea.prompt.length)));
  await page.locator('#prompt').pressSequentially(idea.prompt, { delay: DELAY });
  m.type1 = now();
  m.keyDelay = DELAY / 1000;
  await page.waitForTimeout(500);
  const sb = await page.locator('#btnSend').boundingBox().catch(() => null);
  m.tap = sb ? { x: (sb.x + sb.width / 2) * DPR, y: (sb.y + sb.height / 2) * DPR } : null;
  // تشخيص: نداءات /api/ai وحالتها وملخّص بثّها، وسطور الحالة الظاهرة — لمعرفة من أجاب حين يطلع الموقع هزيلًا.
  const calls = [], statuses = new Set();
  page.on('response', (r) => {
    const u = r.url(); if (!/\/api\/ai\b/.test(u)) return;
    const c = { action: (/[?&]action=([\w-]+)/.exec(u) || [])[1] || '', status: r.status() };
    calls.push(c);
    c.p = r.text().then((t) => Object.assign(c, sseSummary(t))).catch((e) => { c.bodyErr = String((e && e.message) || e).slice(0, 80); });
  });
  m.send = now();
  await page.locator('#btnSend').tap().catch(() => page.locator('#btnSend').click());
  rec.seg('B');

  let lastLen = 0, lastChange = m.send, doneAt = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < BUILD_TIMEOUT_MS) {
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => {
      const f = document.getElementById('previewFrame'); const b = document.getElementById('btnSend');
      const ss = [...document.querySelectorAll('.chat-status-text, .chat-status-row')].map((e) => (e.textContent || '').trim()).filter(Boolean).slice(-6);
      return { len: f ? (f.srcdoc || '').length : 0, busy: !!(b && b.disabled), ss };
    });
    for (const x of st.ss) if (statuses.size < 12) statuses.add(x.slice(0, 80));
    if (st.len !== lastLen) { lastLen = st.len; lastChange = now(); }
    if (lastLen > 1200 && !st.busy && now() - lastChange > 4) { doneAt = lastChange; break; }
  }
  if (!doneAt) throw new Error('build did not finish (len=' + lastLen + ')');
  await page.waitForTimeout(1600);
  const turn = await page.evaluate(() => window.__diagTurn || null).catch(() => null);
  await Promise.race([Promise.all(calls.map((c) => c.p)), new Promise((r) => setTimeout(r, 8000))]);
  const diag = { turn, statuses: [...statuses], calls: calls.map(({ p, ...c }) => c) };
  m.b1 = now();
  m.secs = Math.max(1, Math.round(doneAt - m.send));
  await rec.stop();
  const code = await page.evaluate(() => document.getElementById('previewFrame').srcdoc || '');
  await page.close(); await ctx.close();

  // الموقع الناتج: لقطة كاملة الطول بعرض الجوال (سياق غير «جوال» كي لا يُعرض بعرض 980 حين تغيب وسم viewport).
  const sctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR, locale: 'ar' });
  const sp = await sctx.newPage();
  await sp.setContent(code, { waitUntil: 'load', timeout: 30000 }).catch(() => {});
  await sp.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await sp.waitForTimeout(1200);
  const fullH = await sp.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0));
  for (let y = 0; y < fullH; y += VH / 2) { await sp.evaluate((yy) => window.scrollTo(0, yy), y); await sp.waitForTimeout(120); }
  await sp.evaluate(() => window.scrollTo(0, 0)); await sp.waitForTimeout(800);
  const capH = Math.min(fullH, VH * 5);
  const sitePng = path.join(dir, 'site.png');
  await sp.screenshot({ path: sitePng, fullPage: true, clip: { x: 0, y: 0, width: VW, height: capH } });
  await sp.close(); await sctx.close();
  fs.writeFileSync(path.join(dir, '..', 'site.html'), code);
  log('captured frames=' + frames.length + ' build=' + m.secs + 's code=' + code.length + 'ch site=' + VW + 'x' + capH);
  log('diag ' + diagLine(diag));
  return { frames, m, sitePng, siteH: Math.round(capH * DPR), codeLen: code.length, code, diag };
}

// ───────── 🎬 تصوير فيديو الترند: صانع الفيديو الحقيقيّ في التطبيق ─────────
// يكتب «سوّ لي فيديو» في المحادثة (يفتح صانع الفيديو)، يختار بطاقة الترند، يكتب الموقف، يضغط «اصنع»،
// وينتظر الفيديو الحقيقيّ. الزمن المكتوب = من ضغطة «اصنع» إلى ظهور الفيديو.
export async function captureVideo(browser, acct, vi, dir, opt = {}) {
  const { ctx, page } = await appPage(browser, acct);
  page.on('dialog', (d) => d.accept().catch(() => {})); // سؤال تأكيد النقاط (حساب VIP لا يُخصم منه)
  const rec = await startRec(ctx, page, dir);
  const m = { a0: now(), taps: [], typing: [] };
  const tapAt = async (loc) => {
    const b = await loc.boundingBox().catch(() => null);
    if (b) m.taps.push({ t: now(), x: (b.x + b.width / 2) * DPR, y: (b.y + b.height / 2) * DPR });
    await loc.tap({ timeout: 5000 }).catch(() => loc.click({ timeout: 5000 }));
  };
  const typeIn = async (loc, text, total = 3.2) => {
    const delay = Math.max(24, Math.min(55, Math.round(total * 1000 / Math.max(1, text.length))));
    const t0 = now(); await loc.pressSequentially(text, { delay }); m.typing.push([t0, now(), delay / 1000]);
  };
  await page.waitForTimeout(900);
  await tapAt(page.locator('#prompt'));
  await page.waitForTimeout(300);
  await typeIn(page.locator('#prompt'), 'سوّ لي فيديو ترند', 1.4);
  await page.waitForTimeout(400);
  await tapAt(page.locator('#btnSend'));
  const isOpen = () => page.evaluate(() => { const v = document.getElementById('videoMakerModal'); return !!(v && getComputedStyle(v).display !== 'none' && document.querySelector('#vtGrid > div')); });
  for (let i = 0; i < 20 && !(await isOpen()); i++) await page.waitForTimeout(250);
  if (!(await isOpen())) {
    log('video maker did not open from chat — opening it directly');
    await page.evaluate(() => window.omranOpenVideoMaker && window.omranOpenVideoMaker(''));
    for (let i = 0; i < 12 && !(await isOpen()); i++) await page.waitForTimeout(250);
    if (!(await isOpen())) throw new Error('video maker did not open');
  }
  m.open = now();
  const info = await page.evaluate((k) => {
    const D = window.__VIDEO_TRENDS; const i = D.trends.findIndex((t) => t.key === k); const t = D.trends[i];
    const clean = (x) => String(x || '').replace(/\p{Extended_Pictographic}|\uFE0F/gu, '').replace(/\s{2,}/g, ' ').trim();
    return t ? { i, photo: t.photo, kind: t.kind, scenes: t.scenes || 1, title: clean(t.title && t.title.ar) || k } : null;
  }, vi.key);
  if (!info) throw new Error('trend not found: ' + vi.key);
  if (info.scenes > 1) throw new Error('trend ' + vi.key + ' has ' + info.scenes + ' scenes — pick a one-scene trend');
  if (info.photo === 'req' && !opt.photo) throw new Error('trend ' + vi.key + ' needs a photo');
  await page.waitForFunction(() => [...document.querySelectorAll('#vtGrid img')].slice(0, 6).every((im) => im.complete), null, { timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(700);
  const card = page.locator('#vtGrid > div').nth(info.i);
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(600);
  await tapAt(card);
  await page.waitForSelector('#vtGo', { timeout: 8000 });
  await page.waitForTimeout(900);
  if (opt.photo && info.photo !== 'none') {
    const slot = page.locator('#vtPeople > div').last();
    await slot.scrollIntoViewIfNeeded().catch(() => {});
    const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 6000 }), tapAt(slot)]);
    await fc.setFiles(opt.photo);
    await page.waitForFunction(() => document.querySelectorAll('#vtPeople img').length > 0, null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(900);
  }
  const text = info.kind === 'scene' ? vi.scene : info.kind === 'none' ? '' : vi.title;
  if (text && (await page.locator('#vtText').count())) {
    const ta = page.locator('#vtText');
    await ta.scrollIntoViewIfNeeded().catch(() => {});
    await tapAt(ta);
    await page.waitForTimeout(250);
    await typeIn(ta, text, 3.4);
    await page.waitForTimeout(450);
  }
  const go = page.locator('#vtGo');
  await go.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(450);
  await tapAt(go);
  m.send = now();
  rec.seg('B');
  const clip = path.join(dir, '..', 'clip.mp4');
  if (opt.fakeClip) { await page.waitForTimeout(4000); fs.copyFileSync(opt.fakeClip, clip); m.done = now(); }
  else {
    let src = '';
    const t0 = Date.now();
    while (!src && Date.now() - t0 < 8 * 60000) {
      await page.waitForTimeout(1000);
      const st = await page.evaluate(() => {
        const v = document.querySelector('#vtOut video'), s = document.getElementById('vtStatus'), g = document.getElementById('vtGo');
        return { src: v ? v.currentSrc || v.src : '', st: s ? s.textContent : '', busy: !!(g && g.disabled) };
      });
      if (st.src) src = st.src;
      else if (!st.busy && st.st && now() - m.send > 4) throw new Error('trend video failed: ' + st.st.slice(0, 160));
    }
    if (!src) throw new Error('trend video timed out');
    m.done = now();
    const r = await fetch(new URL(src, BASE));
    if (!r.ok) throw new Error('clip download ' + r.status);
    fs.writeFileSync(clip, Buffer.from(await r.arrayBuffer()));
  }
  // النتيجة داخل التطبيق: الفيديو يظهر في صانع الفيديو (لحظتين) ثمّ يُعرض ملء الشاشة في المونتاج.
  await page.evaluate(() => { const v = document.querySelector('#vtOut video'); if (v) { v.muted = true; v.scrollIntoView({ block: 'center' }); v.play().catch(() => {}); } }).catch(() => {});
  await page.waitForTimeout(2200);
  m.b1 = now();
  m.secs = Math.max(1, Math.round(m.done - m.send));
  await rec.stop();
  await page.close(); await ctx.close();
  const size = fs.statSync(clip).size;
  if (size < 150e3) throw new Error('clip too small (' + size + ' bytes)');
  log('captured frames=' + rec.frames.length + ' trend=' + vi.key + ' video ready in ' + m.secs + 's clip=' + (size / 1e6).toFixed(1) + 'MB');
  return { frames: rec.frames, m, clip, title: info.title };
}

// ───────── المونتاج (صفحة استوديو تُرسم إطارًا إطارًا: العربيّة صحيحة الشكل) ─────────
// باركود حقيقيّ (تصحيح H يتحمّل الشعار في الوسط) — مكتبة المستودع نفسها، بلا اعتماديّات.
export function qrSVG(url) {
  const qr = createRequire(import.meta.url)('./lib/qrcode.cjs')(0, 'H');
  qr.addData(url); qr.make();
  const n = qr.getModuleCount(); let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += 'M' + c + ' ' + r + 'h1v1h-1z';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" shape-rendering="crispEdges"><path fill="#0d0f14" d="' + d + '"/></svg>';
}

// نصوص الشاشة لكلّ نوع حلقة (الافتراضيّ: الموقع كما كان).
function screenText(idea, secs, o) {
  return {
    tag: KINDS.site.tag, hookS: 'بجملة وحدة بس ✍️', hook1: 'موقع ' + idea.name, hook2: 'في ' + secWord(secs) + ' ⚡',
    timerL: 'OM Ai يبني الموقع…', readyPre: 'جاهز في', readyGold: secWord(secs),
    endH: 'سوّ موقعك أنت', endS: 'اكتب فكرتك… والذكاء الاصطناعي يسوّيها', ...(o || {}),
  };
}

export function studioHTML(idea, secs, epN, o) {
  const x = screenText(idea, secs, o);
  const ep = epN ? epLabel(epN) : null;
  const icon = pathToFileURL(path.join(ROOT, 'icons/icon-512-v2.png')).href;
  const brand = pathToFileURL(path.join(ROOT, 'icons/brand-om-s.png')).href;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@500;700;800;900&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#000;font-family:Tajawal,'Noto Sans Arabic',sans-serif;color:#fff}
#stage{position:fixed;left:0;top:0;width:${W}px;height:${H}px;overflow:hidden}
#bg,#site,#end{position:absolute;inset:0}
#bg{width:${W}px;height:${H}px;object-fit:cover;transform-origin:50% 86%}
#site{overflow:hidden;display:none;background:#fff}
#siteImg{position:absolute;top:0;left:0;width:${W}px;transform-origin:50% 0}
.gold{background:linear-gradient(180deg,#ffe9a8,#e7b54a 55%,#b9822a);-webkit-background-clip:text;background-clip:text;color:transparent}
#hook{position:absolute;top:150px;left:60px;right:60px;padding:38px 40px;border-radius:44px;background:rgba(10,10,12,.95);border:3px solid rgba(231,181,74,.75);box-shadow:0 30px 80px rgba(0,0,0,.6);text-align:center}
#hook .s{font-size:46px;font-weight:700;color:#e8e2d0;margin-bottom:10px}
#hook .b{font-size:74px;font-weight:900;line-height:1.25}
#hook .b .ln{display:block;white-space:nowrap;overflow:hidden}
#timer{position:absolute;top:1060px;left:50%;transform:translateX(-50%);text-align:center;padding:40px 70px;border-radius:60px;background:rgba(10,10,12,.86);border:3px solid rgba(231,181,74,.8);box-shadow:0 30px 90px rgba(0,0,0,.7);min-width:620px}
#timer .n{font-size:150px;font-weight:900;line-height:1;font-variant-numeric:tabular-nums}
#timer .l{font-size:50px;font-weight:700;margin-top:16px;color:#f2ecd9}
#ready{position:absolute;top:120px;left:50%;transform:translateX(-50%);white-space:nowrap;max-width:1000px;overflow:hidden;padding:26px 54px;border-radius:999px;background:rgba(10,10,12,.9);border:3px solid #e7b54a;font-size:64px;font-weight:900;box-shadow:0 20px 60px rgba(0,0,0,.55)}
#wm{position:absolute;top:34px;left:34px;display:flex;align-items:center;gap:18px;padding:14px 30px 14px 22px;border-radius:999px;background:rgba(0,0,0,.72);border:2px solid rgba(231,181,74,.55)}
#wm img.i{width:60px;height:60px;border-radius:14px}#wm img.t{height:50px}
#tap{position:absolute;width:150px;height:150px;margin:-75px 0 0 -75px;border-radius:50%;border:8px solid rgba(255,233,168,.95);background:rgba(231,181,74,.25);opacity:0}
#flash{position:absolute;inset:0;background:#fff;opacity:0}
#end{display:none;background:radial-gradient(120% 80% at 50% 30%,#2a2113 0%,#0b0a08 60%,#000 100%);text-align:center;padding-top:190px}
#end img.t{display:block;margin:0 auto;height:130px}
#end .h{font-size:88px;font-weight:900;margin-top:46px;line-height:1.2}
#end .s{font-size:48px;font-weight:700;color:#efe7d2;margin-top:24px}
#end .qr{position:relative;width:500px;height:500px;margin:48px auto 0;padding:38px;background:#fff;border-radius:44px;border:6px solid #e7b54a;box-shadow:0 0 100px rgba(231,181,74,.4)}
#end .qr svg{display:block;width:100%;height:100%}
#end .qr img{position:absolute;left:50%;top:50%;width:104px;height:104px;margin:-52px 0 0 -52px;border-radius:24px;border:5px solid #e7b54a;box-shadow:0 0 0 9px #fff}
#end .u{display:inline-block;margin-top:40px;font-size:42px;font-weight:800;padding:18px 42px;border-radius:999px;border:3px solid #e7b54a;direction:ltr;color:#ffe9a8}
#end .nx{font-size:46px;font-weight:800;color:#efe7d2;margin-top:34px}
#sty{position:absolute;inset:0;display:none;background:#000;overflow:hidden}
#sty .bl{position:absolute;left:-80px;top:-80px;width:${W + 160}px;height:${H + 160}px;object-fit:cover;filter:blur(46px) brightness(.42) saturate(1.2)}
#card{position:absolute;left:60px;top:330px;width:960px;height:1280px;border-radius:46px;overflow:hidden;border:5px solid rgba(231,181,74,.9);box-shadow:0 30px 100px rgba(0,0,0,.75);background:#111}
#card img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
#divd{position:absolute;top:0;bottom:0;width:10px;margin-left:-5px;background:linear-gradient(180deg,#ffe9a8,#e7b54a 55%,#b9822a);box-shadow:0 0 40px rgba(231,181,74,.9)}
.tg{position:absolute;top:26px;padding:10px 28px;border-radius:999px;background:rgba(0,0,0,.66);font-size:38px;font-weight:800;color:#fff;border:2px solid rgba(255,255,255,.35)}
#tgA{left:26px}#tgB{right:26px;color:#1a1205;background:linear-gradient(180deg,#ffe9a8,#e7b54a 55%,#b9822a);border-color:transparent}
#lbl{position:absolute;top:1660px;left:50%;transform:translateX(-50%);white-space:nowrap;padding:22px 58px;border-radius:999px;background:rgba(10,10,12,.9);border:3px solid #e7b54a;font-size:66px;font-weight:900;box-shadow:0 20px 60px rgba(0,0,0,.6)}
#lbl small{font-size:40px;color:#e8e2d0;font-weight:700;margin-inline-start:14px}
#grid{position:absolute;inset:0;display:none;text-align:center}
#grid .gt{margin-top:400px;font-size:70px;font-weight:900}
#grid .gw{display:grid;grid-template-columns:repeat(3,300px);gap:24px;justify-content:center;margin-top:60px}
#grid .gi{position:relative;width:300px;height:400px;border-radius:28px;overflow:hidden;border:4px solid rgba(231,181,74,.85);box-shadow:0 14px 40px rgba(0,0,0,.6)}
#grid .gi img{width:100%;height:100%;object-fit:cover}
#grid .gi span{position:absolute;inset:auto 0 0 0;padding:10px 0 12px;font-size:32px;font-weight:800;background:linear-gradient(0deg,rgba(0,0,0,.85),rgba(0,0,0,0))}
#grid .gs{margin-top:56px;font-size:52px;font-weight:800;color:#efe7d2}
#ep{position:absolute;top:40px;right:34px;max-width:600px;white-space:nowrap;overflow:hidden;padding:12px 30px;border-radius:999px;background:linear-gradient(180deg,#ffe9a8,#e7b54a 55%,#b9822a);color:#1a1205;font-size:40px;font-weight:900;box-shadow:0 10px 30px rgba(0,0,0,.5)}
</style></head><body><div id="stage">
<img id="bg"><div id="site"><img id="siteImg"></div>
${x.styles ? stylesLayer(x.styles) : ''}
<div id="hook"><div class="s">${esc(x.hookS)}</div><div class="b"><span class="ln gold">${esc(x.hook1)}</span><span class="ln">${esc(x.hook2)}</span></div></div>
<div id="timer"><div class="n gold">0</div><div class="l">${esc(x.timerL)}</div></div>
<div id="ready">✅ ${esc(x.readyPre)} <span class="gold">${esc(x.readyGold)}</span></div>
<div id="wm"><img class="i" src="${icon}"><img class="t" src="${brand}"></div>
${ep ? '<div id="ep">🎬 ' + esc(ep.short) + ' · ' + esc(x.tag) + '</div>' : ''}
<div id="tap"></div><div id="flash"></div>
<div id="end"><img class="t" src="${brand}"><div class="h">${esc(x.endH)}<br><span class="gold">ببلاش</span></div><div class="s">${esc(x.endS)}</div><div class="qr">${qrSVG(QR_URL)}<img src="${icon}"></div><div class="u">${SITE}</div>${ep ? '<div class="nx">تابعنا… ' + esc(epLabel(epN + 1).short) + ' بعد يومين 👀</div>' : ''}</div>
</div><script>
const $=(id)=>document.getElementById(id);
let curBg='', curSite='';
window.fitAll=()=>{document.querySelectorAll('#hook .ln,#ready,#ep,#lbl').forEach((el)=>{let fs=parseFloat(getComputedStyle(el).fontSize);while(el.scrollWidth>el.clientWidth+1&&fs>28){fs-=2;el.style.fontSize=fs+'px';}});return true;};
window.apply=async(s)=>{
  const bg=$('bg');
  if(s.bg&&s.bg!==curBg){curBg=s.bg;bg.src=s.bg;try{await bg.decode()}catch(e){}}
  bg.style.display=s.bg?'block':'none';bg.style.transform='scale('+(s.bgZ||1)+')';
  $('site').style.display=s.site?'block':'none';
  if(s.site){const im=$('siteImg');if(im.src!==s.site){im.src=s.site;try{await im.decode()}catch(e){}} im.style.transform='translateY('+(-s.siteY)+'px) scale('+s.siteZ+')';}
  const set=(id,o,tf)=>{const e=$(id);e.style.opacity=o;e.style.display=o>0?'':'none';if(tf!=null)e.style.transform=tf;};
  set('hook',s.hook,'translateY('+((1-s.hook)*-40)+'px)');
  set('timer',s.timer,'translateX(-50%) scale('+(0.92+0.08*s.timer)+')');
  $('timer').querySelector('.n').textContent=s.timerN;
  set('ready',s.ready,'translateX(-50%) scale('+(0.9+0.1*s.ready)+')');
  set('wm',s.wm,null);
  if($('ep'))set('ep',s.wm,null);
  const t=$('tap');t.style.opacity=s.tap;if(s.tapXY){t.style.left=s.tapXY.x+'px';t.style.top=s.tapXY.y+'px';t.style.transform='scale('+(0.6+0.6*(1-s.tap))+')';}
  $('flash').style.opacity=s.flash;
  if($('sty')){const y=s.sty||null;$('sty').style.display=y?'block':'none';
    if(y){const ia=$('ia'),ib=$('ib'),bl=$('blr');
      if(ia.dataset.k!==y.a){ia.dataset.k=y.a;ia.src=y.a;try{await ia.decode()}catch(e){}}
      if(ib.dataset.k!==y.b){ib.dataset.k=y.b;ib.src=y.b;try{await ib.decode()}catch(e){}}
      const bsrc=y.p>0.5?y.b:y.a;if(bl.dataset.k!==bsrc){bl.dataset.k=bsrc;bl.src=bsrc;try{await bl.decode()}catch(e){}}
      ib.style.clipPath='inset(0 0 0 '+((1-y.p)*100)+'%)';
      $('divd').style.left=((1-y.p)*100)+'%';$('divd').style.opacity=(y.p>0.01&&y.p<0.99)?1:0;
      $('card').style.transform='scale('+(y.z||1)+')';$('card').style.opacity=1-y.grid;
      $('tgA').style.opacity=y.tagA;$('tgB').style.opacity=y.tagB;
      const l=$('lbl');l.style.opacity=y.lblO*(1-y.grid);if(l.dataset.k!==y.lbl){l.dataset.k=y.lbl;l.innerHTML=y.lbl;}
      l.style.transform='translateX(-50%) scale('+(0.9+0.1*y.lblO)+')';
      const g=$('grid');g.style.display=y.grid>0?'block':'none';g.style.opacity=y.grid;g.style.transform='scale('+(0.94+0.06*y.grid)+')';}}
  $('end').style.display=s.end>0?'block':'none';$('end').style.opacity=s.end;
  return true;
};
</script></body></html>`;
}

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (x) => { x = clamp(x); return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
const ramp = (t, a, b, fade = 0.3) => clamp(Math.min((t - a) / fade, (b - t) / fade));

function frameAt(list, r) {
  let lo = 0, hi = list.length - 1, ans = 0;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (list[mid].t <= r) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return list[ans];
}

export function timeline(m, siteH) {
  const realA = (m.send + 0.45) - m.a0;
  const dA = Math.min(realA, 6.5);
  const dB = 3.6;
  const scroll = Math.max(0, siteH - H);
  const dC = scroll > 600 ? 8.5 : 5;
  const dD = 4.6; // بطاقة النهاية مع الباركود: وقت كافٍ للتصوير
  return { realA, dA, dB, dC, dD, scroll, total: dA + dB + dC + dD };
}

async function compose(browser, cap, idea, outDir, epN) {
  const { frames, m, sitePng, siteH } = cap;
  const tl = timeline(m, siteH);
  const A = frames.filter((f) => f.seg === 'A'), B = frames.filter((f) => f.seg === 'B');
  if (!A.length || !B.length) throw new Error('no frames captured');
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const sp = await ctx.newPage();
  const studio = path.join(outDir, 'studio.html');
  fs.writeFileSync(studio, studioHTML(idea, m.secs, epN));
  await sp.goto(pathToFileURL(studio).href, { waitUntil: 'load' });
  await sp.evaluate(() => document.fonts.ready).catch(() => {});
  await sp.evaluate(() => { const r = document.getElementById('ready'); r.style.display = ''; window.fitAll(); r.style.display = 'none'; return true; });
  const fdir = path.join(outDir, 'out'); fs.mkdirSync(fdir, { recursive: true });
  const siteURL = pathToFileURL(sitePng).href;
  const tB = tl.dA, tC = tl.dA + tl.dB, tD = tC + tl.dC;
  const N = Math.round(tl.total * FPS);
  const tapT = (m.send - m.a0) * (tl.dA / tl.realA);
  const typeT = (m.type0 - m.a0) * (tl.dA / tl.realA);
  const ZOOM = 1.08, OX = W / 2, OY = H * 0.86;
  const tapXY = m.tap ? { x: OX + (m.tap.x - OX) * ZOOM, y: OY + (m.tap.y - OY) * ZOOM } : null;
  const st = (t) => {
    const s = { bg: '', bgZ: 1, site: '', siteY: 0, siteZ: 1, hook: 0, timer: 0, timerN: '0', ready: 0, wm: 0, tap: 0, tapXY, flash: 0, end: 0 };
    if (t < tC) {
      const r = t < tB ? m.a0 + t * (tl.realA / tl.dA) : (m.send + 0.45) + (t - tB) / tl.dB * (m.b1 - (m.send + 0.45));
      s.bg = pathToFileURL(frameAt(t < tB ? A : B.length ? B : A, r).fn).href;
      s.hook = t < tB ? ramp(t, 0.15, tB - 0.05, 0.35) : 0;
      s.bgZ = 1 + (ZOOM - 1) * (ease((t - (typeT - 0.5)) / 0.6) - ease((t - (tapT + 0.1)) / 0.5));
      if (t >= tB) { const p = clamp((t - tB) / (tl.dB - 0.5)); s.timer = ramp(t, tB, tC, 0.25); s.timerN = String(Math.min(m.secs, Math.round(p * m.secs))); }
      if (tapXY && t > tapT - 0.05 && t < tapT + 0.5) s.tap = clamp(1 - (t - tapT) / 0.5);
      s.wm = 1;
      if (t > tC - 0.12) s.flash = clamp((t - (tC - 0.12)) / 0.12);
    } else if (t < tD) {
      const lt = t - tC;
      s.site = siteURL;
      if (tl.scroll > 600) s.siteY = ease((lt - 1.0) / (tl.dC - 2.0)) * tl.scroll; else s.siteZ = 1 + 0.06 * ease(lt / tl.dC);
      s.ready = ramp(t, tC + 0.15, tD + 10, 0.3);
      s.wm = 1;
      s.flash = clamp(1 - lt / 0.25);
      if (t > tD - 0.3) s.end = clamp((t - (tD - 0.3)) / 0.3);
    } else {
      s.end = 1; s.site = siteURL; s.siteY = tl.scroll;
    }
    return s;
  };
  for (let i = 0; i < N; i++) {
    await sp.evaluate((s) => window.apply(s), st(i / FPS));
    await sp.screenshot({ path: path.join(fdir, String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 90 });
  }
  // الغلاف: أوّل لحظة الموقع جاهزًا مع شارة الزمن.
  await sp.evaluate((s) => window.apply(s), { ...st(tC + 0.8), flash: 0, ready: 1 });
  const cover = path.join(outDir, 'cover.jpg');
  await sp.screenshot({ path: cover, type: 'jpeg', quality: 90 });
  await ctx.close();

  const wav = path.join(outDir, 'audio.wav');
  writeAudio(wav, tl, m, tapT);
  const mp4 = path.join(outDir, 'omai-reel.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(fdir, '%05d.jpg'), '-i', wav,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-preset', 'medium', '-crf', '20', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
  fs.rmSync(fdir, { recursive: true, force: true });
  log('video ' + tl.total.toFixed(1) + 's → ' + mp4 + ' (' + (fs.statSync(mp4).size / 1e6).toFixed(1) + 'MB)');
  return { mp4, cover, tl };
}

const probe = (f, args) => { try { return execFileSync('ffprobe', ['-v', 'error', ...args, '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim(); } catch (e) { return ''; } };

// إطارات الصفحة → mp4 (+ صوت الفيديو الناتج نفسه فوق الخلفيّة إن وُجد).
function encode(fdir, wav, mp4, mix) {
  const args = ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(fdir, '%05d.jpg'), '-i', wav];
  if (mix) {
    args.push('-i', mix.file, '-filter_complex', '[2:a]atrim=0:' + mix.dur.toFixed(2) + ',adelay=' + Math.round(mix.at * 1000) + ':all=1,volume=1.15[c];[1:a][c]amix=inputs=2:duration=first:normalize=0[a]', '-map', '0:v', '-map', '[a]');
  }
  execFileSync('ffmpeg', [...args, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-preset', 'medium', '-crf', '20', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
  fs.rmSync(fdir, { recursive: true, force: true });
}

async function studioPage(browser, outDir, html) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const sp = await ctx.newPage();
  const studio = path.join(outDir, 'studio.html');
  fs.writeFileSync(studio, html);
  await sp.goto(pathToFileURL(studio).href, { waitUntil: 'load' });
  await sp.evaluate(() => document.fonts.ready).catch(() => {});
  await sp.evaluate(() => { const r = document.getElementById('ready'); r.style.display = ''; window.fitAll(); r.style.display = 'none'; return true; });
  const fdir = path.join(outDir, 'out'); fs.mkdirSync(fdir, { recursive: true });
  const shot = async (i, s) => { await sp.evaluate((x) => window.apply(x), s); await sp.screenshot({ path: path.join(fdir, String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 90 }); };
  return { ctx, sp, fdir, shot };
}
const S0 = () => ({ bg: '', bgZ: 1, site: '', siteY: 0, siteZ: 1, hook: 0, timer: 0, timerN: '0', ready: 0, wm: 1, tap: 0, tapXY: null, flash: 0, end: 0, sty: null });

export function videoTimeline(m, clipDur) {
  const realA = (m.send + 0.45) - m.a0;
  const dA = Math.min(realA, 9);
  return { realA, dA, dB: 3.4, dC: Math.min(Math.max(clipDur, 3), 10), dD: 4.6, get total() { return this.dA + this.dB + this.dC + this.dD; } };
}

// 🎬 تطبيق (مسرَّع) ← عدّاد التوليد ← الفيديو الناتج ملء الشاشة بصوته ← بطاقة النهاية.
export async function composeVideo(browser, cap, vi, outDir, epN) {
  const { frames, m, clip } = cap;
  const A = frames.filter((f) => f.seg === 'A'), B = frames.filter((f) => f.seg === 'B');
  if (!A.length) throw new Error('no frames captured');
  const cdir = path.join(outDir, 'clipf'); fs.mkdirSync(cdir, { recursive: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', clip, '-vf', 'scale=' + W + ':' + H + ':force_original_aspect_ratio=increase,crop=' + W + ':' + H + ',fps=' + FPS, '-q:v', '3', path.join(cdir, '%05d.jpg')]);
  const cf = fs.readdirSync(cdir).filter((f) => f.endsWith('.jpg')).sort();
  if (!cf.length) throw new Error('clip has no frames');
  const clipDur = cf.length / FPS;
  const tl = videoTimeline(m, clipDur);
  const sketch = vi.key === SKETCH_KEY;
  const html = studioHTML({ name: '' }, m.secs, epN, {
    tag: KINDS.video.tag, hookS: sketch ? 'سطر واحد بس ✍️' : 'ترند فيديو بضغطة وحدة 👆', hook1: sketch ? 'اسكتش بيكسار خليجي' : cap.title, hook2: sketch ? 'بالصوت والصورة 🎬' : 'من صانع الفيديو 🎬',
    timerL: 'OM Ai يصوّر الفيديو…', readyPre: 'جاهز في', readyGold: durWord(m.secs), endH: 'سوّ فيديو الترند حقّك', endS: 'اختر الترند… واكتب فكرتك',
  });
  const { ctx, sp, fdir, shot } = await studioPage(browser, outDir, html);
  const k = tl.dA / tl.realA;
  const tB = tl.dA, tC = tB + tl.dB, tD = tC + tl.dC, N = Math.round(tl.total * FPS);
  const hookEnd = Math.min(tB - 0.2, Math.max(2.4, (m.open - m.a0) * k));
  const taps = m.taps.filter((p) => p.t < m.send + 0.5).map((p) => ({ t: (p.t - m.a0) * k, xy: p }));
  const st = (t) => {
    const s = S0();
    if (t < tC) {
      const r = t < tB ? m.a0 + t / k : (m.send + 0.45) + (t - tB) / tl.dB * (m.b1 - (m.send + 0.45));
      s.bg = pathToFileURL(frameAt(t < tB || !B.length ? A : B, r).fn).href;
      s.hook = ramp(t, 0.15, hookEnd, 0.3);
      for (const p of taps) if (t > p.t - 0.05 && t < p.t + 0.5) { s.tap = clamp(1 - (t - p.t) / 0.5); s.tapXY = { x: p.xy.x, y: p.xy.y }; }
      if (t >= tB) { const p = clamp((t - tB) / (tl.dB - 0.5)); s.timer = ramp(t, tB, tC, 0.25); s.timerN = clock(Math.min(m.secs, Math.round(p * m.secs))); }
      if (t > tC - 0.12) s.flash = clamp((t - (tC - 0.12)) / 0.12);
    } else if (t < tD) {
      const lt = t - tC;
      s.bg = pathToFileURL(path.join(cdir, cf[Math.min(cf.length - 1, Math.floor(lt * FPS))])).href;
      s.ready = ramp(t, tC + 0.15, tC + 2.6, 0.3);
      s.flash = clamp(1 - lt / 0.25);
      if (t > tD - 0.3) s.end = clamp((t - (tD - 0.3)) / 0.3);
    } else { s.end = 1; s.bg = pathToFileURL(path.join(cdir, cf[cf.length - 1])).href; }
    return s;
  };
  for (let i = 0; i < N; i++) await shot(i, st(i / FPS));
  // الغلاف: لقطة من منتصف الفيديو الناتج مع شارة الزمن.
  await sp.evaluate((x) => window.apply(x), { ...st(tC + Math.min(1.4, tl.dC / 2)), flash: 0, ready: 1 });
  const cover = path.join(outDir, 'cover.jpg');
  await sp.screenshot({ path: cover, type: 'jpeg', quality: 90 });
  await ctx.close();
  const wav = path.join(outDir, 'audio.wav');
  synthAudio(wav, tl.total, {
    typing: m.typing.map(([a, b, d]) => [(a - m.a0) * k, (b - m.a0) * k, d * k]), taps: taps.map((p) => p.t),
    ticks: [tB, tl.dB], chimes: [tC, tD], duck: [tC, tD],
  });
  const hasAudio = !!probe(clip, ['-select_streams', 'a', '-show_entries', 'stream=index']);
  const mp4 = path.join(outDir, 'omai-reel.mp4');
  encode(fdir, wav, mp4, hasAudio ? { file: clip, at: tC, dur: tl.dC } : null);
  fs.rmSync(cdir, { recursive: true, force: true });
  log('video ' + tl.total.toFixed(1) + 's → ' + mp4 + ' (' + (fs.statSync(mp4).size / 1e6).toFixed(1) + 'MB) clip audio=' + (hasAudio ? 'yes' : 'no'));
  return { mp4, cover, tl };
}

function stylesLayer(x) {
  return '<div id="sty"><img class="bl" id="blr"><div id="card"><img id="ia"><img id="ib"><div id="divd"></div><div class="tg" id="tgA">قبل</div><div class="tg" id="tgB">بعد</div></div><div id="lbl"></div>' +
    '<div id="grid"><div class="gt">✨ <span class="gold">كلها من صورة وحدة</span></div><div class="gw">' +
    x.grid.map((g) => '<div class="gi"><img src="' + g.src + '"><span>' + escH(g.label) + '</span></div>').join('') +
    '</div><div class="gs">' + escH(x.foot) + '</div></div></div>';
}

export function stylesTimeline(n) {
  const dH = 2.8, dS = 2.5, dG = 3.4, dD = 4.6;
  return { dH, dS, dG, dD, n, total: dH + n * dS + dG + dD };
}

// 🖼️ الصورة الأصليّة ← كشف كلّ نمط بخطّ ذهبيّ (قبل/بعد) ← شبكة الكلّ ← بطاقة النهاية.
export async function composeStyles(browser, res, plan, outDir, epN) {
  const url = (f) => pathToFileURL(f).href;
  const items = res.items, n = items.length, tl = stylesTimeline(n);
  const html = studioHTML({ name: '' }, res.avg, epN, {
    tag: KINDS.styles.tag, hookS: 'صورة وحدة بس 📸', hook1: n + ' أنماط', hook2: 'كل نمط في ' + secWord(res.avg) + ' ⚡',
    endH: 'حوّل صورتك', endS: 'ارفع صورتك… واختر النمط',
    styles: { grid: [{ src: url(res.src), label: 'الأصلية' }, ...items.slice(0, 5).map((x) => ({ src: url(x.file), label: x.label }))], foot: 'كل نمط في ' + secWord(res.avg) + ' ⚡ — من OM Ai' },
  });
  const { ctx, sp, fdir, shot } = await studioPage(browser, outDir, html);
  const tS = tl.dH, tG = tS + n * tl.dS, tD = tG + tl.dG, N = Math.round(tl.total * FPS);
  const lab = (i) => '🎨 ' + escH(items[i].label) + '<small>' + (i + 1) + '/' + n + '</small>';
  const st = (t) => {
    const s = S0();
    const y = { a: url(res.src), b: url(items[0].file), p: 0, z: 1, tagA: 0, tagB: 0, lbl: '', lblO: 0, grid: 0 };
    if (t < tS) {
      y.z = 1 + 0.03 * ease(t / tl.dH); s.hook = ramp(t, 0.15, tS - 0.1, 0.3);
      y.lbl = '📸 الصورة الأصلية'; y.lblO = ramp(t, 0.4, tS - 0.1, 0.3);
    } else if (t < tG) {
      const i = Math.min(n - 1, Math.floor((t - tS) / tl.dS)), lt = t - tS - i * tl.dS;
      y.b = url(items[i].file); // كلّ نمط يُكشف من الصورة الأصليّة نفسها: قبل ← بعد
      y.p = ease((lt - 0.15) / 0.9); y.z = 1 + 0.025 * ease(lt / tl.dS);
      y.tagA = clamp(1 - (lt - 0.6) / 0.4); y.tagB = clamp((lt - 0.3) / 0.3);
      y.lbl = lab(i); y.lblO = clamp((lt - 0.35) / 0.3) * clamp((tl.dS - lt) / 0.2 + (i === n - 1 ? 1 : 0));
    } else if (t < tD) {
      y.a = url(items[n - 1].file); y.b = y.a; y.p = 1; y.grid = clamp((t - tG) / 0.45);
      if (t > tD - 0.3) s.end = clamp((t - (tD - 0.3)) / 0.3);
    } else { y.grid = 1; s.end = 1; }
    s.sty = y;
    return s;
  };
  for (let i = 0; i < N; i++) await shot(i, st(i / FPS));
  // الغلاف: نصف الصورة أصليّة ونصفها جيبلي/أوّل نمط — «قبل/بعد» واضح.
  await sp.evaluate((x) => window.apply(x), (() => { const s = st(tS + 0.5); s.sty.p = 0.5; s.sty.tagA = 1; s.sty.tagB = 1; s.sty.lblO = 1; s.hook = 1; return s; })());
  const cover = path.join(outDir, 'cover.jpg');
  await sp.screenshot({ path: cover, type: 'jpeg', quality: 90 });
  await ctx.close();
  const wav = path.join(outDir, 'audio.wav');
  synthAudio(wav, tl.total, { whoosh: items.map((_, i) => tS + i * tl.dS), chimes: [tG, tD] });
  const mp4 = path.join(outDir, 'omai-reel.mp4');
  encode(fdir, wav, mp4, null);
  log('video ' + tl.total.toFixed(1) + 's → ' + mp4 + ' (' + (fs.statSync(mp4).size / 1e6).toFixed(1) + 'MB)');
  return { mp4, cover, tl };
}

// صوت مولَّد عامّ: خلفيّة هادئة (تخفت تحت صوت الفيديو الناتج) + كتابة + نقرات + تكتكة + جرس + «ووش».
function synthAudio(file, total, ev) {
  const SR = 44100, n = Math.ceil(total * SR), buf = new Float32Array(n);
  const add = (t0, dur, fn) => { const s = Math.floor(t0 * SR); for (let i = 0; i < dur * SR && s + i < n; i++) if (s + i >= 0) buf[s + i] += fn(i / SR); };
  const chords = [[220, 277.18, 329.63], [196, 246.94, 293.66], [174.61, 220, 261.63], [196, 246.94, 329.63]];
  const duck = ev.duck || null;
  for (let i = 0; i < n; i++) {
    const t = i / SR, c = chords[Math.floor(t / 2.4) % chords.length];
    let env = clamp(t / 1.5) * clamp((total - t) / 1.2);
    if (duck) env *= 1 - 0.85 * clamp(Math.min((t - duck[0]) / 0.3, (duck[1] - t) / 0.3));
    let v = 0; for (const f of c) v += Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t);
    buf[i] += v * 0.02 * env * (0.8 + 0.2 * Math.sin(2 * Math.PI * 0.25 * t));
  }
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (const [a, b, d] of ev.typing || []) for (let t = a; t < b; t += d) add(t, 0.03, (x) => rnd() * 0.22 * Math.exp(-x * 160));
  for (const t of ev.taps || []) add(t, 0.12, (x) => Math.sin(2 * Math.PI * 900 * x) * 0.25 * Math.exp(-x * 40));
  if (ev.ticks) for (let j = 0; j < 8; j++) add(ev.ticks[0] + j * (ev.ticks[1] / 8), 0.05, (x) => Math.sin(2 * Math.PI * 1500 * x) * 0.07 * Math.exp(-x * 90));
  for (const t of ev.whoosh || []) add(t, 0.7, (x) => rnd() * 0.16 * Math.sin(Math.PI * clamp(x / 0.7)) * (0.5 + 0.5 * Math.sin(2 * Math.PI * (300 + 900 * x) * x)));
  (ev.chimes || []).forEach((t, j) => add(t, 1.7, (x) => (Math.sin(2 * Math.PI * (j ? 784 : 1046.5) * x) + 0.6 * Math.sin(2 * Math.PI * (j ? 1174.7 : 1568) * x)) * 0.18 * Math.exp(-x * 3)));
  const pcm = Buffer.alloc(44 + n * 2);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + n * 2, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12);
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 2, 28);
  pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round(clamp(buf[i], -1, 1) * 32767), 44 + i * 2);
  fs.writeFileSync(file, pcm);
}

// ───────── صوت خفيف مُولَّد (بلا موسيقى محميّة): نقرات الكتابة + جرس الاكتمال + خلفيّة هادئة ─────────
function writeAudio(file, tl, m, tapT) {
  const SR = 44100, n = Math.ceil(tl.total * SR), buf = new Float32Array(n);
  const k = tl.dA / tl.realA;
  const add = (t0, dur, fn) => { const s = Math.floor(t0 * SR); for (let i = 0; i < dur * SR && s + i < n; i++) if (s + i >= 0) buf[s + i] += fn(i / SR); };
  const chords = [[220, 277.18, 329.63], [196, 246.94, 293.66], [174.61, 220, 261.63], [196, 246.94, 329.63]];
  for (let i = 0; i < n; i++) {
    const t = i / SR, c = chords[Math.floor(t / 2.4) % chords.length];
    const env = clamp(t / 1.5) * clamp((tl.total - t) / 1.2);
    let v = 0; for (const f of c) v += Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t);
    buf[i] += v * 0.018 * env * (0.8 + 0.2 * Math.sin(2 * Math.PI * 0.25 * t));
  }
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const chars = Math.round((m.type1 - m.type0) / m.keyDelay);
  for (let c = 0; c < chars; c++) add((m.type0 - m.a0 + c * m.keyDelay) * k, 0.03, (x) => rnd() * 0.22 * Math.exp(-x * 160));
  add(tapT, 0.12, (x) => Math.sin(2 * Math.PI * 900 * x) * 0.25 * Math.exp(-x * 40));
  const tC = tl.dA + tl.dB;
  for (let j = 0; j < 8; j++) add(tl.dA + j * (tl.dB / 8), 0.05, (x) => Math.sin(2 * Math.PI * 1500 * x) * 0.07 * Math.exp(-x * 90));
  add(tC, 1.6, (x) => (Math.sin(2 * Math.PI * 1046.5 * x) + 0.6 * Math.sin(2 * Math.PI * 1568 * x)) * 0.2 * Math.exp(-x * 3.2));
  add(tC + tl.dC, 1.8, (x) => (Math.sin(2 * Math.PI * 784 * x) + 0.5 * Math.sin(2 * Math.PI * 1174.7 * x)) * 0.16 * Math.exp(-x * 2.6));
  const pcm = Buffer.alloc(44 + n * 2);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + n * 2, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12);
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 2, 28);
  pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round(clamp(buf[i], -1, 1) * 32767), 44 + i * 2);
  fs.writeFileSync(file, pcm);
}

// ───────── النشر عبر Upload-Post ─────────
export async function upFetch(p, opts = {}) {
  const r = await fetch(UP_API + p, { ...opts, headers: { Authorization: 'Apikey ' + UP_KEY, ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, j };
}

export async function publish(mp4, cover, cap, PLATFORMS, epN, kind, extId) {
  const fd = new FormData();
  fd.append('user', UP_USER);
  for (const p of PLATFORMS) fd.append('platform[]', p);
  fd.append('title', cap.ig);
  fd.append('video', new Blob([fs.readFileSync(mp4)], { type: 'video/mp4' }), 'omai-reel.mp4');
  if (PLATFORMS.includes('instagram')) {
    fd.append('media_type', 'REELS'); fd.append('share_to_feed', 'true');
    fd.append('cover_image', new Blob([fs.readFileSync(cover)], { type: 'image/jpeg' }), 'cover.jpg');
  }
  if (PLATFORMS.includes('facebook')) {
    const pg = await upFetch('/uploadposts/facebook/pages?profile=' + encodeURIComponent(UP_USER));
    const pages = (pg.j && pg.j.pages) || [];
    const page = pages.find((x) => /om\s*ai/i.test(x.name || '')) || pages[0];
    if (page) { fd.append('facebook_page_id', String(page.id)); log('facebook page: ' + page.name); } else log('no facebook page found (' + pg.status + ')');
    fd.append('facebook_title', cap.fb); fd.append('facebook_description', cap.fb); fd.append('facebook_media_type', 'REELS');
  }
  if (PLATFORMS.includes('tiktok')) {
    fd.append('tiktok_title', cap.ig.slice(0, 2200));
    fd.append('privacy_level', 'PUBLIC_TO_EVERYONE'); fd.append('brand_organic_toggle', 'true'); // ترويج لمشروعنا نحن
  }
  if (PLATFORMS.includes('youtube')) { fd.append('youtube_title', (cap.head + ' #shorts').slice(0, 100)); fd.append('youtube_description', cap.fb); }
  if (PLATFORMS.includes('x') && cap.x) fd.append('x_title', cap.x);
  if (PLATFORMS.includes('threads') && cap.threads) fd.append('threads_title', cap.threads);
  const reqId = 'omai-' + Date.now().toString(36) + randomBytes(3).toString('hex');
  fd.append('request_id', reqId); fd.append('async_upload', 'true');
  if (extId || epN) fd.append('external_id', extId || EP_ID(epN, kind)); // رقم الحلقة ونوعها يُقرآن من سجلّ النشر في المرّة الجاية (ومسلسل ميرا بمعرّفه mira-…)
  const r = await upFetch('/upload', { method: 'POST', body: fd, headers: { 'Idempotency-Key': reqId } });
  log('upload → ' + r.status + ' ' + JSON.stringify(r.j).slice(0, 300));
  if (!r.ok && r.status !== 202) throw new Error('upload failed ' + r.status);
  const id = r.j.request_id || reqId;
  for (let i = 0; i < 60; i++) {
    await sleep(10000);
    const s = await upFetch('/uploadposts/status?request_id=' + encodeURIComponent(id));
    const status = s.j && s.j.status;
    if (['completed', 'failed', 'not_found'].includes(status) || (status === 'in_progress' && i > 40)) {
      log('status: ' + status + ' ' + JSON.stringify(s.j.results || s.j).slice(0, 600));
      if (status !== 'completed') throw new Error('publish ' + status);
      return s.j;
    }
  }
  log('status still pending after 10 min — check the Upload-Post dashboard');
  return null;
}

// ───────── التشغيل ─────────
// فحص خفيف قبل تثبيت المتصفّح: الجدول يوميّ، والحلقة تنزل إذا مرّ 36 ساعة على السابقة.
export function platformResults(st) {
  const r = (st && (st.results || st.data)) || [];
  const rows = Array.isArray(r) ? r : Object.entries(r).map(([platform, v]) => ({ platform, ...(v || {}) }));
  return rows.filter((x) => x && x.platform).map((x) => ({
    platform: String(x.platform), ok: x.success !== false && !x.error, url: x.post_url || x.url || '',
    inbox: !!x.fallback_to_inbox, error: x.error ? String(x.error_message || x.error).slice(0, 120) : '',
  }));
}

async function gate() {
  let go = true, why = 'manual run';
  if (process.env.GITHUB_EVENT_NAME === 'schedule' && UP_KEY) {
    try {
      const st = await seriesState();
      go = dueNow(st.lastAt, Date.now());
      why = st.last ? 'last episode ' + st.last + ' ' + ((Date.now() - st.lastAt) / 36e5).toFixed(1) + 'h ago' : 'no episode yet';
    } catch (e) { why = 'history unavailable (' + (e && e.message) + ')'; }
  }
  log('gate: go=' + (go ? 1 : 0) + ' · ' + why);
  if (!go) gh('notice', 'no episode today (' + why + ') — next one tomorrow');
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'go=' + (go ? 1 : 0) + '\n');
}

// idea=accounts: فحص بلا تكلفة — يقرأ الموصول من Upload-Post (GET فقط) ويطبع نصّي X وThreads لحلقة مثال بأطوالهما.
async function accountsCheck() {
  const platforms = await resolvePlatforms();
  const c = buildCaption({ name: 'مطعم شاورما', tags: ['#مطاعم'] }, 42, 7);
  log('platforms for the next episode: ' + platforms.join(','));
  log('x (' + xLen(c.x) + '/280):\n' + c.x);
  log('threads (' + threadsLen(c.threads) + '/500):\n' + c.threads);
  gh('notice', 'accounts check · connected: ' + platforms.join(',') + ' · x ' + xLen(c.x) + '/280 · threads ' + threadsLen(c.threads) + '/500');
}

async function main() {
  if (String(process.env.IDEA_INDEX || '').trim().toLowerCase() === 'accounts') return accountsCheck();
  const ideas = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/social-bot-ideas.json'), 'utf8'));
  const live = !DRY && !!UP_KEY;
  // رقم الحلقة: آخر حلقة منشورة + 1 (سجلّ Upload-Post). في النشر الفعليّ لا نخمّن رقمًا.
  let st = { last: 0, lastAt: 0, names: [] };
  if (UP_KEY) {
    try { st = await seriesState(); } catch (e) { if (live) throw new Error('cannot read episode number: ' + e.message); log('history: ' + e.message); }
  }
  // حماية ثانية للجدول (لو شغّله ملفّ تشغيل بلا خطوة الفحص): لا حلقتين خلال 36 ساعة.
  if (live && process.env.GITHUB_EVENT_NAME === 'schedule' && !dueNow(st.lastAt, Date.now())) {
    log('episode ' + st.last + ' went out ' + ((Date.now() - st.lastAt) / 36e5).toFixed(1) + 'h ago — next one tomorrow');
    gh('notice', 'no episode today — next one tomorrow'); return;
  }
  const epN = Number.parseInt(process.env.EPISODE || '', 10) || st.last + 1;
  const ep = epLabel(epN);
  const acct = await botAccount();
  if (!acct.vip && !/^(1|true)$/i.test(process.env.ALLOW_WEAK || '')) {
    throw new Error('bot account "' + acct.user + '" is not VIP (tier=' + acct.tier + ') — add "' + BOT_USER + '" in Settings → owner panel → ⭐ VIP, then re-run');
  }
  // النوع: يُفرض من خانة idea، وإلّا بالدور من رقم الحلقة مع البقيّة احتياطًا.
  const forced = parseKind(process.env.KIND) || parseKind(process.env.IDEA_INDEX);
  const fixedIdea = /^-?\d+$/.test(String(process.env.IDEA_INDEX || '').trim());
  const order = forced ? [forced.kind] : fixedIdea ? ['site'] : kindOrder(epN, st.lastKind);
  log('episode ' + epN + ' (' + ep.short + ') · published so far ' + st.last + (st.lastKind ? ' (last ' + st.lastKind + ')' : '') + ' · kinds ' + order.join(' → ') + (forced || fixedIdea ? ' (manual)' : ' (auto)'));
  const fr = path.join(OUT, 'frames');
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ executablePath: CHROME, args: CHROME ? ['--no-sandbox'] : [] });
  let out = null, lastErr = null;
  try {
    for (const kind of order) {
      fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(fr, { recursive: true });
      try {
        out = kind === 'site' ? await makeSite(browser, acct, epN, st, ideas, fr, fixedIdea) : await makeMedia(browser, kind, forced ? forced.arg : '', acct, epN, fr);
        break;
      } catch (e) {
        lastErr = e;
        const msg = (e && e.message) || String(e);
        log(kind + ' failed: ' + msg);
        if (order.length > 1) gh('warning', kind + ' failed (' + msg.slice(0, 140) + ') — trying the next kind');
        for (const c of browser.contexts()) await c.close().catch(() => {});
      }
    }
  } finally { await browser.close(); saveWeak(); }
  if (!out) throw lastErr || new Error('no episode made');
  fs.rmSync(fr, { recursive: true, force: true });
  fs.writeFileSync(path.join(OUT, 'caption.txt'), out.caption.ig + '\n');
  if (out.caption.x) fs.writeFileSync(path.join(OUT, 'caption-x.txt'), out.caption.x + '\n');
  if (out.caption.threads) fs.writeFileSync(path.join(OUT, 'caption-threads.txt'), out.caption.threads + '\n');
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({ ...out.meta, vip: acct.vip, seconds: +out.res.tl.total.toFixed(1) }, null, 2));
  if (!live) {
    if (DRY && UP_KEY) await resolvePlatforms().catch((e) => log('platforms: ' + e.message)); // قراءة فقط: يظهر في السجلّ أين كانت ستنزل
    log(DRY ? 'DRY_RUN — not publishing' : 'UPLOAD_POST_API_KEY missing — not publishing'); gh('notice', 'video ready (not published) · ' + ep.short + ' · ' + out.note); return;
  }
  const platforms = await resolvePlatforms();
  const pub = await publish(out.res.mp4, out.res.cover, out.caption, platforms, epN, out.meta.kind);
  // نتيجة كلّ منصّة في ملفّ التحميل وملخّص التشغيل (رابط المنشور أو سبب الرفض) — لا «تمّ» بلا دليل.
  const per = platformResults(pub);
  fs.writeFileSync(path.join(OUT, 'publish.json'), JSON.stringify(pub || {}, null, 2));
  log('published ✓ ' + JSON.stringify(per));
  gh('notice', 'published ✓ ' + ep.short + ' · ' + out.note + ' · ' + (per.length ? per.map((x) => x.platform + (x.ok ? ' ✓' : ' ✗ ' + x.error) + (x.inbox ? ' (inbox)' : '')).join(' · ') : platforms.join(',')));
  for (const x of per) if (x.url) gh('notice', x.platform + ': ' + x.url);
}

// المواقع الهزيلة تُحفظ في ملفّ التحميل (social-out/weak/) مع تشخيصها، ولو نُشر نوع آخر بدلها.
const WEAK = [];
function saveWeak() {
  if (!WEAK.length) return;
  const dir = path.join(OUT, 'weak'); fs.mkdirSync(dir, { recursive: true });
  WEAK.forEach((w, i) => {
    fs.writeFileSync(path.join(dir, 'site-' + (i + 1) + '.html'), w.code || '');
    fs.writeFileSync(path.join(dir, 'diag-' + (i + 1) + '.json'), JSON.stringify({ name: w.name, prompt: w.prompt, why: w.why, len: (w.code || '').length, ...w.diag }, null, 2));
  });
}

// 🌐 حلقة موقع: فكرة من ترند اليوم (وإلّا القائمة)، وإذا طلع الموقع هزيل نعيد مرّة بفكرة ثانية.
async function makeSite(browser, acct, epN, st, ideas, fr, fixedIdea) {
  const ep = epLabel(epN);
  const MIN_CODE = Number(process.env.MIN_CODE || 5000);
  const weakOK = /^(1|true)$/i.test(process.env.ALLOW_WEAK || '');
  const avoid = [...st.names];
  let why = '';
  for (let attempt = 0; attempt < (fixedIdea ? 1 : 2); attempt++) {
    let idea = null, idx = -1;
    if (!fixedIdea && attempt === 0 && !/^list$/i.test(process.env.IDEA_SOURCE || '')) idea = await trendIdea(acct.token, avoid);
    if (!idea) {
      let k = epN - 1 + attempt;
      if (!fixedIdea) for (let i = 0; i < ideas.length && avoid.includes(pickIdea(ideas, '', k, 0).idea.name); i++) k++;
      ({ idx, idea } = pickIdea(ideas, fixedIdea ? process.env.IDEA_INDEX : '', k, 0));
    }
    idea = { ...idea, prompt: withAED(idea.prompt) };
    log('idea ' + (idea.src === 'trend' ? 'trend «' + idea.trend + '» → ' : '#' + idx + ': ') + idea.name + ' · ' + idea.prompt);
    gh('notice', ep.short + ' · ' + (idea.src === 'trend' ? 'trend: ' + idea.trend + ' → ' : 'list #' + idx + ': ') + idea.name);
    fs.rmSync(fr, { recursive: true, force: true }); fs.mkdirSync(fr, { recursive: true });
    const cap = await capture(browser, acct, idea, fr);
    why = siteProblem(cap.code, MIN_CODE);
    if (why && !weakOK) {
      log('quality gate: ' + why + ' — ' + (attempt ? 'giving up' : 'one more try'));
      gh('warning', 'weak site «' + idea.name + '»: ' + why + ' · ' + diagLine(cap.diag));
      WEAK.push({ name: idea.name, prompt: idea.prompt, why, code: cap.code, diag: cap.diag });
      avoid.push(idea.name); continue;
    }
    const res = await compose(browser, cap, idea, OUT, epN);
    res.secs = cap.m.secs;
    return {
      res, caption: buildCaption(idea, res.secs, epN), note: 'site · ' + idea.name + ' · build ' + res.secs + 's · ' + cap.codeLen + ' chars',
      meta: { kind: 'site', episode: epN, idea: idx, source: idea.src || 'list', trend: idea.trend || '', name: idea.name, prompt: idea.prompt, secs: res.secs, codeLen: cap.codeLen },
    };
  }
  throw new Error('quality gate: ' + why + ' — not publishing');
}

// 🎬/🖼️ حلقة فيديو ترند أو أنماط صور: نفس السلسلة والنشر وبطاقة النهاية.
async function makeMedia(browser, kind, arg, acct, epN, fr) {
  const ep = epLabel(epN, KINDS[kind].series);
  if (kind === 'video') {
    const vi = { ...(await videoIdea(acct.token, epN)), key: arg || SKETCH_KEY };
    log('video idea ' + (vi.src === 'trend' ? 'trend «' + vi.trend + '» → ' : 'list: ') + vi.title + ' · ' + vi.scene + ' · ' + vi.key);
    gh('notice', ep.short + ' · video ' + vi.key + ' · ' + (vi.src === 'trend' ? 'trend: ' + vi.trend + ' → ' : '') + vi.title);
    let photo = null;
    if (vi.key !== SKETCH_KEY) photo = (await makePhoto(acct, PHOTO_SUBJECTS[(epN - 1) % PHOTO_SUBJECTS.length], OUT)).file;
    const cap = await captureVideo(browser, acct, vi, fr, { photo });
    vi.cardTitle = cap.title;
    const res = await composeVideo(browser, cap, vi, OUT, epN);
    res.secs = cap.m.secs;
    return { res, caption: buildVideoCaption(vi, res.secs, epN), note: 'video · ' + vi.title + ' · ' + res.secs + 's', meta: { kind, episode: epN, trendKey: vi.key, source: vi.src, trend: vi.trend || '', title: vi.title, scene: vi.scene, secs: res.secs } };
  }
  const plan = stylesPlan(epN, arg);
  log('styles plan: ' + plan.subject.key + ' · ' + plan.styles.map((x) => x.key).join(','));
  gh('notice', ep.short + ' · styles: ' + plan.subject.ar + ' → ' + plan.styles.map((x) => x.label).join('، '));
  const made = await makeStyles(acct, plan, path.join(OUT, 'styles'));
  const res = await composeStyles(browser, made, plan, OUT, epN);
  res.secs = made.avg;
  return { res, caption: buildStylesCaption(plan, made, epN), note: 'styles · ' + made.items.length + ' · ' + res.secs + 's each', meta: { kind, episode: epN, subject: plan.subject.key, styles: made.items.map((x) => ({ key: x.key, secs: +x.secs.toFixed(1) })), avg: made.avg } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mira = process.argv.includes('--mira') || process.argv.includes('--gate-mira'); // مسلسل ميرا: نوع حلقة في البوت نفسه (scripts/social-bot-mira.mjs)
  const run = mira ? import('./social-bot-mira.mjs').then((m) => (process.argv.includes('--gate-mira') ? m.gateMira() : m.mainMira())) : (process.argv.includes('--gate') ? gate() : main());
  run.then(() => process.exit(0)).catch((e) => { const msg = e && e.message ? e.message : String(e); console.error('[social-bot] FAILED:', msg); gh('error', msg); process.exit(1); });
}
