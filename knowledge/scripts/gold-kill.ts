// قتل الذهبيّ من كلّ الواجهة — يبقى في الشعار (صورة) وحده.
// أمر عمران ٧ أغسطس ٢٠٢٦. لا يمسّ تخطيط الجوّال.
import { readFileSync, writeFileSync } from 'node:fs';

const R = '/tmp/vc/src/';
const N = { accent: '#6b7280', rgb: '107,114,128', light: '#9ca3af', deep: '#4b5563', silver: '#c9ced8' };

// أسطر محميّة: نصوص موجّهة للمستخدم (لوحات ألوان يختارها هو) لا واجهتنا
const SKIP: Record<string, number[]> = { 'js/app.bundle.js': [7201], 'js/design-gen.js': [3] };

const CSS = ['css/tokens.css', 'css/modules.css', 'css/redesign.css'];
const JS = ['js/themes.js', 'js/app.bundle.js', 'js/partials-core.js', 'js/edu.js', 'js/exp.js', 'js/ui-wiring.js'];
const HTML = ['index.html'];

// ١) تعريفات التوكن — استبدال صريح (وإلّا صارت ذاتيّة المرجع)
const EXACT: [string, string, string][] = [
  ['css/tokens.css', '--accent:#d4af37; --accent-rgb:212,175,55; --accent-light:#e8c766; --accent2:#e8c766;',
    `--accent:${N.accent}; --accent-rgb:${N.rgb}; --accent-light:${N.light}; --accent2:${N.light};`],
  ['css/redesign.css', '--omGold:#d4af37; --omGoldSoft:rgba(212,175,55,.32);',
    `--omGold:${N.accent}; --omGoldSoft:rgba(var(--accent-tint-rgb),.32);`],
  ['js/themes.js', "gold:['#d4af37','212,175,55','#e8c766'],purple:['#d4af37','124,92,255','#e8c766']",
    `gold:['${N.accent}','${N.rgb}','${N.light}'],purple:['#7c5cff','124,92,255','#a78bfa']`],
  ['js/themes.js', "['#ffffff','#d4af37',", `['#ffffff','${N.silver}',`],
];

const report: string[] = [];
const touched = new Set<string>();

for (const [f, from, to] of EXACT) {
  const p = R + f; const s = readFileSync(p, 'utf8');
  if (!s.includes(from)) { report.push(`✗ لم يُعثر على النصّ الدقيق في ${f}: ${from.slice(0, 40)}…`); continue; }
  writeFileSync(p, s.split(from).join(to)); touched.add(f);
  report.push(`✓ تعريف: ${f}`);
}

// ٢) كنس البقيّة سطرًا سطرًا
const sweep = (f: string, isCss: boolean) => {
  const p = R + f; const lines = readFileSync(p, 'utf8').split('\n');
  const skip = new Set(SKIP[f] || []); let n = 0;
  const out = lines.map((ln, i) => {
    if (skip.has(i + 1)) return ln;
    if (!/#d4af37|#D4AF37|#e8c766|#8a6d1f|212, ?175, ?55/.test(ln)) return ln;
    let v = ln;
    if (isCss) {
      v = v.replace(/rgba\(212, ?175, ?55,/g, 'rgba(var(--accent-tint-rgb),')
        .replace(/#d4af37|#D4AF37/g, N.accent).replace(/#e8c766/g, N.light);
    } else {
      v = v.replace(/rgba\(212, ?175, ?55,/g, `rgba(${N.rgb},`)
        .replace(/#d4af37|#D4AF37/g, N.accent).replace(/#e8c766/g, N.light).replace(/#8a6d1f/g, N.deep);
    }
    if (v !== ln) n++;
    return v;
  });
  if (n) { writeFileSync(p, out.join('\n')); touched.add(f); }
  report.push(`${n ? '✓' : '·'} ${f}: ${n} سطرًا`);
};

for (const f of [...CSS, ...HTML]) sweep(f, true);
for (const f of JS) sweep(f, false);

report.push('', '=== المتبقّي (محميّ عمدًا) ===');
for (const [f, ls] of Object.entries(SKIP)) {
  const lines = readFileSync(R + f, 'utf8').split('\n');
  for (const l of ls) report.push(`${f}:${l} → ${lines[l - 1].slice(0, 70).trim()}…`);
}
report.push('', 'ملفّات مُعدَّلة: ' + [...touched].join(' · '));
console.log(report.join('\n'));
