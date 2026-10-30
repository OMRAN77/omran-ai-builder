// Reel-strip slot model: reading it from JSON, CSV or the form, validating it, and
// normalizing it for the exact engine and the simulator.
//
// Raw model (what users write; rows and line positions are 1-based, row 1 = top):
// {
//   "name": "...", "rows": 3,
//   "reels": [["A","K",...], ...],            one reel strip per reel, cyclic
//   "lines": [[2,2,2,2,2], ...],              row per reel for each payline
//   "paytable": { "A": [0,0,5,20,100], ... }, pay for 1..N of a kind, x line bet
//   "wild": { "symbol": "W", "pays": [...] }, substitutes for paying symbols
//   "scatter": { "symbol": "S", "pays": [...] (x total bet, by count anywhere),
//                "freeSpins": { "trigger": 3, "spins": 10, "multiplier": 2,
//                               "retrigger": true, "reels": [[...], ...] } }
// }
import { Fraction } from './fraction.js';
import { parseCsv } from './csv.js';

export class ModelError extends Error {
  constructor(ar, en) {
    super(en);
    this.ar = ar;
    this.en = en;
  }
}

const err = (ar, en) => new ModelError(ar, en);
const MAX_REELS = 8, MAX_ROWS = 8, MAX_STOPS = 10000, MAX_LINES = 200;

export const STANDARD_LINES_5x3 = [
  [2, 2, 2, 2, 2], [1, 1, 1, 1, 1], [3, 3, 3, 3, 3], [1, 2, 3, 2, 1], [3, 2, 1, 2, 3],
  [2, 1, 1, 1, 2], [2, 3, 3, 3, 2], [1, 1, 2, 3, 3], [3, 3, 2, 1, 1], [2, 3, 2, 1, 2],
  [2, 1, 2, 3, 2], [1, 2, 2, 2, 1], [3, 2, 2, 2, 3], [1, 2, 1, 2, 1], [3, 2, 3, 2, 3],
  [2, 2, 1, 2, 2], [2, 2, 3, 2, 2], [1, 1, 3, 1, 1], [3, 3, 1, 3, 3], [1, 3, 1, 3, 1],
];

export function linePreset(preset, reels, rows) {
  const mid = Math.ceil(rows / 2);
  if (preset === 'middle') return [new Array(reels).fill(mid)];
  if (preset === 'rows') return Array.from({ length: rows }, (_, r) => new Array(reels).fill(r + 1));
  if (preset === 'standard20') {
    if (reels !== 5 || rows !== 3) throw err('خطوط 20 القياسية تحتاج 5 بكرات و3 صفوف', 'The standard 20 lines need 5 reels and 3 rows');
    return STANDARD_LINES_5x3.map((l) => l.slice());
  }
  throw err('قالب خطوط غير معروف', 'Unknown line preset');
}

function decimals(x) {
  const s = String(x);
  if (/e/i.test(s)) {
    const [m, e] = s.split(/e/i);
    return Math.max(0, (m.split('.')[1] || '').length - parseInt(e, 10));
  }
  return (s.split('.')[1] || '').length;
}

function payArray(value, maxCount, what) {
  let arr;
  if (Array.isArray(value)) arr = value;
  else if (value && typeof value === 'object') {
    arr = new Array(maxCount).fill(0);
    for (const [k, v] of Object.entries(value)) {
      const c = parseInt(k, 10);
      if (!(c >= 1 && c <= maxCount)) throw err(`عدد غير صالح "${k}" في دفع ${what}`, `Invalid count "${k}" in pays for ${what}`);
      arr[c - 1] = v;
    }
  } else throw err(`جدول دفع غير صالح للرمز ${what}`, `Invalid pays for ${what}`);
  if (arr.length > maxCount) throw err(`دفع ${what} أطول من ${maxCount}`, `Pays for ${what} are longer than ${maxCount}`);
  return arr.map((v) => {
    const x = typeof v === 'string' ? Number(v.trim() || 0) : Number(v);
    if (!Number.isFinite(x) || x < 0 || x > 1e9) throw err(`قيمة دفع غير صالحة للرمز ${what}: ${v}`, `Invalid pay for ${what}: ${v}`);
    if (decimals(x) > 6) throw err(`قيمة الدفع ${v} فيها أكثر من 6 خانات عشرية`, `Pay ${v} has more than 6 decimal places`);
    return x;
  });
}

