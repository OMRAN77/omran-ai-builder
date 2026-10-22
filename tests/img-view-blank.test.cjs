'use strict';
/* v-view-blank (مشترك Max على آيفون، ١٦ أكتوبر): «اكتب اشتقتلج و حط هذيل الإموجي 🤍🌷» على صورة ← مربّع كبير فارغ بزوايا
   مستديرة وتحته المشاركة/الاستماع/النسخ/المزيد، والنقر يفتح المعاينة بالصورة سليمة على أسود.
   الجذر: الفقاعة ترسم نسخة العرض (__imgView/__makeView)، والمعاينة ترسم الأصل. WebKit يُسقط drawImage بصمت حين لا يفكّ إطار
   المصدر، فتبقى لوحة النسخة شفّافة؛ فحص الشفافية يقرأ ألفا ٠ فيعدّها «شفّافة» ويحفظها PNG فارغة في «معرّف~v» — للأبد. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const SRC = require('node:path').join(__dirname, '..', 'js', 'app-04-i18n-state.js');
const src = fs.readFileSync(SRC, 'utf8');
const slice = (from, to) => { const i = src.indexOf(from), j = src.indexOf(to, i); assert.ok(i >= 0 && j > i, from); return src.slice(i, j); };

/* DOM مزيّف: الصورة تُحمَّل بأبعادها، واللوحة تحفظ ما رُسم فعلًا. draw: 'ok' يرسم، 'drop' = WebKit يُسقط الرسم بصمت */
const fakeDom = (env) => {
  const sizes = env.sizes || {};
  class Image { set src(u){ this._u = u; setTimeout(() => { const z = sizes[u.slice(0, 40)] || [1152, 2048]; this.naturalWidth = z[0]; this.naturalHeight = z[1]; this.onload && this.onload(); }, 1); } get src(){ return this._u; } }
  const document = { createElement: () => {
    const c = { width: 0, height: 0, drawn: null };
    c.getContext = () => ({
      drawImage(im){ env.n = (env.n || 0) + 1; if(env.draw === 'drop') return; c.drawn = (env.kind && env.kind[im._u.slice(0, 40)]) || 'opaque'; },
      getImageData(x, y, w, h){ const d = new Uint8ClampedArray(w * h * 4); if(c.drawn) for(let i = 3; i < d.length; i += 4) d[i] = c.drawn === 'sticker' ? ((i >> 2) % 3 ? 0 : 255) : 255; return { data: d }; }
    });
    c.toDataURL = (type) => 'data:' + type + ';base64,' + (c.drawn ? 'INK' : 'BLANK') + (c.drawn || '');
    return c;
  } };
  return { Image, document };
};
const viewLib = (env) => { const d = fakeDom(env); return new Function('Image', 'document', 'const __swallow = () => {}; const __VIEW_MAX = 1280;' + slice('function __makeView(src){', '/* نسخة العرض لمرفق') + '; return { __makeView };')(d.Image, d.document); };

test('١. drawImage أسقطه المحرّك بصمت (لوحة بلا حبر) = لا نسخة عرض — لا PNG شفّافة لصورة PNG، ولا JPEG سوداء لصورة JPEG', async () => {
  const L = viewLib({ draw: 'drop' });
  assert.equal(await L.__makeView('data:image/png;base64,' + 'P'.repeat(400)), '', 'PNG الكتابة على الصورة: كانت تُحفظ PNG فارغة');
  assert.equal(await L.__makeView('data:image/jpeg;base64,' + 'J'.repeat(400)), '', 'JPEG: كانت تُحفظ JPEG بلا محتوى');
});

test('٢. بلا تغيير حين يُرسم: الصورة المعتمة JPEG، والشفّافة بحبرها PNG، وJPEG تبقى JPEG', async () => {
  const P = 'data:image/png;base64,' + 'P'.repeat(400), S = 'data:image/png;base64,' + 'S'.repeat(400), J = 'data:image/jpeg;base64,' + 'J'.repeat(400);
  const L = viewLib({ draw: 'ok', kind: { [S.slice(0, 40)]: 'sticker' } });
  assert.match(await L.__makeView(P), /^data:image\/jpeg;base64,INKopaque/);
  assert.match(await L.__makeView(S), /^data:image\/png;base64,INKsticker/);
  assert.match(await L.__makeView(J), /^data:image\/jpeg;base64,INKopaque/);
});

