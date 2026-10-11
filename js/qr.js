/* v-qr-one: مولّد باركود QR ذاتيّ بلا مكتبة ولا شبكة — باركود «حسابي» يُرسم في المتصفّح برابط المستخدم نفسه.
   الوضع بايت والتصحيح H دائمًا (٣٠٪ — يسمح بالشعار في الوسط)، والإصدارات ١–١٥ (حتى ٢٢٠ بايتًا؛ رابط الدعوة بأطول اسم ≈١١٠).
   البناء على المواصفة ISO/IEC 18004 بترتيب Nayuki: أنماط ثابتة ← بيانات + Reed-Solomon متداخلة ← قناع بأقلّ عقوبة.
   ES5 عمدًا: يُحمَّل في أندرويد القديم وغلاف هواوي. */
(function (root) {
  'use strict';

  // لكلّ إصدار (H): [كتل المجموعة ١، بيانات كتلتها، كتل المجموعة ٢، بيانات كتلتها، رموز التصحيح لكلّ كتلة]
  var BLOCKS_H = [null,
    [1, 9, 0, 0, 17], [1, 16, 0, 0, 28], [2, 13, 0, 0, 22], [4, 9, 0, 0, 16], [2, 11, 2, 12, 22],
    [4, 15, 0, 0, 28], [4, 13, 1, 14, 26], [4, 14, 2, 15, 26], [4, 12, 4, 13, 24], [6, 15, 2, 16, 28],
    [3, 12, 8, 13, 24], [7, 14, 4, 15, 28], [12, 11, 4, 12, 22], [11, 12, 5, 13, 24], [11, 12, 7, 13, 24]];
  var ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46],
    [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70]];
  var MAX_VERSION = 15;
  var ECL_H_BITS = 2;

  function utf8(text) {
    var s = unescape(encodeURIComponent(String(text))), out = [];
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }
  function dataCap(v) { var b = BLOCKS_H[v]; return b[0] * b[1] + b[2] * b[3]; }
  function countBits(v) { return v < 10 ? 8 : 16; }

  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function rsDivisor(degree) {
    var r = [], i, j, rootv = 1;
    for (i = 0; i < degree - 1; i++) r.push(0);
    r.push(1);
    for (i = 0; i < degree; i++) {
      for (j = 0; j < r.length; j++) {
        r[j] = gfMul(r[j], rootv);
        if (j + 1 < r.length) r[j] ^= r[j + 1];
      }
      rootv = gfMul(rootv, 0x02);
    }
    return r;
  }
  function rsRemainder(data, div) {
    var r = div.map(function () { return 0; });
    for (var k = 0; k < data.length; k++) {
      var f = data[k] ^ r.shift();
      r.push(0);
      for (var i = 0; i < r.length; i++) r[i] ^= gfMul(div[i], f);
    }
    return r;
  }

  function codewords(bytes, v) {
    var bits = [], i, j;
    function put(val, len) { for (var k = len - 1; k >= 0; k--) bits.push((val >>> k) & 1); }
    put(4, 4);
    put(bytes.length, countBits(v));
    for (i = 0; i < bytes.length; i++) put(bytes[i], 8);
    var capBits = dataCap(v) * 8;
    put(0, Math.min(4, capBits - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < capBits; pad ^= 0xEC ^ 0x11) put(pad, 8);
    var data = [];
    for (i = 0; i < bits.length; i += 8) {
      var b = 0;
      for (j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      data.push(b);
    }
    var t = BLOCKS_H[v], div = rsDivisor(t[4]), blocks = [], eccs = [], off = 0, n, len;
    for (n = 0; n < t[0] + t[2]; n++) {
      len = n < t[0] ? t[1] : t[3];
      var blk = data.slice(off, off + len);
      off += len;
      blocks.push(blk);
      eccs.push(rsRemainder(blk, div));
    }
    var out = [], maxLen = Math.max(t[1], t[3]);
    for (i = 0; i < maxLen; i++) for (n = 0; n < blocks.length; n++) if (i < blocks[n].length) out.push(blocks[n][i]);
    for (i = 0; i < t[4]; i++) for (n = 0; n < eccs.length; n++) out.push(eccs[n][i]);
    return out;
  }

  function Grid(v) {
    this.size = v * 4 + 17;
    this.m = [];
    this.fn = [];
    for (var y = 0; y < this.size; y++) {
      this.m.push([]);
      this.fn.push([]);
      for (var x = 0; x < this.size; x++) { this.m[y].push(false); this.fn[y].push(false); }
    }
  }
  Grid.prototype.setFn = function (x, y, dark) { this.m[y][x] = !!dark; this.fn[y][x] = true; };

  function bit(x, i) { return ((x >>> i) & 1) !== 0; }

  function drawFormat(g, mask) {
    var data = (ECL_H_BITS << 3) | mask, rem = data, i, s = g.size;
    for (i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412;
    for (i = 0; i <= 5; i++) g.setFn(8, i, bit(bits, i));
    g.setFn(8, 7, bit(bits, 6));
    g.setFn(8, 8, bit(bits, 7));
    g.setFn(7, 8, bit(bits, 8));
    for (i = 9; i < 15; i++) g.setFn(14 - i, 8, bit(bits, i));
    for (i = 0; i < 8; i++) g.setFn(s - 1 - i, 8, bit(bits, i));
    for (i = 8; i < 15; i++) g.setFn(8, s - 15 + i, bit(bits, i));
    g.setFn(8, s - 8, true);
  }

  function drawFunctionPatterns(g, v) {
    var s = g.size, i, j, dx, dy;
    for (i = 0; i < s; i++) { g.setFn(6, i, i % 2 === 0); g.setFn(i, 6, i % 2 === 0); }
    var finders = [[3, 3], [s - 4, 3], [3, s - 4]];
    for (i = 0; i < 3; i++) {
      for (dy = -4; dy <= 4; dy++) for (dx = -4; dx <= 4; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy)), xx = finders[i][0] + dx, yy = finders[i][1] + dy;
        if (xx >= 0 && xx < s && yy >= 0 && yy < s) g.setFn(xx, yy, d !== 2 && d !== 4);
      }
    }
    var al = ALIGN[v], last = al.length - 1;
    for (i = 0; i < al.length; i++) for (j = 0; j < al.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (dy = -2; dy <= 2; dy++) for (dx = -2; dx <= 2; dx++) g.setFn(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    drawFormat(g, 0);
    if (v >= 7) {
      var rem = v;
      for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var vb = (v << 12) | rem;
      for (i = 0; i < 18; i++) {
        var a = s - 11 + i % 3, b = Math.floor(i / 3);
        g.setFn(a, b, bit(vb, i));
        g.setFn(b, a, bit(vb, i));
      }
    }
  }

  function drawCodewords(g, data) {
    var s = g.size, i = 0, total = data.length * 8;
    for (var right = s - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < s; vert++) {
        for (var j = 0; j < 2; j++) {
          var x = right - j, up = ((right + 1) & 2) === 0, y = up ? s - 1 - vert : vert;
          if (!g.fn[y][x] && i < total) {
            g.m[y][x] = bit(data[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  }

  function maskBit(mask, x, y) {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5: return (x * y) % 2 + (x * y) % 3 === 0;
      case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
      default: return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
    }
  }
  function applyMask(g, mask) {
    for (var y = 0; y < g.size; y++) for (var x = 0; x < g.size; x++) {
      if (!g.fn[y][x] && maskBit(mask, x, y)) g.m[y][x] = !g.m[y][x];
    }
  }

  // عقوبة القناع (المواصفة ٧.٨.٣): السلاسل، المربّعات ٢×٢، شبه نمط المحدِّد، وتوازن الداكن.
  function penalty(g) {
    var s = g.size, m = g.m, p = 0, x, y, k, run, dark = 0;
    function line(get) {
      var r = 0, prev = null, len = 0, i, str = '';
      for (i = 0; i < s; i++) {
        var c = get(i);
        str += c ? '1' : '0';
        if (c === prev) len++;
        else { if (len >= 5) r += 3 + len - 5; prev = c; len = 1; }
      }
      if (len >= 5) r += 3 + len - 5;
      var at = -1;
      while ((at = str.indexOf('1011101', at + 1)) !== -1) {
        var before = str.slice(Math.max(0, at - 4), at), after = str.slice(at + 7, at + 11);
        if ((at >= 4 && before === '0000') || (at + 11 <= s && after === '0000')) r += 40;
      }
      return r;
    }
    for (k = 0; k < s; k++) {
      p += line(function (i) { return m[k][i]; });
      p += line(function (i) { return m[i][k]; });
    }
    for (y = 0; y < s - 1; y++) for (x = 0; x < s - 1; x++) {
      run = m[y][x];
      if (run === m[y][x + 1] && run === m[y + 1][x] && run === m[y + 1][x + 1]) p += 3;
    }
    for (y = 0; y < s; y++) for (x = 0; x < s; x++) if (m[y][x]) dark++;
    var total = s * s;
    p += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    return p;
  }

  /* matrix(text[, {mask, version}]) → {version, mask, size, modules[y][x]} — mask/version للاختبار فقط. */
  function matrix(text, opt) {
    opt = opt || {};
    var bytes = utf8(text), v = opt.version || 1;
    while (v <= MAX_VERSION && dataCap(v) * 8 < 4 + countBits(v) + bytes.length * 8) v++;
    if (v > MAX_VERSION) throw new Error('qr: النصّ أطول من سعة الباركود');
    var data = codewords(bytes, v), best = null, bestMask = 0, bestPen = Infinity;
    var masks = typeof opt.mask === 'number' ? [opt.mask] : [0, 1, 2, 3, 4, 5, 6, 7];
    for (var i = 0; i < masks.length; i++) {
      var g = new Grid(v);
      drawFunctionPatterns(g, v);
      drawCodewords(g, data);
      applyMask(g, masks[i]);
      drawFormat(g, masks[i]);
      var pen = masks.length > 1 ? penalty(g) : 0;
      if (pen < bestPen) { bestPen = pen; best = g; bestMask = masks[i]; }
    }
    return { version: v, mask: bestMask, size: best.size, modules: best.m };
  }

  /* draw(canvas, text, {px, logo, dark, light}, done) — ٤ وحدات هامش أبيض، والشعار مربّع داكن بإطار ذهبيّ في الوسط
     يغطّي أقلّ من ٧٪ من المساحة (التصحيح H يحتمل ٣٠٪). done يُنادى بعد رسم الشعار أو فشل تحميله. */
  function draw(canvas, text, opt, done) {
    opt = opt || {};
    var q = matrix(text), quiet = 4, n = q.size + quiet * 2;
    var unit = Math.max(4, Math.floor((opt.px || 720) / n)), side = unit * n;
    canvas.width = side;
    canvas.height = side;
    var c = canvas.getContext('2d');
    c.fillStyle = opt.light || '#ffffff';
    c.fillRect(0, 0, side, side);
    c.fillStyle = opt.dark || '#0d0f14';
    for (var y = 0; y < q.size; y++) for (var x = 0; x < q.size; x++) {
      if (q.modules[y][x]) c.fillRect((x + quiet) * unit, (y + quiet) * unit, unit, unit);
    }
    if (!opt.logo) { if (done) done(q); return q; }
    var tile = Math.round(q.size * unit * 0.24), t0 = Math.round((side - tile) / 2);
    function rr(x0, y0, w, r) {
      c.beginPath();
      c.moveTo(x0 + r, y0);
      c.arcTo(x0 + w, y0, x0 + w, y0 + w, r);
      c.arcTo(x0 + w, y0 + w, x0, y0 + w, r);
      c.arcTo(x0, y0 + w, x0, y0, r);
      c.arcTo(x0, y0, x0 + w, y0, r);
      c.closePath();
    }
    var pad = Math.round(unit * 0.8);
    c.fillStyle = opt.light || '#ffffff';
    rr(t0 - pad, t0 - pad, tile + pad * 2, Math.round(tile * 0.26));
    c.fill();
    c.fillStyle = '#0a0b0f';
    rr(t0, t0, tile, Math.round(tile * 0.22));
    c.fill();
    c.lineWidth = Math.max(2, Math.round(unit * 0.35));
    c.strokeStyle = '#d4af37';
    c.stroke();
    var img = new Image();
    img.onload = function () {
      var inset = Math.round(tile * 0.1), w = tile - inset * 2;
      c.save();
      rr(t0 + inset, t0 + inset, w, Math.round(w * 0.2));
      c.clip();
      c.drawImage(img, t0 + inset, t0 + inset, w, w);
      c.restore();
      if (done) done(q);
    };
    img.onerror = function () { if (done) done(q); };
    img.src = opt.logo;
    return q;
  }

  root.OmranQR = { matrix: matrix, draw: draw };
})(typeof window !== 'undefined' ? window : this);