function strips(raw, what) {
  if (!Array.isArray(raw) || raw.length === 0) throw err(`${what}: لا توجد بكرات`, `${what}: no reels`);
  if (raw.length > MAX_REELS) throw err(`${what}: الحد الأقصى ${MAX_REELS} بكرات`, `${what}: at most ${MAX_REELS} reels`);
  return raw.map((reel, i) => {
    if (!Array.isArray(reel)) throw err(`${what}: البكرة ${i + 1} ليست قائمة`, `${what}: reel ${i + 1} is not a list`);
    const s = reel.map((x) => String(x).trim()).filter((x) => x !== '');
    if (s.length === 0) throw err(`${what}: البكرة ${i + 1} فارغة`, `${what}: reel ${i + 1} is empty`);
    if (s.length > MAX_STOPS) throw err(`${what}: البكرة ${i + 1} أطول من ${MAX_STOPS}`, `${what}: reel ${i + 1} has more than ${MAX_STOPS} stops`);
    return s;
  });
}

// Validates a raw model and returns the normalized form used by the engines.
export function normalizeModel(raw) {
  if (!raw || typeof raw !== 'object') throw err('النموذج ليس كائن JSON', 'The model is not a JSON object');
  const rows = Number(raw.rows ?? 1);
  if (!Number.isInteger(rows) || rows < 1 || rows > MAX_ROWS) throw err(`عدد الصفوف يجب أن يكون بين 1 و${MAX_ROWS}`, `rows must be between 1 and ${MAX_ROWS}`);
  const baseStrips = strips(raw.reels, 'reels');
  const nReels = baseStrips.length;

  const symbols = [];
  const index = new Map();
  const idOf = (name) => {
    if (!index.has(name)) { index.set(name, symbols.length); symbols.push(name); }
    return index.get(name);
  };
  baseStrips.forEach((s) => s.forEach(idOf));

  const wildName = raw.wild ? String(typeof raw.wild === 'string' ? raw.wild : raw.wild.symbol || '').trim() : '';
  const scatterRaw = raw.scatter && typeof raw.scatter === 'object' ? raw.scatter : raw.scatter ? { symbol: raw.scatter } : null;
  const scatterName = scatterRaw ? String(scatterRaw.symbol || '').trim() : '';
  if (wildName && wildName === scatterName) throw err('لا يمكن أن يكون الرمز نفسه wild وscatter', 'The same symbol cannot be both wild and scatter');

  const paytable = raw.paytable || {};
  if (typeof paytable !== 'object' || Array.isArray(paytable)) throw err('جدول الدفع يجب أن يكون كائنًا: رمز ← قائمة دفع', 'paytable must be an object: symbol -> list of pays');
  const linePaysRaw = new Map();
  for (const [sym, pays] of Object.entries(paytable)) {
    const name = sym.trim();
    if (name === scatterName) continue; // scatter pays live under scatter.pays
    linePaysRaw.set(name, payArray(pays, nReels, name));
    idOf(name);
  }

  let fsStrips = null;
  let freeSpins = null;
  if (scatterRaw && scatterRaw.freeSpins) {
    const f = scatterRaw.freeSpins;
    const trigger = Number(f.trigger), spins = Number(f.spins);
    if (!Number.isInteger(trigger) || trigger < 1) throw err('عدد رموز التفعيل للفري سبين يجب أن يكون عددًا صحيحًا ≥ 1', 'freeSpins.trigger must be an integer ≥ 1');
    if (!Number.isInteger(spins) || spins < 1 || spins > 1000) throw err('عدد الفري سبين يجب أن يكون بين 1 و1000', 'freeSpins.spins must be between 1 and 1000');
    const mult = Fraction.of(f.multiplier ?? 1);
    if (mult.cmp(0) <= 0 || mult.cmp(10000) > 0) throw err('مضاعف الفري سبين يجب أن يكون بين 0 و10000', 'freeSpins.multiplier must be in (0, 10000]');
    if (f.reels) {
      fsStrips = strips(f.reels, 'freeSpins.reels');
      if (fsStrips.length !== nReels) throw err('بكرات الفري سبين يجب أن تكون بنفس عدد البكرات', 'freeSpins.reels must have the same number of reels');
      fsStrips.forEach((s) => s.forEach(idOf));
    }
    freeSpins = { trigger, spins, multiplier: mult, retrigger: Boolean(f.retrigger), sameReels: !fsStrips };
  }

  const wild = wildName ? idOf(wildName) : -1;
  const scatter = scatterName ? idOf(scatterName) : -1;
  if (wildName && !baseStrips.some((s) => s.includes(wildName))) throw err(`رمز الـwild "${wildName}" غير موجود في البكرات`, `Wild symbol "${wildName}" does not appear on the reels`);
  if (scatterName && !baseStrips.some((s) => s.includes(scatterName))) throw err(`رمز الـscatter "${scatterName}" غير موجود في البكرات`, `Scatter symbol "${scatterName}" does not appear on the reels`);

  const maxScatter = nReels * rows;
  const scatterPays = scatterRaw && scatterRaw.pays ? payArray(scatterRaw.pays, maxScatter, scatterName) : [];
  if (paytable[scatterName] && !(scatterRaw && scatterRaw.pays)) scatterPays.push(...payArray(paytable[scatterName], maxScatter, scatterName));
  const wildPays = raw.wild && typeof raw.wild === 'object' && raw.wild.pays ? payArray(raw.wild.pays, nReels, wildName) : (linePaysRaw.get(wildName) || []);
  if (freeSpins && freeSpins.trigger > maxScatter) throw err(`عدد التفعيل أكبر من أقصى عدد scatter ممكن (${maxScatter})`, `freeSpins.trigger exceeds the most scatters that can land (${maxScatter})`);

  let lines = raw.lines;
  if (lines === undefined || lines === null) lines = linePreset('middle', nReels, rows);
  if (typeof lines === 'string') lines = linePreset(lines, nReels, rows);
  if (!Array.isArray(lines) || lines.length === 0) throw err('لا توجد خطوط دفع', 'No paylines');
  if (lines.length > MAX_LINES) throw err(`الحد الأقصى ${MAX_LINES} خط`, `At most ${MAX_LINES} lines`);
  const lines0 = lines.map((line, i) => {
    if (!Array.isArray(line) || line.length !== nReels) throw err(`الخط ${i + 1} يجب أن يحدد صفًا لكل بكرة (${nReels})`, `Line ${i + 1} must give a row for each of the ${nReels} reels`);
    return line.map((r) => {
      const v = Number(r);
      if (!Number.isInteger(v) || v < 1 || v > rows) throw err(`الخط ${i + 1}: الصف ${r} خارج 1..${rows}`, `Line ${i + 1}: row ${r} is outside 1..${rows}`);
      return v - 1;
    });
  });

  // Exact integer units: one unit = line bet / scale, so every pay is an integer.
  let d = 0;
  const allPays = [...linePaysRaw.values(), wildPays, scatterPays];
  for (const arr of allPays) for (const p of arr) d = Math.max(d, decimals(p));
  const scale = 10 ** d;
  const L = lines0.length;
  const toUnits = (p, factor = 1) => Math.round(p * scale * factor);

  const linePays = symbols.map((name, id) => {
    const out = new Array(nReels + 1).fill(0);
    if (id === wild || id === scatter) return out;
    (linePaysRaw.get(name) || []).forEach((p, i) => { out[i + 1] = toUnits(p); });
    return out;
  });
  const wildUnits = new Array(nReels + 1).fill(0);
  wildPays.forEach((p, i) => { wildUnits[i + 1] = toUnits(p); });
  const scatterUnits = new Array(maxScatter + 1).fill(0);
  scatterPays.forEach((p, i) => { scatterUnits[i + 1] = toUnits(p, L); });
  // The last listed scatter pay applies to that count or more.
  for (let c = scatterPays.length + 1; c <= maxScatter && scatterPays.length; c++) scatterUnits[c] = scatterUnits[scatterPays.length];

  const reelIds = baseStrips.map((s) => Int32Array.from(s, (x) => index.get(x)));
  const fsReelIds = fsStrips ? fsStrips.map((s) => Int32Array.from(s, (x) => index.get(x))) : null;
  let combos = 1n;
  for (const s of reelIds) combos *= BigInt(s.length);
  if (combos > BigInt(Number.MAX_SAFE_INTEGER)) throw err('عدد التوليفات أكبر من 2^53؛ قلّل طول البكرات', 'More than 2^53 reel combinations; use shorter reels');
  if (fsReelIds) {
    let c = 1n;
    for (const s of fsReelIds) c *= BigInt(s.length);
    if (c > BigInt(Number.MAX_SAFE_INTEGER)) throw err('توليفات بكرات الفري سبين أكبر من 2^53', 'More than 2^53 free-spin reel combinations');
  }

  return {
    name: String(raw.name || ''),
    rows, nReels, symbols, wild, scatter, scale,
    lines: lines0,
    linePays, wildPays: wildUnits, scatterPays: scatterUnits,
    reels: reelIds, freeSpins: freeSpins && { ...freeSpins, reels: fsReelIds || reelIds },
    totalBetUnits: L * scale,
  };
}

