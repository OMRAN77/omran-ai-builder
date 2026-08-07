// سلّم نصّي — يحوّل 28 مقاسًا و6 أوزان إلى سلّم واحد. DRY=1 للتقرير فقط
import { readFileSync, writeFileSync } from 'node:fs';
const SRC = '/tasklet/agent/home/design/deploy/index.html';
const DRY = process.env.DRY !== '0';
const txt = readFileSync(SRC, 'utf8');

// السلّم
const TIER = { 1: '21px', 2: '17px', 3: '14px', 4: '12.5px', 5: '11.5px' } as const;
const ACTIVE = new Set((process.env.TIERS ?? '1,2,3,4,5').split(',').map(Number));
const VARIZE_UNCHANGED = process.env.VARIZE !== '0';
function tierOf(px: number): 1|2|3|4|5|0 {
  if (px >= 26) return 0;            // مقاسات عرض/أيقونات — لا تُمسّ
  if (px >= 18) return 1;
  if (px >= 15) return 2;
  if (px >= 13) return 3;
  if (px >= 12) return 4;
  return 5;
}
type Change = { line:number; kind:string; from:string; to:string };
const changes: Change[] = [];
const lineOffsets:number[] = [0];
for (let i=0;i<txt.length;i++) if (txt[i]==='\n') lineOffsets.push(i+1);
const lineAt = (idx:number) => { let lo=0,hi=lineOffsets.length-1; while(lo<hi){const m=(lo+hi+1)>>1; if(lineOffsets[m]<=idx) lo=m; else hi=m-1;} return lo+1; };

// يعالج كتلة تصريحات (نص بين {} أو داخل style="")
function processBlock(body:string, selector:string, absStart:number): string {
  const fsM = body.match(/font-size:\s*([0-9.]+)px/);
  const fwM = body.match(/font-weight:\s*([0-9]{3}|bold|normal|bolder|lighter)/);
  let out = body;
  let tier: number = 0;
  if (fsM) {
    const px = parseFloat(fsM[1]);
    tier = tierOf(px);
    if (tier !== 0 && ACTIVE.has(tier)) {
      const to = TIER[tier as 1|2|3|4|5];
      const moved = to !== fsM[1]+'px';
      if (moved || VARIZE_UNCHANGED) {
        out = out.replace(/font-size:\s*[0-9.]+px/, `font-size: var(--fs-${tier})`);
        if (moved) changes.push({ line: lineAt(absStart), kind:'size', from: fsM[1]+'px', to:`--fs-${tier} (${to})` });
      }
    }
  }
  if (fwM) {
    const raw = fwM[1];
    const num = raw==='bold'?700: raw==='normal'?400: raw==='bolder'?700: raw==='lighter'?400: parseInt(raw);
    // قاعدة الوزن: العناوين الكبيرة وحدها تبقى 700
    const titleish = /title|head|hero|logo|brand|name|h1|h2|h3|greet|welcome/i.test(selector);
    let target: number;
    if (num <= 400) target = 400;
    else if (tier === 1 || tier === 2) target = 700;
    else if (tier === 3) target = titleish ? 700 : 500;
    else if (tier === 4 || tier === 5) target = 500;
    else target = titleish ? 700 : 500;   // بلا مقاس معروف
    const varName = target===700?'--w-bold': target===500?'--w-mid':'--w-body';
    if (num !== target || VARIZE_UNCHANGED) out = out.replace(/font-weight:\s*(?:[0-9]{3}|bold|normal|bolder|lighter)/, `font-weight: var(${varName})`);
    if (num !== target) changes.push({ line: lineAt(absStart), kind:'weight', from: raw, to: String(target) });
  }
  return out;
}

// 1) كتل <style>
let result = '';
let pos = 0;
const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/g;
let m: RegExpExecArray | null;
const styleRanges: [number,number][] = [];
while ((m = styleRe.exec(txt))) styleRanges.push([m.index + m[0].indexOf('>')+1, m.index + m[0].length - '</style>'.length]);

let work = txt;
// نعالج من الآخر للأول حتى لا تتغيّر الفهارس
const edits: {start:number; end:number; text:string}[] = [];
for (const [s,e] of styleRanges) {
  const css = txt.slice(s,e);
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let r: RegExpExecArray | null;
  while ((r = ruleRe.exec(css))) {
    const selector = r[1].trim();
    const bodyStart = s + r.index + r[1].length + 1;
    if (!/font-(size|weight)/.test(r[2])) continue;
    const nb = processBlock(r[2], selector, bodyStart);
    if (nb !== r[2]) edits.push({ start: bodyStart, end: bodyStart + r[2].length, text: nb });
  }
}
// 2) style="" داخل HTML
const inlineRe = /style="([^"]*)"/g;
while ((m = inlineRe.exec(txt))) {
  const s = m.index + 'style="'.length, e = s + m[1].length;
  if (styleRanges.some(([a,b]) => s>=a && s<=b)) continue;
  if (!/font-(size|weight)/.test(m[1])) continue;
  // السياق: 200 حرف قبل الوسم لاستخراج class/id
  const ctx = txt.slice(Math.max(0,m.index-260), m.index);
  const nb = processBlock(m[1], ctx, s);
  if (nb !== m[1]) edits.push({ start: s, end: e, text: nb });
}
edits.sort((a,b)=>b.start-a.start);
for (const ed of edits) work = work.slice(0,ed.start) + ed.text + work.slice(ed.end);

const touchedLines = new Set(changes.map(c=>c.line));
const bySize = changes.filter(c=>c.kind==='size');
const byWeight = changes.filter(c=>c.kind==='weight');
console.log('كتل معدّلة:', edits.length);
console.log('تغيير مقاس:', bySize.length, '| تغيير وزن:', byWeight.length);
console.log('أسطر ملموسة (قيمة تغيّرت فعلًا):', touchedLines.size);
// كل الأسطر التي تغيّر نصّها
const oldL = txt.split('\n'), newL = work.split('\n');
let diffLines = 0;
for (let i=0;i<Math.max(oldL.length,newL.length);i++) if (oldL[i]!==newL[i]) diffLines++;
console.log('أسطر مختلفة في الفرق (diff):', diffLines);
const sizeMap: Record<string,Record<string,number>> = {};
for (const c of bySize) { (sizeMap[c.from] ??= {}); sizeMap[c.from][c.to]=(sizeMap[c.from][c.to]??0)+1; }
console.log('\n--- خريطة المقاسات ---');
for (const k of Object.keys(sizeMap).sort((a,b)=>parseFloat(a)-parseFloat(b))) console.log(' ', k, '→', JSON.stringify(sizeMap[k]));
const wMap: Record<string,number> = {};
for (const c of byWeight) { const k=`${c.from}→${c.to}`; wMap[k]=(wMap[k]??0)+1; }
console.log('--- خريطة الأوزان ---'); console.log(' ', JSON.stringify(wMap));
if (!DRY) { writeFileSync('/tmp/index.ladder.html', work); console.log('\nكُتب: /tmp/index.ladder.html'); }

// تقرير المواضع الحسّاسة
if (process.env.INSPECT) {
  const lines = txt.split('\n');
  const risky = changes.filter(c=>c.kind==='size' && (c.from==='15px'||c.from==='22px'||c.from==='18px'||parseFloat(c.from)<11));
  for (const c of risky) {
    const l = (lines[c.line-1]||'').trim().replace(/\s+/g,' ');
    console.log(`L${c.line} ${c.from}→${c.to.split(' ')[0]} :: ${l.slice(0,150)}`);
  }
}
