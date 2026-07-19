// Starter templates for "🧩 قوالب" gallery.
// Each template: id, icon, title {ar,en}, desc {ar,en}, code (full self-contained HTML)
const TEMPLATES = [
  {
    id: 'landing',
    icon: '🚀',
    title: { ar: 'صفحة هبوط لمنتج', en: 'Product Landing Page' , fr: 'Page de destination produit', hi: 'उत्पाद लैंडिंग पेज', ur: 'پروڈکٹ لینڈنگ پیج', bn: 'প্রোডাক্ট ল্যান্ডিং পেজ', ne: 'प्रोडक्ट ल्यान्डिङ पेज' },
    desc: { ar: 'صفحة تسويقية أنيقة لعرض منتج أو خدمة', en: 'A sleek marketing page to showcase a product or service' , fr: 'Une page marketing élégante pour présenter un produit ou un service', hi: 'किसी उत्पाद या सेवा को प्रदर्शित करने के लिए एक आकर्षक मार्केटिंग पेज', ur: 'کسی پروڈکٹ یا سروس کو دکھانے کے لیے ایک خوبصورت مارکیٹنگ پیج', bn: 'একটি পণ্য বা সেবা প্রদর্শনের জন্য একটি মার্জিত মার্কেটিং পেজ', ne: 'उत्पादन वा सेवा प्रदर्शन गर्न एक सुरुचिपूर्ण मार्केटिङ पेज' },
    code: `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',Tahoma,sans-serif}
body{background:#0a0b10;color:#eef0f6}
.hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px;background:radial-gradient(circle at 50% 0%,#7c5cff33,transparent 60%)}
.hero h1{font-size:clamp(28px,6vw,52px);background:linear-gradient(90deg,#7c5cff,#00e5a0);-webkit-background-clip:text;background-clip:text;color:transparent;margin-bottom:16px}
.hero p{font-size:18px;color:#a7adc0;max-width:560px;margin-bottom:32px}
.cta{display:flex;gap:16px;flex-wrap:wrap;justify-content:center}
.btn{padding:14px 32px;border-radius:12px;font-weight:700;text-decoration:none;transition:.2s}
.btn.primary{background:#7c5cff;color:#fff}
.btn.primary:hover{background:#6a4ce0}
.btn.secondary{background:#161622;color:#eef0f6;border:1px solid #262b36}
.features{max-width:960px;margin:0 auto;padding:60px 24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px}
.card{background:#12141d;border:1px solid #262b36;border-radius:16px;padding:28px;text-align:center}
.card .emoji{font-size:36px;margin-bottom:12px}
.card h3{margin-bottom:8px}
.card p{color:#a7adc0;font-size:14px}
footer{text-align:center;padding:30px;color:#6b7280;font-size:13px}
</style></head><body>
<div class="hero">
  <h1>منتجك القادم يبدأ هنا ✨</h1>
  <p>حل ذكي وبسيط يساعدك تحقق أهدافك بسرعة وسهولة. جرّبه الآن مجانًا وشوف الفرق بنفسك.</p>
  <div class="cta">
    <a href="#" class="btn primary">ابدأ مجانًا</a>
    <a href="#" class="btn secondary">شاهد العرض</a>
  </div>
</div>
<div class="features">
  <div class="card"><div class="emoji">⚡</div><h3>سريع جدًا</h3><p>أداء عالي وتجربة استخدام سلسة بدون تأخير.</p></div>
  <div class="card"><div class="emoji">🔒</div><h3>آمن تمامًا</h3><p>بياناتك محمية بأعلى معايير الأمان والتشفير.</p></div>
  <div class="card"><div class="emoji">💡</div><h3>سهل الاستخدام</h3><p>واجهة بسيطة يفهمها الجميع من أول استخدام.</p></div>
</div>
<footer>© 2026 — صُنع بواسطة عمران AI Builder</footer>
</body></html>`
  },
  {
    id: 'restaurant',
    icon: '🍽️',
    title: { ar: 'قائمة مطعم', en: 'Restaurant Menu' , fr: 'Menu de restaurant', hi: 'रेस्टोरेंट मेनू', ur: 'ریسٹورنٹ مینو', bn: 'রেস্টুরেন্ট মেনু', ne: 'रेस्टुरेन्ट मेनु' },
    desc: { ar: 'صفحة قائمة طعام أنيقة مع أسعار وصور تعبيرية', en: 'An elegant food menu page with prices and emoji visuals' , fr: 'Une page de menu élégante avec prix et visuels emoji', hi: 'कीमतों और इमोजी विज़ुअल के साथ एक स्टाइलिश फूड मेनू पेज', ur: 'قیمتوں اور ایموجی تصاویر کے ساتھ ایک خوبصورت فوڈ مینو پیج', bn: 'দাম ও ইমোজি ভিজ্যুয়ালসহ একটি এলিগ্যান্ট ফুড মেনু পেজ', ne: 'मूल्य र इमोजी भिजुअलसहितको एक सुन्दर खाना मेनु पेज' },
    code: `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',Tahoma,sans-serif}
body{background:#1a120b;color:#f5e9da}
header{text-align:center;padding:50px 20px 30px;background:linear-gradient(180deg,#2a1a0f,transparent)}
header h1{font-size:38px;color:#ffb454;margin-bottom:8px}
header p{color:#d8c3ac}
.menu{max-width:720px;margin:0 auto;padding:20px}
.section-title{font-size:22px;color:#ffb454;margin:32px 0 16px;border-bottom:2px solid #ffb45455;padding-bottom:8px}
.item{display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px dashed #4a3527}
.item .name{font-weight:700;font-size:16px}
.item .name span{color:#d8c3ac;font-weight:400;font-size:13px;display:block;margin-top:4px}
.item .price{color:#ffb454;font-weight:700;font-size:17px}
footer{text-align:center;padding:30px;color:#8a725c;font-size:13px}
</style></head><body>
<header><h1>🍽️ مطعم الأصالة</h1><p>نكهات أصيلة تُحضّر بحب من قلب المطبخ</p></header>
<div class="menu">
  <div class="section-title">🥗 المقبلات</div>
  <div class="item"><div class="name">حمص بالطحينة <span>حمص، ثوم، زيت زيتون</span></div><div class="price">18 ر.س</div></div>
  <div class="item"><div class="name">تبولة لبنانية <span>بقدونس، برغل، ليمون</span></div><div class="price">16 ر.س</div></div>
  <div class="section-title">🍖 الأطباق الرئيسية</div>
  <div class="item"><div class="name">مشاوي مشكلة <span>لحم، دجاج، كباب</span></div><div class="price">65 ر.س</div></div>
  <div class="item"><div class="name">كبسة لحم <span>أرز بسمتي، لحم غنم</span></div><div class="price">55 ر.س</div></div>
  <div class="section-title">🍰 الحلويات</div>
  <div class="item"><div class="name">كنافة نابلسية <span>جبن، قطر، فستق</span></div><div class="price">22 ر.س</div></div>
</div>
<footer>© 2026 مطعم الأصالة — بالهناء والشفاء 🌿</footer>
</body></html>`
  },
  {
    id: 'portfolio',
    icon: '💼',
    title: { ar: 'بورتفوليو شخصي', en: 'Personal Portfolio' , fr: 'Portfolio personnel', hi: 'व्यक्तिगत पोर्टफोलियो', ur: 'ذاتی پورٹ فولیو', bn: 'ব্যক্তিগত পোর্টফোলিও', ne: 'व्यक्तिगत पोर्टफोलियो' },
    desc: { ar: 'صفحة تعريفية بمهاراتك وأعمالك السابقة', en: 'A profile page to showcase your skills and past work' , fr: 'Une page de profil pour présenter vos compétences et travaux passés', hi: 'अपने कौशल और पिछले कार्यों को प्रदर्शित करने के लिए एक प्रोफ़ाइल पेज', ur: 'اپنی مہارتیں اور سابقہ کام دکھانے کے لیے ایک پروفائل پیج', bn: 'আপনার দক্ষতা ও পূর্ববর্তী কাজ প্রদর্শনের জন্য একটি প্রোফাইল পেজ', ne: 'तपाईंको सीप र विगतको कामलाई प्रदर्शन गर्ने प्रोफाइल पेज' },
    code: `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',Tahoma,sans-serif}
body{background:#0d0f14;color:#eef0f6}
.hero{text-align:center;padding:70px 20px 40px}
.avatar{width:120px;height:120px;border-radius:50%;background:linear-gradient(135deg,#7c5cff,#00e5a0);margin:0 auto 20px;display:flex;align-items:center;justify-content:center;font-size:48px}
.hero h1{font-size:30px;margin-bottom:6px}
.hero p{color:#a7adc0}
.socials{display:flex;gap:14px;justify-content:center;margin-top:20px}
.socials a{width:40px;height:40px;border-radius:50%;background:#161622;display:flex;align-items:center;justify-content:center;text-decoration:none;color:#eef0f6;border:1px solid #262b36}
.section{max-width:800px;margin:0 auto;padding:30px 24px}
.section h2{font-size:22px;margin-bottom:16px;color:#7c5cff}
.skills{display:flex;flex-wrap:wrap;gap:10px}
.skill{background:#161622;border:1px solid #262b36;padding:8px 16px;border-radius:20px;font-size:14px}
.projects{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px}
.project{background:#12141d;border:1px solid #262b36;border-radius:14px;padding:20px}
.project h3{margin-bottom:8px}
.project p{color:#a7adc0;font-size:14px}
</style></head><body>
<div class="hero">
  <div class="avatar">👤</div>
  <h1>اسمك هنا</h1>
  <p>مطوّر ويب ومصمم تجربة مستخدم</p>
  <div class="socials"><a href="#">🔗</a><a href="#">📷</a><a href="#">💬</a></div>
</div>
<div class="section">
  <h2>المهارات</h2>
  <div class="skills">
    <div class="skill">HTML/CSS</div><div class="skill">JavaScript</div><div class="skill">UI/UX</div><div class="skill">React</div><div class="skill">Python</div>
  </div>
</div>
<div class="section">
  <h2>أعمالي</h2>
  <div class="projects">
    <div class="project"><h3>مشروع 1</h3><p>وصف مختصر عن هذا المشروع وما تم إنجازه فيه.</p></div>
    <div class="project"><h3>مشروع 2</h3><p>وصف مختصر عن هذا المشروع وما تم إنجازه فيه.</p></div>
    <div class="project"><h3>مشروع 3</h3><p>وصف مختصر عن هذا المشروع وما تم إنجازه فيه.</p></div>
  </div>
</div>
</body></html>`
  },
  {
    id: 'calculator',
    icon: '🧮',
    title: { ar: 'آلة حاسبة', en: 'Calculator App' , fr: 'Application calculatrice', hi: 'कैलकुलेटर ऐप', ur: 'کیلکولیٹر ایپ', bn: 'ক্যালকুলেটর অ্যাপ', ne: 'क्यालकुलेटर एप' },
    desc: { ar: 'آلة حاسبة تفاعلية تدعم العمليات الأساسية', en: 'An interactive calculator supporting basic operations' , fr: 'Une calculatrice interactive prenant en charge les opérations de base', hi: 'बुनियादी संचालन का समर्थन करने वाला एक इंटरैक्टिव कैलकुलेटर', ur: 'بنیادی حسابات کے لیے ایک انٹرایکٹو کیلکولیٹر', bn: 'মৌলিক গাণিতিক অপারেশন সমর্থনকারী একটি ইন্টারেক্টিভ ক্যালকুলেটর', ne: 'आधारभूत गणितीय सञ्चालनहरू समर्थन गर्ने अन्तरक्रियात्मक क्यालकुलेटर' },
    code: `<!DOCTYPE html><html lang="ar" dir="ltr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',Tahoma,sans-serif}
body{background:#0a0b10;color:#eef0f6;display:flex;align-items:center;justify-content:center;min-height:100vh}
.calc{width:300px;background:#12141d;border:1px solid #262b36;border-radius:20px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.display{background:#0a0b10;border-radius:12px;padding:20px;text-align:right;font-size:32px;margin-bottom:16px;min-height:70px;word-break:break-all}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
button{padding:18px 0;border:none;border-radius:12px;background:#1e2130;color:#eef0f6;font-size:18px;cursor:pointer;transition:.15s}
button:hover{background:#282c40}
button.op{background:#7c5cff;color:#fff}
button.op:hover{background:#6a4ce0}
button.eq{background:#00e5a0;color:#000;grid-column:span 2}
button.clear{background:#ff5c7c;color:#fff}
</style></head><body>
<div class="calc">
  <div class="display" id="display">0</div>
  <div class="grid">
    <button class="clear" onclick="clearAll()">C</button>
    <button onclick="del()">⌫</button>
    <button class="op" onclick="append('%')">%</button>
    <button class="op" onclick="append('/')">÷</button>
    <button onclick="append('7')">7</button><button onclick="append('8')">8</button><button onclick="append('9')">9</button><button class="op" onclick="append('*')">×</button>
    <button onclick="append('4')">4</button><button onclick="append('5')">5</button><button onclick="append('6')">6</button><button class="op" onclick="append('-')">−</button>
    <button onclick="append('1')">1</button><button onclick="append('2')">2</button><button onclick="append('3')">3</button><button class="op" onclick="append('+')">+</button>
    <button onclick="append('0')">0</button><button onclick="append('.')">.</button>
    <button class="eq" onclick="calc()">=</button>
  </div>
</div>
<script>
let expr = '';
const display = document.getElementById('display');
function append(v){ expr += v; display.textContent = expr; }
function clearAll(){ expr=''; display.textContent='0'; }
function del(){ expr = expr.slice(0,-1); display.textContent = expr || '0'; }
function calc(){
  try{ expr = String(Function('"use strict";return (' + expr.replace(/%/g,'/100') + ')')()); display.textContent = expr; }
  catch(e){ display.textContent = 'خطأ'; expr=''; }
}
</script>
</body></html>`
  },
  {
    id: 'todo',
    icon: '✅',
    title: { ar: 'تطبيق مهام', en: 'To-Do List App' , fr: 'Application de tâches', hi: 'टू-डू लिस्ट ऐप', ur: 'ٹو ڈو لسٹ ایپ', bn: 'টু-ডু লিস্ট অ্যাপ', ne: 'टु-डु लिस्ट एप' },
    desc: { ar: 'قائمة مهام تفاعلية مع إضافة وحذف وتحديد كمكتمل', en: 'An interactive task list with add, delete and complete features' , fr: 'Une liste de tâches interactive avec ajout, suppression et complétion', hi: 'जोड़ने, हटाने और पूर्ण करने की सुविधाओं वाली एक इंटरैक्टिव टास्क लिस्ट', ur: 'شامل کرنے، حذف کرنے اور مکمل کرنے کی خصوصیات کے ساتھ ایک انٹرایکٹو ٹاسک لسٹ', bn: 'যোগ, মুছে ফেলা ও সম্পন্ন করার বৈশিষ্ট্যসহ একটি ইন্টারেক্টিভ টাস্ক লিস্ট', ne: 'थप्ने, मेटाउने र पूरा गर्ने सुविधाहरूसहितको अन्तरक्रियात्मक कार्य सूची' },
    code: `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',Tahoma,sans-serif}
body{background:#0a0b10;color:#eef0f6;min-height:100vh;display:flex;justify-content:center;padding:60px 20px}
.wrap{width:100%;max-width:440px}
h1{text-align:center;margin-bottom:24px;color:#7c5cff}
.inputrow{display:flex;gap:8px;margin-bottom:20px}
input[type=text]{flex:1;padding:14px;border-radius:10px;border:1px solid #262b36;background:#12141d;color:#eef0f6;font-size:15px}
button.add{padding:14px 20px;border:none;border-radius:10px;background:#7c5cff;color:#fff;font-weight:700;cursor:pointer}
ul{list-style:none}
li{display:flex;align-items:center;gap:10px;background:#12141d;border:1px solid #262b36;padding:14px;border-radius:10px;margin-bottom:10px}
li.done span{text-decoration:line-through;color:#6b7280}
li span{flex:1;cursor:pointer}
li button{background:none;border:none;color:#ff5c7c;font-size:18px;cursor:pointer}
.counter{text-align:center;color:#a7adc0;margin-top:16px;font-size:14px}
</style></head><body>
<div class="wrap">
  <h1>✅ مهامي اليومية</h1>
  <div class="inputrow">
    <input type="text" id="taskInput" placeholder="أضف مهمة جديدة...">
    <button class="add" onclick="addTask()">إضافة</button>
  </div>
  <ul id="list"></ul>
  <div class="counter" id="counter"></div>
</div>
<script>
let tasks = [];
function render(){
  const list = document.getElementById('list');
  list.innerHTML = '';
  tasks.forEach((t,i) => {
    const li = document.createElement('li');
    if(t.done) li.classList.add('done');
    li.innerHTML = '<span onclick="toggle('+i+')">'+t.text+'</span><button onclick="remove('+i+')">🗑️</button>';
    list.appendChild(li);
  });
  const left = tasks.filter(t=>!t.done).length;
  document.getElementById('counter').textContent = tasks.length ? (left + ' مهمة متبقية من ' + tasks.length) : 'لا توجد مهام بعد';
}
function addTask(){
  const input = document.getElementById('taskInput');
  if(!input.value.trim()) return;
  tasks.push({text: input.value.trim(), done:false});
  input.value = '';
  render();
}
function toggle(i){ tasks[i].done = !tasks[i].done; render(); }
function remove(i){ tasks.splice(i,1); render(); }
document.getElementById('taskInput').addEventListener('keypress', e => { if(e.key==='Enter') addTask(); });
render();
</script>
</body></html>`
  },
  {
    id: 'guessgame',
    icon: '🎯',
    title: { ar: 'لعبة تخمين الرقم', en: 'Number Guessing Game' , fr: 'Jeu de devinette de nombre', hi: 'नंबर गेसिंग गेम', ur: 'نمبر گیسنگ گیم', bn: 'নাম্বার গেসিং গেম', ne: 'नम्बर अनुमान खेल' },
    desc: { ar: 'لعبة بسيطة وممتعة لتخمين رقم عشوائي', en: 'A fun simple game to guess a random number' , fr: 'Un jeu simple et amusant pour deviner un nombre aléatoire', hi: 'एक यादृच्छिक संख्या का अनुमान लगाने के लिए एक मज़ेदार सरल खेल', ur: 'بے ترتیب نمبر کا اندازہ لگانے کے لیے ایک مزیدار سادہ گیم', bn: 'একটি এলোমেলো সংখ্যা অনুমান করার মজার সহজ খেলা', ne: 'अनियमित संख्या अनुमान गर्ने रमाइलो सरल खेल' },
    code: `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',Tahoma,sans-serif}
body{background:#0a0b10;color:#eef0f6;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:#12141d;border:1px solid #262b36;border-radius:20px;padding:40px;text-align:center;max-width:380px}
h1{margin-bottom:10px;color:#00e5a0}
p{color:#a7adc0;margin-bottom:20px}
input{width:100%;padding:14px;border-radius:10px;border:1px solid #262b36;background:#0a0b10;color:#eef0f6;font-size:18px;text-align:center;margin-bottom:14px}
button{width:100%;padding:14px;border:none;border-radius:10px;background:#00e5a0;color:#000;font-weight:700;font-size:16px;cursor:pointer;margin-bottom:14px}
#result{font-size:16px;min-height:24px;font-weight:700}
#tries{color:#a7adc0;font-size:13px}
</style></head><body>
<div class="card">
  <h1>🎯 خمّن الرقم</h1>
  <p>اختر رقمًا بين 1 و 100</p>
  <input type="number" id="guess" placeholder="أدخل رقمك هنا" min="1" max="100">
  <button onclick="checkGuess()">تحقق</button>
  <div id="result"></div>
  <div id="tries"></div>
</div>
<script>
let target = Math.floor(Math.random()*100)+1;
let tries = 0;
function checkGuess(){
  const val = parseInt(document.getElementById('guess').value);
  const result = document.getElementById('result');
  if(!val){ result.textContent = 'أدخل رقمًا صحيحًا!'; result.style.color='#ff5c7c'; return; }
  tries++;
  if(val === target){
    result.textContent = '🎉 صح! الرقم كان ' + target;
    result.style.color = '#00e5a0';
    document.getElementById('tries').textContent = 'عدد المحاولات: ' + tries;
    target = Math.floor(Math.random()*100)+1;
    tries = 0;
  } else if(val < target){
    result.textContent = '⬆️ أعلى من كذا';
    result.style.color = '#ffb454';
  } else {
    result.textContent = '⬇️ أقل من كذا';
    result.style.color = '#ffb454';
  }
  document.getElementById('tries').textContent = 'عدد المحاولات: ' + tries;
}
</script>
</body></html>`
  },
  {
    id: 'countdown',
    icon: '⏳',
    title: { ar: 'مؤقّت عد تنازلي', en: 'Countdown Timer' , fr: 'Minuteur compte à rebours', hi: 'काउंटडाउन टाइमर', ur: 'کاؤنٹ ڈاؤن ٹائمر', bn: 'কাউন্টডাউন টাইমার', ne: 'काउन्टडाउन टाइमर' },
    desc: { ar: 'عداد تنازلي لمناسبة أو حدث قادم', en: 'A countdown timer for an upcoming event' , fr: 'Un compte à rebours pour un événement à venir', hi: 'आगामी कार्यक्रम के लिए एक काउंटडाउन टाइमर', ur: 'آنے والے ایونٹ کے لیے ایک کاؤنٹ ڈاؤن ٹائمر', bn: 'আসন্ন অনুষ্ঠান বা ইভেন্টের জন্য একটি কাউন্টডাউন টাইমার', ne: 'आगामी कार्यक्रम वा घटनाको लागि काउन्टडाउन टाइमर' },
    code: `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',Tahoma,sans-serif}
body{background:#0a0b10;color:#eef0f6;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:30px}
h1{color:#7c5cff;font-size:26px}
.boxes{display:flex;gap:16px}
.box{background:#12141d;border:1px solid #262b36;border-radius:14px;padding:20px 24px;text-align:center;min-width:80px}
.box .num{font-size:36px;font-weight:800;color:#00e5a0}
.box .label{font-size:12px;color:#a7adc0;margin-top:6px}
input[type=date]{margin-top:10px;padding:10px 14px;border-radius:10px;border:1px solid #262b36;background:#12141d;color:#eef0f6}
</style></head><body>
<h1>⏳ العد التنازلي لمناسبتك</h1>
<div class="boxes">
  <div class="box"><div class="num" id="days">00</div><div class="label">يوم</div></div>
  <div class="box"><div class="num" id="hours">00</div><div class="label">ساعة</div></div>
  <div class="box"><div class="num" id="mins">00</div><div class="label">دقيقة</div></div>
  <div class="box"><div class="num" id="secs">00</div><div class="label">ثانية</div></div>
</div>
<input type="date" id="targetDate">
<script>
const dateInput = document.getElementById('targetDate');
let target = new Date(Date.now() + 7*24*60*60*1000);
dateInput.valueAsDate = target;
dateInput.addEventListener('change', () => { target = new Date(dateInput.value); });
function update(){
  const diff = target - new Date();
  if(diff <= 0){ ['days','hours','mins','secs'].forEach(id=>document.getElementById(id).textContent='00'); return; }
  const d = Math.floor(diff/86400000);
  const h = Math.floor((diff%86400000)/3600000);
  const m = Math.floor((diff%3600000)/60000);
  const s = Math.floor((diff%60000)/1000);
  document.getElementById('days').textContent = String(d).padStart(2,'0');
  document.getElementById('hours').textContent = String(h).padStart(2,'0');
  document.getElementById('mins').textContent = String(m).padStart(2,'0');
  document.getElementById('secs').textContent = String(s).padStart(2,'0');
}
setInterval(update, 1000); update();
</script>
</body></html>`
  },
  {
    id: 'pricing',
    icon: '💳',
    title: { ar: 'صفحة تسعير', en: 'Pricing Page' , fr: 'Page de tarification', hi: 'प्राइसिंग पेज', ur: 'پرائسنگ پیج', bn: 'প্রাইসিং পেজ', ne: 'मूल्य निर्धारण पेज' },
    desc: { ar: 'صفحة عرض خطط اشتراك بأسلوب احترافي', en: 'A professional pricing plans page' , fr: 'Une page professionnelle de plans tarifaires', hi: 'एक पेशेवर मूल्य निर्धारण योजना पेज', ur: 'ایک پیشہ ورانہ پرائسنگ پلانز پیج', bn: 'একটি পেশাদার মূল্য পরিকল্পনা পেজ', ne: 'एक व्यावसायिक मूल्य योजना पेज' },
    code: `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',Tahoma,sans-serif}
body{background:#0a0b10;color:#eef0f6;min-height:100vh;padding:60px 20px}
h1{text-align:center;margin-bottom:8px;font-size:32px}
p.sub{text-align:center;color:#a7adc0;margin-bottom:40px}
.plans{display:flex;gap:24px;flex-wrap:wrap;justify-content:center;max-width:1000px;margin:0 auto}
.plan{background:#12141d;border:1px solid #262b36;border-radius:20px;padding:34px 28px;width:270px;text-align:center;position:relative}
.plan.featured{border-color:#7c5cff;box-shadow:0 0 40px #7c5cff33}
.badge{position:absolute;top:-14px;left:50%;transform:translateX(-50%);background:#7c5cff;color:#fff;font-size:12px;padding:4px 14px;border-radius:20px;font-weight:700}
.plan h3{font-size:20px;margin-bottom:6px}
.plan .price{font-size:38px;font-weight:800;margin:16px 0;color:#00e5a0}
.plan .price span{font-size:14px;color:#a7adc0;font-weight:400}
.plan ul{list-style:none;text-align:right;margin:20px 0;color:#a7adc0;font-size:14px}
.plan ul li{padding:8px 0;border-bottom:1px solid #1e2130}
.plan button{width:100%;padding:12px;border:none;border-radius:10px;background:#1e2130;color:#eef0f6;font-weight:700;cursor:pointer;margin-top:10px}
.plan.featured button{background:#7c5cff}
</style></head><body>
<h1>💳 اختر خطتك</h1>
<p class="sub">أسعار بسيطة وشفافة تناسب احتياجك</p>
<div class="plans">
  <div class="plan"><h3>مجانية</h3><div class="price">0<span> ر.س/شهر</span></div><ul><li>20 رسالة يوميًا</li><li>مزود واحد فقط</li><li>دعم أساسي</li></ul><button>ابدأ الآن</button></div>
  <div class="plan featured"><div class="badge">الأكثر شعبية</div><h3>احترافية</h3><div class="price">5<span>$/شهر</span></div><ul><li>100 رسالة يوميًا</li><li>كل المزودين</li><li>دعم أولوية</li></ul><button>اشترك الآن</button></div>
  <div class="plan"><h3>أعمال</h3><div class="price">15<span>$/شهر</span></div><ul><li>300 رسالة يوميًا</li><li>كل الميزات</li><li>دعم مخصص 24/7</li></ul><button>اشترك الآن</button></div>
</div>
</body></html>`
  },
  {
    id: 'contact',
    icon: '📬',
    title: { ar: 'نموذج تواصل', en: 'Contact Form' , fr: 'Formulaire de contact', hi: 'संपर्क फ़ॉर्म', ur: 'رابطہ فارم', bn: 'যোগাযোগ ফর্ম', ne: 'सम्पर्क फारम' },
    desc: { ar: 'نموذج تواصل بسيط وأنيق لجمع الرسائل', en: 'A simple, elegant contact form to collect messages' , fr: 'Un formulaire de contact simple et élégant pour recueillir des messages', hi: 'संदेश एकत्र करने के लिए एक सरल, सुरुचिपूर्ण संपर्क फ़ॉर्म', ur: 'پیغامات جمع کرنے کے لیے ایک سادہ اور خوبصورت رابطہ فارم', bn: 'বার্তা সংগ্রহের জন্য একটি সহজ ও মার্জিত যোগাযোগ ফর্ম', ne: 'सन्देशहरू सङ्कलन गर्न सरल र सुरुचिपूर्ण सम्पर्क फारम' },
    code: `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',Tahoma,sans-serif}
body{background:#0a0b10;color:#eef0f6;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#12141d;border:1px solid #262b36;border-radius:20px;padding:40px;width:100%;max-width:440px}
h1{text-align:center;margin-bottom:24px;color:#7c5cff}
label{display:block;margin-bottom:6px;font-size:13px;color:#a7adc0}
input,textarea{width:100%;padding:12px;border-radius:10px;border:1px solid #262b36;background:#0a0b10;color:#eef0f6;margin-bottom:16px;font-family:inherit;font-size:14px}
textarea{resize:vertical;min-height:100px}
button{width:100%;padding:14px;border:none;border-radius:10px;background:#7c5cff;color:#fff;font-weight:700;font-size:15px;cursor:pointer}
#msg{text-align:center;margin-top:14px;color:#00e5a0;font-size:14px;min-height:20px}
</style></head><body>
<div class="card">
  <h1>📬 تواصل معنا</h1>
  <form id="form" onsubmit="return sendForm(event)">
    <label>الاسم</label><input type="text" required>
    <label>البريد الإلكتروني</label><input type="email" required>
    <label>رسالتك</label><textarea required></textarea>
    <button type="submit">إرسال</button>
  </form>
  <div id="msg"></div>
</div>
<script>
function sendForm(e){
  e.preventDefault();
  document.getElementById('msg').textContent = '✅ تم إرسال رسالتك بنجاح، سنرد عليك قريبًا!';
  document.getElementById('form').reset();
  return false;
}
</script>
</body></html>`
  },
  {
    id: 'blog',
    icon: '📝',
    title: { ar: 'مدونة بسيطة', en: 'Simple Blog' , fr: 'Blog simple', hi: 'सरल ब्लॉग', ur: 'سادہ بلاگ', bn: 'সাধারণ ব্লগ', ne: 'साधारण ब्लग' },
    desc: { ar: 'صفحة مدونة بمقالات وتصميم نظيف', en: 'A blog page with articles and clean design' , fr: 'Une page de blog avec des articles et un design épuré', hi: 'लेखों और स्वच्छ डिज़ाइन वाला एक ब्लॉग पेज', ur: 'مضامین اور صاف ستھرے ڈیزائن کے ساتھ ایک بلاگ پیج', bn: 'নিবন্ধ ও পরিষ্কার ডিজাইনসহ একটি ব্লগ পেজ', ne: 'लेख र सफा डिजाइनसहितको ब्लग पेज' },
    code: `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',Tahoma,sans-serif}
body{background:#0a0b10;color:#eef0f6}
header{text-align:center;padding:50px 20px 30px}
header h1{color:#7c5cff;font-size:32px;margin-bottom:8px}
header p{color:#a7adc0}
.posts{max-width:720px;margin:0 auto;padding:20px;display:flex;flex-direction:column;gap:20px}
.post{background:#12141d;border:1px solid #262b36;border-radius:16px;padding:26px}
.post .meta{color:#7c5cff;font-size:12px;margin-bottom:10px}
.post h2{font-size:20px;margin-bottom:10px}
.post p{color:#a7adc0;font-size:14px;line-height:1.7}
.post a{color:#00e5a0;font-size:13px;font-weight:700;text-decoration:none;display:inline-block;margin-top:12px}
</style></head><body>
<header><h1>📝 مدونتي</h1><p>أفكار وخواطر أشاركها معكم</p></header>
<div class="posts">
  <div class="post"><div class="meta">11 يوليو 2026 · تقنية</div><h2>كيف يغيّر الذكاء الاصطناعي طريقة عملنا؟</h2><p>الذكاء الاصطناعي أصبح جزءًا أساسيًا من حياتنا اليومية، من المساعدات الذكية إلى أدوات الإنتاجية...</p><a href="#">اقرأ المزيد ←</a></div>
  <div class="post"><div class="meta">5 يوليو 2026 · تطوير ذاتي</div><h2>5 عادات تجعلك أكثر إنتاجية</h2><p>الإنتاجية ليست عن العمل أكثر، بل عن العمل بذكاء. في هذا المقال نستعرض عادات بسيطة تحدث فرقًا...</p><a href="#">اقرأ المزيد ←</a></div>
  <div class="post"><div class="meta">1 يوليو 2026 · تصميم</div><h2>أساسيات تصميم واجهة مستخدم ناجحة</h2><p>تصميم واجهة المستخدم ليس فقط عن الشكل، بل عن تجربة المستخدم الكاملة وسهولة الاستخدام...</p><a href="#">اقرأ المزيد ←</a></div>
</div>
</body></html>`
  },
  {
    id: 'memory',
    icon: '🧠',
    title: { ar: 'لعبة الذاكرة', en: 'Memory Game' , fr: 'Jeu de mémoire', hi: 'मेमोरी गेम', ur: 'میموری گیم', bn: 'মেমরি গেম', ne: 'मेमोरी खेल' },
    desc: { ar: 'لعبة بطاقات لتحدي الذاكرة والتركيز', en: 'A card matching game to test memory and focus' , fr: 'Un jeu de cartes pour tester la mémoire et la concentration', hi: 'स्मृति और एकाग्रता परखने के लिए एक कार्ड मिलान खेल', ur: 'یادداشت اور توجہ کو جانچنے کے لیے ایک کارڈ میچنگ گیم', bn: 'স্মৃতি ও মনোযোগ পরীক্ষা করার একটি কার্ড মিলানোর খেলা', ne: 'स्मृति र एकाग्रता जाँच गर्ने कार्ड मिलान खेल' },
    code: `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',Tahoma,sans-serif}
body{background:#0a0b10;color:#eef0f6;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px}
h1{color:#7c5cff}
#status{color:#a7adc0;font-size:14px}
.grid{display:grid;grid-template-columns:repeat(4,70px);gap:10px}
.card{width:70px;height:70px;background:#12141d;border:1px solid #262b36;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:28px;cursor:pointer;user-select:none}
.card.flipped, .card.matched{background:#1e2130;border-color:#7c5cff}
.card.matched{opacity:.5;cursor:default}
button{padding:10px 20px;border:none;border-radius:10px;background:#7c5cff;color:#fff;font-weight:700;cursor:pointer}
</style></head><body>
<h1>🧠 لعبة الذاكرة</h1>
<div id="status">اعثر على كل الأزواج!</div>
<div class="grid" id="grid"></div>
<button onclick="init()">🔄 لعبة جديدة</button>
<script>
const emojis = ['🍎','🍌','🍇','🍉','🍓','🍒','🍍','🥝'];
let cards = [], flipped = [], matched = 0, lock = false;
function init(){
  cards = [...emojis, ...emojis].sort(() => Math.random()-0.5);
  flipped = []; matched = 0; lock = false;
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  document.getElementById('status').textContent = 'اعثر على كل الأزواج!';
  cards.forEach((e,i) => {
    const c = document.createElement('div');
    c.className = 'card';
    c.dataset.i = i;
    c.textContent = '❓';
    c.onclick = () => flip(i);
    grid.appendChild(c);
  });
}
function flip(i){
  if(lock) return;
  const el = document.querySelectorAll('.card')[i];
  if(el.classList.contains('flipped') || el.classList.contains('matched')) return;
  el.classList.add('flipped'); el.textContent = cards[i];
  flipped.push(i);
  if(flipped.length === 2){
    lock = true;
    const [a,b] = flipped;
    const elA = document.querySelectorAll('.card')[a];
    const elB = document.querySelectorAll('.card')[b];
    if(cards[a] === cards[b]){
      elA.classList.add('matched'); elB.classList.add('matched');
      matched++;
      flipped = []; lock = false;
      if(matched === emojis.length) document.getElementById('status').textContent = '🎉 أحسنت! فزت باللعبة';
    } else {
      setTimeout(() => {
        elA.classList.remove('flipped'); elA.textContent = '❓';
        elB.classList.remove('flipped'); elB.textContent = '❓';
        flipped = []; lock = false;
      }, 800);
    }
  }
}
init();
</script>
</body></html>`
  },
  {
    id: 'resume',
    icon: '📄',
    title: { ar: 'سيرة ذاتية', en: 'Resume / CV Page' , fr: 'Page de CV', hi: 'रिज़्यूमे / सीवी पेज', ur: 'ریزیومے / سی وی پیج', bn: 'রিজিউমে / সিভি পেজ', ne: 'रिजुमे / सीभी पेज' },
    desc: { ar: 'صفحة سيرة ذاتية رقمية جاهزة للمشاركة', en: 'A ready-to-share digital resume page' , fr: 'Une page de CV numérique prête à être partagée', hi: 'साझा करने के लिए तैयार एक डिजिटल रिज़्यूमे पेज', ur: 'شیئر کرنے کے لیے تیار ایک ڈیجیٹل ریزیومے پیج', bn: 'শেয়ার করার জন্য প্রস্তুত একটি ডিজিটাল রিজিউমে পেজ', ne: 'साझा गर्न तयार डिजिटल रिजुमे पेज' },
    code: `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',Tahoma,sans-serif}
body{background:#0a0b10;color:#eef0f6;padding:50px 20px}
.wrap{max-width:680px;margin:0 auto;background:#12141d;border:1px solid #262b36;border-radius:20px;padding:40px}
.top{display:flex;gap:20px;align-items:center;margin-bottom:30px}
.avatar{width:90px;height:90px;border-radius:50%;background:linear-gradient(135deg,#7c5cff,#00e5a0);display:flex;align-items:center;justify-content:center;font-size:36px;flex-shrink:0}
.top h1{font-size:24px;margin-bottom:4px}
.top p{color:#a7adc0;font-size:14px}
.section{margin-bottom:26px}
.section h2{color:#7c5cff;font-size:16px;margin-bottom:12px;border-bottom:1px solid #262b36;padding-bottom:6px}
.item{margin-bottom:14px}
.item .role{font-weight:700}
.item .place{color:#a7adc0;font-size:13px}
.item .date{color:#6b7280;font-size:12px;float:left}
.tags{display:flex;flex-wrap:wrap;gap:8px}
.tag{background:#1e2130;padding:6px 14px;border-radius:16px;font-size:13px}
</style></head><body>
<div class="wrap">
  <div class="top"><div class="avatar">👤</div><div><h1>اسمك الكامل</h1><p>مسمى وظيفي — مثل: مطوّر برمجيات</p></div></div>
  <div class="section"><h2>نبذة عني</h2><p style="color:#a7adc0;font-size:14px;line-height:1.7">شخص طموح شغوف بالتقنية، أسعى دائمًا لتطوير مهاراتي وتقديم قيمة حقيقية في كل مشروع أعمل عليه.</p></div>
  <div class="section"><h2>الخبرات</h2>
    <div class="item"><span class="date">2023 - الآن</span><div class="role">مطوّر واجهات أمامية</div><div class="place">اسم الشركة</div></div>
    <div class="item"><span class="date">2021 - 2023</span><div class="role">مطوّر مبتدئ</div><div class="place">اسم الشركة السابقة</div></div>
  </div>
  <div class="section"><h2>المهارات</h2><div class="tags"><div class="tag">HTML/CSS</div><div class="tag">JavaScript</div><div class="tag">React</div><div class="tag">Git</div><div class="tag">UI/UX</div></div></div>
</div>
</body></html>`
  }
];
