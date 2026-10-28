// In-browser stand-in for server/index.js, used only by the preview build.
// Same messages, same game engine; one local player, and the other seats are bots.
(function () {
  const { Table } = require('./engine');
  const STAKES = { '5-10': [5, 10], '10-25': [10, 25], '25-50': [25, 50], '50-100': [50, 100], '100-200': [100, 200], '200-500': [200, 500] };
  const { money } = require('./cards');
  const shop = require('./shop');
  const REACTIONS = ['👍', '😂', '🔥', '😱', '💀', '👏', '🤡', '💰'];
  const START = 100000, REFILL_BELOW = 10000, KEY = 'pokr.preview.v2';
  const BANTER = {
    win: ['ship it', 'nh to me', 'too easy', 'thank you very much', 'read you like a book'],
    lose: ['unreal', 'how did you call that', 'one more and I quit', 'rigged', 'ok ok ok'],
    react: ['😂', '🔥', '😱', '💀', '👏', '🤡'],
  };

  let db;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
  if (!db || !db.user) db = { user: null, token: null, bots: {} };
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage blocked */ } };

  const pwHash = p => { let h = 5381; for (const ch of String(p || '')) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0; return h.toString(36); };
  const tables = new Map();
  let client = null;
  const out = m => { if (client) client._recv(m); };
  const meOf = u => {
    const atTables = Object.values(u.atTables).reduce((a, b) => a + b, 0);
    const now = Date.now();
    const sum = ms => { const r = { net: 0, hands: 0, won: 0, biggestPot: 0 }; for (const h of u.hist || []) if (now - h.ts < ms) { r.net += h.d; r.hands++; if (h.w > 0 && h.d > 0) r.won++; r.biggestPot = Math.max(r.biggestPot, h.w); } return r; };
    const periods = { day: sum(864e5), week: sum(7 * 864e5), month: sum(30 * 864e5), all: { ...u.stats } };
    return { id: u.id, email: u.email, name: u.name, avatar: u.avatar, bankroll: u.bankroll, atTables, stats: u.stats, periods, canRefill: u.bankroll + atTables < REFILL_BELOW, ...shop.publicEconomy(u) };
  };
  const sendMe = () => { if (db.user) out({ t: 'me', user: meOf(db.user) }); };
  const sendCatalog = () => out({ t: 'catalog', catalog: shop.catalog() });
  function leaderboard() {
    const rows = [];
    const u = db.user;
    if (u && u.stats.hands) rows.push({ id: u.id, name: u.name, avatar: u.avatar, net: u.stats.net, hands: u.stats.hands, winRate: u.stats.won / u.stats.hands, biggestPot: u.stats.biggestPot });
    for (const [name, b] of Object.entries(db.bots)) if (b.hands) rows.push({ id: 'bot-' + name, name: name + ' (bot)', avatar: { a: -1, c: b.c }, net: b.net, hands: b.hands, winRate: b.won / b.hands, biggestPot: b.biggest });
    return rows.sort((a, b) => b.net - a.net);
  }
  const lobby = () => ({ t: 'lobby', tables: [...tables.values()].filter(t => !t.isPrivate).map(t => t.summary()), leaderboard: leaderboard() });
  const makeCode = () => { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 5; i++) c += A[Math.floor(Math.random() * A.length)]; return c; };

  function botSay(t, seatIdx, text, delay) {
    setTimeout(() => {
      const s = t.seats[seatIdx];
      if (!s || s.kind !== 'bot') return;
      const item = { id: Math.random().toString(36).slice(2), name: s.name, avatar: s.avatar, userId: null, text, ts: Date.now() };
      t.chat.push(item);
      if (client && client.code === t.code) out({ t: 'chat', items: [item] });
    }, delay);
  }
  function botReact(t, seatIdx, e, delay) {
    setTimeout(() => { if (client && client.code === t.code && t.seats[seatIdx]) out({ t: 'react', seat: seatIdx, e, name: t.seats[seatIdx].name }); }, delay);
  }

  const hooks = {
    onChange(t) {
      if (t._q) return;
      t._q = true;
      setTimeout(() => { t._q = false; if (client && client.code === t.code) out({ t: 'state', s: t.view(db.user && db.user.id) }); }, 0);
    },
    onHandEnd(t, summary) {
      for (const r of summary) {
        if (r.kind === 'human' && db.user && r.userId === db.user.id) {
          const st = db.user.stats;
          st.hands++; st.net += r.delta;
          if (r.won > 0 && r.delta > 0) st.won++;
          if (r.won > st.biggestPot) st.biggestPot = r.won;
          (db.user.hist || (db.user.hist = [])).push({ ts: Date.now(), d: r.delta, w: r.won }); if (db.user.hist.length > 3000) db.user.hist.shift();
          db.user.atTables[t.code] = r.chips;
        } else if (r.kind === 'bot') {
          const s = t.seats[r.seat];
          const b = db.bots[s.name] || (db.bots[s.name] = { hands: 0, net: 0, won: 0, biggest: 0, c: s.avatar.c });
          b.hands++; b.net += r.delta; if (r.won > 0 && r.delta > 0) b.won++; if (r.won > b.biggest) b.biggest = r.won;
        }
      }
      persist();
      sendMe();
      // a little table talk so the preview feels alive
      const bots = summary.filter(r => r.kind === 'bot');
      const bigWin = bots.find(r => r.delta >= t.bb * 8);
      const bigLoss = bots.find(r => r.delta <= -t.bb * 8);
      if (bigWin && Math.random() < 0.45) botSay(t, bigWin.seat, BANTER.win[Math.floor(Math.random() * BANTER.win.length)], 900);
      else if (bigLoss && Math.random() < 0.45) botSay(t, bigLoss.seat, BANTER.lose[Math.floor(Math.random() * BANTER.lose.length)], 900);
      if (bots.length && Math.random() < 0.3) { const r = bots[Math.floor(Math.random() * bots.length)]; botReact(t, r.seat, BANTER.react[Math.floor(Math.random() * BANTER.react.length)], 1400); }
    },
    onStand(t, userId, chips) {
      if (!db.user || db.user.id !== userId) return;
      db.user.bankroll += chips;
      delete db.user.atTables[t.code];
      persist();
      sendMe();
    },
  };

  const H = {
    hello(c, m) {
      if (db.user) {
        // chips left at tables from a previous visit come back
        const left = Object.values(db.user.atTables || {}).reduce((a, b) => a + b, 0);
        db.user.bankroll += left; db.user.atTables = {}; persist();
      }
      if (!db.user || db.token !== m.token) return out({ t: 'needProfile' });
      sendMe(); sendCatalog();
    },
    // Preview accounts live only in this browser; the real server hashes passwords and checks them properly.
    signup(c, m) {
      const name = String(m.name || '').trim().slice(0, 16);
      const email = String(m.email || '').trim().toLowerCase();
      if (name.length < 2) return out({ t: 'authError', message: 'Pick a name with at least 2 characters' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return out({ t: 'authError', message: 'Enter a valid email address' });
      if (String(m.password || '').length < 8) return out({ t: 'authError', message: 'Use a password with at least 8 characters' });
      db.user = { id: 'me', email, pw: pwHash(m.password), name, avatar: m.avatar, bankroll: START, atTables: {}, stats: { hands: 0, won: 0, biggestPot: 0, net: 0 }, hist: [] };
      db.token = Math.random().toString(36).slice(2);
      persist();
      out({ t: 'token', token: db.token });
      sendMe(); sendCatalog();
    },
    login(c, m) {
      const email = String(m.email || '').trim().toLowerCase();
      if (!db.user || db.user.email !== email || db.user.pw !== pwHash(m.password)) return out({ t: 'authError', message: 'That email and password don’t match' });
      db.token = Math.random().toString(36).slice(2);
      persist();
      out({ t: 'token', token: db.token });
      sendMe(); sendCatalog();
    },
    logout(c) { if (c.code) { const t = tables.get(c.code); if (t) t.stand(db.user.id); c.code = null; } db.token = null; persist(); out({ t: 'needProfile' }); },
    profile(c, m) {
      if (!db.user) return;
      const name = String(m.name || '').trim().slice(0, 16);
      if (name.length < 2) return out({ t: 'error', message: 'Pick a name with at least 2 characters' });
      if (!shop.canUseAvatar(db.user, m.avatar && m.avatar.a)) return out({ t: 'error', message: 'That avatar comes with Pokr Club or the shop' });
      db.user.name = name; db.user.avatar = m.avatar;
      for (const t of tables.values()) { const i = t.seatOf(db.user.id); if (i >= 0) { t.seats[i].name = name; t.seats[i].avatar = m.avatar; hooks.onChange(t); } }
      persist();
      sendMe();
    },
    lobby() { out(lobby()); },
    club(c, m) {
      const r = shop.club(db.user, m.action); if (r.error) return out({ t: 'error', message: r.error });
      if (r.resetAvatar) for (const t of tables.values()) { const i = t.seatOf(db.user.id); if (i >= 0) { t.seats[i].avatar = db.user.avatar; hooks.onChange(t); } }
      persist(); sendMe(); out({ t: 'notice', message: m.action === 'join' ? 'Welcome to Pokr Club' : 'Membership canceled' });
    },
    buyAvatar(c, m) { const r = shop.buyAvatar(db.user, Number(m.a)); if (r.error) return out({ t: 'error', message: r.error }); persist(); sendMe(); out({ t: 'notice', message: 'Avatar unlocked' }); },
    setTheme(c, m) { const r = shop.setTheme(db.user, String(m.theme)); if (r.error) return out({ t: 'error', message: r.error }); persist(); sendMe(); },
    cashier(c, m) {
      const r = shop.cashier(db.user, { action: m.action, amount: m.amount, speed: m.speed }); if (r.error) return out({ t: 'error', message: r.error });
      persist(); sendMe();
      const verb = r.tx.type === 'deposit' ? 'Deposit' : 'Withdrawal';
      out({ t: 'notice', message: r.tx.status === 'completed' ? `${verb} of ${money(r.tx.amount)} done` : `${verb} of ${money(r.tx.amount)} is on its way` });
    },
    refill() {
      const u = db.user;
      if (!meOf(u).canRefill) return out({ t: 'error', message: `Reloads are for players under ${money(REFILL_BELOW)}` });
      u.bankroll = START; persist(); sendMe();
    },
    create(c, m) {
      const st = STAKES[m.stakes] || STAKES['10-25'];
      const code = makeCode();
      const t = new Table({ code, name: String(m.name || '').trim().slice(0, 28) || `${db.user.name}'s table`, sb: st[0], bb: st[1], hostId: db.user.id, isPrivate: !!m.isPrivate }, hooks);
      tables.set(code, t);
      [1, 3, 4].forEach(i => t.addBot(i));
      out({ t: 'created', code });
    },
    join(c, m) {
      const t = tables.get(String(m.code || '').toUpperCase());
      if (!t) return out({ t: 'notFound', code: m.code });
      c.code = t.code;
      out({ t: 'chat', items: t.chat, reset: true });
      out({ t: 'state', s: t.view(db.user.id) });
      if (!t.chat.length) botSay(t, 3, 'gl all', 1200);
    },
    leave(c) { const t = tables.get(c.code); if (t) t.stand(db.user.id); c.code = null; out(lobby()); },
    sit(c, m) {
      const t = tables.get(c.code), u = db.user;
      const buyIn = Math.floor(Number(m.buyIn));
      if (!(buyIn >= t.buyInMin && buyIn <= t.buyInMax)) return out({ t: 'error', message: `Buy in between ${money(t.buyInMin)} and ${money(t.buyInMax)}` });
      if (buyIn > u.bankroll) return out({ t: 'error', message: 'You don’t have that many chips in your bankroll' });
      const err = t.sit({ userId: u.id, name: u.name, avatar: u.avatar }, Number(m.seat), buyIn);
      if (err) return out({ t: 'error', message: err });
      u.bankroll -= buyIn; u.atTables[t.code] = buyIn; persist(); sendMe();
    },
    stand(c) { const t = tables.get(c.code); if (t) t.stand(db.user.id); },
    rebuy(c, m) {
      const t = tables.get(c.code), u = db.user, i = t.seatOf(u.id);
      if (i < 0) return;
      const room = t.buyInMax - t.seats[i].chips;
      const amt = Math.min(Math.floor(Number(m.amount)) || 0, room, u.bankroll);
      if (amt <= 0) return out({ t: 'error', message: room <= 0 ? 'You’re already at the maximum buy-in' : 'Your bankroll is empty. Grab free chips in the lobby.' });
      const err = t.rebuy(u.id, amt);
      if (err) return out({ t: 'error', message: err });
      u.bankroll -= amt; u.atTables[t.code] = t.seats[i].chips; persist(); sendMe();
    },
    sitout(c, m) { const t = tables.get(c.code); if (t) t.setSittingOut(db.user.id, !!m.out); },
    act(c, m) {
      const t = tables.get(c.code); if (!t) return;
      const err = t.act(t.seatOf(db.user.id), String(m.kind), m.amount);
      if (err) out({ t: 'error', message: err });
    },
    chat(c, m) {
      const t = tables.get(c.code); if (!t) return;
      const text = String(m.text || '').trim().slice(0, 200); if (!text) return;
      const item = { id: Math.random().toString(36).slice(2), name: db.user.name, avatar: db.user.avatar, userId: db.user.id, text, ts: Date.now() };
      t.chat.push(item); if (t.chat.length > 60) t.chat.shift();
      out({ t: 'chat', items: [item] });
      if (Math.random() < 0.5) {
        const bots = t.seats.map((s, i) => (s && s.kind === 'bot' ? i : -1)).filter(i => i >= 0);
        if (bots.length) botSay(t, bots[Math.floor(Math.random() * bots.length)], ['lol', 'focus up', 'talk is cheap', 'we’ll see', '🤖 beep boop'][Math.floor(Math.random() * 5)], 1500);
      }
    },
    react(c, m) {
      const t = tables.get(c.code); if (!t || !REACTIONS.includes(m.e)) return;
      out({ t: 'react', seat: t.seatOf(db.user.id), e: m.e, name: db.user.name });
    },
    addBot(c, m) { const t = tables.get(c.code); const err = t && t.addBot(Number(m.seat)); if (err) out({ t: 'error', message: err }); },
    removeBot(c, m) { const t = tables.get(c.code); const s = t && t.seats[Number(m.seat)]; if (s && s.kind === 'bot') t.removeSeat(Number(m.seat)); },
  };

  class PokrSocket {
    constructor() {
      this.readyState = 0;
      this.code = null;
      client = this;
      setTimeout(() => { this.readyState = 1; if (this.onopen) this.onopen(); }, 0);
    }
    send(raw) {
      let m; try { m = JSON.parse(raw); } catch { return; }
      setTimeout(() => {
        if (!H[m.t]) return;
        if (!['hello', 'signup', 'login'].includes(m.t) && (!db.user || !db.token)) return out({ t: 'needProfile' });
        try { H[m.t](this, m); } catch (e) { console.error(e); }
      }, 0);
    }
    _recv(m) { const data = JSON.stringify(m); setTimeout(() => { if (this.onmessage) this.onmessage({ data }); }, 0); }
    close() {}
  }
  setInterval(() => { if (db.user && shop.settle(db.user).length) { persist(); sendMe(); } }, 3000);
  window.PokrSocket = PokrSocket;
})();
