// Browser tests for lab/index.html: every tab runs on its built-in example, results
// match known values, nothing is sent over the network, and the PDF report is a
// well-formed file that carries its inputs.
const test = require('node:test');
const assert = require('node:assert');
const { startServer } = require('../helpers/dev-server');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  throw new Error('These tests need Playwright: npm install --no-save playwright && npx playwright install chromium');
}

// Checks the xref table: every entry must point at "<n> 0 obj".
function checkPdfStructure(buf) {
  const text = buf.toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4'), 'PDF header');
  assert.ok(text.trimEnd().endsWith('%%EOF'), 'PDF trailer');
  const startxref = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(text)[1]);
  assert.strictEqual(text.slice(startxref, startxref + 4), 'xref');
  const [, first, count] = /^xref\n(\d+) (\d+)\n/.exec(text.slice(startxref));
  const entries = text.slice(startxref).split('\n').slice(3, 2 + Number(count));
  entries.forEach((line, i) => {
    const offset = Number(line.slice(0, 10));
    const n = Number(first) + i + 1;
    assert.strictEqual(text.slice(offset, offset + String(n).length + 6), `${n} 0 obj`, `xref entry ${n}`);
  });
  return text;
}

test('RTP lab: every tab works offline and nothing leaves the page', async (t) => {
  const server = await startServer();
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); await server.close(); });
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  const errors = [], requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  ctx.on('request', (r) => requests.push({ method: r.method(), url: r.url() }));
  await page.goto(server.url + '/lab/index.html');

  const csp = await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content');
  assert.match(csp, /connect-src 'none'/);
  assert.strictEqual(await page.evaluate(() => fetch('/api/auth', { method: 'POST' }).then(() => 'sent', () => 'blocked')), 'blocked');

  // Theoretical RTP: roulette and the example slot.
  const theory = async (sample) => {
    await page.click(`[data-sample="${sample}"]`);
    await page.click('#run-theory');
    await page.waitForFunction(() => !document.querySelector('#run-theory').disabled && document.querySelector('#res-theory .card'));
    return page.textContent('#res-theory .card.accent .v');
  };
  assert.strictEqual(await theory('rouletteEuropean'), '97.297297%');
  assert.strictEqual(await theory('rouletteAmerican'), '94.736842%');
  assert.strictEqual(await theory('desertGold'), '95.517500%');
  const symbolRows = await page.$$eval('#res-theory tbody tr', (r) => r.length);
  assert.ok(symbolRows > 20, 'per-symbol table rendered');

  // Observed RTP from a generated play log.
  await page.click('#tab-actual');
  await page.click('#sample-actual');
  await page.waitForFunction(() => document.querySelector('#name-actual').textContent.includes('sample-playlog'));
  await page.click('#run-actual');
  await page.waitForSelector('#res-actual .verdict');
  assert.match(await page.textContent('#res-actual'), /100,000/);

  // RNG tests: first, NIST's reference input (first 1,000,000 bits of e) uploaded as
  // a text file must reproduce the publication's values in the page.
  await page.click('#tab-rng');
  const fs = require('fs'), os = require('os'), path = require('path');
  const packed = fs.readFileSync(path.join(__dirname, '..', 'lab', 'fixtures', 'e.bin'));
  let bits = '';
  for (let i = 0; i < 1000000; i++) bits += (packed[i >> 3] >> (7 - (i & 7))) & 1;
  const eFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lab-')), 'e-1000000-bits.txt');
  fs.writeFileSync(eFile, bits);
  await page.setInputFiles('#rngFile', eFile);
  await page.waitForFunction(() => document.querySelector('#name-rng').textContent.includes('e-1000000'));
  await page.selectOption('#r-mode', 'bits');
  await page.click('#run-rng');
  await page.waitForSelector('#res-rng tbody tr');
  const rows = await page.$$eval('#res-rng tbody tr', (r) => r.map((x) => ({ text: x.innerText, fail: !!x.querySelector('td.fail') })));
  assert.strictEqual(rows.length, 17); // 15 NIST tests + chi-square + serial correlation
  assert.ok(rows[7].text.includes('0.110434'), 'overlapping template P: ' + rows[7].text);
  assert.ok(rows[8].text.includes('0.282568'), 'universal P: ' + rows[8].text);
  assert.ok(rows[13].text.includes('0.007779') && rows[13].fail, 'random excursions x = -1: ' + rows[13].text);
  assert.deepStrictEqual(rows.slice(0, 15).filter((r) => r.fail).length, 1);
  // The built-in sample generator produces a complete result table too.
  await page.click('#sample-rng');
  await page.waitForFunction(() => document.querySelector('#name-rng').textContent.includes('random-sample'));
  await page.click('#run-rng');
  await page.waitForFunction(() => !document.querySelector('#run-rng').disabled && document.querySelectorAll('#res-rng tbody tr').length === 17);

  // Provably fair: 5,000 generated rounds verify; a hash chain verifies.
  await page.click('#tab-fair');
  await page.click('#sample-fair');
  await page.waitForFunction(() => document.querySelector('#name-fair').textContent.includes('sample-provably-fair'));
  await page.click('#run-fair');
  await page.waitForSelector('#res-fair .verdict.pass');
  assert.match(await page.textContent('#res-fair'), /5,000 \/ 5,000/);

  // Monte Carlo: same seed, same fingerprint.
  await page.click('#tab-mc');
  await page.selectOption('#m-spins', '100000');
  await page.click('#run-mc');
  await page.waitForSelector('#mc-digest');
  const first = await page.textContent('#mc-digest');
  await page.click('#rerun-mc');
  await page.waitForSelector('#res-mc .verdict.pass');
  assert.strictEqual(await page.textContent('#mc-digest'), first);

  // PDF report.
  await page.click('#tab-report');
  await page.fill('#rep-title', 'اختبار / test');
  await page.click('#run-report');
  await page.waitForSelector('#report-download');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#report-download')]);
  const pdf = fs.readFileSync(await download.path());
  const text = checkPdfStructure(pdf);
  const reportId = await page.textContent('#res-report .card .v');
  assert.match(reportId, /^TRL-\d{8}-[0-9A-F]{8}$/);
  assert.ok(text.includes('/EmbeddedFiles'), 'inputs attached');
  for (const name of ['report.json', 'desert-gold-example.json', 'sample-playlog-desert-gold.csv', 'random-sample-1000000-bits.bin', 'sample-provably-fair-5000.csv']) {
    assert.ok(text.includes('(' + name + ')'), 'attachment ' + name);
  }
  assert.ok(text.includes(reportId), 'report ID in the PDF');

  // Language switch.
  await page.click('#langToggle');
  assert.strictEqual(await page.getAttribute('html', 'dir'), 'ltr');
  assert.strictEqual(await page.textContent('h1'), 'RTP Lab');

  assert.deepStrictEqual(errors, []);
  const outside = requests.filter((r) => !r.url.startsWith('blob:') && !(r.method === 'GET' && /\/(lab|icons)\//.test(new URL(r.url).pathname)));
  assert.deepStrictEqual(outside, [], 'requests other than the lab\'s own static files');
});

test('main app links to the lab and no longer has the old RTP / Kelly tools', async (t) => {
  const server = await startServer();
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); await server.close(); });
  const page = await browser.newPage();
  await page.goto(server.url + '/');
  await page.waitForTimeout(800);
  const tools = await page.$$eval('#secToolsNav button', (b) => b.map((x) => x.dataset.tool));
  assert.ok(!tools.includes('probmath') && !tools.includes('rtpcalc'), tools.join(','));
  assert.strictEqual(await page.getAttribute('#linkRtpLab', 'href'), 'lab/index.html');
  const html = await page.content();
  for (const gone of ['HKS_GAMES', 'Kelly', 'btnRtpSuggest', 'Gates of Olympus']) assert.ok(!html.includes(gone), gone + ' still present');
});
