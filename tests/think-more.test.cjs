// tests/think-more.test.cjs — v-think-more (لقطتا المالك ١٢ أكتوبر على Fable 5.1: «لا الكتابة الي فوق المحادثة فكر لمدة الوقت» ثمّ
// مرّة ثانية ← «⚠️ رفض المزوّد الطلب (reasoning_extraction)»): «فكّر لمدة/أكثر/زين» يقصد بها المالك جهدًا أعلى، ومصنّف المزوّد يقرؤها
// طلبًا لكشف التفكير فيرفض الدور كلّه. (١) قبل النداء: العبارة تصير «بدقّة ومراجعة» في النسخة المرسَلة والجهد max. (٢) رفض بالفئة
// نفسها رغم ذلك: إعادة واحدة بلا كلمات فكّر/تفكير وبجهد max. غير المالك كما كان. المعالج الحقيقيّ أمام مزوّد مزيّف.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.OWNER_CLAUDE_CHAT = 'on'; // v-claude-chat-off: ردّ Claude للمالك موقوف افتراضيًّا — هذا الاختبار يفحص مساره حين يُعاد تشغيله
process.env.AUTH_SECRET = 'think-more-secret';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-direct';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
for (const k of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_API_KEY', 'CHAT_IMAGE_MODEL', 'CHAT_CLAUDE_MODEL']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, e) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports: e }; };
const db = new Map();
stub('api/_lib/kv.js', { kvGetJSON: async (k) => (db.has(k) ? structuredClone(db.get(k)) : null), kvPutJSON: async (k, v) => { db.set(k, structuredClone(v)); }, kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {}, kvGetRaw: async () => null, kvSetRaw: async () => {}, kvIncr: async () => 1, kvIncrBy: async () => 1, kvDecrBy: async () => 0, kvSetIfAbsent: async () => true, kvList: async () => [] });
let usageUser = 'omran';
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', todayCount: async () => 0, bumpCount: async () => {}, checkAndConsume: async () => ({ allowed: true, username: usageUser, tier: usageUser === 'omran' ? 'owner' : 'vip', subscriber: true }) });
stub('api/_lib/_vip.js', { isVip: async (u) => u === 'vipuser' });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/_owner-alert.js', { alertOwnerCredit: async () => {}, alertOwnerError: async () => {}, isCreditFailure: () => false });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
const le = require(rp('api/_lib/log-error.js'));
le.logErrorAndFlush = async () => {}; le.logError = () => {};
const chat = require(rp('api/_lib/chat.js'));
const TM = chat.__thinkMore;

function token(u) { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 600000 })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); }
const sse = (evs) => new Response(evs.map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const start = () => ({ type: 'message_start', message: { model: 'claude-x', usage: { input_tokens: 10, output_tokens: 0 } } });
const textR = (text, reason, details) => sse([start(), { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }, { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: Object.assign({ stop_reason: reason || 'end_turn' }, details ? { stop_details: details } : {}), usage: { output_tokens: 5 } }]);
const REFUSE = { type: 'refusal', category: 'reasoning_extraction' };
const isUp = (u) => /api\.anthropic\.com|openrouter\.ai\/api\/v1\/messages/.test(u);

async function run(user, text, script, history) {
  usageUser = user;
  const calls = [], out = [];
  const save = global.fetch; let n = 0;
  global.fetch = async (url, init) => {
    const u = String(url); if (!isUp(u)) return new Response('{}', { status: 404 });
    let b = null; try { b = JSON.parse(init.body); } catch (e) { b = null; }
    calls.push(b); return script[Math.min(n++, script.length - 1)]();
  };
  const req = { method: 'POST', headers: {}, body: { token: token(user), provider: 'claude', model: 'claude-fable-5-1', messages: (history || []).concat([{ role: 'user', content: text }]) } };
  const res = { setHeader() {}, status() { return this; }, json(v) { out.push(JSON.stringify(v)); return this; }, write(c) { out.push(String(c)); return true; }, end() {}, flushHeaders() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  const events = out.join('').split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return {}; } });
  // نصّ المستخدم قبل ذيل الدور الذي يلحقه الخادم (\n\n[سياق هذا الدور من النظام…])
  const lastUser = (b) => { const m = b.messages.filter((x) => x.role === 'user').pop(); const t = typeof m.content === 'string' ? m.content : m.content.filter((x) => x.type === 'text').map((x) => x.text).join('\n'); return t.split('\n\n')[0]; };
  return { calls, events, text: events.map((e) => e.delta || '').join(''), stop: events.find((e) => e.ownerStop && e.error), sent: calls.map(lastUser), statuses: events.map((e) => e.status || '').filter(Boolean) };
}

