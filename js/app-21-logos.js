// app-logos.js — v1 — مكتبة شعارات العالم لـ عمران AI
// يُظهر نافذة بحث يختار منها المستخدم الشعار ويدخله في التصميم
(function(){
'use strict';

const CAT_LABELS = {
  sa:'السعودية 🇸🇦', ae:'الإمارات 🇦🇪', kw:'الكويت 🇰🇼',
  qa:'قطر 🇶🇦', bh:'البحرين 🇧🇭', om:'عُمان 🇴🇲',
  jo:'الأردن 🇯🇴', eg:'مصر 🇪🇬', sport:'الرياضة ⚽', intl:'دولي 🌐'
};

// ── CSS ──────────────────────────────────────────────────────────────────────
function injectCss(){
  if(document.getElementById('logoPickerCss')) return;
  const s = document.createElement('style'); s.id = 'logoPickerCss';
  s.textContent = `
#logoPickerOverlay{position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box}
#logoPickerModal{background:var(--surface,#18181f);border:1px solid var(--omGoldSoft,rgba(212,175,55,.18));border-radius:18px;width:min(680px,100%);max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.6)}
#lpHead{display:flex;align-items:center;gap:10px;padding:16px 20px 12px;border-bottom:1px solid var(--omGoldSoft,rgba(212,175,55,.12))}
#lpHead h2{flex:1;margin:0;font-size:17px;font-weight:700;color:var(--text,#fff)}
#lpClose{background:none;border:none;color:var(--text,#fff);font-size:20px;cursor:pointer;padding:4px 8px;border-radius:8px;opacity:.7;line-height:1}
#lpClose:hover{opacity:1;background:rgba(255,255,255,.08)}
#lpSearch{display:flex;gap:8px;padding:12px 20px}
#lpSearchInput{flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;color:var(--text,#fff);padding:9px 14px;font-size:14px;outline:none;font-family:inherit}
#lpSearchInput:focus{border-color:var(--accent-surface,#d4af37)}
#lpSearchBtn{background:var(--accent-surface,#d4af37);border:none;border-radius:10px;color:#000;font-weight:700;padding:9px 18px;cursor:pointer;font-size:13px;white-space:nowrap}
#lpCats{display:flex;gap:6px;padding:0 20px 12px;flex-wrap:wrap}
.lpCat{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:8px;color:var(--text,#fff);padding:5px 12px;font-size:12px;cursor:pointer;transition:all .15s}
.lpCat:hover,.lpCat.on{background:var(--accent-surface,rgba(212,175,55,.2));border-color:var(--accent-surface,#d4af37)}
#lpBody{flex:1;overflow-y:auto;padding:4px 16px 16px}
#lpGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-top:8px}
.lpCard{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:14px 10px 10px;display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;transition:all .15s;text-align:center}
.lpCard:hover{background:rgba(255,255,255,.09);border-color:var(--accent-surface,#d4af37);transform:translateY(-2px)}
.lpCard img{width:68px;height:68px;object-fit:contain;border-radius:6px;background:rgba(255,255,255,.06);padding:4px}
.lpCard .lpCardLbl{font-size:11px;color:rgba(255,255,255,.75);line-height:1.3;max-width:100%}
.lpCardPlaceholder{width:68px;height:68px;border-radius:6px;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;font-size:26px}
#lpStatus{text-align:center;padding:24px;color:rgba(255,255,255,.45);font-size:13px}
.lpSec{font-size:12px;font-weight:700;color:var(--accent-surface,#d4af37);text-transform:uppercase;letter-spacing:.05em;padding:8px 4px 4px}
`;
  document.head.appendChild(s);
}

// ── الحالة ───────────────────────────────────────────────────────────────────
let _onPick = null; // callback(url, label)
let _activeCat = '';
let _allItems = []; // القائمة المنتقاة الكاملة
let _searchTimeout = null;

// ── API ──────────────────────────────────────────────────────────────────────
async function apiGet(params){
  const url = '/api/logos?' + new URLSearchParams(params);
  const r = await fetch(url);
  if(!r.ok) throw new Error('logos API ' + r.status);
  return r.json();
}

// ── بناء الكارت ───────────────────────────────────────────────────────────────
function makeCard(label, imgUrl, onPick){
  const card = document.createElement('div');
  card.className = 'lpCard';
  if(imgUrl){
    const img = document.createElement('img');
    img.src = imgUrl;
    img.alt = label;
    img.loading = 'lazy';
    img.onerror = () => { img.remove(); const p = document.createElement('div'); p.className='lpCardPlaceholder'; p.textContent='🏛️'; card.prepend(p); };
    card.appendChild(img);
  } else {
    const p = document.createElement('div'); p.className='lpCardPlaceholder'; p.textContent='🏛️'; card.appendChild(p);
  }
  const lbl = document.createElement('div'); lbl.className='lpCardLbl'; lbl.textContent=label;
  card.appendChild(lbl);
  card.onclick = () => { onPick(imgUrl, label); };
  return card;
}

// ── عرض القائمة المنتقاة لفئة ─────────────────────────────────────────────
async function showCurated(cat, grid, status){
  status.textContent = 'جاري التحميل…';
  grid.innerHTML = '';
  try{
    const items = cat ? _allItems.filter(x=>x.cat===cat) : _allItems;
    if(!items.length){ status.textContent = 'لا توجد شعارات لهذه الفئة'; return; }
    status.textContent = '';
    for(const item of items){
      const card = makeCard(item.label, null, async (_, lbl) => {
        status.textContent = 'جاري البحث عن ' + lbl + '…';
        grid.innerHTML = '';
        try{
          const res = await apiGet({ action:'resolve', id: item.id });
          status.textContent = '';
          if(!res.results || !res.results.length){ status.textContent = 'لم يُعثر على صورة'; return; }
          renderWikiResults(res.results, grid, status);
        } catch(e){ status.textContent = 'خطأ: ' + e.message; }
      });
      // لود الصورة من الـ resolve في الخلفية
      grid.appendChild(card);
    }
  } catch(e){ status.textContent = 'خطأ: ' + e.message; }
}

// ── عرض نتائج ويكيميديا ──────────────────────────────────────────────────────
function renderWikiResults(results, grid, status, label=''){
  grid.innerHTML = '';
  status.textContent = '';
  if(!results.length){ status.textContent = 'لم يُعثر على نتائج'; return; }
  results.forEach(r => {
    const card = makeCard(r.title || label, r.url, (url, lbl) => {
      if(_onPick) _onPick(url, lbl);
      closePicker();
    });
    grid.appendChild(card);
  });
}

// ── بحث ─────────────────────────────────────────────────────────────────────
async function doSearch(q, grid, status, catBtns){
  if(!q.trim()){ showCurated(_activeCat, grid, status); return; }
  status.textContent = 'جاري البحث…';
  grid.innerHTML = '';
  catBtns.forEach(b=>b.classList.remove('on'));
  _activeCat = '';
  try{
    const data = await apiGet({ action:'search', q });
    status.textContent = '';
    const curated = data.curated || [];
    const wiki = data.wiki || [];

    if(curated.length){
      const sec = document.createElement('div'); sec.className='lpSec'; sec.textContent='منتقاة'; grid.appendChild(sec);
      curated.forEach(item => {
        const card = makeCard(item.label, null, async (_,lbl) => {
          status.textContent = 'جاري البحث عن ' + lbl + '…';
          grid.innerHTML = '';
          const res = await apiGet({ action:'resolve', id: item.id });
          renderWikiResults(res.results||[], grid, status, lbl);
        });
        grid.appendChild(card);
      });
    }

    if(wiki.length){
      if(curated.length){ const sec=document.createElement('div'); sec.className='lpSec'; sec.textContent='نتائج Wikimedia'; grid.appendChild(sec); }
      renderWikiResults(wiki, grid, status);
    }

    if(!curated.length && !wiki.length) status.textContent = 'لا نتائج — جرّب كلمات أخرى';
  } catch(e){ status.textContent = 'خطأ: ' + e.message; }
}

// ── فتح النافذة ───────────────────────────────────────────────────────────────
async function openPicker(onPick){
  _onPick = onPick;
  injectCss();

  const ov = document.createElement('div'); ov.id='logoPickerOverlay';
  ov.innerHTML = `
<div id="logoPickerModal">
  <div id="lpHead">
    <h2>🏛️ مكتبة الشعارات</h2>
    <button id="lpClose" title="إغلاق">✕</button>
  </div>
  <div id="lpSearch">
    <input id="lpSearchInput" type="search" placeholder="ابحث: شرطة دبي، حرس الحدود، الهلال…" autocomplete="off" dir="auto">
    <button id="lpSearchBtn">بحث</button>
  </div>
  <div id="lpCats"></div>
  <div id="lpBody">
    <div id="lpGrid"></div>
    <div id="lpStatus">جاري التحميل…</div>
  </div>
</div>`;
  document.body.appendChild(ov);

  const grid   = ov.querySelector('#lpGrid');
  const status = ov.querySelector('#lpStatus');
  const input  = ov.querySelector('#lpSearchInput');
  const catsEl = ov.querySelector('#lpCats');

  // إغلاق
  ov.querySelector('#lpClose').onclick = closePicker;
  ov.onclick = e => { if(e.target === ov) closePicker(); };
  document.addEventListener('keydown', onEsc);

  // فئات
  const catBtns = [];
  Object.entries(CAT_LABELS).forEach(([k,v]) => {
    const b = document.createElement('button'); b.className='lpCat'; b.textContent=v; b.dataset.cat=k;
    b.onclick = () => {
      _activeCat = k;
      catBtns.forEach(x=>x.classList.remove('on')); b.classList.add('on');
      input.value = '';
      showCurated(k, grid, status);
    };
    catBtns.push(b); catsEl.appendChild(b);
  });

  // بحث
  const doSrch = () => doSearch(input.value.trim(), grid, status, catBtns);
  ov.querySelector('#lpSearchBtn').onclick = doSrch;
  input.addEventListener('keydown', e => { if(e.key==='Enter') doSrch(); });
  input.addEventListener('input', () => {
    clearTimeout(_searchTimeout);
    if(!input.value.trim()){ showCurated(_activeCat, grid, status); return; }
    _searchTimeout = setTimeout(doSrch, 600);
  });

  // تحميل القائمة المنتقاة
  try{
    const data = await apiGet({ action:'popular' });
    _allItems = data.items || [];
    showCurated('', grid, status);
  } catch(e){ status.textContent = 'خطأ في التحميل: ' + e.message; }
}

function closePicker(){
  const ov = document.getElementById('logoPickerOverlay');
  if(ov) ov.remove();
  document.removeEventListener('keydown', onEsc);
}
function onEsc(e){ if(e.key==='Escape') closePicker(); }

// ── تصدير ────────────────────────────────────────────────────────────────────
window.__logoPickerOpen = openPicker;

// ── زر في شريط الأدوات (يُربط بعد DOMContentLoaded) ─────────────────────────
function mountLogoBtn(){
  /* v-logos-off (أمر المالك ٢٩ أغسطس): بطاقة «شعارات العالم» تُحذف من مربع
     الأدوات نهائيًا — الدالة تخرج مبكرًا فلا يُنشأ الزر، وبقية المكتبة
     تبقى خاملة كما هي (اختبار fashion-locks يفحص نصوصها أدناه). */
  return;
  // زر داخل مربع الأدوات.
  // v-wiring-sweep: toolsBox/toolsBoxInner لم يعودا موجودَين بعد إعادة تصميم
  // الواجهة، وكان الحارس القديم يخرج مبكرًا فلا يظهر زر «شعارات العالم» أبدًا.
  // نقطة الإدراج الحقيقية هي جوار زر استوديو الإعلانات، وتكفي وحدها.
  const toolsBox = document.getElementById('toolsBox') || document.getElementById('toolsBoxInner');
  const adBtnAnchor = document.getElementById('btnAdStudio') || document.getElementById('btnStudioAI');
  if((!toolsBox && !adBtnAnchor) || document.getElementById('btnLogoLib')) return;

  const btn = document.createElement('button');
  btn.id = 'btnLogoLib';
  btn.type = 'button';
  btn.className = 'btn';
  btn.title = 'مكتبة الشعارات';
  btn.innerHTML = '<svg class="hmIcon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="6"></circle><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"></path></svg> <span class="btnLabel">شعارات العالم</span>';
  btn.onclick = () => {
    openPicker((url, label) => {
      // أرسل الشعار كمرفق صورة للمحادثة
      if(window.__omranAttachFromUrl){
        window.__omranAttachFromUrl(url, label + '.png');
        return;
      }
      // بديل: أرسل كرسالة للمحادثة
      const prompt = document.getElementById('prompt');
      if(prompt){ prompt.value = 'استخدم هذا الشعار في التصميم: ' + url; prompt.dispatchEvent(new Event('input',{bubbles:true})); }
    });
  };

  // إدراج في قائمة الأدوات
  const adBtn = document.getElementById('btnAdStudio') || document.getElementById('btnStudioAI');
  if(adBtn) adBtn.parentNode.insertBefore(btn, adBtn.nextSibling);
  else toolsBox.appendChild(btn);
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(mountLogoBtn, 1000));
else setTimeout(mountLogoBtn, 1000);

})();
