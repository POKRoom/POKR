'use strict';
// Pot-Limit Omaha: two-and-three hand rule, the pot-limit cap, and chips adding up over many hands.
const assert = require('assert');
const { bestOmaha, best, handName, catOf } = require('../server/cards');
const { Table } = require('../server/engine');

const R = { 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7, T: 8, J: 9, Q: 10, K: 11, A: 12 };
const S = { s: 0, h: 1, d: 2, c: 3 };
const h = str => str.split(' ').map(x => S[x[1]] * 13 + R[x[0]]);

// Four spades on the board with only one in your hand is NOT a flush in Omaha (you must use two).
const board = h('Qs Js 9s 4s 2c');
assert.notStrictEqual(handName(bestOmaha(h('As Kd 3h 3c'), board).score), 'Flush', 'one suited card is not enough');
assert.strictEqual(handName(best([...h('As Kd 3h 3c'), ...board]).score), 'Flush', 'in hold’em it would be');
// Two spades in hand makes it.
assert.strictEqual(handName(bestOmaha(h('As Ks 3h 3c'), board).score), 'Flush');
// Trips on the board don't give you a full house with just one pair card in hand... you still use exactly two.
assert.strictEqual(catOf(bestOmaha(h('Ah Ad 7c 8d'), h('Kc Ks Kh 2d 5c')).score), 6, 'AA + KKK = full house');
assert.strictEqual(catOf(bestOmaha(h('Ah 7d 8c 9d'), h('Kc Ks Kh Kd 5c')).score), 3, 'quads on board play as trips in Omaha');
// Board straight that needs four of your cards doesn't count.
assert.notStrictEqual(handName(bestOmaha(h('Kc 2h 2c 4d'), h('Th Jc Qd 9s 3h')).score), 'Straight', 'one hole card plus four on board is not a straight');
assert.strictEqual(handName(bestOmaha(h('Ac Kd 2h 2c'), h('Th Jc Qd 4s 3h')).score), 'Straight', 'AK + TJQ is broadway');
console.log('omaha hand rules: ok');

// Pot-limit cap: heads-up blinds 10/25, small blind first to act may raise to 75 (call 15, pot 50, raise 50).
{
  const t = new Table({ code: 'PLO', name: 'P', sb: 10, bb: 25, hostId: 'a', game: 'plo',
    timing: { turn: 60000, nextHand: 1e6, botMin: 0, botMax: 1, street: 0, runout: 0, start: 0, deal: 0, act: 0 } }, {});
  t.sit({ userId: 'a', name: 'A', avatar: { a: 0, c: 0 } }, 0, 2500);
  t.sit({ userId: 'b', name: 'B', avatar: { a: 0, c: 0 } }, 1, 2500);
  t.destroy(); t.startHand(); t.destroy();
  assert.strictEqual(t.seats[0].hand.length, 4); assert.strictEqual(t.seats[1].hand.length, 4);
  const first = t.toAct, uid = t.seats[first].userId;
  const v = t.view(uid);
  assert.strictEqual(v.actions.maxTo, 75, 'pot-sized raise from the small blind is to 75');
  assert.ok(v.actions.potLimit);
  t.act(first, 'raise', 99999); t.destroy();
  assert.strictEqual(t.seats[first].bet, 75, 'an over-pot raise is capped at the pot');
  // big blind facing 75: call 50 → pot 150 → may raise to 75 + 150 = 225
  const v2 = t.view(t.seats[t.toAct].userId);
  assert.strictEqual(v2.actions.maxTo, 225);
  // opponents' four cards are hidden
  assert.deepStrictEqual(v2.seats[first].cards, [null, null, null, null]);
  console.log('pot limit: ok');
}

// Many hands with bots and random legal play: chips conserved, every pot paid.
new Promise(resolve => {
  let done = 0, expected = 0;
  const hooks = {
    onHandEnd(tb, summary) {
      const total = tb.seats.reduce((a, s) => a + (s ? s.chips : 0), 0);
      assert.strictEqual(total, expected, 'chips conserved in PLO');
      assert.strictEqual(summary.reduce((a, r) => a + r.delta, 0), 0);
      tb.seats.forEach(s => { if (s && s.chips < tb.bb) { s.chips += 2000; expected += 2000; s.sittingOut = false; if (s.last === 'Busted') s.last = ''; } });
      if (++done >= 120) { tb.destroy(); resolve(); }
    },
  };
  const t = new Table({ code: 'PLO2', name: 'P', sb: 10, bb: 25, hostId: 'u0', game: 'plo',
    timing: { turn: 50, nextHand: 1, botMin: 0, botMax: 1, street: 0, runout: 0, start: 0, deal: 0, act: 0 } }, hooks);
  ['human', 'bot', 'human', 'bot'].forEach((k, i) => {
    if (k === 'bot') { t.addBot(i); t.seats[i].chips = 2500; } else t.sit({ userId: 'u' + i, name: 'P' + i, avatar: { a: 0, c: 0 } }, i, 2500);
    expected += 2500;
  });
  const iv = setInterval(() => {
    if (t.phase !== 'play' || t.toAct < 0) return;
    const s = t.seats[t.toAct]; if (!s || s.kind !== 'human') return;
    const r = Math.random(), toCall = t.currentBet - s.bet;
    if (r < 0.15) t.act(t.toAct, 'fold'); else if (r < 0.6) t.act(t.toAct, toCall ? 'call' : 'check'); else t.act(t.toAct, 'raise', 1e9);
    if (done >= 120) clearInterval(iv);
  }, 0);
}).then(() => { console.log('PLO: 120 hands, chips conserved'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
