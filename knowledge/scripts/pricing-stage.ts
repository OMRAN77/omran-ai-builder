// يُجهّز رقعات الأسعار في نسخة معزولة ويعدّ الأسطر المتغيّرة بدقّة.
// لا يلمس الإنتاج ولا `main`. تشغيل: bun scripts/pricing-stage.ts
import { $ } from "bun";
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync } from "node:fs";

const SRC = "/tmp/vc/src";
const OUT = "/tasklet/agent/home/patches/pricing";
const work = "/tmp/pfix";
if (existsSync(work)) await $`rm -rf ${work}`;
mkdirSync(work, { recursive: true });
cpSync(SRC, work, { recursive: true });

const files = (await $`cd ${work} && grep -rl "checkoutPlanLabelBasic|pricingBasicTitle" -E --include="*.js" --include="*.html" . | grep -v node_modules`.text())
  .trim().split("\n").map(s => s.replace(/^\.\//, ""));

type Res = { file: string; lines: number };
function patch(rel: string, fn: (l: string) => string): Res {
  const p = `${work}/${rel}`;
  const before = readFileSync(p, "utf8").split("\n");
  const after = before.map(fn);
  let n = 0;
  for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) n++;
  if (n) writeFileSync(p, after.join("\n"));
  return { file: rel, lines: n };
}

// ── الخيار (أ): رفع الخادم + ملصق الدفع إلى ١٠$/٢٠$ ──
const raiseLabel = (l: string) => {
  if (/checkoutPlanLabelBasic\s*["']?\s*:\s*["']/.test(l))
    return l.replace(/(\$\s?)5\b/g, "$110").replace(/\b5(\s?\$)/g, "10$1");
  if (/checkoutPlanLabelPro\s*["']?\s*:\s*["']/.test(l))
    return l.replace(/(\$\s?)15\b/g, "$120").replace(/\b15(\s?\$)/g, "20$1");
  return l;
};
const raiseServer = (l: string) =>
  l.replace(/amount:\s*500\b/, "amount: 1000").replace(/amount:\s*1500\b/, "amount: 2000")
   .replace(/'5\.00'/, "'10.00'").replace(/'15\.00'/, "'20.00'")
   .replace(/خطة 5\$/, "خطة 10$").replace(/خطة 15\$/, "خطة 20$");

const A: Res[] = [];
for (const f of ["api/_lib/create-checkout-session.js", "api/_lib/paypal-order.js"]) A.push(patch(f, raiseServer));
for (const f of files) A.push(patch(f, raiseLabel));

// ── الخيار (ب): تنزيل البطاقة إلى ٥$/١٥$ (على نسخة نظيفة) ──
const work2 = "/tmp/pfix-b";
if (existsSync(work2)) await $`rm -rf ${work2}`;
cpSync(SRC, work2, { recursive: true });
const lowerCard = (l: string) => {
  if (/pricingBasicTitle/.test(l)) return l.replace(/(\$\s?)10\b/g, "$15").replace(/\b10(\s?\$)/g, "5$1");
  if (/pricingProTitle/.test(l)) return l.replace(/(\$\s?)20\b/g, "$115").replace(/\b20(\s?\$)/g, "15$1");
  return l;
};
const B: Res[] = [];
for (const f of files) {
  const p = `${work2}/${f}`;
  const before = readFileSync(p, "utf8").split("\n");
  const after = before.map(lowerCard);
  let n = 0; for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) n++;
  if (n) writeFileSync(p, after.join("\n"));
  B.push({ file: f, lines: n });
}

const sum = (r: Res[]) => r.reduce((a, b) => a + b.lines, 0);
console.log("── الخيار أ (خادم+دفع → 10/20) ──");
for (const r of A) if (r.lines) console.log(`  ${r.lines}\t${r.file}`);
console.log(`  المجموع: ${sum(A)} سطرًا في ${A.filter(r=>r.lines).length} ملفًّا`);
console.log("── الخيار ب (بطاقة → 5/15) ──");
for (const r of B) if (r.lines) console.log(`  ${r.lines}\t${r.file}`);
console.log(`  المجموع: ${sum(B)} سطرًا في ${B.filter(r=>r.lines).length} ملفًّا`);

// حفظ الملفّات المتغيّرة فقط
for (const [tag, list, root] of [["A", A, work], ["B", B, work2]] as const) {
  for (const r of list) if (r.lines) {
    const dst = `${OUT}/${tag}/${r.file}`;
    mkdirSync(dst.split("/").slice(0, -1).join("/"), { recursive: true });
    cpSync(`${root}/${r.file}`, dst);
  }
}
console.log(`\n✔ محفوظ في ${OUT}/A و ${OUT}/B`);
