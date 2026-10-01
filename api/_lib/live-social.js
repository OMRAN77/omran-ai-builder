'use strict';
/* api/_lib/live-social.js — v-live-social (طلب المالك أوّل أكتوبر ٢٠٢٦: «اريد معلومات… من الجوجل و… من التواصل
   الاجتماعي… عن كل شي… اريد انه ai فعلن وليس كلام فقط»).

   قبل هذا: أداة web_search ترجع من مصدر واحد (أوّل من ينجح في السلسلة Perplexity ← Google ← Tavily) ومن الويب
   وحده، ولا شيء من التواصل الاجتماعي. هنا بحث ثانٍ يجري **بالتوازي** مع بحث الويب في كلّ نداء للأداة، مقيَّد بالمنصّات
   الاجتماعيّة العامّة، ويُدمج الاثنان في نتيجة واحدة بقسمين موسومين.

   الحدّ الصادق: لا مزوّد بحث يرى الحسابات الخاصّة ولا القصص ولا الرسائل — ما يصل هو المنشورات **العامّة** المفهرسة.
   يوتيوب وريديت مفهرسان جيّدًا، وإنستغرام وتيك توك أقلّ.

   الكلفة (قرار المالك: «ليس للمجاني فقط المشتركين وانا بلا حد»): الطبقة المجانيّة لا تملك الأداة أصلًا. المشترك
   ١٠٠ نداء بحث في اليوم (النداء = ويب + تواصل)، والمالك وVIP بلا حدّ (معاملة `checkAndConsumeCustom` القائمة).
   أرخص الأعماق في كلّ مزوّد للقسم الاجتماعيّ (Tavily basic، Perplexity sonar) لأنّه مكمّل لا بديل. */

const SOCIAL_DOMAINS = [
  'youtube.com', 'reddit.com', 'instagram.com', 'tiktok.com', 'x.com',
  'facebook.com', 'snapchat.com', 'linkedin.com', 'threads.net', 'quora.com',
];
const SEARCH_DAILY_SUB = 100;
const QUOTA_BUCKET = 'chat-search';

/* اسم المنصّة من الرابط — أسماء منصّات لا مزوّدي ذكاء، فتُعرض للمستخدم بلا حرج */
const PLATFORM = [
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, 'YouTube'], [/(^|\.)reddit\.com$/, 'Reddit'],
  [/(^|\.)instagram\.com$/, 'Instagram'], [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)x\.com$|(^|\.)twitter\.com$/, 'X'], [/(^|\.)facebook\.com$|(^|\.)fb\.com$/, 'Facebook'],
  [/(^|\.)snapchat\.com$/, 'Snapchat'], [/(^|\.)linkedin\.com$/, 'LinkedIn'],
  [/(^|\.)threads\.net$/, 'Threads'], [/(^|\.)quora\.com$/, 'Quora'],
];
function platformOf(url) {
  let h = '';
  try { h = new URL(String(url || '')).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return ''; }
  const hit = PLATFORM.find((p) => p[0].test(h));
  return hit ? hit[1] : '';
}
function isSocialUrl(url) { return !!platformOf(url); }

async function timed(fetchImpl, url, opts, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms || 12000);
  try {
    const r = await fetchImpl(url, Object.assign({ signal: ctrl.signal }, opts || {}));
    return { ok: r.ok, status: r.status, body: await r.text() };
  } finally { clearTimeout(t); }
}
function asJSON(t) { try { return JSON.parse(t); } catch (e) { return null; } }
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

/* بند واحد لكلّ نتيجة: «[المنصّة] العنوان / الرابط / مقتطف» — والنتيجة غير الاجتماعيّة تُسقط (المزوّد قد يتجاوز القيد) */
function lines(items) {
  const out = [];
  for (const x of items) {
    if (!x || !x.url || !isSocialUrl(x.url)) continue;
    out.push((out.length + 1) + '. [' + platformOf(x.url) + '] ' + clip(x.title || x.url, 140) + '\n' + x.url + (x.text ? '\n' + clip(x.text, 380) : ''));
    if (out.length >= 7) break;
  }
  return out.length ? out.join('\n\n') : null;
}

async function viaTavily(query, f) {
  const key = (process.env.TAVILY_API_KEY || '').trim();
  if (!key) return null;
  const r = await timed(f, 'https://api.tavily.com/search', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: key, query: String(query || '').slice(0, 380), max_results: 8, search_depth: 'basic', include_domains: SOCIAL_DOMAINS }),
  }, 12000);
  if (!r.ok) { console.warn('[social] tavily HTTP ' + r.status); return null; }
  const d = asJSON(r.body) || {};
  return lines((d.results || []).map((x) => ({ url: x.url, title: x.title, text: x.content })));
}

