// Browser tests for lab/casino.html: the game cards, the 1,000-player calculator for
// every game, the session check, the language switch, and that nothing is sent over
// the network.
const test = require('node:test');
const assert = require('node:assert');
const { startServer } = require('../helpers/dev-server');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  throw new Error('These tests need Playwright: npm install --no-save playwright && npx playwright install chromium');
}

test('casino page: calculator, session check and language work offline', async (t) => {
  const server = await startServer();
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); await server.close(); });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  const errors = [], requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  ctx.on('request', (r) => requests.push({ method: r.method(), url: r.url() }));
  await page.goto(server.url + '/lab/casino.html');

  const csp = await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content');
  assert.match(csp, /connect-src 'none'/);
  assert.strictEqual(await page.evaluate(() => fetch('/api/auth', { method: 'POST' }).then(() => 'sent', () => 'blocked')), 'blocked');

  // The slot card gains a line computed from the exact example model.
  await page.waitForFunction(() => document.querySelectorAll('#game-slot li').length === 3);
  assert.match(await page.textContent('#game-slot'), /46\.4%|46%/);
  assert.strictEqual(await page.$$eval('#gameCards .game', (g) => g.length), 8);

  const calc = async () => {
    await page.click('#run-calc');
    await page.waitForFunction(() => !document.querySelector('#run-calc').disabled);
    const err = await page.$eval('#err-calc', (e) => (e.hidden ? null : e.textContent));
    return { err, headline: err ? null : await page.textContent('#calc-headline') };
  };

  // Default: the example slot, 100 AED, 5 per spin, one hour at 600 spins.
  const first = await calc();
  assert.strictEqual(first.err, null);
  assert.match(first.headline, /^من 1,000 لاعب بدأوا بـ100 درهم ولعبوا ساعة واحدة \(600 جولة\)/);
  assert.strictEqual(await page.$$eval('#res-calc .chart .median', (p) => p.length), 1);
  assert.strictEqual(await page.$$eval('#res-calc .chart .sample', (p) => p.length), 12);
  assert.ok(await page.$$eval('#res-calc .table-view tbody tr', (r) => r.length) >= 10);
  // Same inputs, same simulation.
  assert.strictEqual((await calc()).headline, first.headline);

  // Hovering the chart shows the band at that time.
  await page.$eval('#res-calc .chart', (c) => c.scrollIntoView({ block: 'center' }));
  const box = await (await page.$('#res-calc .chart')).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForSelector('#res-calc .tip:not([hidden])');
  assert.match(await page.textContent('#res-calc .tip'), /دقيقة/);

  // Every game runs; only its own fields are shown.
  for (const game of ['crash', 'mines', 'blackjack', 'roulette', 'custom']) {
    await page.selectOption('#c-game', game);
    const shown = await page.$$eval('[data-for]', (n) => [...new Set(n.filter((x) => !x.hidden).map((x) => x.dataset.for))]);
    assert.deepStrictEqual(shown, game === 'blackjack' ? [] : [game]);
    const r = await calc();
    assert.strictEqual(r.err, null, game + ': ' + r.err);
    assert.match(r.headline, /خرجوا رابحين/);
  }

  // Bad input gives a readable Arabic error, not a crash.
  await page.selectOption('#c-game', 'mines');
  await page.fill('#c-picks', '30');
  assert.match((await calc()).err, /عدد المربعات لازم يكون من 1 إلى 22/);
  await page.fill('#c-picks', '5');

  // Trying to double 100 AED with 2.5 bets on red: about 10 in 100 get there (exact 10.3).
  await page.selectOption('#c-game', 'roulette');
  await page.fill('#c-balance', '١٠٠'); // Arabic-Indic digits are accepted
  await page.fill('#c-bet', '2.5');
  await page.fill('#c-rph', '600');
  await page.fill('#c-hours', '10');
  await page.fill('#c-target', '200');
  assert.strictEqual((await calc()).err, null);
  const reached = Number(await page.$$eval('#res-calc .card', (cs) => cs.find((c) => c.textContent.includes('وصلوا للهدف')).querySelector('.v').textContent));
  assert.ok(reached > 6 && reached < 15, 'reached per 100: ' + reached);

  // Session check with the built-in example.
  await page.click('#example-session');
  await page.waitForSelector('#session-verdict');
  const session = await page.textContent('#res-session');
  for (const v of ['1,500', '85', '15', '6.7']) assert.ok(session.includes(v), v + ' in ' + session);
  assert.match(await page.getAttribute('#session-verdict', 'class'), /warn/);

  // Language switch re-renders everything in English.
  await page.click('#langToggle');
  assert.strictEqual(await page.getAttribute('html', 'dir'), 'ltr');
  assert.strictEqual(await page.textContent('h1'), 'How the casino wins');
  assert.match(await page.textContent('#calc-headline'), /^Of \d[\d,]* players who started with 100 AED/);
  assert.match(await page.textContent('#session-verdict'), /above the usual/);

  assert.deepStrictEqual(errors, []);
  const outside = requests.filter((r) => !r.url.startsWith('blob:') && !(r.method === 'GET' && /\/(lab|icons)\//.test(new URL(r.url).pathname)));
  assert.deepStrictEqual(outside, [], 'requests other than the page\'s own static files');
});

test('casino page fits a phone screen and the main app links to it', async (t) => {
  const server = await startServer();
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); await server.close(); });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(60000);
  await page.goto(server.url + '/lab/casino.html');
  await page.waitForFunction(() => document.querySelectorAll('#game-slot li').length === 3);
  await page.click('#game-crash button');
  await page.waitForSelector('#calc-headline');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal scroll');
  await page.goto(server.url + '/');
  await page.waitForTimeout(500);
  assert.strictEqual(await page.getAttribute('#linkCasino', 'href'), 'lab/casino.html');
});
