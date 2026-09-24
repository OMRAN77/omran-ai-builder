/* ============ 🎮 مسار «خوارزميات الألعاب» (v-edu-algo) ============
 * طلب المالك (٢٣ سبتمبر): «أكثر شي تعليم خوارزميات الألعاب وكيف طريقتها… هل باستطاعتي التغلّب عليها».
 * ثمانية دروس جاهزة بلا أيّ نداء نموذج: شرح (ماركداون بكود وجداول ومعادلات) + لعبة حيّة على canvas
 * تلمس فيها الخوارزميّة بيدك + تحدٍّ + اختبار قصير + «اسأل المعلّم» عن الدرس.
 * المحتوى بالعربيّة (وللأرديّة) والإنجليزيّة لبقيّة اللغات؛ أزرار الواجهة بالـ14 لغة (edu-plus.js).
 * الخوارزميّات نفسها دوالّ نقيّة في window.__eduAlgo.lib ومختبَرة في tests/edu-algo.test.cjs. */
(function(){
'use strict';
function C(){ return window.__eduCore; }
function L(a, e){ var c = C(); return c ? c.eduL(a, e) : a; }
function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function isAr(){ var c = C(); var l = c ? c.appLang() : 'ar'; return l === 'ar' || l === 'ur'; }
function tx(o){ return o ? (isAr() ? o.ar : o.en) : ''; }
function lsGet(k, def){ try{ var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? def : v; }catch(e){ return def; } }
function lsSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){ __swallow(e, 'save:edu-algo'); } }

