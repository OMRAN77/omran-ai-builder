/* ───────── v-office-files: ملفّ Excel أو PowerPoint حقيقيّ من المحادثة (طلب المالك ٧ نوفمبر: «اطلب منه جدول حضور وانصراف
 * وهو يجهّزلي كل شي… فقط انا اطبع» · «في المحادثة… المجّاني مرّة وحدة بالشهر… التعديل يحتاج اشتراك… الجدول قوي في أوّل نسخة») ─────────
 * الخادم (api/_lib/office.js، أداة create_office_file) يبثّ حدث cards بنوع office فيُحفظ في رسالة المساعد (m.cards.office) ويُرسم
 * هنا — سطر واحد أوّل window.omranRenderCards في app-37 كبطاقة المكالمة. شكلان:
 *  • { spec } ملفّ جاهز: النموذج كتب المحتوى فقط (أعمدة، صفوف، شرائح، أرقام)، والتصميم كلّه هنا ثابت قويّ لا يتعلّق بالنموذج:
 *    Excel بـExcelJS (عنوان وترويسة وحقول تعبئة، رأس ملوّن مثبّت، حدود وتظليل متناوب، معادلات وساعات تحسب وحدها، قوائم منسدلة،
 *    ألوان شرطيّة، شبكة أيّام الشهر مع عطلة مظلّلة وعدّادات، مجاميع، تواقيع، طباعة A4 بعرض صفحة ورأس يتكرّر، يمين-يسار)،
 *    وPowerPoint بـPptxGenJS (١١ تخطيطًا بألوان الثيم، رسوم بيانيّة أصليّة، أرقام كبيرة، جداول، خطّ زمنيّ، ملاحظات المتحدّث).
 *    المكتبتان في js/vendor وتُحمَّلان عند أوّل ضغطة فقط. الحفظ بـmsgSaveExport (ورقة المشاركة في تطبيقات المتاجر والجوّال).
 *    PDF للطباعة لملفّ Excel بمصدّر المستندات القائم (omranExportPagedPdfFile) — الجدول مقطّع ٣٠ صفًّا برأسه فلا يُقصّ صفّ بين صفحتين.
 *  • { gate: 'plans'|'login' } المجّانيّ استعمل ملفّ شهره (التعديل ملفّ جديد) ← زرّ الباقات (omranOpenPlans بسبب office)، والضيف ← التسجيل.
 * آخر ملفّ في المحادثة يُرسل مع الطلب التالي (window.omranOfficeLast ← app-18 body.office) ليعدّل عليه النموذج لا يبدأ من الصفر.
 * DOM فقط: نصوص الملفّ تدخل textContent ولا تُفسَّر HTML؛ وPDF يهرّب كلّ نصّ. ١٤ لغة بمفاتيح office*. لا اسم مزوّد في أيّ نصّ. */
