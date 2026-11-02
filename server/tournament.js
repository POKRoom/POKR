'use strict';
// Multi-table tournaments, run the way the big live series run them: everyone starts with the same
// stack, blinds and a big blind ante climb on a clock, tables are balanced and broken as players bust,
// the last nine (or eight) make a final table, and roughly the top 15% get paid.
//
// Tournament chips are not money. Buy-ins and prizes are handled by the server; this file only
// knows who entered, who's left, and where everyone sits.

// Blind levels: [small blind, big blind, big blind ante].
const LEVELS = [
  [100, 200, 200], [200, 300, 300], [200, 400, 400], [300, 600, 600], [400, 800, 800], [500, 1000, 1000],
  [600, 1200, 1200], [800, 1600, 1600], [1000, 2000, 2000], [1200, 2400, 2400], [1500, 3000, 3000],
  [2000, 4000, 4000], [2500, 5000, 5000], [3000, 6000, 6000], [4000, 8000, 8000], [5000, 10000, 10000],
  [6000, 12000, 12000], [8000, 16000, 16000], [10000, 20000, 20000], [15000, 30000, 30000],
  [20000, 40000, 40000], [25000, 50000, 50000], [30000, 60000, 60000], [40000, 80000, 80000],
  [50000, 100000, 100000], [60000, 120000, 120000], [80000, 160000, 160000], [100000, 200000, 200000],
];
const SPEEDS = {
  hyper: { name: 'Hyper', levelMin: 2, stack: 15000 },
  turbo: { name: 'Turbo', levelMin: 4, stack: 20000 },
  regular: { name: 'Regular', levelMin: 8, stack: 25000 },
  deep: { name: 'Deepstack', levelMin: 12, stack: 40000 },
};
const BOT_NAMES = ['Rook', 'Mae', 'Dex', 'Juno', 'Ozzie', 'Pilar', 'Vera', 'Lou', 'Kit', 'Nico', 'Sage', 'Rhea', 'Bo', 'Theo', 'Ivy', 'Cruz',
  'Lena', 'Hank', 'Mika', 'Otto', 'Remy', 'Tess', 'Abe', 'Wren', 'Gus', 'Noor', 'Jett', 'Lila', 'Max', 'Zoe', 'Rafa', 'Bea', 'Cal', 'Dot', 'Eli', 'Fay'];
const BOT_STYLES = ['rock', 'loose', 'aggro', 'caller'];

// How many get paid, and how the pool splits. Small fields pay a fixed few; bigger fields pay ~15%
// on a curve that gives the winner the biggest share, like a major's payout sheet.
function payouts(entries, pool) {
  if (entries < 2) return [];
  const paid = entries <= 6 ? 1 : entries <= 10 ? 2 : entries <= 17 ? 3 : Math.max(4, Math.ceil(entries * 0.15));
  const fixed = { 1: [100], 2: [65, 35], 3: [50, 30, 20], 4: [45, 27, 17, 11] };
  let w = fixed[paid] ? fixed[paid].slice() : Array.from({ length: paid }, (_, i) => 1 / Math.pow(i + 1, 1.05));
  const sum = w.reduce((a, b) => a + b, 0);
  const out = w.map(x => Math.floor((pool * x) / sum));
  out[0] += pool - out.reduce((a, b) => a + b, 0); // rounding leftovers go to the winner
  return out.map((amount, i) => ({ place: i + 1, amount }));
}

