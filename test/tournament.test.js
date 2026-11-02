'use strict';
// A full multi-table tournament played out by bots: chips conserved across tables, tables balanced and
// broken, every finishing place handed out once, and the prize pool paid in full.
const assert = require('assert');
const { Table } = require('../server/engine');
const { Tournament, payouts } = require('../server/tournament');

// payout sheets
for (const n of [2, 6, 9, 12, 30, 100, 1000]) {
  const pool = n * 2500, p = payouts(n, pool);
  assert.strictEqual(p.reduce((a, x) => a + x.amount, 0), pool, `pool paid in full for ${n}`);
  for (let i = 1; i < p.length; i++) assert.ok(p[i - 1].amount >= p[i].amount, 'payouts go down by place');
}
assert.strictEqual(payouts(100, 250000).length, 15, '15% of the field is paid');
console.log('payouts: ok');

function run(entrants, seats, game) {
  return new Promise((resolve, reject) => {
    let codeN = 0, hands = 0, maxTables = 0, moves = 0;
    const busts = [];
    const timing = { turn: 40, nextHand: 1, botMin: 0, botMax: 1, street: 0, runout: 0, start: 0, deal: 0, act: 0 };
    let tour;
    const check = () => {
      if (tour.status !== 'running') return;
      let chips = 0;
      for (const t of tour.tables) for (const s of t.seats) if (s) chips += s.chips;
      for (const t of tour.tables) if (t.phase === 'play') return; // mid-hand chips sit in pots
      assert.strictEqual(chips, tour.entries * tour.stack, 'tournament chips conserved');
    };
    tour = new Tournament({ id: 'T', name: 'Test Event', buyIn: 2500, speed: 'turbo', levelMs: 1500, seatsPerTable: seats, lateRegLevels: 0, game }, {
      makeTable(o) {
        const t = new Table({ code: 'TB' + (++codeN), name: o.name, sb: o.sb, bb: o.bb, maxSeats: o.maxSeats, tourney: o.tourney, game: o.game, timing }, {
          onHandEnd(tb) { hands++; try { tour.handEnded(tb); check(); } catch (e) { reject(e); } },
        });
        return t;
      },
      destroyTable(t) { t.destroy(); },
      onMove() { moves++; },
      onBust(p, info) { busts.push(info.place); },
      onFinish() {
        try {
          const places = [...busts].sort((a, b) => a - b);
          assert.deepStrictEqual(places, Array.from({ length: entrants }, (_, i) => i + 1), 'every place from 1 to N exactly once');
          const paid = [...tour.players.values()].reduce((a, p) => a + (p.prize || 0), 0);
          assert.strictEqual(paid, tour.prizePool, 'prize pool paid out exactly');
          for (const t of tour.tables) t.destroy();
          resolve({ hands, maxTables, moves });
        } catch (e) { reject(e); }
      },
    });
    const mv = tour._move.bind(tour); tour._move = (...a) => { moves++; return mv(...a); };
    tour.addBots(entrants);
    assert.strictEqual(tour.start(), null);
    maxTables = tour.tables.length;
    assert.strictEqual(maxTables, Math.ceil(entrants / seats));
    const iv = setInterval(() => {
      tour.tick();
      const live = tour.tables.filter(t => t.seats.some(Boolean));
      for (const t of live) assert.ok(t.seats.filter(Boolean).length <= seats, 'never more players than seats');
      if (tour.status === 'finished') clearInterval(iv);
    }, 20);
    setTimeout(() => reject(new Error('tournament did not finish')), 110000);
  });
}

(async () => {
  const a = await run(30, 9, 'nlh');
  console.log(`30 players, 9-max: ${a.hands} hands, ${a.moves} table moves, finished cleanly`);
  const b = await run(17, 6, 'plo');
  console.log(`17 players, 6-max PLO: ${b.hands} hands, ${b.moves} moves, finished cleanly`);
  console.log('tournament tests passed');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
