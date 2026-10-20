/* v-claude-chat-off (المالك ١٧ أكتوبر «اريد ان الغيه… الي يرد ملاين الدولارات»): ردّ Claude في محادثة المالك يُحوَّل لكروك
   حتّى OWNER_CLAUDE_CHAT=on، والقائمة لا تبقى فارغة بعد الدخول بلا تحديث.
   v-claude-back («خلهم مكانهم… رجعهم نفس ماكانو»): صفوف Claude باقية في المنتقي — الإيقاف في الخادم وحده.
   v-agent-claude-off («والوكيل بعد»): الوكيل موقوف للمالك قبل أيّ حصّة أو نداء نموذج حتّى OWNER_AGENT_CLAUDE=on. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const chat = read('api/_lib/chat.js');
assert.ok(/__claudeOff = \(!__reqRaw \|\| __reqRaw === 'claude'\)/.test(chat), 'التحويل يخصّ طلب Claude أو الطلب بلا مزوّد');
assert.ok(chat.includes("process.env.OWNER_CLAUDE_CHAT || '').trim().toLowerCase() === 'off'"), 'v-owner-claude-pick: Claude المالك باختياره؛ التحويل لكروك بمفتاح الطوارئ OWNER_CLAUDE_CHAT=off وحده');
assert.ok(chat.includes('!!process.env.OPENROUTER_API_KEY'), 'بلا مفتاح الوسيط لا تحويل (لا يُترك المالك بلا ردّ)');
assert.ok(chat.includes("isOwnerName(token ? require('./auth.js').verifyToken(token) : null)"), 'للمالك وحده');
assert.ok(chat.includes("const reqProv = __claudeOff ? 'openrouter' : __reqRaw;"), 'reqProv نفسه يتحوّل فلا يصير __ownerNoRoute');
assert.ok(chat.includes("if (__claudeOff && body && typeof body === 'object') body.model = '';"), 'موديل Claude المختار يُهمل');
assert.ok(chat.indexOf('__claudeOff = ') < chat.indexOf("let prov = Object.prototype.hasOwnProperty.call(OR_MODELS, reqProv)"), 'التحويل قبل اختيار المزوّد');

const modes = read('js/modes.js');
assert.ok(!modes.includes('CLAUDE_OFF'), 'لا إخفاء لـClaude في المنتقي — باقٍ مكانه');
assert.ok(!/\.omProvHead\[data-prov="claude"\]/.test(modes), 'صفّ Claude لا يُحذف');
assert.ok(!modes.includes("localStorage.setItem('aiapp_provider', 'openrouter')"), 'اختيار Claude المحفوظ لا يُبدَّل');
assert.ok(modes.includes('if(!showing && !pop.firstChild && isOwner()) renderPop();'), 'القائمة تُبنى عند الفتح إن كانت فارغة (دخول بعد التحميل)');

// الوكيل: تشغيل حقيقيّ للمعالج — المالك بلا OWNER_AGENT_CLAUDE يأخذ رسالة الإيقاف ولا نداء شبكة
process.env.AUTH_SECRET = 'claude-chat-off-test-secret-' + 'z'.repeat(24);
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
delete process.env.OWNER_AGENT_CLAUDE;
let fetched = 0;
global.fetch = async () => { fetched++; throw new Error('لا شبكة في هذا الاختبار'); };
const auth = require(path.join(root, 'api/_lib/auth.js'));
const agent = require(path.join(root, 'api/_lib/agent.js'));
function hit(body) {
  return new Promise((resolve) => {
    const out = { status: 0, headers: {}, chunks: [] };
    const res = {
      status(c) { out.status = c; return this; }, setHeader(k, v) { out.headers[k.toLowerCase()] = v; },
      json(o) { out.json = o; resolve(out); }, write(s) { out.chunks.push(String(s)); return true; },
      end() { resolve(out); }, flushHeaders() {},
    };
    Promise.resolve(agent({ method: 'POST', headers: {}, body }, res)).catch((e) => { out.err = e; resolve(out); });
  });
}
(async () => {
  const r = await hit({ messages: [{ role: 'user', content: 'سوّ صفحة' }], token: auth.makeToken('omran') });
  assert.equal(r.status, 200, 'ردّ عاديّ لا خطأ');
  assert.match(r.headers['content-type'] || '', /text\/event-stream/);
  const txt = r.chunks.join('');
  assert.ok(txt.includes('"delta"') && txt.includes('الوكيل موقوف') && txt.includes('OWNER_AGENT_CLAUDE=on'), 'رسالة الإيقاف تصل كنصّ');
  assert.equal(fetched, 0, 'لا نداء لـAnthropic ولا لغيره');
  const g = await hit({ messages: [{ role: 'user', content: 'x' }], token: auth.makeToken('someone') });
  assert.equal(g.status, 403, 'غير المالك كما كان (owner_only)');
  console.log('claude-chat-off: ok');
})().catch((e) => { console.error(e); process.exit(1); });
