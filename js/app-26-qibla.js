// 📿 القبلة والمواقيت — مواقيت الصلاة (aladhan) + بوصلة القبلة + تنبيه
// اختياري قبل كل صلاة (يركب على نظام تذكيرات مها: type:'prayer' + Web Push).
// المصادر مجانية والواجهة بلغة المستخدم.
(function(){
  'use strict';

  var KAABA = { lat: 21.4225, lng: 39.8262 };
  var PRAYERS = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  var PR_AR = { Fajr: 'الفجر', Sunrise: 'الشروق', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };
  var PR_EN = { Fajr: 'Fajr', Sunrise: 'Sunrise', Dhuhr: 'Dhuhr', Asr: 'Asr', Maghrib: 'Maghrib', Isha: 'Isha' };
  var METHODS = [
    { v: 4, ar: 'أم القرى (مكة)', en: 'Umm al-Qura' },
    { v: 3, ar: 'رابطة العالم الإسلامي', en: 'Muslim World League' },
    { v: 8, ar: 'الخليج', en: 'Gulf Region' },
    { v: 5, ar: 'الهيئة المصرية', en: 'Egyptian Authority' },
    { v: 1, ar: 'كراتشي', en: 'Karachi' },
    { v: 2, ar: 'أمريكا الشمالية (ISNA)', en: 'ISNA' },
  ];

  function qIsAr(){ try{ return (typeof lang === 'undefined' || !lang || lang === 'ar' || lang === 'ur'); }catch(e){ return true; } }
  function qt(ar, en){ return qIsAr() ? ar : en; }
  function prName(k){ return qIsAr() ? PR_AR[k] : PR_EN[k]; }
  function getMethod(){ try{ return parseInt(localStorage.getItem('aiapp_pray_method') || '4', 10); }catch(e){ return 4; } }

  var S = { timings: null, dateStr: null, loc: null, ticker: null };

  function loc(){
    if(S.loc) return Promise.resolve(S.loc);
    if(typeof mahaGetLocation === 'function'){
      return mahaGetLocation().then(function(l){ S.loc = l; return l; });
    }
    return new Promise(function(res){
      if(!navigator.geolocation){ res(null); return; }
      navigator.geolocation.getCurrentPosition(
        function(p){ S.loc = { lat: p.coords.latitude, lng: p.coords.longitude }; res(S.loc); },
        function(){ res(null); },
        { timeout: 8000, maximumAge: 3600000 });
    });
  }

  function fetchTimings(){
    return loc().then(function(l){
      if(!l) return Promise.reject(new Error('no-location'));
      var d = new Date();
      var ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      return fetch('https://api.aladhan.com/v1/timings/' + ds
        + '?latitude=' + l.lat + '&longitude=' + l.lng + '&method=' + getMethod())
        .then(function(r){ return r.json(); })
        .then(function(data){
          if(!data || !data.data || !data.data.timings) throw new Error('bad-data');
          S.timings = data.data.timings;
          S.hijri = data.data.date && data.data.date.hijri;
          return S.timings;
        });
    });
  }

  /* الصلاة القادمة والعد التنازلي */
  function nextPrayer(){
    if(!S.timings) return null;
    var now = new Date();
    for(var i = 0; i < PRAYERS.length; i++){
      var k = PRAYERS[i];
      var hm = (S.timings[k] || '').split(':');
      if(hm.length < 2) continue;
      var t = new Date(now); t.setHours(+hm[0], +hm[1], 0, 0);
      if(t > now) return { key: k, at: t };
    }
    // بعد العشاء → فجر الغد
    var fhm = (S.timings.Fajr || '').split(':');
    var ft = new Date(now); ft.setDate(ft.getDate() + 1); ft.setHours(+fhm[0], +fhm[1], 0, 0);
    return { key: 'Fajr', at: ft };
  }

  function fmtDur(ms){
    if(ms < 0) ms = 0;
    var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
  }

  function qiblaBearing(l){
    var φ1 = l.lat * Math.PI / 180, φ2 = KAABA.lat * Math.PI / 180;
    var Δλ = (KAABA.lng - l.lng) * Math.PI / 180;
    var y = Math.sin(Δλ) * Math.cos(φ2);
    var x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  /* ============ الواجهة ============ */
  function shell(){
    var el = document.getElementById('omranQiblaShell');
    if(el) return el;
    el = document.createElement('div');
    el.id = 'omranQiblaShell';
    el.dir = 'rtl';
    el.style.cssText = 'position:fixed;inset:0;z-index:9500;background:var(--bg,#0a0b10);display:none;flex-direction:column;overflow:hidden;';
    el.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--border,rgba(255,255,255,.08));">' +
        '<h2 style="margin:0;font-size:17px;flex:1;">📿 ' + qt('القبلة والمواقيت', 'Qibla & Prayer Times') + '</h2>' +
        '<button type="button" id="qClose" aria-label="close" style="background:none;border:1px solid var(--border,rgba(255,255,255,.15));border-radius:50%;width:34px;height:34px;color:inherit;font-size:15px;cursor:pointer;">✕</button>' +
      '</div>' +
      '<div style="display:flex;gap:6px;padding:10px 14px 0;">' +
        '<button type="button" id="qTabTimes" style="flex:1;padding:9px;border-radius:10px;border:1px solid var(--omGoldSoft,rgba(212,175,55,.35));background:var(--omGold,#d4af37);color:#141414;font-weight:700;cursor:pointer;">' + qt('المواقيت', 'Times') + '</button>' +
        '<button type="button" id="qTabQibla" style="flex:1;padding:9px;border-radius:10px;border:1px solid var(--border,rgba(255,255,255,.12));background:rgba(255,255,255,.04);color:inherit;cursor:pointer;">' + qt('القبلة', 'Qibla') + '</button>' +
      '</div>' +
      '<div id="qBody" style="flex:1;min-height:0;overflow-y:auto;padding:14px calc(14px) calc(24px + env(safe-area-inset-bottom,0px));"></div>';
    document.body.appendChild(el);
    el.querySelector('#qClose').onclick = closeQibla;
    el.querySelector('#qTabTimes').onclick = function(){ setTab('times'); };
    el.querySelector('#qTabQibla').onclick = function(){ setTab('qibla'); };
    return el;
  }

  function setTab(tab){
    var el = shell();
    var tb = el.querySelector('#qTabTimes'), qb = el.querySelector('#qTabQibla');
    var on = 'background:var(--omGold,#d4af37);color:#141414;font-weight:700;';
    var off = 'background:rgba(255,255,255,.04);color:inherit;';
    tb.setAttribute('style', tb.getAttribute('style').replace(/background:[^;]+;color:[^;]+;(font-weight:700;)?/, (tab === 'times' ? on : off)));
    qb.setAttribute('style', qb.getAttribute('style').replace(/background:[^;]+;color:[^;]+;(font-weight:700;)?/, (tab === 'qibla' ? on : off)));
    if(S.ticker){ clearInterval(S.ticker); S.ticker = null; }
    stopCompass();
    if(tab === 'times') renderTimes(); else renderQibla();
  }

  function renderTimes(){
    var el = shell();
    var body = el.querySelector('#qBody');
    if(!S.timings){
      body.innerHTML = '<div style="text-align:center;color:var(--muted,#98a0b3);padding:30px 0;">⏳ ' + qt('جارٍ تحديد موقعك وحساب المواقيت...', 'Locating and computing times...') + '</div>';
      fetchTimings().then(function(){ renderTimes(); }).catch(function(e){
        __swallow(e, 'qibla:times');
        body.innerHTML = '<div style="text-align:center;color:var(--muted,#98a0b3);padding:30px 0;">' + qt('تعذّر تحديد موقعك. فعّل خدمة الموقع وأعد المحاولة.', 'Could not get your location. Enable location and retry.') + '<br><br><button id="qRetry" style="padding:8px 16px;border-radius:10px;border:1px solid var(--omGoldSoft);background:rgba(212,175,55,.1);color:inherit;cursor:pointer;">' + qt('إعادة', 'Retry') + '</button></div>';
        var rb = body.querySelector('#qRetry'); if(rb) rb.onclick = function(){ S.loc = null; renderTimes(); };
      });
      return;
    }
    var np = nextPrayer();
    var mOpts = METHODS.map(function(m){ return '<option value="' + m.v + '"' + (m.v === getMethod() ? ' selected' : '') + '>' + qt(m.ar, m.en) + '</option>'; }).join('');
    var rows = PRAYERS.map(function(k){
      var isNext = np && np.key === k;
      return '<div style="display:flex;align-items:center;gap:10px;padding:13px 14px;border-radius:12px;margin-bottom:7px;' +
        (isNext ? 'background:rgba(212,175,55,.14);border:1px solid var(--omGoldSoft,rgba(212,175,55,.4));' : 'background:rgba(255,255,255,.03);border:1px solid var(--border,rgba(255,255,255,.07));') + '">' +
        '<span style="font-size:15px;font-weight:' + (isNext ? '800' : '600') + ';flex:1;">' + prName(k) + (isNext ? ' •' : '') + '</span>' +
        '<span style="font-size:16px;font-weight:700;letter-spacing:.5px;">' + (S.timings[k] || '--') + '</span>' +
        (k !== 'Sunrise' ? '<button type="button" class="qBell" data-p="' + k + '" title="' + qt('تنبيه', 'Alert') + '" style="background:none;border:none;font-size:18px;cursor:pointer;opacity:.85;">' + (hasAlert(k) ? '🔔' : '🔕') + '</button>' : '') +
        '</div>';
    }).join('');
    var hij = S.hijri ? (S.hijri.day + ' ' + (qIsAr() ? S.hijri.month.ar : S.hijri.month.en) + ' ' + S.hijri.year + ' ' + qt('هـ', 'AH')) : '';
    body.innerHTML =
      (np ? '<div style="text-align:center;background:linear-gradient(135deg,rgba(212,175,55,.16),rgba(212,175,55,.04));border:1px solid var(--omGoldSoft,rgba(212,175,55,.35));border-radius:16px;padding:16px;margin-bottom:14px;">' +
        '<div style="font-size:13px;color:var(--muted,#98a0b3);">' + qt('الصلاة القادمة', 'Next prayer') + '</div>' +
        '<div style="font-size:22px;font-weight:800;margin:4px 0;">' + prName(np.key) + '</div>' +
        '<div id="qCountdown" style="font-size:28px;font-weight:800;letter-spacing:2px;font-variant-numeric:tabular-nums;color:var(--omGold,#d4af37);">--:--:--</div>' +
        '</div>' : '') +
      (hij ? '<div style="text-align:center;font-size:13px;color:var(--muted,#98a0b3);margin-bottom:12px;">📅 ' + hij + '</div>' : '') +
      rows +
      '<div style="margin-top:14px;font-size:13px;color:var(--muted,#98a0b3);">' + qt('طريقة الحساب', 'Calculation method') + '</div>' +
      '<select id="qMethod" style="width:100%;margin-top:6px;padding:10px;border-radius:10px;background:rgba(255,255,255,.04);color:inherit;border:1px solid var(--border,rgba(255,255,255,.12));font-size:14px;">' + mOpts + '</select>' +
      '<div style="font-size:12px;color:var(--muted,#98a0b3);margin-top:12px;line-height:1.7;">🔔 ' + qt('اضغط الجرس بجانب أي صلاة لتفعيل تنبيه قبلها (يصلك حتى والتطبيق مغلق).', 'Tap the bell beside a prayer to get an alert before it (arrives even when the app is closed).') + '</div>';

    body.querySelector('#qMethod').onchange = function(){
      try{ localStorage.setItem('aiapp_pray_method', this.value); }catch(e){ /* guard-ok */ }
      S.timings = null; renderTimes();
    };
    Array.prototype.forEach.call(body.querySelectorAll('.qBell'), function(b){
      b.onclick = function(){ toggleAlert(b.getAttribute('data-p'), b); };
    });
    if(np){
      S.ticker = setInterval(function(){
        var cd = document.getElementById('qCountdown');
        if(!cd){ clearInterval(S.ticker); S.ticker = null; return; }
        var left = np.at - new Date();
        if(left <= 0){ S.timings = null; renderTimes(); return; }
        cd.textContent = fmtDur(left);
      }, 1000);
    }
  }

  /* ==== التنبيهات (تُخزَّن محليًا للعرض + تُرسل للسيرفر) ==== */
  function alertsMap(){ try{ return JSON.parse(localStorage.getItem('aiapp_pray_alerts') || '{}'); }catch(e){ return {}; } }
  function hasAlert(k){ return !!alertsMap()[k]; }
  function toggleAlert(k, btn){
    var token = (typeof authGet === 'function') ? authGet('aiapp_auth_token') : '';
    if(!token){ alert(qt('تسجيل الدخول مطلوب لتفعيل التنبيهات.', 'Please sign in to enable alerts.')); return; }
    var m = alertsMap();
    if(m[k]){ // إيقاف
      var id = m[k];
      delete m[k];
      try{ localStorage.setItem('aiapp_pray_alerts', JSON.stringify(m)); }catch(e){ /* guard-ok */ }
      if(btn) btn.textContent = '🔕';
      fetch('/api/reminders?id=' + encodeURIComponent(id), { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } })
        .catch(function(e){ __swallow(e, 'qibla:del'); });
      return;
    }
    // تفعيل — نسأل كم دقيقة قبل
    var mins = prompt(qt('كم دقيقة قبل ' + prName(k) + '؟ (0 = وقت الأذان)', 'How many minutes before ' + prName(k) + '? (0 = at adhan)'), '10');
    if(mins === null) return;
    var off = Math.max(0, Math.min(120, parseInt(mins, 10) || 0));
    if(btn) btn.textContent = '⏳';
    loc().then(function(l){
      if(!l){ if(btn) btn.textContent = '🔕'; alert(qt('تعذّر تحديد الموقع.', 'Location unavailable.')); return; }
      return fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          type: 'prayer', prayerName: k, offsetMinutes: off, lat: l.lat, lng: l.lng,
          message: off > 0 ? qt('باقي ' + off + ' دقيقة على ' + prName(k), off + ' min to ' + prName(k)) : qt('حان وقت ' + prName(k), prName(k) + ' time'),
        }),
      }).then(function(r){ return r.json(); }).then(function(d){
        if(d && d.ok && d.reminder){
          var mm = alertsMap(); mm[k] = d.reminder.id;
          try{ localStorage.setItem('aiapp_pray_alerts', JSON.stringify(mm)); }catch(e){ /* guard-ok */ }
          if(btn) btn.textContent = '🔔';
          if(typeof mahaEnsurePushSubscribed === 'function') mahaEnsurePushSubscribed();
        } else { if(btn) btn.textContent = '🔕'; alert(qt('تعذّر حفظ التنبيه.', 'Could not save alert.')); }
      });
    }).catch(function(e){ __swallow(e, 'qibla:alert'); if(btn) btn.textContent = '🔕'; });
  }

  /* ==== بوصلة القبلة ==== */
  var compassHandler = null;
  function renderQibla(){
    var el = shell();
    var body = el.querySelector('#qBody');
    body.innerHTML = '<div style="text-align:center;color:var(--muted,#98a0b3);padding:20px 0;">⏳</div>';
    loc().then(function(l){
      if(!l){ body.innerHTML = '<div style="text-align:center;color:var(--muted,#98a0b3);padding:30px 0;">' + qt('فعّل خدمة الموقع لعرض القبلة.', 'Enable location to show Qibla.') + '</div>'; return; }
      var bearing = qiblaBearing(l);
      body.innerHTML =
        '<div style="text-align:center;">' +
          '<div style="font-size:14px;color:var(--muted,#98a0b3);margin-bottom:6px;">' + qt('اتجاه القبلة من موقعك', 'Qibla direction from your location') + '</div>' +
          '<div style="font-size:34px;font-weight:800;color:var(--omGold,#d4af37);margin-bottom:4px;">' + Math.round(bearing) + '°</div>' +
          '<div style="font-size:12.5px;color:var(--muted,#98a0b3);margin-bottom:18px;">' + qt('من الشمال باتجاه عقارب الساعة', 'clockwise from North') + '</div>' +
          '<div id="qCompass" style="position:relative;width:230px;height:230px;margin:0 auto;border-radius:50%;border:2px solid var(--border,rgba(255,255,255,.15));background:radial-gradient(circle,rgba(255,255,255,.03),transparent);">' +
            '<div style="position:absolute;top:6px;left:50%;transform:translateX(-50%);font-size:12px;color:var(--muted,#98a0b3);">N</div>' +
            '<div id="qNeedle" style="position:absolute;top:50%;left:50%;width:4px;height:96px;background:linear-gradient(to top,transparent,var(--omGold,#d4af37));transform-origin:bottom center;transform:translate(-50%,-100%) rotate(' + bearing + 'deg);border-radius:3px;"></div>' +
            '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:26px;">🕋</div>' +
          '</div>' +
          '<div id="qCompassHint" style="font-size:12.5px;color:var(--muted,#98a0b3);margin-top:16px;line-height:1.7;"></div>' +
        '</div>';
      startCompass(bearing);
    }).catch(function(e){ __swallow(e, 'qibla:compass'); });
  }

  function startCompass(bearing){
    var hint = document.getElementById('qCompassHint');
    function apply(heading){
      var needle = document.getElementById('qNeedle');
      if(!needle) return;
      // زاوية الإبرة = اتجاه القبلة - اتجاه الجهاز (تدور مع الهاتف)
      var rel = (bearing - heading + 360) % 360;
      needle.style.transform = 'translate(-50%,-100%) rotate(' + rel + 'deg)';
      var diff = Math.min(rel, 360 - rel);
      needle.style.background = diff < 8
        ? 'linear-gradient(to top,transparent,#22c55e)'
        : 'linear-gradient(to top,transparent,var(--omGold,#d4af37))';
      if(hint) hint.textContent = diff < 8
        ? qt('✅ أنت تواجه القبلة الآن', '✅ You are facing the Qibla')
        : qt('أدر هاتفك حتى يومض السهم أخضر', 'Rotate your phone until the arrow turns green');
    }
    function onOrient(e){
      var heading = null;
      if(typeof e.webkitCompassHeading === 'number') heading = e.webkitCompassHeading; // iOS
      else if(e.absolute && typeof e.alpha === 'number') heading = 360 - e.alpha;      // أندرويد مطلق
      if(heading != null) apply(heading);
    }
    function attach(){
      compassHandler = onOrient;
      window.addEventListener('deviceorientationabsolute', onOrient, true);
      window.addEventListener('deviceorientation', onOrient, true);
      if(hint) hint.textContent = qt('حرّك هاتفك على شكل ٨ للمعايرة.', 'Move your phone in a figure-8 to calibrate.');
    }
    // iOS 13+ يحتاج إذنًا صريحًا
    if(typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function'){
      if(hint) hint.innerHTML = '<button id="qCompassPerm" style="padding:8px 16px;border-radius:10px;border:1px solid var(--omGoldSoft);background:rgba(212,175,55,.1);color:inherit;cursor:pointer;">' + qt('تفعيل البوصلة', 'Enable compass') + '</button>';
      var pb = document.getElementById('qCompassPerm');
      if(pb) pb.onclick = function(){
        DeviceOrientationEvent.requestPermission().then(function(st){
          if(st === 'granted') attach();
          else if(hint) hint.textContent = qt('رُفض إذن الحساس — استخدم الزاوية بالأعلى.', 'Sensor denied — use the angle above.');
        }).catch(function(){ if(hint) hint.textContent = qt('البوصلة غير مدعومة — استخدم الزاوية بالأعلى.', 'Compass unsupported — use the angle above.'); });
      };
    } else if(window.DeviceOrientationEvent){
      attach();
    } else if(hint){
      hint.textContent = qt('جهازك بلا حساس بوصلة — وجّه نحو الزاوية بالأعلى (من الشمال).', 'No compass sensor — aim at the angle above (from North).');
    }
  }
  function stopCompass(){
    if(compassHandler){
      window.removeEventListener('deviceorientationabsolute', compassHandler, true);
      window.removeEventListener('deviceorientation', compassHandler, true);
      compassHandler = null;
    }
  }

  function openQibla(){
    var el = shell();
    el.style.display = 'flex';
    setTab('times');
  }
  function closeQibla(){
    if(S.ticker){ clearInterval(S.ticker); S.ticker = null; }
    stopCompass();
    var el = document.getElementById('omranQiblaShell');
    if(el) el.style.display = 'none';
  }

  var btn = document.getElementById('btnQibla');
  if(btn) btn.onclick = openQibla;
  window.omranQibla = { open: openQibla, close: closeQibla };
})();
