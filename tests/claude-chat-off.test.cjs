/* v-claude-chat-off (المالك ١٧ أكتوبر «اريد ان الغيه… الي يرد ملاين الدولارات»): ردّ Claude في محادثة المالك يُحوَّل لكروك
   حتّى OWNER_CLAUDE_CHAT=on، وصفّ Claude يختفي من منتقي المالك، والقائمة لا تبقى فارغة بعد الدخول بلا تحديث. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const chat = read('api/_lib/chat.js');
assert.ok(/__claudeOff = \(!__reqRaw \|\| __reqRaw === 'claude'\)/.test(chat), 'التحويل يخصّ طلب Claude أو الطلب بلا مزوّد');
assert.ok(chat.includes("process.env.OWNER_CLAUDE_CHAT || '').trim().toLowerCase() !== 'on'"), 'مفتاح الإرجاع OWNER_CLAUDE_CHAT=on');
assert.ok(chat.includes('!!process.env.OPENROUTER_API_KEY'), 'بلا مفتاح الوسيط لا تحويل (لا يُترك المالك بلا ردّ)');
assert.ok(chat.includes("isOwnerName(token ? require('./auth.js').verifyToken(token) : null)"), 'للمالك وحده');
assert.ok(chat.includes("const reqProv = __claudeOff ? 'openrouter' : __reqRaw;"), 'reqProv نفسه يتحوّل فلا يصير __ownerNoRoute');
assert.ok(chat.includes("if (__claudeOff && body && typeof body === 'object') body.model = '';"), 'موديل Claude المختار يُهمل');
assert.ok(chat.indexOf('__claudeOff = ') < chat.indexOf("let prov = Object.prototype.hasOwnProperty.call(OR_MODELS, reqProv)"), 'التحويل قبل اختيار المزوّد');

const modes = read('js/modes.js');
assert.ok(modes.includes('var CLAUDE_OFF = true;'), 'Claude موقوف في المنتقي');
assert.ok(modes.includes('if(CLAUDE_OFF){ var cx = pop.querySelectorAll(') && modes.includes('.omProvHead[data-prov="claude"], .omProvModels[data-for="claude"]') && modes.includes('cx[ci].remove();'), 'لا صفّ Claude في القائمة');
assert.ok(modes.includes("if(CLAUDE_OFF && isOwner()){ try{ if(localStorage.getItem('aiapp_provider') === 'claude') localStorage.setItem('aiapp_provider', 'openrouter');"), 'اختيار Claude القديم يصير كروك');
assert.ok(modes.includes('if(!showing && !pop.firstChild && isOwner()) renderPop();'), 'القائمة تُبنى عند الفتح إن كانت فارغة (دخول بعد التحميل)');
console.log('claude-chat-off: ok');
