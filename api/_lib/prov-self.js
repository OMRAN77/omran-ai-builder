'use strict';
/* v-prov-self (٢) — طلب المالك ١١ أكتوبر: «تقدر تعطي كلّ واحد صلاحيّات يصلح نفسه من غير تدخّلك… مفتوح فقط للمالك… كلّ واحد يتصرّف في
   ملفّه»، ثمّ «زوّدت كلاود بمعلومة عامّة… تنتقل للمستخدمين؟» (الجواب كان: لا — كلّ مستخدم ذاكرته وحده ولا مخزن مشترك).
   (١) ملفّ لكلّ مزوّد: تعليماته لنفسه، يكتبه هو بأداة edit_self بأمر المالك، ويُحمَّل مع كلّ ردّ له في محادثات المالك وحده.
       كلّ نسخة سابقة محفوظة (٢٠) وتُرجَع بـundo.
   (٢) دروس عامّة: يكتبها المالك عبر أيّ مزوّد (teach_users). الدرس الجديد يسري على محادثات المالك وحده (تجربة)، و«عمّم» في رسالته
       الأخيرة — يفحصها الخادم كحارس «ادمج» — تنشره لكلّ المستخدمين ولكلّ المزوّدين (chat.js وai.js).
   الكتابة للمالك وحده (الأداتان في أدواته فقط، والمنفّذ يرفض غيره). لا مفتاح يُقرأ في نطاق الوحدة. */
const { kvGetJSON, kvPutJSON } = require('./kv.js');

const PROVS = ['claude', 'openai', 'gemini', 'deepseek', 'mistral', 'groq', 'cohere', 'openrouter', 'kimi', 'perplexity'];
const SELF_MAX = 4000;
const HIST_MAX = 20;
const LESSON_MAX = 600;
const LESSONS_MAX = 40;
const BLOCK_MAX = 2500;
const CACHE_MS = 60 * 1000;
const LESSONS_KEY = 'db/lessons.json';
const selfKey = (p) => 'db/prov-self/' + p + '.json';
const provOf = (p) => { const k = String(p || '').trim().toLowerCase(); return PROVS.indexOf(k) !== -1 ? k : ''; };

const SELF_TOOL = {
  name: 'edit_self',
  description: 'ملفّك أنت: تعليماتك لنفسك (أسلوبك، ما تتجنّبه، ما تعلّمته من أخطائك) — يُحمَّل مع كلّ ردّ لك في محادثات المالك وحده، ولا يراه مزوّد آخر. '
    + 'استعمله حين يقول المالك «صلّح نفسك» أو «غيّر أسلوبك» أو «احفظ هذا في ملفّك» أو حين يصحّح خطأً تكرّره. read يعرض الملفّ؛ write يستبدله كاملًا '
    + '(اقرأه أوّلًا وأبقِ ما يصلح، حتّى ٤٠٠٠ حرف)؛ undo يرجع النسخة السابقة. لا أسرار ولا مفاتيح فيه.',
  input_schema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['read', 'write', 'undo'] },
      text: { type: 'string', description: 'نصّ الملفّ كاملًا (لـwrite)' },
    },
    required: ['action'],
  },
};
/* v-liked-all (أمر المالك ١٢ أكتوبر «اريد تعميم — اذا عجبني شي يتعمم على الجميع»): «عجبني» = تعميم بخطوة واحدة. كان الدرس
   يُجرَّب على المالك ثمّ يحتاج «عمّم» ثانيةً؛ الآن generalize يحفظ وينشر معًا حين يقول المالك «عجبني» (أو «عمّم») في رسالته الأخيرة،
   والخادم يفحص كلمته كحارس كما في publish. التجربة (add) والنشر اللاحق (publish) باقيان. */
