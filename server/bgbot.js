'use strict';
// A backgammon bot: scores every legal play by the position it leaves, and decides on the cube.
// Hard plays the best play it sees; easy sometimes picks a worse one.
const { view, applyStep } = require('./backgammon');

// Chance (out of 36) that a checker this many pips away hits a blot, ignoring blocks.
const SHOT = [0, 11, 12, 14, 15, 15, 17, 6, 6, 5, 3, 2, 3, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1];

// Opponent's point of view mirrored into mine: opp checker on my mover point j sits at their point 25 - j.
function evaluate(v) {
  const { mine, opp } = v;
  let myPip = 25 * mine[25], oppPip = 0, myBack = 0, oppBack = 25;
  for (let i = 1; i <= 24; i++) {
    myPip += i * mine[i];
    if (mine[i]) myBack = Math.max(myBack, i);
    if (opp[i]) { oppPip += (25 - i) * opp[i]; oppBack = Math.min(oppBack, i); }
  }
  if (mine[25]) myBack = 25;
  oppPip += 25 * (v.oppBar || 0);
  if (v.oppBar) oppBack = 0;
  const contact = myBack > oppBack;
  let score = (oppPip - myPip) * 1.0 + v.off * 3;

  if (!contact) {
    // pure race: pips, and don't stack checkers deep
    let wastage = 0;
    for (let i = 1; i <= 3; i++) wastage += Math.max(0, mine[i] - 3) * (4 - i);
    return score * 1.4 - wastage * 0.6;
  }

  // points made, with the ones that block and trap valued more
  const PT = [0, 3, 4, 5, 8, 10, 9, 8, 5, 3, 2, 1.5, 1, 1, 1, 1, 1, 1, 1.5, 2, 2.5, 3, 3, 3, 0];
  let run = 0, best = 0;
  for (let i = 1; i <= 24; i++) {
    if (mine[i] >= 2) { score += PT[i]; run++; best = Math.max(best, run); } else run = 0;
    if (mine[i] > 3) score -= (mine[i] - 3) * 0.6;   // too many on one point
  }
  score += [0, 0, 1, 4, 9, 16, 26][Math.min(best, 6)];  // primes
  // their checkers on the bar against my home board
  const homeMade = [1, 2, 3, 4, 5, 6].filter(i => mine[i] >= 2).length;
  const oppHome = [19, 20, 21, 22, 23, 24].filter(i => opp[i] >= 2).length; // their home board, seen from me
  score += (v.oppBar || 0) * (6 + homeMade * 3);

  // blots: chance of being hit times the pips it would cost
  for (let i = 1; i <= 24; i++) {
    if (mine[i] !== 1) continue;
    let miss = 1;
    for (let j = 1; j < i; j++) {          // their checkers behind my blot (they move upward)
      if (!opp[j]) continue;
      const d = i - j;
      if (d < SHOT.length && SHOT[d]) miss *= 1 - (SHOT[d] / 36) * Math.min(1, opp[j] * 0.75 + 0.25);
    }
    // their checkers on the bar come in on my home board, so they shoot from "point 0"
    if (v.oppBar && i < SHOT.length && SHOT[i]) miss *= 1 - SHOT[i] / 36;
    const hitP = 1 - miss;
    score -= hitP * ((25 - i) + 8) * (oppHome >= 4 ? 1.1 : oppHome >= 2 ? 0.9 : 0.75);
  }
  // checkers left back while their home board closes get trapped (and risk a backgammon)
  for (let i = 19; i <= 25; i++) if (mine[i]) score -= mine[i] * oppHome * oppHome * 0.5 * (myPip < 120 ? 2 : 1);
  // an anchor in their home keeps me in the game
  for (let i = 19; i <= 24; i++) if (mine[i] >= 2) { score += 2.5; break; }
  return score;
}

// Walk a play from the current view and return the resulting view.
function after(v, play) {
  let cur = { ...v, hits: 0 };
  for (const st of play) cur = applyStep(cur, st.from, st.to);
  cur.oppBar = (v.oppBar || 0) + cur.hits;
  return cur;
}

// Pick a play (index into the game's legal plays). level: 'hard' | 'easy'.
function choosePlay(game, level = 'hard') {
  if (!game.plays || !game.plays.length || !game.plays[0].length) return -1;
  const v = view(game.board, game.turn);
  v.oppBar = game.board.bar[1 - game.turn];
  const scored = game.plays.map((pl, i) => ({ i, s: evaluate(after(v, pl)) + (level === 'easy' ? (Math.random() - 0.5) * 16 : 0) }));
  scored.sort((a, b) => b.s - a.s);
  if (level === 'easy' && scored.length > 2 && Math.random() < 0.25) return scored[1 + Math.floor(Math.random() * Math.min(3, scored.length - 1))].i;
  return scored[0].i;
}

// Chance that player p wins from here, for cube decisions. A logistic model fitted to about 80,000
// positions from 1,500 hard-vs-hard bot games; in each 10% band its estimate came within a few
// points of how often that player really won. The race counts for more as the game goes on.
const W = [0.208, -2.347, 3.424, 1.626];
function winChance(game, p) {
  const r = game.turn; // the player on roll (during a double, still the doubler)
  const v = view(game.board, r); v.oppBar = game.board.bar[1 - r];
  const ov = view(game.board, 1 - r); ov.oppBar = game.board.bar[r];
  let my = 25 * v.mine[25], op = 25 * ov.mine[25];
  for (let i = 1; i <= 24; i++) { my += i * v.mine[i]; op += i * ov.mine[i]; }
  const lo = Math.max(30, Math.min(my, op));
  const race = (op - my + 4) / lo, stage = 1 - lo / 200, pos = (evaluate(v) - evaluate(ov)) / 100;
  const q = 1 / (1 + Math.exp(-(W[0] + W[1] * race + W[2] * race * stage + W[3] * pos)));
  return p === r ? q : 1 - q;
}
const shouldDouble = (game, p, level = 'hard') => game.canDouble(p) && (() => { const w = winChance(game, p); return w > (level === 'easy' ? 0.75 : 0.68) && w < 0.9; })();
const shouldTake = (game, p, level = 'hard') => winChance(game, p) > (level === 'easy' ? 0.3 : 0.24);

module.exports = { evaluate, choosePlay, winChance, shouldDouble, shouldTake };
