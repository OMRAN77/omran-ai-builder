// Browser tests for lab/roulette.html: the house-edge table per wheel, the
// statistical read of a pasted sequence of winning numbers, the language switch,
// the phone layout, and that nothing leaves the page.
const test = require('node:test');
const assert = require('node:assert');
const { startServer } = require('../helpers/dev-server');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  throw new Error('These tests need Playwright: npm install --no-save playwright && npx playwright install chromium');
}

test('roulette page: house edge, sequence analysis and language work offline', async (t) => {
  const server = await startServer();
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); await server.close(); });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  const errors = [], requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  ctx.on('request', (r) => requests.push({ method: r.method(), url: r.url() }));
  await page.goto(server.url + '/lab/roulette.html');
  assert.match(await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content'), /connect-src 'none'/);
  assert.strictEqual(await page.evaluate(() => fetch('/api/auth', { method: 'POST' }).then(() => 'sent', () => 'blocked')), 'blocked');

  // 1. House edge: European is 2.70% on every bet; switching to American changes it.
  await page.waitForSelector('#edge-table');
  assert.strictEqual(await page.$$eval('#edge-table tbody tr', (r) => r.length), 8);
  assert.match(await page.textContent('#edge-table tbody tr:first-child'), /35:1.*97\.30%.*2\.70%/s);
  await page.selectOption('#e-wheel', 'american');
  await page.waitForFunction(() => /5\.26%/.test(document.querySelector('#edge-table').textContent));
  assert.strictEqual(await page.$$eval('#edge-table tbody tr', (r) => r.length), 9); // basket added
  await page.selectOption('#e-wheel', 'european');

  // 2. Short real strip → insufficient, but still shows the cards and bias table.
  await page.click('#example-seq');
  await page.waitForSelector('#seq-verdict');
  assert.match(await page.getAttribute('#seq-verdict', 'class'), /review/);
  assert.match(await page.textContent('#seq-verdict'), /أرقام قليلة/);
  assert.ok(await page.$('#bias-table'), 'bias table shown');
  assert.match(await page.textContent('#res-seq .card:first-child .v'), /14/);

  // A long fair sequence → fair verdict, no flagged pockets.
  const fair = await page.evaluate(() => {
    let a = 123456789 >>> 0; const out = [];
    for (let i = 0; i < 4000; i++) { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; out.push(((t ^ (t >>> 14)) >>> 0) % 37); }
    return out.join(' ');
  });
  await page.fill('#s-nums', fair);
  await page.click('#run-seq');
  await page.waitForFunction(() => /normal/.test(document.querySelector('#seq-verdict').className));
  assert.strictEqual(await page.$$eval('#bias-table tr.flagged', (r) => r.length), 0);

  // A heavily biased sequence (number 17 loaded) → anomaly, 17 flagged.
  const biased = fair + ' ' + Array(700).fill('17').join(' ');
  await page.fill('#s-nums', biased);
  await page.click('#run-seq');
  await page.waitForFunction(() => /suspicious/.test(document.querySelector('#seq-verdict').className));
  assert.ok(await page.$$eval('#bias-table tr.flagged', (r) => r.length) >= 1);
  assert.match(await page.textContent('#bias-table tr.flagged:first-child'), /17/);

  // A bad paste is reported.
  await page.fill('#s-nums', '99 nope');
  await page.click('#run-seq');
  assert.match(await page.textContent('#err-seq'), /out of range|المدى|range/);

  // Language switch re-renders everything.
  await page.click('#langToggle');
  assert.strictEqual(await page.getAttribute('html', 'dir'), 'ltr');
  assert.strictEqual(await page.textContent('h1'), 'Roulette: the truth in numbers');
  assert.strictEqual(await page.getAttribute('#site-link', 'href'), 'casino-check.html');

  assert.deepStrictEqual(errors, []);
  const outside = requests.filter((r) => !(r.method === 'GET' && /\/(lab|icons)\//.test(new URL(r.url).pathname)));
  assert.deepStrictEqual(outside, [], 'requests other than the page\'s own static files');
});

test('roulette page fits a phone screen and the app pages link to it', async (t) => {
  const server = await startServer();
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); await server.close(); });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(60000);
  await page.goto(server.url + '/lab/roulette.html');
  await page.waitForSelector('#edge-table');
  await page.click('#example-seq');
  await page.waitForSelector('#seq-verdict');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal scroll');
  for (const p of ['/lab/casino.html', '/lab/casino-check.html', '/lab/mines.html']) {
    await page.goto(server.url + p);
    await page.waitForFunction(() => document.querySelector('a[href="roulette.html"]').textContent.length > 0);
    assert.strictEqual(await page.textContent('a[href="roulette.html"]'), 'الروليت بالأرقام');
  }
  await page.goto(server.url + '/');
  await page.waitForTimeout(500);
  assert.strictEqual(await page.getAttribute('#linkRoulette', 'href'), 'lab/roulette.html');
});
