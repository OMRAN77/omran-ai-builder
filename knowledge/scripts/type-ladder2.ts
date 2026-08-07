// سلّم نصّي v415 — المرحلة الأولى: الطرفان (العناوين ↑ والتفاصيل ↑) + أوزان الصغير
// DRY=1 تقرير فقط | DRY=0 يكتب /tmp/index.ladder.html
import { readFileSync, writeFileSync } from 'node:fs';
const SRC = '/tasklet/agent/home/design/deploy/index.html';
const DRY = process.env.DRY !== '0';
const txt = readFileSync(SRC, 'utf8');

const TIER: Record<number,string> = { 1:'21px', 2:'17px', 3:'14px', 4:'12.5px', 5:'11.5px' };
const SIZE_TIERS = new Set((process.env.SIZE_TIERS ?? '1,2,5').split(',').filter(Boolean).map(Number));
const WEIGHT_TIERS = new Set((process.env.WEIGHT_TIERS ?? '1,2,4,5').split(',').filter(Boolean).map(Number));

function tierOf(px:number){ if(px>=26) return 0; if(px>=18) return 1; if(px>=15) return 2; if(px>=13) return 3; if(px>=12) return 4; return 5; }

// ما لا يُمسّ: أيقونات، إيموجي، مقياس تكبير الخط، حالات نصّ لا يقبل الالتفاف
const BLOCK_RE = /fs-small|fs-large|fs-xlarge|emoji|\bem\b|omSpark|langFlag|btnAttach|btnEmoji|btnMic|btnVoiceChat|btnStop|mini-mic|prov-name|omNavBtn|btnTimeMachine|videoMakerHeroClear|authTogglePassBtn|authRecoveryCodeDisplay|vmk-card i|eduCardFace|closeCheckout|btnMahaCamera|btnMahaEndCall|btnCloseTemplates|btnClosePreviewTpl|bg3dEmoji|hist-thumb/i;
function isIconBox(body:string){
  const w = body.match(/(?:^|[;\s])width:\s*([0-9.]+)px/), h = body.match(/(?:^|[;\s])height:\s*([0-9.]+)px/);
  return !!(w && h && parseFloat(w[1])<=64 && parseFloat(h[1])<=64);
}
function isEmojiContent(after:string){
  const gt = after.indexOf('>'); if (gt<0 || gt>400) return false;
  const inner = after.slice(gt+1, gt+9);
  return /^[\s]*[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{20E3}]/u.test(inner);
}

const NO_WEIGHT_RE = /::after|::before|input\[type=checkbox\]|prov-cell/;
const KEEP_BOLD_RE = /eduPrimary|expGo|xmGo|xmFCard|acctReferralBonus|premium-deduct-fly|eduStreak|omranNewChatBtn|appFullCleanup/;
type Ch = { line:number; kind:'size'|'weight'; from:string; to:string; ctx:string };
const chs: Ch[] = [];
const lo:number[]=[0]; for(let i=0;i<txt.length;i++) if(txt[i]==='\n') lo.push(i+1);
const lineAt=(i:number)=>{let a=0,b=lo.length-1;while(a<b){const m=(a+b+1)>>1; if(lo[m]<=i)a=m;else b=m-1;}return a+1;};