/* المسار كاملًا: __imgView بالـ__makeView الحقيقيّ + مخزن وهميّ */
const vaultLib = (vault, env) => { const d = fakeDom(env); return new Function('vault', 'state', 'window', 'Image', 'document',
  'const __swallow = () => {};' +
  slice('const VAULT_MIN = 150000;', 'function idbImgPutAll(puts){') +
  'function idbImgPutAll(puts){ puts.forEach(x => { vault[x.id] = x.dataUrl; }); return Promise.resolve(); }' +
  'function idbImgGet(id){ return new Promise(r => setTimeout(() => r(vault[id]), 2)); }' +
  slice('function __vaultRead(a){', 'function idbImgSweep(liveIds){') +
  '; return { __imgView };')(vault, { projects: [] }, {}, d.Image, d.document); };
const big = 'data:image/png;base64,' + 'X'.repeat(200000);

test('٣. صورة مخزونة ورسمها أُسقط: __imgView لا يعيد ولا يحفظ نسخة فارغة (كانت تُكتب «معرّف~v» وتُعرض في كلّ فتح)', async () => {
  const vault = { a1: big }, a = { isImage: true, vaultId: 'a1', dataUrl: big };
  const env = { draw: 'drop' }, L = vaultLib(vault, env);
  assert.equal(await L.__imgView(a), '');
  assert.equal(vault['a1~v'], undefined, 'لا نسخة فارغة في المخزن');
  assert.equal(a.viewUrl, undefined);
  /* مراجعة النقض: الفشل لا يُعاد مع كلّ رسم تحت ضغط الذاكرة نفسه (فكّ الأصل كاملًا ثانيةً) — دقيقة ثمّ محاولة */
  assert.equal(env.n, 1);
  assert.equal(await L.__imgView(a), '');
  assert.equal(env.n, 1, 'لا فكّ ثانٍ للأصل فورًا');
  /* تعافى المحرّك: الفتح التالي يصنع النسخة الحقيقيّة */
  const L2 = vaultLib(vault, { draw: 'ok' });
  assert.match(await L2.__imgView(a), /^data:image\/jpeg;base64,INK/);
  assert.match(vault['a1~v'], /^data:image\/jpeg;base64,INK/);
});

test('٤. نسخة فارغة حُفظت قبل الإصلاح (PNG بلا حبر) لا تُعرض: تُصنع من الأصل وتُستبدل؛ ونسخة سليمة تُقرأ كما هي', async () => {
  const blank = 'data:image/png;base64,BLANK';
  const vault = { a1: big, 'a1~v': blank }, a = { isImage: true, vaultId: 'a1', dataUrl: big };
  /* النسخة الفارغة المحفوظة شفّافة: رسمها لا يترك حبرًا، والأصل يُرسم سليمًا */
  const L3 = (() => { const env = { draw: 'ok' }; const d = fakeDom(env); const orig = d.document.createElement; d.document.createElement = () => { const c = orig(); const g = c.getContext; c.getContext = () => { const x = g(); const di = x.drawImage; x.drawImage = (im, ...r) => { if(im._u === blank) return; return di(im, ...r); }; return x; }; return c; };
    return new Function('vault', 'state', 'window', 'Image', 'document', 'const __swallow = () => {};' + slice('const VAULT_MIN = 150000;', 'function idbImgPutAll(puts){') + 'function idbImgPutAll(puts){ puts.forEach(x => { vault[x.id] = x.dataUrl; }); return Promise.resolve(); } function idbImgGet(id){ return new Promise(r => setTimeout(() => r(vault[id]), 2)); }' + slice('function __vaultRead(a){', 'function idbImgSweep(liveIds){') + '; return { __imgView };')(vault, { projects: [] }, {}, d.Image, d.document); })();
  const v = await L3.__imgView(a);
  assert.notEqual(v, blank, 'الفارغة المحفوظة لا تُعرض');
  assert.match(v, /^data:image\/jpeg;base64,INK/);
  assert.equal(vault['a1~v'], v, 'واستُبدلت في المخزن');
  const good = { a2: big, 'a2~v': 'data:image/jpeg;base64,GOOD' }, b = { isImage: true, vaultId: 'a2', dataUrl: big };
  assert.equal(await vaultLib(good, { draw: 'ok' }).__imgView(b), 'data:image/jpeg;base64,GOOD', 'JPEG المحفوظة تُقرأ بلا فحص');
});

test('٥. الرسم: إن لم تُصنع نسخة العرض تُعرض الصورة الأصليّة (في الذاكرة أو المقروءة من المخزن) — لا صورة بلا src', () => {
  assert.match(src, /__imgView\(a\)\.then\(u => __showSrc\(u \|\| \(String\(a\.dataUrl \|\| ''\)\.slice\(0, 11\) === 'data:image\/' \? a\.dataUrl : ''\)\)\)/);
});