class Tournament {
  // cfg: { id, name, series, buyIn, speed, seatsPerTable, lateRegLevels, reentries, startsAt, hostId, guarantee, game, levelMs, minPlayers }
  // deps: { makeTable(opts), destroyTable(t), onMove(userId, code), onBust(userId, info), onFinish(tour), onChange(tour), now() }
  constructor(cfg, deps) {
    this.id = cfg.id;
    this.name = cfg.name;
    this.series = cfg.series || null;
    this.buyIn = cfg.buyIn || 0;
    this.speed = SPEEDS[cfg.speed] ? cfg.speed : 'regular';
    this.stack = cfg.stack || SPEEDS[this.speed].stack;
    this.levelMs = cfg.levelMs || SPEEDS[this.speed].levelMin * 60000;
    this.seatsPerTable = Math.max(2, Math.min(9, cfg.seatsPerTable || 9));
    this.lateRegLevels = cfg.lateRegLevels == null ? 6 : cfg.lateRegLevels;
    this.reentries = cfg.reentries || 0;
    this.startsAt = cfg.startsAt || null;   // null: the host starts it
    this.hostId = cfg.hostId || null;
    this.guarantee = cfg.guarantee || 0;
    this.game = cfg.game === 'plo' ? 'plo' : 'nlh';
    this.minPlayers = cfg.minPlayers || 2;
    this.isPrivate = !!cfg.isPrivate;
    this.deps = deps;
    this.status = 'registering';           // registering | running | finished | canceled
    this.players = new Map();               // key -> player
    this.entries = 0;
    this.tables = [];
    this.startedAt = 0;
    this.level = 0;
    this.finalTable = false;
    this.results = [];                      // [{ place, name, key, prize }] best last
    this.botN = 0;
  }

  now() { return this.deps.now ? this.deps.now() : Date.now(); }
  get prizePool() { return Math.max(this.guarantee, this.entries * this.buyIn); }
  get payouts() { return payouts(this.entries, this.prizePool); }
  get left() { let n = 0; for (const p of this.players.values()) if (p.status === 'playing') n++; return n; }
  get registered() { let n = 0; for (const p of this.players.values()) if (p.status === 'registered' || p.status === 'playing') n++; return n; }
  lateRegOpen() { return this.status === 'registering' || (this.status === 'running' && this.level < this.lateRegLevels && this.left > 1); }
  blinds(level = this.level) { const L = LEVELS[Math.min(level, LEVELS.length - 1)]; return { sb: L[0], bb: L[1], ante: L[2] }; }

  // ---------- entries ----------
  canEnter(key) {
    const p = this.players.get(key);
    if (!this.lateRegOpen()) return 'Registration is closed';
    if (!p) return null;
    if (p.status === 'registered' || p.status === 'playing') return 'You’re already in';
    if (p.entries > this.reentries) return this.reentries ? 'No re-entries left' : 'This one’s a freezeout: one entry each';
    return null;
  }
  // who: { key, userId, kind, name, avatar, style }. The server has already taken the buy-in.
  enter(who) {
    const err = this.canEnter(who.key);
    if (err) return err;
    let p = this.players.get(who.key);
    if (!p) { p = { key: who.key, userId: who.userId || null, kind: who.kind || 'human', name: who.name, avatar: who.avatar, style: who.style, entries: 0 }; this.players.set(who.key, p); }
    p.entries++; p.status = 'registered'; p.place = null; p.prize = 0; p.table = null; p.connected = true;
    this.entries++;
    if (this.status === 'running') { p.status = 'playing'; this._seatLate(p); }
    this._changed();
    return null;
  }
  unregister(key) {
    const p = this.players.get(key);
    if (!p || p.status !== 'registered' || this.status !== 'registering') return 'You can only unregister before it starts';
    p.status = 'out'; p.entries--; this.entries--;
    if (!p.entries) this.players.delete(key);
    this._changed();
    return null;
  }
  addBots(n) {
    for (let i = 0; i < n; i++) {
      const name = BOT_NAMES[this.botN % BOT_NAMES.length] + (this.botN >= BOT_NAMES.length ? ' ' + Math.floor(this.botN / BOT_NAMES.length + 1) : '');
      const key = 'bot:' + this.id + ':' + this.botN;
      this.botN++;
      if (this.enter({ key, kind: 'bot', name, avatar: { a: -1, c: this.botN % 8 }, style: BOT_STYLES[this.botN % 4] })) break;
    }
  }

