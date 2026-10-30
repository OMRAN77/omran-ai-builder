// Browser tests for lab/casino-check.html: the site check renders the API's findings
// (the API is stubbed, no site is visited), the provably-fair recomputation and the
// bet-history analysis run in the page, the language switch, and the phone layout.
const test = require('node:test');
const assert = require('node:assert');
const { startServer } = require('../helpers/dev-server');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  throw new Error('These tests need Playwright: npm install --no-save playwright && npx playwright install chromium');
}

const STUB = {
  url: 'https://casino-uae-win.test/', finalUrl: 'https://casino-uae-win.test/', host: 'casino-uae-win.test', domain: 'casino-uae-win.test', ips: ['203.0.113.10'], status: 200,
  checkedAt: '2026-10-30T10:00:00.000Z',
  page: { title: 'كازينو الإمارات', lang: 'ar', isGambling: true, targetsUae: true, licences: [], providers: ['Pragmatic Play'], providerHosts: [], externalHosts: [{ host: 't.me', count: 1 }], payments: { crypto: true, cards: false, agents: false } },
  registration: { registered: '2026-09-20T00:00:00Z', expires: null, registrar: 'Test Registrar', status: [] },
  cert: { authorized: true, error: null, issuer: "Let's Encrypt", subject: 'casino-uae-win.test', validFrom: '2026-09-21T00:00:00Z', validTo: '2026-12-20T00:00:00Z' },
  geo: { ip: '203.0.113.10', country: 'Curacao', countryCode: 'CW', city: 'Willemstad', isp: 'Some Hosting', org: 'Some Hosting', asn: 64500, cdn: null },
  headers: { present: [], missing: ['strict-transport-security', 'content-security-policy'], server: null },
  findings: [
    { id: 'host-abroad', severity: 'info', ar: 'الخادم خارج الإمارات.', en: 'Server outside the UAE.', evidence: '203.0.113.10' },
    { id: 'no-uae-licence', severity: 'high', ar: 'لا ترخيص إماراتيًا.', en: 'No UAE licence.', evidence: null },
    { id: 'crypto-only', severity: 'high', ar: 'الدفع بالعملات الرقمية فقط.', en: 'Crypto payments only.', evidence: 'USDT TRC20' },
    { id: 'messenger', severity: 'medium', ar: 'الدعم عبر تلغرام.', en: 'Support through Telegram.', evidence: 'https://t.me/x' },
    { id: 'domain-new', severity: 'high', ar: 'النطاق مسجّل منذ 40 يومًا فقط.', en: 'The domain is only 40 days old.', evidence: '2026-09-20T00:00:00Z' },
  ],
  risk: 87, level: 'danger', remaining: 19,
};

