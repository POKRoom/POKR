'use strict';
// Sit & Gos through the real tournament manager: a player buys in, bots fill the empty seats,
// it starts the moment it's full, plays down to a winner, pays the Sit & Go split, and a fresh
// one opens at the same stakes. Run: node test/sng.test.js
const assert = require('assert');
const { Table } = require('../server/engine');
const { createManager, SNG_TIERS } = require('../server/tourneys');
const { SNG_SPLITS, payouts } = require('../server/tournament');

// the splits on their own
assert.deepStrictEqual(payouts(6, 600, SNG_SPLITS[6]).map(x => x.amount), [390, 210]);
assert.deepStrictEqual(payouts(9, 4500, SNG_SPLITS[9]).map(x => x.amount), [2250, 1350, 900]);
for (const n of [2, 3, 5, 6, 7, 9]) {
  const pool = n * 500, p = payouts(n, pool, SNG_SPLITS[n]);
  assert.strictEqual(p.reduce((a, x) => a + x.amount, 0), pool, `pool paid in full, ${n}-max`);
  assert.ok(p.length < n, 'fewer paid places than players');
}

const bank = { u1: 100000 };
const ledger = [];
let codeN = 0;
const tables = new Map();
const tm = createManager({
  Table, tables, makeCode: () => 'C' + (++codeN),
  timing: { turn: 30, nextHand: 1, botMin: 0, botMax: 1, street: 0, runout: 0, start: 0, deal: 0, act: 0 },
  broadcast() {}, changed() {}, notify() {}, moveClient() {},
  charge(userId, cents, why) { if (bank[userId] < cents) return 'Not enough'; bank[userId] -= cents; ledger.push([-cents, why]); return null; },
  credit(userId, cents, why) { bank[userId] += cents; ledger.push([cents, why]); },
  userInfo: () => ({ name: 'Amy', avatar: { a: 0, c: 1 } }),
  sngFillMs: 50, sngLevelMs: 800,
});

const open = tier => [...tm.tours.values()].find(t => t.tier === tier && t.status === 'registering');
for (const tier of SNG_TIERS) assert.ok(open(tier.key), `an open Sit & Go at ${tier.key}`);

const hold = open('h1'), omaha = open('o2');
assert.strictEqual(hold.game, 'nlh'); assert.strictEqual(omaha.game, 'plo');
assert.strictEqual(tm.register('u1', hold.id), null);
assert.strictEqual(tm.register('u1', omaha.id), null);
assert.strictEqual(bank.u1, 100000 - 100 - 200, 'both buy-ins taken');
assert.ok(tm.register('u1', hold.id), 'can’t register twice');

const start = Date.now();
const iv = setInterval(() => {
  try {
    tm.tick();
    if (hold.status === 'running' && omaha.status === 'running') {
      assert.ok(open('h1') && open('h1') !== hold, 'a fresh $1 Hold’em opens once the first one starts');
      assert.ok(open('o2') && open('o2') !== omaha, 'a fresh $2 Omaha opens too');
      assert.strictEqual(hold.tables.length, 1, 'one table');
    }
    if (hold.status === 'finished' && omaha.status === 'finished') {
      clearInterval(iv);
      for (const t of [hold, omaha]) {
        assert.strictEqual(t.entries, t.seatsPerTable, 'the table filled');
        const paid = [...t.players.values()].reduce((a, p) => a + (p.prize || 0), 0);
        assert.strictEqual(paid, t.prizePool, 'prize pool paid in full');
        assert.strictEqual(t.payouts.length, 2, '6-max pays two places');
      }
      const won = ledger.filter(([c]) => c > 0).reduce((a, [c]) => a + c, 0);
      assert.strictEqual(bank.u1, 100000 - 300 + won, 'bankroll adds up');
      console.log(`sng test passed: Hold’em and Omaha Sit & Gos filled, ran to a winner and paid out (${((Date.now() - start) / 1000).toFixed(1)}s)`);
      for (const t of tables.values()) t.destroy();
      process.exit(0);
    }
    if (Date.now() - start > 120000) throw new Error('Sit & Gos didn’t finish in time');
  } catch (e) { console.error(e); process.exit(1); }
}, 20);