/* ================= الخوارزميّات (نقيّة) ================= */
function physicsStep(p, g, dt, ground){
  var vy = p.vy + g * dt, y = p.y + vy * dt, onGround = false;
  if(y >= ground){ y = ground; vy = 0; onGround = true; }
  return { y: y, vy: vy, onGround: onGround };
}
function aabb(a, b){
  var x = a.x < b.x + b.w && a.x + a.w > b.x;
  var y = a.y < b.y + b.h && a.y + a.h > b.y;
  return { x: x, y: y, hit: x && y };
}
/* بحث على شبكة: grid[r][c] = 1 جدار. bfs يوسّع بالترتيب، وastar يوسّع الأقلّ f = g + h (مانهاتن). */
function gridSearch(grid, start, goal, mode){
  var R = grid.length, Cn = grid[0].length, key = function(p){ return p[0] * Cn + p[1]; };
  var came = {}, g = {}, visited = [], open = [start], seen = {};
  g[key(start)] = 0; seen[key(start)] = true;
  var h = function(p){ return Math.abs(p[0] - goal[0]) + Math.abs(p[1] - goal[1]); };
  var closed = {};
  while(open.length){
    var idx = 0;
    if(mode === 'astar'){
      for(var i = 1; i < open.length; i++){
        var fi = g[key(open[i])] + h(open[i]), fb = g[key(open[idx])] + h(open[idx]);
        if(fi < fb || (fi === fb && h(open[i]) < h(open[idx]))) idx = i;
      }
    }
    var cur = open.splice(idx, 1)[0], ck = key(cur);
    if(closed[ck]) continue;
    closed[ck] = true; visited.push(cur);
    if(cur[0] === goal[0] && cur[1] === goal[1]){
      var path = [cur];
      while(came[key(path[0])] !== undefined){ var pk = came[key(path[0])]; path.unshift([Math.floor(pk / Cn), pk % Cn]); }
      return { path: path, visited: visited };
    }
    [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){
      var n = [cur[0] + d[0], cur[1] + d[1]];
      if(n[0] < 0 || n[1] < 0 || n[0] >= R || n[1] >= Cn || grid[n[0]][n[1]]) return;
      var nk = key(n), ng = g[ck] + 1;
      if(mode === 'astar'){
        if(g[nk] === undefined || ng < g[nk]){ g[nk] = ng; came[nk] = ck; open.push(n); }
      } else if(!seen[nk]){ seen[nk] = true; g[nk] = ng; came[nk] = ck; open.push(n); }
    });
  }
  return { path: null, visited: visited };
}
function fsmNext(state, dist, powered){
  if(powered) return 'flee';
  if(state === 'flee') return dist < 150 ? 'chase' : 'patrol';
  if(state === 'patrol' && dist < 150) return 'chase';
  if(state === 'chase' && dist > 220) return 'patrol';
  return state;
}
var LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
function winner(b){
  for(var i = 0; i < LINES.length; i++){ var l = LINES[i]; if(b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return b[l[0]]; }
  return b.indexOf('') < 0 ? 'draw' : null;
}
/* minimax للاعب 'O' (الكمبيوتر) ضدّ 'X': +(10−العمق) فوز، −(10−العمق) خسارة، ٠ تعادل — الأسرع فوزًا والأبطأ خسارةً. */
function minimax(b, turn, depth, counter){
  counter.n++;
  var w = winner(b);
  if(w === 'O') return { score: 10 - depth };
  if(w === 'X') return { score: depth - 10 };
  if(w === 'draw') return { score: 0 };
  var best = { score: turn === 'O' ? -Infinity : Infinity, move: -1 };
  for(var i = 0; i < 9; i++){
    if(b[i]) continue;
    b[i] = turn;
    var r = minimax(b, turn === 'O' ? 'X' : 'O', depth + 1, counter);
    b[i] = '';
    if(turn === 'O' ? r.score > best.score : r.score < best.score) best = { score: r.score, move: i };
  }
  return best;
}
function bestMove(b){ var counter = { n: 0 }; var r = minimax(b.slice(), 'O', 0, counter); return { move: r.move, score: r.score, nodes: counter.n }; }
function moveScores(b){
  var out = {};
  for(var i = 0; i < 9; i++){ if(b[i]) continue; var c = b.slice(); c[i] = 'O'; out[i] = minimax(c, 'X', 1, { n: 0 }).score; }
  return out;
}
/* مولّد أرقام شبه عشوائيّ خطّيّ (LCG): نفس البذرة ← نفس السلسلة دائمًا. */
function lcg(seed){ var s = (Math.floor(Math.abs(seed)) >>> 0) % 2147483648; return function(){ s = (Math.imul ? (Math.imul(s, 1103515245) >>> 0) : (s * 1103515245) % 4294967296); s = (s + 12345) % 2147483648; return s; }; }
function lcgSeq(seed, n, mod){ var r = lcg(seed), out = []; for(var i = 0; i < n; i++) out.push(r() % (mod || 100)); return out; }
function crackSeed(observed, maxSeed, mod){
  for(var s = 0; s <= maxSeed; s++){
    var seq = lcgSeq(s, observed.length, mod), ok = true;
    for(var i = 0; i < observed.length; i++){ if(seq[i] !== observed[i]){ ok = false; break; } }
    if(ok) return s;
  }
  return -1;
}
function caveMap(seed, w, h){
  var r = lcg(seed), m = [], x, y;
  for(y = 0; y < h; y++){ m.push([]); for(x = 0; x < w; x++) m[y].push((x === 0 || y === 0 || x === w - 1 || y === h - 1 || r() % 100 < 45) ? 1 : 0); }
  for(var it = 0; it < 4; it++){
    var n = [];
    for(y = 0; y < h; y++){ n.push([]); for(x = 0; x < w; x++){
      var walls = 0;
      for(var dy = -1; dy <= 1; dy++) for(var dx = -1; dx <= 1; dx++){ var yy = y + dy, xx = x + dx; if(yy < 0 || xx < 0 || yy >= h || xx >= w || m[yy][xx]) walls++; }
      n[y].push(walls >= 5 ? 1 : 0);
    } }
    m = n;
  }
  return m;
}
/* لعبة الأكواب: تتبّع رقم مكان الكرة فقط. swaps = [[a,b],…] أماكن تتبادل. */
function cupsTrack(pos, swaps){
  for(var i = 0; i < swaps.length; i++){ var s = swaps[i]; if(pos === s[0]) pos = s[1]; else if(pos === s[1]) pos = s[0]; }
  return pos;
}
function cupsSwaps(seed, n){
  var r = lcg(seed), out = [];
  for(var i = 0; i < n; i++){ var a = r() % 3, b = (a + 1 + (r() % 2)) % 3; out.push([a, b]); }
  return out;
}

/* ================= أدوات الرسم ================= */
var W = 640, H = 360, GOLD = '#d4af37', GOLD2 = '#f1d98a', RED = '#e0605a', GREEN = '#3fb37f', BLUE = '#6b8cff', DIM = 'rgba(255,255,255,.12)';
function makeStage(host){
  var st = document.createElement('div'); st.className = 'algoStage';
  var cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2;
  st.appendChild(cv); host.appendChild(st);
  var g = cv.getContext('2d'); g.scale(2, 2);
  function pt(e){ var r = cv.getBoundingClientRect(); var p = e.touches ? e.touches[0] : e; return { x: (p.clientX - r.left) * W / r.width, y: (p.clientY - r.top) * H / r.height }; }
  return { cv: cv, g: g, pt: pt };
}
function loop(cv, fn){
  var last = 0;
  function f(t){ if(!cv.isConnected) return; fn(t, last ? Math.min(0.1, (t - last) / 1000) : 0); last = t; requestAnimationFrame(f); }
  requestAnimationFrame(f);
}
function clear(g){ g.fillStyle = '#07070a'; g.fillRect(0, 0, W, H); }
/* اتّجاه النصّ من محتواه: الأرقام والقوائم يسار-يمين، والعربيّ يمين-يسار (وإلّا انقلب ترتيب «56, 91, 66») */
function ltr(s){ return '\u2066' + s + '\u2069'; }
function text(g, s, x, y, col, size, align){ try{ g.direction = /[\u0600-\u06FF]/.test(s) ? 'rtl' : 'ltr'; }catch(e){ __swallow(e, 'ui:edu-algo-dir'); } g.fillStyle = col || '#ddd'; g.font = (size || 13) + 'px Tahoma, Arial, sans-serif'; g.textAlign = align || 'center'; g.fillText(s, x, y); }
function slider(ctl, label, min, max, val, step, on){
  var l = document.createElement('label'); l.innerHTML = '<span>' + esc(label) + '</span>';
  var r = document.createElement('input'); r.type = 'range'; r.min = min; r.max = max; r.value = val; r.step = step || 1;
  var o = document.createElement('b'); o.textContent = val;
  r.oninput = function(){ o.textContent = r.value; on(+r.value); };
  l.appendChild(r); l.appendChild(o); ctl.appendChild(l); return r;
}
function button(ctl, label, on){ var b = document.createElement('button'); b.className = 'eduChip'; b.textContent = label; b.onclick = on; ctl.appendChild(b); return b; }
function check(ctl, label, val, on){
  var l = document.createElement('label'); var c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!val;
  c.onchange = function(){ on(c.checked); }; l.appendChild(c); l.appendChild(document.createTextNode(label)); ctl.appendChild(l); return c;
}

/* ================= الألعاب الحيّة ================= */
var DEMOS = {
  loop: function(host, ctl, info){
    var s = makeStage(host), fps = 60, useDt = false, frames = 0, acc = 0, last = 0, b = { x: 60, y: 90, vx: 240, vy: 170 }, trail = [];
    slider(ctl, L('سرعة الجهاز (إطار/ث)', 'Device speed (FPS)'), 5, 60, 60, 1, function(v){ fps = v; });
    check(ctl, L('حركة مستقلّة عن سرعة الجهاز (dt)', 'Frame-rate independent (dt)'), false, function(v){ useDt = v; });
    loop(s.cv, function(t){
      if(!last) last = t;
      if(t - last < 1000 / fps - 1){ return; }
      var dt = (t - last) / 1000; last = t; frames++;
      var k = useDt ? dt : 1 / 60;
      b.x += b.vx * k; b.y += b.vy * k;
      if(b.x < 14 || b.x > W - 14){ b.vx *= -1; b.x = Math.max(14, Math.min(W - 14, b.x)); }
      if(b.y < 14 || b.y > H - 14){ b.vy *= -1; b.y = Math.max(14, Math.min(H - 14, b.y)); }
      trail.push([b.x, b.y]); if(trail.length > 24) trail.shift();
      clear(s.g);
      trail.forEach(function(p, i){ s.g.fillStyle = 'rgba(212,175,55,' + (i / trail.length * 0.35) + ')'; s.g.beginPath(); s.g.arc(p[0], p[1], 5, 0, 7); s.g.fill(); });
      s.g.fillStyle = GOLD; s.g.beginPath(); s.g.arc(b.x, b.y, 14, 0, 7); s.g.fill();
      acc++;
      info.textContent = 'frame #' + frames + '   FPS ≈ ' + Math.round(1 / Math.max(dt, 0.001)) + '   dt = ' + dt.toFixed(3) + 's\n'
        + '1) input  2) update: x += vx × ' + (useDt ? 'dt' : '(1/60)') + '  3) draw\n'
        + 'x = ' + b.x.toFixed(0) + '  y = ' + b.y.toFixed(0);
    });
  },
  physics: function(host, ctl, info){
    var s = makeStage(host), g = 1400, jump = 620, ground = H - 50, p = { x: 40, y: ground, vy: 0, onGround: true }, passed = 0, hitFlash = 0;
    var pillar = { x: W / 2 - 15, y: ground - 90 + 26, w: 30, h: 90 - 26 + 24 };
    slider(ctl, L('الجاذبيّة', 'Gravity'), 300, 2600, g, 50, function(v){ g = v; });
    slider(ctl, L('قوّة القفزة', 'Jump power'), 200, 1000, jump, 10, function(v){ jump = v; });
    function doJump(){ if(p.onGround){ p.vy = -jump; p.onGround = false; } }
    button(ctl, '⬆ ' + L('اقفز', 'Jump'), doJump);
    s.cv.addEventListener('pointerdown', doJump);
    loop(s.cv, function(t, dt){
      p.x += 150 * dt; if(p.x > W + 20){ p.x = -20; }
      var r = physicsStep(p, g, dt, ground); p.y = r.y; p.vy = r.vy; p.onGround = r.onGround;
      var box = { x: p.x - 13, y: p.y - 26, w: 26, h: 26 };
      if(aabb(box, pillar).hit){ hitFlash = 0.4; p.x = -20; }
      if(p.x > pillar.x + pillar.w && p.x - 150 * dt <= pillar.x + pillar.w) passed++;
      hitFlash = Math.max(0, hitFlash - dt);
      clear(s.g);
      s.g.fillStyle = DIM; s.g.fillRect(0, ground, W, 2);
      s.g.fillStyle = hitFlash ? RED : '#555'; s.g.fillRect(pillar.x, pillar.y, pillar.w, pillar.h);
      /* مسار متوقَّع لو قفزت الآن: القطع المكافئ */
      s.g.fillStyle = 'rgba(241,217,138,.35)';
      for(var i = 1; i < 30; i++){ var tt = i * 0.04, yy = ground + (-jump) * tt + 0.5 * g * tt * tt; if(yy > ground) break; s.g.fillRect(p.x + 150 * tt - 1, yy - 13, 3, 3); }
      s.g.fillStyle = GOLD; s.g.fillRect(box.x, box.y, box.w, box.h);
      s.g.strokeStyle = BLUE; s.g.lineWidth = 2; s.g.beginPath(); s.g.moveTo(p.x, p.y - 13); s.g.lineTo(p.x, p.y - 13 + p.vy * 0.08); s.g.stroke();
      text(s.g, '✓ ' + passed, W - 30, 24, GREEN, 15);
      info.textContent = 'vy += g × dt   →   vy = ' + p.vy.toFixed(0) + '\ny  += vy × dt  →   y = ' + (ground - p.y).toFixed(0) + ' px above ground\ng = ' + g + '   jump = ' + jump;
    });
  },
  collide: function(host, ctl, info){
    var s = makeStage(host), A = { x: 250, y: 120, w: 140, h: 100 }, B = { x: 80, y: 60, w: 110, h: 80 }, drag = null;
    function down(e){ var q = s.pt(e); if(q.x >= B.x && q.x <= B.x + B.w && q.y >= B.y && q.y <= B.y + B.h){ drag = { dx: q.x - B.x, dy: q.y - B.y }; } else { B.x = q.x - B.w / 2; B.y = q.y - B.h / 2; drag = { dx: B.w / 2, dy: B.h / 2 }; } }
    function move(e){ if(!drag) return; var q = s.pt(e); B.x = q.x - drag.dx; B.y = q.y - drag.dy; e.preventDefault(); }
    s.cv.addEventListener('pointerdown', down); s.cv.addEventListener('pointermove', move);
    window.addEventListener('pointerup', function(){ drag = null; });
    loop(s.cv, function(){
      var r = aabb(A, B);
      clear(s.g);
      s.g.fillStyle = r.x ? 'rgba(63,179,127,.5)' : DIM; s.g.fillRect(Math.min(A.x, B.x), H - 14, 1, 1);
      s.g.fillStyle = 'rgba(255,255,255,.08)'; s.g.fillRect(A.x, H - 16, A.w, 5); s.g.fillRect(B.x, H - 9, B.w, 5); s.g.fillRect(4, A.y, 5, A.h); s.g.fillRect(11, B.y, 5, B.h);
      if(r.x){ s.g.fillStyle = GREEN; s.g.fillRect(Math.max(A.x, B.x), H - 16, Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x), 12); }
      if(r.y){ s.g.fillStyle = GREEN; s.g.fillRect(4, Math.max(A.y, B.y), 12, Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y)); }
      s.g.fillStyle = r.hit ? 'rgba(224,96,90,.55)' : 'rgba(107,140,255,.35)'; s.g.fillRect(A.x, A.y, A.w, A.h);
      s.g.fillStyle = r.hit ? 'rgba(224,96,90,.8)' : 'rgba(212,175,55,.7)'; s.g.fillRect(B.x, B.y, B.w, B.h);
      text(s.g, 'A', A.x + A.w / 2, A.y + A.h / 2 + 5, '#fff', 16); text(s.g, 'B', B.x + B.w / 2, B.y + B.h / 2 + 5, '#000', 16);
      text(s.g, r.hit ? L('💥 تصادم!', '💥 Collision!') : L('لا تصادم', 'No collision'), W / 2, 26, r.hit ? RED : GOLD2, 16);
      function tf(v){ return v ? 'true ✓' : 'false ✗'; }
      info.textContent = 'A.x < B.x + B.w   ' + tf(A.x < B.x + B.w) + '\nA.x + A.w > B.x   ' + tf(A.x + A.w > B.x) + '\nA.y < B.y + B.h   ' + tf(A.y < B.y + B.h) + '\nA.y + A.h > B.y   ' + tf(A.y + A.h > B.y) + '\n→ hit = ' + r.hit;
    });
  },
  path: function(host, ctl, info){
    var s = makeStage(host), R = 9, Cn = 16, cs = 40, grid = [], start = [4, 1], goal = [4, 14], anim = null, painting = null;
    function reset(){ grid = []; for(var r = 0; r < R; r++){ grid.push([]); for(var c = 0; c < Cn; c++) grid[r].push(0); } for(r = 1; r < 8; r++) grid[r][7] = 1; grid[1][7] = 0; }
    reset();
    function cell(e){ var q = s.pt(e); return [Math.floor(q.y / cs), Math.floor(q.x / cs)]; }
    s.cv.addEventListener('pointerdown', function(e){ var p = cell(e); if(p[0] < 0 || p[0] >= R || p[1] < 0 || p[1] >= Cn) return; if((p[0] === start[0] && p[1] === start[1]) || (p[0] === goal[0] && p[1] === goal[1])) return; painting = grid[p[0]][p[1]] ? 0 : 1; grid[p[0]][p[1]] = painting; anim = null; });
    s.cv.addEventListener('pointermove', function(e){ if(painting === null) return; var p = cell(e); if(p[0] < 0 || p[0] >= R || p[1] < 0 || p[1] >= Cn) return; if((p[0] === start[0] && p[1] === start[1]) || (p[0] === goal[0] && p[1] === goal[1])) return; grid[p[0]][p[1]] = painting; e.preventDefault(); });
    window.addEventListener('pointerup', function(){ painting = null; });
    function run(mode){ var r = gridSearch(grid, start, goal, mode); anim = { mode: mode, res: r, t: 0 }; }
    button(ctl, '▶ BFS', function(){ run('bfs'); });
    button(ctl, '▶ A*', function(){ run('astar'); });
    button(ctl, '🎲 ' + L('جدران عشوائيّة', 'Random walls'), function(){ reset(); for(var r = 0; r < R; r++) for(var c = 0; c < Cn; c++) if(Math.random() < 0.28) grid[r][c] = 1; grid[start[0]][start[1]] = 0; grid[goal[0]][goal[1]] = 0; anim = null; });
    button(ctl, '🧹 ' + L('مسح', 'Clear'), function(){ reset(); for(var r = 1; r < 8; r++) grid[r][7] = 0; anim = null; });
    loop(s.cv, function(t, dt){
      clear(s.g);
      var shown = 0;
      if(anim){ anim.t += dt; shown = Math.min(anim.res.visited.length, Math.floor(anim.t * 45)); }
      for(var r = 0; r < R; r++) for(var c = 0; c < Cn; c++){
        s.g.fillStyle = grid[r][c] ? '#3a3a44' : 'rgba(255,255,255,.03)';
        s.g.fillRect(c * cs + 1, r * cs + 1, cs - 2, cs - 2);
      }
      if(anim){
        for(var i = 0; i < shown; i++){ var v = anim.res.visited[i]; s.g.fillStyle = anim.mode === 'astar' ? 'rgba(107,140,255,.35)' : 'rgba(63,179,127,.3)'; s.g.fillRect(v[1] * cs + 1, v[0] * cs + 1, cs - 2, cs - 2); }
        if(shown >= anim.res.visited.length && anim.res.path){
          s.g.strokeStyle = GOLD; s.g.lineWidth = 5; s.g.beginPath();
          anim.res.path.forEach(function(p, k){ var x = p[1] * cs + cs / 2, y = p[0] * cs + cs / 2; if(k) s.g.lineTo(x, y); else s.g.moveTo(x, y); }); s.g.stroke();
        }
      }
      s.g.fillStyle = GREEN; s.g.beginPath(); s.g.arc(start[1] * cs + cs / 2, start[0] * cs + cs / 2, 13, 0, 7); s.g.fill();
      s.g.fillStyle = RED; s.g.beginPath(); s.g.arc(goal[1] * cs + cs / 2, goal[0] * cs + cs / 2, 13, 0, 7); s.g.fill();
      info.textContent = anim ? (anim.mode === 'astar' ? 'A*' : 'BFS') + '   visited = ' + shown + ' / ' + anim.res.visited.length + '   path = ' + (anim.res.path ? anim.res.path.length - 1 + ' steps' : 'no path!')
        : L('ارسم جدرانًا بإصبعك ثمّ شغّل BFS أو A*', 'Draw walls, then run BFS or A*');
    });
  },
  fsm: function(host, ctl, info){
    var s = makeStage(host), pl = { x: 520, y: 260 }, en = { x: 100, y: 100 }, state = 'patrol', wp = [[90, 90], [550, 90], [550, 280], [90, 280]], wi = 0, power = 0;
    s.cv.addEventListener('pointermove', function(e){ var q = s.pt(e); pl.x = q.x; pl.y = q.y; });
    s.cv.addEventListener('pointerdown', function(e){ var q = s.pt(e); pl.x = q.x; pl.y = q.y; });
    button(ctl, '⚡ ' + L('قوّة خارقة ٥ ثوانٍ', 'Power-up for 5s'), function(){ power = 5; });
    var NAMES = { patrol: L('دوريّة', 'Patrol'), chase: L('مطاردة', 'Chase'), flee: L('هروب', 'Flee') };
    loop(s.cv, function(t, dt){
      power = Math.max(0, power - dt);
      var dx = pl.x - en.x, dy = pl.y - en.y, dist = Math.sqrt(dx * dx + dy * dy);
      state = fsmNext(state, dist, power > 0);
      var tx2, ty2, sp = 110;
      if(state === 'patrol'){ tx2 = wp[wi][0]; ty2 = wp[wi][1]; if(Math.abs(tx2 - en.x) + Math.abs(ty2 - en.y) < 8) wi = (wi + 1) % wp.length; }
      else if(state === 'chase'){ tx2 = pl.x; ty2 = pl.y; sp = 150; }
      else { tx2 = en.x - dx; ty2 = en.y - dy; sp = 170; }
      var mx = tx2 - en.x, my = ty2 - en.y, ml = Math.sqrt(mx * mx + my * my) || 1;
      en.x = Math.max(12, Math.min(W - 12, en.x + mx / ml * sp * dt)); en.y = Math.max(12, Math.min(H - 12, en.y + my / ml * sp * dt));
      clear(s.g);
      s.g.strokeStyle = 'rgba(255,255,255,.08)'; s.g.setLineDash([5, 5]); s.g.beginPath(); wp.forEach(function(p, i){ if(i) s.g.lineTo(p[0], p[1]); else s.g.moveTo(p[0], p[1]); }); s.g.closePath(); s.g.stroke(); s.g.setLineDash([]);
      s.g.strokeStyle = 'rgba(224,96,90,.25)'; s.g.beginPath(); s.g.arc(en.x, en.y, 150, 0, 7); s.g.stroke();
      s.g.strokeStyle = 'rgba(212,175,55,.15)'; s.g.beginPath(); s.g.arc(en.x, en.y, 220, 0, 7); s.g.stroke();
      s.g.fillStyle = power ? BLUE : GREEN; s.g.beginPath(); s.g.arc(pl.x, pl.y, 11, 0, 7); s.g.fill();
      s.g.fillStyle = state === 'chase' ? RED : state === 'flee' ? '#9aa' : GOLD; s.g.fillRect(en.x - 13, en.y - 13, 26, 26);
      ['patrol', 'chase', 'flee'].forEach(function(k, i){ var x = 70 + i * 110, y = 22; s.g.fillStyle = k === state ? GOLD : 'rgba(255,255,255,.08)'; s.g.fillRect(x - 48, y - 14, 96, 24); text(s.g, NAMES[k], x, y + 3, k === state ? '#000' : '#bbb', 12); });
      info.textContent = 'state = ' + state + '   distance = ' + dist.toFixed(0) + (power ? '   ⚡ ' + power.toFixed(1) + 's' : '') + '\npatrol →(d<150)→ chase →(d>220)→ patrol ;  ⚡ → flee';
    });
  },
  minimax: function(host, ctl, info){
    var s = makeStage(host), b = ['', '', '', '', '', '', '', '', ''], showThink = true, scores = {}, nodes = 0, over = null, youStart = true, tally = { w: 0, d: 0, l: 0 };
    var X0 = 170, Y0 = 30, CS = 100;
    function cpu(){
      if(winner(b)) return;
      scores = moveScores(b);
      var r = bestMove(b); nodes = r.nodes; b[r.move] = 'O';
      end();
    }
    function end(){ var w = winner(b); if(w && !over){ over = w; if(w === 'X') tally.w++; else if(w === 'O') tally.l++; else tally.d++; } }
    function newGame(){ b = ['', '', '', '', '', '', '', '', '']; over = null; scores = {}; nodes = 0; if(!youStart) setTimeout(cpu, 250); }
    check(ctl, L('أظهر تفكير الكمبيوتر', "Show the computer's thinking"), true, function(v){ showThink = v; });
    button(ctl, '🔄 ' + L('لعبة جديدة', 'New game'), newGame);
    button(ctl, '↔ ' + L('بدّل من يبدأ', 'Switch who starts'), function(){ youStart = !youStart; newGame(); });
    s.cv.addEventListener('pointerdown', function(e){
      if(over) { newGame(); return; }
      var q = s.pt(e), c = Math.floor((q.x - X0) / CS), r = Math.floor((q.y - Y0) / CS);
      if(c < 0 || c > 2 || r < 0 || r > 2) return;
      var i = r * 3 + c; if(b[i]) return;
      b[i] = 'X'; end(); if(!over) setTimeout(cpu, 220);
    });
    loop(s.cv, function(){
      clear(s.g);
      for(var i = 0; i < 9; i++){
        var x = X0 + (i % 3) * CS, y = Y0 + Math.floor(i / 3) * CS;
        s.g.fillStyle = 'rgba(255,255,255,.04)'; s.g.fillRect(x + 3, y + 3, CS - 6, CS - 6);
        if(b[i]) text(s.g, b[i], x + CS / 2, y + CS / 2 + 20, b[i] === 'X' ? GOLD : BLUE, 56);
        else if(showThink && scores[i] !== undefined){ var sc = scores[i]; text(s.g, sc > 0 ? L('فوز', 'win') : sc < 0 ? L('خسارة', 'lose') : L('تعادل', 'draw'), x + CS / 2, y + CS / 2 + 5, sc > 0 ? GREEN : sc < 0 ? RED : '#999', 13); }
      }
      text(s.g, L('أنت', 'You') + ' X', 70, 60, GOLD, 16); text(s.g, L('الكمبيوتر', 'Computer') + ' O', 70, 85, BLUE, 14);
      text(s.g, '✓' + tally.w + '  =' + tally.d + '  ✗' + tally.l, 70, 120, '#ccc', 14);
      if(over) text(s.g, over === 'draw' ? L('تعادل — كما تتوقّع الرياضيّات', 'Draw — exactly as math predicts') : over === 'X' ? L('فزت!؟ هذا لا يُفترض أن يحدث', 'You won?! That should be impossible') : L('فاز الكمبيوتر — اضغط للعب مجدّدًا', 'Computer wins — tap to replay'), W / 2 + 60, H - 10, GOLD2, 14);
      info.textContent = 'minimax: ' + (nodes ? nodes.toLocaleString('en') + ' positions evaluated for the last move' : 'waiting for your move') + '\nscore = +(10 − depth) win · 0 draw · −(10 − depth) loss';
    });
    if(!youStart) cpu();
  },
  random: function(host, ctl, info){
    var s = makeStage(host), seed = 42, map = caveMap(seed, 48, 27), seq = lcgSeq(seed, 10, 100), cracked = null;
    var inp = document.createElement('input'); inp.type = 'number'; inp.value = seed; inp.className = 'eduField'; inp.style.cssText = 'width:110px;margin:0;';
    var lab = document.createElement('label'); lab.textContent = L('البذرة', 'Seed') + ' '; lab.appendChild(inp); ctl.appendChild(lab);
    function gen(){ seed = Math.abs(parseInt(inp.value, 10) || 0); map = caveMap(seed, 48, 27); seq = lcgSeq(seed, 10, 100); cracked = null; }
    button(ctl, '🗺 ' + L('ولّد', 'Generate'), gen);
    button(ctl, '🎲 ' + L('بذرة عشوائيّة', 'Random seed'), function(){ inp.value = Date.now() % 100000; gen(); });
    button(ctl, '🕵️ ' + L('اكسر البذرة', 'Crack the seed'), function(){
      var secret = 1 + Math.floor(Math.random() * 999), obs = lcgSeq(secret, 3, 100);
      var found = crackSeed(obs, 1000, 100);
      cracked = { obs: obs, found: found, next: lcgSeq(found, 5, 100).slice(3), real: lcgSeq(secret, 5, 100).slice(3) };
    });
    loop(s.cv, function(){
      clear(s.g);
      var cw = 10, ch = 10, ox = 10, oy = 60;
      for(var y = 0; y < 27; y++) for(var x = 0; x < 48; x++){ s.g.fillStyle = map[y][x] ? '#2b2620' : 'rgba(212,175,55,.22)'; s.g.fillRect(ox + x * cw * 0.72, oy + y * ch * 0.72 * 1.4, cw * 0.72 - 0.5, ch * 1.0 - 0.5); }
      text(s.g, 'seed = ' + seed, 190, 40, GOLD2, 15);
      text(s.g, L('أوّل ١٠ أرقام:', 'First 10 numbers:'), 530, 60, '#bbb', 13);
      seq.forEach(function(n, i){ text(s.g, String(n), 470 + (i % 5) * 30, 90 + Math.floor(i / 5) * 26, GOLD, 16); });
      if(cracked){
        text(s.g, L('رأيتُ:', 'I saw:') + ' ' + ltr(cracked.obs.join(', ')), 530, 170, '#ccc', 13);
        text(s.g, L('البذرة:', 'Seed:') + ' ' + ltr(cracked.found), 530, 196, GREEN, 15);
        text(s.g, L('توقّعي:', 'My guess:') + ' ' + ltr(cracked.next.join(', ')), 530, 222, GOLD, 14);
        text(s.g, L('الحقيقة:', 'Actual:') + ' ' + ltr(cracked.real.join(', ')), 530, 248, cracked.next.join() === cracked.real.join() ? GREEN : RED, 14);
      }
      info.textContent = 'next = (state × 1103515245 + 12345) mod 2^31\nsame seed → same numbers → same map';
    });
  },
  cups: function(host, ctl, info){
    var s = makeStage(host), nSwaps = 8, speed = 1, track = false, phase = 'idle', swaps = [], k = 0, t = 0, ball = 1, pos = [0, 1, 2], guess = -1, score = { w: 0, n: 0 };
    var CX = [150, 320, 490];
    slider(ctl, L('عدد التبديلات', 'Swaps'), 3, 25, nSwaps, 1, function(v){ nSwaps = v; });
    slider(ctl, L('السرعة', 'Speed'), 1, 5, speed, 1, function(v){ speed = v; });
    check(ctl, L('🧠 وضع التتبّع (رقم مكان الكرة)', '🧠 Tracking mode (ball position number)'), false, function(v){ track = v; });
    button(ctl, '▶ ' + L('ابدأ جولة', 'Start a round'), function(){
      ball = Math.floor(Math.random() * 3); swaps = cupsSwaps(Date.now() % 100000, nSwaps); k = 0; t = 0; guess = -1; phase = 'show'; pos = [0, 1, 2];
    });
    s.cv.addEventListener('pointerdown', function(e){
      if(phase !== 'guess') return;
      var q = s.pt(e), best = -1, bd = 1e9;
      for(var i = 0; i < 3; i++){ var d = Math.abs(q.x - CX[i]); if(d < bd){ bd = d; best = i; } }
      guess = best; phase = 'reveal'; score.n++; if(best === cupsTrack(ball, swaps)) score.w++;
    });
    var cur = ball;
    loop(s.cv, function(tm, dt){
      t += dt;
      if(phase === 'show' && t > 1.2){ phase = 'shuffle'; t = 0; cur = ball; }
      var dur = 0.6 / speed, sw = swaps[k], prog = 0;
      if(phase === 'shuffle'){
        prog = Math.min(1, t / dur);
        if(t >= dur){ cur = cupsTrack(cur, [sw]); k++; t = 0; if(k >= swaps.length) phase = 'guess'; }
      }
      clear(s.g);
      for(var p = 0; p < 3; p++){
        var x = CX[p], y = 200;
        if(phase === 'shuffle' && sw && (p === sw[0] || p === sw[1])){
          var other = p === sw[0] ? sw[1] : sw[0], ease = 0.5 - Math.cos(prog * Math.PI) / 2;
          x = CX[p] + (CX[other] - CX[p]) * ease; y = 200 + (p === sw[0] ? -1 : 1) * Math.sin(prog * Math.PI) * 45;
        }
        var lifted = phase === 'show' || (phase === 'reveal' && (p === cupsTrack(ball, swaps) || p === guess));
        var hasBall = (phase === 'show' && p === ball) || (phase === 'reveal' && p === cupsTrack(ball, swaps));
        if(hasBall){ s.g.fillStyle = RED; s.g.beginPath(); s.g.arc(x, 250, 16, 0, 7); s.g.fill(); }
        var cy = lifted ? y - 70 : y;
        s.g.fillStyle = phase === 'reveal' && p === guess ? (guess === cupsTrack(ball, swaps) ? GREEN : '#8a3a36') : GOLD;
        s.g.beginPath(); s.g.moveTo(x - 50, cy + 66); s.g.lineTo(x - 36, cy - 20); s.g.lineTo(x + 36, cy - 20); s.g.lineTo(x + 50, cy + 66); s.g.closePath(); s.g.fill();
        text(s.g, String(p + 1), CX[p], 336, '#888', 14);
      }
      if(track && (phase === 'shuffle' || phase === 'guess')) text(s.g, '🧠 ' + L('الكرة في المكان', 'Ball at position') + ' ' + ltr(cur + 1), W / 2, 34, GOLD2, 17);
      var msg = phase === 'guess' ? L('وين الكرة؟ اضغط على كوب', 'Where is the ball? Tap a cup') : phase === 'reveal' ? (guess === cupsTrack(ball, swaps) ? L('✓ صح!', '✓ Correct!') : L('✗ غلط', '✗ Wrong')) : phase === 'idle' ? L('اضغط «ابدأ جولة»', 'Press «Start a round»') : '';
      text(s.g, msg, W / 2, track && phase !== 'reveal' && phase !== 'idle' ? 62 : 40, '#ddd', 16);
      text(s.g, score.w + '/' + score.n, W - 40, 24, GREEN, 15);
      info.textContent = 'swap ' + Math.min(k + 1, swaps.length) + '/' + swaps.length + (sw ? '   [' + (sw[0] + 1) + ' ↔ ' + (sw[1] + 1) + ']' : '') + '\nif pos == a: pos = b   elif pos == b: pos = a   else: stay';
    });
  }
};