test('١. المالك «فكر لمدة الوقت»: تصل الموديل «بدقّة ومراجعة» بجهد max — بلا رفض ولا نداء ثانٍ', async () => {
  const r = await run('omran', 'لا الكتابة الي فوق المحادثة فكر لمدة الوقت', [() => textR('تمام، الكتابة فوق المحادثة هي شارة التفكير.')]);
  assert.equal(r.calls.length, 1);
  assert.equal(r.sent[0], 'لا الكتابة الي فوق المحادثة بدقّة ومراجعة', 'العبارة أُبدلت في النسخة المرسَلة');
  assert.deepEqual(r.calls[0].output_config, { effort: 'max' }, 'الجهد الأعلى بدل «فكّر أكثر»');
  assert.equal(r.stop, undefined);
  assert.match(r.text, /شارة التفكير/);
});

test('٢. غير المالك: رسالته كما هي بلا جهد', async () => {
  const r = await run('vipuser', 'فكّر أكثر وجاوبني', [() => textR('تمام')]);
  assert.equal(r.sent[0], 'فكّر أكثر وجاوبني');
  assert.equal(r.calls[0].output_config, undefined);
});

test('٣. رفض reasoning_extraction ورسالة فيها كلمة تفكير بصيغة أخرى: إعادة واحدة بلا الكلمة وبجهد max وسطر حالة، والجواب يصل', async () => {
  const r = await run('omran', 'تفكيرك وش كان قبل الجواب؟', [() => textR('', 'refusal', REFUSE), () => textR('الجواب: الشارة تعرض مدّة المعالجة.')]);
  assert.equal(r.calls.length, 2, 'إعادة واحدة');
  assert.equal(r.sent[0], 'تفكيرك وش كان قبل الجواب؟');
  assert.equal(r.sent[1], 'بدقّة وش كان قبل الجواب؟');
  assert.deepEqual(r.calls[1].output_config, { effort: 'max' });
  assert.ok(r.statuses.some((s) => /رُفض كطلب كشف تفكير — أعيد الصياغة/.test(s)));
  assert.equal(r.stop, undefined);
  assert.match(r.text, /الجواب: الشارة/);
});

