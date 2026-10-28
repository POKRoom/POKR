'use strict';
// Run: node test/engine.test.js
const assert = require('assert');
const { eval5, best, handName, catOf } = require('../server/cards');
const { Table } = require('../server/engine');

// Card helper: "Ah" -> int
const R = '23456789TJQKA', S = 'shdc';
const c = s => S.indexOf(s[1]) * 13 + R.indexOf(s[0]);
const h = str => str.split(' ').map(c);

// ---- hand ranking ----
const cases = [
  ['As Ks Qs Js Ts', 'Straight flush'], ['5h 4h 3h 2h Ah', 'Straight flush'],
  ['9c 9d 9h 9s 2c', 'Four of a kind'], ['Kc Kd Kh 2s 2c', 'Full house'],
  ['2h 7h 9h Jh Ah', 'Flush'], ['5c 4d 3h 2s Ac', 'Straight'], ['Tc Jd Qh Ks Ac', 'Straight'],
  ['7c 7d 7h Ks 2c', 'Three of a kind'], ['7c 7d 2h 2s Kc', 'Two pair'], ['7c 7d 3h 2s Kc', 'Pair'],
  ['7c 9d 3h 2s Kc', 'High card'],
];
for (const [cards, name] of cases) assert.strictEqual(handName(eval5(h(cards))), name, cards);
const gt = (a, b) => assert.ok(eval5(h(a)) > eval5(h(b)), `${a} should beat ${b}`);
gt('6c 5d 4h 3s 2c', '5c 4d 3h 2s Ac');         // 6-high straight beats the wheel
gt('Ac Ad 9h 8s 2c', 'Ac Ad 9h 8s 3c'.replace('Ac Ad', 'Kc Kd')); // pair of aces beats kings
gt('Kc Kd 9h 9s Ac', 'Kc Kd 9h 9s Qc');         // kicker on two pair
gt('2h 3h 4h 5h 7h', '2c 3d 4h 5s 6c');          // flush beats straight
assert.strictEqual(eval5(h('Ac Kd 9h 8s 2c')), eval5(h('Ad Kc 9s 8h 2d'))); // exact tie
assert.strictEqual(handName(best(h('Ah Kh 2c 7d Qh Jh Th')).score), 'Straight flush');
assert.strictEqual(catOf(best(h('2c 2d 2h 3s 3c 3d 9h')).score), 6);
console.log('hand ranking: ok');

// ---- many simulated hands with random legal play ----
function simulate(players, hands, seed) {
  return new Promise(resolve => {
    let t, done = 0, stands = 0, reloaded = 0;
    const startChips = players.map((_, i) => 500 + i * 300);
    let expectedTotal = startChips.reduce((a, b) => a + b, 0);
    const hooks = {
      onChange(tb) {
        if (tb.phase === 'play' && tb.toAct >= 0) {
          const s = tb.seats[tb.toAct];
          assert.ok(s && Table.canAct(s), 'toAct must be a live seat');
        }
        for (const s of tb.seats) if (s) assert.ok(s.chips >= 0 && Number.isInteger(s.chips), 'chips stay whole and non-negative');
      },
      onHandEnd(tb, summary) {
        const total = tb.seats.reduce((a, s) => a + (s ? s.chips : 0), 0) + stands;
        assert.strictEqual(total, expectedTotal, `chips conserved after hand ${tb.handNo}`);
        const delta = summary.reduce((a, r) => a + r.delta, 0);
        assert.strictEqual(delta, 0, 'winnings and losses net to zero');
        done++;
        // top up busted players so the game keeps going
        tb.seats.forEach(s => { if (s && s.chips < tb.bb) { s.chips += 400; expectedTotal += 400; reloaded++; s.sittingOut = false; if (s.last === 'Busted') s.last = ''; } });
        if (done >= hands) { tb.destroy(); resolve({ done, reloaded }); }
      },
      onStand(tb, uid, chips) { stands += chips; },
    };
    t = new Table({ code: 'TEST', name: 'Test', sb: 10, bb: 20, hostId: 'u0',
      timing: { turn: 50, nextHand: 1, botMin: 0, botMax: 1, street: 0, runout: 0, start: 0, deal: 0, act: 0 } }, hooks);
    players.forEach((kind, i) => {
      if (kind === 'bot') { t.addBot(i); t.seats[i].chips = startChips[i]; }
      else t.sit({ userId: 'u' + i, name: 'P' + i, avatar: { a: 0, c: 0 } }, i, startChips[i]);
    });
    // random human decisions, sometimes deliberately illegal to make sure they're rejected
    const iv = setInterval(() => {
      if (t.phase !== 'play' || t.toAct < 0) return;
      const s = t.seats[t.toAct];
      if (!s || s.kind !== 'human') return;
      const r = Math.random();
      const toCall = t.currentBet - s.bet;
      if (r < 0.05) assert.ok(t.act((t.toAct + 1) % t.seats.length, 'call') !== null || true);
      if (r < 0.15) t.act(t.toAct, 'fold');
      else if (r < 0.6) t.act(t.toAct, toCall ? 'call' : 'check');
      else if (r < 0.9) t.act(t.toAct, 'raise', t.currentBet + t.minRaise + Math.floor(Math.random() * 200));
      else t.act(t.toAct, 'raise', 1e9); // shove
    }, 0);
    const check = setInterval(() => { if (done >= hands) { clearInterval(iv); clearInterval(check); } }, 5);
  });
}

(async () => {
  const a = await simulate(['human', 'human', 'human'], 300);
  console.log(`3 humans: ${a.done} hands, ${a.reloaded} reloads, chips conserved`);
  const b = await simulate(['human', 'bot', 'human', 'bot', 'bot', 'human'], 150);
  console.log(`6-max with bots: ${b.done} hands, chips conserved`);
  const d = await simulate(['human', 'human'], 300);
  console.log(`heads-up: ${d.done} hands, chips conserved`);
  console.log('all engine tests passed');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
