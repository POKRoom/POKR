'use strict';
// Backgammon rules: the board, fair dice, every legal play, the doubling cube and scoring.
// No money here; the table (bgtable.js) handles stakes. Shared by the server and the preview.
//
// The board is points 1..24. Player 0 moves from 24 down to 1 and bears off below 1; player 1
// moves from 1 up to 24 and bears off above 24. pts[i] counts checkers on point i: positive for
// player 0, negative for player 1. bar[p] and off[p] count each player's checkers there.
//
// Inside the move generator everything is turned to the mover's point of view ("mover points"):
// the mover always heads from 24 toward 1, the bar is 25, and bearing off is 0.
const crypto = require('crypto');

const START = () => {
  const pts = Array(26).fill(0);
  pts[24] = 2; pts[13] = 5; pts[8] = 3; pts[6] = 5;      // player 0
  pts[1] = -2; pts[12] = -5; pts[17] = -3; pts[19] = -5; // player 1
  return { pts, bar: [0, 0], off: [0, 0] };
};
const die = () => crypto.randomInt(6) + 1;

// ---- point-of-view helpers ----
const toMover = (p, i) => (p === 0 ? i : 25 - i);       // board point -> mover point (both ways)
function view(b, p) {
  // mine[i] / opp[i] for mover points 1..24; mine[25] is my bar
  const mine = Array(26).fill(0), opp = Array(26).fill(0);
  for (let i = 1; i <= 24; i++) {
    const v = b.pts[i], m = toMover(p, i);
    if (p === 0 ? v > 0 : v < 0) mine[m] = Math.abs(v);
    else if (v) opp[m] = Math.abs(v);
  }
  mine[25] = b.bar[p];
  return { mine, opp, off: b.off[p] };
}

// Can the mover move one checker from mover point s using a die of d? Returns the target (0 = off) or -1.
function stepTarget(v, s, d) {
  if (v.mine[s] <= 0) return -1;
  if (v.mine[25] > 0 && s !== 25) return -1;            // must enter from the bar first
  const t = s - d;
  if (t >= 1) return v.opp[t] >= 2 ? -1 : t;
  // bearing off: every checker home (points 1..6)
  for (let i = 7; i <= 25; i++) if (v.mine[i] > 0) return -1;
  if (t === 0) return 0;
  for (let i = s + 1; i <= 6; i++) if (v.mine[i] > 0) return -1; // a higher roll only bears off the farthest checker
  return 0;
}
function applyStep(v, s, t) {
  const n = { mine: v.mine.slice(), opp: v.opp.slice(), off: v.off, hits: v.hits || 0 };
  n.mine[s]--;
  if (t === 0) n.off++;
  else {
    if (n.opp[t] === 1) { n.opp[t] = 0; n.hits++; }
    n.mine[t]++;
  }
  return n;
}

// Every legal play for this roll, as lists of steps [{ from, to, die }] in mover points.
// Rules: use as many dice as possible; if only one of two dice can be used, it must be the larger
// when the larger can be played.
function playsFor(v, dice) {
  const seqs = [];
  const order = dice[0] === dice[1] ? [[dice[0], dice[0], dice[0], dice[0]]] : [[dice[0], dice[1]], [dice[1], dice[0]]];
  for (const ds of order) {
    (function rec(cur, idx, path) {
      if (idx === ds.length) { seqs.push(path); return; }
      let moved = false;
      for (let s = 25; s >= 1; s--) {
        const t = stepTarget(cur, s, ds[idx]);
        if (t < 0) continue;
        moved = true;
        rec(applyStep(cur, s, t), idx + 1, path.concat([{ from: s, to: t, die: ds[idx] }]));
      }
      if (!moved) seqs.push(path);
    })(v, 0, []);
  }
  const most = Math.max(0, ...seqs.map(s => s.length));
  let keep = seqs.filter(s => s.length === most);
  if (most === 1 && dice[0] !== dice[1]) {
    const big = Math.max(dice[0], dice[1]);
    if (keep.some(s => s[0].die === big)) keep = keep.filter(s => s[0].die === big);
  }
  // drop exact duplicates (doubles generate many)
  const seen = new Set(), out = [];
  for (const s of keep) { const k = s.map(x => `${x.from}-${x.to}`).join(','); if (!seen.has(k)) { seen.add(k); out.push(s); } }
  return out;
}

// Mover-point step -> board step for the client: from 'bar' or 1..24, to 'off' or 1..24.
const stepToBoard = (p, s) => ({ from: s.from === 25 ? 'bar' : toMover(p, s.from), to: s.to === 0 ? 'off' : toMover(p, s.to), die: s.die });
const stepFromBoard = (p, s) => ({ from: s.from === 'bar' ? 25 : toMover(p, s.from), to: s.to === 'off' ? 0 : toMover(p, s.to) });

