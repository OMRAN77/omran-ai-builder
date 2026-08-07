// مسبار المرحلة ٣ — يحفظ الناتج بنفسه (لا يعتمد على destinationPath الذي لا يُنشئ ملفًّا للنواتج الصغيرة).
// الاستخدام: bun scripts/p3-probe-any.ts <probe.js> <tag>=<url> [tag=url...]
import { invokeTool } from '@tasklet/tools/v2';
import { readFileSync, writeFileSync } from 'node:fs';
const [, , probePath, ...urls] = process.argv;
const code = readFileSync(probePath, 'utf8');
const D = '/tasklet/agent/home/audit/p3';
const dig = (v: any): any => {                          // ابحث عن أوّل كائن يشبه ناتج المسبار
  if (v && typeof v === 'object') {
    if (!Array.isArray(v) && ['bodyKids','order','modals','els','prem','swallow'].some(k => k in v)) return v;
    for (const x of Array.isArray(v) ? v : Object.values(v)) { const f = dig(x); if (f) return f; }
  }
  if (typeof v === 'string') { try { return dig(JSON.parse(v)); } catch { return null; } }
  return null;
};
for (const u of urls) {
  const [tag, url] = u.split('=');
  const r = await invokeTool({ toolName: 'browser', args: { actions: [
    { navigate: { url, duration_seconds: 14 } },
    { evaluate: { expression: "localStorage.setItem('aiapp_lang','ar'); localStorage.setItem('panelWidthSidebar','250'); localStorage.removeItem('tickerCollapsed'); localStorage.removeItem('waCollapsed'); 'pinned'" } },
    { navigate: { url, duration_seconds: 14 } },
    { evaluate: { expression: code } },
  ] } });
  if (!r.ok) { console.log(tag, 'FAIL', r.error); continue; }
  const raw = await r.json();
  const found = dig(raw);
  const out = `${D}/${tag}.json`;
  writeFileSync(out, JSON.stringify(found ?? raw, null, 1));
  console.log(tag, found ? `ok → ${out}` : `⚠ لم أجد ناتج المسبار → حُفظ الردّ الخام في ${out}`);
}