/* ================= المحتوى ================= */
function q(ar, en, oar, oen, c, xar, xen){ return { q: { ar: ar, en: en }, o: { ar: oar, en: oen }, c: c, x: { ar: xar, en: xen } }; }
var LESSONS = [
{ id: 'loop', icon: '🔁', t: { ar: 'حلقة اللعبة', en: 'The game loop' }, sub: { ar: 'قلب كلّ لعبة: ٦٠ مرّة في الثانية', en: 'The heart of every game: 60 times a second' },
  body: { ar: '## الفكرة\nكلّ لعبة — من «الثعبان» إلى «فورتنايت» — هي **حلقة لا تتوقّف** تتكرّر عشرات المرّات في الثانية. كلّ دورة اسمها **إطار (frame)**:\n\n1. **اقرأ المدخلات:** ماذا ضغط اللاعب؟\n2. **حدّث العالم:** حرّك كلّ شيء، افحص التصادمات، طبّق القواعد.\n3. **ارسم:** امسح الشاشة وارسم كلّ شيء في مكانه الجديد.\n\n```js\nfunction frame(now) {\n  const dt = (now - last) / 1000; // الزمن منذ الإطار السابق بالثواني\n  last = now;\n  readInput();\n  update(dt);\n  draw();\n  requestAnimationFrame(frame);\n}\n```\n\n## مشكلة سرعة الجهاز\nلو حرّكت الكرة **٤ بكسل كلّ إطار**، فعلى جهاز يرسم ٦٠ إطارًا تتحرّك ٢٤٠ بكسل/ث، وعلى جهاز بطيء يرسم ٢٠ إطارًا تتحرّك ٨٠ فقط — اللعبة أبطأ بثلاث مرّات!\n\nالحلّ: اضرب السرعة في **dt** (الزمن المنقضي):\n\n$$x_{new} = x + v \\times dt$$\n\n| الطريقة | ٦٠ إطار/ث | ٢٠ إطار/ث |\n|---|---|---|\n| `x += 4` لكلّ إطار | ٢٤٠ بكسل/ث | ٨٠ بكسل/ث ❌ |\n| `x += 240 * dt` | ٢٤٠ بكسل/ث | ٢٤٠ بكسل/ث ✅ |\n\n> **هل تقدر تغلبها؟** في ألعاب قديمة بلا dt، إبطاء الجهاز كان يبطئ الأعداء فعلًا — وهذا «غشّ» استخدمه لاعبون حقيقيّون.',
    en: '## The idea\nEvery game — from Snake to Fortnite — is a **never-ending loop** that runs dozens of times per second. Each pass is a **frame**:\n\n1. **Read input:** what did the player press?\n2. **Update the world:** move everything, check collisions, apply rules.\n3. **Draw:** clear the screen and draw everything in its new place.\n\n```js\nfunction frame(now) {\n  const dt = (now - last) / 1000; // seconds since the last frame\n  last = now;\n  readInput();\n  update(dt);\n  draw();\n  requestAnimationFrame(frame);\n}\n```\n\n## The device-speed problem\nIf you move the ball **4 pixels per frame**, a 60 FPS device moves it 240 px/s but a slow 20 FPS device only 80 — the game runs 3× slower!\n\nThe fix: multiply speed by **dt** (elapsed time):\n\n$$x_{new} = x + v \\times dt$$\n\n| Method | 60 FPS | 20 FPS |\n|---|---|---|\n| `x += 4` per frame | 240 px/s | 80 px/s ❌ |\n| `x += 240 * dt` | 240 px/s | 240 px/s ✅ |\n\n> **Can you beat it?** In old games without dt, slowing the device really slowed the enemies — a trick real players used.' },
  task: { ar: '🎯 التحدّي: خفّض «سرعة الجهاز» إلى ١٠ ولاحظ أنّ الكرة تبطؤ. ثمّ فعّل «dt» — ترجع لسرعتها الحقيقيّة رغم قلّة الإطارات (تقفز خطوات أكبر).', en: '🎯 Challenge: drop device speed to 10 and watch the ball slow down. Then enable dt — it returns to its real speed despite fewer frames (it just takes bigger steps).' },
  quiz: [
    q('ما ترتيب خطوات الإطار الواحد؟', 'What is the order of steps in one frame?', ['ارسم ← اقرأ ← حدّث', 'اقرأ المدخلات ← حدّث ← ارسم', 'حدّث ← ارسم ← انتظر', 'اقرأ ← ارسم ← حدّث'], ['Draw → read → update', 'Read input → update → draw', 'Update → draw → wait', 'Read → draw → update'], 1, 'نقرأ ما فعله اللاعب، ثمّ نغيّر العالم بناءً عليه، ثمّ نرسم النتيجة.', 'We read what the player did, change the world accordingly, then draw the result.'),
    q('لماذا نضرب السرعة في dt؟', 'Why do we multiply speed by dt?', ['لتصير اللعبة أسرع', 'لتتحرّك الأشياء بنفس السرعة الحقيقيّة على كلّ الأجهزة', 'لتقليل استهلاك البطارية', 'لأنّ الرسم يحتاجه'], ['To make the game faster', 'So things move at the same real speed on every device', 'To save battery', 'Because drawing needs it'], 1, 'dt هو الزمن المنقضي؛ الجهاز البطيء يعطي dt أكبر فتكبر الخطوة وتبقى السرعة ثابتة.', 'dt is elapsed time; a slow device has larger dt, so each step is bigger and real speed stays constant.'),
    q('جهاز يرسم ٣٠ إطارًا/ث. كم تقريبًا قيمة dt؟', 'A device draws 30 FPS. Roughly what is dt?', ['٠٫٣ ثانية', '٠٫٠٣٣ ثانية', '٣٠ ثانية', '١ ثانية'], ['0.3 s', '0.033 s', '30 s', '1 s'], 1, 'dt = ١ ÷ ٣٠ ≈ ٠٫٠٣٣ ثانية.', 'dt = 1 ÷ 30 ≈ 0.033 s.')
  ] },
{ id: 'physics', icon: '🪂', t: { ar: 'فيزياء الألعاب: السرعة والجاذبيّة', en: 'Game physics: velocity and gravity' }, sub: { ar: 'كيف يقفز ماريو؟ سطران من الكود', en: 'How does Mario jump? Two lines of code' },
  body: { ar: '## سطران يصنعان القفزة\nكلّ شيء يتحرّك له **موضع** و**سرعة**. في كلّ إطار:\n\n```js\nvy += g * dt;   // الجاذبيّة تزيد السرعة للأسفل\ny  += vy * dt;  // السرعة تغيّر الموضع\n```\n\nعند القفز نعطي سرعة سالبة (للأعلى) مرّة واحدة: `vy = -jump`. الجاذبيّة تأكلها تدريجيًّا حتّى تنقلب للأسفل — فيطلع **قطع مكافئ** تلقائيًّا:\n\n$$y(t) = y_0 - v_0 t + \\frac{1}{2} g t^2$$\n\n## أقصى ارتفاع\nيتوقّف الصعود عندما تصير السرعة صفرًا:\n\n$$h_{max} = \\frac{v_0^2}{2g}$$\n\nيعني: **ضاعف قوّة القفزة ← يتضاعف الارتفاع ٤ مرّات.** وضاعف الجاذبيّة ← ينقص الارتفاع للنصف.\n\n| تغيّر | الأثر |\n|---|---|\n| جاذبيّة أكبر | قفزة أقصر وأسرع — إحساس «ثقيل» |\n| جاذبيّة أصغر | قفزة طويلة معلّقة — إحساس «القمر» |\n\n> **هل تقدر تغلبها؟** لأنّ المسار محسوب بمعادلة، لاعبو السبيدرن يعرفون **بالضبط** أين تهبط كلّ قفزة — ويستغلّون ذلك لعبور فجوات «مستحيلة».',
    en: '## Two lines make a jump\nEvery moving thing has a **position** and a **velocity**. Each frame:\n\n```js\nvy += g * dt;   // gravity increases downward speed\ny  += vy * dt;  // velocity changes position\n```\n\nTo jump we set an upward (negative) velocity once: `vy = -jump`. Gravity eats it gradually until it flips downward — a **parabola** appears automatically:\n\n$$y(t) = y_0 - v_0 t + \\frac{1}{2} g t^2$$\n\n## Maximum height\nRising stops when velocity hits zero:\n\n$$h_{max} = \\frac{v_0^2}{2g}$$\n\nSo: **double the jump power → 4× the height.** Double gravity → half the height.\n\n| Change | Effect |\n|---|---|\n| Higher gravity | Short, snappy jump — feels heavy |\n| Lower gravity | Long floaty jump — feels like the Moon |\n\n> **Can you beat it?** Because the path is an equation, speedrunners know **exactly** where every jump lands — and exploit it to clear “impossible” gaps.' },
  task: { ar: '🎯 التحدّي: اضغط «اقفز» (أو على الشاشة) لتعبر فوق العمود. ثمّ ارفع الجاذبيّة إلى ٢٥٠٠ — هل تحتاج قوّة قفزة أكبر؟ النقاط الذهبيّة تُظهر المسار المتوقّع قبل أن تقفز.', en: '🎯 Challenge: press Jump (or tap the stage) to clear the pillar. Then raise gravity to 2500 — do you need more jump power? The gold dots show the predicted path before you jump.' },
  quiz: [
    q('ما الذي تغيّره الجاذبيّة مباشرةً في كلّ إطار؟', 'What does gravity change directly each frame?', ['الموضع', 'السرعة', 'لون اللاعب', 'عدد الإطارات'], ['Position', 'Velocity', 'Player color', 'Frame count'], 1, 'vy += g·dt — الجاذبيّة تغيّر السرعة، والسرعة تغيّر الموضع.', 'vy += g·dt — gravity changes velocity; velocity changes position.'),
    q('إذا ضاعفت قوّة القفزة، يصير الارتفاع الأقصى…', 'If you double jump power, max height becomes…', ['مضاعفًا', '٤ أضعاف', 'نصفه', 'كما هو'], ['Doubled', '4×', 'Half', 'The same'], 1, 'h = v²/2g، والسرعة مربّعة.', 'h = v²/2g, and velocity is squared.'),
    q('ما شكل مسار القفزة؟', 'What shape is a jump path?', ['خطّ مستقيم', 'دائرة', 'قطع مكافئ', 'متعرّج عشوائيّ'], ['Straight line', 'Circle', 'Parabola', 'Random zigzag'], 2, 'تسارع ثابت (الجاذبيّة) يعطي قطعًا مكافئًا دائمًا.', 'Constant acceleration (gravity) always gives a parabola.')
  ] },
{ id: 'collide', icon: '💥', t: { ar: 'كشف التصادم', en: 'Collision detection' }, sub: { ar: 'متى تصيب الرصاصة؟ أربع مقارنات فقط', en: 'When does a bullet hit? Just four comparisons' },
  body: { ar: '## المستطيلات المحيطة (AABB)\nالألعاب لا تفحص كلّ بكسل — هذا بطيء جدًّا. بدلًا منه تضع حول كلّ شيء **مستطيلًا غير مائل** وتسأل: هل يتداخل المستطيلان؟\n\nيتداخلان **فقط إذا** تداخلا على المحور الأفقيّ **و** على المحور العموديّ معًا:\n\n```js\nfunction hit(a, b) {\n  return a.x < b.x + b.w &&   // A يبدأ قبل نهاية B\n         a.x + a.w > b.x &&   // A ينتهي بعد بداية B\n         a.y < b.y + b.h &&\n         a.y + a.h > b.y;\n}\n```\n\n## لماذا ينجح؟\nفكّر في ظلّ المستطيلين على الأرض (محور X) وعلى الحائط (محور Y). إذا وُجدت فجوة في أيّ ظلّ منهما — لا تصادم. هذه فكرة **نظريّة المحور الفاصل**.\n\n| الحالة | تداخل X | تداخل Y | تصادم؟ |\n|---|---|---|---|\n| فوق بعض | ✓ | ✗ | لا |\n| جنب بعض | ✗ | ✓ | لا |\n| متداخلان | ✓ | ✓ | **نعم** |\n\n## مشكلة الرصاصة السريعة\nرصاصة تتحرّك ٥٠ بكسل في الإطار قد **تقفز فوق** جدار عرضه ١٠ دون أن تتداخل معه في أيّ إطار. الحلّ: افحص الخطّ بين الموضعين، أو قسّم الحركة لخطوات أصغر.\n\n> **هل تقدر تغلبها؟** المستطيل أكبر من شكل الشخصيّة غالبًا — لذلك تشعر أحيانًا أنّ الضربة «ما لمستك» ومع ذلك خسرت. ولعيوب «الرصاصة السريعة» اكتشف اللاعبون طرق العبور من الجدران.',
    en: '## Bounding boxes (AABB)\nGames don’t check every pixel — far too slow. Instead they wrap each object in an **axis-aligned rectangle** and ask: do the two rectangles overlap?\n\nThey overlap **only if** they overlap on the horizontal axis **and** the vertical axis together:\n\n```js\nfunction hit(a, b) {\n  return a.x < b.x + b.w &&   // A starts before B ends\n         a.x + a.w > b.x &&   // A ends after B starts\n         a.y < b.y + b.h &&\n         a.y + a.h > b.y;\n}\n```\n\n## Why it works\nPicture each rectangle’s shadow on the floor (X axis) and on the wall (Y axis). A gap in either shadow means no collision — the **separating axis theorem** idea.\n\n| Case | X overlap | Y overlap | Hit? |\n|---|---|---|---|\n| Stacked | ✓ | ✗ | No |\n| Side by side | ✗ | ✓ | No |\n| Overlapping | ✓ | ✓ | **Yes** |\n\n## The fast-bullet problem\nA bullet moving 50 px per frame can **jump over** a 10 px wall without ever overlapping it. Fix: test the line between positions, or split the move into smaller steps.\n\n> **Can you beat it?** Hitboxes are often bigger than the character — that’s why a hit that “didn’t touch you” still counts. And fast-object gaps are how players found ways through walls.' },
  task: { ar: '🎯 التحدّي: اسحب المربّع B بحيث يتداخل على X فقط (فوق A مباشرةً) — لاحظ «لا تصادم» رغم التداخل الأفقيّ. الشريطان الأخضران أسفل ويسار هما «ظلّا» المستطيلين.', en: '🎯 Challenge: drag B so it overlaps on X only (right above A) — note “no collision” despite the horizontal overlap. The green bars at the bottom and left are the rectangles’ “shadows”.' },
  quiz: [
    q('متى يتصادم مستطيلان غير مائلين؟', 'When do two axis-aligned rectangles collide?', ['إذا تداخلا على X فقط', 'إذا تداخلا على Y فقط', 'إذا تداخلا على X وY معًا', 'إذا تلامست زاويتاهما'], ['If they overlap on X only', 'If they overlap on Y only', 'If they overlap on both X and Y', 'If their corners touch'], 2, 'يلزم التداخل على المحورين معًا.', 'Overlap on both axes is required.'),
    q('لماذا لا تفحص الألعاب كلّ بكسل؟', 'Why don’t games check every pixel?', ['لأنّه بطيء جدًّا', 'لأنّه غير ممكن', 'لأنّ البكسلات لا تتصادم', 'لأنّه يحتاج إنترنت'], ['It’s far too slow', 'It’s impossible', 'Pixels can’t collide', 'It needs internet'], 0, '٤ مقارنات أسرع بآلاف المرّات من فحص آلاف البكسلات.', '4 comparisons are thousands of times faster than checking thousands of pixels.'),
    q('رصاصة سريعة عبرت جدارًا رفيعًا دون تصادم. السبب؟', 'A fast bullet passed through a thin wall. Why?', ['خطأ في الرسم', 'قفزت فوقه بين إطارين', 'الجدار غير موجود', 'الجاذبيّة'], ['A drawing bug', 'It skipped over it between two frames', 'The wall doesn’t exist', 'Gravity'], 1, 'موضعها قبل الجدار في إطار وبعده في الإطار التالي، فلم يتداخلا أبدًا.', 'It was before the wall one frame and past it the next, never overlapping.')
  ] },
{ id: 'path', icon: '🧭', t: { ar: 'البحث عن الطريق: BFS و A*', en: 'Pathfinding: BFS and A*' }, sub: { ar: 'كيف يجدك العدوّ في المتاهة؟', en: 'How does the enemy find you in a maze?' },
  body: { ar: '## المتاهة شبكة\nالعدوّ يرى الخريطة **خانات**: مفتوحة أو جدار. المطلوب أقصر طريق من خانته إلى خانتك.\n\n## BFS — البحث بالعرض\nيوسّع **كموجة ماء**: كلّ الخانات على بعد ١، ثمّ ٢، ثمّ ٣… أوّل مرّة يصل الهدف = أقصر طريق مضمون. لكنّه يفحص في **كلّ الاتّجاهات** حتّى البعيدة عن الهدف.\n\n## A* — البحث الذكيّ\nيختار دائمًا الخانة الأقلّ في:\n\n$$f = g + h$$\n\n- **g**: الخطوات التي مشيتها من البداية\n- **h**: تقدير المسافة الباقية للهدف (مانهاتن: $|dx| + |dy|$)\n\n```js\nwhile (open.length) {\n  const cur = open.lowest(f);      // g + h\n  if (cur === goal) return path(cur);\n  for (const n of neighbors(cur))\n    if (g[cur] + 1 < g[n]) { g[n] = g[cur] + 1; came[n] = cur; open.add(n); }\n}\n```\n\n| | BFS | A* |\n|---|---|---|\n| أقصر طريق؟ | ✓ | ✓ (إن كان h لا يبالغ) |\n| خانات مفحوصة | كثيرة | أقلّ بكثير |\n| يعرف مكان الهدف؟ | لا يستخدمه | يستخدمه للتوجيه |\n\n> **هل تقدر تغلبها؟** نعم! A* يحسب الطريق من الخريطة الحاليّة. الأعداء «يعلقون» حين تضع عائقًا يجعل الطريق طويلًا جدًّا، وكثير من الألعاب تحدّ عدد الخانات المفحوصة للسرعة — فيستسلم العدوّ في المتاهات المعقّدة.',
    en: '## A maze is a grid\nThe enemy sees the map as **cells**: open or wall. It needs the shortest path from its cell to yours.\n\n## BFS — breadth-first search\nExpands **like a ripple**: all cells 1 step away, then 2, then 3… The first time it reaches the goal is a guaranteed shortest path. But it searches in **every direction**, even away from the goal.\n\n## A* — the smart search\nAlways expands the cell with the lowest:\n\n$$f = g + h$$\n\n- **g**: steps walked from the start\n- **h**: estimated remaining distance (Manhattan: $|dx| + |dy|$)\n\n```js\nwhile (open.length) {\n  const cur = open.lowest(f);      // g + h\n  if (cur === goal) return path(cur);\n  for (const n of neighbors(cur))\n    if (g[cur] + 1 < g[n]) { g[n] = g[cur] + 1; came[n] = cur; open.add(n); }\n}\n```\n\n| | BFS | A* |\n|---|---|---|\n| Shortest path? | ✓ | ✓ (if h never overestimates) |\n| Cells explored | Many | Far fewer |\n| Uses goal location? | No | Yes, to steer |\n\n> **Can you beat it?** Yes! A* plans on the current map. Enemies get stuck when you create a very long detour, and many games cap how many cells are explored for speed — so the enemy gives up in complex mazes.' },
  task: { ar: '🎯 التحدّي: شغّل BFS ثمّ A* على نفس المتاهة وقارن رقم visited. ثمّ ارسم جدارًا يسدّ الطريق بالكامل — ماذا يحدث؟', en: '🎯 Challenge: run BFS then A* on the same maze and compare “visited”. Then draw a wall that blocks the way completely — what happens?' },
  quiz: [
    q('في A*، ماذا يعني h؟', 'In A*, what is h?', ['الخطوات التي مشيتها', 'تقدير المسافة الباقية للهدف', 'عدد الجدران', 'ارتفاع الخريطة'], ['Steps walked so far', 'Estimated distance left to the goal', 'Number of walls', 'Map height'], 1, 'h هو التخمين الذي يوجّه البحث نحو الهدف.', 'h is the guess that steers the search toward the goal.'),
    q('لماذا يفحص A* خانات أقلّ من BFS غالبًا؟', 'Why does A* usually explore fewer cells than BFS?', ['لأنّه لا يضمن أقصر طريق', 'لأنّه يتّجه نحو الهدف بدل كلّ الاتّجاهات', 'لأنّه يتجاهل الجدران', 'لأنّه أسرع كمبيوتر'], ['It doesn’t guarantee the shortest path', 'It heads toward the goal instead of every direction', 'It ignores walls', 'It runs on a faster computer'], 1, 'f = g + h يفضّل الخانات الأقرب للهدف.', 'f = g + h prefers cells closer to the goal.'),
    q('BFS يضمن أقصر طريق في شبكة خطواتها متساوية لأنّه…', 'BFS guarantees the shortest path on an equal-step grid because…', ['يوسّع طبقة طبقة حسب البعد', 'يختار عشوائيًّا', 'يبدأ من الهدف', 'يفحص الجدران أوّلًا'], ['It expands layer by layer by distance', 'It picks randomly', 'It starts at the goal', 'It checks walls first'], 0, 'أوّل وصول للهدف يكون من أقرب طبقة.', 'The first arrival at the goal comes from the nearest layer.')
  ] },
{ id: 'fsm', icon: '🧠', t: { ar: 'آلة الحالات: عقل العدوّ', en: 'State machines: the enemy’s brain' }, sub: { ar: 'دوريّة ← مطاردة ← هروب', en: 'Patrol → chase → flee' },
  body: { ar: '## العدوّ لا «يفكّر»\nأغلب أعداء الألعاب **آلة حالات محدودة (FSM)**: عدد قليل من الحالات، وفي كلّ حالة سلوك واحد، و**شروط** تنقله بينها.\n\n| الحالة | السلوك | ينتقل إلى… عندما |\n|---|---|---|\n| دوريّة | يمشي بين نقاط ثابتة | مطاردة: المسافة < ١٥٠ |\n| مطاردة | يتّجه نحوك | دوريّة: المسافة > ٢٢٠ |\n| هروب | يبتعد عنك | عند انتهاء قوّتك الخارقة |\n\n```js\nfunction next(state, dist, powered) {\n  if (powered) return "flee";\n  if (state === "patrol" && dist < 150) return "chase";\n  if (state === "chase"  && dist > 220) return "patrol";\n  if (state === "flee") return dist < 150 ? "chase" : "patrol";\n  return state;\n}\n```\n\n## لماذا ١٥٠ للدخول و٢٢٠ للخروج؟\nلو كان الرقمان متساويين، وأنت واقف على الحدّ بالضبط، لتذبذب العدوّ بين الحالتين كلّ إطار. الفرق بينهما اسمه **التباطؤ (hysteresis)** — ويجعل السلوك ثابتًا وطبيعيًّا.\n\n> **هل تقدر تغلبها؟** نعم، بسهولة لو عرفت الأرقام: قف على مسافة ١٦٠ — العدوّ في الدوريّة لا يراك. وأشباح «باك-مان» كلّها آلات حالات بقواعد معروفة، ولذلك يوجد مسار «مثاليّ» يحفظه المحترفون.',
    en: '## The enemy doesn’t “think”\nMost game enemies are a **finite state machine (FSM)**: a few states, one behavior per state, and **conditions** that switch between them.\n\n| State | Behavior | Switches to… when |\n|---|---|---|\n| Patrol | Walks between fixed points | Chase: distance < 150 |\n| Chase | Heads toward you | Patrol: distance > 220 |\n| Flee | Runs away | When your power-up ends |\n\n```js\nfunction next(state, dist, powered) {\n  if (powered) return "flee";\n  if (state === "patrol" && dist < 150) return "chase";\n  if (state === "chase"  && dist > 220) return "patrol";\n  if (state === "flee") return dist < 150 ? "chase" : "patrol";\n  return state;\n}\n```\n\n## Why 150 to enter but 220 to leave?\nIf both numbers were equal and you stood right on the edge, the enemy would flicker between states every frame. The gap is called **hysteresis** — it keeps behavior stable and natural.\n\n> **Can you beat it?** Easily, once you know the numbers: stand at distance 160 — a patrolling enemy won’t see you. Pac-Man’s ghosts are all state machines with known rules, which is why pros memorize a “perfect” route.' },
  task: { ar: '🎯 التحدّي: حرّك إصبعك (النقطة الخضراء) قرب العدوّ حتّى يطاردك، ثمّ ابتعد ببطء — لاحظ أنّه لا يتوقّف عند ١٥٠ بل عند ٢٢٠. جرّب «⚡ قوّة خارقة».', en: '🎯 Challenge: move your finger (the green dot) near the enemy until it chases, then back away slowly — it doesn’t stop at 150 but at 220. Try the ⚡ power-up.' },
  quiz: [
    q('ما هي آلة الحالات؟', 'What is a state machine?', ['شبكة عصبيّة', 'حالات محدودة وشروط انتقال بينها', 'مولّد أرقام', 'محرّك رسم'], ['A neural network', 'A few states plus transition rules', 'A number generator', 'A rendering engine'], 1, 'كلّ حالة لها سلوك، والشروط تقرّر الانتقال.', 'Each state has a behavior; conditions decide the switch.'),
    q('لماذا عتبة الدخول (١٥٠) مختلفة عن الخروج (٢٢٠)؟', 'Why is the enter threshold (150) different from exit (220)?', ['لتوفير الذاكرة', 'لمنع التذبذب بين الحالتين عند الحدّ', 'خطأ برمجيّ', 'لجعل العدوّ أسرع'], ['To save memory', 'To stop flickering between states at the edge', 'A bug', 'To make the enemy faster'], 1, 'هذا التباطؤ (hysteresis).', 'That’s hysteresis.'),
    q('العدوّ في «دوريّة» وأنت على بعد ١٨٠. ماذا يحدث؟', 'The enemy is patrolling and you are 180 away. What happens?', ['يطاردك', 'يبقى في الدوريّة', 'يهرب', 'يختفي'], ['It chases you', 'It keeps patrolling', 'It flees', 'It disappears'], 1, 'الدخول للمطاردة يحتاج أقلّ من ١٥٠.', 'Entering chase needs less than 150.')
  ] },
{ id: 'minimax', icon: '♟️', t: { ar: 'Minimax: كمبيوتر لا يخسر', en: 'Minimax: a computer that never loses' }, sub: { ar: 'إكس-أو ضدّ لاعب مثاليّ', en: 'Tic-tac-toe against a perfect player' },
  body: { ar: '## يجرّب كلّ المستقبل\nفي الألعاب ذات الدور (إكس-أو، شطرنج) يبني الكمبيوتر **شجرة** كلّ الحركات الممكنة حتّى النهاية، ويفترض أنّ **خصمه يلعب أفضل حركة دائمًا**:\n\n- في دوره يختار **الأكبر** (max)\n- في دورك يفترض أنّك تختار **الأصغر** له (min)\n\n```js\nfunction minimax(board, turn) {\n  const w = winner(board);\n  if (w === "O") return +1;      // فاز الكمبيوتر\n  if (w === "X") return -1;      // فزت أنت\n  if (w === "draw") return 0;\n  const scores = emptyCells(board).map(i =>\n    minimax(play(board, i, turn), other(turn)));\n  return turn === "O" ? Math.max(...scores) : Math.min(...scores);\n}\n```\n\n## كم حالة يفحص؟\nأوّل حركة في إكس-أو: حتّى $9! = 362{,}880$ مسارًا تقريبًا — الكمبيوتر يفحصها في جزء من الثانية. في الشطرنج العدد أكبر من ذرّات الكون، فتقطع المحرّكات البحث على عمق محدود وتقدّر الوضع (وتقلّم الفروع بـ**ألفا-بيتا**).\n\n## الحقيقة الرياضيّة\nإكس-أو **لعبة محلولة**: لو لعب الطرفان مثاليًّا فالنتيجة **تعادل دائمًا**. لذلك:\n\n| ضدّ Minimax كامل | النتيجة الممكنة |\n|---|---|\n| تلعب مثاليًّا | تعادل |\n| تخطئ مرّة واحدة | يعاقبك ويفوز |\n| تفوز | مستحيل رياضيًّا |\n\n> **هل تقدر تغلبها؟** ضدّ Minimax كامل: لا — أفضل ما تستطيعه التعادل. لكنّ الألعاب في المستوى «السهل» **تُضعف الكمبيوتر عمدًا** (يختار حركة عشوائيّة أحيانًا أو يبحث عمقًا صغيرًا) — وهنا تغلبه بنصب «فخّ الشوكة»: حركة تهدّد بخطّين معًا.',
    en: '## It tries the whole future\nIn turn-based games (tic-tac-toe, chess) the computer builds a **tree** of every possible move to the end, assuming its **opponent always plays the best move**:\n\n- On its turn it picks the **maximum** (max)\n- On your turn it assumes you pick the **minimum** for it (min)\n\n```js\nfunction minimax(board, turn) {\n  const w = winner(board);\n  if (w === "O") return +1;      // computer won\n  if (w === "X") return -1;      // you won\n  if (w === "draw") return 0;\n  const scores = emptyCells(board).map(i =>\n    minimax(play(board, i, turn), other(turn)));\n  return turn === "O" ? Math.max(...scores) : Math.min(...scores);\n}\n```\n\n## How many positions?\nFor the first tic-tac-toe move: up to about $9! = 362{,}880$ lines — checked in a fraction of a second. Chess has more positions than atoms in the universe, so engines stop at a limited depth, estimate the position, and prune branches with **alpha-beta**.\n\n## The mathematical fact\nTic-tac-toe is a **solved game**: with perfect play on both sides it is **always a draw**. So:\n\n| Against full minimax | Possible result |\n|---|---|\n| You play perfectly | Draw |\n| You slip once | It punishes you and wins |\n| You win | Mathematically impossible |\n\n> **Can you beat it?** Against full minimax: no — a draw is your best. But “easy” modes **weaken the computer on purpose** (random moves sometimes, or shallow search) — that’s where you win with a **fork**: one move that threatens two lines at once.' },
  task: { ar: '🎯 التحدّي: حاول أن تفوز ٣ مرّات… ثمّ فعّل «أظهر تفكير الكمبيوتر» وشاهد تقييمه لكلّ خانة قبل أن يلعب. هل تستطيع إنهاء ٥ ألعاب تعادلًا دون خطأ؟', en: '🎯 Challenge: try to win 3 times… then turn on “show the computer’s thinking” and watch it score every cell before it moves. Can you draw 5 games in a row without a mistake?' },
  quiz: [
    q('ماذا يفترض Minimax عن الخصم؟', 'What does minimax assume about the opponent?', ['يلعب عشوائيًّا', 'يلعب أفضل حركة دائمًا', 'يخطئ دائمًا', 'لا يلعب'], ['Plays randomly', 'Always plays the best move', 'Always makes mistakes', 'Doesn’t play'], 1, 'الافتراض الأسوأ يجعل الاختيار آمنًا مهما لعب الخصم.', 'Assuming the worst makes the choice safe whatever the opponent does.'),
    q('نتيجة إكس-أو إذا لعب الطرفان مثاليًّا؟', 'Tic-tac-toe result with perfect play on both sides?', ['يفوز من يبدأ', 'تعادل دائمًا', 'يفوز الثاني', 'عشوائيّة'], ['The first player wins', 'Always a draw', 'The second player wins', 'Random'], 1, 'إكس-أو لعبة محلولة نتيجتها التعادل.', 'Tic-tac-toe is solved: it’s a draw.'),
    q('لماذا لا يستطيع محرّك الشطرنج فحص كلّ الحركات حتّى النهاية؟', 'Why can’t a chess engine search every move to the end?', ['القوانين سرّيّة', 'عدد الحالات هائل جدًّا', 'الشطرنج عشوائيّ', 'لا يعرف القوانين'], ['The rules are secret', 'The number of positions is astronomically large', 'Chess is random', 'It doesn’t know the rules'], 1, 'لذلك يبحث لعمق محدود ويقدّر الوضع ويقلّم بألفا-بيتا.', 'So it searches a limited depth, estimates, and prunes with alpha-beta.')
  ] },
{ id: 'random', icon: '🎲', t: { ar: 'العشوائيّة المزيّفة والبذرة', en: 'Fake randomness and the seed' }, sub: { ar: 'الكمبيوتر لا يعرف الحظّ — اكسر أرقامه', en: 'Computers don’t know luck — crack their numbers' },
  body: { ar: '## الكمبيوتر لا يرمي نردًا\nالكمبيوتر آلة حتميّة: نفس المدخل ← نفس المخرج. فمن أين «العشوائيّة»؟ من **معادلة** تُنتج أرقامًا تبدو عشوائيّة، اسمها **مولّد أرقام شبه عشوائيّ (PRNG)**. أبسطها المولّد الخطّيّ:\n\n$$s_{n+1} = (a \\times s_n + c) \\bmod m$$\n\n```js\nlet s = seed;              // البذرة: نقطة البداية\nfunction next() {\n  s = (s * 1103515245 + 12345) % 2 ** 31;\n  return s;\n}\n```\n\n## البذرة هي كلّ شيء\n**نفس البذرة ← نفس السلسلة بالضبط، دائمًا.** هذا مفيد: «ماين كرافت» يبني عالمًا كاملًا من بذرة واحدة، فتشارك رقمًا بدل ملفّ ضخم.\n\n## كسر العشوائيّة\nلو كانت البذرة صغيرة أو مأخوذة من الوقت، تستطيع **تجربة كلّ البذور** حتّى تجد واحدة تُنتج نفس الأرقام التي رأيتها — ثمّ تعرف **كلّ الأرقام القادمة**.\n\n| البذرة من… | هل تُكسر؟ |\n|---|---|\n| الثانية الحاليّة | نعم — ٨٦٤٠٠ احتمال في اليوم فقط |\n| رقم صغير ثابت | نعم فورًا |\n| مولّد تشفيريّ (crypto) | عمليًّا لا |\n\n> **هل تقدر تغلبها؟** هذا بالضبط **التلاعب بالعشوائيّة (RNG manipulation)**: لاعبو بوكيمون يضغطون الزرّ في جزء محدّد من الثانية فيحصلون على البوكيمون النادر. أمّا ألعاب المال والكازينو فتستخدم مولّدات تشفيريّة ورياضيّاتها مصمّمة لتخسر على المدى الطويل — لا تحاول.',
    en: '## Computers don’t roll dice\nA computer is deterministic: same input → same output. So where does “randomness” come from? From an **equation** that produces random-looking numbers — a **pseudo-random number generator (PRNG)**. The simplest is the linear congruential generator:\n\n$$s_{n+1} = (a \\times s_n + c) \\bmod m$$\n\n```js\nlet s = seed;              // the seed: starting point\nfunction next() {\n  s = (s * 1103515245 + 12345) % 2 ** 31;\n  return s;\n}\n```\n\n## The seed is everything\n**Same seed → exactly the same sequence, always.** Useful: Minecraft builds a whole world from one seed, so you share a number instead of a huge file.\n\n## Cracking randomness\nIf the seed is small or taken from the clock, you can **try every seed** until one produces the numbers you saw — then you know **every future number**.\n\n| Seed from… | Crackable? |\n|---|---|\n| Current second | Yes — only 86,400 per day |\n| Small fixed number | Yes, instantly |\n| Cryptographic RNG | Practically no |\n\n> **Can you beat it?** That’s exactly **RNG manipulation**: Pokémon players press a button at a precise fraction of a second to get the rare Pokémon. Money and casino games use cryptographic generators and math built to make you lose over time — don’t try.' },
  task: { ar: '🎯 التحدّي: اكتب البذرة ٤٢ واضغط «ولّد» مرّتين — نفس الخريطة ونفس الأرقام. ثمّ جرّب ٤٣. أخيرًا اضغط «🕵️ اكسر البذرة»: الكمبيوتر يرى ٣ أرقام فقط من بذرة سرّيّة ويتوقّع الرقمين التاليين.', en: '🎯 Challenge: type seed 42 and press Generate twice — same map, same numbers. Then try 43. Finally press “🕵️ Crack the seed”: the computer sees only 3 numbers from a secret seed and predicts the next two.' },
  quiz: [
    q('ماذا يحدث لو شغّلت المولّد بنفس البذرة مرّتين؟', 'What happens if you run the generator twice with the same seed?', ['أرقام مختلفة', 'نفس الأرقام بالضبط', 'خطأ', 'نصف الأرقام نفسها'], ['Different numbers', 'Exactly the same numbers', 'An error', 'Half the same'], 1, 'المولّد معادلة حتميّة.', 'The generator is a deterministic equation.'),
    q('لماذا البذرة المأخوذة من الثانية الحاليّة ضعيفة؟', 'Why is a seed from the current second weak?', ['لأنّ الساعة خاطئة', 'لأنّ احتمالاتها قليلة ويمكن تجربتها كلّها', 'لأنّها كبيرة جدًّا', 'لأنّها سالبة'], ['The clock is wrong', 'There are few possibilities, so you can try them all', 'It’s too big', 'It’s negative'], 1, '٨٦٤٠٠ احتمال في اليوم — تُجرَّب في لحظة.', '86,400 per day — tried in a moment.'),
    q('كيف يبني «ماين كرافت» نفس العالم من رقم واحد؟', 'How does Minecraft rebuild the same world from one number?', ['يحفظ العالم في الرقم', 'البذرة تعطي نفس سلسلة الأرقام فتُبنى نفس الخريطة', 'يرسله من الإنترنت', 'صدفة'], ['It stores the world in the number', 'The seed gives the same number sequence, so the same map is built', 'It downloads it', 'Coincidence'], 1, 'التوليد الإجرائيّ = بذرة + خوارزميّة.', 'Procedural generation = seed + algorithm.')
  ] },
{ id: 'cups', icon: '🥤', t: { ar: 'لعبة الأكواب: خوارزميّة التتبّع', en: 'The cups game: a tracking algorithm' }, sub: { ar: 'تابع رقمًا واحدًا فقط — واغلب الكمبيوتر', en: 'Track just one number — and beat the computer' },
  body: { ar: '## ماذا يفعل الكمبيوتر؟\n```\n١. ضع الكرة تحت كوب\n٢. كرّر N مرّة: اختر كوبين عشوائيًّا وبدّلهما (وأسرع قليلًا)\n٣. اطلب من اللاعب أن يختار\n```\nفي لعبة نزيهة **الكرة لا تُنقل سرًّا أبدًا** — تتحرّك مع كوبها فقط. إذن الفوز ممكن ١٠٠٪.\n\n## خوارزميّتك: تتبّع الموضع لا الأكواب\nرقّم **الأماكن** (١ يسار، ٢ وسط، ٣ يمين) وتابع **رقمًا واحدًا**: مكان الكرة. مع كلّ تبديل `[a ↔ b]` اسأل سؤالًا واحدًا:\n\n```python\nif pos == a:   pos = b\nelif pos == b: pos = a\nelse:          pass   # الكرة لم تتحرّك — تجاهل هذا التبديل\n```\n\n| التبديل | هل مكاني فيه؟ | مكان الكرة |\n|---|---|---|\n| البداية | — | **٢** |\n| ١ ↔ ٣ | لا | ٢ |\n| ٢ ↔ ٣ | نعم | **٣** |\n| ١ ↔ ٢ | لا | ٣ |\n| ٣ ↔ ١ | نعم | **١** |\n\nلاحظ: تتجاهل نصف الحركات تقريبًا — هذا سرّ السرعة.\n\n## احتمالات يجب أن تعرفها\n- لو فقدت التتبّع: فرصتك $\\frac{1}{3}$ مهما اخترت.\n- لو كشفت اللعبة كوبًا فارغًا وسألتك «تغيّر؟» — **غيّر**: فرصتك تصير $\\frac{2}{3}$ (مسألة مونتي هول).\n\n> **هل تقدر تغلبها؟** النزيهة: نعم دائمًا بالتتبّع. وإن كانت تستخدم مولّدًا ضعيفًا فتسلسل التبديلات يتكرّر — سجّل الشاشة وشاهده بطيئًا. وإن كانت تنقل الكرة سرًّا (ألعاب المراهنات) فلا تُغلب — لأنّها غشّ لا خوارزميّة.',
    en: '## What the computer does\n```\n1. Put the ball under a cup\n2. Repeat N times: pick two cups at random and swap them (a bit faster)\n3. Ask the player to choose\n```\nIn a fair game **the ball is never moved secretly** — it only moves with its cup. So winning 100% is possible.\n\n## Your algorithm: track the position, not the cups\nNumber the **places** (1 left, 2 middle, 3 right) and track **one number**: where the ball is. For each swap `[a ↔ b]` ask a single question:\n\n```python\nif pos == a:   pos = b\nelif pos == b: pos = a\nelse:          pass   # the ball didn’t move — ignore this swap\n```\n\n| Swap | Is my place in it? | Ball position |\n|---|---|---|\n| Start | — | **2** |\n| 1 ↔ 3 | No | 2 |\n| 2 ↔ 3 | Yes | **3** |\n| 1 ↔ 2 | No | 3 |\n| 3 ↔ 1 | Yes | **1** |\n\nNotice you ignore about half the moves — that’s the speed secret.\n\n## Odds you should know\n- If you lose track: your chance is $\\frac{1}{3}$ whatever you pick.\n- If the game reveals an empty cup and asks “switch?” — **switch**: your chance becomes $\\frac{2}{3}$ (the Monty Hall problem).\n\n> **Can you beat it?** A fair one: always, by tracking. If it uses a weak generator the swap sequence repeats — record the screen and watch it slowly. If it moves the ball secretly (betting games), it can’t be beaten — that’s cheating, not an algorithm.' },
  task: { ar: '🎯 التحدّي: ابدأ بـ٨ تبديلات وسرعة ١ مع «وضع التتبّع»، ثمّ أطفئه وتتبّع بعقلك. ارفع السرعة والعدد تدريجيًّا — كم تبديلًا تتحمّل قبل أن تخطئ؟', en: '🎯 Challenge: start with 8 swaps at speed 1 with tracking mode on, then turn it off and track in your head. Raise speed and swaps gradually — how many swaps can you handle?' },
  quiz: [
    q('الكرة في ٢، والتبديل ١ ↔ ٣. أين الكرة؟', 'Ball at 2, swap 1 ↔ 3. Where is the ball?', ['١', '٢', '٣', 'لا يمكن المعرفة'], ['1', '2', '3', 'Can’t tell'], 1, 'مكانها ليس في التبديل، فلم تتحرّك.', 'Its place isn’t in the swap, so it didn’t move.'),
    q('الكرة في ٣، ثمّ ٣ ↔ ١ ثمّ ١ ↔ ٢. أين الكرة؟', 'Ball at 3, then 3 ↔ 1, then 1 ↔ 2. Where?', ['١', '٢', '٣', '٤'], ['1', '2', '3', '4'], 1, '٣ ← ١ ← ٢.', '3 → 1 → 2.'),
    q('كشفت اللعبة كوبًا فارغًا بعد اختيارك وسألتك تغيّر. الأفضل؟', 'After your pick the game reveals an empty cup and offers a switch. Best move?', ['ابقَ', 'غيّر — ٢/٣', 'لا فرق', 'اختر الفارغ'], ['Stay', 'Switch — 2/3', 'No difference', 'Pick the empty one'], 1, 'اختيارك الأوّل صحيح بنسبة ١/٣ فقط؛ الكوب الباقي يحمل ٢/٣.', 'Your first pick is right only 1/3 of the time; the remaining cup holds 2/3.')
  ] }
];