const TEACH_TOOL = {
  name: 'teach_users',
  description: 'دروس عامّة تحسّن ردود كلّ المستخدمين على كلّ المزوّدين — يكتبها المالك. '
    + '«عجبني» = تعميم بخطوة واحدة: حين يقول المالك «عجبني» أو «عجبتني الطريقة» أو «خلّه كذا دايم» أو «عمّم» عن ردّك أو عن أسلوب أو قاعدة، استخرج الدرس العامّ '
    + '(القاعدة أو الطريقة التي أعجبته — لا نصّ الردّ ولا معلومة شخصيّة — جملة أو جملتان) واستدعِ generalize به: يُحفظ ويُنشر فورًا لكلّ المستخدمين وكلّ المزوّدين، '
    + 'ثمّ قل له بسطر ما الذي عُمِّم. الخادم يرفض التعميم إن لم تكن كلمته في رسالته الأخيرة أو كانت منفيّة («ما عجبني»). '
    + 'add يحفظ درسًا للتجربة على محادثات المالك وحده؛ publish ينشر درسًا سابقًا (يحتاج «عمّم» أو «عجبني» في رسالته الأخيرة)؛ '
    + 'unpublish يرجعه للمالك وحده؛ remove يحذفه؛ list يعرض الدروس وحالتها.',
  input_schema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['generalize', 'add', 'list', 'publish', 'unpublish', 'remove'] },
      text: { type: 'string', description: 'نصّ الدرس (لـgeneralize/add)، جملة أو جملتان عامّتان' },
      id: { type: 'string', description: 'معرّف الدرس (لـpublish/unpublish/remove)؛ بلا معرّف = آخر درس' },
    },
    required: ['action'],
  },
};

