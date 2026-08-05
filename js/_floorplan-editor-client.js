/* عميل المحرّر — يعمل داخل صفحة المعاينة (iframe).
 *
 * لماذا محرّر لا رسم ثابت:
 * الترتيب الآلي يرصّ الغرف في صفوف — نِسَب صحيحة ومساحات صحيحة، لكنه ليس
 * توزيعًا معماريًا. والمستخدم يعرف بيته أكثر من أي نموذج: أين يريد المجلس،
 * وأي غرفة على الشارع. فالنموذج يعطي البداية، وهو يضبط.
 *
 * والمساحة تبقى محسوبة في كل لحظة — تُعاد من العرض×الطول بعد كل سحب أو
 * تغيير مقاس. لا يمكن أن يظهر رقم لا يطابق الشكل.
 *
 * pointer events لا mouse: أغلب المستخدمين على الجوال.
 */
(function () {
  'use strict';

  var SNAP = 0.25;                       // متر
  var spec = window.__omranSpec || { floors: [] };
  var M = 30;                            // بكسل لكل متر (يُعاد حسابه للجوال)
  var active = 0;                        // الطابق المعروض
  var selected = null;

  var PALETTE = {
    مجلس: '#F6E4D7', صالة: '#FAF3DC', نوم: '#FCE6D2', حمام: '#DCE9F5',
    مطبخ: '#F5DDEE', كراج: '#E6E6E6', خدامة: '#EDE7DA', مسبح: '#BFE4F2',
    مكتب: '#E4EEDC', مخزن: '#EAEAEA', سلم: '#E0DCE8',
  };
  function colorFor(n) {
    n = String(n || '');
    for (var k in PALETTE) if (n.indexOf(k) !== -1) return PALETTE[k];
    return '#F0EFEA';
  }
  function snap(v) { return Math.max(SNAP, Math.round(v / SNAP) * SNAP); }
  function fmt(v) { return String(Math.round(v * 100) / 100); }

  /* أول تحميل: نوزّع الغرف صفوفًا كبداية، ثم يعدّل المستخدم. */
  function seedPositions() {
    var pw = Number(spec.plotWidth) || 15;
    (spec.floors || []).forEach(function (f) {
      var x = 0, y = 0, rowH = 0;
      (f.rooms || []).forEach(function (r) {
        r.w = Number(r.w) || 3; r.h = Number(r.h) || 3;
        if (typeof r.x === 'number' && typeof r.y === 'number') return;
        if (x + r.w > pw + 0.01) { x = 0; y += rowH; rowH = 0; }
        r.x = x; r.y = y; x += r.w; rowH = Math.max(rowH, r.h);
      });
    });
  }

  function floorDepth(f) {
    return (f.rooms || []).reduce(function (m, r) { return Math.max(m, (r.y || 0) + r.h); }, 0);
  }
  function floorArea(f) {
    return (f.rooms || []).reduce(function (s, r) { return s + r.w * r.h; }, 0);
  }

  /* تداخل الغرف — لا نمنعه (قد يريد المستخدم غرفة داخل أخرى مؤقتًا) لكن نُظهره. */
  function overlaps(f, room) {
    return (f.rooms || []).some(function (o) {
      if (o === room) return false;
      return room.x < o.x + o.w - 0.01 && o.x < room.x + room.w - 0.01 &&
             room.y < o.y + o.h - 0.01 && o.y < room.y + room.h - 0.01;
    });
  }

  var $ = function (id) { return document.getElementById(id); };

  function render() {
    var f = spec.floors[active];
    if (!f) return;
    var pw = Number(spec.plotWidth) || 15;
    var avail = Math.min(document.body.clientWidth - 28, 900);
    M = Math.max(14, Math.floor(avail / pw));
    var depth = Math.max(floorDepth(f), 4);

    var stage = $('stage');
    stage.style.width = (pw * M) + 'px';
    stage.style.height = (depth * M) + 'px';
    stage.innerHTML = '';

    (f.rooms || []).forEach(function (r, i) {
      var el = document.createElement('div');
      el.className = 'room' + (selected === r ? ' sel' : '') + (overlaps(f, r) ? ' clash' : '');
      el.style.cssText = 'left:' + (r.x * M) + 'px;top:' + (r.y * M) + 'px;width:' + (r.w * M) +
        'px;height:' + (r.h * M) + 'px;background:' + colorFor(r.name);
      el.dataset.i = i;
      el.innerHTML =
        '<div class="rn">' + String(r.name).replace(/</g, '&lt;') + '</div>' +
        '<div class="ra">' + fmt(r.w * r.h) + ' م²</div>' +
        '<div class="rd">' + fmt(r.w) + '×' + fmt(r.h) + '</div>' +
        '<div class="grip" data-grip="1"></div>';
      stage.appendChild(el);
    });

    $('total').textContent = fmt(floorArea(f)) + ' م²';
    $('depth').textContent = fmt(depth) + ' م';
    $('pw').textContent = fmt(pw) + ' م';
    var grand = (spec.floors || []).reduce(function (s, x) { return s + floorArea(x); }, 0);
    $('grand').textContent = fmt(grand) + ' م²';
    renderTabs();
    renderPanel();
  }

  function renderTabs() {
    var t = $('tabs');
    t.innerHTML = (spec.floors || []).map(function (f, i) {
      return '<button class="tab' + (i === active ? ' on' : '') + '" data-f="' + i + '">' +
        String(f.name || ('طابق ' + (i + 1))).replace(/</g, '&lt;') + '</button>';
    }).join('');
  }

  function renderPanel() {
    var p = $('panel');
    if (!selected) { p.innerHTML = '<div class="hint">اضغط على أي غرفة لتغيير اسمها أو مقاسها · اسحبها لتحريكها · اسحب الزاوية لتكبيرها</div>'; return; }
    p.innerHTML =
      '<div class="row"><label>الاسم</label><input id="fName" value="' + String(selected.name).replace(/"/g, '&quot;') + '"></div>' +
      '<div class="row"><label>العرض (م)</label><input id="fW" type="number" step="0.25" min="0.5" value="' + fmt(selected.w) + '"></div>' +
      '<div class="row"><label>الطول (م)</label><input id="fH" type="number" step="0.25" min="0.5" value="' + fmt(selected.h) + '"></div>' +
      '<div class="row"><span class="area">المساحة: <b>' + fmt(selected.w * selected.h) + ' م²</b></span>' +
      '<button id="fDel" class="danger">حذف</button></div>';

    ['fName', 'fW', 'fH'].forEach(function (id) {
      var el = $(id);
      el.oninput = function () {
        if (!selected) return;
        if (id === 'fName') selected.name = el.value || 'غرفة';
        else {
          var v = parseFloat(el.value);
          if (!isFinite(v) || v <= 0) return;
          if (id === 'fW') selected.w = v; else selected.h = v;
        }
        var keep = selected;
        render();
        selected = keep;
        try { $(id).focus(); } catch (e) { /* أُعيد الرسم */ }
      };
    });
    $('fDel').onclick = function () {
      var f = spec.floors[active];
      f.rooms = f.rooms.filter(function (r) { return r !== selected; });
      selected = null; render();
    };
  }

  /* ───────── السحب وتغيير المقاس ───────── */
  var drag = null;

  function onDown(e) {
    var el = e.target.closest ? e.target.closest('.room') : null;
    if (!el) { selected = null; render(); return; }
    var f = spec.floors[active];
    var r = f.rooms[+el.dataset.i];
    selected = r;
    var isGrip = e.target.dataset && e.target.dataset.grip;
    drag = {
      room: r, mode: isGrip ? 'size' : 'move',
      px: e.clientX, py: e.clientY,
      ox: r.x, oy: r.y, ow: r.w, oh: r.h,
    };
    el.setPointerCapture && el.setPointerCapture(e.pointerId);
    render();
    e.preventDefault();
  }

  function onMove(e) {
    if (!drag) return;
    var dx = (e.clientX - drag.px) / M, dy = (e.clientY - drag.py) / M;
    // الواجهة RTL: السحب يمينًا يعني نقصان x
    if (document.dir === 'rtl' || document.documentElement.dir === 'rtl') dx = -dx;
    var pw = Number(spec.plotWidth) || 15;
    if (drag.mode === 'move') {
      drag.room.x = Math.max(0, Math.min(pw - drag.room.w, snap(drag.ox + dx)));
      drag.room.y = Math.max(0, snap(drag.oy + dy));
    } else {
      drag.room.w = Math.max(0.5, Math.min(pw - drag.room.x, snap(drag.ow + dx)));
      drag.room.h = Math.max(0.5, snap(drag.oh + dy));
    }
    render();
    e.preventDefault();
  }

  function onUp() { drag = null; }

  function addRoom() {
    var f = spec.floors[active];
    f.rooms = f.rooms || [];
    var r = { name: 'غرفة', w: 4, h: 3.5, x: 0, y: floorDepth(f) };
    f.rooms.push(r); selected = r; render();
  }

  function addFloor() {
    spec.floors.push({ name: 'طابق ' + (spec.floors.length + 1), rooms: [] });
    active = spec.floors.length - 1; selected = null; render();
  }

  /* ───────── توليد الواجهة من المخطط المُعدَّل ───────── */
  function requestView(view, btn) {
    var label = btn.textContent;
    btn.disabled = true; btn.textContent = '… جارٍ التوليد';
    var id = Date.now();
    function onMsg(e) {
      var d = e.data;
      if (!d || d.__omranViewOut !== 1 || d.id !== id) return;
      window.removeEventListener('message', onMsg);
      btn.disabled = false; btn.textContent = label;
      var out = $('views');
      if (d.ok) {
        var fig = document.createElement('figure');
        fig.style.cssText = 'margin:12px 0';
        fig.innerHTML = '<img src="' + d.dataUrl + '" style="width:100%;border-radius:12px;display:block">' +
          '<figcaption style="font-size:12px;color:#777;margin-top:6px;text-align:center">' +
          label + ' — مولّد من المخطط كما عدّلته</figcaption>';
        out.appendChild(fig);
      } else {
        var p = document.createElement('p');
        p.style.cssText = 'color:#a33;font-size:13px';
        p.textContent = '⚠️ ' + (d.error || 'تعذّر التوليد');
        out.appendChild(p);
      }
    }
    window.addEventListener('message', onMsg);
    // نرسل المواصفات الحالية — أي بعد تعديلات المستخدم، لا الأصلية
    parent.postMessage({ __omranView: 1, id: id, view: view, spec: spec }, '*');
  }

  function boot() {
    seedPositions();
    render();
    var stage = $('stage');
    stage.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    $('tabs').addEventListener('click', function (e) {
      var b = e.target.closest('.tab'); if (!b) return;
      active = +b.dataset.f; selected = null; render();
    });
    $('addRoom').onclick = addRoom;
    $('addFloor').onclick = addFloor;
    document.querySelectorAll('.ov-btn').forEach(function (b) {
      b.onclick = function () { requestView(b.dataset.view, b); };
    });
    window.addEventListener('resize', function () { render(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
