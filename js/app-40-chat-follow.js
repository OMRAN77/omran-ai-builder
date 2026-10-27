/* v-scroll-free (المالك ١٣ أكتوبر: «حرية الحركة داخل المحادثة — اذا فيه محادثة تنزل معها ونفس الوقت اقدر احركها»): قرار ملاحقة الأسفل
   أثناء البثّ صار حالة واحدة تغيّرها حركة المستخدم نفسه، لا فرق scrollTop بين نبضتين. كان: البثّ يكتب scrollTop كلّ ٣٠–١٥٠مل،
   و«تحرّر» المستخدم لا يُكشف إلّا إن صعد ٤٠px بين نبضتين — فالسحب البطيء بالإصبع يُشدّ للأسفل في كلّ نبضة (لا يتحرّك)، والتحرّر
   إن حصل يبقى لبقيّة الدور حتّى لو رجع للأسفل.
   - لا كتابة أبدًا والإصبع على الشاشة أو الشريط ممسوك، ولا خلال مهلة قصيرة بعد عجلة أو مفتاح أو رفع الإصبع (الانزلاق يكمل).
   - يتحرّر (لا ملاحقة): صعود القائمة نفسها خلال تلك الأفعال — فعجلة داخل صندوق كود، أو سحب في محادثة قصيرة لا تتمرّر، لا تحرّر.
   - يعود للملاحقة: نزوله بنفسه قرب الأسفل (٤٨px)، أو زرّ ↓، أو إرسال رسالة، أو فتح محادثة أخرى.
   - تقلّص المحتوى (scrollTop ينقص بلا حركة مستخدم) لا يحرّر ولا يعيد. */
(function(){
  var el = document.getElementById('messages');
  var NEAR = 48, COOL = 700, WHEEL = 400, KEY = 600;
  var stick = true, touching = false, dragging = false, coolUntil = 0, lastTop = 0, lastH = 0, lastId;
  function gap(){ return el ? el.scrollHeight - el.scrollTop - el.clientHeight : 0; }
  function now(){ return Date.now(); }
  function hold(ms){ var u = now() + ms; if(u > coolUntil) coolUntil = u; }
  window.omranChatFollow = {
    /** هل يجوز للبثّ أن يمرّر للأسفل الآن؟ */
    follow: function(){ return stick && !touching && !dragging && now() >= coolUntil; },
    /** إرسال رسالة أو زرّ ↓: الملاحقة من جديد. */
    stickNow: function(){ stick = true; coolUntil = 0; },
    /** إعادة رسم القائمة: محادثة أخرى = من الأسفل؛ وإلّا قرار الملاحقة نفسه. */
    forRender: function(id){ if(id !== lastId){ lastId = id; stick = true; coolUntil = 0; } return window.omranChatFollow.follow(); },
    _state: function(){ return { stick: stick, touching: touching, dragging: dragging, coolUntil: coolUntil }; }, // للاختبار
  };
  if(!el) return;
  lastTop = el.scrollTop; lastH = el.scrollHeight;
  el.addEventListener('wheel', function(){ hold(WHEEL); }, { passive: true });
  el.addEventListener('touchstart', function(){ touching = true; }, { passive: true });
  el.addEventListener('touchmove', function(){ touching = true; }, { passive: true });
  var up = function(){ if(!touching) return; touching = false; hold(COOL); };
  el.addEventListener('touchend', up, { passive: true });
  el.addEventListener('touchcancel', up, { passive: true });
  el.addEventListener('pointerdown', function(e){ if(e.target === el && e.pointerType === 'mouse') dragging = true; }, { passive: true });
  window.addEventListener('pointerup', function(){ if(dragging){ dragging = false; hold(WHEEL); } }, { passive: true });
  document.addEventListener('keydown', function(e){
    var tg = e.target, tag = tg && tg.tagName;
    if(tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT' || (tg && tg.isContentEditable)) return;
    if(e.key === 'PageUp' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'PageDown' || e.key === 'ArrowDown' || e.key === 'End' || e.key === ' ') hold(KEY);
  });
  el.addEventListener('scroll', function(){
    var t = el.scrollTop, h = el.scrollHeight, upward = t < lastTop - 1 && h >= lastH - 1;
    if(upward){ if(dragging || touching || now() < coolUntil) stick = false; }
    else if(t >= lastTop && gap() < NEAR) stick = true; // نزل بنفسه إلى الأسفل (أو كتبنا نحن هناك)
    lastTop = t; lastH = h;
  }, { passive: true });
})();
