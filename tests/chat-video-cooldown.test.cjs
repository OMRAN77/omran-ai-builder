'use strict';
// tests/chat-video-cooldown.test.cjs — v-chat-video-cooldown
// العرض: مشترك Max (٣٧٥) كتب «اكتب حياتي و قلب لون ابيض في الفيديو» بعد فيديو في المحادثة نفسها، فجاءت فقاعة
// «⚠️ video_cooldown» وحدها. مسار الفيديو المباشر في المحادثة (__wantsVideo، app-09) يرمي error الخادم نصًّا خامًا
// (throw new Error(__verr)) فيعرضه '⚠️ ' + __friendlyErr(e)، ويعيد الطلب بعد ٦ث على مهلة الثلاث دقائق (إعادة عمياء
// أوقفها v-video-refund في صانع الفيديو). الترجمة القائمة (ui.cooldown بالـ14 لغة) في الترندات وحدها.
// القرار: النصّ المترجم نفسه بالدقائق المتبقّية (retryAfter)، بلا إعادة على المهلة، وأداة generate_video للنموذج كذلك؛
// ونفاد النقاط بنصّ الباقات القائم، وإلغاء تأكيد النقاط بسطر vidCancelled (١٤ لغة) بلا تأكيد ثانٍ (كان «⚠️ HTTP 428» بعد سؤالين).
// الاختبار: كتلة المسار بنصّها من __sendPromptCore و__friendlyErr في vm — تفشل قبل الإصلاح وتنجح بعده.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const SRC = read('js/app-09-attach.js');
const block = (src, head, end) => { const i = src.indexOf(head); assert.ok(i >= 0, 'مفقود: ' + head); const j = src.indexOf(end, i); assert.ok(j > i, 'نهاية مفقودة: ' + head); return src.slice(i, j + end.length); };

const TD = { window: {} };
vm.runInNewContext(read('js/app-11-video-trends-data.js'), TD);
const TRENDS = TD.window.__VIDEO_TRENDS;
const COOL = TRENDS.ui.cooldown;
const coolText = (lg, m) => COOL[lg].replace('⏳', '').trim().replace('{m}', String(m));

const VIDEO_BLOCK = block(SRC, "    if(__wantsVideo){\n      chatPhase('🎬'", "      cur.lastMsgWasImageEdit = false;\n      renderAll(); saveState();\n      return;\n    }");
const FRIENDLY = block(SRC, 'function __friendlyErr(e){', '\n}\n');
const HELPER = (SRC.includes('function omranVideoCodeText(') ? block(SRC, 'function omranVideoCodeText(', '\n}\n') : '')
  + '\n' + block(SRC, 'function omranAttachT(', '\n}\n'); // v-audit-attach: نصوص الفيديو بمفتاح الـ١٤ لغة عبر هذا المساعد

async function chatVideo(reply, lg, extra) {
  const calls = [];
  const bodies = []; // ما أُرسل في كلّ محاولة (confirmed) — reply مصفوفة = ردّ لكلّ محاولة
  const sb = {
    lang: lg || 'ar', text: 'اكتب حياتي و قلب لون ابيض في الفيديو', localStorage: { getItem: () => lg || 'ar' },
    cur: { messages: [] }, thinkingDiv: null, __vidSrc: null, __srcImg: null, __animateRe: /(?!)/, __wantsVideo: true,
    __runCtl: { signal: { aborted: false } }, chatPhase() {}, renderAll() {}, saveState() {}, authGet: () => 'tok', __swallow() {},
    setTimeout: (fn) => fn(), // إعادة المحاولة القائمة بلا انتظار ٦ث
    postWithConfirm: async (url, body) => { calls.push(url); bodies.push(Object.assign({}, body)); const rp = Array.isArray(reply) ? reply[Math.min(bodies.length - 1, reply.length - 1)] : reply; return Object.assign({ ok: rp.status === 200, status: rp.status, json: async () => rp.body }, rp.approved ? { __omApproved: true } : {}); }, // approved = رأى المستخدم السعر ووافق (postWithConfirm يعلّم ردّه)
  };
  sb.window = sb; sb.__VIDEO_TRENDS = TRENDS; Object.assign(sb, extra || {});
  vm.runInNewContext(HELPER + '\n' + FRIENDLY + '\nthis.go = async function(){\n' + VIDEO_BLOCK + '\n};', sb);
  await sb.go();
  return { calls, bodies, msg: sb.cur.messages[sb.cur.messages.length - 1] };
}

test('١. «⚠️ video_cooldown» الخام صار نصّ المهلة المترجم بالدقائق المتبقّية، وطلب واحد لا إعادة عمياء', async () => {
  const r = await chatVideo({ status: 429, body: { error: 'video_cooldown', retryAfter: 150 } });
  assert.equal(r.msg.role, 'assistant');
  assert.ok(!/video_cooldown/.test(r.msg.content), 'الرمز الخامّ ظهر: ' + r.msg.content);
  assert.equal(r.msg.content, '⚠️ ' + coolText('ar', 3));
  assert.equal(r.calls.length, 1, 'المهلة ثابتة ١٨٠ث — إعادة بعد ٦ث ترجع الرمز نفسه (v-video-refund)');
  assert.equal((await chatVideo({ status: 429, body: { error: 'video_cooldown', retryAfter: 40 } })).msg.content, '⚠️ ' + coolText('ar', 1));
  assert.equal((await chatVideo({ status: 429, body: { error: 'video_cooldown' } })).msg.content, '⚠️ ' + coolText('ar', 3), 'بلا retryAfter = المهلة كاملة');
});