/* ================= الواجهة ================= */
var DONE_KEY = 'eduAlgoDone';
function openTrack(){
  var c = C(); if(!c) return;
  c.setBack(true); c.setNav([c.showHome]);
  var done = lsGet(DONE_KEY, {}), body = c.body();
  body.innerHTML = '<div class="eduSecTitle" style="margin-top:0;">🎮 ' + esc(L('خوارزميات الألعاب', 'Game algorithms')) + '</div>'
    + '<p style="font-size:var(--fs-3);line-height:1.8;opacity:.85;margin:0 0 6px;">' + esc(L('ثمانية دروس: في كلّ درس شرح، ولعبة حيّة تلمس فيها الخوارزميّة بيدك، وتحدٍّ، واختبار قصير — وفي آخر كلّ درس: هل تقدر تغلبها؟', 'Eight lessons: each has an explanation, a live game where you touch the algorithm, a challenge and a short quiz — and at the end of each: can you beat it?')) + '</p>'
    + LESSONS.map(function(l, i){
      return '<div class="algoRow" data-l="' + i + '"><span class="algoIcon">' + l.icon + '</span><div style="min-width:0;"><div class="algoRowT">' + (i + 1) + '. ' + esc(tx(l.t)) + '</div><div class="algoRowS">' + esc(tx(l.sub)) + '</div></div>'
        + (done[l.id] !== undefined ? '<span class="algoDone">✓ ' + done[l.id] + '%</span>' : '') + '</div>';
    }).join('');
  body.querySelectorAll('[data-l]').forEach(function(r){ r.onclick = function(){ openLesson(+r.getAttribute('data-l')); }; });
  try{ body.scrollTop = 0; }catch(e){ __swallow(e, 'ui:edu-algo-scroll'); }
}
function openLesson(i, tab){
  var c = C(), l = LESSONS[i], body = c.body();
  c.setBack(true); c.setNav([openTrack]);
  var tabs = [['read', '📄 ' + L('الشرح', 'Explanation')], ['play', '🎮 ' + L('جرّب بيدك', 'Try it')], ['quiz', '✍️ ' + L('اختبار', 'Quiz')], ['tutor', '💬 ' + L('اسأل المعلّم', 'Ask the tutor')]];
  body.innerHTML = '<div class="eduSecTitle" style="margin-top:0;">' + l.icon + ' ' + esc(tx(l.t)) + '</div><div class="eduTabs">'
    + tabs.map(function(t){ return '<button class="eduTab" data-tab="' + t[0] + '">' + esc(t[1]) + '</button>'; }).join('') + '</div><div id="algoPane"></div>'
    + '<div style="display:flex;justify-content:space-between;gap:8px;margin-top:16px;">'
    + (i > 0 ? '<button class="eduPrimary eduGhost" id="algoPrev">' + esc(L('→ السابق', '← Previous')) + '</button>' : '<span></span>')
    + (i < LESSONS.length - 1 ? '<button class="eduPrimary" id="algoNext">' + esc(L('التالي ←', 'Next →')) + '</button>' : '') + '</div>';
  var pane = document.getElementById('algoPane');
  function act(t){
    body.querySelectorAll('.eduTab').forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-tab') === t); });
    if(t === 'read'){
      pane.innerHTML = '<div class="eduSummary">' + c.md(tx(l.body)) + '</div><button class="eduPrimary" id="algoGoPlay" style="margin-top:12px;">🎮 ' + esc(L('جرّب بيدك الآن', 'Try it now')) + '</button>';
      if(window.__eduPlus) window.__eduPlus.listenBtn(pane, tx(l.body));
      document.getElementById('algoGoPlay').onclick = function(){ act('play'); };
    } else if(t === 'play'){
      pane.innerHTML = '';
      var host = document.createElement('div'), ctl = document.createElement('div'), info = document.createElement('div'), task = document.createElement('div');
      ctl.className = 'algoCtl'; info.className = 'algoInfo'; task.className = 'algoTask'; task.textContent = tx(l.task);
      pane.appendChild(host); pane.appendChild(ctl); pane.appendChild(info); pane.appendChild(task);
      try{ DEMOS[l.id](host, ctl, info); }catch(e){ __swallow(e, 'edu:algo-demo'); info.textContent = String((e && e.message) || e); }
    } else if(t === 'quiz') quiz(pane, l);
    else if(window.__eduPlus) window.__eduPlus.tutor(pane, { id: 'algo-' + l.id, title: tx(l.t), summary: tx(l.body) });
  }
  body.querySelectorAll('.eduTab').forEach(function(b){ b.onclick = function(){ act(b.getAttribute('data-tab')); }; });
  var pv = document.getElementById('algoPrev'); if(pv) pv.onclick = function(){ openLesson(i - 1); };
  var nx = document.getElementById('algoNext'); if(nx) nx.onclick = function(){ openLesson(i + 1); };
  act(tab || 'read');
  try{ body.scrollTop = 0; }catch(e){ __swallow(e, 'ui:edu-algo-scroll'); }
}
function quiz(pane, l){
  var c = C(), k = 0, right = 0, ar = isAr();
  function draw(){
    if(k >= l.quiz.length){
      var pct = Math.round(right / l.quiz.length * 100), done = lsGet(DONE_KEY, {});
      done[l.id] = Math.max(done[l.id] || 0, pct); lsSet(DONE_KEY, done);
      try{ c.bumpStreak(); }catch(e){ __swallow(e, 'edu:algo-streak'); }
      pane.innerHTML = '<div class="eduCenter"><div class="eduScoreBig">' + pct + '%</div><p>' + esc(pct === 100 ? L('ممتاز! فهمت الخوارزميّة 🌟', 'Excellent! You understand the algorithm 🌟') : L('راجع الشرح وجرّب اللعبة ثمّ أعد الاختبار 💪', 'Review the explanation, play the game, then retry 💪')) + '</p>'
        + '<button class="eduPrimary" id="algoRetry">' + esc(c.T('retry')) + '</button></div>';
      document.getElementById('algoRetry').onclick = function(){ k = 0; right = 0; draw(); };
      return;
    }
    var qq = l.quiz[k], opts = ar ? qq.o.ar : qq.o.en;
    pane.innerHTML = '<div style="font-size:12px;opacity:.7;margin-bottom:8px;">' + (k + 1) + ' / ' + l.quiz.length + '</div>'
      + '<div style="font-size:var(--fs-2);font-weight:var(--w-bold);margin-bottom:14px;line-height:1.7;">' + esc(tx(qq.q)) + '</div>'
      + opts.map(function(o, i){ return '<button class="eduQOpt" data-i="' + i + '">' + esc(o) + '</button>'; }).join('')
      + '<div id="algoExpl"></div><div style="text-align:center;margin-top:14px;"><button class="eduPrimary" id="algoNextQ" style="display:none;">' + esc(c.T('next')) + '</button></div>';
    var answered = false;
    pane.querySelectorAll('.eduQOpt').forEach(function(b){
      b.onclick = function(){
        if(answered) return; answered = true;
        var i = +b.getAttribute('data-i');
        pane.querySelectorAll('.eduQOpt').forEach(function(x, xi){ if(xi === qq.c) x.classList.add('right'); else if(xi === i) x.classList.add('wrong'); });
        if(i === qq.c) right++;
        document.getElementById('algoExpl').innerHTML = '<div class="eduExplain">💡 ' + esc(tx(qq.x)) + '</div>';
        document.getElementById('algoNextQ').style.display = '';
      };
    });
    document.getElementById('algoNextQ').onclick = function(){ k++; draw(); };
  }
  draw();
}

window.__eduAlgo = {
  open: openTrack, openLesson: openLesson, lessons: LESSONS,
  lib: { physicsStep: physicsStep, aabb: aabb, gridSearch: gridSearch, fsmNext: fsmNext, winner: winner, bestMove: bestMove, moveScores: moveScores,
         lcg: lcg, lcgSeq: lcgSeq, crackSeed: crackSeed, caveMap: caveMap, cupsTrack: cupsTrack, cupsSwaps: cupsSwaps }
};
})();