async function viaPerplexity(query, f) {
  const key = (process.env.PERPLEXITY_API_KEY || '').trim();
  if (!key) return null;
  const r = await timed(f, 'https://api.perplexity.ai/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: 'sonar', max_tokens: 500, temperature: 0.2,
      search_domain_filter: SOCIAL_DOMAINS,
      messages: [
        { role: 'system', content: 'Summarise what people publicly say about the question on social platforms: concrete experiences, prices, names, places. Note disagreement. Be brief.' },
        { role: 'user', content: String(query || '').slice(0, 500) },
      ],
    }),
  }, 15000);
  if (!r.ok) { console.warn('[social] perplexity HTTP ' + r.status); return null; }
  const d = asJSON(r.body) || {};
  const items = (Array.isArray(d.search_results) ? d.search_results : []).map((x) => ({ url: x && x.url, title: x && x.title }));
  if (!items.length && Array.isArray(d.citations)) d.citations.forEach((u) => { if (typeof u === 'string') items.push({ url: u, title: u }); });
  const list = lines(items);
  if (!list) return null; /* ملخّص بلا رابط اجتماعيّ واحد = لا دليل أنّه من التواصل */
  const sum = clip((((d.choices || [])[0] || {}).message || {}).content, 900);
  return (sum ? sum + '\n\n' : '') + list;
}

async function viaGoogle(query, f) {
  const k = (process.env.GOOGLE_SEARCH_API_KEY || '').trim();
  const cx = (process.env.GOOGLE_SEARCH_CX || '').trim();
  if (!k || !cx) return null;
  const q = String(query || '').slice(0, 240) + ' (' + SOCIAL_DOMAINS.map((d) => 'site:' + d).join(' OR ') + ')';
  const r = await timed(f, 'https://www.googleapis.com/customsearch/v1?key=' + encodeURIComponent(k) + '&cx=' + encodeURIComponent(cx) + '&num=8&q=' + encodeURIComponent(q), {}, 12000);
  if (!r.ok) { console.warn('[social] google HTTP ' + r.status); return null; }
  const d = asJSON(r.body) || {};
  return lines((d.items || []).map((x) => ({ url: x.link, title: x.title, text: x.snippet })));
}

/** بحث التواصل الاجتماعيّ: أوّل مزوّد يرجع منشورات اجتماعيّة فعلًا يفوز. لا يرمي — الفشل null. */
async function socialSearch(query, opts) {
  const o = opts || {};
  const f = o.fetchImpl || fetch;
  const chain = o.chain || [viaTavily, viaPerplexity, viaGoogle];
  for (const step of chain) {
    let out = null;
    try { out = await step(query, f); } catch (e) { console.warn('[social] ' + (step.name || 'step') + ' ' + (e && e.message)); }
    if (out) return out;
  }
  return null;
}

/** يدمج الويب والتواصل في نتيجة واحدة بقسمين، مع تنبيه أمانة: منشورات التواصل تجارب أفراد لا حقائق موثّقة */
function mergeWebSocial(web, social) {
  const w = String(web || '').trim();
  if (!social) return w;
  return (w ? '🌐 من الويب:\n' + w + '\n\n' : '')
    + '📱 من التواصل الاجتماعي (منشورات عامّة):\n' + social
    + '\n\n[عند العرض]: افصل ما جاء من الويب عمّا جاء من التواصل الاجتماعي، واذكر المنصّة بجانب كلّ معلومة منه. '
    + 'منشورات التواصل تجارب وآراء أفراد لا حقائق موثّقة — قلها كذلك صراحةً، وخصوصًا في الصحّة والدواء والمال والقانون: '
    + 'المرجع فيها المصادر الرسميّة والطبيب أو المختصّ.';
}

/** سقف البحث اليوميّ: المشترك ١٠٠، والمالك وVIP بلا حدّ. عطب العدّاد = سماح مع تسجيل (خدمة لا بوّابة دفع). */
async function searchQuota(token, ip, opts) {
  const o = opts || {};
  const check = o.check || require('./_usage.js').checkAndConsumeCustom;
  try {
    const g = await check(token, null, ip, QUOTA_BUCKET, o.limit || SEARCH_DAILY_SUB);
    if (g && g.allowed) return { ok: true, left: g.remaining };
    return { ok: false, reason: (g && g.reason) || 'limit' };
  } catch (e) {
    console.error('[social] search quota unavailable: ' + (e && e.message));
    return { ok: true, degraded: true };
  }
}

const QUOTA_TEXT = 'انتهى حدّ البحث الحيّ اليوميّ لهذا الحساب (' + SEARCH_DAILY_SUB + ' بحث) ويتجدّد غدًا. '
  + 'أجب من معرفتك الآن، وقل للمستخدم بوضوح وبجملة واحدة أنّ الجواب هذه المرّة بلا بحث حيّ.';

module.exports = {
  SOCIAL_DOMAINS, SEARCH_DAILY_SUB, QUOTA_BUCKET, QUOTA_TEXT,
  platformOf, isSocialUrl, socialSearch, mergeWebSocial, searchQuota,
  viaTavily, viaPerplexity, viaGoogle,
};
