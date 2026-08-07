// gold-scan.ts — READ-ONLY scan for gold/warm-yellow color usage in a source tree.
// Usage: bun gold-scan.ts <rootDir> <outJsonPath>
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2] || '/tmp/vc/src';
const outPath = process.argv[3] || '/tmp/gold-scan-result.json';

const TEXT_EXT = new Set(['.html', '.css', '.js', '.json', '.svg', '.xml', '.txt', '.md']);

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

function isTextFile(path: string): boolean {
  const ext = path.slice(path.lastIndexOf('.'));
  return TEXT_EXT.has(ext);
}

// --- color parsing helpers ---
function hexToRgb(hex: string): [number, number, number, number] | null {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    return [r, g, b, 255];
  }
  if (hex.length === 4) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    const a = parseInt(hex[3] + hex[3], 16);
    return [r, g, b, a];
  }
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return [r, g, b, 255];
  }
  if (hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = parseInt(hex.slice(6, 8), 16);
    return [r, g, b, a];
  }
  return null;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s * 100, l * 100];
}

function isGoldHsl(h: number, s: number, l: number): boolean {
  return h >= 35 && h <= 65 && s >= 30 && l >= 25 && l <= 75;
}

interface Match {
  file: string;
  line: number;
  value: string;
  snippet: string;
  kind: 'hex' | 'rgb' | 'hsl' | 'keyword' | 'css-var-name';
  hsl?: [number, number, number];
}

const KEYWORDS = ['gold', 'Gold', 'GOLD', 'golden', 'Golden', 'goldenrod', 'amber', 'Amber',
  'ذهبي', 'ذهبيّ', 'الذهبي', 'الذهبيّ', 'صفراء', 'أصفر'];

const hexRe = /#[0-9a-fA-F]{3,8}\b/g;
const rgbRe = /rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(?:,\s*[\d.]+%?\s*)?\)/g;
const hslRe = /hsla?\(\s*[\d.]+\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*(?:,\s*[\d.]+%?\s*)?\)/g;
const cssVarNameRe = /--[\w-]*(gold|amber|yellow)[\w-]*/gi;

const matches: Match[] = [];

function snippet(line: string): string {
  const s = line.trim();
  return s.length > 120 ? s.slice(0, 117) + '...' : s;
}

const allFiles = walk(root).filter(isTextFile);

for (const file of allFiles) {
  const rel = relative(root, file);
  let content: string;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    // keywords
    for (const kw of KEYWORDS) {
      if (line.includes(kw)) {
        matches.push({ file: rel, line: lineNo, value: kw, snippet: snippet(line), kind: 'keyword' });
      }
    }

    // css var names mentioning gold/amber/yellow
    let m: RegExpExecArray | null;
    cssVarNameRe.lastIndex = 0;
    while ((m = cssVarNameRe.exec(line))) {
      matches.push({ file: rel, line: lineNo, value: m[0], snippet: snippet(line), kind: 'css-var-name' });
    }

    // hex colors
    hexRe.lastIndex = 0;
    while ((m = hexRe.exec(line))) {
      const hex = m[0];
      const rgb = hexToRgb(hex);
      if (!rgb) continue;
      const [r, g, b, a] = rgb;
      if (a === 0) continue; // fully transparent
      const hsl = rgbToHsl(r, g, b);
      if (isGoldHsl(...hsl)) {
        matches.push({ file: rel, line: lineNo, value: hex, snippet: snippet(line), kind: 'hex', hsl });
      }
    }

    // rgb()/rgba()
    rgbRe.lastIndex = 0;
    while ((m = rgbRe.exec(line))) {
      const inner = m[0].match(/[\d.]+%?/g) || [];
      if (inner.length < 3) continue;
      const parse = (v: string) => v.endsWith('%') ? parseFloat(v) * 2.55 : parseFloat(v);
      const r = parse(inner[0]), g = parse(inner[1]), b = parse(inner[2]);
      const a = inner[3] !== undefined ? (inner[3].endsWith('%') ? parseFloat(inner[3]) / 100 : parseFloat(inner[3])) : 1;
      if (a === 0) continue;
      const hsl = rgbToHsl(r, g, b);
      if (isGoldHsl(...hsl)) {
        matches.push({ file: rel, line: lineNo, value: m[0], snippet: snippet(line), kind: 'rgb', hsl });
      }
    }

    // hsl()/hsla()
    hslRe.lastIndex = 0;
    while ((m = hslRe.exec(line))) {
      const inner = m[0].match(/[\d.]+%?/g) || [];
      if (inner.length < 3) continue;
      const h = parseFloat(inner[0]);
      const s = parseFloat(inner[1]);
      const l = parseFloat(inner[2]);
      const a = inner[3] !== undefined ? (inner[3].endsWith('%') ? parseFloat(inner[3]) / 100 : parseFloat(inner[3])) : 1;
      if (a === 0) continue;
      if (isGoldHsl(h, s, l)) {
        matches.push({ file: rel, line: lineNo, value: m[0], snippet: snippet(line), kind: 'hsl', hsl: [h, s, l] });
      }
    }
  }
}

console.log(`Scanned ${allFiles.length} files, found ${matches.length} matches.`);
require('node:fs').writeFileSync(outPath, JSON.stringify(matches, null, 2));
console.log(`Written to ${outPath}`);
