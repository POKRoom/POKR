'use strict';
// Computer players, for practice and for filling a short-handed table. They estimate their odds by
// simulation against random hands; they never look at anyone's real cards.
const { equity } = require('./cards');

const STYLES = {
  rock:   { loose: 0.10, aggr: 0.35 },
  loose:  { loose: 0.35, aggr: 0.55 },
  aggro:  { loose: 0.20, aggr: 0.85 },
  caller: { loose: 0.50, aggr: 0.25 },
};
const ROSTER = [
  { name: 'Rook', style: 'rock', color: 0 },
  { name: 'Mae', style: 'loose', color: 1 },
  { name: 'Dex', style: 'aggro', color: 2 },
  { name: 'Juno', style: 'caller', color: 3 },
  { name: 'Ozzie', style: 'aggro', color: 4 },
  { name: 'Pilar', style: 'rock', color: 5 },
];

function decide(t, i) {
  const p = t.seats[i];
  const st = STYLES[p.style] || STYLES.rock;
  const toCall = t.currentBet - p.bet;
  const opp = Math.max(1, t.seats.filter(s => s && s.dealt && !s.folded).length - 1);
  const eq = equity(p.hand, t.board, opp, t.board.length ? 220 : 180);
  const rel = eq * (opp + 1); // 1.0 = an average hand in this spot
  const pot = t.potTotal();
  const r = Math.random();
  const noise = (Math.random() - 0.5) * 0.08;
  const sizeFor = f => {
    const x = t.currentBet + Math.max(t.minRaise, Math.round((pot * f) / t.sb) * t.sb);
    return Math.min(x, p.bet + p.chips);
  };
  const canRaise = p.chips > toCall && t.raises < 3;

  if (toCall === 0) {
    if (canRaise && ((rel > 1.45 && r < 0.4 + st.aggr * 0.55) || r < st.aggr * 0.12)) {
      return { kind: 'raise', amount: sizeFor(rel > 2 ? 0.75 : 0.5) };
    }
    return { kind: 'check' };
  }

  if (!t.board.length) {
    const big = toCall > t.bb * 4;
    const need = (big ? 1.25 : 0.92) - st.loose * 0.35 + noise;
    if (rel < need && !(toCall <= t.sb && r < 0.6)) return { kind: 'fold' };
    if (canRaise && rel > 1.55 && r < st.aggr + 0.15) return { kind: 'raise', amount: sizeFor(0.9) };
    if (toCall >= p.chips * 0.6 && rel < 1.5 && r > st.loose) return { kind: 'fold' };
    return { kind: 'call' };
  }

  const odds = toCall / (pot + toCall);
  const fair = eq + st.loose * 0.06 + noise;
  if (fair < odds) return { kind: 'fold' };
  if (canRaise && rel > 1.75 && r < st.aggr + 0.15) return { kind: 'raise', amount: sizeFor(0.8) };
  if (toCall >= p.chips * 0.5 && rel < 1.35 && r > st.loose) return { kind: 'fold' };
  return { kind: 'call' };
}

module.exports = { decide, ROSTER, STYLES };
