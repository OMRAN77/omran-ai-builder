// tests/agent-badge-star.test.cjs — v-agent-badge-star (طلب المالك: «احذف صوره الوكيل هذي
// بدون اي شي... والي تحط مكانه وميض نجمة ذهبية الموجودة» — سؤال توضيحي فاختار «شرارة تفكير
// الوكيل»): شارة «🤖 وكيل عمران» فوق ردود الوكيل (للمالك وحده، v-owner-model-badge) كانت تحمل
// إيموجي ثابتًا كنصّ خام. صار مكانه span.agent-badge-spark متحرّك (شرارة ✦، نفس حركة
// omranSpark المستعملة في .chat-status-spark) — بلون ذهبي ثابت لا var(--omGold)، لأنّ
// المتغيّر مُحيَّد عمدًا في كل التطبيق (knowledge/scripts/gold-kill.ts) فيطفئها رماديًّا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const ATTACH = read('js/app-09-attach.js');
const STATE = read('js/app-04-i18n-state.js');
const TOKENS = read('css/tokens.css');

test('١. agentMsg.providerLabel صار بلا إيموجي، وagentBadge:true تُضبط معه', () => {
  assert.match(ATTACH, /agentMsg\.providerLabel = lang === 'ar' \? 'وكيل عمران' : 'Omran Agent';/, 'النصّ الخام بلا 🤖');
  assert.match(ATTACH, /agentMsg\.agentBadge = true;/, 'علم agentBadge مضبوط');
  const idx = ATTACH.indexOf("agentMsg.providerLabel = lang === 'ar'");
  assert.ok(idx > 0, 'الموضع موجود');
  assert.doesNotMatch(ATTACH.slice(idx, idx + 220), /🤖/, 'لا بقايا إيموجي قرب بناء الشارة');
});

test('٢. .agent-badge-spark: نفس حركة omranSpark، بلون ذهبي ثابت لا المتغيّر المحيَّد، وتحترم تقليل الحركة', () => {
  const at = TOKENS.indexOf('.agent-badge-spark{');
  assert.ok(at > 0, 'التعريف موجود');
  const rule = TOKENS.slice(at, TOKENS.indexOf('}', at) + 1);
  assert.match(rule, /color:#d4af37;/, 'لون ذهبي صريح');
  assert.doesNotMatch(rule, /var\(--omGold/, 'لا ربط بمتغيّر --omGold المحيَّد عمدًا (gold-kill.ts)');
  assert.match(rule, /animation:omranSpark 1\.6s ease-in-out infinite;/, 'نفس حركة شرارة التفكير القائمة');
  assert.match(TOKENS, /\.agent-badge-spark\{animation:none;\}/, 'مضافة لقائمة prefers-reduced-motion');
});

/* يستخرج كتلة if(...){...} كاملة متوازنة الأقواس بعدّها لا بتخمين سطر نهايتها —
   يبقى صحيحًا حتى لو انزاح محتوى الكتلة مستقبلًا. */
function extractBlock(source, startNeedle) {
  const a = source.indexOf(startNeedle);
  assert.ok(a > 0, 'بداية الكتلة: ' + startNeedle);
  const braceStart = source.indexOf('{', a);
  let depth = 0, i = braceStart;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) break; }
  }
  assert.equal(depth, 0, 'قوس المطابقة لم يُغلق: ' + startNeedle);
  return source.slice(a, i + 1);
}

/* يعيد إنتاج مقطع رسم الشارة الحقيقيّ من app-04-i18n-state.js وينفّذه فعليًّا بـvm —
   نفس أسلوب tests/reply-toolbar.test.cjs (between + تنفيذ حقيقيّ لا نسخة مخفّفة من المنطق). */
function renderLabel(m) {
  const body = 'let pColor;\n' + extractBlock(STATE, '    if(m.providerLabel){');

  const spans = [];
  const textNodes = [];
  const label = {
    _text: '',
    children: [],
    set textContent(v) { this._text = v; },
    get textContent() { return this._text; },
    appendChild(c) { this.children.push(c); return c; },
    style: {},
  };
  const ctx = {
    m,
    document: {
      createElement(tag) {
        if (tag === 'div') return label;
        const el = { tag, attrs: {}, className: '', _text: '', setAttribute(k, v) { this.attrs[k] = v; }, set textContent(v) { this._text = v; }, get textContent() { return this._text; } };
        spans.push(el);
        return el;
      },
      createTextNode(v) { const n = { nodeText: v }; textNodes.push(n); return n; },
    },
    getProviderColors: () => ({}),
    functionalLabel: (k) => k,
    omranOwnerUi: () => true,
    isAskAllReply: false,
    div: { appendChild() {} },
  };
  vm.runInNewContext(body, ctx);
  return { label, spans, textNodes };
}

test('٣. رسالة الوكيل (agentBadge:true): شرارة ✦ مخفيّة عن قارئ الشاشة ثمّ نصّ الاسم — لا إيموجي', () => {
  const { label, spans, textNodes } = renderLabel({ providerLabel: 'وكيل عمران', agentBadge: true });
  assert.equal(spans.length, 1, 'شرارة واحدة فقط تُبنى');
  assert.equal(spans[0].className, 'agent-badge-spark');
  assert.equal(spans[0].textContent, '✦');
  assert.equal(spans[0].attrs['aria-hidden'], 'true', 'مخفيّة عن قارئ الشاشة — النصّ وحده يُقرأ');
  assert.equal(textNodes.length, 1);
  assert.equal(textNodes[0].nodeText, 'وكيل عمران', 'الاسم بلا إيموجي');
  assert.deepEqual(label.children, [spans[0], textNodes[0]], 'الشرارة قبل النصّ بالترتيب');
  assert.equal(label.textContent, '', 'لا يُستعمل textContent المباشر لشارة الوكيل');
});

test('٤. رسالة عادية (بلا agentBadge): تبقى كما كانت تمامًا — نصّ مباشر بلا شرارة', () => {
  const { label, spans, textNodes } = renderLabel({ providerLabel: 'Anthropic Claude' });
  assert.equal(spans.length, 0, 'لا شرارة لغير شارة الوكيل');
  assert.equal(textNodes.length, 0);
  assert.equal(label.textContent, 'Anthropic Claude');
});

console.log('✓ agent-badge-star: شرارة ذهبية متحركة مكان إيموجي 🤖 في شارة وكيل عمران وحدها');