test('casino check: site findings, provably-fair recomputation, history analysis, language', async (t) => {
  const server = await startServer();
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); await server.close(); });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  const errors = [], requests = [], apiBodies = [];
  page.on('pageerror', (e) => errors.push(e.message));
  ctx.on('request', (r) => requests.push({ method: r.method(), url: r.url() }));
  await page.route('**/api/casino-check', async (route) => {
    const body = route.request().postDataJSON();
    apiBodies.push(body);
    if (body.url === 'limit.test') return route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'limit', message: 'وصلت للحد اليومي' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STUB) });
  });
  await page.goto(server.url + '/lab/casino-check.html');
  await page.waitForFunction(() => document.querySelector('h1').textContent.length > 0);
  assert.strictEqual(await page.textContent('h1'), 'فحص الكازينو');
  assert.match(await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content'), /connect-src 'self'/);

  // 1. Site: the URL goes to our API only; findings come back sorted by severity, with evidence.
  await page.fill('#s-url', 'casino-uae-win.test');
  await page.press('#s-url', 'Enter');
  await page.waitForSelector('#site-findings');
  assert.deepStrictEqual(apiBodies.map((b) => b.url), ['casino-uae-win.test']);
  assert.strictEqual(await page.textContent('#risk-value'), '87 / 100');
  assert.match(await page.getAttribute('#site-verdict', 'class'), /suspicious/);
  assert.match(await page.textContent('#site-verdict'), /^خطر/);
  assert.deepStrictEqual(await page.$$eval('#site-findings li', (l) => l.map((x) => x.dataset.id)), ['no-uae-licence', 'crypto-only', 'domain-new', 'messenger', 'host-abroad']);
  assert.match(await page.textContent('#site-findings li[data-id="crypto-only"] .ev'), /USDT TRC20/);
  assert.ok(await page.$$eval('#res-site .risk-fill.danger', (n) => n.length === 1));
  const facts = await page.textContent('#res-site dl.kv');
  for (const v of ['casino-uae-win.test', 'Test Registrar', '2026-09-20', 'Curacao', "Let's Encrypt", 'Pragmatic Play']) assert.ok(facts.includes(v), v);
  // Throttled: a readable error, no crash.
  await page.fill('#s-url', 'limit.test');
  await page.click('#run-site');
  await page.waitForFunction(() => !document.querySelector('#err-site').hidden);
  assert.match(await page.textContent('#err-site'), /للحد اليومي/);

  // 2. Provably fair: the example recomputes the mines; a wrong hash is a mismatch; a shown result is compared.
  await page.click('#example-fair');
  await page.waitForSelector('#mines-grid');
  assert.strictEqual(await page.textContent('#mines-list'), '1, 23, 25');
  assert.strictEqual(await page.$$eval('#mines-grid .mtile.mine', (n) => n.length), 3);
  assert.match(await page.getAttribute('#fair-commitment', 'class'), /review/);
  await page.fill('#f-hash', '495735ed7abb89e5cc9ea0d8f002bfd82432e154c8e8b5811475443f5fa53e73');
  await page.fill('#f-shown', '1, 23, 25');
  await page.click('#run-fair');
  await page.waitForFunction(() => /pass/.test(document.querySelector('#fair-commitment').className));
  assert.match(await page.getAttribute('#fair-outcome', 'class'), /pass/);
  await page.fill('#f-hash', 'abc');
  await page.fill('#f-shown', '1, 2, 3');
  await page.click('#run-fair');
  await page.waitForFunction(() => /fail/.test(document.querySelector('#fair-commitment').className));
  assert.match(await page.getAttribute('#fair-outcome', 'class'), /fail/);
  assert.strictEqual(await page.$$eval('#mines-grid .mtile.diff', (n) => n.length), 4);
  // Dice shows its own fields and a 0–100 result.
  await page.selectOption('#f-game', 'dice');
  assert.deepStrictEqual(await page.$$eval('#fair [data-for]', (n) => n.filter((x) => !x.hidden).map((x) => x.dataset.for)), []);
  await page.fill('#f-hash', '');
  await page.fill('#f-shown', '');
  await page.click('#run-fair');
  await page.waitForFunction(() => document.querySelector('#res-fair .card .v'));
  const dice = Number(await page.textContent('#res-fair .card .v'));
  assert.ok(dice >= 0 && dice <= 100, 'dice ' + dice);
  // Empty seed: readable error.
  await page.fill('#f-server', '');
  await page.click('#run-fair');
  await page.waitForFunction(() => !document.querySelector('#err-fair').hidden);
  assert.match(await page.textContent('#err-fair'), /بذرة الخادم/);

  // 3. History: the example (485 bet, 226.25 won, declared 97%) is flagged for review.
  await page.click('#example-hist');
  await page.waitForSelector('#hist-verdict');
  const hist = await page.textContent('#res-hist');
  for (const v of ['20', '485', '226.25', '−258.75', '46.65', '53.35']) assert.ok(hist.includes(v), v + ' in ' + hist);
  assert.match(await page.getAttribute('#hist-verdict', 'class'), /review/);
  assert.strictEqual(await page.$$eval('#res-hist tbody tr', (r) => r.length), 8);
  await page.fill('#h-text', 'nothing here');
  await page.click('#run-hist');
  await page.waitForFunction(() => !document.querySelector('#err-hist').hidden);
  assert.match(await page.textContent('#err-hist'), /سطرين على الأقل/);

  // Language switch re-renders the results in English.
  await page.click('#langToggle');
  assert.strictEqual(await page.getAttribute('html', 'dir'), 'ltr');
  assert.strictEqual(await page.textContent('h1'), 'Casino check');
  assert.match(await page.textContent('#site-verdict'), /^Danger/);
  assert.match(await page.textContent('#site-findings li[data-id="no-uae-licence"]'), /No UAE licence/);
  assert.match(await page.textContent('#hist-verdict'), /review/i);

  assert.deepStrictEqual(errors, []);
  const outside = requests.filter((r) => !/\/api\/casino-check$/.test(r.url) && !(r.method === 'GET' && /\/(lab|icons)\//.test(new URL(r.url).pathname)));
  assert.deepStrictEqual(outside, [], 'requests other than the page\'s own files and our API');
});

test('casino check fits a phone screen and the app pages link to it', async (t) => {
  const server = await startServer();
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); await server.close(); });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(60000);
  await page.goto(server.url + '/lab/casino-check.html');
  await page.click('#example-fair');
  await page.waitForSelector('#mines-grid');
  await page.click('#example-hist');
  await page.waitForSelector('#hist-verdict');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal scroll');
  await page.goto(server.url + '/lab/casino.html');
  await page.waitForFunction(() => document.querySelector('a[href="casino-check.html"]').textContent.length > 0);
  assert.strictEqual(await page.textContent('a[href="casino-check.html"]'), 'فحص الكازينو');
  await page.goto(server.url + '/');
  await page.waitForTimeout(500);
  assert.strictEqual(await page.getAttribute('#linkCasinoCheck', 'href'), 'lab/casino-check.html');
  assert.strictEqual(await page.textContent('#linkCasinoCheck span'), 'فحص الكازينو');
});
