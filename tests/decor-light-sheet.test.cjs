'use strict';
// v-lighting-3d: اللوحة المقصوصة استُبدلت بصور غرفة منفصلة واضحة + الخيارات السبعة.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const ORDER = ['warm','cool','bright','dim','natural','neutral','golden','purple','sunset','moon','emerald','turquoise','rose','burgundy','neon','cinematic','aurora'];
const html = read('js/partials-core.js');
const sel = html.match(/<select id="designAiLighting"[\s\S]*?<\/select>/);
assert.ok(sel);
const options = [...sel[0].matchAll(/<option value="([^"]*)"([^>]*)>/g)];
assert.deepEqual(options.map(m=>m[1]),['',...ORDER]);
const sels = read('js/design-sels.js');
assert.ok(sels.includes("if(id==='designAiLighting') return 'assets/design/opts/lighting-'+v+'.webp';"));
assert.ok(!sels.includes('var LIGHT_MASK='),'لا أشرطة تغطي الغرفة');
assert.ok(!sels.includes('var LIGHT_POS='),'لا قصّ مكبّر من لوحة');
const hashes = new Set();
for(const v of ORDER){
  const b=fs.readFileSync(path.join(root,'assets/design/opts/lighting-'+v+'.webp'));
  assert.equal(b.toString('ascii',0,4),'RIFF'); assert.equal(b.toString('ascii',8,12),'WEBP');
  assert.ok(b.length>5000 && b.length<120000,'صورة خفيفة وليست placeholder: '+v);
  hashes.add(require('node:crypto').createHash('sha256').update(b).digest('hex'));
}
assert.equal(hashes.size,17,'كل إضاءة بصورتها لا تكرار صورة واحدة');
const subs=sels.slice(sels.indexOf('var SUBS=')).match(/designAiLighting:\{([\s\S]*?)\}/)[1];
const prompts=read('api/_lib/design-create.js').match(/const LIGHTING_PROMPTS = \{([\s\S]*?)\n\};/)[1];
for(const v of ORDER){ assert.match(subs,new RegExp('\\b'+v+":'")); assert.match(prompts,new RegExp('\\n\\s*'+v+": '")); }
const dictionaries={};
for(const l of ['ar','en']){
  const s=read('js/app-03-i18n-data.js');
  const section=s.slice(s.indexOf('  '+l+': {'));
  dictionaries[l]={};
  for(const m of section.matchAll(/"(designAiLighting\w+)": "([^"]+)"/g)) if(!dictionaries[l][m[1]]) dictionaries[l][m[1]]=m[2];
}
const ctx={I18N:dictionaries,window:{}};vm.createContext(ctx);
for(const l of ['fr','hi','ur','bn','ne','id','fil','tr','zh','ru','es','ml']) vm.runInContext(read('i18n/'+l+'.js'),ctx);
for(const [l,d] of Object.entries(ctx.I18N)) for(const o of options.slice(5)){
  const k=o[2].match(/data-i18n="([^"]+)"/)[1];assert.ok(d[k],l+' بلا ترجمة '+k);
}
const ui=read('js/app-05-ui.js');
// v-decor-18: الأفقيّ صار للأقسام الستّة كلّها (الإضاءة أوّلها) بالاسم فوق الصورة كبطاقات الترندات، وبقيّة المعارض كما هي.
assert.ok(sels.includes("var OPT6=['designAiLighting',") && sels.includes('landscape: six, overlay: six,'));
assert.ok(ui.includes("(cfg.landscape ? '16/9' : '3/4')"),'فقط الإضاءة أفقية');
assert.ok(ui.includes("grid.style.gridTemplateColumns = cfg.landscape ?"),'تصفير شبكة المعرض عند تغيير القسم');
const pick=sels.match(/onPick: function\(v\)\{[^}]+\}/)[0];
assert.ok(!/fetch|Generate|onclick/.test(pick),'اختيار بطاقة لا يبدأ التوليد');
assert.ok(read('js/app-12-studios.js').includes("lighting: lightingEl ? lightingEl.value : ''"),'القيمة المختارة تصل للطلب');
console.log('decor-light-sheet: ok (17 separate 3D previews, 14 languages, selection only)');
