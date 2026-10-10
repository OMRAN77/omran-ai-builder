// api/_lib/free-read.js — v-read-all: الطبقة المجانية (السلسلة المجانية بلا أدوات) تقرأ الروابط
// التي يرسلها المستخدم قبل أن تجيب، كما يقرأ الوكيل والمسار المدفوع بأداة fetch_page.
// القراءة جلب من الخادم نفسه (لا مزوّد ولا بحث مدفوع) فتبقى بلا تكلفة على المالك.
// كلّ قراءة تبثّ سطر حالة ثمّ سطر أثر «↳» بنفس شكل حلقة الأدوات، فيُحفظ في سجلّ الردّ.
'use strict';

const MAX_URLS = 3;
const PER_URL = 6000;

function lastUserText(convo) {
  const last = (Array.isArray(convo) ? convo : []).slice().reverse().find((m) => m && m.role === 'user');
  if (!last) return '';
  if (typeof last.content === 'string') return last.content;
  return (Array.isArray(last.content) ? last.content : []).filter((b) => b && b.type === 'text').map((b) => String(b.text || '')).join('\n');
}

// ملفّ على GitHub بصفحة blob → نصّه الخامّ (صفحة blob كلّها واجهة لا كود).
function readableUrl(u) {
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/.exec(u);
  return m ? 'https://raw.githubusercontent.com/' + m[1] + '/' + m[2] + '/' + m[3] : u;
}

function extractUrls(text) {
  const out = [];
  const re = /https?:\/\/[^\s<>"'`()\[\]{}]+/gi;
  let m;
  while ((m = re.exec(String(text || ''))) && out.length < MAX_URLS) {
    const u = m[0].replace(/[.,;:!?؟،]+$/, '');
    if (!out.includes(u)) out.push(u);
  }
  return out;
}

// يرجع المحادثة نفسها إن لم يكن فيها رابط، وإلّا نسخة يُلحق فيها المقروء بآخر رسالة للمستخدم.
async function preRead(args) {
  const convo = args.convo;
  const urls = extractUrls(lastUserText(convo));
  if (!urls.length) return { convo, read: 0 };
  const results = await Promise.all(urls.map(async (url) => {
    args.send({ status: '🌐 يقرأ صفحة…', k: 'stFetchPage' });
    let text;
    try { text = String(await args.fetchPage(readableUrl(url))); } catch (e) { text = 'فشل فتح الصفحة: ' + String((e && e.message) || e).slice(0, 120); }
    const tl = args.trailLine('fetch_page', { url }, text);
    args.send({ status: '↳ ' + tl.text, k: tl.k, p: tl.p, cmd: url, out: text.slice(0, 400) });
    return { url, text };
  }));
  const ok = results.filter((r) => !/^فشل/.test(r.text));
  if (!ok.length) return { convo, read: 0 };
  const block = ok.map((r) => '[قرأ التطبيق هذا المحتوى الآن من ' + r.url + ']\n' + r.text.slice(0, PER_URL)).join('\n\n');
  const copy = convo.slice();
  for (let i = copy.length - 1; i >= 0; i--) {
    const m = copy[i];
    if (!m || m.role !== 'user') continue;
    const extra = { type: 'text', text: '\n\n' + block };
    copy[i] = { role: 'user', content: typeof m.content === 'string' ? [{ type: 'text', text: m.content }, extra] : (Array.isArray(m.content) ? m.content : []).concat([extra]) };
    break;
  }
  return { convo: copy, read: ok.length };
}

module.exports = { preRead, extractUrls, readableUrl, lastUserText };