// Apply one board step to the real board (already known to be legal).
function applyBoard(b, p, st) {
  const sign = p === 0 ? 1 : -1, o = 1 - p;
  if (st.from === 'bar') b.bar[p]--; else b.pts[st.from] -= sign;
  if (st.to === 'off') b.off[p]++;
  else {
    if (b.pts[st.to] === -sign) { b.pts[st.to] = 0; b.bar[o]++; }
    b.pts[st.to] += sign;
  }
}

const pips = (b, p) => { const v = view(b, p); let n = 25 * v.mine[25]; for (let i = 1; i <= 24; i++) n += i * v.mine[i]; return n; };
const count = (b, p) => { let n = b.bar[p] + b.off[p]; for (let i = 1; i <= 24; i++) if (p === 0 ? b.pts[i] > 0 : b.pts[i] < 0) n += Math.abs(b.pts[i]); return n; };

// 1 single, 2 gammon (loser bore off none), 3 backgammon (and still has one on the bar or in the winner's home).
function resultKind(b, winner) {
  const l = 1 - winner;
  if (b.off[l] > 0) return 1;
  if (b.bar[l] > 0) return 3;
  const v = view(b, l);
  for (let i = 19; i <= 24; i++) if (v.mine[i] > 0) return 3; // winner's home seen from the loser
  return 2;
}

// One game, start to finish: the opening roll, turns, the cube, and the result.
class Game {
  constructor({ startCube = 1 } = {}) {
    this.board = START();
    this.cube = startCube; this.cubeOwner = null; // null = centred
    this.turn = null; this.dice = null; this.plays = null; this.played = [];
    this.phase = 'opening'; // opening | roll | move | doubled | over
    this.result = null;     // { winner, kind, points, dropped }
    this.opening = null;
    this.log = [];
  }
  // Each player rolls one die; the higher plays both numbers first. Ties roll again.
  rollOpening() {
    if (this.phase !== 'opening') return 'Not now';
    let a, b; do { a = die(); b = die(); this.log.push(`Opening roll ${a} and ${b}`); } while (a === b);
    this.opening = [a, b];
    this.turn = a > b ? 0 : 1;
    this._setDice([a, b]);
    return null;
  }
  canDouble(p) {
    return this.phase === 'roll' && this.turn === p && this.cube < 64 && (this.cubeOwner === null || this.cubeOwner === p);
  }
  roll(p, fixed) {
    if (this.phase !== 'roll' || this.turn !== p) return 'Not your roll';
    this._setDice(fixed || [die(), die()]);
    return null;
  }
  _setDice(d) {
    this.dice = d;
    const v = view(this.board, this.turn);
    this.plays = playsFor(v, d);
    this.played = [];
    this.phase = 'move';
    if (!this.plays.length || !this.plays[0].length) { this.log.push(`${this.turn} rolled ${d.join('-')}: no legal moves`); this.noMoves = true; }
    else this.noMoves = false;
  }
  // The legal plays in board steps, for the client and the bot.
  legal() { return (this.plays || []).map(s => s.map(st => stepToBoard(this.turn, st))); }
  // Play a whole turn at once: steps in board form. Must match one legal play exactly (in order).
  move(p, steps) {
    if (this.phase !== 'move' || this.turn !== p) return 'Not your move';
    if (this.noMoves) { if (steps && steps.length) return 'No legal moves this roll'; return this._endTurn(); }
    const want = (steps || []).map(s => stepFromBoard(p, s));
    const match = this.plays.find(pl => pl.length === want.length && pl.every((st, i) => st.from === want[i].from && st.to === want[i].to));
    if (!match) return 'That isn’t a legal play for this roll';
    for (const st of match) applyBoard(this.board, p, stepToBoard(p, st));
    this.played = match.map(st => stepToBoard(p, st));
    if (this.board.off[p] === 15) return this._finish(p, resultKind(this.board, p), false);
    return this._endTurn();
  }
  _endTurn() {
    this.turn = 1 - this.turn; this.dice = null; this.plays = null; this.phase = 'roll';
    return null;
  }
  double(p) {
    if (!this.canDouble(p)) return 'You can’t double now';
    this.phase = 'doubled'; this.offeredBy = p;
    return null;
  }
  take(p) {
    if (this.phase !== 'doubled' || this.offeredBy === p) return 'Nothing to take';
    this.cube *= 2; this.cubeOwner = p; this.phase = 'roll';
    return null;
  }
  drop(p) {
    if (this.phase !== 'doubled' || this.offeredBy === p) return 'Nothing to drop';
    return this._finish(this.offeredBy, 1, true);
  }
  resign(p) { if (this.phase === 'over') return 'Game over'; return this._finish(1 - p, 1, true); }
  _finish(winner, kind, dropped) {
    this.phase = 'over';
    this.result = { winner, kind, points: this.cube * kind, dropped };
    return null;
  }
}

module.exports = { Game, START, view, playsFor, stepTarget, applyStep, stepToBoard, stepFromBoard, applyBoard, pips, count, resultKind, toMover, die };
