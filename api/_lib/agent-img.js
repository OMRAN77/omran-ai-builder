'use strict';
/* agent-img.js — v-agent-img (المالك ١٣ أكتوبر: «الوكيل داخل المحادثة يقدر يرسم صورة ويرفعها للمستودع مباشرة، بدون ما المالك يحمّلها
   ويرفعها من جديد»): الصورة التي يرسمها المزوّد كانت رمزًا __IMG_N__ في المتصفّح وحده، و write_github لا يقبل إلّا رابط /i/ من مخزن
   التطبيق. الآن (للمالك وحده):
   - العميل يحفظ كلّ رسمة في المخزن (purpose:'agent'، ٢٤ ساعة) ويُلحق رابطها بنتيجة الأداة؛ هنا يُقرأ الرمز والرابط من النتيجة
     (noteTokens) ومن خريطة المحادثة التي يرسلها العميل (seedTokens) فيقبل write_github/edit_github الحقل image: "__IMG_N__".
   - صور رسالة المالك نفسها (والمُرفقة تلقائيًّا من ذاكرة المحادثة) تُحفظ بالمخزن نفسه ويصل النموذجَ رابطها (attachmentLinks). */
const TOKEN_RE = /^__IMG_(\d{1,3})__$/;
const ID_RE = /^[a-f0-9]{6,24}$/;

/** خريطة الرموز من جسم الطلب {"__IMG_1__": "<id>"} — المفاتيح والقيم بصيغها فقط، حتّى ٤٠ */
function seedTokens(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  let n = 0;
  for (const k of Object.keys(raw)) {
    const v = String(raw[k] || '').toLowerCase();
    if (TOKEN_RE.test(k) && ID_RE.test(v) && n++ < 40) out[k] = v;
  }
  return out;
}
/** نتيجة generate_image/edit_image فيها رمز واحد ورابط /i/ واحد ← الرمز يشير إلى ذلك المعرّف (الأحدث يغلب) */
function noteTokens(result, map) {
  const s = String(result || '');
  const toks = s.match(/__IMG_\d{1,3}__/g) || [];
  const ids = [];
  s.replace(/\/i\/([a-f0-9]{6,24})(?:\.[a-z]{3,4})?/gi, (m, id) => { ids.push(id.toLowerCase()); return m; });
  const t = Array.from(new Set(toks)), u = Array.from(new Set(ids));
  if (t.length === 1 && u.length === 1 && map && typeof map === 'object') map[t[0]] = u[0];
  return map;
}
/** حقل image: رمز __IMG_N__ ← معرّفه من الخريطة؛ غيره كما هو. unknown=true لرمز بلا معرّف */
function resolveImage(value, map) {
  const s = String(value == null ? '' : value).trim();
  if (!TOKEN_RE.test(s)) return { value: s };
  const id = map && map[s];
  return id ? { value: id } : { value: s, unknown: true };
}

/** صور رسالة المالك الأخيرة (كتل image بصيغة أنثروبيك) ← تُحفظ ٢٤ ساعة ببصمة محتواها، وترجع سطرًا لكلّ صورة. */
async function attachmentLinks(content, opts) {
  const o = opts || {};
  const blocks = (Array.isArray(content) ? content : []).filter((b) => b && b.type === 'image' && b.source && b.source.type === 'base64' && typeof b.source.data === 'string');
  if (!blocks.length) return [];
  const share = o.share || require('./img-share.js');
  const lines = [];
  for (let i = 0; i < blocks.length && i < 6; i++) {
    const src = blocks[i].source;
    const data = src.data.replace(/\s+/g, '');
    if (!data || data.length > 3 * 1024 * 1024) continue; // حدّ المخزن نفسه
    const mime = /^image\/(png|jpeg|webp)$/.test(String(src.media_type || '')) ? String(src.media_type) : 'image/jpeg';
    let id = '';
    try { id = await share.putImage(data, mime, 0, 0, share.AGENT_TTL_SEC, share.contentId(data)); } catch (e) { id = ''; }
    if (!id) continue;
    const ext = mime === 'image/png' ? 'png' : (mime === 'image/webp' ? 'webp' : 'jpg');
    lines.push('الصورة ' + (i + 1) + ': /i/' + id + '.' + ext);
  }
  if (!lines.length) return [];
  return ['[صور رسالة المالك محفوظة في التطبيق يومًا — لرفع إحداها إلى المستودع: write_github بملفّ {path, image: "<الرابط>"}]\n' + lines.join('\n')];
}