  // ---------- running ----------
  start() {
    if (this.status !== 'registering') return 'Already started';
    const field = [...this.players.values()].filter(p => p.status === 'registered');
    if (field.length < this.minPlayers) return `Needs at least ${this.minPlayers} players`;
    this.status = 'running';
    this.startedAt = this.now();
    this.level = 0;
    for (let i = field.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [field[i], field[j]] = [field[j], field[i]]; }
    const nTables = Math.ceil(field.length / this.seatsPerTable);
    for (let k = 0; k < nTables; k++) this._newTable();
    field.forEach((p, i) => { p.status = 'playing'; this._seat(p, this.tables[i % nTables]); });
    this._changed();
    return null;
  }

  tick() {
    const now = this.now();
    if (this.status === 'registering' && this.startsAt && now >= this.startsAt) {
      if (this.registered >= this.minPlayers) this.start(); else this.cancel();
      return;
    }
    if (this.status !== 'running') return;
    const lv = Math.min(LEVELS.length - 1, Math.floor((now - this.startedAt) / this.levelMs));
    if (lv !== this.level) {
      this.level = lv;
      const b = this.blinds();
      for (const t of this.tables) t._log(`Level ${lv + 1}: blinds ${t.fmt(b.sb)}/${t.fmt(b.bb)}, ante ${t.fmt(b.ante)}`);
      this._changed();
    }
  }

  cancel() {
    if (this.status !== 'registering') return;
    this.status = 'canceled';
    for (const p of this.players.values()) if (p.status === 'registered' && this.deps.onRefund) this.deps.onRefund(p, this.buyIn * p.entries);
    this._changed();
  }

  // Called by each table just before it deals: the current level's blinds.
  beforeHand(t) {
    const b = this.blinds();
    t.sb = b.sb; t.bb = b.bb; t.ante = b.ante;
  }

  // Called by each table after every hand: busts, then balancing.
  handEnded(t) {
    if (this.status !== 'running') return;
    const busted = [];
    t.seats.forEach((s, i) => { if (s && s.chips <= 0) busted.push({ s, i }); });
    // Two players out on the same hand: the one who started it with fewer chips finishes lower.
    busted.sort((a, b) => a.s.startChips - b.s.startChips);
    for (const { s, i } of busted) {
      const p = this._byName(s);
      t.takeSeat(i);
      if (!p) continue;
      const place = this.left;
      p.status = 'busted'; p.place = place; p.table = null;
      const pay = this.payouts.find(x => x.place === place);
      p.prize = pay ? pay.amount : 0;
      this.results.push({ place, name: p.name, key: p.key, prize: p.prize });
      t._log(`${p.name} is out in ${ordinal(place)}${p.prize ? ` and wins ${money(p.prize)}` : ''}`);
      if (this.deps.onBust) this.deps.onBust(p, { place, prize: p.prize, entries: this.entries, canReenter: !this.canEnter(p.key) });
    }
    if (this.left <= 1) return this._finish();
    this._balance(t);
    this._changed();
  }