function proc(body:string, sel:string, abs:number, after:string){
  let out = body;
  const fsM = body.match(/font-size:\s*([0-9.]+)px/);
  const skip = BLOCK_RE.test(sel) || isIconBox(body) || isEmojiContent(after);
  let tier = 0;
  if (fsM) {
    const px = parseFloat(fsM[1]); tier = tierOf(px);
    if (tier && SIZE_TIERS.has(tier) && !skip) {
      const to = TIER[tier];
      out = out.replace(/font-size:\s*[0-9.]+px/, `font-size: var(--fs-${tier})`);
      if (to !== fsM[1]+'px') chs.push({line:lineAt(abs),kind:'size',from:fsM[1]+'px',to:`t${tier}=${to}`,ctx:sel.slice(-70)});
    }
  }
  const fwM = body.match(/font-weight:\s*([0-9]{3}|bold|normal|bolder|lighter)/);
  if (fwM && tier && WEIGHT_TIERS.has(tier) && !skip && !NO_WEIGHT_RE.test(sel)) {
    const raw=fwM[1];
    const num = raw==='bold'?700 : raw==='normal'?400 : raw==='bolder'?700 : raw==='lighter'?300 : parseInt(raw);
    let target = num;
    const titleish = /<h[1-4]|<b[\s>]|<strong|title|Title|head|Head|hero|logo|brand|greet|welcome|Name|-name/.test(sel) && !/subtitle|subTitle|sub-title|caption|hint|Hint|desc|Desc|note|Note|disclaimer/i.test(sel);
    if (tier===1||tier===2) target = num<=400 ? 400 : 700;          // العناوين: عريض حقيقي
    else if (tier===3) target = num<=400 ? 400 : (titleish ? 700 : 500); // الأساسي: عريض للعنوان فقط
    else if (tier===4||tier===5) target = num<=400 ? 400 : (titleish ? 700 : 500); // الصغير: متوسط إلا العنوان
    if (KEEP_BOLD_RE.test(sel) && num >= 500) target = 700;          // أزرار رئيسية وأرقام تحذير
    const v = target===700?'--w-bold': target===500?'--w-mid':'--w-body';
    out = out.replace(/font-weight:\s*(?:[0-9]{3}|bold|normal|bolder|lighter)/, `font-weight: var(${v})`);
    if (num!==target) chs.push({line:lineAt(abs),kind:'weight',from:raw,to:String(target),ctx:sel.slice(-70)});
  }
  return out;
}

const styleRanges:[number,number][]=[];
for (const m of txt.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) styleRanges.push([m.index!+m[0].indexOf('>')+1, m.index!+m[0].length-8]);
const edits:{s:number;e:number;t:string}[]=[];
for (const [s,e] of styleRanges) {
  const css = txt.slice(s,e);
  for (const r of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/font-(size|weight)/.test(r[2])) continue;
    const bs = s + r.index! + r[1].length + 1;
    const nb = proc(r[2], r[1].trim(), bs, '');
    if (nb!==r[2]) edits.push({s:bs,e:bs+r[2].length,t:nb});
  }
}
for (const m of txt.matchAll(/style="([^"]*)"/g)) {
  const s = m.index!+7, e = s+m[1].length;
  if (styleRanges.some(([a,b])=>s>=a&&s<=b)) continue;
  if (!/font-(size|weight)/.test(m[1])) continue;
  const raw = txt.slice(Math.max(0,m.index!-300), m.index!);
  const lt = raw.lastIndexOf('<');
  const tail = txt.slice(e, e+420);
  const gt = tail.indexOf('>');
  const ctx = (lt >= 0 ? raw.slice(lt) : raw) + (gt >= 0 ? tail.slice(0, gt) : '');
  const nb = proc(m[1], ctx, s, tail);
  if (nb!==m[1]) edits.push({s,e,t:nb});
}
let work = txt;
edits.sort((a,b)=>b.s-a.s);
for (const ed of edits) work = work.slice(0,ed.s)+ed.t+work.slice(ed.e);

const oldL=txt.split('\n'), newL=work.split('\n');
let d=0; for(let i=0;i<Math.max(oldL.length,newL.length);i++) if(oldL[i]!==newL[i]) d++;
const sz=chs.filter(c=>c.kind==='size'), wt=chs.filter(c=>c.kind==='weight');
console.log(`كتل: ${edits.length} | مقاس: ${sz.length} | وزن: ${wt.length} | أسطر diff: ${d}`);
const mp:Record<string,number>={}; for(const c of sz) mp[`${c.from}→${c.to}`]=(mp[`${c.from}→${c.to}`]??0)+1;
console.log('مقاسات:', JSON.stringify(mp));
const wp:Record<string,number>={}; for(const c of wt) wp[`${c.from}→${c.to}`]=(wp[`${c.from}→${c.to}`]??0)+1;
console.log('أوزان:', JSON.stringify(wp));
if (process.env.LIST) for (const c of chs) console.log(` L${c.line} ${c.kind} ${c.from}→${c.to} :: ${c.ctx.replace(/\s+/g,' ')}`);
if (!DRY) { writeFileSync('/tmp/index.ladder.html', work); console.log('كُتب /tmp/index.ladder.html'); }
