'use strict';
// Backgammon rules, checked on hand-built positions, then hundreds of bot-vs-bot games played out.
// Run: node test/backgammon.test.js
const assert = require('assert');
const B = require('../server/backgammon');
const bot = require('../server/bgbot');

// Build a position. a/b: { point: count } for player 0 / player 1 (board points).
function pos({ a = {}, b = {}, bar = [0, 0], off = null }) {
  const pts = Array(26).fill(0);
  for (const [k, n] of Object.entries(a)) pts[k] += n;
  for (const [k, n] of Object.entries(b)) pts[k] -= n;
  const board = { pts, bar: bar.slice(), off: [0, 0] };
  board.off = off || [15 - B.count({ pts, bar, off: [0, 0] }, 0), 15 - B.count({ pts, bar, off: [0, 0] }, 1)];
  return board;
}
function gameAt(board, turn, dice) {
  const g = new B.Game();
  g.board = board; g.turn = turn; g._setDice(dice);
  return g;
}
const playsText = g => g.legal().map(p => p.map(s => `${s.from}/${s.to}`).join(' ')).sort();

// starting position
{
  const g = new B.Game();
  assert.strictEqual(B.count(g.board, 0), 15); assert.strictEqual(B.count(g.board, 1), 15);
  assert.strictEqual(B.pips(g.board, 0), 167); assert.strictEqual(B.pips(g.board, 1), 167);
  assert.strictEqual(g.rollOpening(), null);
  assert.ok(g.turn === 0 || g.turn === 1);
  assert.notStrictEqual(g.dice[0], g.dice[1], 'the opening roll is never a double');
  assert.ok(g.legal().length > 0);
}
// a checker on the bar must come in first; a closed board means no move
{
  const g = gameAt(pos({ a: { 13: 5, 6: 5 }, b: { 19: 2, 21: 2, 22: 2, 23: 2, 24: 2 }, bar: [1, 0] }), 0, [5, 3]);
  for (const p of g.legal()) assert.strictEqual(p[0].from, 'bar', 'enter from the bar first');
  assert.ok(playsText(g).every(t => t.startsWith('bar/20')), 'only the 5 enters (point 20)');
  const closed = gameAt(pos({ a: { 13: 5 }, b: { 19: 2, 20: 2, 21: 2, 22: 2, 23: 2, 24: 2 }, bar: [1, 0] }), 0, [6, 2]);
  assert.ok(closed.noMoves, 'nothing to do against a closed board');
  assert.strictEqual(closed.move(0, []), null, 'passing is the only play');
  assert.strictEqual(closed.turn, 1);
}
// must use both dice when possible; if only one fits, it must be the larger
{
  // 13 -> 8 (5) is open, 13 -> 7 (6) blocked, and 8 -> 2 blocked: only the 5 can be played
  const g = gameAt(pos({ a: { 13: 1 }, b: { 7: 2, 2: 2 } }), 0, [6, 5]);
  assert.deepStrictEqual(playsText(g), ['13/8']);
  // both 13 -> 7 and 13 -> 8 are open, but either way the second die lands on blocked 2: play the 6
  const h = gameAt(pos({ a: { 13: 1 }, b: { 2: 2 } }), 0, [6, 5]);
  assert.deepStrictEqual(playsText(h), ['13/7']);
  // when both dice can be used, a play using only one is not allowed
  const k = gameAt(pos({ a: { 13: 2 } }), 0, [6, 5]);
  assert.ok(k.legal().every(p => p.length === 2));
  assert.ok(k.move(0, [{ from: 13, to: 7 }]), 'one die alone is refused');
}
// doubles play four times
{
  const g = gameAt(pos({ a: { 13: 5, 6: 5, 8: 3, 24: 2 } }), 0, [3, 3]);
  assert.ok(g.legal().every(p => p.length === 4));
}
// bearing off, including the higher-die rule
{
  const g = gameAt(pos({ a: { 3: 1, 2: 1 } }), 0, [6, 5]);
  assert.ok(g.legal().some(p => p.every(s => s.to === 'off')), 'both checkers come off');
  const v = B.view(pos({ a: { 6: 1, 4: 1 } }), 0);
  assert.strictEqual(B.stepTarget(v, 4, 5), -1, 'a 5 can’t bear off the 4 while a checker sits on 6');
  assert.strictEqual(B.stepTarget(v, 6, 5), 1, 'the 6 moves down instead');
  const w = B.view(pos({ a: { 4: 1, 2: 1 } }), 0);
  assert.strictEqual(B.stepTarget(w, 4, 6), 0, 'a 6 bears off the farthest checker (the 4)');
  assert.strictEqual(B.stepTarget(w, 2, 6), -1, 'but not one behind it');
  // can't bear off with a checker outside home
  const x = B.view(pos({ a: { 7: 1, 2: 1 } }), 0);
  assert.strictEqual(B.stepTarget(x, 2, 2), -1, 'not while one is still outside home');
}
// hitting sends the checker to the bar; player 1 moves the other way
{
  const h = gameAt(pos({ a: { 8: 1, 24: 1 }, b: { 1: 2 } }), 1, [6, 1]);
  const hit = h.legal().find(p => p.some(s => s.to === 8));
  assert.ok(hit, 'player 1 can hit the blot on 8 (1 + 6 + 1)');
  assert.strictEqual(h.move(1, hit), null);
  assert.strictEqual(h.board.bar[0], 1, 'player 0 is on the bar');
  assert.strictEqual(B.count(h.board, 0), 15); assert.strictEqual(B.count(h.board, 1), 15);
}
// scoring: single, gammon, backgammon
{
  assert.strictEqual(B.resultKind(pos({ a: {}, b: { 20: 10 }, off: [15, 5] }), 0), 1);
  assert.strictEqual(B.resultKind(pos({ a: {}, b: { 20: 15 }, off: [15, 0] }), 0), 2);
  assert.strictEqual(B.resultKind(pos({ a: {}, b: { 20: 14, 3: 1 }, off: [15, 0] }), 0), 3, 'a checker in the winner’s home');
  assert.strictEqual(B.resultKind(pos({ a: {}, b: { 20: 14 }, bar: [0, 1], off: [15, 0] }), 0), 3, 'a checker on the bar');
}
// the cube
{
  const g = new B.Game(); g.turn = 0; g.phase = 'roll';
  assert.ok(g.canDouble(0)); assert.ok(!g.canDouble(1), 'only on your own turn');
  assert.strictEqual(g.double(0), null); assert.ok(g.take(0), 'the doubler can’t take their own');
  assert.strictEqual(g.take(1), null);
  assert.strictEqual(g.cube, 2); assert.strictEqual(g.cubeOwner, 1);
  assert.ok(!g.canDouble(0), 'the doubler gave up the cube');
  g.roll(0, [3, 1]); g.move(0, g.legal()[0]);
  assert.ok(g.canDouble(1), 'the owner can redouble');
  assert.strictEqual(g.double(1), null); assert.strictEqual(g.drop(0), null);
  assert.deepStrictEqual(g.result, { winner: 1, kind: 1, points: 2, dropped: true }, 'a drop pays the cube as it stood');
}
console.log('backgammon rules: ok');