/** v-agent-img-keep: رموز __IMG_N__ في ملفّات الرفع بلا معرّف بعد ← يُطلب من المتصفّح حفظ الرسمة نفسها (ask = runInClient save_image) */
async function ensureSaved(input, map, ask, getImage) {
  const i = input && typeof input === 'object' ? input : {};
  const all = [].concat(Array.isArray(i.files) ? i.files : [], Array.isArray(i.images) ? i.images : []);
  const toks = Array.from(new Set(all.map((f) => String((f && f.image) || '').trim()).filter((t) => TOKEN_RE.test(t)))).slice(0, 10);
  /* v-owner-paid-gate: معرّف في الخريطة انتهى عمره (يوم) — يُحفظ من المتصفّح من جديد بلا رسم، لا «ارسمها من جديد» */
  const get = getImage || ((id) => require('./img-share.js').getImage(id));
  for (const t of toks) { if (map && map[t]) { let ok = true; try { ok = !!(await get(map[t])); } catch (e) { ok = true; /* guard-ok — عطل القراءة لا يُسقط معرّفًا صالحًا */ } if (!ok) delete map[t]; } }
  const want = toks.filter((t) => !(map && map[t]));
  for (const t of want) { try { noteTokens(await ask(t), map); } catch (e) { /* guard-ok — يرفضه الرفع بعدها بسببه */ } }
  return map;
}

/* v-agent-img-mode (المالك ١٤ أكتوبر، ردّ الوكيل: «الصور ما تبدّلت… أنت الحين في وضع الوكيل، والوكيل ما وصله منه شي»): وضع الوكيل
   (agent.js) كان بلا أداة رسم أصلًا. الأداتان هنا بوصف الوكيل، وتنفيذهما في المتصفّح نفسه (omranAgentTools في app-17) — للمالك وحده. */
const DRAW_TOOLS = [
  {
    name: 'generate_image',
    description: 'ارسم صورة حقيقيّة من وصف نصّي. تُحفظ في مخزن التطبيق يومًا وتعود لك برمز مثل __IMG_1__ ورابطها /i/…. لرفعها إلى المستودع: write_github بملفّ {path: مسار الصورة في المستودع كما قرأته, image: "__IMG_1__"} (أو edit_github بحقل images) — امتداد المسار يحدّد الصيغة، وPNG أو JPEG إلى ‎.webp يتحوّل تلقائيًّا. ارسم فقط ما يطلبه المالك في رسالته الأخيرة (لا تكمل طلبًا قديمًا ولا ترسم لتجرّب — الخادم يرفضه)، ثمّ ارفعها كلّها في رفعة واحدة. لعرض الصورة في ردّك ضع رمزها وحده في سطر.',
    input_schema: { type: 'object', properties: { prompt: { type: 'string', description: 'وصف الصورة بالإنجليزية، دقيق ومحدّد (نمط، إضاءة، زاوية، تأطير). أيّ كلام يجب أن يظهر مكتوبًا داخل الصورة يُنقل حرفيًّا بلغته بين «».' } }, required: ['prompt'] },
  },
  {
    name: 'edit_image',
    description: 'عدّل آخر صورة في هذه المحادثة (آخر ما رسمته أو عدّلته) بتعليمة. تعود برمز __IMG_N__ ورابطها /i/… مثل generate_image، وتُرفع إلى المستودع بالطريقة نفسها.',
    input_schema: { type: 'object', properties: { instruction: { type: 'string', description: 'تعليمة التعديل بالإنجليزية، دقيقة (ماذا يتغيّر، وماذا يبقى كما هو).' } }, required: ['instruction'] },
  },
];

module.exports = { seedTokens, noteTokens, resolveImage, attachmentLinks, ensureSaved, TOKEN_RE, DRAW_TOOLS };
