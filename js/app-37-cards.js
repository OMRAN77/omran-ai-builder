/* ───────── v-cards: بطاقات الخيارات في المحادثة (أمر المالك ١٢ أكتوبر، لقطات جوجل وChatGPT: «اذا اريد اطالب اي شي تطلعي
 * نفس هذي الأفكار — شي نظامي… نماذج وعقب يعطيني المواقع… والتتبع على نفس الموضوع ويعطيه الأفضل») ─────────
 * الخادم يبثّ حدث `cards` { q, kind, chips[], items[{title,url,site,image,price,snippet}] } من أداة show_cards، ويحفظه العميل
 * في رسالة المساعد (m.cards) فيُرسم هنا مع كلّ عرض: رقائق الاقتراحات (بأزرار [[OPT]] نفسها: ضغطها = إرسال) ثمّ شبكة بطاقات
 * عموديّة تتكيّف بالعرض — لا ماسح أفقيّ (فخّ هواوي v-shelf-nocomposite: تمرير أفقيّ داخل نافذة تتمرّر يفرغ عند السحب).
 * المواقع تحت الردّ بزرّ «المصادر» القائم (حدث sources). النصوص بالمفاتيح stCards/trCards/trCardsNone/cardsOpen (١٤ لغة).
 * سطح المكتب أوّلًا (٤ أعمدة فأكثر)، والجوّال عمودان. DOM فقط — لا innerHTML بنصّ من الشبكة. */
(function(){
  'use strict';
  function css(){
    if(document.getElementById('omranCardsCss')) return;
    var st = document.createElement('style');
    st.id = 'omranCardsCss';
    st.textContent = '.omCardsWrap{margin:6px 0 10px;max-width:100%;}'
      + '.omCards{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:10px;margin-top:8px;}' /* عمود المحادثة على سطح المكتب ~٣٠٠px (المعاينة بجانبه) ← عمودان فأكثر */
      + 'html.mobile-ui .omCards{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}'
      + '.msg .omCard,.msg .omCard:hover,.msg .omCard:visited{display:flex;flex-direction:column;min-width:0;border:1px solid var(--border,rgba(255,255,255,.12));border-radius:var(--r-3,14px);background:var(--panel2,#161c2a);overflow:hidden;color:var(--text,#eee) !important;text-decoration:none !important;transition:border-color .15s,transform .15s;}' /* قواعد روابط الرسالة والثيمات (لون ذهبيّ وتسطير) أعلى تخصيصًا — البطاقة رابط فتُثبَّت بـ!important */
      + '.msg .omCard *{text-decoration:none !important;}'
      + '.omCard:hover{border-color:var(--accent2,#a78bfa);transform:translateY(-1px);}'
      + '.omCardImg{position:relative;aspect-ratio:1/1;max-height:180px;background:var(--panel,#1c2230);display:flex;align-items:center;justify-content:center;overflow:hidden;}'
      + '.omCardImg img{width:100%;height:100%;object-fit:cover;display:block;}'
      + '.omCardImg img.omCardFav{width:36px;height:36px;object-fit:contain;opacity:.8;border-radius:8px;}'
      + '.omCardNo{position:absolute;top:6px;inset-inline-start:6px;min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:rgba(0,0,0,.55);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;}'
      + '.omCardBody{display:flex;flex-direction:column;gap:3px;padding:8px 10px 10px;min-width:0;}'
      + '.msg .omCardTitle{color:var(--text,#eee) !important;font-size:13px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}'
      + '.msg .omCardPrice{font-size:14px;font-weight:800;color:var(--accent2,#a78bfa) !important;}'
      + '.msg .omCardSite{font-size:11px;color:var(--muted,#9aa3b2) !important;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center;gap:5px;}'
      + '.omCardSite img{width:12px;height:12px;border-radius:3px;flex:0 0 auto;}'
      + '.msg .omCardOpen{margin-top:4px;align-self:flex-start;font-size:12px;font-weight:700;color:var(--accent2,#a78bfa) !important;}'
      + 'html[data-mode="light"] .omCard{background:#fff;}'
      + 'html[data-mode="light"] .omCardImg{background:#f3f4f8;}';
    document.head.appendChild(st);
  }
  function https(u){ u = String(u || ''); return /^https:\/\//i.test(u) ? u : ''; }
  function fav(site){ return 'https://www.google.com/s2/favicons?sz=64&domain=' + encodeURIComponent(String(site || '')); }
  function tt(k, fb){ try{ var v = (typeof t === 'function') ? t(k) : k; return (v && v !== k) ? v : fb; }catch(e){ return fb; } }
  function chipsRow(chips){
    if(!Array.isArray(chips) || !chips.length) return null;
    if(typeof omranOptCss === 'function') omranOptCss();
    var row = document.createElement('div');
    row.className = 'omranOpts omCardChips';
    chips.slice(0, 6).forEach(function(c){
      var txt = String(c || '').trim(); if(!txt) return;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'omranOpt'; b.textContent = txt;
      b.addEventListener('click', function(){ if(typeof omranSendOption === 'function') omranSendOption(txt); });
      row.appendChild(b);
    });
    return row.childNodes.length ? row : null;
  }
  function card(it, i){
    var url = https(it && it.url); if(!url) return null;
    var a = document.createElement('a');
    a.className = 'omCard'; a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    var im = document.createElement('div'); im.className = 'omCardImg';
    var img = document.createElement('img');
    img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.alt = '';
    var src = https(it.image);
    if(src){ img.src = src; img.addEventListener('error', function(){ img.className = 'omCardFav'; img.src = fav(it.site); }); }
    else { img.className = 'omCardFav'; img.src = fav(it.site); }
    im.appendChild(img);
    var no = document.createElement('span'); no.className = 'omCardNo'; no.textContent = String(i + 1); im.appendChild(no);
    a.appendChild(im);
    var body = document.createElement('div'); body.className = 'omCardBody';
    var ti = document.createElement('div'); ti.className = 'omCardTitle'; ti.textContent = String(it.title || it.site || ''); body.appendChild(ti);
    if(it.price){ var pr = document.createElement('div'); pr.className = 'omCardPrice'; pr.textContent = String(it.price); body.appendChild(pr); }
    var si = document.createElement('div'); si.className = 'omCardSite';
    var fi = document.createElement('img'); fi.src = fav(it.site); fi.alt = ''; fi.loading = 'lazy'; si.appendChild(fi);
    si.appendChild(document.createTextNode(String(it.site || ''))); body.appendChild(si);
    var op = document.createElement('span'); op.className = 'omCardOpen'; op.textContent = tt('cardsOpen', 'افتح') + ' ↗'; body.appendChild(op);
    a.appendChild(body);
    return a;
  }
  window.omranRenderCards = function(cards){
    if(cards && cards.kind === 'call' && typeof window.omranCallCard === 'function') return window.omranCallCard(cards.call, cards); // v-call-agent: بطاقة المكالمة (app-42)
    css();
    var wrap = document.createElement('div');
    wrap.className = 'omCardsWrap';
    wrap.setAttribute('data-keep-emoji', '1');
    var chips = chipsRow(cards && cards.chips); if(chips) wrap.appendChild(chips);
    var items = (cards && Array.isArray(cards.items)) ? cards.items : [];
    var grid = document.createElement('div'); grid.className = 'omCards';
    items.slice(0, 8).forEach(function(it, i){ var c = card(it, i); if(c) grid.appendChild(c); });
    if(grid.childNodes.length) wrap.appendChild(grid);
    return wrap;
  };
})();