export function parseModelJson(text) {
  let raw;
  try { raw = JSON.parse(text); } catch (e) { throw err('ملف JSON غير صالح: ' + e.message, 'Invalid JSON: ' + e.message); }
  return raw;
}

// Builds or updates a raw model from CSV files, recognized by their header:
//   reels:    reel1,reel2,...            (one stop per row; shorter reels leave cells empty)
//   paytable: symbol,type,1,2,3,...      (type: normal | wild | scatter; type is optional)
//   lines:    line,reel1,reel2,...       (1-based rows)
export function applyCsv(raw, text, fileName = '') {
  const rows = parseCsv(text);
  if (rows.length < 2) throw err(`الملف ${fileName} فارغ أو بلا بيانات`, `${fileName} has no data rows`);
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const out = { ...raw };
  if (header[0] === 'symbol' || header[0] === 'رمز' || header[0] === 'الرمز') {
    const typeCol = header[1] === 'type' || header[1] === 'نوع' ? 1 : -1;
    const counts = header.slice(typeCol === 1 ? 2 : 1).map((h) => parseInt(h, 10));
    if (counts.some((c) => !(c >= 1))) throw err('أعمدة جدول الدفع يجب أن تكون أعدادًا: 1,2,3...', 'Paytable columns must be counts: 1,2,3...');
    out.paytable = {};
    delete out.wild;
    const prevScatter = raw.scatter && typeof raw.scatter === 'object' ? raw.scatter : {};
    delete out.scatter;
    for (const r of rows.slice(1)) {
      const sym = (r[0] || '').trim();
      if (!sym) continue;
      const type = typeCol === 1 ? (r[1] || '').trim().toLowerCase() : 'normal';
      const pays = {};
      counts.forEach((c, i) => { const v = r[i + (typeCol === 1 ? 2 : 1)]; if (v !== undefined && v.trim() !== '') pays[c] = Number(v); });
      if (type === 'wild') out.wild = { symbol: sym, pays };
      else if (type === 'scatter') out.scatter = { ...prevScatter, symbol: sym, pays };
      else if (type === 'normal' || type === '') out.paytable[sym] = pays;
      else throw err(`نوع غير معروف "${type}" للرمز ${sym}`, `Unknown type "${type}" for ${sym}`);
    }
    return out;
  }
  if (header[0] === 'line' || header[0] === 'خط' || header[0] === 'الخط') {
    out.lines = rows.slice(1).filter((r) => r.some((c) => c.trim() !== '')).map((r) => r.slice(1).map((c) => parseInt(c, 10)));
    return out;
  }
  if (header.every((h) => /^(reel|بكرة)\s*\d*$/.test(h))) {
    const reels = header.map(() => []);
    for (const r of rows.slice(1)) header.forEach((_, i) => { const v = (r[i] || '').trim(); if (v) reels[i].push(v); });
    out.reels = reels;
    return out;
  }
  throw err(`لم أتعرف على نوع الملف ${fileName}: يجب أن يبدأ بـ reel1,... أو symbol,... أو line,...`, `Unrecognized CSV ${fileName}: the header must start with reel1,..., symbol,... or line,...`);
}

