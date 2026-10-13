'use strict';
/* v-prov-self (٢) — طلب المالك ١١ أكتوبر: «تقدر تعطي كلّ واحد صلاحيّات يصلح نفسه من غير تدخّلك… مفتوح فقط للمالك… كلّ واحد يتصرّف في
   ملفّه»، ثمّ «زوّدت كلاود بمعلومة عامّة… تنتقل للمستخدمين؟» (الجواب كان: لا — كلّ مستخدم ذاكرته وحده ولا مخزن مشترك).
   (١) ملفّ لكلّ مزوّد: تعليماته لنفسه، يكتبه هو بأداة edit_self بأمر المالك، ويُحمَّل مع كلّ ردّ له في محادثات المالك وحده.
       كلّ نسخة سابقة محفوظة (٢٠) وتُرجَع بـundo.
   (١ب) v-owner-gen (١٣ أكتوبر: «عمّم» من أي مزوّد = المعلومة عند العشرة، للمالك وحده): ردود المزوّد في المحادثة تُحفظ كما هي
       (قصير وطويل وكود) في مخزن واحد سقفه ١٦٠ ألف توكن، ويُحمَّل مع كل مزوّد في محادثات المالك. غير المالك لا يراه.
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
const GEN_KEY = 'db/owner-gen.json';
// ١٦٠ ألف توكن بحساب التطبيق (٢٫٥ حرف للتوكن). المجموع مع المحادثة الحاليّة لا يتجاوزه: الأقدم من المعمّم يُنقص.
const GEN_CHARS = 160000 * 2.5;
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
// v-owner-gen: «عمّم» وحدها (لا «عجبني») تنسخ ردود المزوّد. النفي «لا تعمّم» يُسقطها.
const GEN_RE = /(?:^|[\s،,.!؟?«»"'()-])(?:عمّم|عمم|عمّمه|عممه|عمّمها|عممها|عمّموه)(?=$|[\s،,.!؟?«»"'()-])/i;
const GEN_NEG_RE = /(?:لا|ما|مب|مو|مش|بدون)\s+(?:ت|ن|ي)?(?:عمّم|عمم)/;
function ownerSaidGeneralize(text) { const s = String(text || ''); return GEN_RE.test(s) && !GEN_NEG_RE.test(s); }

async function readSelf(prov) {
  const p = provOf(prov);
  if (!p) return { text: '', history: [] };
  const d = await kvGetJSON(selfKey(p));
  return { text: String((d && d.text) || ''), history: Array.isArray(d && d.history) ? d.history : [], at: (d && d.at) || 0 };
}

const KEY_RE = /(?:sk-ant-|sk-or-|ghp_|github_pat_|AIza)[\w-]{8,}/;
function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((p) => (typeof p === 'string' ? p : (p && (p.text || (typeof p.content === 'string' ? p.content : ''))) || '')).filter(Boolean).join('\n');
}
function redactKeys(t) { return String(t || '').replace(KEY_RE, '«مفتاح محذوف»'); }
function assistantTexts(messages) {
  const out = [];
  for (const m of messages || []) {
    if (!m || m.role !== 'assistant') continue;
    const t = redactKeys(textOf(m.content)).replace(/\u0000/g, '').trim();
    if (t) out.push(t);
  }
  return out;
}
// نافذة المالك الحاليّة (آخر ٢٠٠ رسالة حتى السقف) — الباقي من السقف للمعلومات المعمّمة.
function sentConvoChars(messages) {
  const source = (messages || []).filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content);
  let chars = 0, n = 0;
  for (let i = source.length - 1; i >= 0 && n < 200; i--) {
    const size = textOf(source[i].content).length;
    if (n && chars + size > GEN_CHARS) break;
    chars += size; n++;
  }
  return Math.min(chars, GEN_CHARS);
}
function genBudget(messages) { return messages ? Math.max(0, GEN_CHARS - sentConvoChars(messages)) : GEN_CHARS; }
function trimGen(items, cap) {
  const out = (items || []).filter((x) => x && x.text).map((x) => ({ id: x.id, text: x.text, at: x.at || 0, by: x.by || '' }));
  let total = out.reduce((n, x) => n + x.text.length, 0);
  while (out.length > 1 && total > cap) { total -= out[0].text.length; out.shift(); }
  if (out.length === 1 && out[0].text.length > cap) out[0] = Object.assign({}, out[0], { text: out[0].text.slice(-cap) });
  return out;
}
let genCache = null;
async function readGen(fresh) {
  if (!fresh && genCache && Date.now() - genCache.t < CACHE_MS) return genCache.items;
  const d = await kvGetJSON(GEN_KEY);
  const items = Array.isArray(d && d.items) ? d.items : [];
  genCache = { t: Date.now(), items };
  return items;
}
async function saveGen(items) {
  await kvPutJSON(GEN_KEY, { items });
  genCache = { t: Date.now(), items };
}
// ردود المزوّد كما كُتبت، بلا تلخيص. التكرار لا يُضاعَف. فوق السقف يسقط الأقدم.
async function captureGeneralize(messages, prov) {
  const fresh = assistantTexts(messages);
  if (!fresh.length) return { added: 0 };
  const items = (await readGen(true)).slice();
  const have = new Set(items.map((x) => x.text));
  let added = 0;
  for (const text of fresh) {
    if (have.has(text)) continue;
    have.add(text);
    items.push({ id: 'G' + Date.now().toString(36) + added, text, at: Date.now(), by: provOf(prov) || '' });
    added++;
  }
  const kept = trimGen(items, GEN_CHARS);
  if (added || kept.length !== items.length) await saveGen(kept);
  return { added, items: kept };
}
const GEN_HEAD = '\n\n[معلومات معمّمة — حفظها عمران بـ«عمّم» لتكون عند كل المزوّدين. اعتمدها كما هي، ولا تعلو على قواعد المالك]:\n';
function genBlock(items, budget, already) {
  const room = Number(budget) || 0;
  if (room <= GEN_HEAD.length) return '';
  const has = already && typeof already.has === 'function' ? (t) => already.has(t) : (t) => !!(already && String(already).includes(t));
  const list = (items || []).filter((x) => x && x.text && !has(x.text));
  if (!list.length) return '';
  const parts = [];
  let len = GEN_HEAD.length;
  for (let i = list.length - 1; i >= 0; i--) {
    const gap = parts.length ? 2 : 0;
    if (len + gap + list[i].text.length > room) {
      const fit = room - len - gap;
      if (fit > 0 && !parts.length) parts.unshift(list[i].text.slice(-fit));
      break;
    }
    len += gap + list[i].text.length;
    parts.unshift(list[i].text);
  }
  return parts.length ? GEN_HEAD + parts.join('\n\n') : '';
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
    if (KEY_RE.test(text)) return '✗ في النصّ ما يشبه مفتاحًا — لا أسرار في الملفّ.';
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
// ما يُلحق بآخر نظام الدور: المالك = ملفّه + المعلومات المعمّمة (ضمن باقي السقف) + الدروس؛ غيره = الدروس المنشورة وحدها.
async function systemBlocks(owner, prov, ctx) {
  let out = '';
  if (owner) {
    try {
      if (ctx && ownerSaidGeneralize(ctx.lastUserText)) { try { await captureGeneralize(ctx.messages, prov); } catch (e) { /* guard-ok — فشل الحفظ لا يوقف الردّ */ } }
      out += selfBlock((await readSelf(prov)).text);
      try {
        const already = (ctx && ctx.messages) ? new Set(assistantTexts(ctx.messages)) : null;
        out += genBlock(await readGen(false), genBudget(ctx && ctx.messages), already);
      } catch (e) { /* guard-ok — بلا تخزين يردّ بلا المعلومات المعمّمة */ }
    } catch (e) { /* guard-ok — بلا تخزين يردّ بلا ملفّه */ }
  }
  try { out += lessonsBlock(await readLessons(false), !!owner); } catch (e) { /* guard-ok — بلا تخزين يردّ بلا الدروس */ }
  return out;
}

module.exports = { SELF_TOOL, TEACH_TOOL, PROVS, GEN_CHARS, GEN_HEAD, runSelf, runTeach, readSelf, readLessons, lessonsBlock, selfBlock, systemBlocks, ownerSaidPublish, ownerSaidGeneralize, trimGen, genBlock, genBudget, captureGeneralize, __resetCache: () => { lessonsCache = null; genCache = null; } };
