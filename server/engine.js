'use strict';
// The table engine. The server is the only place cards exist: clients get a personalized view
// with their own hole cards and nobody else's until showdown.
const { newDeck, best, handName, cardTxt } = require('./cards');
const bots = require('./bots');

const handReset = () => ({
  hand: [], dealt: false, folded: false, allIn: false, bet: 0, total: 0,
  acted: false, shown: false, last: '', won: 0, score: null, best: null, startChips: 0,
});

class Table {
  constructor(opts, hooks = {}) {
    this.code = opts.code;
    this.name = opts.name;
    this.sb = opts.sb;
    this.bb = opts.bb;
    this.hostId = opts.hostId;
    this.isPrivate = !!opts.isPrivate;
    this.maxSeats = opts.maxSeats || 6;
    this.seats = Array(this.maxSeats).fill(null);
    const k = Number(process.env.TIMING_SCALE) || 1; // tests speed the table up
    this.timing = Object.assign({
      turn: Number(process.env.TURN_MS) || 30000,
      nextHand: 5500 * k, botMin: 800 * k, botMax: 1700 * k, street: 650 * k, runout: 1300 * k, start: 1500 * k, deal: 350 * k, act: 250 * k,
    }, opts.timing || {});
    this.hooks = hooks;
    this.phase = 'waiting';      // waiting | play | done
    this.handNo = 0;
    this.dealer = -1;
    this.board = [];
    this.deck = [];
    this.street = '';
    this.currentBet = 0;
    this.minRaise = this.bb;
    this.raises = 0;
    this.toAct = -1;
    this.result = null;
    this.log = [];
    this.chat = [];
    this.timer = null;
    this.turnDeadline = 0;
    this.nextHandAt = 0;
    this.lastActive = Date.now();
  }

  get buyInMin() { return this.bb * 20; }
  get buyInMax() { return this.bb * 100; }

