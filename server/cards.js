'use strict';
// Cards are integers 0..51. rank = c % 13 + 2 (2..14), suit = floor(c / 13) (0 s, 1 h, 2 d, 3 c).
const crypto = require('crypto');

const HAND_NAMES = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
const rankOf = c => (c % 13) + 2;
const suitOf = c => Math.floor(c / 13);
const RANK_TXT = { 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const SUIT_TXT = ['s', 'h', 'd', 'c'];
const cardTxt = c => (RANK_TXT[rankOf(c)] || String(rankOf(c))) + SUIT_TXT[suitOf(c)];

// Fisher-Yates with a cryptographic RNG: the deck order is the one thing that must never be predictable.
function newDeck() {
  const d = [...Array(52).keys()];
  for (let i = d.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// Score a 5-card hand as one comparable number: category, then up to 5 tiebreak ranks in base 15.
function eval5(c) {
  const rs = c.map(rankOf).sort((a, b) => b - a);
  const s0 = suitOf(c[0]);
  const flush = c.every(x => suitOf(x) === s0);
  const cnt = {};
  for (const r of rs) cnt[r] = (cnt[r] || 0) + 1;
  const g = Object.entries(cnt).map(([r, n]) => [n, +r]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  let st = 0;
  if (g.length === 5) {
    if (rs[0] - rs[4] === 4) st = rs[0];
    else if (rs[0] === 14 && rs[1] === 5) st = 5; // wheel A-2-3-4-5
  }
  let cat, tb;
  if (st && flush) { cat = 8; tb = [st]; }
  else if (g[0][0] === 4) { cat = 7; tb = [g[0][1], g[1][1]]; }
  else if (g[0][0] === 3 && g[1][0] === 2) { cat = 6; tb = [g[0][1], g[1][1]]; }
  else if (flush) { cat = 5; tb = rs; }
  else if (st) { cat = 4; tb = [st]; }
  else if (g[0][0] === 3) { cat = 3; tb = g.map(x => x[1]); }
  else if (g[0][0] === 2 && g[1][0] === 2) { cat = 2; tb = g.map(x => x[1]); }
  else if (g[0][0] === 2) { cat = 1; tb = g.map(x => x[1]); }
  else { cat = 0; tb = rs; }
  let v = cat;
  for (let i = 0; i < 5; i++) v = v * 15 + (tb[i] || 0);
  return v;
}
const CAT_DIV = 15 ** 5;
const catOf = v => Math.floor(v / CAT_DIV);
const handName = v => HAND_NAMES[catOf(v)];

// Best 5 of 5-7 cards. Returns { score, five }.
function best(cards) {
  if (cards.length < 5) return null;
  let top = -1, five = null;
  const n = cards.length, pick = [];
  (function rec(s) {
    if (pick.length === 5) {
      const h = pick.map(i => cards[i]);
      const v = eval5(h);
      if (v > top) { top = v; five = h; }
      return;
    }
    for (let i = s; i <= n - (5 - pick.length); i++) { pick.push(i); rec(i + 1); pick.pop(); }
  })(0);
  return { score: top, five };
}
const bestScore = cards => best(cards).score;

// Monte Carlo win share against `opp` random hands. Only bots use this; it never sees anyone's real cards.
function equity(hand, board, opp, iters = 240) {
  const known = new Set([...hand, ...board]);
  const rest = [...Array(52).keys()].filter(c => !known.has(c));
  const needB = 5 - board.length, need = needB + opp * 2;
  let score = 0;
  for (let t = 0; t < iters; t++) {
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(Math.random() * (rest.length - i));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    const b = board.concat(rest.slice(0, needB));
    const mine = bestScore(hand.concat(b));
    let lost = false, ties = 0;
    for (let o = 0; o < opp; o++) {
      const off = needB + o * 2;
      const v = bestScore([rest[off], rest[off + 1], ...b]);
      if (v > mine) { lost = true; break; }
      if (v === mine) ties++;
    }
    if (!lost) score += 1 / (ties + 1);
  }
  return score / iters;
}


// Casual, spoken-style description: "two pair, kings and nines", "a flush, queen high".
const WORD = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', 11: 'jack', 12: 'queen', 13: 'king', 14: 'ace' };
const many = r => (r === 6 ? 'sixes' : WORD[r] + 's');
function describe(v) {
  const t = [];
  let x = v;
  for (let i = 0; i < 5; i++) { t.unshift(x % 15); x = Math.floor(x / 15); }
  switch (x) {
    case 0: return `${WORD[t[0]]} high`;
    case 1: return `a pair of ${many(t[0])}`;
    case 2: return `two pair, ${many(t[0])} and ${many(t[1])}`;
    case 3: return `three ${many(t[0])}`;
    case 4: return `a straight, ${WORD[t[0]]} high`;
    case 5: return `a flush, ${WORD[t[0]]} high`;
    case 6: return `a full house, ${many(t[0])} over ${many(t[1])}`;
    case 7: return `four ${many(t[0])}`;
    default: return t[0] === 14 ? 'a royal flush' : `a straight flush, ${WORD[t[0]]} high`;
  }
}

// Amounts are whole cents everywhere; this is the one place they become dollars for people to read.
function money(c) {
  const d = c / 100;
  return '$' + d.toLocaleString('en-US', Number.isInteger(d) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

module.exports = { money, describe, newDeck, eval5, best, bestScore, catOf, handName, equity, rankOf, suitOf, cardTxt, HAND_NAMES };
