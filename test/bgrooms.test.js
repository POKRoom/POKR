'use strict';
// Backgammon boards with money: buy in, play game after game against a bot (the player's turns are
// played by the timeout), the loser pays points × stake, and cashing out returns the right amount.
// Run: node test/bgrooms.test.js
const assert = require('assert');
const { createRooms, BUY_IN_POINTS } = require('../server/bgrooms');

const bank = { amy: 100000, ben: 100000 }, at = {};
let n = 0;
const rooms = createRooms({
  makeCode: () => 'B' + (++n),
  broadcast() {}, changed() {}, notify() {},
  charge(u, c) { if (bank[u] < c) return 'Not enough'; bank[u] -= c; return null; },
  credit(u, c) { bank[u] += c; },
  setAt(u, code, c) { if (c == null) delete at[u + code]; else at[u + code] = c; },
  timing: { think: [1, 2], roll: 3, move: 3, answer: 3, away: 3, between: 3, pass: 3 },
});

// stakes and buy-ins
assert.ok(rooms.create('amy', { name: 'Amy' }, { stake: 999999 }).code, 'an odd stake falls back to a real one');
const r1 = rooms.rooms.get('B1');
assert.strictEqual(r1.stake, 100); assert.strictEqual(r1.buyIn, 100 * BUY_IN_POINTS);
assert.strictEqual(bank.amy, 100000 - 3200);
assert.strictEqual(rooms.leave('amy', 'B1'), null);
assert.strictEqual(bank.amy, 100000, 'leaving before a game refunds the whole buy-in');

// a human against the bot, many games
const { code } = rooms.create('amy', { name: 'Amy' }, { stake: 25, vsBot: true });
const room = rooms.rooms.get(code);
assert.ok(room.isPrivate, 'a bot game is private');
assert.strictEqual(room.seats[1].kind, 'bot');
assert.ok(room.game, 'the game starts as soon as both seats are filled');
assert.ok(rooms.act('ben', code, { t: 'roll' }), 'someone not seated can’t act');

const results = [];
let topups = 0, lastBot = room.seats[1].stack;
const start = Date.now();
const iv = setInterval(() => {
  try {
    if (room.result && results[results.length - 1] !== room.result) {
      const r = room.result; results.push(r);
      assert.ok(r.paid <= r.points * room.stake, 'never pays more than points × stake');
      assert.ok(r.paid === r.points * room.stake || r.paid > 0, 'pays in full unless the loser ran short');
    }
    if (room.seats[1] && room.seats[1].stack === room.buyIn && lastBot < room.stake) topups++;
    if (room.seats[1]) lastBot = room.seats[1].stack;
    const s0 = room.seats[0];
    if (s0) assert.strictEqual(at['amy' + code], s0.stack, 'the stack at the board is tracked for refunds');
    if (results.length >= 12 && !room.result) {
      clearInterval(iv);
      const stack = room.seats[0].stack;
      // money adds up: every finished game moved exactly what it says between the two
      const won = results.filter(r => r.winnerName === 'Amy').reduce((a, r) => a + r.paid, 0);
      const lost = results.filter(r => r.winnerName !== 'Amy').reduce((a, r) => a + r.paid, 0);
      assert.strictEqual(stack, 25 * BUY_IN_POINTS + won - lost, 'stack = buy-in + won − lost');
      // leaving in the middle of a game concedes it at the current cube
      const live = room.game && room.game.phase !== 'over' ? Math.min(room.game.cube * room.stake, stack) : 0;
      assert.strictEqual(rooms.leave('amy', code), null);
      assert.strictEqual(bank.amy, 100000 - 25 * BUY_IN_POINTS + stack - live, 'cashing out returns the stack (less a conceded game)');
      assert.ok(!at['amy' + code], 'nothing left marked at the board');
      console.log(`bgrooms test passed: ${results.length} games against the bot, Amy ${won - lost >= 0 ? 'up' : 'down'} $${(Math.abs(won - lost) / 100).toFixed(2)} (${((Date.now() - start) / 1000).toFixed(1)}s)`);
      process.exit(0);
    }
    if (Date.now() - start > 60000) throw new Error('games didn’t finish: ' + JSON.stringify({ results: results.length, gameNo: room.gameNo, phase: room.game && room.game.phase, seats: room.seats.map(s => s && [s.name, s.stack]), board: room.game && room.game.board, dice: room.game && room.game.dice, turn: room.game && room.game.turn, result: !!room.result, deadline: room.deadline - Date.now(), timer: !!room.timer }));
  } catch (e) { console.error(e); process.exit(1); }
}, 2);