  // ---------- seating ----------
  _newTable() {
    const n = this.tables.length + 1;
    const t = this.deps.makeTable({ name: `${this.name} · Table ${n}`, tourney: this, maxSeats: this.seatsPerTable, game: this.game, ...this.blinds() });
    t.tourneyTableNo = n;
    this.tables.push(t);
    return t;
  }
  _count(t) { return t.seats.filter(Boolean).length; }
  _emptySeat(t) { const free = t.seats.map((s, i) => (s ? -1 : i)).filter(i => i >= 0); return free.length ? free[Math.floor(Math.random() * free.length)] : -1; }
  _seat(p, t, chips = this.stack) {
    const idx = this._emptySeat(t);
    p.table = t.code;
    t.placeSeat(idx, { kind: p.kind, userId: p.userId, name: p.name, avatar: p.avatar, style: p.style, connected: p.kind === 'bot' ? true : p.connected !== false, key: p.key }, chips);
    t.seats[idx].key = p.key;
    return idx;
  }
  _seatLate(p) {
    const open = this.tables.filter(t => this._count(t) < this.seatsPerTable).sort((a, b) => this._count(a) - this._count(b));
    const t = open[0] || this._newTable();
    this._seat(p, t);
    if (p.userId && this.deps.onMove) this.deps.onMove(p.userId, t.code);
  }
  _byName(s) { return s.key ? this.players.get(s.key) : null; }
  _move(from, idx, to) {
    const s = from.takeSeat(idx);
    const p = this._byName(s);
    const j = this._emptySeat(to);
    to.placeSeat(j, { kind: s.kind, userId: s.userId, name: s.name, avatar: s.avatar, style: s.style, connected: s.connected }, s.chips);
    to.seats[j].key = s.key;
    to.seats[j].sittingOut = s.sittingOut;
    if (p) p.table = to.code;
    from._log(`${s.name} moves to table ${to.tourneyTableNo}`);
    if (s.userId && this.deps.onMove) this.deps.onMove(s.userId, to.code);
  }
  // Break tables when the field fits on fewer, otherwise keep table sizes within one of each other.
  _balance(t) {
    const live = () => this.tables.filter(x => this._count(x) > 0);
    let tables = live();
    const total = tables.reduce((a, x) => a + this._count(x), 0);
    const need = Math.max(1, Math.ceil(total / this.seatsPerTable));
    while (tables.length > need) {
      const breakable = tables.filter(x => x.phase !== 'play').sort((a, b) => this._count(a) - this._count(b));
      const b = breakable[0];
      if (!b) break;
      const others = tables.filter(x => x !== b);
      b.seats.forEach((s, i) => {
        if (!s) return;
        const dest = others.filter(x => this._count(x) < this.seatsPerTable).sort((x, y) => this._count(x) - this._count(y))[0];
        if (dest) this._move(b, i, dest);
      });
      if (this._count(b) === 0) this._closeTable(b);
      tables = live();
    }
    if (tables.length === 1 && !this.finalTable) {
      this.finalTable = true;
      tables[0]._log('Final table');
    }
    // even out: move from this table to the smallest one while the gap is two or more
    if (t.phase !== 'play' && tables.includes(t)) {
      for (;;) {
        const small = tables.filter(x => x !== t).sort((a, b) => this._count(a) - this._count(b))[0];
        if (!small || this._count(t) - this._count(small) < 2) break;
        const n = t.seats.length;
        let pick = -1;
        for (let k = 2; k < n + 2 && pick < 0; k++) { const i = (t.dealer + k) % n; if (t.seats[i]) pick = i; } // whoever's due the big blind
        if (pick < 0) break;
        this._move(t, pick, small);
      }
    }
    // a table left waiting alone gets a hand going again once someone arrives (placeSeat calls maybeStart)
  }
  _closeTable(t) {
    this.tables = this.tables.filter(x => x !== t);
    if (this.deps.destroyTable) this.deps.destroyTable(t);
  }
  _finish() {
    const w = [...this.players.values()].find(p => p.status === 'playing');
    if (w) {
      w.status = 'won'; w.place = 1;
      const pay = this.payouts.find(x => x.place === 1);
      w.prize = pay ? pay.amount : 0;
      this.results.push({ place: 1, name: w.name, key: w.key, prize: w.prize });
      for (const t of this.tables) t._log(`${w.name} wins the tournament${w.prize ? ` and ${money(w.prize)}` : ''}`);
      if (this.deps.onBust) this.deps.onBust(w, { place: 1, prize: w.prize, entries: this.entries, won: true });
    }
    this.status = 'finished';
    this.finishedAt = this.now();
    for (const t of this.tables) t.paused = true;
    if (this.deps.onFinish) this.deps.onFinish(this);
    this._changed();
  }
  _changed() { if (this.deps.onChange) this.deps.onChange(this); }