const splitList = (s) => s.split(/[\s,;|]+/).map((x) => x.trim()).filter(Boolean);

// The form edits the model as plain text blocks.
export function modelFromForm(f) {
  const reels = String(f.reels || '').split(/\r?\n/).map(splitList).filter((r) => r.length);
  const paytable = {};
  for (const line of String(f.paytable || '').split(/\r?\n/)) {
    const m = /^\s*([^:=,\s]+)\s*[:=,]?\s*(.*)$/.exec(line);
    if (!m || !m[1]) continue;
    paytable[m[1]] = splitList(m[2]).map(Number);
  }
  const raw = { name: f.name || '', rows: Number(f.rows), reels, paytable };
  const lineRows = String(f.lines || '').split(/\r?\n/).map(splitList).filter((r) => r.length);
  if (f.linePreset && f.linePreset !== 'custom') raw.lines = f.linePreset;
  else if (lineRows.length) raw.lines = lineRows.map((r) => r.map(Number));
  if (f.wild) { raw.wild = { symbol: f.wild.trim(), pays: paytable[f.wild.trim()] || [] }; delete paytable[f.wild.trim()]; }
  if (f.scatter) {
    const s = f.scatter.trim();
    raw.scatter = { symbol: s, pays: paytable[s] || [] };
    delete paytable[s];
    if (f.fsEnabled) {
      raw.scatter.freeSpins = { trigger: Number(f.fsTrigger), spins: Number(f.fsSpins), multiplier: String(f.fsMultiplier || 1), retrigger: Boolean(f.fsRetrigger) };
      const fsReels = String(f.fsReels || '').split(/\r?\n/).map(splitList).filter((r) => r.length);
      if (fsReels.length) raw.scatter.freeSpins.reels = fsReels;
    }
  }
  return raw;
}

