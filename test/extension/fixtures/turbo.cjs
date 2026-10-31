// Synthetic Turbo-roulette frame with the same structure as the real feed
// (finishedRound + statistics + lastResults), no personal data.
const crypto = require('crypto');
const COL = (n) => (n === 0 ? 'Green' : [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(n) ? 'Red' : 'Black');
function round(id, n, t) {
  const resultKey = `${COL(n)}_${n}_Roulette_${crypto.randomUUID()}`;
  const resultSalt = crypto.randomBytes(16).toString('base64');
  const resultHash = crypto.createHash('sha512').update(resultKey + resultSalt).digest('hex').toUpperCase();
  return { id, resultKey, resultSalt, resultHash, n, t };
}
function frame(hist, balance) { // hist: rounds oldest → newest
  const last = hist[hist.length - 1];
  const nums = hist.map((r) => r.n).reverse();
  const comb = {}; for (let i = 0; i <= 36; i++) comb['number_' + i] = { type: i, count: nums.filter((x) => x === i).length, percent: 0 };
  const stats = (k) => ({ combinationStatistic: comb, numbersStatistics: nums.slice(0, k), hotNumbers: nums.slice(0, 5), coldNumbers: nums.slice(5, 10) });
  return JSON.stringify({ type: 1, target: 'DoBetResult', arguments: [{
    betResult: { id: 900000 + hist.length, currencyCode: 'AED', amount: 2.5, winAmount: 0, responseCode: 0, roundId: last.id, gameTypeId: 436, status: 1,
      betData: [{ market: { type: 150, status: 1, name: 'Red', amount: 2.5, odd: 2.0, count: null }, includedMarkets: null }], balance },
    finishedRound: { id: last.id, gameId: 0, gameTypeId: 436, status: 2, resultSalt: last.resultSalt, resultHash: last.resultHash, resultKey: last.resultKey, roundData: { number: last.n, navigation: 1, animationNumber: 0 } },
    statistics: { 100: stats(100), 200: stats(200), 500: stats(500) },
    lastResults: hist.slice(-100).reverse().map((r) => ({ roundId: r.id, resultSalt: r.resultSalt, resultHash: r.resultHash, resultKey: r.resultKey, status: 2, startedDate: new Date(r.t).toISOString(), roundData: { number: r.n, navigation: 1, animationNumber: 0 } })),
  }] }) + '\x1e';
}
module.exports = { round, frame };
