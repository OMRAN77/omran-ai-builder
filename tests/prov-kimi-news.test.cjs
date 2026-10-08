// tests/prov-kimi-news.test.cjs — أوامر المالك ٣ أكتوبر (لقطتان: قائمة المزوّدين، ونافذة «🚨 تحذير طارئ» وزرّها لا يعمل):
// «اصلحها، وأضف kimi مزوّدًا جديدًا المفتاح موجود، ورتّب مزوّدي المحادثة ونظّمهم صح، وشيل موضوع الأخبار الزرّ لا يعمل».
// v-agent-nocode: «لم يصل كود من المزوّد» لا يُلصق بشرح إصلاح فيه مقتطف ```js — لصفحة تطبيق ضاعت وحدها.
// v-kimi: Kimi على مسار Moonshot المباشر بمفتاح المالك (KIMI_API_KEY أو MOONSHOT_API_KEY) مع الأدوات، والوسيط احتياطه.
// v-prov-order: ثلاث مجموعات بخطّ بينها وأسماء بصيغة واحدة؛ وإغلاق الإعدادات لا يعيد اختيار المالك إلى GPT.
// v-news-off: لا نافذة طوارئ ولا شريط أخبار ولا مفتاح ولا دفع ولا مسار — والتذكيرات باقية.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('١. الوكيل: التحذير لصفحة تطبيق بدأت ولم تصل، لا لمقتطف كود في شرح', () => {
  const src = read('js/app-09-attach.js');
  const m = src.match(/if\((\/[^\n]+\/i)\.test\(full \|\| ''\)\)\{\n\s+chatText = \(chatText \? chatText \+ '\\n\\n' : ''\) \+ t\('buildNoCode'\);/);
  assert.ok(m, 'شرط التحذير في مسار الوكيل');
  const re = vm.runInNewContext(m[1]);
  assert.equal(re.test('سأقرأ الكود ثمّ أسلّم الإصلاح:\n```js\nconst x = 1;\n```'), false, 'شرح بمقتطف js');
  assert.equal(re.test('افتح `api/_lib/tier.js` واستبدل </div> بـ…'), false, 'وسم داخل شرح');
  assert.equal(re.test('```html\n<div>'), true, 'صفحة بدأت ولم تكتمل');
  assert.equal(re.test('<!DOCTYPE html><html>'), true);
});

test('٢. Kimi على الخادم: المسار المباشر بأيّ من الاسمين، والموديل بمعرّف Moonshot، وغيابه = لا مسار مباشر', () => {
  const oa = require('../api/_lib/oa-direct.js');
  assert.deepEqual(oa.directRoute('kimi', { MOONSHOT_API_KEY: 'm1' }), { prov: 'kimi', url: 'https://api.moonshot.ai/v1/chat/completions', key: 'm1', label: 'Kimi' });
  assert.equal(oa.directRoute('kimi', { KIMI_API_KEY: 'k1', MOONSHOT_API_KEY: 'm1' }).key, 'k1', 'KIMI_API_KEY أوّلًا');
  assert.equal(oa.directRoute('kimi', {}), null);
  assert.deepEqual(oa.directModel('kimi', '', {}), { model: 'kimi-k3', picked: false, def: 'kimi-k3' });
  assert.deepEqual(oa.directModel('kimi', 'kimi-k2.6', {}), { model: 'kimi-k2.6', picked: true, def: 'kimi-k3' });
  assert.equal(oa.directModel('kimi', 'moonshotai/kimi-k3', {}).model, 'kimi-k3', 'بادئة الوسيط تُقصّ');
  assert.equal(oa.directModel('kimi', 'gpt-6-sol', {}).picked, false, 'معرّف غريب = الافتراضيّ');
  assert.equal(oa.directModel('kimi', '', { CHAT_KIMI_MODEL: 'kimi-k2.6' }).model, 'kimi-k2.6');
  const chat = read('api/_lib/chat.js');
  assert.match(chat, /kimi: 'moonshotai\/kimi-k2', \/\/ v-kimi/);
  assert.match(chat, /prov === 'groq' \|\| prov === 'openai' \|\| prov === 'kimi'/);
});