// ---- bots play it out ----
let wins = [0, 0], kinds = [0, 0, 0, 0], doubles = 0, games = 400, turns = 0;
for (let n = 0; n < games; n++) {
  const g = new B.Game();
  g.rollOpening();
  const level = p => ((p + n) % 2 === 0 ? 'hard' : 'easy');
  for (let guard = 0; g.phase !== 'over'; guard++) {
    assert.ok(guard < 2000, 'game ends');
    const p = g.turn;
    if (g.phase === 'roll') {
      if (bot.shouldDouble(g, p, level(p))) { g.double(p); doubles++; if (bot.shouldTake(g, 1 - p, level(1 - p))) g.take(1 - p); else g.drop(1 - p); continue; }
      g.roll(p);
    }
    if (g.phase === 'move') {
      const i = bot.choosePlay(g, level(p));
      assert.strictEqual(g.move(p, i < 0 ? [] : g.legal()[i]), null);
      turns++;
      assert.strictEqual(B.count(g.board, 0), 15, 'player 0 always has 15 checkers');
      assert.strictEqual(B.count(g.board, 1), 15, 'player 1 always has 15 checkers');
    }
  }
  const w = g.result.winner;
  if (level(w) === 'hard') wins[0]++; else wins[1]++;
  kinds[g.result.kind]++;
  assert.ok([1, 2, 4, 8, 16, 32, 64].includes(g.result.points / g.result.kind), 'points are cube × kind');
}
const rate = wins[0] / games;
assert.ok(rate > 0.55, `the hard bot should beat the easy one (won ${(rate * 100).toFixed(0)}%)`);
console.log(`backgammon test passed: ${games} bot games, ${turns} turns, hard bot won ${(rate * 100).toFixed(0)}%, ${kinds[2]} gammons, ${kinds[3]} backgammons, ${doubles} doubles`);
