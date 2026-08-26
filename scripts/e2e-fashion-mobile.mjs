// scripts/e2e-fashion-mobile.mjs — ما يراه هاتف حقيقيّ نظيف على الإنتاج:
// متصفّح بمقاس جوال (390×844) يفتح استوديو الأزياء ويقيس بطاقات الأنماط
// المصوّرة: موجودة؟ كم بطاقة؟ الصور حُمّلت فعلًا؟ النقر يبدّل الاختيار الذهبي؟
//
//   node scripts/e2e-fashion-mobile.mjs [BASE_URL]
import { chromium } from 'playwright';

const BASE = (process.argv[2] || 'https://omran-ai-builder.vercel.app').replace(/\/$/, '');
const t0 = Date.now();
const el = () => String(Date.now() - t0).padStart(6, ' ') + 'ms';
let fail = 0;
const check = (ok, label) => { console.log(el(), (ok ? '✓ ' : '✗ ') + label); if (!ok) fail = 1; };

const b = await chromium.launch();
const page = await (await b.newContext({
  viewport: { width: 390, height: 844 },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  isMobile: true, hasTouch: true,
})).newPage();

await page.goto(BASE + '/index.html', { waitUntil: 'load' });
await page.waitForTimeout(4000);

await page.evaluate(() => {
  for (const id of ['introTourOverlay', 'privacyConsent']) { const n = document.getElementById(id); if (n) n.remove(); }
  const m = document.querySelector('#fashionAiModal');
  if (m) m.style.display = 'flex';
});

const s = await page.evaluate(() => {
  const grid = document.querySelector('#fashionStyleCards');
  const cards = grid ? grid.querySelectorAll('[data-style-card]') : [];
  const imgs = grid ? Array.from(grid.querySelectorAll('img')) : [];
  return {
    modal: !!document.querySelector('#fashionAiModal'),
    grid: !!grid,
    cards: cards.length,
    imgsLoaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
    selectHidden: (document.querySelector('#fashionAiStyle') || {}).offsetParent === null,
    bundle: (Array.from(document.scripts).find((x) => /app\.bundle\.js/.test(x.src)) || { src: '' }).src.split('v=')[1] || '?',
  };
});
console.log(el(), 'الحزمة على الإنتاج: v=' + s.bundle);
check(s.modal, 'مودال الأزياء موجود');
check(s.grid, 'شبكة البطاقات المصوّرة موجودة (#fashionStyleCards)');
check(s.cards === 6, 'ست بطاقات (' + s.cards + ')');
check(s.imgsLoaded === 6, 'الصور الست حُمّلت فعلًا (' + s.imgsLoaded + '/6)');
check(s.selectHidden, 'السلكت القديم مخفيّ');

if (s.cards === 6) {
  await page.evaluate(() => document.querySelector('[data-style-card="abaya"]').click());
  const after = await page.evaluate(() => ({
    val: document.querySelector('#fashionAiStyle').value,
    gold: (document.querySelector('[data-style-card="abaya"]').style.border || '').includes('212, 175, 55'),
  }));
  check(after.val === 'abaya' && after.gold, 'النقر يختار العباية بحدّ ذهبي');
  await page.locator('#fashionStyleCards').screenshot({ path: 'e2e-fashion-cards.png' }).catch(() => {});
}

await b.close();
console.log(fail ? '✗ الهاتف النظيف لا يرى الشكل الجديد — أعلاه أين' : '✓ هاتف نظيف يرى البطاقات المصوّرة كاملة على الإنتاج');
process.exit(fail ? 2 : 0);