  // ---------- what people see ----------
  nextLevelMs() { return this.status === 'running' ? Math.max(0, this.startedAt + (this.level + 1) * this.levelMs - this.now()) : 0; }
  stacks() { const out = []; for (const t of this.tables) for (const s of t.seats) if (s) out.push({ key: s.key, name: s.name, chips: s.chips + (s.total || 0), table: t.tourneyTableNo, avatar: s.avatar }); return out.sort((a, b) => b.chips - a.chips); }
  hud(t, userId) {
    const b = this.blinds(), nb = this.blinds(this.level + 1);
    const left = this.left, chipsInPlay = this.entries * this.stack;
    let rank = null;
    if (userId) { const st = this.stacks(); const i = st.findIndex(x => this.players.get(x.key) && this.players.get(x.key).userId === userId); if (i >= 0) rank = i + 1; }
    return {
      id: this.id, name: this.name, status: this.status, level: this.level + 1, ...b, next: nb, nextLevelMs: this.nextLevelMs(),
      left, entries: this.entries, avg: left ? Math.round(chipsInPlay / left) : 0, prizePool: this.prizePool,
      paid: this.payouts.length, finalTable: this.finalTable, tableNo: t ? t.tourneyTableNo : null, rank,
      lateReg: this.lateRegOpen(),
    };
  }
  summary(userId) {
    const me = userId ? [...this.players.values()].find(p => p.userId === userId) : null;
    return {
      id: this.id, name: this.name, series: this.series, buyIn: this.buyIn, speed: this.speed, speedName: SPEEDS[this.speed].name,
      stack: this.stack, game: this.game, seatsPerTable: this.seatsPerTable, startsAt: this.startsAt, status: this.status,
      entries: this.entries, registered: this.registered, left: this.left, prizePool: this.prizePool, guarantee: this.guarantee,
      level: this.level + 1, ...this.blinds(), nextLevelMs: this.nextLevelMs(), lateReg: this.lateRegOpen(), reentries: this.reentries,
      hosted: !!this.hostId, isPrivate: this.isPrivate, levelMin: Math.round(this.levelMs / 60000),
      me: me ? { status: me.status, place: me.place, prize: me.prize, table: me.table, entries: me.entries, canEnter: !this.canEnter(me.key) } : null,
    };
  }
  detail(userId) {
    const s = this.summary(userId);
    s.isHost = !!userId && userId === this.hostId;
    s.structure = LEVELS.slice(0, Math.max(16, this.level + 6)).map((L, i) => ({ level: i + 1, sb: L[0], bb: L[1], ante: L[2] }));
    s.payouts = this.payouts;
    s.lateRegLevels = this.lateRegLevels;
    s.standings = this.stacks().slice(0, 100).map((x, i) => ({ rank: i + 1, name: x.name, chips: x.chips, table: x.table, avatar: x.avatar, me: !!(this.players.get(x.key) && userId && this.players.get(x.key).userId === userId) }));
    s.results = this.results.slice().sort((a, b) => a.place - b.place).slice(0, 100).map(r => ({ place: r.place, name: r.name, prize: r.prize }));
    s.field = this.status === 'registering' ? [...this.players.values()].filter(p => p.status === 'registered').map(p => ({ name: p.name, avatar: p.avatar })) : [];
    s.tables = this.tables.map(t => ({ code: t.code, no: t.tourneyTableNo, players: this._count(t), big: Math.max(0, ...t.seats.map(x => (x ? x.chips : 0))) }));
    return s;
  }
}

const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const money = c => '$' + (c / 100).toLocaleString('en-US', c % 100 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : {});

module.exports = { Tournament, LEVELS, SPEEDS, payouts, ordinal };