test('٢. بلغة المستخدم (النصّ القائم بالـ14 لغة، لا نصّ جديد)', async () => {
  for (const lg of ['en', 'fr', 'ur', 'zh']) {
    const r = await chatVideo({ status: 429, body: { error: 'video_cooldown', retryAfter: 170 } }, lg);
    assert.equal(r.msg.content, '⚠️ ' + coolText(lg, 3), lg);
  }
});

test('٣. ما سوى المهلة كما كان: حدّ اليوم برسالته، والعطل العابر يُعاد مرّة', async () => {
  const d = await chatVideo({ status: 429, body: { error: 'daily_limit_reached' } });
  assert.equal(d.msg.content, '⚠️ وصلت حد الفيديوهات اليومي، جرّب بكرة.');
  assert.equal(d.calls.length, 1);
  const t = await chatVideo({ status: 502, body: { error: 'boom', retryable: true } });
  assert.equal(t.msg.content, '⚠️ boom');
  assert.equal(t.calls.length, 2);
});

test('٤. أداة generate_video (المحادثة بالأدوات): النموذج يقرأ المهلة بالدقائق لا الرمز الخامّ', async () => {
  const sb = { authGet: () => 'tok', localStorage: { getItem: () => null }, console, lang: 'ar' };
  sb.window = sb; sb.__VIDEO_TRENDS = TRENDS;
  sb.postWithConfirm = async () => ({ ok: false, status: 429, json: async () => ({ error: 'video_cooldown', retryAfter: 100 }) });
  vm.runInNewContext(HELPER + '\n' + read('js/app-17-agent-tools.js'), sb);
  const out = await sb.omranAgentTools.run('generate_video', { prompt: 'قلب أبيض', ratio: 'portrait' }, { imgs: {}, chat: null, ref: null, userText: '' });
  assert.ok(!/video_cooldown/.test(out), out);
  assert.equal(out, 'تعذّر بدء الفيديو: ' + coolText('ar', 2));
});

test('٥. نفاد النقاط بنصّ الباقات القائم، وإلغاء تأكيد النقاط بسطر «أُلغي — لم تُخصم نقاط» بلا سؤال ثانٍ', async () => {
  const I18N = { plansWhyPoints: 'نقاطك خلصت — اشحن من الباقات وكمّل مباشرة.' };
  const p = await chatVideo({ status: 402, body: { error: 'points_insufficient', points: 3, needed: 55 } }, 'ar', { t: (k) => I18N[k] || k });
  assert.equal(p.msg.content, '⚠️ ' + I18N.plansWhyPoints);
  assert.equal(p.calls.length, 1, 'لا إعادة على نفاد النقاط');
  // postWithConfirm يرجع ردّ 428 نفسه حين يضغط المستخدم «إلغاء» — جسمه مقروء فيصير الخطأ 'HTTP 428'
  /* مراجعة النقض: بلا ردّ يدفع finally فقاعة «🔧 تشخيص الرد الغائب» لكلّ المستخدمين — فسطر قصير بلغته، بلا ⚠️ */
  const c = await chatVideo({ status: 428, body: undefined }, 'ar', { t: (k) => ({ vidCancelled: 'أُلغي إنشاء الفيديو — لم تُخصم أيّ نقاط.' })[k] || k });
  assert.deepEqual({ role: c.msg.role, content: c.msg.content }, { role: 'assistant', content: 'أُلغي إنشاء الفيديو — لم تُخصم أيّ نقاط.' }, 'لا «⚠️ HTTP 428» ولا فقاعة تشخيص');
  assert.equal(c.calls.length, 1, 'لا تأكيد ثانٍ بعد ٦ ث');
});

test('٦. مراجعة باب المال ٢: الإعادة بعد عطل عابر بالموافقة نفسها (لا نافذة سعر ثانية)، والرفض الدائم (retryable:false) لا يُعاد', async () => {
  const t = await chatVideo([{ status: 502, body: { error: 'تعذّر بدء الفيديو مؤقتًا — أعد المحاولة بعد لحظات.', retryable: true }, approved: true }, { status: 502, body: { error: 'x', retryable: true } }]);
  assert.equal(t.calls.length, 2);
  assert.notEqual(t.bodies[0].confirmed, true, 'الأولى تسأل');
  assert.equal(t.bodies[1].confirmed, true, 'الإعادة تحمل الموافقة فلا 428 ثانية');
  /* v-lock-chatvid (cli-chat-attach-5): فشل قبل سؤال السعر (لم يرَ المستخدم سعرًا) = الإعادة بلا confirmed فيسأل الخادم — كانت تخصم بلا موافقة */
  const u = await chatVideo([{ status: 502, body: { error: 'x', retryable: true } }, { status: 502, body: { error: 'x', retryable: true } }]);
  assert.equal(u.calls.length, 2);
  assert.notEqual(u.bodies[1].confirmed, true, 'إعادة بلا موافقة حملت confirmed:true');
  const bad = await chatVideo({ status: 400, body: { error: 'تعذّر بدء الفيديو بهذا الطلب — غيّر الوصف أو الصورة وأعد المحاولة.', retryable: false } });
  assert.equal(bad.calls.length, 1, 'لا إعادة عمياء لطلب مرفوض');
  assert.match(bad.msg.content, /غيّر الوصف أو الصورة/);
});
