import {readFileSync,writeFileSync} from 'fs';
const S='/tmp/vc/src/';
let added=0, edited=0;

/* ---------- 1) الترجمات ---------- */
const T:Record<string,[string,string,string,string]> = {
  // [omranDisclaimerTxt, eduIntroTxtKey, eduIntroOpenKey, sbNewProject]
  en:["Information may be inaccurate — verify important details.","New: 🎓 Education — upload your lecture and get a summary, flashcards and a quiz","Try it now",""],
  fr:["Les informations peuvent être inexactes — vérifiez les détails importants.","Nouveau : 🎓 Éducation — importez votre cours et obtenez un résumé, des cartes et un quiz","Essayer",""],
  es:["La información puede ser inexacta: verifica los datos importantes.","Nuevo: 🎓 Educación — sube tu clase y obtén un resumen, tarjetas y un test","Pruébalo","Nuevo proyecto"],
  tr:["Bilgiler yanlış olabilir — önemli ayrıntıları doğrulayın.","Yeni: 🎓 Eğitim — dersini yükle; özet, kart ve sınav al","Şimdi dene","Yeni proje"],
  ru:["Информация может быть неточной — проверяйте важные данные.","Новое: 🎓 Обучение — загрузите лекцию и получите конспект, карточки и тест","Попробовать","Новый проект"],
  zh:["信息可能不准确，请核实重要内容。","新功能：🎓 学习 — 上传讲义，获取摘要、闪卡和测验","立即试用","新建项目"],
  hi:["जानकारी गलत हो सकती है — महत्वपूर्ण विवरण की पुष्टि करें।","नया: 🎓 शिक्षा — अपना लेक्चर अपलोड करें और सारांश, फ्लैशकार्ड व क्विज़ पाएं","अभी आज़माएं",""],
  bn:["তথ্য ভুল হতে পারে — গুরুত্বপূর্ণ তথ্য যাচাই করুন।","নতুন: 🎓 শিক্ষা — আপনার লেকচার আপলোড করুন এবং সারাংশ, ফ্ল্যাশকার্ড ও কুইজ পান","এখনই চেষ্টা করুন",""],
  ur:["معلومات غلط ہو سکتی ہیں — اہم تفصیلات کی تصدیق کریں۔","نیا: 🎓 تعلیم — اپنا لیکچر اپ لوڈ کریں اور خلاصہ، فلیش کارڈز اور کوئز حاصل کریں","ابھی آزمائیں",""],
  id:["Informasi bisa saja tidak akurat — periksa detail penting.","Baru: 🎓 Edukasi — unggah materi kuliahmu dan dapatkan ringkasan, kartu, dan kuis","Coba sekarang","Proyek baru"],
  fil:["Maaaring hindi tumpak ang impormasyon — i-verify ang mahahalagang detalye.","Bago: 🎓 Edukasyon — i-upload ang lecture mo at kumuha ng buod, flashcards at pagsusulit","Subukan ngayon","Bagong proyekto"],
  ne:["जानकारी गलत हुन सक्छ — महत्त्वपूर्ण विवरण जाँच गर्नुहोस्।","नयाँ: 🎓 शिक्षा — आफ्नो लेक्चर अपलोड गर्नुहोस् र सारांश, फ्ल्यासकार्ड र क्विज पाउनुहोस्","अहिले प्रयास गर्नुहोस्",""],
  ml:["വിവരങ്ങൾ കൃത്യമല്ലായിരിക്കാം — പ്രധാന വിവരങ്ങൾ പരിശോധിക്കുക.","പുതിയത്: 🎓 വിദ്യാഭ്യാസം — നിങ്ങളുടെ ക്ലാസ് അപ്‌ലോഡ് ചെയ്ത് സംഗ്രഹം, ഫ്ലാഷ്കാർഡുകൾ, ക്വിസ് നേടൂ","ഇപ്പോൾ പരീക്ഷിക്കൂ","പുതിയ പ്രോജക്റ്റ്"],
};
const AR=["قد تكون المعلومات غير دقيقة، تحقق من المعلومات المهمة.","جديد: 🎓 التعليم — ارفع محاضرتك واحصل على ملخص وبطاقات واختبار","جرّبه الآن"];
const q=(s:string)=>"'"+s.replace(/\\/g,'\\\\').replace(/'/g,"\\'")+"'";

for(const lg of Object.keys(T)){
  if(lg==='en') continue;
  const p=S+'i18n/'+lg+'.js';
  let src=readFileSync(p,'utf8');
  const [d,e1,e2,np]=T[lg];
  let add='';
  if(!/omranDisclaimerTxt\s*:/.test(src)) add+="    omranDisclaimerTxt: "+q(d)+",\n";
  if(!/eduIntroTxtKey\s*:/.test(src))     add+="    eduIntroTxtKey: "+q(e1)+",\n";
  if(!/eduIntroOpenKey\s*:/.test(src))    add+="    eduIntroOpenKey: "+q(e2)+",\n";
  if(np && !/sbNewProject\s*:/.test(src)) add+="    sbNewProject: "+q(np)+",\n";
  if(!add) continue;
  const i=src.lastIndexOf('};');
  if(i<0) throw new Error('لا يوجد }; في '+lg);
  src=src.slice(0,i)+add+src.slice(i);
  writeFileSync(p,src); added+=add.split('\n').length-1; edited++;
}

/* ---------- 2) قاموسا ar/en في البندل والمصدر ---------- */
for(const f of ['js/app.bundle.js','js/app-03-i18n-data.js']){
  const p=S+f; let src=readFileSync(p,'utf8');
  const lines=src.split('\n');
  const idx:number[]=[];
  lines.forEach((l,i)=>{ if(/^\s*sbNewProject\s*:/.test(l)) idx.push(i); });
  if(idx.length!==2) throw new Error(f+': وجدت '+idx.length+' مواضع sbNewProject');
  // ar أوّلًا ثمّ en — نُدرج من الأسفل للأعلى حفاظًا على الفهارس
  const packs=[AR,[T.en[0],T.en[1],T.en[2]]];
  for(let k=idx.length-1;k>=0;k--){
    const [d,e1,e2]=packs[k];
    const ins=["    omranDisclaimerTxt: "+q(d)+",","    eduIntroTxtKey: "+q(e1)+",","    eduIntroOpenKey: "+q(e2)+","];
    lines.splice(idx[k]+1,0,...ins); added+=3;
  }
  writeFileSync(p,lines.join('\n')); edited++;
}

/* ---------- 3) index.html ---------- */
{
  const p=S+'index.html'; let src=readFileSync(p,'utf8'); const before=src;
  src=src.replace('<div id="omranDisclaimer">','<div id="omranDisclaimer" data-i18n="omranDisclaimerTxt">');
  src=src.replace('<p id="eduIntroTxt">','<p id="eduIntroTxt" data-i18n="eduIntroTxtKey">');
  src=src.replace('id="eduIntroOpen" style=','id="eduIntroOpen" data-i18n="eduIntroOpenKey" style=');
  // حذف شريط المزوّدين من الشاشة الرئيسية (أمر عمران)
  src=src.replace('<div id="providerStripMobile"></div>\n','');
  src=src.replace('<div id="providerStripMobile"></div>','');
  if(src===before) throw new Error('index.html: لم يتغيّر شيء');
  writeFileSync(p,src); edited++;
}

/* ---------- 4) tokens.css — القائمة المنسدلة للجوّال ---------- */
{
  const p=S+'css/tokens.css'; const lines=readFileSync(p,'utf8').split('\n');
  const block = lines.slice(196,242)
    .filter(l=>l.includes('html:not(.mobile-ui)') && !/workarea|resizer2|chatcol/.test(l))
    .map(l=>l.replace(/html:not\(\.mobile-ui\)\s*/g,'').trim());
  const out = ['','/* v442: قائمة المزوّدين المنسدلة تعمل على الجوّال أيضًا (أمر عمران: «أ» + حذف شريط الشاشة الرئيسية) */',
    '#providerStripMobile{display:none !important;}',
    ...block.map(l=>'  '+l)].join('\n')+'\n';
  writeFileSync(p, readFileSync(p,'utf8')+out);
  added += out.split('\n').length-1; edited++;
  console.log('قواعد CSS منقولة:', block.length);
}
console.log('ملفّات معدَّلة:',edited,'| أسطر مضافة:',added);