test('٤. رفض بالفئة نفسها بلا كلمة تُزال: إعادة واحدة بلا كتل التفكير ولا عرضها (v-refusal-retry)، وإن رُفضت فالسبب بالعربيّة كما كان (v-refusal-why)', async () => {
  // v-refusal-retry (لقطة المالك ١٥ أكتوبر «رسم صور الستائر وارفعها» ← reasoning_extraction): كانت «لا إعادة بلا سبب» فيقف الطلب البريء
  const r = await run('omran', 'اشرح لي الشارة اللي فوق المحادثة', [() => textR('', 'refusal', REFUSE), () => textR('ما يجب')]);
  assert.equal(r.calls.length, 2, 'إعادة واحدة');
  assert.equal(r.sent[1], 'اشرح لي الشارة اللي فوق المحادثة', 'رسالته كما هي');
  assert.ok(!(r.calls[1].thinking && r.calls[1].thinking.display), 'الإعادة بلا عرض التفكير');
  assert.ok(r.statuses.some((x) => /رفض المزوّد الدور كطلب كشف تفكير — أعيده مرّة بلا عرض التفكير/.test(x)), 'سطر حالة');
  assert.equal(r.stop, undefined);
  assert.match(r.text, /ما يجب/);
  const r0 = await run('omran', 'اشرح لي الشارة اللي فوق المحادثة', [() => textR('', 'refusal', REFUSE), () => textR('', 'refusal', REFUSE), () => textR('x')]);
  assert.equal(r0.calls.length, 2, 'مرّة واحدة لا أكثر');
  assert.match(r0.stop.error, /رفض المزوّد الطلب \(reasoning_extraction — فُهم السؤال طلبًا لكشف تفكيره الداخليّ/);
  // وإن رُفضت الإعادة أيضًا: مرّة واحدة ثمّ السبب
  const r2 = await run('omran', 'فكر فيها زين ثمّ قل لي تفكيرك', [() => textR('', 'refusal', REFUSE), () => textR('', 'refusal', REFUSE), () => textR('x')]);
  assert.equal(r2.calls.length, 2, 'الأولى بعد التبديل الاستباقيّ، والثانية بعد إزالة «تفكيرك» — ثمّ لا ثالثة');
  assert.equal(r2.sent[0], 'بدقّة ومراجعة زين ثمّ قل لي تفكيرك');
  assert.equal(r2.sent[1], 'بدقّة ومراجعة زين ثمّ قل لي بدقّة');
  assert.match(r2.stop.error, /reasoning_extraction/);
});

test('٥. الوحدة: ما يُبدَّل وما لا يُبدَّل', () => {
  const more = (t) => { const c = [{ role: 'user', content: t }]; return TM.rewriteLastUser(c, TM.THINK_MORE_RE, 'بدقّة ومراجعة') ? c[0].content : null; };
  assert.equal(more('فكّر أكثر في الجواب'), 'بدقّة ومراجعة في الجواب');
  assert.equal(more('خذ وقتك وجاوب'), 'بدقّة ومراجعة وجاوب');
  assert.equal(more('فكر فيها زين'), 'بدقّة ومراجعة زين');
  assert.equal(more('عطني فكرة لمشروع'), null, '«فكرة» ليست «فكّر»');
  assert.equal(more('اشرح لي الدرس'), null);
  const word = (t) => { const c = [{ role: 'user', content: t }]; return TM.rewriteLastUser(c, TM.THINK_WORD_RE, 'بدقّة') ? c[0].content : null; };
  assert.equal(word('وش رأيك بالتفكير'), 'وش رأيك بدقّة');
  assert.equal(word('عطني فكرة لمشروع'), null);
  // كتلة نصّ داخل محتوى مركّب (صورة + نصّ)
  const c = [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AA' } }, { type: 'text', text: 'فكر لمدة أطول وش في الصورة' }] }];
  assert.equal(TM.rewriteLastUser(c, TM.THINK_MORE_RE, 'بدقّة ومراجعة'), true);
  assert.equal(c[0].content[1].text, 'بدقّة ومراجعة وش في الصورة');
  assert.equal(c[0].content[0].type, 'image', 'الصورة كما هي');
});

test('٦. v-refusal-retry (١): ملاحظات الرفض الملصقة في ردود سابقة لا تصل المزوّد — نصّ الردّ قبلها يبقى', async () => {
  const note = '\n\n⚠️ رفض المزوّد الطلب (reasoning_extraction — فُهم السؤال طلبًا لكشف تفكيره الداخليّ — اسأل عن الجواب لا عمّا فكّر فيه) — This request was blocked as it seems to violate Anthropic\'s Terms of Service';
  const history = [{ role: 'user', content: 'وين صور الستائر؟' }, { role: 'assistant', content: 'المجلد ما فيه curtains-*.' + note }, { role: 'user', content: 'طيب' }, { role: 'assistant', content: note.trim() }];
  const r = await run('omran', 'ارسم صور الستائر وارفعها', [() => textR('تمام')], history);
  const body = JSON.stringify(r.calls[0].messages);
  assert.ok(!/رفض المزوّد الطلب|This request was blocked/.test(body), 'لا ملاحظة رفض في التاريخ المرسَل');
  assert.ok(body.includes('المجلد ما فيه curtains-*.'), 'كلام الردّ نفسه باقٍ');
  const OL = require(rp('api/_lib/owner-loop.js'));
  const c = [{ role: 'assistant', content: [{ type: 'text', text: 'جواب' + note }] }, { role: 'user', content: 'x' + note }];
  assert.equal(OL.scrubRefusals(c), 1);
  assert.equal(c[0].content[0].text, 'جواب');
  assert.ok(c[1].content.includes('رفض المزوّد'), 'رسائل المستخدم لا تُمسّ');
  // غير المالك: تاريخه كما هو حرفيًّا
  const g = await run('vipuser', 'سؤال', [() => textR('تمام')], history);
  assert.ok(JSON.stringify(g.calls[0].messages).includes('رفض المزوّد الطلب'), 'غير المالك كما كان');
});
