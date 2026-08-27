/* js/app-15-floorplan.js — 🏗️ مولّد المخططات.
 *
 * لماذا لا يرسمه نموذج الصور:
 * ‏Gemini ينتج بكسلات تشبه الأرقام، لا أرقامًا محسوبة. في مخططك السابق كتب
 * «مجلس 150 م²» على غرفة أبعادها 3.00 × 3.80 = 11 م²، و«1100 م²» على غرفة
 * نوم. الرقم الوحيد الصحيح كان حوض السباحة (4 × 2.5 = 10) — لأنه رقم سهل،
 * لا لأنه حُسب. ولا توجد صياغة طلب تصلح هذا: المشكلة في طبيعة الأداة.
 *
 * الحل هنا: النموذج يقرّر الغرف وأبعادها فقط، والحساب والرسم بالكود.
 * فالمساحة لا يمكن أن تكون خاطئة — هي w × h ولا شيء آخر.
 *
 * ونفس ملف المواصفات يغذّي توليد الواجهة، فيستحيل أن يختلف عدد الطوابق أو
 * الغرف بين المخطط والصورة (وهي المشكلة التي أوقفت القسم).
 */
(function () {
  'use strict';

  var M = 34;            // بكسل لكل متر
  var PAD = 56;          // هامش للأبعاد الخارجية
  var WALL = 3;

  var PALETTE = {
    مجلس: '#F6E4D7', صالة: '#FAF3DC', نوم: '#FCE6D2', حمام: '#DCE9F5',
    مطبخ: '#F5DDEE', كراج: '#E6E6E6', خدامة: '#EDE7DA', مسبح: '#BFE4F2',
    مكتب: '#E4EEDC', مخزن: '#EAEAEA', سلم: '#E0DCE8', ممر: '#F4F1EA',
    _افتراضي: '#F0EFEA',
  };

  function colorFor(name) {
    var n = String(name || '');
    for (var k in PALETTE) {
      if (k !== '_افتراضي' && n.indexOf(k) !== -1) return PALETTE[k];
    }
    return PALETTE._افتراضي;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** رقم بمنزلتين بلا أصفار زائدة. */
  function num(v) {
    var n = Math.round(Number(v) * 100) / 100;
    return String(n);
  }

  /**
   * توزيع الغرف على صفوف داخل عرض الأرض.
   * ليس تخطيطًا معماريًا — هو ترتيب صادق يُظهر النسب والمساحات الصحيحة.
   * البديل (ترك النموذج يرسم) يعطي شكلًا أجمل بأرقام مخترعة.
   */
  function packRooms(rooms, plotWidth) {
    var rows = [];
    var row = { items: [], w: 0, h: 0 };
    rooms.forEach(function (r) {
      if (row.items.length && row.w + r.w > plotWidth + 0.001) {
        rows.push(row);
        row = { items: [], w: 0, h: 0 };
      }
      row.items.push(r);
      row.w += r.w;
      row.h = Math.max(row.h, r.h);
    });
    if (row.items.length) rows.push(row);

    var y = 0;
    rows.forEach(function (rw) {
      var x = 0;
      rw.items.forEach(function (r) { r._x = x; r._y = y; x += r.w; });
      rw._y = y; rw._h = rw.h;
      y += rw.h;
    });
    return { rows: rows, depth: y };
  }

  function normalizeFloor(floor, plotWidth) {
    var rooms = (floor.rooms || [])
      .map(function (r) {
        var w = Math.max(1, Number(r.w) || 0);
        var h = Math.max(1, Number(r.h) || 0);
        return { name: String(r.name || 'غرفة'), w: w, h: h, area: Math.round(w * h * 10) / 10 };
      })
      .filter(function (r) { return r.w > 0 && r.h > 0; });
    // غرفة أعرض من الأرض تُقلَّص بدل أن تخرج عن الإطار
    rooms.forEach(function (r) { if (r.w > plotWidth) { r.w = plotWidth; r.area = Math.round(r.w * r.h * 10) / 10; } });
    return rooms;
  }

  function renderFloor(floor, plotWidth, index) {
    var rooms = normalizeFloor(floor, plotWidth);
    if (!rooms.length) return { svg: '', total: 0, rooms: [] };
    var packed = packRooms(rooms, plotWidth);
    var depth = packed.depth;

    var W = plotWidth * M + PAD * 2;
    var H = depth * M + PAD * 2 + 34;
    var total = rooms.reduce(function (s, r) { return s + r.area; }, 0);

    var out = [];
    out.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + Math.round(W) + ' ' + Math.round(H) +
      '" style="width:100%;height:auto;background:#fff;font-family:Tajawal,Arial,sans-serif" direction="rtl">');
    out.push('<rect width="100%" height="100%" fill="#fff"/>');

    // الجدار الخارجي
    out.push('<rect x="' + PAD + '" y="' + PAD + '" width="' + (plotWidth * M) + '" height="' + (depth * M) +
      '" fill="none" stroke="#333" stroke-width="' + (WALL + 2) + '"/>');

    rooms.forEach(function (r) {
      var x = PAD + r._x * M, y = PAD + r._y * M, w = r.w * M, h = r.h * M;
      out.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
        '" fill="' + colorFor(r.name) + '" stroke="#4a4a4a" stroke-width="' + WALL + '"/>');
      var cx = x + w / 2, cy = y + h / 2;
      var fs = Math.max(10, Math.min(15, Math.round(Math.min(w, h) / 5)));
      out.push('<text x="' + cx + '" y="' + (cy - 3) + '" text-anchor="middle" font-size="' + fs +
        '" font-weight="700" fill="#222">' + esc(r.name) + '</text>');
      // المساحة محسوبة من الأبعاد — لا يمكن أن تخالف الرسم
      out.push('<text x="' + cx + '" y="' + (cy + fs + 1) + '" text-anchor="middle" font-size="' + (fs - 1) +
        '" fill="#444">' + num(r.area) + ' م²</text>');
      out.push('<text x="' + cx + '" y="' + (cy + fs * 2 + 1) + '" text-anchor="middle" font-size="' + (fs - 3) +
        '" fill="#888">' + num(r.w) + '×' + num(r.h) + '</text>');
    });

    // أبعاد الأرض
    var yb = PAD + depth * M + 22;
    out.push('<line x1="' + PAD + '" y1="' + yb + '" x2="' + (PAD + plotWidth * M) + '" y2="' + yb + '" stroke="#666" stroke-width="1"/>');
    out.push('<text x="' + (PAD + plotWidth * M / 2) + '" y="' + (yb - 5) + '" text-anchor="middle" font-size="12" fill="#555">' + num(plotWidth) + ' م</text>');
    var xl = PAD - 22;
    out.push('<line x1="' + xl + '" y1="' + PAD + '" x2="' + xl + '" y2="' + (PAD + depth * M) + '" stroke="#666" stroke-width="1"/>');
    out.push('<text x="' + xl + '" y="' + (PAD + depth * M / 2) + '" text-anchor="middle" font-size="12" fill="#555" transform="rotate(-90 ' + xl + ' ' + (PAD + depth * M / 2) + ')">' + num(depth) + ' م</text>');

    out.push('<text x="' + (W / 2) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="15" font-weight="700" fill="#222">' +
      esc(floor.name || ('الطابق ' + (index + 1))) + ' — ' + num(Math.round(total * 10) / 10) + ' م²</text>');
    out.push('</svg>');

    return { svg: out.join(''), total: Math.round(total * 10) / 10, rooms: rooms, depth: depth };
  }


  var CSS = [
    'body{font-family:Tajawal,Arial,sans-serif;margin:0;padding:14px;background:#fafafa;color:#222;line-height:1.7;-webkit-user-select:none;user-select:none}',
    'header{text-align:center;margin:0 0 12px}h1{margin:0;font-size:20px}',
    '.sub{color:#777;font-size:13px}.tot{margin-top:6px;font-size:15px}',
    '.tabs{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin:0 0 10px}',
    '.tab{font:inherit;font-size:13px;padding:6px 13px;border-radius:8px;border:1px solid #d5d5d5;background:#fff;cursor:pointer}',
    '.tab.on{background:#2E9E6B;border-color:#2E9E6B;color:#fff}',
    '.meta{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;font-size:13px;color:#666;margin:0 0 10px}',
    '.stageWrap{overflow:auto;display:flex;justify-content:center;padding:10px 0}',
    '#stage{position:relative;background:#fff;border:3px solid #333;touch-action:none}',
    '.room{position:absolute;border:2px solid #4a4a4a;box-sizing:border-box;display:flex;flex-direction:column;',
    ' align-items:center;justify-content:center;overflow:hidden;cursor:grab;touch-action:none}',
    '.room.sel{border-color:#2E9E6B;border-width:3px;box-shadow:inset 0 0 0 2px rgba(46,158,107,.25)}',
    '.room.clash{border-color:#c0453f;border-style:dashed}',
    '.rn{font-size:12px;font-weight:700;text-align:center;padding:0 3px;line-height:1.25}',
    '.ra{font-size:11px;color:#444}.rd{font-size:10px;color:#999}',
    '.grip{position:absolute;inset-inline-start:0;bottom:0;width:16px;height:16px;background:#2E9E6B;',
    ' border-radius:0 4px 0 0;cursor:nwse-resize;opacity:.75}',
    '.bar{display:flex;gap:8px;justify-content:center;margin:8px 0}',
    '.bar button{font:inherit;font-size:14px;padding:8px 14px;border-radius:9px;border:1px solid #cfcfcf;background:#fff;cursor:pointer}',
    '.panel{background:#fff;border:1px solid #e6e6e6;border-radius:12px;padding:12px;margin:8px 0;min-height:52px}',
    '.hint{color:#888;font-size:13px;text-align:center}',
    '.row{display:flex;align-items:center;gap:10px;margin:0 0 8px}',
    '.row label{width:78px;font-size:13px;color:#555}',
    '.row input{flex:1;font:inherit;font-size:14px;padding:7px 9px;border:1px solid #d5d5d5;border-radius:8px;-webkit-user-select:text;user-select:text}',
    '.row .area{flex:1;font-size:14px}',
    '.danger{font:inherit;font-size:13px;padding:7px 13px;border-radius:8px;border:1px solid #e0b4b1;background:#fff;color:#a33;cursor:pointer}',
    '.vlabel{margin:18px 0 6px;font-size:14px;font-weight:700}',
    '.views{display:flex;gap:8px;flex-wrap:wrap}',
    '.ov-btn{font:inherit;font-size:14px;padding:9px 15px;border-radius:9px;border:1px solid #cfcfcf;background:#fff;cursor:pointer}',
    '.ov-btn[disabled]{opacity:.55;cursor:default}',
    '.note{margin:16px 0 0;padding:11px 14px;background:#FFF6E5;border-radius:8px;font-size:13px;color:#6b5320}'
  ].join('');

  var EDITOR_CLIENT = '/* عميل المحرّر — يعمل داخل صفحة المعاينة (iframe).\n *\n * لماذا محرّر لا رسم ثابت:\n * الترتيب الآلي يرصّ الغرف في صفوف — نِسَب صحيحة ومساحات صحيحة، لكنه ليس\n * توزيعًا معماريًا. والمستخدم يعرف بيته أكثر من أي نموذج: أين يريد المجلس،\n * وأي غرفة على الشارع. فالنموذج يعطي البداية، وهو يضبط.\n *\n * والمساحة تبقى محسوبة في كل لحظة — تُعاد من العرض×الطول بعد كل سحب أو\n * تغيير مقاس. لا يمكن أن يظهر رقم لا يطابق الشكل.\n *\n * pointer events لا mouse: أغلب المستخدمين على الجوال.\n */\n(function () {\n  \'use strict\';\n\n  var SNAP = 0.25;                       // متر\n  var spec = window.__omranSpec || { floors: [] };\n  var M = 30;                            // بكسل لكل متر (يُعاد حسابه للجوال)\n  var active = 0;                        // الطابق المعروض\n  var selected = null;\n\n  var PALETTE = {\n    مجلس: \'#F6E4D7\', صالة: \'#FAF3DC\', نوم: \'#FCE6D2\', حمام: \'#DCE9F5\',\n    مطبخ: \'#F5DDEE\', كراج: \'#E6E6E6\', خدامة: \'#EDE7DA\', مسبح: \'#BFE4F2\',\n    مكتب: \'#E4EEDC\', مخزن: \'#EAEAEA\', سلم: \'#E0DCE8\',\n  };\n  function colorFor(n) {\n    n = String(n || \'\');\n    for (var k in PALETTE) if (n.indexOf(k) !== -1) return PALETTE[k];\n    return \'#F0EFEA\';\n  }\n  function snap(v) { return Math.max(SNAP, Math.round(v / SNAP) * SNAP); }\n  function fmt(v) { return String(Math.round(v * 100) / 100); }\n\n  /* أول تحميل: نوزّع الغرف صفوفًا كبداية، ثم يعدّل المستخدم. */\n  function seedPositions() {\n    var pw = Number(spec.plotWidth) || 15;\n    (spec.floors || []).forEach(function (f) {\n      var x = 0, y = 0, rowH = 0;\n      (f.rooms || []).forEach(function (r) {\n        r.w = Number(r.w) || 3; r.h = Number(r.h) || 3;\n        if (typeof r.x === \'number\' && typeof r.y === \'number\') return;\n        if (x + r.w > pw + 0.01) { x = 0; y += rowH; rowH = 0; }\n        r.x = x; r.y = y; x += r.w; rowH = Math.max(rowH, r.h);\n      });\n    });\n  }\n\n  function floorDepth(f) {\n    return (f.rooms || []).reduce(function (m, r) { return Math.max(m, (r.y || 0) + r.h); }, 0);\n  }\n  function floorArea(f) {\n    return (f.rooms || []).reduce(function (s, r) { return s + r.w * r.h; }, 0);\n  }\n\n  /* تداخل الغرف — لا نمنعه (قد يريد المستخدم غرفة داخل أخرى مؤقتًا) لكن نُظهره. */\n  function overlaps(f, room) {\n    return (f.rooms || []).some(function (o) {\n      if (o === room) return false;\n      return room.x < o.x + o.w - 0.01 && o.x < room.x + room.w - 0.01 &&\n             room.y < o.y + o.h - 0.01 && o.y < room.y + room.h - 0.01;\n    });\n  }\n\n  var $ = function (id) { return document.getElementById(id); };\n\n  function render() {\n    var f = spec.floors[active];\n    if (!f) return;\n    var pw = Number(spec.plotWidth) || 15;\n    var avail = Math.min(document.body.clientWidth - 28, 900);\n    M = Math.max(14, Math.floor(avail / pw));\n    var depth = Math.max(floorDepth(f), 4);\n\n    var stage = $(\'stage\');\n    stage.style.width = (pw * M) + \'px\';\n    stage.style.height = (depth * M) + \'px\';\n    stage.innerHTML = \'\';\n\n    (f.rooms || []).forEach(function (r, i) {\n      var el = document.createElement(\'div\');\n      el.className = \'room\' + (selected === r ? \' sel\' : \'\') + (overlaps(f, r) ? \' clash\' : \'\');\n      el.style.cssText = \'left:\' + (r.x * M) + \'px;top:\' + (r.y * M) + \'px;width:\' + (r.w * M) +\n        \'px;height:\' + (r.h * M) + \'px;background:\' + colorFor(r.name);\n      el.dataset.i = i;\n      el.innerHTML =\n        \'<div class="rn">\' + String(r.name).replace(/</g, \'&lt;\') + \'</div>\' +\n        \'<div class="ra">\' + fmt(r.w * r.h) + \' م²</div>\' +\n        \'<div class="rd">\' + fmt(r.w) + \'×\' + fmt(r.h) + \'</div>\' +\n        \'<div class="grip" data-grip="1"></div>\';\n      stage.appendChild(el);\n    });\n\n    $(\'total\').textContent = fmt(floorArea(f)) + \' م²\';\n    $(\'depth\').textContent = fmt(depth) + \' م\';\n    $(\'pw\').textContent = fmt(pw) + \' م\';\n    var grand = (spec.floors || []).reduce(function (s, x) { return s + floorArea(x); }, 0);\n    $(\'grand\').textContent = fmt(grand) + \' م²\';\n    renderTabs();\n    renderPanel();\n  }\n\n  function renderTabs() {\n    var t = $(\'tabs\');\n    t.innerHTML = (spec.floors || []).map(function (f, i) {\n      return \'<button class="tab\' + (i === active ? \' on\' : \'\') + \'" data-f="\' + i + \'">\' +\n        String(f.name || (\'طابق \' + (i + 1))).replace(/</g, \'&lt;\') + \'</button>\';\n    }).join(\'\');\n  }\n\n  function renderPanel() {\n    var p = $(\'panel\');\n    if (!selected) { p.innerHTML = \'<div class="hint">اضغط على أي غرفة لتغيير اسمها أو مقاسها · اسحبها لتحريكها · اسحب الزاوية لتكبيرها</div>\'; return; }\n    p.innerHTML =\n      \'<div class="row"><label>الاسم</label><input id="fName" value="\' + String(selected.name).replace(/"/g, \'&quot;\') + \'"></div>\' +\n      \'<div class="row"><label>العرض (م)</label><input id="fW" type="number" step="0.25" min="0.5" value="\' + fmt(selected.w) + \'"></div>\' +\n      \'<div class="row"><label>الطول (م)</label><input id="fH" type="number" step="0.25" min="0.5" value="\' + fmt(selected.h) + \'"></div>\' +\n      \'<div class="row"><span class="area">المساحة: <b>\' + fmt(selected.w * selected.h) + \' م²</b></span>\' +\n      \'<button id="fDel" class="danger">حذف</button></div>\';\n\n    [\'fName\', \'fW\', \'fH\'].forEach(function (id) {\n      var el = $(id);\n      el.oninput = function () {\n        if (!selected) return;\n        if (id === \'fName\') selected.name = el.value || \'غرفة\';\n        else {\n          var v = parseFloat(el.value);\n          if (!isFinite(v) || v <= 0) return;\n          if (id === \'fW\') selected.w = v; else selected.h = v;\n        }\n        var keep = selected;\n        render();\n        selected = keep;\n        try { $(id).focus(); } catch (e) { /* أُعيد الرسم */ }\n      };\n    });\n    $(\'fDel\').onclick = function () {\n      var f = spec.floors[active];\n      f.rooms = f.rooms.filter(function (r) { return r !== selected; });\n      selected = null; render();\n    };\n  }\n\n  /* ───────── السحب وتغيير المقاس ───────── */\n  var drag = null;\n\n  function onDown(e) {\n    var el = e.target.closest ? e.target.closest(\'.room\') : null;\n    if (!el) { selected = null; render(); return; }\n    var f = spec.floors[active];\n    var r = f.rooms[+el.dataset.i];\n    selected = r;\n    var isGrip = e.target.dataset && e.target.dataset.grip;\n    drag = {\n      room: r, mode: isGrip ? \'size\' : \'move\',\n      px: e.clientX, py: e.clientY,\n      ox: r.x, oy: r.y, ow: r.w, oh: r.h,\n    };\n    el.setPointerCapture && el.setPointerCapture(e.pointerId);\n    render();\n    e.preventDefault();\n  }\n\n  function onMove(e) {\n    if (!drag) return;\n    var dx = (e.clientX - drag.px) / M, dy = (e.clientY - drag.py) / M;\n    // الواجهة RTL: السحب يمينًا يعني نقصان x\n    if (document.dir === \'rtl\' || document.documentElement.dir === \'rtl\') dx = -dx;\n    var pw = Number(spec.plotWidth) || 15;\n    if (drag.mode === \'move\') {\n      drag.room.x = Math.max(0, Math.min(pw - drag.room.w, snap(drag.ox + dx)));\n      drag.room.y = Math.max(0, snap(drag.oy + dy));\n    } else {\n      drag.room.w = Math.max(0.5, Math.min(pw - drag.room.x, snap(drag.ow + dx)));\n      drag.room.h = Math.max(0.5, snap(drag.oh + dy));\n    }\n    render();\n    e.preventDefault();\n  }\n\n  function onUp() { drag = null; }\n\n  function addRoom() {\n    var f = spec.floors[active];\n    f.rooms = f.rooms || [];\n    var r = { name: \'غرفة\', w: 4, h: 3.5, x: 0, y: floorDepth(f) };\n    f.rooms.push(r); selected = r; render();\n  }\n\n  function addFloor() {\n    spec.floors.push({ name: \'طابق \' + (spec.floors.length + 1), rooms: [] });\n    active = spec.floors.length - 1; selected = null; render();\n  }\n\n  /* ───────── توليد الواجهة من المخطط المُعدَّل ───────── */\n  function requestView(view, btn) {\n    var label = btn.textContent;\n    btn.disabled = true; btn.textContent = \'… جارٍ التوليد\';\n    var id = Date.now();\n    function onMsg(e) {\n      var d = e.data;\n      if (!d || d.__omranViewOut !== 1 || d.id !== id) return;\n      window.removeEventListener(\'message\', onMsg);\n      btn.disabled = false; btn.textContent = label;\n      var out = $(\'views\');\n      if (d.ok) {\n        var fig = document.createElement(\'figure\');\n        fig.style.cssText = \'margin:12px 0\';\n        fig.innerHTML = \'<img src="\' + d.dataUrl + \'" style="width:100%;border-radius:12px;display:block">\' +\n          \'<figcaption style="font-size:12px;color:#777;margin-top:6px;text-align:center">\' +\n          label + \' — مولّد من المخطط كما عدّلته</figcaption>\';\n        out.appendChild(fig);\n      } else {\n        var p = document.createElement(\'p\');\n        p.style.cssText = \'color:#a33;font-size:13px\';\n        p.textContent = \'⚠️ \' + (d.error || \'تعذّر التوليد\');\n        out.appendChild(p);\n      }\n    }\n    window.addEventListener(\'message\', onMsg);\n    // نرسل المواصفات الحالية — أي بعد تعديلات المستخدم، لا الأصلية\n    parent.postMessage({ __omranView: 1, id: id, view: view, spec: spec }, \'*\');\n  }\n\n  function boot() {\n    seedPositions();\n    render();\n    var stage = $(\'stage\');\n    stage.addEventListener(\'pointerdown\', onDown);\n    window.addEventListener(\'pointermove\', onMove);\n    window.addEventListener(\'pointerup\', onUp);\n    window.addEventListener(\'pointercancel\', onUp);\n    $(\'tabs\').addEventListener(\'click\', function (e) {\n      var b = e.target.closest(\'.tab\'); if (!b) return;\n      active = +b.dataset.f; selected = null; render();\n    });\n    $(\'addRoom\').onclick = addRoom;\n    $(\'addFloor\').onclick = addFloor;\n    document.querySelectorAll(\'.ov-btn\').forEach(function (b) {\n      b.onclick = function () { requestView(b.dataset.view, b); };\n    });\n    window.addEventListener(\'resize\', function () { render(); });\n  }\n\n  if (document.readyState === \'loading\') document.addEventListener(\'DOMContentLoaded\', boot);\n  else boot();\n})();\n';

  /* v-construction-3d: 🧊 «امشِ داخل بيتك قبل أن يُبنى» — جولة ثلاثية الأبعاد
   * مبنية من نفس مواصفات المخطط (أبعاد الغرف الحقيقية بالمتر، بعد تعديلات
   * المستخدم). CSS 3D خالص بلا مكتبات ولا ذكاء اصطناعي ولا رصيد: الهندسة
   * موجودة أصلًا، نرفع منها جدرانًا ونعطي دورانًا وإمالة وتكبيرًا وفصل طوابق. */
  function omranTour3d() {
    'use strict';
    var M = 24, WH = 3 * M;
    var yaw = -32, tilt = 62, scale = 1, exploded = false;
    var SHADE = { 0: 1, 90: 0.82, 180: 0.66, 270: 0.82 };
    var PAL = {
      مجلس: '#F6E4D7', صالة: '#FAF3DC', نوم: '#FCE6D2', حمام: '#DCE9F5',
      مطبخ: '#F5DDEE', كراج: '#E6E6E6', خدامة: '#EDE7DA', مسبح: '#BFE4F2',
      مكتب: '#E4EEDC', مخزن: '#EAEAEA', سلم: '#E0DCE8',
    };
    function colorFor(n) {
      n = String(n || '');
      for (var k in PAL) if (n.indexOf(k) !== -1) return PAL[k];
      return '#F0EFEA';
    }
    function shade(hex, f) {
      var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      return 'rgba(' + Math.round(r * f) + ',' + Math.round(g * f) + ',' + Math.round(b * f) + ',.94)';
    }
    function specDepth(f) {
      return (f.rooms || []).reduce(function (m, r) { return Math.max(m, (Number(r.y) || 0) + (Number(r.h) || 0)); }, 0);
    }
    var world = null, floorsEls = [];
    function apply() {
      if (!world) return;
      world.style.transform = 'scale(' + scale + ') rotateX(' + tilt + 'deg) rotateZ(' + yaw + 'deg)';
      floorsEls.forEach(function (el, i) {
        el.style.transform = 'translateZ(' + (i * (WH + (exploded ? WH * 0.9 : 0))) + 'px)';
      });
      world.querySelectorAll('.t3lbl').forEach(function (l) { l.style.transform = 'rotateZ(' + (-yaw) + 'deg)'; });
    }
    function build() {
      var spec = window.__omranSpec || { floors: [] };
      var pw = Number(spec.plotWidth) || 15;
      var dep = Math.max(4, (spec.floors || []).reduce(function (m, f) { return Math.max(m, specDepth(f)); }, 0));
      var ov = document.createElement('div');
      ov.id = 't3dOverlay';
      ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:radial-gradient(ellipse at 50% 30%,#1c1c26,#0b0b0f);touch-action:none;overflow:hidden;font-family:inherit;';
      var bar = document.createElement('div');
      bar.style.cssText = 'position:absolute;top:0;left:0;right:0;z-index:5;display:flex;align-items:center;gap:8px;padding:12px 14px;color:#eee;';
      bar.innerHTML = '<b style="font-size:14px;">🧊 ' + String((spec.title || 'جولة المبنى')).replace(/</g, '&lt;') + '</b>'
        + '<span style="font-size:11px;opacity:.6;">اسحب للدوران · قرّب بإصبعين</span>'
        + '<span style="flex:1"></span>'
        + ((spec.floors || []).length > 1 ? '<button id="t3x" class="t3b">🧨 فصل الطوابق</button>' : '')
        + '<button id="t3zi" class="t3b">＋</button><button id="t3zo" class="t3b">－</button>'
        + '<button id="t3c" class="t3b" style="background:#7f1d1d;">✕</button>';
      var st = document.createElement('style');
      st.textContent = '.t3b{background:#26262f;border:1px solid #3a3a46;color:#eee;border-radius:9px;padding:7px 11px;font:inherit;font-size:12px;cursor:pointer;}';
      ov.appendChild(st); ov.appendChild(bar);
      var view = document.createElement('div');
      view.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;perspective:1700px;';
      world = document.createElement('div');
      world.style.cssText = 'position:relative;width:' + (pw * M) + 'px;height:' + (dep * M) + 'px;transform-style:preserve-3d;transition:transform .08s linear;';
      // الأرض
      var ground = document.createElement('div');
      ground.style.cssText = 'position:absolute;left:' + (-M) + 'px;top:' + (-M) + 'px;width:' + ((pw + 2) * M) + 'px;height:' + ((dep + 2) * M) + 'px;background:#20241f;border:2px solid #3a4038;border-radius:8px;transform:translateZ(-3px);';
      world.appendChild(ground);
      floorsEls = [];
      (spec.floors || []).forEach(function (f) {
        var fl = document.createElement('div');
        fl.style.cssText = 'position:absolute;inset:0;transform-style:preserve-3d;';
        (f.rooms || []).forEach(function (r) {
          var x = (Number(r.x) || 0) * M, y = (Number(r.y) || 0) * M, w = (Number(r.w) || 3) * M, h = (Number(r.h) || 3) * M;
          var col = colorFor(r.name);
          var face = document.createElement('div');
          face.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px;background:' + col + ';border:1px solid #55545e;display:flex;align-items:center;justify-content:center;';
          var lbl = document.createElement('div');
          lbl.className = 't3lbl';
          lbl.style.cssText = 'font-size:11px;font-weight:700;color:#333;text-align:center;line-height:1.3;pointer-events:none;';
          lbl.innerHTML = String(r.name || '').replace(/</g, '&lt;') + '<br><span style="font-weight:400;font-size:10px;">' + (Math.round((Number(r.w) || 0) * (Number(r.h) || 0) * 10) / 10) + ' م²</span>';
          face.appendChild(lbl);
          fl.appendChild(face);
          // أربعة جدران زجاجية — ترى الداخل من كل زاوية
          [[x, y, w, 0], [x + w, y, h, 90], [x + w, y + h, w, 180], [x, y + h, h, 270]].forEach(function (e2) {
            var wall = document.createElement('div');
            wall.style.cssText = 'position:absolute;left:0;top:0;width:' + e2[2] + 'px;height:' + WH + 'px;transform-origin:0 0;'
              + 'transform:translate3d(' + e2[0] + 'px,' + e2[1] + 'px,0) rotateZ(' + e2[3] + 'deg) rotateX(90deg);'
              + 'background:' + shade(col, SHADE[e2[3]] * 0.9) + ';border:1px solid rgba(60,58,70,.8);opacity:.62;';
            fl.appendChild(wall);
          });
        });
        world.appendChild(fl);
        floorsEls.push(fl);
      });
      view.appendChild(world);
      ov.appendChild(view);
      document.body.appendChild(ov);
      apply();
      // التحكم: سحب = دوران/إمالة · إصبعان = تكبير
      var ptrs = {}, lastDist = 0;
      view.addEventListener('pointerdown', function (e) { ptrs[e.pointerId] = e; view.setPointerCapture(e.pointerId); });
      view.addEventListener('pointermove', function (e) {
        if (!ptrs[e.pointerId]) return;
        var ks = Object.keys(ptrs);
        if (ks.length === 2) {
          ptrs[e.pointerId] = e;
          var a = ptrs[ks[0]], b = ptrs[ks[1]];
          var d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
          if (lastDist) scale = Math.max(0.35, Math.min(3, scale * (d / lastDist)));
          lastDist = d; apply(); return;
        }
        var p = ptrs[e.pointerId];
        yaw += (e.clientX - p.clientX) * 0.45;
        tilt = Math.max(12, Math.min(88, tilt - (e.clientY - p.clientY) * 0.3));
        ptrs[e.pointerId] = e; apply();
      });
      function up(e) { delete ptrs[e.pointerId]; lastDist = 0; }
      view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
      view.addEventListener('wheel', function (e) { scale = Math.max(0.35, Math.min(3, scale * (e.deltaY < 0 ? 1.12 : 0.89))); apply(); e.preventDefault(); }, { passive: false });
      var g = function (id) { return document.getElementById(id); };
      if (g('t3x')) g('t3x').onclick = function () { exploded = !exploded; apply(); };
      g('t3zi').onclick = function () { scale = Math.min(3, scale * 1.2); apply(); };
      g('t3zo').onclick = function () { scale = Math.max(0.35, scale / 1.2); apply(); };
      g('t3c').onclick = function () { ov.remove(); world = null; };
    }
    function mount() {
      var row = document.querySelector('.views');
      if (!row || document.getElementById('t3dBtn')) return;
      var b = document.createElement('button');
      b.id = 't3dBtn';
      b.className = 'ov-btn';
      b.textContent = '🧊 جولة 3D';
      b.style.cssText = 'background:linear-gradient(135deg,#b8860b,#8a6a1a);color:#fff;border-color:#d4af37;';
      b.onclick = function (e) { e.stopPropagation(); build(); };
      row.insertBefore(b, row.firstChild);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
  }

  /** يبني صفحة المحرّر التفاعلي من مواصفات المبنى. */
  function renderPlan(spec) {
    var title = esc((spec && spec.title) || 'مخطط');
    var style = spec && spec.style ? '<div class="sub">' + esc(spec.style) + '</div>' : '';
    var specJson = JSON.stringify(spec || {}).replace(/</g, '\\u003c');

    return '<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">' +
      '<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap" rel="stylesheet">' +
      '<style>' + CSS + '</style></head><body>' +
      '<header><h1>' + title + '</h1>' + style +
        '<div class="tot">إجمالي البناء: <b id="grand">—</b></div></header>' +
      '<div id="tabs" class="tabs"></div>' +
      '<div class="meta"><span>عرض الأرض: <b id="pw">—</b></span><span>عمق البناء: <b id="depth">—</b></span>' +
        '<span>مساحة الطابق: <b id="total">—</b></span></div>' +
      '<div class="stageWrap"><div id="stage"></div></div>' +
      '<div class="bar"><button id="addRoom">＋ غرفة</button><button id="addFloor">＋ طابق</button></div>' +
      '<div id="panel" class="panel"></div>' +
      '<div class="vlabel">صور المشروع</div>' +
      '<div class="views">' +
        '<button class="ov-btn" data-view="exterior">🏠 نهارًا</button>' +
        '<button class="ov-btn" data-view="dusk">🌆 مغربًا</button>' +
        '<button class="ov-btn" data-view="aerial">🚁 من فوق</button>' +
        '<button class="ov-btn" data-view="entrance">🚪 المدخل</button>' +
        '<button class="ov-btn" data-view="majlis">🛋️ المجلس</button>' +
        '<button class="ov-btn" data-view="living">🪑 الصالة</button>' +
      '</div>' +
      '<div id="views"></div>' +
      '<p class="note">المساحات تُحسب من المقاسات لحظيًا. مخطط تصوّري — التنفيذ يتطلب مكتبًا هندسيًا معتمدًا وموافقة البلدية.</p>' +
      '<script>window.__omranSpec=' + specJson + ';<' + '/script>' +
      '<script>' + EDITOR_CLIENT + '<' + '/script>' +
      /* v-construction-3d: مشغّل الجولة يُحقن كدالة — بلا هروب نصي هش */
      '<script>(' + omranTour3d.toString() + ')();<' + '/script>' +
      '</body></html>';
  }

  /** يستخرج مواصفات المبنى من رد النموذج. */
  function extractSpec(text) {
    var s = String(text || '');
    var m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    var raw = m ? m[1] : s;
    var a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try {
      var spec = JSON.parse(raw.slice(a, b + 1));
      if (!spec || !Array.isArray(spec.floors) || !spec.floors.length) return null;
      return spec;
    } catch (e) { return null; }
  }

  var PROMPT = [
    'أنت مهندس معماري. حوّل طلب المستخدم إلى مواصفات مبنى بصيغة JSON فقط،',
    'بلا أي نص خارجها وبلا أسوار كود.',
    '',
    '{"title":"اسم المشروع","style":"الطراز","plotWidth":العرض بالمتر,',
    ' "floors":[{"name":"الطابق الأرضي","rooms":[{"name":"مجلس","w":6,"h":5}]}]}',
    '',
    'قواعد إلزامية:',
    '- w و h بالمتر، أرقام واقعية: مجلس 5-8م، نوم 3.5-5م، حمام 1.8-2.5م، مطبخ 3-5م.',
    '- ممنوع كتابة المساحة — التطبيق يحسبها من w×h. أي رقم مساحة تكتبه يُتجاهل.',
    '- مجموع عرض غرف كل صف يجب ألا يتجاوز plotWidth.',
    '- إن طلب المستخدم مساحة إجمالية، وزّع الغرف لتقاربها.',
    '- الأسماء بالعربية: مجلس، صالة، غرفة نوم، حمام، مطبخ، كراج، غرفة خدامة، مسبح، مكتب، مخزن، سلم.',
    '- راعِ العادات الخليجية: مجلس رجال منفصل بمدخله، ومطبخ داخلي وخارجي إن كانت المساحة تسمح.',
  ].join('\n');

  window.omranFloorplan = { renderPlan: renderPlan, extractSpec: extractSpec, PROMPT: PROMPT, renderFloor: renderFloor };
})();

/* ───────── الواجهة من نفس المواصفات ─────────
 *
 * هذه هي التي تحلّ مشكلتك الأصلية: كان المخطط والواجهة يُولَّدان مستقلَّين،
 * فتخرج واجهة بطابق واحد ومخطط بطابقين، أو كراج لسيارتين مقابل ثلاث.
 *
 * الآن الوصف يُشتقّ من ملف المواصفات نفسه — تُعدّ الطوابق وتُحسب سعة الكراج
 * من مساحته ويُقرأ وجود المسبح من الغرف. فلا يمكن أن يختلف العدد.
 *
 * ولا يُترجَم الوصف من العربية: نبنيه بالإنجليزية مباشرة من الأرقام، لأن
 * الترجمة تضيع الأعداد وهي بالضبط ما يجب أن يتطابق.
 */
(function () {
  'use strict';
  var FP = window.omranFloorplan;
  if (!FP) return;

  // مواد محدّدة بالاسم لا أوصاف عامة. «فخم» لا تعني شيئًا لنموذج الصور،
  // أما «travertine» و«board-formed concrete» فتعني ملمسًا ولونًا بعينه.
  var STYLE_EN = {
    // مستخرج من عرض معماري اختاره صاحب التطبيق مرجعًا. مكتوب بالمواد لا
    // بالانطباع: «فخم» لا تعني شيئًا لنموذج الصور، أما honed limestone فتعني
    // حجرًا مصقولًا غير لامع بلون بعينه.
    'سني عصري': 'contemporary Gulf (Khaleeji) villa — cream honed limestone cladding in large-format panels with fine joints, a thick flat roof slab with a deep cantilevered overhang casting a strong horizontal shadow, horizontal timber slat soffit under the overhang and a matching timber pergola, full-height sliding glazing with slim dark-grey aluminium frames, a shaded outdoor kitchen with stone counter and built-in grill beside a long dining table, pale travertine paving',
    'عصري': 'modern minimalist architecture — crisp intersecting white render and grey basalt volumes, flat roof with a thin fascia, floor-to-ceiling frameless glazing, concealed gutters, no ornament',
    'كلاسيك': 'classical architecture — symmetrical composition, cream limestone ashlar, engaged Corinthian columns, deep moulded cornice, arched openings with carved keystones, wrought-iron balustrades',
    'إسلامي': 'traditional Islamic architecture — pointed and horseshoe arches, carved gypsum (juss) panels, turquoise and cobalt glazed tilework, geometric mashrabiya lattice, a shaded arcaded loggia',
    'نجدي': 'Najdi heritage architecture — thick adobe-toned rendered walls, small deep-set windows, triangular pierced parapet motifs, exposed tamarisk beams, earth-tone palette',
    'حديث': 'contemporary architecture — bold cantilevers, mixed grey stone and warm timber cladding, board-formed concrete accents, floor-to-ceiling glass with slim mullions',
  };

  function styleEn(style) {
    var s = String(style || '');
    for (var k in STYLE_EN) if (s.indexOf(k) !== -1) return STYLE_EN[k];
    return s ? (s + ' architectural style') : STYLE_EN['عصري'];
  }

  /** يستخرج الحقائق القابلة للعدّ — وهي ما يقارنه المستخدم بالمخطط. */
  function factsFrom(spec) {
    var floors = (spec && spec.floors) || [];
    var all = [];
    floors.forEach(function (f) { (f.rooms || []).forEach(function (r) { all.push(r); }); });

    function find(word) { return all.filter(function (r) { return String(r.name || '').indexOf(word) !== -1; }); }

    var garages = find('كراج');
    var garageArea = garages.reduce(function (s, r) { return s + (Number(r.w) || 0) * (Number(r.h) || 0); }, 0);
    // ~15 م² لكل سيارة (2.5×6 مع حركة)
    var cars = garageArea ? Math.max(1, Math.round(garageArea / 15)) : 0;

    var total = 0;
    floors.forEach(function (f) {
      (f.rooms || []).forEach(function (r) { total += (Number(r.w) || 0) * (Number(r.h) || 0); });
    });

    return {
      floors: floors.length,
      bedrooms: find('نوم').length,
      majlis: find('مجلس').length > 0,
      pool: find('مسبح').length > 0 || find('سباحة').length > 0,
      cars: cars,
      total: Math.round(total),
      width: Number(spec && spec.plotWidth) || 0,
    };
  }

  function floorsPhrase(n) {
    if (n <= 1) return 'a SINGLE-STOREY house (ground floor only, exactly one level, no upper floor)';
    if (n === 2) return 'a TWO-STOREY house (exactly two levels: ground + first floor, flat roof, no third level)';
    return 'a ' + n + '-STOREY house (exactly ' + n + ' levels)';
  }

  /* المشهد: زاوية الكاميرا والإضاءة. نموذج الصور يعطي نتيجة مختلفة تمامًا
     بحسب هذين، وتركهما للصدفة هو الفرق بين «عرض معماري» و«صورة بيت». */
  var SCENES = {
    exterior: {
      camera: '24mm wide-angle lens at eye level (1.6 m above ground), three-quarter view from the front-left corner of the plot, two-point perspective with vertical lines kept perfectly parallel — no fisheye, no tilted horizon',
      light: 'late-afternoon golden hour, warm low sun raking from the left, long soft shadows across the facade, clear sky with a faint haze near the horizon',
    },
    dusk: {
      camera: '24mm wide-angle lens at eye level, three-quarter view, vertical lines parallel',
      light: 'blue-hour dusk just after sunset, deep blue sky, warm interior lights glowing through the glazing, concealed cove lighting washing the walls, subtle pool illumination',
    },
    aerial: {
      camera: '35mm lens from a drone at about 25 metres altitude, 40-degree downward angle showing the roof, courtyard and plot boundaries together',
      light: 'mid-morning sun, crisp shadows, clear sky',
    },
    entrance: {
      camera: '35mm lens at eye level, straight-on view of the main entrance from 6 metres away',
      light: 'soft overcast daylight, even illumination showing material texture clearly',
    },
  };

  var QUALITY = 'Photorealistic architectural render, V-Ray quality, physically based materials, accurate glass reflections, realistic ambient occlusion, 8K sharpness.';

  // ما يفسد العروض المعمارية عادةً — نمنعه صراحةً
  var NEGATIVE = 'No text, signage, logos or watermarks. No people. No cars outside the garage. No distorted geometry, no fisheye, no floor-plan overlay.';

  /**
   * يبني وصف الواجهة أو الداخل.
   * view: exterior | dusk | aerial | entrance | majlis | living
   */
  function facadePrompt(spec, view) {
    var f = factsFrom(spec);

    if (view === 'majlis' || view === 'living') {
      var isMajlis = view === 'majlis';
      var room = spec && spec.floors && spec.floors[0] && (spec.floors[0].rooms || [])
        .filter(function (r) { return String(r.name).indexOf(isMajlis ? 'مجلس' : 'صالة') !== -1; })[0];
      var dims = room ? (' approximately ' + room.w + ' by ' + room.h + ' metres') : '';
      return [
        'Interior view of ' + (isMajlis ? 'a formal Gulf majlis (men\'s reception room)' : 'the main family living room') +
          ' in a Gulf villa,' + dims + '.',
        'Style: ' + styleEn(spec && spec.style) + '.',
        isMajlis
          ? 'Low upholstered seating running continuously along three walls, a large hand-knotted Persian carpet, a low brass coffee service table with dallah and finjan cups, carved timber ceiling detail, tall curtained windows, warm indirect cove lighting.'
          : 'Contemporary modular sofas around a low table, an adjoining dining area, full-height sliding glazing opening to the garden, layered neutral palette with warm timber accents, soft daylight from the left.',
        '35mm lens at seated eye level (1.2 m), one-point perspective, vertical lines parallel.',
        QUALITY,
        NEGATIVE,
      ].join(' ');
    }

    var scene = SCENES[view] || SCENES.exterior;
    var parts = [];

    // ← الحقائق القابلة للعدّ أولًا: هي ما يقارنه المستخدم بالمخطط
    // الضمانة في المقدمة لا النهاية: أي قصّ مستقبلي يقطع من الآخر، فلو بقيت
    // في الذيل لكانت أول ما يُحذف — وهي بالضبط ما يضمن التطابق مع المخطط.
    parts.push('STRICT: the floor count and garage bay count below are fixed — the client already has the matching floor plan.');
    parts.push('Private villa: ' + floorsPhrase(f.floors) + '.');
    parts.push('Built-up area approximately ' + f.total + ' square metres' +
      (f.width ? ', plot frontage about ' + f.width + ' metres' : '') + '.');
    parts.push('Architecture: ' + styleEn(spec && spec.style) + '.');
    if (f.cars) {
      parts.push('An attached covered garage with EXACTLY ' + f.cars + ' bay' + (f.cars > 1 ? 's' : '') +
        ' (' + (f.cars > 1 ? f.cars + ' cars side by side' : 'one car') + '), set slightly back from the main facade.');
    }
    if (f.pool) parts.push('A rectangular swimming pool in the courtyard with a pale stone deck, two loungers and a shaded pergola.');
    if (f.majlis) parts.push('A distinct majlis wing with its own separate street entrance, visually set apart from the family entrance.');
    parts.push('Surroundings: low matching-stone boundary wall, mature date palms, desert planting (bougainvillea, agave), interlocking stone driveway.');
    parts.push('Camera: ' + scene.camera + '.');
    parts.push('Lighting: ' + scene.light + '.');
    parts.push(QUALITY);
    parts.push(NEGATIVE);

    return parts.join(' ');
  }

  FP.facadePrompt = facadePrompt;
  FP.factsFrom = factsFrom;
})();

/* ───────── التكامل: زر المقاولات + جسر توليد الصور ─────────
 *
 * المحرّر يعيش داخل iframe المعاينة ولا يملك مفاتيح ولا توكن — فأزرار
 * «الشكل الخارجي/المجلس/الصالة» ترسل رسالة للتطبيق الأم، وهو الذي يبني
 * الوصف من المخطط الفعلي (بعد تعديل المستخدم) ويولّد الصورة ويعيدها.
 */
(function () {
  'use strict';
  var FP = window.omranFloorplan;
  if (!FP) return;

  /* ① جسر توليد الواجهات: {__omranView, id, view, spec} ← المحرّر */
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.__omranView !== 1 || !e.source) return;
    var src = e.source;
    function reply(msg) {
      msg.__omranViewOut = 1; msg.id = d.id;
      try { src.postMessage(msg, '*'); } catch (err) { __swallow(err, 'floorplan:bridge#reply'); }
    }
    var prompt;
    try { prompt = FP.facadePrompt(d.spec || {}, d.view); }
    catch (err) { reply({ ok: false, error: 'تعذر بناء الوصف من المخطط' }); return; }
    fetch('/api/maha-image', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: prompt, architectural: true,
        token: authGet('aiapp_auth_token'), guestId: window.getGuestId(),
      }),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.ok && data.imageBase64) {
          reply({ ok: true, dataUrl: 'data:' + (data.mimeType || 'image/png') + ';base64,' + data.imageBase64 });
        } else {
          reply({ ok: false, error: 'تعذر توليد الصورة الآن. حاول مرة أخرى بعد قليل.' });
        }
      });
    }).catch(function () {
      reply({ ok: false, error: 'تعذر توليد الصورة الآن. حاول مرة أخرى بعد قليل.' });
    });
  });

  /* ② زر «📐 محرّر المخططات» داخل نافذة المقاولات */
  var btn = document.getElementById('constructionEditorBtn');
  if (!btn) return;

  function statusMsg(txt) {
    var el = document.getElementById('constructionStatus');
    if (!el) return;
    el.style.display = txt ? 'block' : 'none';
    el.textContent = txt || '';
  }

  /* وصف المشروع من حقول النافذة نفسها — لا نسأل المستخدم من جديد */
  function buildDescription() {
    function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }
    function selTxt(id) {
      var el = document.getElementById(id);
      return (el && el.selectedOptions && el.selectedOptions[0]) ? el.selectedOptions[0].textContent.trim() : '';
    }
    var annexes = [];
    document.querySelectorAll('.constructionAnnex:checked').forEach(function (c) {
      var sp = c.parentElement && c.parentElement.querySelector('span');
      annexes.push(sp ? sp.textContent.trim() : c.value);
    });
    var notes = (val('constructionNotes') || '').trim();
    return [
      'النوع: ' + (selTxt('constructionType') || 'فيلا سكنية'),
      'عدد الطوابق: ' + (val('constructionFloors') || '1'),
      'المساحة الإجمالية المطلوبة تقريبًا: ' + (val('constructionArea') || '300') + ' م²',
      'الطراز: ' + (selTxt('constructionStyle') || 'عصري'),
      annexes.length ? 'الملاحق المطلوبة: ' + annexes.join('، ') : '',
      notes ? 'ملاحظات: ' + notes : '',
    ].filter(Boolean).join('\n');
  }

  function requestPlanSpec(desc) {
    return fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemini-flash-latest',
        systemInstruction: { parts: [{ text: FP.PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: desc }] }],
        token: authGet('aiapp_auth_token'),
        guestId: window.getGuestId(),
        stream: false,
        mode: 'factory',
      }),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error('plan_provider_failed');
        var candidates = data && data.candidates;
        var parts = candidates && candidates[0] && candidates[0].content && candidates[0].content.parts;
        var text = Array.isArray(parts) ? parts.map(function (p) { return (p && p.text) || ''; }).join('') : '';
        var spec = FP.extractSpec(text);
        if (!spec) throw new Error('invalid_plan_spec');
        return spec;
      });
    });
  }

  btn.addEventListener('click', function () {
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ يجهّز المخطط…';
    statusMsg('📐 المهندس الذكي يوزّع الغرف والمقاسات…');

    requestPlanSpec(buildDescription()).then(function (spec) {
        /* مشروع جديد يفتح في المعاينة — نفس مسار التطبيقات المبنية */
        var code = FP.renderPlan(spec);
        var cur = { id: Date.now().toString(), title: String(spec.title || 'مخطط بيتي'), code: code, codeType: 'html', messages: [] };
        state.projects.push(cur);
        state.currentId = cur.id;
        saveState();
        renderHistory();
        renderCodeAndPreview();
        switchWorkTab('preview');
        try { if (window.waAutoExpand) window.waAutoExpand(); } catch (e2) { __swallow(e2, 'floorplan:waExpand'); }
        /* على الجوال: افتح درج المعاينة */
        try {
          if (window.matchMedia('(max-width:860px)').matches && !workareaEl.classList.contains('open')) openDrawer(workareaEl);
        } catch (e3) { __swallow(e3, 'floorplan:drawer'); }
        statusMsg('');
        var modal = document.getElementById('constructionModal');
        if (modal) modal.style.display = 'none';
    }).catch(function () {
      statusMsg('⚠️ تعذر تجهيز المخطط الآن. حاول مرة أخرى بعد قليل.');
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = label;
    });
  });
})();