(function(){
  'use strict';
  var XLSX_URL = '/js/vendor/exceljs.min.js?v=1', PPTX_URL = '/js/vendor/pptxgen.bundle.js?v=1';
  var THEMES = {
    teal:   { main: '0F766E', dark: '0B4F4A', light: 'E6F2F1', accent: '14B8A6', soft: 'F3F9F8' },
    navy:   { main: '1F3864', dark: '14254A', light: 'E3EAF5', accent: '4472C4', soft: 'F4F7FB' },
    green:  { main: '2E7D32', dark: '1B5E20', light: 'E8F5E9', accent: '66BB6A', soft: 'F4FAF4' },
    purple: { main: '6D28D9', dark: '4C1D95', light: 'EDE9FE', accent: 'A78BFA', soft: 'F8F6FF' },
    orange: { main: 'C2410C', dark: '9A3412', light: 'FFEDD5', accent: 'FB923C', soft: 'FFF8F1' },
    red:    { main: 'B91C1C', dark: '7F1D1D', light: 'FEE2E2', accent: 'F87171', soft: 'FFF6F6' },
    gray:   { main: '374151', dark: '1F2937', light: 'F3F4F6', accent: '9CA3AF', soft: 'F9FAFB' },
    gold:   { main: 'A16207', dark: '713F12', light: 'FEF9C3', accent: 'EAB308', soft: 'FFFDF0' }
  };
  var HL = { green: ['C6EFCE', '006100'], red: ['FFC7CE', '9C0006'], amber: ['FFEB9C', '9C5700'], blue: ['DDEBF7', '1F4E78'], gray: ['E7E6E6', '3A3838'], purple: ['E4DFEC', '5B2C6F'] };
  var AUTO_HL = ['green', 'red', 'amber', 'blue', 'purple', 'gray'];
  var ICON = { users: '👥', chart: '📊', calendar: '📅', clock: '⏰', check: '✅', star: '⭐', idea: '💡', target: '🎯', money: '💰', book: '📚', school: '🏫', building: '🏢', heart: '❤️', shield: '🛡️', rocket: '🚀', globe: '🌍', phone: '📞', mail: '✉️', cart: '🛒', trophy: '🏆', gear: '⚙️', leaf: '🍃', flag: '🚩', image: '🖼️' };
  var DEF = { /* نصّ احتياطيّ إن غاب المفتاح — العربيّة */
    officeDownload: 'تحميل', officePdf: 'PDF للطباعة', officeSheets: '{n} ورقة', officeSlides: '{n} شريحة',
    officeFreeBadge: 'ملفّك المجّانيّ لهذا الشهر', officeBuilding: 'يجهّز الملفّ…', officeFail: 'تعذّر تجهيز الملفّ — جرّب مرّة ثانية',
    officeGatePlans: 'استخدمت ملفّك المجّانيّ لهذا الشهر — الملفّات الجديدة والتعديل عليها بالاشتراك', officeGateLogin: 'سجّل دخولك — عندك ملفّ Excel أو PowerPoint مجّانيّ كلّ شهر',
    officeSubscribe: 'اشترك الآن', officeLogin: 'تسجيل الدخول', officeEditHint: 'للتعديل اكتب طلبك تحت — مثل: كبّر الخط، زد ١٠ أسماء',
    officeFreeHint: 'التعديل عليه أو ملفّ آخر هذا الشهر بالاشتراك', officeTotal: 'المجموع'
  };

  /* ── أدوات صغيرة ── */
  function tt(k){ try{ var v = (typeof t === 'function') ? t(k) : ''; return (typeof v === 'string' && v && v !== k) ? v : (DEF[k] || k); }catch(e){ return DEF[k] || k; } }
  function fill(s, map){ s = String(s); for(var k in map) s = s.split('{' + k + '}').join(String(map[k])); return s; }
  function el(tag, cls, text){ var e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = String(text); return e; }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function theme(spec){ return THEMES[spec && spec.theme] || THEMES.teal; }
  var loading = {};
  function loadScript(url, globalName){
    if(window[globalName]) return Promise.resolve(window[globalName]);
    if(loading[url]) return loading[url];
    loading[url] = new Promise(function(resolve, reject){
      var s = document.createElement('script');
      s.src = url; s.async = true;
      s.onload = function(){ if(window[globalName]) resolve(window[globalName]); else { delete loading[url]; reject(new Error('lib-missing')); } };
      s.onerror = function(){ delete loading[url]; reject(new Error('lib-load')); };
      document.head.appendChild(s);
    });
    return loading[url];
  }
  function colLetter(n){ var s = ''; while(n > 0){ var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function timeVal(v){
    if(typeof v === 'number') return v > 1 ? v / 24 : v;
    var m = /^(\d{1,2})[:٫.](\d{2})/.exec(String(v || '').replace(/[٠-٩]/g, function(d){ return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); }));
    if(!m) return v;
    var h = Number(m[1]) % 24, mi = Math.min(59, Number(m[2]));
    if(/م|pm/i.test(String(v)) && h < 12) h += 12;
    return (h * 60 + mi) / 1440;
  }
  function dateVal(v){
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(v || ''));
    return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : v;
  }
  function numVal(v){
    if(typeof v === 'number') return v;
    var s = String(v == null ? '' : v).replace(/[٠-٩]/g, function(d){ return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); }).replace(/[٬,\s]/g, '').replace('٫', '.');
    var pct = /%$/.test(s); s = s.replace(/[%a-zA-Z\u0600-\u06FF$\u20AC\u00A3]+/g, '');
    if(s === '' || !isFinite(Number(s))) return v;
    return pct ? Number(s) / 100 : Number(s);
  }
  function weekdayName(y, m, d, lang){
    var dt = new Date(Date.UTC(y, m - 1, d));
    try{
      var s = new Intl.DateTimeFormat(lang || 'en', { weekday: 'short', timeZone: 'UTC' }).format(dt);
      if(/^ar/.test(lang || '')) s = s.replace(/^ال/, '').slice(0, 3);
      return s;
    }catch(e){ return ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][dt.getUTCDay()]; }
  }

  /* ── تخطيط ورقة Excel (مشترك بين الملفّ وPDF): الأعمدة بعد توسيع الأيّام والعدّادات ── */
  function sheetPlan(sh, spec){
    var cols = (sh.columns || []).map(function(c){ return Object.assign({}, c); });
    var days = null;
    if(sh.days && sh.days.month){
      var p = sh.days.month.split('-'), y = Number(p[0]), m = Number(p[1]);
      var n = new Date(Date.UTC(y, m, 0)).getUTCDate();
      var choices = (sh.days.choices && sh.days.choices.length) ? sh.days.choices : ['✓', '✗'];
      days = { y: y, m: m, n: n, from: cols.length + 1, choices: choices, weekend: sh.days.weekend || [5, 6] };
      for(var d = 1; d <= n; d++){
        var wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
        cols.push({ header: String(d), sub: weekdayName(y, m, d, spec.lang), type: 'day', weekend: days.weekend.indexOf(wd) !== -1, choices: choices });
      }
      days.to = cols.length;
      choices.forEach(function(ch, i){ cols.push({ header: (sh.days.legend && sh.days.legend[i]) || ch, type: 'count', choice: ch }); });
    }
    var times = [];
    cols.forEach(function(c, i){ if(c.type === 'time' && times.length < 2) times.push(i + 1); });
    var hl = (sh.highlight && sh.highlight.length) ? sh.highlight : (days ? days.choices.slice(0, AUTO_HL.length).map(function(ch, i){ return { value: ch, color: AUTO_HL[i] }; }) : []);
    var rows = (sh.rows || []).length + (sh.blankRows || 0);
    if(!rows) rows = 1;
    var orient = sh.orientation || (cols.length > 9 ? 'landscape' : 'portrait');
    return { cols: cols, days: days, times: times, hl: hl, rows: rows, orient: orient };
  }
  function colWidth(c){
    if(c.width) return c.width;
    return { index: 5, day: 4.3, count: 7, time: 11, date: 12, hours: 9, signature: 16, check: 7, choice: 10, number: 12, currency: 13, percent: 9, formula: 12 }[c.type] || Math.max(14, Math.min(34, String(c.header || '').length * 1.6 + 6));
  }
  function fillFormula(f, r, plan){
    return String(f).replace(/^=/, '').replace(/\{c(\d+)\}/gi, function(_m, n){ return colLetter(Math.min(plan.cols.length, Math.max(1, Number(n)))) + r; }).replace(/\{r\}/gi, String(r));
  }

  async function buildXlsx(spec){
    var ExcelJS = await loadScript(XLSX_URL, 'ExcelJS');
    var th = theme(spec), rtl = !!spec.rtl;
    var wb = new ExcelJS.Workbook();
    wb.creator = 'om ai'; wb.created = new Date(); wb.title = spec.title || '';
    var thin = { style: 'thin', color: { argb: 'FFBFC5CC' } };
    var BORDER = { top: thin, left: thin, bottom: thin, right: thin };
    var F = function(o){ return Object.assign({ name: 'Arial', size: 11 }, o || {}); };
    var solid = function(hex){ return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex } }; };
    (spec.sheets || []).forEach(function(sh){
      var plan = sheetPlan(sh, spec), cols = plan.cols, N = Math.max(cols.length, 1);
      var ws = wb.addWorksheet(sh.name, {
        views: [{ rightToLeft: rtl, showGridLines: false }],
        pageSetup: { paperSize: 9, orientation: plan.orient, fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
          margins: { left: 0.3, right: 0.3, top: 0.45, bottom: 0.5, header: 0.2, footer: 0.25 } },
        headerFooter: { oddFooter: '&C&8&P / &N' }
      });
      cols.forEach(function(c, i){ ws.getColumn(i + 1).width = colWidth(c); });
      var r = 1;
      var band = function(text, font, height, align){
        ws.mergeCells(r, 1, r, N);
        var c = ws.getCell(r, 1); c.value = text; c.font = font; c.alignment = { horizontal: align || 'center', vertical: 'middle', wrapText: true, readingOrder: rtl ? 'rtl' : 'ltr' };
        ws.getRow(r).height = height; r++;
      };
      band(sh.title || spec.title || '', F({ size: 18, bold: true, color: { argb: 'FF' + th.dark } }), 34);
      if(sh.subtitle) band(sh.subtitle, F({ size: 11, color: { argb: 'FF6B7280' } }), 20);
      if(sh.fields && sh.fields.length){
        // حقلان في السطر: «اسم الجهة: ……………» — نصف العرض لكلّ حقل
        var half = Math.max(1, Math.floor(N / 2));
        for(var fi = 0; fi < sh.fields.length; fi += 2){
          [0, 1].forEach(function(k){
            var label = sh.fields[fi + k]; if(!label) return;
            var a = k === 0 ? 1 : half + 1, b = k === 0 ? half : N;
            if(b > a) ws.mergeCells(r, a, r, b);
            var c = ws.getCell(r, a); c.value = label + ': ' + '.'.repeat(30);
            c.font = F({ size: 11, bold: true, color: { argb: 'FF374151' } }); c.alignment = { horizontal: rtl ? 'right' : 'left', vertical: 'middle', readingOrder: rtl ? 'rtl' : 'ltr' };
          });
          ws.getRow(r).height = 22; r++;
        }
      }
      r++; // سطر فارغ قبل الجدول
      var head = r;
      cols.forEach(function(c, i){
        var cell = ws.getCell(head, i + 1);
        cell.value = c.sub ? (c.header + '\n' + c.sub) : c.header;
        cell.font = F({ bold: true, size: c.type === 'day' ? 8 : 11, color: { argb: 'FFFFFFFF' } });
        cell.fill = solid(c.type === 'count' ? th.dark : (c.weekend ? '6B7280' : th.main));
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, readingOrder: rtl ? 'rtl' : 'ltr' };
        cell.border = BORDER;
      });
      ws.getRow(head).height = plan.days ? 34 : 30;
      ws.views = [{ rightToLeft: rtl, showGridLines: false, state: 'frozen', ySplit: head, xSplit: plan.days ? plan.days.from - 1 : 0 }];
      ws.pageSetup.printTitlesRow = head + ':' + head;
      var first = head + 1, last = head + plan.rows;
      var data = sh.rows || [];
      for(var ri = 0; ri < plan.rows; ri++){
        var rr = first + ri, row = data[ri] || null, zebra = ri % 2 === 1;
        cols.forEach(function(c, ci){
          var cell = ws.getCell(rr, ci + 1);
          var v = row && ci < (sh.columns || []).length ? row[ci] : '';
          if(c.type === 'index') cell.value = (v !== '' && v != null) ? v : ri + 1;
          else if(c.type === 'formula' && c.formula) cell.value = { formula: fillFormula(c.formula, rr, plan) };
          else if(c.type === 'hours' && plan.times.length === 2 && (v === '' || v == null)){
            var A = colLetter(plan.times[0]) + rr, B = colLetter(plan.times[1]) + rr;
            cell.value = { formula: 'IF(AND(' + A + '<>"",' + B + '<>""),MOD(' + B + '-' + A + ',1)*24,"")' };
          }
          else if(c.type === 'count') cell.value = { formula: 'COUNTIF(' + colLetter(plan.days.from) + rr + ':' + colLetter(plan.days.to) + rr + ',"' + String(c.choice).replace(/"/g, '""') + '")' };
          else if(v === '' || v == null) cell.value = null;
          else if(c.type === 'time') cell.value = timeVal(v);
          else if(c.type === 'date') cell.value = dateVal(v);
          else if(c.type === 'number' || c.type === 'currency' || c.type === 'percent') cell.value = numVal(v);
          else cell.value = v;
          var fmt = c.type === 'time' ? 'hh:mm' : c.type === 'date' ? 'yyyy-mm-dd' : (c.type === 'hours' || c.format === 'hours' || c.format === 'decimal') ? '0.0'
            : (c.type === 'currency' || c.format === 'currency') ? '#,##0.00' + (c.currency ? ' "' + c.currency.replace(/"/g, '') + '"' : '')
            : (c.type === 'percent' || c.format === 'percent') ? '0%' : (c.type === 'number' || c.format === 'number') ? '#,##0.##' : null;
          if(fmt) cell.numFmt = fmt;
          var isText = c.type === 'text' || c.type === 'signature';
          cell.alignment = { horizontal: isText ? (rtl ? 'right' : 'left') : 'center', vertical: 'middle', wrapText: c.type === 'text', readingOrder: rtl ? 'rtl' : 'ltr', indent: isText ? 1 : 0 };
          cell.font = F({ size: c.type === 'day' ? 10 : 11, bold: c.type === 'count' || c.type === 'index', color: { argb: c.type === 'count' ? 'FF' + th.dark : 'FF111827' } });
          cell.border = BORDER;
          if(c.weekend) cell.fill = solid('E5E7EB');
          else if(c.type === 'count') cell.fill = solid(th.light);
          else if(zebra) cell.fill = solid(th.soft);
          var list = c.type === 'choice' || c.type === 'day' ? (c.choices || []) : (c.type === 'check' ? ['✓', '✗'] : null);
          if(list && list.length && !c.weekend) cell.dataValidation = { type: 'list', allowBlank: true, showErrorMessage: false, formulae: ['"' + list.join(',').replace(/"/g, '') + '"'] };
        });
        ws.getRow(rr).height = plan.days ? 20 : 24;
      }
      // ألوان شرطيّة على خلايا الاختيار والأيّام
      var hlCols = []; cols.forEach(function(c, i){ if(c.type === 'choice' || c.type === 'day' || c.type === 'check') hlCols.push(i + 1); });
      if(plan.hl.length && hlCols.length){
        var a0 = colLetter(Math.min.apply(null, hlCols)), a1 = colLetter(Math.max.apply(null, hlCols));
        ws.addConditionalFormatting({ ref: a0 + first + ':' + a1 + last, rules: plan.hl.map(function(h, i){
          var c = HL[h.color] || HL.gray;
          return { type: 'expression', priority: i + 1, formulae: [a0 + first + '="' + String(h.value).replace(/"/g, '""') + '"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF' + c[0] } }, font: { color: { argb: 'FF' + c[1] }, bold: true } } };
        }) });
      }
      r = last + 1;
      if(sh.totals && sh.totals.ops){
        var labelCol = 1;
        // العنوان على الأعمدة الأولى حتّى أوّل مجموع (عمود «م» وحده ضيّق فيُقصّ «الإجمالي»)
        var opCols = Object.keys(sh.totals.ops).map(Number).filter(function(x){ return x > 1; });
        var labelTo = opCols.length ? Math.min.apply(null, opCols) - 1 : 1;
        cols.forEach(function(c, ci){
          var cell = ws.getCell(r, ci + 1), op = sh.totals.ops[ci + 1];
          if(op){ var fn = { sum: 'SUM', avg: 'AVERAGE', count: 'COUNTA', min: 'MIN', max: 'MAX' }[op]; var L = colLetter(ci + 1); cell.value = { formula: 'IFERROR(' + fn + '(' + L + first + ':' + L + last + '),"")' }; cell.numFmt = (c.type === 'currency') ? '#,##0.00' : ((op === 'avg' || c.type === 'hours' || c.format === 'hours' || c.format === 'decimal') ? '0.0' : '#,##0.##'); }
          else if(ci + 1 === labelCol) cell.value = sh.totals.label || tt('officeTotal');
          cell.font = F({ bold: true, color: { argb: 'FF' + th.dark } }); cell.fill = solid(th.light); cell.border = BORDER;
          cell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder: rtl ? 'rtl' : 'ltr' };
        });
        if(labelTo > 1) ws.mergeCells(r, 1, r, labelTo);
        ws.getRow(r).height = 24; r++;
      }
      if(plan.days && sh.days.legend && sh.days.legend.length){
        r++;
        ws.mergeCells(r, 1, r, N);
        ws.getCell(r, 1).value = plan.days.choices.map(function(ch, i){ return ch + ' = ' + (sh.days.legend[i] || ''); }).join('     ');
        ws.getCell(r, 1).font = F({ size: 10, color: { argb: 'FF4B5563' } }); ws.getCell(r, 1).alignment = { horizontal: rtl ? 'right' : 'left', readingOrder: rtl ? 'rtl' : 'ltr' };
        r++;
      }
      if(sh.signatures && sh.signatures.length){
        r += 1;
        var seg = Math.max(1, Math.floor(N / sh.signatures.length));
        sh.signatures.forEach(function(sg, i){
          var a = i * seg + 1, b = i === sh.signatures.length - 1 ? N : (i + 1) * seg;
          if(b > a) ws.mergeCells(r, a, r, b);
          var c = ws.getCell(r, a); c.value = sg + ': ' + '.'.repeat(22);
          c.font = F({ bold: true, color: { argb: 'FF374151' } }); c.alignment = { horizontal: 'center', vertical: 'middle', readingOrder: rtl ? 'rtl' : 'ltr' };
        });
        ws.getRow(r).height = 30; r++;
      }
      if(sh.note){
        r++;
        ws.mergeCells(r, 1, r, N);
        var nc = ws.getCell(r, 1); nc.value = sh.note; nc.font = F({ size: 9, italic: true, color: { argb: 'FF6B7280' } });
        nc.alignment = { horizontal: rtl ? 'right' : 'left', wrapText: true, readingOrder: rtl ? 'rtl' : 'ltr' }; ws.getRow(r).height = 30;
      }
      ws.pageSetup.printArea = 'A1:' + colLetter(N) + r;
    });
    var buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ── PDF للطباعة (Excel): نفس التخطيط بـHTML — جدول مقطّع ٣٠ صفًّا برأسه ── */
  function xlsxPdfBlocks(spec){
    var blocks = [], th = theme(spec);
    (spec.sheets || []).forEach(function(sh, si){
      var plan = sheetPlan(sh, spec), cols = plan.cols, data = sh.rows || [];
      var small = cols.length > 14, fs = small ? 8 : 11;
      var head = '<h2 style="margin:0 0 2px;color:#' + th.dark + ';text-align:center">' + esc(sh.title || spec.title) + '</h2>'
        + (sh.subtitle ? '<div style="text-align:center;color:#6b7280;font-size:12px;margin-bottom:6px">' + esc(sh.subtitle) + '</div>' : '')
        + ((sh.fields || []).length ? '<div style="display:flex;flex-wrap:wrap;gap:4px 24px;font-size:12px;font-weight:700;margin:6px 0">' + sh.fields.map(function(f){ return '<span>' + esc(f) + ': ………………………</span>'; }).join('') + '</div>' : '');
      var wsum = cols.reduce(function(a, c){ return a + colWidth(c); }, 0) || 1; /* نسب من عرض الصفحة: مجموع العرض بالحروف كان يتجاوزها فيُقصّ الجدول */
      var colgroup = '<colgroup>' + cols.map(function(c){ return '<col style="width:' + (colWidth(c) * 100 / wsum).toFixed(2) + '%">'; }).join('') + '</colgroup>';
      var thead = '<tr>' + cols.map(function(c){ return '<th style="overflow:hidden;background:#' + (c.weekend ? '6b7280' : (c.type === 'count' ? th.dark : th.main)) + ';color:#fff;border:1px solid #bfc5cc;padding:3px 2px;font-size:' + fs + 'px;line-height:1.25">' + esc(c.header) + (c.sub ? '<br><span style="font-weight:400;font-size:' + (fs - 1) + 'px">' + esc(c.sub) + '</span>' : '') + '</th>'; }).join('') + '</tr>';
      var trs = [];
      for(var ri = 0; ri < plan.rows; ri++){
        var row = data[ri] || null;
        trs.push('<tr>' + cols.map(function(c, ci){
          var v = row && ci < (sh.columns || []).length ? row[ci] : '';
          if(c.type === 'index' && (v === '' || v == null)) v = ri + 1;
          if(c.type === 'hours' && (v === '' || v == null) && row && plan.times.length === 2){ /* الساعات كما يحسبها Excel للصفوف المعبّأة */
            var t1 = timeVal(row[plan.times[0] - 1]), t2 = timeVal(row[plan.times[1] - 1]);
            v = (typeof t1 === 'number' && typeof t2 === 'number') ? (((t2 - t1 + 1) % 1) * 24).toFixed(1) : '';
          }
          if(c.type === 'formula' || c.type === 'count' || c.type === 'hours') v = (v == null ? '' : v);
          var bg = c.weekend ? '#e5e7eb' : (ri % 2 ? '#' + th.soft : '#fff');
          return '<td style="overflow:hidden;border:1px solid #bfc5cc;padding:' + (small ? '2px 1px' : '5px 4px') + ';height:' + (small ? 16 : 20) + 'px;font-size:' + fs + 'px;text-align:' + (c.type === 'text' ? 'start' : 'center') + ';background:' + bg + '">' + esc(v) + '</td>';
        }).join('') + '</tr>');
      }
      var tbl = function(rows){ return '<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0">' + colgroup + thead + rows.join('') + '</table>'; };
      var CH = 30;
      for(var k = 0; k < trs.length; k += CH){
        blocks.push({ html: (k === 0 ? head : '') + tbl(trs.slice(k, k + CH)), newpage: k === 0 && si > 0 });
      }
      var foot = '';
      if(sh.signatures && sh.signatures.length) foot += '<div style="display:flex;justify-content:space-around;gap:12px;margin-top:22px;font-weight:700;font-size:12px">' + sh.signatures.map(function(s){ return '<span>' + esc(s) + ': ………………</span>'; }).join('') + '</div>';
      if(sh.note) foot += '<div style="margin-top:10px;color:#6b7280;font-size:10px">' + esc(sh.note) + '</div>';
      if(foot) blocks.push({ html: foot });
    });
    return blocks;
  }

  /* ── PowerPoint ── */
  var emojiCache = {};
  function emojiPng(icon){
    var ch = ICON[icon] || ICON.image;
    if(emojiCache[ch]) return emojiCache[ch];
    try{
      var cv = document.createElement('canvas'); cv.width = cv.height = 256;
      var cx = cv.getContext('2d');
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.font = '200px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Segoe UI Symbol",sans-serif';
      cx.fillText(ch, 128, 140);
      emojiCache[ch] = cv.toDataURL('image/png');
    }catch(e){ __swallow(e, 'office:emoji'); emojiCache[ch] = ''; }
    return emojiCache[ch];
  }
  async function buildPptx(spec){
    var PptxGenJS = await loadScript(PPTX_URL, 'PptxGenJS');
    var th = theme(spec), rtl = !!spec.rtl;
    var pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE'; pres.rtlMode = rtl; pres.author = 'om ai'; pres.title = spec.title || '';
    pres.theme = { headFontFace: 'Arial', bodyFontFace: 'Arial' };
    var W = 13.333, H = 7.5, M = 0.6;
    var X = function(x, w){ return rtl ? (W - x - w) : x; };
    var AL = rtl ? 'right' : 'left';
    var T = function(o){ return Object.assign({ fontFace: 'Arial', rtlMode: rtl, isTextBox: true, margin: 0, valign: 'top', align: AL, color: '1F2937' }, o); };
    var total = (spec.slides || []).length;
    function titleOf(s, sl){ s.addText(sl.title || '', T({ x: M, y: 0.4, w: W - 2 * M, h: 0.9, fontSize: 30, bold: true, color: th.dark, valign: 'middle' })); }
    function bulletsBox(s, list, x, y, w, h, size){
      if(!list || !list.length) return;
      s.addText(list.map(function(b, i){ return { text: b, options: { bullet: rtl ? { code: '25C0' } : { code: '25B6' }, breakLine: i < list.length - 1, paraSpaceAfter: 10 } }; }),
        T({ x: x, y: y, w: w, h: h, fontSize: size || (list.length > 5 ? 17 : 20), color: '374151' }));
    }
    function iconCircle(s, icon, x, y, d, bg){
      s.addShape(pres.shapes.OVAL, { x: x, y: y, w: d, h: d, fill: { color: bg || th.main }, line: { color: bg || th.main } });
      var img = emojiPng(icon); if(img) s.addImage({ data: img, x: x + d * 0.22, y: y + d * 0.22, w: d * 0.56, h: d * 0.56 });
    }
    function tableOf(s, tb, x, y, w){
      var headers = tb.headers.slice(), rows = tb.rows.map(function(r){ var o = r.slice(); while(o.length < headers.length) o.push(''); return o; });
      if(rtl){ headers.reverse(); rows = rows.map(function(r){ return r.slice().reverse(); }); }
      var fs = rows.length > 8 || headers.length > 6 ? 12 : 15;
      var opt = function(v, extra){ return { text: String(v == null ? '' : v), options: Object.assign({ align: 'center', valign: 'middle', rtlMode: rtl, fontFace: 'Arial', fontSize: fs, color: '1F2937' }, extra || {}) }; };
      var body = [headers.map(function(h){ return opt(h, { bold: true, color: 'FFFFFF', fill: { color: th.main } }); })]
        .concat(rows.map(function(r, i){ return r.map(function(v){ return opt(v, { fill: { color: i % 2 ? 'FFFFFF' : th.soft } }); }); }));
      s.addTable(body, { x: x, y: y, w: w, rowH: rows.length > 8 ? 0.38 : 0.48, border: { type: 'solid', pt: 0.75, color: 'D1D5DB' } });
    }
    (spec.slides || []).forEach(function(sl, idx){
      var dark = sl.layout === 'title' || sl.layout === 'closing' || sl.layout === 'section';
      var s = pres.addSlide();
      s.background = { color: sl.layout === 'section' ? th.main : (dark ? th.dark : 'FFFFFF') };
      if(!dark) s.addText(String(idx + 1) + ' / ' + total, T({ x: X(M, 1.2), y: H - 0.45, w: 1.2, h: 0.3, fontSize: 10, color: '9CA3AF', align: rtl ? 'left' : 'right', rtlMode: false }));
      var L = sl.layout;
      if(L === 'title' || L === 'closing'){
        iconCircle(s, sl.icon || (L === 'closing' ? 'star' : 'idea'), X(1.0, 2.4), 2.45, 2.4, th.main);
        s.addText(sl.title || spec.title || '', T({ x: X(3.9, 8.6), y: 2.3, w: 8.6, h: 1.6, fontSize: L === 'title' ? 42 : 40, bold: true, color: 'FFFFFF', valign: 'bottom' }));
        if(sl.subtitle) s.addText(sl.subtitle, T({ x: X(3.9, 8.6), y: 4.05, w: 8.6, h: 1.0, fontSize: 20, color: th.light }));
      } else if(L === 'section'){
        s.addText(sl.title || '', T({ x: M, y: 2.6, w: W - 2 * M, h: 1.3, fontSize: 40, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' }));
        if(sl.subtitle) s.addText(sl.subtitle, T({ x: M, y: 3.95, w: W - 2 * M, h: 0.8, fontSize: 20, color: th.light, align: 'center' }));
      } else if(L === 'table' && sl.table){
        titleOf(s, sl);
        tableOf(s, sl.table, M, 1.55, W - 2 * M);
        if(sl.subtitle) s.addText(sl.subtitle, T({ x: M, y: H - 0.95, w: W - 2 * M, h: 0.4, fontSize: 12, color: '6B7280' }));
      } else if(L === 'stats' && sl.stats){
        titleOf(s, sl);
        var n = sl.stats.length, gap = 0.35, cw = (W - 2 * M - gap * (n - 1)) / n;
        sl.stats.forEach(function(st, i){
          var x = X(M + i * (cw + gap), cw);
          s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x, y: 1.9, w: cw, h: 3.4, fill: { color: th.soft }, line: { color: th.light }, rectRadius: 0.15 });
          s.addText(st.value, T({ x: x, y: 2.35, w: cw, h: 1.4, fontSize: n > 3 ? 44 : 54, bold: true, color: [th.main, th.dark, th.accent, '6B7280'][i % 4], align: 'center', valign: 'middle', rtlMode: false }));
          s.addText(st.label, T({ x: x + 0.2, y: 3.85, w: cw - 0.4, h: 1.1, fontSize: 17, color: '374151', align: 'center' }));
        });
        bulletsBox(s, sl.bullets, M, 5.6, W - 2 * M, 1.2, 15);
      } else if(L === 'chart' && sl.chart){
        titleOf(s, sl);
        var C = sl.chart, typ = { bar: pres.charts.BAR, column: pres.charts.BAR, line: pres.charts.LINE, pie: pres.charts.PIE, doughnut: pres.charts.DOUGHNUT }[C.type] || pres.charts.BAR;
        var data = C.series.map(function(se){ return { name: se.name || ' ', labels: C.labels, values: se.values }; });
        var pie = C.type === 'pie' || C.type === 'doughnut';
        if(pie) data = data.slice(0, 1);
        var hasSide = sl.bullets && sl.bullets.length, cwid = hasSide ? 8.0 : W - 2 * M;
        s.addChart(typ, data, { x: X(M, cwid), y: 1.5, w: cwid, h: 5.3, barDir: C.type === 'bar' ? 'bar' : 'col',
          chartColors: [th.main, th.accent, th.dark, 'F59E0B', '6B7280', 'EF4444', '8B5CF6', '10B981', '3B82F6', 'EC4899', '84CC16', '06B6D4'],
          showLegend: pie || data.length > 1, legendPos: 'b', legendFontSize: 12, legendFontFace: 'Arial',
          showValue: !pie, showPercent: pie, dataLabelFontSize: 11, dataLabelFontFace: 'Arial', dataLabelColor: '374151', dataLabelPosition: pie ? 'bestFit' : 'outEnd',
          catAxisLabelFontSize: 12, catAxisLabelFontFace: 'Arial', catAxisLabelColor: '4B5563', valAxisLabelFontSize: 11, valAxisLabelColor: '6B7280',
          valGridLine: { color: 'E5E7EB', size: 0.75 }, catGridLine: { style: 'none' }, holeSize: 55,
          catAxisOrientation: (rtl && C.type !== 'bar') ? 'maxMin' : 'minMax', /* العربيّة: الأسبوع الأوّل يمينًا */
          valAxisMinVal: (!pie && data.every(function(d){ return d.values.every(function(v){ return v >= 0; }); })) ? 0 : undefined });
        if(hasSide) bulletsBox(s, sl.bullets, X(M + cwid + 0.4, W - 2 * M - cwid - 0.4), 1.8, W - 2 * M - cwid - 0.4, 4.8, 16);
      } else if(L === 'twoColumn' && (sl.left || sl.right)){
        titleOf(s, sl);
        var cw2 = (W - 2 * M - 0.4) / 2;
        [sl.left, sl.right].forEach(function(col, i){
          if(!col) return;
          var x = X(M + i * (cw2 + 0.4), cw2);
          s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x, y: 1.55, w: cw2, h: 5.2, fill: { color: i ? 'FFFFFF' : th.soft }, line: { color: th.light, width: 1.25 }, rectRadius: 0.15 });
          if(col.heading) s.addText(col.heading, T({ x: x + 0.35, y: 1.8, w: cw2 - 0.7, h: 0.6, fontSize: 21, bold: true, color: i ? th.dark : th.main }));
          bulletsBox(s, col.bullets, x + 0.35, 2.55, cw2 - 0.7, 3.9, 16);
        });
      } else if(L === 'timeline' && sl.steps){
        titleOf(s, sl);
        var k = sl.steps.length, sw = (W - 2 * M) / k;
        s.addShape(pres.shapes.LINE, { x: M + sw / 2, y: 3.05, w: W - 2 * M - sw, h: 0, line: { color: th.light, width: 4 } });
        sl.steps.forEach(function(stp, i){
          var cxp = rtl ? (W - M - sw * (i + 0.5)) : (M + sw * (i + 0.5));
          s.addShape(pres.shapes.OVAL, { x: cxp - 0.45, y: 2.6, w: 0.9, h: 0.9, fill: { color: i % 2 ? th.accent : th.main }, line: { color: 'FFFFFF', width: 2 } });
          s.addText(String(i + 1), T({ x: cxp - 0.45, y: 2.6, w: 0.9, h: 0.9, fontSize: 22, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', rtlMode: false }));
          s.addText(stp.title || '', T({ x: cxp - sw / 2 + 0.1, y: 3.75, w: sw - 0.2, h: 0.6, fontSize: 17, bold: true, color: th.dark, align: 'center' }));
          if(stp.text) s.addText(stp.text, T({ x: cxp - sw / 2 + 0.1, y: 4.4, w: sw - 0.2, h: 1.9, fontSize: 13, color: '4B5563', align: 'center' }));
        });
      } else if(L === 'quote' && sl.quote){
        s.background = { color: th.soft };
        s.addText('“', T({ x: M, y: 0.6, w: W - 2 * M, h: 1.4, fontSize: 110, color: th.accent, align: 'center', rtlMode: false }));
        s.addText(sl.quote, T({ x: 1.4, y: 2.1, w: W - 2.8, h: 2.8, fontSize: 28, italic: true, color: th.dark, align: 'center', valign: 'middle' }));
        if(sl.author) s.addText('— ' + sl.author, T({ x: 1.4, y: 5.1, w: W - 2.8, h: 0.6, fontSize: 18, color: '6B7280', align: 'center' }));
      } else if(L === 'imageText'){
        titleOf(s, sl);
        var pw = 4.9;
        s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: X(M, pw), y: 1.55, w: pw, h: 5.2, fill: { color: th.light }, line: { color: th.light }, rectRadius: 0.2 });
        var img = emojiPng(sl.icon || 'image'); if(img) s.addImage({ data: img, x: X(M + (pw - 2.4) / 2, 2.4), y: 2.3, w: 2.4, h: 2.4 });
        if(sl.imageCaption) s.addText(sl.imageCaption, T({ x: X(M + 0.3, pw - 0.6), y: 5.2, w: pw - 0.6, h: 1.2, fontSize: 14, color: th.dark, align: 'center' }));
        bulletsBox(s, sl.bullets, X(M + pw + 0.5, W - 2 * M - pw - 0.5), 1.75, W - 2 * M - pw - 0.5, 4.9);
      } else {
        titleOf(s, sl);
        var side = !!sl.icon, bw = side ? W - 2 * M - 3.6 : W - 2 * M;
        if(sl.subtitle) s.addText(sl.subtitle, T({ x: X(M, bw), y: 1.35, w: bw, h: 0.55, fontSize: 16, color: '6B7280' }));
        bulletsBox(s, sl.bullets, X(M, bw), sl.subtitle ? 2.0 : 1.65, bw, 4.9);
        if(side){
          s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: X(W - M - 3.2, 3.2), y: 1.65, w: 3.2, h: 4.6, fill: { color: th.soft }, line: { color: th.light }, rectRadius: 0.2 });
          iconCircle(s, sl.icon, X(W - M - 3.2 + 0.6, 2.0), 2.9, 2.0, th.main);
        }
      }
      if(sl.notes) s.addNotes(sl.notes);
    });
    return await pres.write({ outputType: 'blob' });
  }

  /* ── البطاقة ── */
  function css(){
    if(document.getElementById('omranOfficeCss')) return;
    var st = document.createElement('style');
    st.id = 'omranOfficeCss';
    st.textContent = '.omOfWrap{margin:6px 0 10px;max-width:560px;white-space:normal;}'
      + '.msg .omOf{display:flex;flex-direction:column;gap:10px;padding:12px 14px;border:1px solid var(--border,rgba(255,255,255,.14));border-radius:var(--r-3,14px);background:rgba(127,127,127,.10);color:var(--text,#eee) !important;}' /* لا --panel2: في الوضع الأسود هو #000 (PITFALLS) */
      + '.omOfHead{display:flex;align-items:center;gap:12px;min-width:0;}'
      + '.msg .omOfIco{flex:0 0 auto;width:46px;height:46px;border-radius:12px;display:flex;align-items:center;justify-content:center;font:800 19px/1 Arial,sans-serif;color:#fff !important;}'
      + '.omOfX{background:#1D6F42;} .omOfP{background:#C43E1C;} .omOfLock{background:rgba(245,158,11,.18);font-size:22px !important;}'
      + '.omOfHeadTxt{display:flex;flex-direction:column;gap:2px;min-width:0;}'
      + '.msg .omOfName{font-size:15px;font-weight:800;line-height:1.35;color:var(--text,#eee) !important;overflow-wrap:anywhere;}'
      + '.msg .omOfMeta{font-size:12.5px;color:var(--muted,#9aa3b2) !important;}'
      + '.msg .omOfFree{align-self:flex-start;font-size:11.5px;font-weight:700;padding:2px 9px;border-radius:999px;background:rgba(16,185,129,.14);color:#10b981 !important;}'
      + '.omOfParts{display:flex;flex-wrap:wrap;gap:6px;}'
      + '.msg .omOfPart{font-size:12px;padding:3px 9px;border-radius:8px;background:rgba(127,127,127,.12);color:var(--text,#eee) !important;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
      + '.omOfBtns{display:flex;flex-wrap:wrap;gap:8px;}'
      + '.msg .omOfBtn{-webkit-appearance:none;appearance:none;min-height:40px;padding:9px 18px;border-radius:999px;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;border:1px solid var(--border,rgba(255,255,255,.18)) !important;background:rgba(127,127,127,.12) !important;color:var(--text,#eee) !important;}'
      + '.msg .omOfMain{background:#059669 !important;border-color:transparent !important;color:#fff !important;}'
      + '.msg .omOfBtn:disabled{opacity:.55;cursor:default;}'
      + '.msg .omOfNote{font-size:12.5px;line-height:1.55;color:var(--muted,#9aa3b2) !important;}'
      + '.msg .omOfErr{color:#dc2626 !important;}'
      + '.msg .omOfGateTxt{font-size:14px;line-height:1.6;font-weight:700;color:var(--text,#eee) !important;}'
      + 'html.mobile-ui .omOfWrap{max-width:100%;}'
      + 'html.mobile-ui .omOfBtns .omOfBtn{flex:1 1 auto;}'
      + 'html[data-mode="light"] .msg .omOf{background:#fff;border-color:rgba(0,0,0,.12);}'
      + 'html[data-mode="light"] .msg .omOfFree{color:#047857 !important;}';
    document.head.appendChild(st);
  }
  function save(blob, name){
    if(typeof msgSaveExport === 'function') return msgSaveExport(blob, name);
    var u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(u); }, 4000);
    return false;
  }
  function btn(cls, label, fn){
    var b = el('button', 'omOfBtn ' + cls, label); b.type = 'button';
    b.addEventListener('click', function(ev){ try{ if(ev && ev.stopPropagation) ev.stopPropagation(); fn(b); }catch(e){ __swallow(e, 'office:click'); } });
    return b;
  }
  function gateCard(o){
    var box = el('div', 'omOf');
    var head = el('div', 'omOfHead'); head.appendChild(el('div', 'omOfIco omOfLock', '🔒'));
    head.appendChild(el('div', 'omOfGateTxt', tt(o.gate === 'login' ? 'officeGateLogin' : 'officeGatePlans')));
    box.appendChild(head);
    var row = el('div', 'omOfBtns');
    row.appendChild(btn('omOfMain', tt(o.gate === 'login' ? 'officeLogin' : 'officeSubscribe'), function(){
      if(o.gate === 'login'){ if(typeof window.requireLogin === 'function') window.requireLogin('guestLimit'); return; }
      if(typeof window.omranOpenPlans === 'function') window.omranOpenPlans('office', 'chat');
    }));
    box.appendChild(row);
    return box;
  }
  function fileCard(o){
    var spec = o.spec, isX = spec.kind === 'xlsx';
    var name = spec.fileName + (isX ? '.xlsx' : '.pptx');
    var box = el('div', 'omOf');
    var head = el('div', 'omOfHead');
    head.appendChild(el('div', 'omOfIco ' + (isX ? 'omOfX' : 'omOfP'), isX ? 'X' : 'P'));
    var ht = el('div', 'omOfHeadTxt');
    ht.appendChild(el('div', 'omOfName', spec.fileName + '\u2066' + (isX ? '.xlsx' : '.pptx') + '\u2069')); /* الامتداد معزول يسارًا-يمينًا: «.xlsx» لا «xlsx.» في الاسم العربيّ */
    ht.appendChild(el('div', 'omOfMeta', (isX ? 'Excel · ' + fill(tt('officeSheets'), { n: spec.sheets.length }) : 'PowerPoint · ' + fill(tt('officeSlides'), { n: spec.slides.length }))));
    head.appendChild(ht); box.appendChild(head);
    if(spec.free) box.appendChild(el('div', 'omOfFree', tt('officeFreeBadge')));
    var parts = el('div', 'omOfParts');
    (isX ? spec.sheets.map(function(s){ return s.name; }) : spec.slides.slice(0, 8).map(function(s, i){ return (i + 1) + '. ' + (s.title || ''); })).forEach(function(p){ parts.appendChild(el('span', 'omOfPart', p)); });
    box.appendChild(parts);
    var note = el('div', 'omOfNote', spec.free ? tt('officeFreeHint') : tt('officeEditHint'));
    var row = el('div', 'omOfBtns');
    var busy = false;
    var run = function(b, label, job){
      if(busy) return;
      busy = true; b.disabled = true; b.textContent = tt('officeBuilding'); note.className = 'omOfNote';
      Promise.resolve().then(job).then(function(){ b.disabled = false; b.textContent = label; busy = false; }, function(e){
        __swallow(e, 'office:build');
        b.disabled = false; b.textContent = label; busy = false;
        note.textContent = tt('officeFail'); note.className = 'omOfNote omOfErr';
      });
    };
    row.appendChild(btn('omOfMain', '⬇ ' + tt('officeDownload'), function(b){
      run(b, '⬇ ' + tt('officeDownload'), function(){ return (isX ? buildXlsx(spec) : buildPptx(spec)).then(function(blob){ save(blob, name); }); });
    }));
    if(isX && typeof omranExportPagedPdfFile === 'function'){
      row.appendChild(btn('', '🖨 ' + tt('officePdf'), function(b){
        run(b, '🖨 ' + tt('officePdf'), function(){ return omranExportPagedPdfFile(xlsxPdfBlocks(spec), { rtl: !!spec.rtl, fileName: spec.fileName + '.pdf', pixelRatio: 2, jpegQuality: 0.9, fontFamily: 'Arial, Tahoma, sans-serif' }); });
      }));
    }
    box.appendChild(row);
    box.appendChild(note);
    return box;
  }
  window.omranOfficeCard = function(office){
    css();
    var wrap = el('div', 'omOfWrap');
    try{
      if(office && office.gate) wrap.appendChild(gateCard(office));
      else if(office && office.spec && (office.spec.sheets || office.spec.slides)) wrap.appendChild(fileCard(office));
    }catch(e){ __swallow(e, 'office:card'); }
    return wrap;
  };
  /* آخر ملفّ في المحادثة (آخر ٨ رسائل) — يُرسل مع الطلب ليعدّل عليه النموذج. علامة free لا تُرسل (الخادم يقرّرها). */
  window.omranOfficeLast = function(chat){
    try{
      var ms = (chat && Array.isArray(chat.messages)) ? chat.messages : [];
      for(var i = ms.length - 1, seen = 0; i >= 0 && seen < 8; i--, seen++){
        var o = ms[i] && ms[i].cards && ms[i].cards.kind === 'office' && ms[i].cards.office;
        if(o && o.spec){ var s = Object.assign({}, o.spec); delete s.free; return s; }
      }
    }catch(e){ __swallow(e, 'office:last'); }
    return undefined;
  };
  /* للاختبار والمسابر: البناء نفسه بلا بطاقة */
  window.omranOffice = { buildXlsx: buildXlsx, buildPptx: buildPptx, xlsxPdfBlocks: xlsxPdfBlocks, sheetPlan: sheetPlan };
})();