export function formFromModel(raw) {
  const payRow = (sym, pays) => {
    const arr = Array.isArray(pays) ? pays : Object.entries(pays || {}).reduce((a, [k, v]) => { a[parseInt(k, 10) - 1] = v; return a; }, []);
    return sym + ': ' + Array.from(arr, (v) => v ?? 0).join(' ');
  };
  const pt = Object.entries(raw.paytable || {}).map(([s, p]) => payRow(s, p));
  const wild = raw.wild ? (typeof raw.wild === 'string' ? raw.wild : raw.wild.symbol) : '';
  if (raw.wild && raw.wild.pays) pt.push(payRow(wild, raw.wild.pays));
  const sc = raw.scatter && typeof raw.scatter === 'object' ? raw.scatter : raw.scatter ? { symbol: raw.scatter } : null;
  if (sc && sc.pays) pt.push(payRow(sc.symbol, sc.pays));
  const fs = sc && sc.freeSpins;
  return {
    name: raw.name || '',
    rows: raw.rows || 1,
    reels: (raw.reels || []).map((r) => r.join(' ')).join('\n'),
    paytable: pt.join('\n'),
    linePreset: typeof raw.lines === 'string' ? raw.lines : raw.lines ? 'custom' : 'middle',
    lines: Array.isArray(raw.lines) ? raw.lines.map((l) => l.join(' ')).join('\n') : '',
    wild: wild || '',
    scatter: sc ? sc.symbol : '',
    fsEnabled: Boolean(fs),
    fsTrigger: fs ? fs.trigger : 3,
    fsSpins: fs ? fs.spins : 10,
    fsMultiplier: fs ? String(fs.multiplier ?? 1) : '1',
    fsRetrigger: fs ? Boolean(fs.retrigger) : false,
    fsReels: fs && fs.reels ? fs.reels.map((r) => r.join(' ')).join('\n') : '',
  };
}

// Stable JSON (sorted keys) so the same model always hashes the same way.
export function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}
