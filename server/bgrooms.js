'use strict';
// Backgammon rooms: two seats, a stake per point, games one after another with the doubling cube.
// Each player buys in for 32 points' worth; the loser of a game pays points × stake (never more
// than they have left), and the next game starts by itself. Bots play the empty seat if asked.
// Shared by the real server and the in-browser preview: deps tell it how to move money and talk.
const { Game } = require('./backgammon');
const bot = require('./bgbot');

const STAKES = [25, 100, 500, 2500, 10000];   // cents per point
const BUY_IN_POINTS = 32;
const BOT_NAMES = ['Rook', 'Mae', 'Dex', 'Juno', 'Ozzie', 'Vera', 'Lou', 'Kit'];

// deps: { makeCode(), broadcast(room), charge(userId, cents, why) -> err|null, credit(userId, cents, why),
//         setAt(userId, code, cents|null), notify(userId, msg), changed(), preview, timing? }
function createRooms(deps) {
  const rooms = new Map();
  const T = { think: [700, 1500], roll: 25000, move: 60000, answer: 30000, away: 4000, between: 5000, pass: 1600, ...(deps.timing || {}) };
  const later = (fn, ms) => setTimeout(fn, ms);
  const rnd = ([a, b]) => a + Math.random() * (b - a);

  class Room {
    constructor({ code, name, stake, hostId, isPrivate }) {
      this.code = code; this.name = name; this.stake = stake; this.hostId = hostId || null; this.isPrivate = !!isPrivate;
      this.buyIn = stake * BUY_IN_POINTS;
      this.seats = [null, null];
      this.game = null; this.gameNo = 0;
      this.lastMoves = null; this.history = [];
      this.deadline = 0; this.timer = null; this.lastActive = Date.now();
    }
    seatOf(userId) { return this.seats.findIndex(s => s && s.userId === userId); }
    humans() { return this.seats.filter(s => s && s.kind === 'human').length; }
    summary() {
      return { code: this.code, name: this.name, stake: this.stake, buyIn: this.buyIn, playing: !!this.game,
        seats: this.seats.map(s => (s ? { name: s.name, avatar: s.avatar, kind: s.kind } : null)) };
    }
    _changed() { this.lastActive = Date.now(); deps.broadcast(this); deps.changed(); }
    _clear() { clearTimeout(this.timer); this.timer = null; this.deadline = 0; }
    _wait(ms, fn) { this._clear(); this.deadline = Date.now() + ms; this.timer = later(() => { this.timer = null; this.deadline = 0; fn(); }, ms); }

    // ---- seats ----
    sit(i, who) {
      if (this.seats[i]) return 'That seat is taken';
      this.seats[i] = { ...who, stack: who.stack, connected: true };
      this._maybeStart();
      this._changed();
      return null;
    }
    addBot(level = 'hard') {
      const i = this.seats.findIndex(s => !s);
      if (i < 0) return 'Both seats are taken';
      const taken = new Set(this.seats.filter(Boolean).map(s => s.name));
      const name = BOT_NAMES.find(n => !taken.has(n)) || 'Bot';
      return this.sit(i, { kind: 'bot', name, avatar: { a: -1, c: Math.floor(Math.random() * 8) }, stack: this.buyIn, level });
    }
    // Leaving mid-game concedes it (at the current cube); the rest of the stack goes back to the bankroll.
    leave(userId) {
      const i = this.seatOf(userId);
      if (i < 0) return 'You’re not sitting here';
      const conceded = !!(this.game && this.game.phase !== 'over');
      if (conceded) { this.game.resign(i); this._settle(); }
      const s = this.seats[i];
      this.seats[i] = null;
      deps.credit(s.userId, s.stack, `Backgammon ${this.code}: cash out`);
      deps.setAt(s.userId, this.code, null);
      this._clear();
      if (this.game && this.game.phase === 'over') { this.game = null; this.result = null; }
      // tell whoever's still here what happened
      const other = this.seats[1 - i];
      if (other && other.kind === 'human') deps.notify(other.userId, { t: 'notice', message: `${s.name} left the board${conceded ? ' and conceded the game in progress' : ''}.` });
      this._changed();
      return null;
    }
    setConnected(userId, on) {
      const i = this.seatOf(userId);
      if (i < 0) return;
      this.seats[i].connected = on;
      if (!on) this._schedule();
      this._changed();
    }

    // ---- the game ----
    _maybeStart() {
      if (this.game || !this.seats[0] || !this.seats[1]) return;
      if (this.seats.some(s => s.stack < this.stake)) return;
      this.result = null;
      this.game = new Game();
      this.gameNo++;
      this.lastMoves = null;
      this.game.rollOpening();
      this._schedule();
    }
    _schedule() {
      const g = this.game;
      if (!g || g.phase === 'over') return;
      // whose decision is it?
      const p = g.phase === 'doubled' ? 1 - g.offeredBy : g.turn;
      const s = this.seats[p];
      if (!s) return;
      const auto = s.kind === 'bot' || !s.connected;
      const ms = auto ? (s.kind === 'bot' ? rnd(T.think) : T.away) : g.phase === 'roll' ? T.roll : g.phase === 'doubled' ? T.answer : T.move;
      this._wait(ms, () => this._autoAct(p));
    }
    // A bot's turn, or a human who ran out of time: the bot plays it for them.
    _autoAct(p) {
      const g = this.game;
      if (!g || g.phase === 'over') return;
      const level = (this.seats[p] && this.seats[p].level) || 'hard';
      const isBot = this.seats[p] && this.seats[p].kind === 'bot';
      if (g.phase === 'doubled') { if (bot.shouldTake(g, p, level)) this.act(p, { t: 'take' }); else this.act(p, { t: 'drop' }); return; }
      if (g.phase === 'roll') {
        if (isBot && bot.shouldDouble(g, p, level)) { this.act(p, { t: 'double' }); return; }
        this.act(p, { t: 'roll' }); return;
      }
      if (g.phase === 'move') {
        const i = g.noMoves ? -1 : bot.choosePlay(g, isBot ? level : 'hard');
        this.act(p, { t: 'move', steps: i < 0 ? [] : g.legal()[i] });
      }
    }
    // Every action goes through here: from a player, a bot, or a timeout.
    act(p, m) {
      const g = this.game;
      if (!g) return 'The game hasn’t started';
      let err;
      if (m.t === 'roll') err = g.roll(p);
      else if (m.t === 'move') {
        const dice = g.dice;
        err = g.move(p, Array.isArray(m.steps) ? m.steps.slice(0, 4).map(s => ({ from: s && s.from === 'bar' ? 'bar' : Number(s && s.from), to: s && s.to === 'off' ? 'off' : Number(s && s.to) })) : []);
        if (!err) this.lastMoves = { seat: p, steps: g.played || [], dice, n: (this.lastMoves ? this.lastMoves.n : 0) + 1 };
      }
      else if (m.t === 'double') err = g.double(p);
      else if (m.t === 'take') err = g.take(p);
      else if (m.t === 'drop') err = g.drop(p);
      else return 'Unknown action';
      if (err) return err;
      if (g.phase === 'over') this._settle();
      else {
        // a roll with no legal moves passes by itself after a moment
        if (g.phase === 'move' && g.noMoves) this._wait(T.pass, () => this.act(g.turn, { t: 'move', steps: [] }));
        else this._schedule();
      }
      this._changed();
      return null;
    }
    _settle() {
      const g = this.game, r = g.result;
      this._clear();
      const w = this.seats[r.winner], l = this.seats[1 - r.winner];
      const owed = r.points * this.stake;
      const paid = l ? Math.min(owed, l.stack) : 0;
      if (l) l.stack -= paid;
      if (w) w.stack += paid;
      for (const s of [w, l]) if (s && s.kind === 'human') deps.setAt(s.userId, this.code, s.stack);
      this.history.unshift({ winner: w ? w.name : '?', kind: r.kind, points: r.points, paid, dropped: r.dropped, cube: g.cube });
      this.history = this.history.slice(0, 6);
      this.result = { ...r, paid, winnerName: w ? w.name : '' };
      // next game, once everyone has seen the result
      this._wait(T.between, () => {
        this.game = null; this.result = null;
        for (let i = 0; i < 2; i++) {
          const s = this.seats[i];
          if (!s || s.stack >= this.stake) continue;
          if (s.kind === 'bot') s.stack = this.buyIn;                // the house tops its bots up
          else { deps.notify(s.userId, { t: 'notice', message: 'You’re out of chips at that board. Buy in again to keep playing.' }); this.leave(s.userId); }
        }
        this._maybeStart();
        this._changed();
      });
    }

    view(userId) {
      const me = userId ? this.seatOf(userId) : -1;
      const g = this.game;
      return {
        code: this.code, name: this.name, stake: this.stake, buyIn: this.buyIn, isPrivate: this.isPrivate, mySeat: me, gameNo: this.gameNo,
        seats: this.seats.map(s => (s ? { name: s.name, avatar: s.avatar, stack: s.stack, kind: s.kind, connected: s.connected, level: s.level } : null)),
        deadlineIn: this.deadline ? Math.max(0, this.deadline - Date.now()) : 0,
        lastMoves: this.lastMoves, history: this.history, result: this.result || null,
        game: g ? {
          board: g.board, dice: g.dice, turn: g.turn, phase: g.phase, cube: g.cube, cubeOwner: g.cubeOwner, opening: g.opening,
          offeredBy: g.phase === 'doubled' ? g.offeredBy : null, noMoves: !!g.noMoves,
          canDouble: me >= 0 && g.canDouble(me),
          legal: me >= 0 && g.phase === 'move' && g.turn === me && !g.noMoves ? g.legal() : null,
        } : null,
      };
    }
    destroy() { this._clear(); }
  }

  return {
    rooms, STAKES, BUY_IN_POINTS,
    list() { return [...rooms.values()].filter(r => !r.isPrivate && r.humans() > 0).map(r => r.summary()); },
    // Make a board. vsBot: put a bot in the other seat right away.
    create(userId, info, { stake, vsBot, level, isPrivate }) {
      stake = STAKES.includes(stake) ? stake : STAKES[1];
      const code = deps.makeCode();
      const room = new Room({ code, name: vsBot ? `${info.name} vs bot` : `${info.name}’s board`, stake, hostId: userId, isPrivate: !!(isPrivate || vsBot) });
      rooms.set(code, room);
      const err = this.sit(userId, info, code);
      if (err) { rooms.delete(code); return { err }; }
      if (vsBot) room.addBot(level === 'easy' ? 'easy' : 'hard');
      return { code };
    },
    sit(userId, info, code) {
      const room = rooms.get(code);
      if (!room) return 'That board is gone';
      if (room.seatOf(userId) >= 0) return null;
      const i = room.seats.findIndex(s => !s);
      if (i < 0) return 'Both seats are taken';
      const pay = deps.charge(userId, room.buyIn, `Backgammon ${code}: buy-in`);
      if (pay) return pay;
      deps.setAt(userId, code, room.buyIn);
      room.sit(i, { kind: 'human', userId, name: info.name, avatar: info.avatar, stack: room.buyIn });
      return null;
    },
    leave(userId, code) { const room = rooms.get(code); return room ? room.leave(userId) : 'That board is gone'; },
    act(userId, code, m) {
      const room = rooms.get(code);
      if (!room) return 'That board is gone';
      const p = room.seatOf(userId);
      if (p < 0) return 'Take a seat first';
      return room.act(p, m);
    },
    addBot(userId, code) { const room = rooms.get(code); if (!room) return 'That board is gone'; if (room.seatOf(userId) < 0) return 'Take a seat first'; return room.addBot('hard'); },
    view(code, userId) { const room = rooms.get(code); return room ? room.view(userId) : null; },
    setConnected(userId, on) { for (const r of rooms.values()) if (r.seatOf(userId) >= 0) r.setConnected(userId, on); },
    restyle(userId, name, avatar) { for (const r of rooms.values()) { const i = r.seatOf(userId); if (i >= 0) { r.seats[i].name = name; r.seats[i].avatar = avatar; r._changed(); } } },
    // Close boards nobody's at.
    sweep() {
      const now = Date.now();
      for (const r of rooms.values()) if (!r.humans() && now - r.lastActive > 5 * 60000) { r.destroy(); rooms.delete(r.code); }
    },
  };
}

module.exports = { createRooms, STAKES, BUY_IN_POINTS };