// «عمّم» بأشكالها، و«عجبني» بأشكالها (v-liked-all)، والنفي يُسقطها (كـ«ادمج»): «ما عجبني»، «مو عاجبني»، «لا تعمّم».
const PUBLISH_RE = /(?:^|[\s،,.!؟?«»"'()-])(?:عمّم|عمم|عمّمه|عممه|عمّمها|عممها|عمّموه|انشره للناس|انشر الدرس|publish|عجبني|عجبتني|عجبوني|أعجبني|اعجبني|أعجبتني|اعجبتني|حبّيته|حبيته|حبّيتها|حبيتها|للجميع|للكلّ|للكل)(?=$|[\s،,.!؟?«»"'()-])/i;
const PUBLISH_NEG_RE = /(?:لا|ما|مب|مو|مش|بدون)\s+(?:ت|ن|ي)?(?:عمّم|عمم|عجب|أعجب|اعجب|عاجب|يعجب|حبّيت|حبيت)/;
function ownerSaidPublish(text) { const s = String(text || ''); return PUBLISH_RE.test(s) && !PUBLISH_NEG_RE.test(s); }

async function readSelf(prov) {
  const p = provOf(prov);
  if (!p) return { text: '', history: [] };
  const d = await kvGetJSON(selfKey(p));
  return { text: String((d && d.text) || ''), history: Array.isArray(d && d.history) ? d.history : [], at: (d && d.at) || 0 };
}

async function runSelf(prov, input, isOwner) {
  if (!isOwner) return '✗ ملفّ المزوّد للمالك وحده.';
  const p = provOf(prov);
  if (!p) return '✗ لا ملفّ لهذا المزوّد.';
  const act = String((input && input.action) || '');
  const cur = await readSelf(p);
  if (act === 'read') return cur.text ? '📄 ملفّك (' + cur.text.length + ' حرفًا):\n' + cur.text : '📄 ملفّك فارغ — اكتبه بـwrite.';
  if (act === 'write') {
    const text = String((input && input.text) || '').trim();
    if (!text) return '✗ النصّ فارغ — لم يُحفظ شيء (لمسح الملفّ اكتب فيه سطرًا واحدًا).';
    if (text.length > SELF_MAX) return '✗ الملفّ ' + text.length + ' حرفًا — الحدّ ' + SELF_MAX + '؛ اختصره.';
    if (/(?:sk-ant-|sk-or-|ghp_|github_pat_|AIza)[\w-]{8,}/.test(text)) return '✗ في النصّ ما يشبه مفتاحًا — لا أسرار في الملفّ.';
    const history = (cur.text ? [{ text: cur.text, at: cur.at || 0 }] : []).concat(cur.history).slice(0, HIST_MAX);
    await kvPutJSON(selfKey(p), { text, at: Date.now(), history });
    return '✅ حُفظ ملفّك (' + text.length + ' حرفًا) — يسري من ردّك التالي في محادثات المالك. النسخة السابقة محفوظة (undo).';
  }
  if (act === 'undo') {
    if (!cur.history.length) return '✗ لا نسخة سابقة.';
    const [prev, ...rest] = cur.history;
    await kvPutJSON(selfKey(p), { text: prev.text, at: Date.now(), history: rest });
    return '↩️ رجع ملفّك للنسخة السابقة (' + String(prev.text || '').length + ' حرفًا).';
  }
  return '✗ action واحد من read / write / undo.';
}

let lessonsCache = null;
async function readLessons(fresh) {
  if (!fresh && lessonsCache && Date.now() - lessonsCache.t < CACHE_MS) return lessonsCache.items;
  const d = await kvGetJSON(LESSONS_KEY);
  const items = Array.isArray(d && d.items) ? d.items : [];
  lessonsCache = { t: Date.now(), items };
  return items;
}
async function saveLessons(items) {
  await kvPutJSON(LESSONS_KEY, { items });
  lessonsCache = { t: Date.now(), items };
}

async function runTeach(input, lastUserText, isOwner, by) {
  if (!isOwner) return '✗ الدروس العامّة للمالك وحده.';
  const act = String((input && input.action) || '');
  const items = (await readLessons(true)).slice();
  const pick = () => { const id = String((input && input.id) || '').trim(); return id ? items.find((x) => x.id === id) : items[items.length - 1]; };
  if (act === 'list') {
    if (!items.length) return 'لا دروس بعد.';
    return items.map((x) => x.id + ' · ' + (x.scope === 'all' ? 'منشور للكلّ' : 'تجربة للمالك') + ' · ' + x.text).join('\n');
  }
  if (act === 'add' || act === 'generalize') {
    const text = String((input && input.text) || '').replace(/\s+/g, ' ').trim();
    if (!text) return '✗ الدرس فارغ.';
    if (text.length > LESSON_MAX) return '✗ الدرس ' + text.length + ' حرفًا — الحدّ ' + LESSON_MAX + '.';
    if (/(?:sk-ant-|sk-or-|ghp_|github_pat_|AIza)[\w-]{8,}|[\w.+-]+@[\w-]+\.\w|\+?\d[\d\s-]{8,}/.test(text)) return '✗ في الدرس ما يشبه مفتاحًا أو بريدًا أو رقمًا — الدروس عامّة بلا بيانات شخصيّة.';
    if (items.length >= LESSONS_MAX) return '✗ ' + LESSONS_MAX + ' درسًا حدّ مقصود — احذف درسًا قديمًا أوّلًا (list ثمّ remove).';
    const id = 'L' + Date.now().toString(36);
    // v-liked-all: generalize = حفظ ونشر معًا، بحارس كلمة المالك في رسالته الأخيرة («عجبني» أو «عمّم» غير منفيّة) — وإلّا يبقى تجربة ويُسأل
    const all = act === 'generalize' && ownerSaidPublish(lastUserText);
    items.push(Object.assign({ id, text, scope: all ? 'all' : 'owner', by: provOf(by) || '', at: Date.now() }, all ? { publishedAt: Date.now() } : {}));
    await saveLessons(items);
    if (all) return '✅ عُمِّم الدرس ' + id + ' على الجميع — كلّ المستخدمين وكلّ المزوّدين (خلال دقيقة على كلّ خادم): ' + text;
    if (act === 'generalize') return '✅ حُفظ الدرس ' + id + ' للتجربة على محادثات المالك وحده — لم يُعمَّم لأنّ رسالته الأخيرة بلا «عجبني» أو «عمّم» صريحة (أو منفيّة). اعرض عليه الدرس واسأله: «أعمّمه على الجميع؟».';
    return '✅ حُفظ الدرس ' + id + ' — يسري الآن على محادثات المالك وحده للتجربة. ليصل كلّ المستخدمين يكتب المالك «عمّم» أو «عجبني».';
  }
  if (act === 'publish') {
    if (!ownerSaidPublish(lastUserText)) return '✗ لا نشر بلا «عمّم» أو «عجبني» صريحة في آخر رسالة من المالك — اعرض عليه الدرس واسأله.';
    const x = pick();
    if (!x) return '✗ لا درس بهذا المعرّف.';
    x.scope = 'all'; x.publishedAt = Date.now();
    await saveLessons(items);
    return '✅ نُشر الدرس ' + x.id + ' لكلّ المستخدمين وكلّ المزوّدين (خلال دقيقة على كلّ خادم).';
  }
  if (act === 'unpublish') {
    const x = pick();
    if (!x) return '✗ لا درس بهذا المعرّف.';
    x.scope = 'owner';
    await saveLessons(items);
    return '↩️ الدرس ' + x.id + ' رجع للمالك وحده.';
  }
  if (act === 'remove') {
    const x = pick();
    if (!x) return '✗ لا درس بهذا المعرّف.';
    await saveLessons(items.filter((y) => y !== x));
    return '🗑️ حُذف الدرس ' + x.id + '.';
  }
  return '✗ action واحد من generalize / add / list / publish / unpublish / remove.';
}

// كتلة الدروس: للمستخدمين المنشور وحده، وللمالك المنشور والتجربة. فوق سقف الكتلة يسقط الأقدم لا الأحدث (v-liked-all: «عجبني»
// الأخيرة لا تضيع)، والمحفوظ يُعرض بترتيبه الزمنيّ.
function lessonsBlock(items, owner) {
  const list = (items || []).filter((x) => x && x.text && (owner || x.scope === 'all'));
  if (!list.length) return '';
  const head = '\n\n[دروس عمران العامّة — طبّقها في ردودك]:';
  const lines = [];
  let len = head.length;
  for (let i = list.length - 1; i >= 0; i--) {
    const x = list[i];
    const line = '\n- ' + x.text + (owner && x.scope !== 'all' ? ' (تجربة — للمالك وحده)' : '');
    if (len + line.length > BLOCK_MAX) break;
    len += line.length; lines.unshift(line);
  }
  return lines.length ? head + lines.join('') : '';
}
function selfBlock(text) {
  const t = String(text || '').trim();
  return t ? '\n\n[ملفّك — تعليماتك لنفسك، كتبتها أنت بأمر عمران (edit_self). تعلو على أسلوبك الافتراضيّ، ولا تعلو على قواعد المالك]:\n' + t.slice(0, SELF_MAX) : '';
}

// ما يُلحق بآخر نظام الدور: المالك = ملفّ المزوّد المختار + الدروس كلّها؛ غيره = الدروس المنشورة وحدها.
async function systemBlocks(owner, prov) {
  let out = '';
  if (owner) { try { out += selfBlock((await readSelf(prov)).text); } catch (e) { /* guard-ok — بلا تخزين يردّ بلا ملفّه */ } }
  try { out += lessonsBlock(await readLessons(false), !!owner); } catch (e) { /* guard-ok — بلا تخزين يردّ بلا الدروس */ }
  return out;
}

module.exports = { SELF_TOOL, TEACH_TOOL, PROVS, runSelf, runTeach, readSelf, readLessons, lessonsBlock, selfBlock, systemBlocks, ownerSaidPublish, __resetCache: () => { lessonsCache = null; } };