  // ---------- helpers ----------
  _log(t) { this.log.push(t); if (this.log.length > 80) this.log.shift(); }
  _changed() { this.lastActive = Date.now(); if (this.hooks.onChange) this.hooks.onChange(this); }
  _later(fn, ms) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      try { fn(); } catch (e) { console.error('[table ' + this.code + ']', e); }
    }, ms);
  }
  destroy() { clearTimeout(this.timer); this.timer = null; }

  nextIdx(i, pred) {
    const n = this.seats.length;
    for (let k = 1; k <= n; k++) { const j = (((i + k) % n) + n) % n; if (pred(this.seats[j], j)) return j; }
    return -1;
  }
  static inHand(s) { return !!(s && s.dealt && !s.folded); }
  static canAct(s) { return Table.inHand(s) && !s.allIn; }
  inHandCount() { return this.seats.filter(Table.inHand).length; }
  potTotal() { return this.seats.reduce((a, s) => a + (s ? s.total : 0), 0); }
  seatOf(userId) { return this.seats.findIndex(s => s && s.kind === 'human' && s.userId === userId); }
  eligible(s) { return !!(s && !s.leaving && !s.sittingOut && s.chips > 0); }
  humanCount() { return this.seats.filter(s => s && s.kind === 'human').length; }
  canStart() {
    const el = this.seats.filter(s => this.eligible(s));
    return el.length >= 2 && el.some(s => s.kind === 'human' && s.connected);
  }

  // ---------- seating ----------
  sit(player, idx, chips) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= this.seats.length) return 'That seat does not exist';
    if (this.seats[idx]) return 'That seat is taken';
    if (this.seatOf(player.userId) >= 0) return 'You already have a seat here';
    this.seats[idx] = Object.assign({
      kind: 'human', userId: player.userId, name: player.name, avatar: player.avatar,
      chips, sittingOut: false, connected: true, timeouts: 0, leaving: false, disconnectedAt: 0,
    }, handReset());
    this._log(`${player.name} sits down with ${chips}`);
    this.maybeStart();
    this._changed();
    return null;
  }

  addBot(idx) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= this.seats.length || this.seats[idx]) return 'Pick an empty seat';
    const used = new Set(this.seats.filter(Boolean).map(s => s.name));
    const pick = bots.ROSTER.find(b => !used.has(b.name));
    if (!pick) return 'No bots left';
    this.seats[idx] = Object.assign({
      kind: 'bot', userId: null, name: pick.name, style: pick.style, avatar: { a: -1, c: pick.color },
      chips: this.buyInMax, sittingOut: false, connected: true, timeouts: 0, leaving: false,
    }, handReset());
    this._log(`${pick.name} (bot) joins the table`);
    this.maybeStart();
    this._changed();
    return null;
  }

  removeSeat(idx) {
    const s = this.seats[idx];
    if (!s) return;
    if (this.phase === 'play' && s.dealt) {
      s.leaving = true;
      if (Table.canAct(s)) this._foldOutOfTurn(idx, 'Left');
      this._changed();
      return;
    }
    this._remove(idx);
    this._changed();
    this.maybeStart();
  }

  stand(userId) {
    const i = this.seatOf(userId);
    if (i < 0) return;
    this.removeSeat(i);
  }

  _foldOutOfTurn(i, label) {
    const s = this.seats[i];
    if (this.toAct === i) { this.act(i, 'fold', 0, true); s.last = label; return; }
    s.folded = true;
    s.last = label;
    this._log(`${s.name} folds`);
    if (this.inHandCount() <= 1) this._later(() => this.advance(), this.timing.act);
  }

  _remove(i) {
    const s = this.seats[i];
    if (!s) return;
    this.seats[i] = null;
    this._log(`${s.name} leaves the table`);
    if (s.kind === 'human' && this.hooks.onStand) this.hooks.onStand(this, s.userId, s.chips);
  }

  rebuy(userId, amount) {
    const i = this.seatOf(userId);
    if (i < 0) return 'Take a seat first';
    const s = this.seats[i];
    if (this.phase === 'play' && Table.inHand(s)) return 'You can add chips after this hand';
    s.chips += amount;
    s.sittingOut = false;
    s.timeouts = 0;
    if (s.last === 'Busted') s.last = '';
    this._log(`${s.name} adds ${amount} chips`);
    this.maybeStart();
    this._changed();
    return null;
  }

  setSittingOut(userId, out) {
    const i = this.seatOf(userId);
    if (i < 0) return;
    const s = this.seats[i];
    s.sittingOut = !!out;
    s.timeouts = 0;
    if (!out) this.maybeStart();
    this._changed();
  }

  setConnected(userId, on) {
    const i = this.seatOf(userId);
    if (i < 0) return;
    const s = this.seats[i];
    s.connected = on;
    s.disconnectedAt = on ? 0 : Date.now();
    if (!on && this.phase === 'play' && this.toAct === i) {
      const left = Math.max(0, Math.min(this.turnDeadline - Date.now(), 8000));
      this.turnDeadline = Date.now() + left;
      this._later(() => this.timeout(i), left);
    }
    if (on) this.maybeStart();
    this._changed();
  }

  maybeStart() {
    if (this.phase !== 'waiting' || this.timer) return;
    if (!this.canStart()) return;
    this.nextHandAt = Date.now() + this.timing.start;
    this._later(() => this.startHand(), this.timing.start);
  }

  // ---------- hand flow ----------
  startHand() {
    if (this.phase === 'play') return;
    this.seats.forEach((s, i) => { if (s && s.leaving) this._remove(i); });
    for (const s of this.seats) {
      if (!s) continue;
      if (s.kind === 'bot' && s.chips < this.bb) { s.chips = this.buyInMax; this._log(`${s.name} reloads`); }
      if (s.kind === 'human' && s.chips <= 0) s.sittingOut = true;
    }
    if (!this.canStart()) {
      this.phase = 'waiting';
      this.board = [];
      this.result = null;
      this.toAct = -1;
      this.nextHandAt = 0;
      this.seats.forEach(s => { if (s) { const keep = s.last === 'Busted' ? 'Busted' : ''; Object.assign(s, handReset()); s.last = keep; } });
      this._changed();
      return;
    }

    this.handNo++;
    this.deck = newDeck();
    this.board = [];
    this.result = null;
    this.raises = 0;
    this.nextHandAt = 0;
    for (const s of this.seats) {
      if (!s) continue;
      Object.assign(s, handReset());
      s.dealt = this.eligible(s);
      s.startChips = s.chips;
    }
    const dealt = s => !!(s && s.dealt);
    this.dealer = this.nextIdx(this.dealer, dealt);
    const n = this.seats.filter(dealt).length;
    const sbI = n === 2 ? this.dealer : this.nextIdx(this.dealer, dealt);
    const bbI = this.nextIdx(sbI, dealt);
    this._log(`Hand #${this.handNo}`);
    this._put(this.seats[sbI], this.sb); this.seats[sbI].last = 'Small blind';
    this._put(this.seats[bbI], this.bb); this.seats[bbI].last = 'Big blind';
    for (let r = 0; r < 2; r++) {
      for (let k = 1; k <= this.seats.length; k++) {
        const s = this.seats[(this.dealer + k) % this.seats.length];
        if (dealt(s)) s.hand.push(this.deck.pop());
      }
    }
    this.currentBet = this.bb;
    this.minRaise = this.bb;
    this.street = 'Pre-flop';
    this.phase = 'play';
    this.toAct = this.nextIdx(bbI, Table.canAct);
    this._changed();
    this._later(() => this.advance(), this.timing.deal);
  }

  _put(s, amt) {
    amt = Math.max(0, Math.min(Math.floor(amt), s.chips));
    s.chips -= amt; s.bet += amt; s.total += amt;
    if (s.chips === 0) s.allIn = true;
    return amt;
  }

  roundDone() {
    const live = this.seats.filter(Table.canAct);
    if (live.length === 0) return true;
    if (live.length === 1 && live[0].bet >= this.currentBet) return true;
    return live.every(s => s.acted && s.bet === this.currentBet);
  }

  advance() {
    if (this.phase !== 'play') return;
    if (this.inHandCount() <= 1) return this.finishFold();
    if (this.roundDone()) return this.nextStreet();
    let s = this.seats[this.toAct];
    if (!Table.canAct(s)) {
      this.toAct = this.nextIdx(this.toAct < 0 ? this.dealer : this.toAct, Table.canAct);
      s = this.seats[this.toAct];
    }
    const i = this.toAct;
    if (s.kind === 'bot') {
      this.turnDeadline = 0;
      this._changed();
      const { botMin, botMax } = this.timing;
      this._later(() => this.botTurn(i), botMin + Math.random() * (botMax - botMin));
    } else {
      const ms = (!s.connected || s.sittingOut) ? Math.min(this.timing.turn, 6000) : this.timing.turn;
      this.turnDeadline = Date.now() + ms;
      this._changed();
      this._later(() => this.timeout(i), ms);
    }
  }

  botTurn(i) {
    if (this.phase !== 'play' || this.toAct !== i) return;
    const d = bots.decide(this, i);
    const err = this.act(i, d.kind, d.amount, true);
    if (err) this.act(i, this.currentBet - this.seats[i].bet === 0 ? 'check' : 'fold', 0, true);
  }

  timeout(i) {
    if (this.phase !== 'play' || this.toAct !== i) return;
    const s = this.seats[i];
    s.timeouts++;
    if (s.timeouts >= 2) s.sittingOut = true;
    const toCall = this.currentBet - s.bet;
    this._log(`${s.name} ran out of time`);
    this.act(i, toCall === 0 ? 'check' : 'fold', 0, true);
  }

  // Returns an error message, or null when the action was applied.
  act(i, kind, amount, auto = false) {
    if (this.phase !== 'play' || this.toAct !== i) return 'It’s not your turn';
    const s = this.seats[i];
    if (!Table.canAct(s)) return 'It’s not your turn';
    if (!['fold', 'check', 'call', 'raise'].includes(kind)) return 'Unknown action';
    const toCall = this.currentBet - s.bet;
    if (kind === 'call' && toCall === 0) kind = 'check';
    if (kind === 'check' && toCall > 0) return 'You need to call or fold';
    if (kind === 'raise') {
      const max = s.bet + s.chips;
      if (s.chips <= toCall) return 'You don’t have enough chips to raise';
      const min = Math.min(this.currentBet + this.minRaise, max);
      amount = Math.floor(Number(amount));
      if (!Number.isFinite(amount)) return 'Enter a raise amount';
      amount = Math.max(min, Math.min(max, amount));
    }
    clearTimeout(this.timer); this.timer = null;
    this.turnDeadline = 0;

    if (kind === 'fold') { s.folded = true; s.last = 'Fold'; this._log(`${s.name} folds`); }
    else if (kind === 'check') { s.last = 'Check'; this._log(`${s.name} checks`); }
    else if (kind === 'call') {
      const a = this._put(s, toCall);
      s.last = s.allIn ? 'All in' : `Call ${a}`;
      this._log(`${s.name} calls ${a}${s.allIn ? ' and is all in' : ''}`);
    } else {
      const prev = this.currentBet;
      this._put(s, amount - s.bet);
      if (s.bet > prev) {
        const size = s.bet - prev;
        if (size >= this.minRaise) {
          this.minRaise = size;
          this.seats.forEach(o => { if (o && o !== s) o.acted = false; });
        }
        this.currentBet = s.bet;
        this.raises++;
      }
      s.last = s.allIn ? 'All in' : (prev === 0 ? `Bet ${s.bet}` : `Raise ${s.bet}`);
      this._log(`${s.name} ${prev === 0 ? 'bets' : 'raises to'} ${s.bet}${s.allIn ? ' (all in)' : ''}`);
    }
    if (!auto && s.kind === 'human') s.timeouts = 0;
    s.acted = true;
    // Nobody may act in the short gap before the next street or the payout.
    this.toAct = (this.inHandCount() <= 1 || this.roundDone()) ? -1 : this.nextIdx(i, Table.canAct);
    this._changed();
    this._later(() => this.advance(), this.timing.act);
    return null;
  }

  nextStreet() {
    for (const s of this.seats) {
      if (!s) continue;
      s.bet = 0; s.acted = false;
      if (Table.canAct(s)) s.last = '';
    }
    this.currentBet = 0;
    this.minRaise = this.bb;
    this.raises = 0;
    if (this.street === 'River') return this.showdown();
    this.deck.pop(); // burn
    if (this.street === 'Pre-flop') { this.board.push(this.deck.pop(), this.deck.pop(), this.deck.pop()); this.street = 'Flop'; }
    else if (this.street === 'Flop') { this.board.push(this.deck.pop()); this.street = 'Turn'; }
    else { this.board.push(this.deck.pop()); this.street = 'River'; }
    this._log(`${this.street}: ${this.board.map(cardTxt).join(' ')}`);
    const runout = this.seats.filter(Table.canAct).length < 2;
    if (runout) this.seats.filter(Table.inHand).forEach(s => { s.shown = true; });
    this.toAct = this.nextIdx(this.dealer, Table.canAct);
    this.turnDeadline = 0;
    this._changed();
    this._later(() => this.advance(), runout ? this.timing.runout : this.timing.street);
  }

  finishFold() {
    const w = this.seats.find(Table.inHand);
    const amt = this.potTotal();
    w.chips += amt;
    w.won = amt;
    this.result = { foldWin: true, winners: [{ seat: this.seats.indexOf(w), name: w.name, amount: amt, hand: null }] };
    this._log(`${w.name} wins ${amt}`);
    this.endHand();
  }

  showdown() {
    const contenders = this.seats.filter(Table.inHand);
    for (const s of contenders) {
      const b = best([...s.hand, ...this.board]);
      s.shown = true; s.score = b.score; s.best = b.five;
    }
    const n = this.seats.length;
    const order = s => (this.seats.indexOf(s) - this.dealer - 1 + n) % n; // odd chip goes left of the button
    const levels = [...new Set(contenders.map(s => s.total))].sort((a, b) => a - b);
    let prev = 0;
    levels.forEach((lv, k) => {
      const cap = k === levels.length - 1 ? Infinity : lv;
      let amt = 0;
      for (const s of this.seats) if (s) amt += Math.max(0, Math.min(s.total, cap) - Math.min(s.total, prev));
      const elig = contenders.filter(s => s.total >= lv);
      const top = Math.max(...elig.map(s => s.score));
      const ws = elig.filter(s => s.score === top).sort((a, b) => order(a) - order(b));
      const share = Math.floor(amt / ws.length);
      let rem = amt - share * ws.length;
      for (const w of ws) { const x = share + (rem > 0 ? 1 : 0); if (rem > 0) rem--; w.chips += x; w.won += x; }
      prev = lv;
    });
    for (const s of contenders) this._log(`${s.name} shows ${s.hand.map(cardTxt).join(' ')}: ${handName(s.score)}`);
    const winners = contenders.filter(s => s.won > 0);
    for (const w of winners) this._log(`${w.name} wins ${w.won}`);
    this.result = {
      foldWin: false,
      winners: winners.map(w => ({ seat: this.seats.indexOf(w), name: w.name, amount: w.won, hand: handName(w.score) })),
    };
    this.endHand();
  }

  endHand() {
    clearTimeout(this.timer); this.timer = null;
    this.phase = 'done';
    this.toAct = -1;
    this.turnDeadline = 0;
    const pot = this.seats.reduce((a, s) => a + (s ? s.won : 0), 0);
    const summary = [];
    this.seats.forEach((s, i) => {
      if (!s || !s.dealt) return;
      summary.push({ seat: i, kind: s.kind, userId: s.userId, delta: s.chips - s.startChips, won: s.won, pot, chips: s.chips });
      if (s.kind === 'human' && s.chips === 0) { s.sittingOut = true; s.last = 'Busted'; }
    });
    if (this.hooks.onHandEnd) this.hooks.onHandEnd(this, summary);
    this.seats.forEach((s, i) => { if (s && s.leaving) this._remove(i); });
    this.nextHandAt = Date.now() + this.timing.nextHand;
    this._changed();
    this._later(() => { this.phase = 'waiting'; this.startHand(); }, this.timing.nextHand);
  }

  // ---------- what one viewer is allowed to see ----------
  view(userId) {
    const me = this.seatOf(userId);
    const now = Date.now();
    const seats = this.seats.map((s, i) => {
      if (!s) return null;
      const visible = i === me || s.shown;
      return {
        name: s.name, avatar: s.avatar, kind: s.kind, chips: s.chips, bet: s.bet, last: s.last,
        folded: s.folded, allIn: s.allIn, dealt: s.dealt, sittingOut: s.sittingOut,
        connected: s.connected, leaving: s.leaving, won: s.won,
        cards: visible ? s.hand : (s.dealt && !s.folded ? s.hand.map(() => null) : []),
        handName: s.shown && s.score != null ? handName(s.score) : null,
        best: s.shown ? s.best : null,
      };
    });
    let myHand = null, actions = null;
    if (me >= 0) {
      const s = this.seats[me];
      if (s.dealt && s.hand.length) {
        if (this.board.length >= 3) myHand = handName(best([...s.hand, ...this.board]).score);
        else {
          const [a, b] = s.hand.map(c => c % 13 + 2).sort((x, y) => y - x);
          const R = r => ({ 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[r] || String(r);
          myHand = a === b ? `Pocket ${R(a)}s` : `${R(a)}-${R(b)}${Math.floor(s.hand[0] / 13) === Math.floor(s.hand[1] / 13) ? ' suited' : ''}`;
        }
      }
      if (this.phase === 'play' && this.toAct === me) {
        const toCall = this.currentBet - s.bet;
        const max = s.bet + s.chips;
        actions = {
          toCall: Math.min(toCall, s.chips), canCheck: toCall === 0,
          canRaise: s.chips > toCall, minTo: Math.min(this.currentBet + this.minRaise, max), maxTo: max,
          currentBet: this.currentBet,
        };
      }
    }
    const pot = this.phase === 'done' ? this.seats.reduce((a, s) => a + (s ? s.won : 0), 0) : this.potTotal();
    return {
      code: this.code, name: this.name, sb: this.sb, bb: this.bb, isPrivate: this.isPrivate,
      isHost: this.hostId === userId, phase: this.phase, handNo: this.handNo, street: this.street,
      board: this.board, pot, currentBet: this.currentBet, dealer: this.dealer, toAct: this.toAct,
      turnMs: this.turnDeadline ? Math.max(0, this.turnDeadline - now) : 0, turnTotal: this.timing.turn,
      nextHandMs: this.nextHandAt ? Math.max(0, this.nextHandAt - now) : 0,
      seats, you: me, myHand, actions, result: this.result, log: this.log.slice(-40),
      buyIn: { min: this.buyInMin, max: this.buyInMax },
    };
  }

  summary() {
    return {
      code: this.code, name: this.name, sb: this.sb, bb: this.bb,
      players: this.seats.filter(s => s && s.kind === 'human').length,
      bots: this.seats.filter(s => s && s.kind === 'bot').length,
      seats: this.seats.length, phase: this.phase,
    };
  }
}

module.exports = { Table };