test('٣. Kimi من الطرف إلى الطرف: طلب المالك يصل Moonshot بمفتاحه وبالأدوات، والردّ يُبثّ', async () => {
  process.env.AUTH_SECRET = 'kimi-secret';
  for (const k of ['OPENROUTER_API_KEY', 'KIMI_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY']) delete process.env[k];
  process.env.ANTHROPIC_API_KEY = 'anth-test';
  process.env.MOONSHOT_API_KEY = 'moon-test';
  const rp = (f) => require.resolve(path.join(root, f));
  const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
  stub('api/_lib/kv.js', { kvGetJSON: async () => null, kvPutJSON: async () => {}, kvDel: async () => {}, kvExpire: async () => {}, kvIncr: async () => 1, kvSetIfAbsent: async () => true, kvGetRaw: async () => null, kvSetRaw: async () => {} });
  stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '1.1.1.1', checkAndConsume: async () => ({ allowed: true, username: 'omran', remaining: Infinity }), checkAndConsumeCustom: async () => ({ allowed: true, remaining: Infinity }) });
  stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
  stub('api/_lib/search.js', { fetchPlaces: async () => [], isPlacesAsk: () => false, regionOf: () => '' });
  const chat = require(rp('api/_lib/chat.js'));
  const p = Buffer.from(JSON.stringify({ u: 'omran', exp: Date.now() + 60000 })).toString('base64url');
  const token = p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
  const calls = [];
  const saved = global.fetch;
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init, body: init && init.body ? JSON.parse(init.body) : null });
    if (/api\.moonshot\.ai/.test(String(url))) {
      return new Response('data: ' + JSON.stringify({ model: 'kimi-k3', choices: [{ delta: { content: 'هلا من كيمي' } }] }) + '\n\n'
        + 'data: ' + JSON.stringify({ model: 'kimi-k3', choices: [{ delta: {}, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n', { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };
  let out = '';
  const res = { setHeader() {}, status() { return this; }, json(v) { out += JSON.stringify(v); }, write(c) { out += String(c || ''); }, end() {}, flush() {} };
  try { await chat({ method: 'POST', headers: {}, body: { provider: 'kimi', model: 'kimi-k3', token, messages: [{ role: 'user', content: 'هلا' }] } }, res); }
  finally { global.fetch = saved; delete process.env.MOONSHOT_API_KEY; }
  const k = calls.find((c) => /api\.moonshot\.ai\/v1\/chat\/completions/.test(c.url));
  assert.ok(k, 'نداء Moonshot: ' + calls.map((c) => c.url).join(','));
  assert.equal(k.init.headers.Authorization, 'Bearer moon-test');
  assert.equal(k.body.model, 'kimi-k3');
  assert.ok(Array.isArray(k.body.tools) && k.body.tools.some((t) => t.function && t.function.name === 'web_search'), 'بالأدوات');
  assert.ok(!calls.some((c) => /anthropic|openrouter/.test(c.url)), 'لا كلود ولا وسيط');
  assert.match(out, /"delta":"هلا من كيمي"/);
});

test('٤. القائمة: ثلاث مجموعات مرتّبة بخطّ بينها، Kimi فيها، وكلّ الأسماء بصيغة واحدة', () => {
  const m = read('js/modes.js');
  const i = m.indexOf('var PROVS = ['); const block = m.slice(i, m.indexOf('\n      ];', i));
  const rows = [...block.matchAll(/\{ grp:(\d), key:'(\w+)',\s+name:'([^']+)'/g)].map((x) => [Number(x[1]), x[2], x[3]]);
  // v-prov-or-unique: صفّ OpenRouter عاد بشركات ليس لها صفّ (اختبار ٧)
  assert.deepEqual(rows.map((r) => r[1]), ['claude', 'openai', 'gemini', 'kimi', 'deepseek', 'mistral', 'groq', 'perplexity', 'cohere', 'openrouter']);
  assert.deepEqual(rows.map((r) => r[0]), [1, 1, 1, 2, 2, 2, 2, 3, 3, 3]);
  assert.deepEqual(rows.slice(0, 4).map((r) => r[2]), ['Claude · Anthropic', 'GPT · OpenAI', 'Gemini · Google', 'Kimi · Moonshot']);
  assert.ok(!/كلود|جوجل جيميني/.test(block), 'لا أسماء معرّبة بين اللاتينيّة');
  assert.match(block, /key:'kimi',\s+name:'Kimi · Moonshot',\s+or:true, direct:true, store:'aiapp_kimi_model',\s+def:'kimi-k3',\s+models:\[\['kimi-k3','Kimi K3'\],\['kimi-k2\.6','Kimi K2\.6'\]\]/);
  assert.match(m, /if\(i && p\.grp !== PROVS\[i-1\]\.grp\) out \+= divider;/);
  assert.match(m, /kimi:'provNickDeep'/);
  assert.match(read('index.html'), /\/js\/modes\.js\?v=m041026b/);
});

test('٥. العميل: Kimi على مسار الأدوات وحده، باسمه للمالك، وإغلاق الإعدادات لا يمسح الاختيار', () => {
  const c = read('js/app-06-checkout.js');
  assert.match(c, /const TOOL_PROVIDERS = \[[^\]]*'kimi'\]/);
  assert.match(c, /if\(effective === 'kimi'\) throw new Error\('kimi: tools path only'\);\n\s+return await callOpenAILike/);
  assert.match(c, /if \(\$\('#provider'\)\.value\) localStorage\.setItem\('aiapp_provider', \$\('#provider'\)\.value\);/);
  const u = read('js/app-05-ui.js');
  assert.match(u, /openrouter: 'OpenRouter', kimi: 'Kimi', \/\/ v-kimi/);
  assert.match(u, /kimi: 'provNickDeep', \/\/ v-kimi/);
  const env = read('api/_lib/env.js');
  for (const k of ['KIMI_API_KEY', 'MOONSHOT_API_KEY', 'CHAT_KIMI_MODEL']) assert.match(env, new RegExp('\\b' + k + ':'));
});

test('٦. الأخبار أُزيلت كلّها: لا ملفّات ولا نافذة ولا قسم ولا مسار ولا دفع — والتذكيرات باقية', () => {
  for (const f of ['js/app-23-alerts.js', 'js/app-23-news-alerts.js', 'api/breaking-news.js']) assert.ok(!fs.existsSync(path.join(root, f)), f);
  const bundle = read('js/app.bundle.js');
  for (const s of ['/api/breaking-news', 'omranEmergencyModal', 'omranBreakingBanner', 'chkNewsAlerts']) assert.ok(!bundle.includes(s), 'الحزمة: ' + s);
  assert.ok(!read('js/partials-core.js').includes('omranEmergencyModal'));
  const st = read('js/partials-settings.js');
  assert.ok(!st.includes('id="notifSection"') && !st.includes('chkNewsAlerts'));
  assert.ok(!read('js/app-05-ui.js').match(/SETTINGS_NAV_IDS = \[[^\]]*notifSection/));
  const html = read('index.html');
  assert.ok(html.includes('/js/partials-core.js?v=654') && html.includes('/js/partials-settings.js?v=693'));
  const cr = read('api/_lib/check-reminders.js');
  assert.ok(!cr.includes('newsItems') && !cr.includes('breaking-news'));
  assert.match(cr, /if \(r\.type === 'news'\) \{\n[^\n]*\n\s+nextList\.push\(r\);\n\s+continue;\n\s+\}/, 'سجلّ الأخبار القديم يبقى كما هو بلا دفع');
  assert.match(cr, /title: 'مها',/, 'تذكيرات مها باقية');
});

/* v-prov-dedupe (لقطة المالك ٣ أكتوبر «المزودين متكررين فوق وتحت، قلتلك رتب»): صفّ OpenRouter كان يفتح سبعة موديلات كلّها
   موجودة فوق تحت شركتها (Opus/Sonnet، GPT، Gemini Flash، DeepSeek، Mistral، Llama). يُقيَّم مصفوفة PROVS الحقيقيّة نفسها. */
test('٧. لا موديل يظهر تحت صفّين، ولا صفّ وسيط يكرّر الشركات', () => {
  const m = read('js/modes.js');
  const i = m.indexOf('var PROVS = ['); const src = m.slice(i, m.indexOf('\n      ];', i) + 9);
  const PROVS = new Function(src + '\nreturn PROVS;')();
  // الاسم المعروض بلا اسم الشركة («Claude Opus 5.5» = «Opus 5.5»)، والمعرّف بلا بادئة الوسيط ولا فرق النقطة والشرطة.
  const norm = (s) => String(s).toLowerCase().replace(/^[a-z0-9-]+\//, '').replace(/^(claude|gpt|gemini|deepseek|mistral|llama|kimi)[\s-]+(?=\S)/, '').replace(/[.\s_-]+/g, '');
  const seen = new Map();
  for (const p of PROVS) for (const [id, label] of p.models) {
    for (const k of [norm(id), norm(label)]) {
      assert.ok(!seen.has(k) || seen.get(k) === p.key, `«${label}» تحت ${p.key} وتحت ${seen.get(k)}`);
      seen.set(k, p.key);
    }
  }
  // v-prov-or-unique («في واحد ناقص»): الصفّ باقٍ، وموديلاته من شركات ليس لها صفّ — لا Claude ولا GPT ولا Llama عبر الوسيط.
  assert.equal(PROVS.length, 10);
  const or = PROVS.find((p) => p.key === 'openrouter');
  assert.ok(or && or.or === true && or.models.length >= 2, 'صفّ الوسيط موجود وفيه موديلات');
  const OWN = /^(anthropic|openai|google|moonshotai|deepseek|mistralai|meta-llama|perplexity|cohere)\//;
  for (const [id] of or.models) assert.ok(!OWN.test(id), id + ': شركته لها صفّ فوق');
  assert.ok(or.models.some((x) => x[0] === or.def), 'الافتراضيّ من القائمة نفسها');
  // واختيار قديم مكرّر محفوظ (Claude عبر الوسيط) لا يبقى مرسَلًا خفيًّا: الافتراضيّ بدله
  assert.match(m, /if\(pv\.key === 'openrouter' && v && !pv\.models\.some\(function\(m\)\{ return m\[0\] === v; \}\)\) v = '';/);
});

/* v-owner-bar-hide (المالك ٣ أكتوبر «هذي فقط للمالك، شيلها من المستخدمين»): modes.js يخفي شريط المزوّد لغير المالك بـ
   style.display='none'، لكنّ قاعدتين في redesign.css فرضتا display:flex !important — و!important في ورقة الأنماط يغلب
   الأسلوب المضمّن العاديّ، فرأى كلّ مستخدم «العميق ⌄» وقائمة فارغة. الإظهار والإخفاء للسكربت وحده. */
test('٨. شريط المزوّد للمالك وحده: لا قاعدة CSS تفرض ظهوره فوق إخفاء السكربت', () => {
  const css = ['css/redesign.css', 'css/modules.css'].filter((f) => fs.existsSync(path.join(root, f))).map((f) => read(f)).join('\n');
  const rules = [...css.matchAll(/([^{}]*#omBottomBar[^{}]*)\{([^}]*)\}/g)];
  assert.ok(rules.length >= 3, 'قواعد التخطيط باقية');
  for (const r of rules) assert.ok(!/(^|[;\s])display\s*:/.test(r[2]), 'لا display في: ' + r[1].trim());
  const m = read('js/modes.js');
  assert.match(m, /bar\.style\.cssText = 'align-self:flex-end; margin-top:-2px; display:' \+ \(isOwner\(\) \? 'inline-flex' : 'none'\)/);
  assert.match(m, /if\(bar\) bar\.style\.display = on \? 'flex' : 'none';/);
  assert.match(read('index.html'), /css\/redesign\.css\?v=689/);
});
