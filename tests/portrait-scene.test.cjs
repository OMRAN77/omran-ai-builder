// أنماط الصور: إضافة فوق محرك المشاهد الحالي، بلا تعديل للأجزاء الأخرى.
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const core=read('js/app-34-gen-wait.js'),extra=read('js/portrait-gen-scene.js');
function load(){
 const storage=new Map([['aiapp_st_scene','2']]),styles=[];
 const s={window:{},document:{documentElement:{},querySelectorAll:()=>[],querySelector:()=>null,getElementById:()=>null,createElement:()=>({}),head:{appendChild:x=>styles.push(x)},addEventListener:()=>{}},MutationObserver:function(){return{observe(){}}},setTimeout:()=>0,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))}};
 vm.createContext(s);vm.runInContext(core,s);vm.runInContext(extra,s);return{w:s.window.omranGenWait,storage,styles,s};
}
test('صورة المالك المضمنة ومجموعة واحدة مستقلة بلا خلط أو إعادة انتظار المحادثة',()=>{
 const {w}=load(),cfg=w.KINDS.styles;
 assert.equal(cfg.scenes.length,1);assert.equal(cfg.sceneKey,'aiapp_ps_scene');
 assert.equal(w.KINDS.studio.scenes.length,5);assert.equal(w.KINDS.fashion.scenes.length,2);
 const sc=cfg.scenes[0],b=Buffer.from(sc.src.split(',')[1],'base64');
 assert.equal(b.subarray(0,4).toString(),'RIFF');assert.equal(b.subarray(8,12).toString(),'WEBP');assert.ok(b.length<700*1024);
 assert.equal(sc.w,1769);assert.equal(sc.h,889);assert.ok(!core.includes('var t0ByText'));
});
test('الدور مستقل، والحلقة والشريط والنص من محرك الستايل نفسه',()=>{
 const {w,storage}=load(),cfg=w.KINDS.styles,sc=w._nextScene(cfg,true);
 assert.equal(storage.get('aiapp_ps_scene'),undefined);assert.equal(w._nextScene(cfg).id,sc.id);assert.equal(storage.get('aiapp_st_scene'),'2');
 const h=w._sceneHtml(sc);assert.match(h,/>0% COMPLETE<\/text>/);assert.match(h,/class="genw-bar"[^>]+width="0"/);
 assert.ok(sc.ring.hole>sc.ring.r+sc.ring.sw/2);assert.ok(sc.tube.gap[0]<sc.bar.y&&sc.tube.gap[1]>sc.cap.y);
});
test('حركة هادئة خاصة بالأنماط؛ الإضافة لا تتكرر وتحمل بعد الحزمة',()=>{
 const {s,styles}=load(),css=styles[0].textContent;
 assert.ok(css.includes('.genw--psGold .genw-frame{animation:none}'));
 assert.ok(css.includes('.genw--psGold .genw-frame::before{display:none;animation:none}'));
 assert.ok(css.includes('opacity:.12;animation-duration:12s'));
 assert.ok(css.includes('b:nth-child(3){display:none;animation:none}'));
 vm.runInContext(extra,s);assert.equal(styles.length,1);
 const html=read('index.html');assert.ok(html.indexOf('/js/portrait-gen-scene.js')>html.indexOf('/js/app.bundle.js'));
 assert.ok(extra.includes('#btnPortraitStyle, #portraitStyleCta, #portraitStyleGenerateBtn'));
});
