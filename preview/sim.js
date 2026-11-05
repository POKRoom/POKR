// In-browser stand-in for server/index.js, used only by the preview build.
// Same messages, same game engine; one local player, and the other seats are bots.
(function () {
  const { Table } = require('./engine');
  const STAKES = { '5-10': [5, 10], '10-25': [10, 25], '25-50': [25, 50], '50-100': [50, 100], '100-200': [100, 200], '200-500': [200, 500] };
  const { money } = require('./cards');
  const shop = require('./shop');
  const looks = require('./looks');
  const { createManager } = require('./tourneys');
  const { createRooms } = require('./bgrooms');
  const { createClubs } = require('./clubs');
  const { createClubHub } = require('./clubhub');
  const { ROSTER } = require('./bots');
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
    return { atTablesBy: { ...(u.atTables || {}) }, id: u.id, email: u.email, guest: !!u.guest, name: u.name, avatar: u.avatar, bankroll: u.bankroll, atTables, stats: u.stats, periods, vip: !!u.vip, specials: u.specials || [], admin: true, canRefill: u.bankroll + atTables < REFILL_BELOW, ...shop.publicEconomy(u) };
  };
  // Preview: you're the admin, and the bots are the other players you can restyle.
  const withLook = ch => ({ a: 0, c: ch.jk % 8, ch });
  const startLook = av => { const ch = looks.cleanLook(av && av.ch); return ch && !ch.sp && !looks.wearError({}, ch, false) ? ch : looks.randomLook(); };
  function dressBots(t) {
    const L = db.botLooks || {};
    const V = db.botVip || {};
    for (const s of t.seats) if (s && s.kind === 'bot' && (L[s.name] || V[s.name])) s.avatar = { ...(L[s.name] ? withLook(L[s.name]) : s.avatar), vip: V[s.name] ? 1 : 0 };
  }
  function adminList(q) {
    q = String(q || '').toLowerCase();
    const rows = [];
    if (db.user) rows.push({ id: 'me', name: db.user.name, avatar: db.user.avatar, email: db.user.email || null, guest: !!db.user.guest, hands: db.user.stats.hands, specials: db.user.specials || [], vip: !!db.user.vip });
    const seen = new Set(Object.keys(db.bots));
    for (const t of tables.values()) for (const st of t.seats) if (st && st.kind === 'bot') seen.add(st.name);
    for (const name of seen) {
      const ch = (db.botLooks || {})[name];
      rows.push({ id: 'bot:' + name, name, avatar: { ...(ch ? withLook(ch) : { a: -1, c: (db.bots[name] || {}).c || 0 }), vip: (db.botVip || {})[name] ? 1 : 0 }, email: null, guest: true, bot: true, hands: (db.bots[name] || {}).hands || 0, specials: (db.botSpecials || {})[name] || [], vip: !!(db.botVip || {})[name] });
    }
    return rows.filter(r => !q || r.name.toLowerCase().includes(q));
  }
  const sendMe = () => { if (db.user) out({ t: 'me', user: meOf(db.user) }); };
  const sendCatalog = () => out({ t: 'catalog', catalog: shop.catalog() });
  function leaderboard() {
    const rows = [];
    const u = db.user;
    if (u && u.stats.hands) rows.push({ id: u.id, name: u.name, avatar: u.avatar, net: u.stats.net, hands: u.stats.hands, winRate: u.stats.won / u.stats.hands, biggestPot: u.stats.biggestPot });
    for (const [name, b] of Object.entries(db.bots)) if (b.hands) rows.push({ id: 'bot-' + name, name: name + ' (bot)', avatar: { a: -1, c: b.c }, net: b.net, hands: b.hands, winRate: b.won / b.hands, biggestPot: b.biggest });
    return rows.sort((a, b) => b.net - a.net);
  }
  const lobby = () => ({ t: 'lobby', tables: [...tables.values()].filter(t => !t.isPrivate).map(t => t.summary()), boards: typeof bg !== 'undefined' ? bg.list() : [], leaderboard: leaderboard() });
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
      setTimeout(() => { t._q = false; dressBots(t); if (client && client.code === t.code) out({ t: 'state', s: tview(t) }); }, 0);
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
          if (t.clubId) clubs.record(t.clubId, db.user.id, r.delta);
        } else if (r.kind === 'bot') {
          const s = t.seats[r.seat];
          if (t.clubId) clubs.record(t.clubId, 'bot:' + s.name, r.delta);
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

  // Practice tables so the lobby has something to show: bots only, and a hand starts when you sit.
  [['The Back Room', 'nlh', '5-10', 9, [1, 3, 5, 7]], ['Pot Limit Lounge', 'plo', '10-25', 6, [1, 2, 4]],
   ['High Noon', 'nlh', '25-50', 8, [2, 4, 5, 6, 7]], ['Short Stack Club', 'nlh', '10-25', 5, [1, 3]],
   ['Omaha After Dark', 'plo', '50-100', 7, [1, 3, 4, 6]]].forEach(([name, game, st, n, bots]) => {
    const code = makeCode();
    const t = new Table({ code, name, sb: STAKES[st][0], bb: STAKES[st][1], hostId: 'house', isPrivate: false, game, maxSeats: n }, hooks);
    tables.set(code, t);
    bots.forEach(i => t.addBot(i));
  });

  // ---------- tournaments (same manager as the real server; bots fill the field) ----------
  let tourTimer = null;
  const tm = createManager({
    Table, tables, makeCode, preview: true,
    broadcast: t => hooks.onChange(t),
    charge(userId, cents) { const u = db.user; if (!u) return 'Sign in first'; if (u.bankroll < cents) return 'Not enough in your balance for that buy-in'; u.bankroll -= cents; persist(); sendMe(); return null; },
    credit(userId, cents) { const u = db.user; if (!u || !cents) return; u.bankroll += cents; persist(); sendMe(); },
    userInfo() { return { name: db.user.name, avatar: db.user.avatar }; },
    notify(userId, msg) { out(msg); },
    onResult(tour, p, info) { if (tour.clubId && p.userId) clubs.record(tour.clubId, p.userId, (info.prize || 0) - tour.buyIn); },
    moveClient(userId, code) {
      if (!client) return;
      if (!(client.code && tm.byTable.has(client.code)) && !client.followTourney) return;
      const t = tables.get(code);
      client.code = code;
      out({ t: 'moved', code });
      if (t) { out({ t: 'chat', items: t.chat, reset: true }); out({ t: 'state', s: tview(t) }); }
    },
    changed(tour) {
      if (tourTimer) return;
      tourTimer = setTimeout(() => {
        tourTimer = null;
        if (!client || !db.user) return;
        if (!client.code) out({ t: 'tourneys', list: tm.list(db.user.id) });
        if (client.tview) { const d = tm.detail(client.tview, db.user.id); if (d) out({ t: 'tourney', d }); }
      }, 800);
    },
  });
  setInterval(() => tm.tick(), 1000);
  const isTourneyTable = t => !!(t && t.tourney);

  // Backgammon boards, run by the same code as the real server.
  const bg = createRooms({
    makeCode,
    broadcast(room) {
      if (room._bcast) return;
      room._bcast = true;
      setTimeout(() => { room._bcast = false; if (client && db.user && client.bg === room.code) out({ t: 'bgState', s: room.view(db.user.id) }); }, 0);
    },
    charge(userId, cents) { const u = db.user; if (!u) return 'Sign in first'; if (u.bankroll < cents) return `You need ${money(cents)} in your balance to sit at this board`; u.bankroll -= cents; persist(); sendMe(); return null; },
    credit(userId, cents) { const u = db.user; if (!u) return; u.bankroll += cents || 0; persist(); sendMe(); },
    setAt(userId, code, cents) { const u = db.user; if (!u) return; if (cents == null) delete u.atTables['bg:' + code]; else u.atTables['bg:' + code] = cents; persist(); sendMe(); },
    notify(userId, msg) { out(msg); },
    changed() {},
    onGame(room, w, l, paid) {
      if (!room.clubId) return;
      const id = p => (p.kind === 'human' ? p.userId : 'bot:' + p.name);
      if (w) clubs.record(room.clubId, id(w), paid);
      if (l) clubs.record(room.clubId, id(l), -paid);
    },
  });
  // ---------- clubs (same rules and messages as the real server) ----------
  // The preview keeps clubs in this browser. One club is already running, full of bots, so there's
  // something to look at; you can join it, or start your own with Pro Pass.
  const botUser = name => {
    const b = ROSTER.find(x => x.name === name);
    const ch = (db.botLooks || {})[name];
    return b ? { id: 'bot:' + name, name, avatar: { ...(ch ? withLook(ch) : { a: -1, c: b.color }), vip: (db.botVip || {})[name] ? 1 : 0 } } : null;
  };
  const clubMap = new Map(Object.entries(db.clubs || {}));
  const saveClubs = () => { db.clubs = Object.fromEntries(clubMap); persist(); };
  const clubs = createClubs({
    store: {
      clubs: clubMap,
      byId: id => (db.user && id === db.user.id ? db.user : String(id).startsWith('bot:') ? botUser(String(id).slice(4)) : null),
      dropClub: id => { clubMap.delete(id); saveClubs(); },
    },
    save: saveClubs,
    clubActive: u => { shop.ensure(u); return !!(u.club && u.club.active); },
    notify: (userId, msg) => { if (db.user && userId === db.user.id) out(msg); },
    changed: club => hub.push(club),
    makeId: () => { let id; do id = makeCode(); while (clubMap.has(id)); return id; },
  });
  const hub = createClubHub(clubs, {
    send: (c, msg) => out(msg),
    clients: () => (client && db.user ? [client] : []),
    tablesFor: id => [...tables.values()].filter(t => t.clubId === id).map(t => t.summary()),
    tourneysFor: (id, uid) => [...tm.tours.values()].filter(t => t.clubId === id && t.status !== 'canceled').map(t => t.summary(uid)),
    boardsFor: id => bg.forClub(id),
  });
  const clubHandlers = {};
  for (const [k, fn] of Object.entries(hub.handlers)) clubHandlers[k] = (c, m) => {
    c.userId = db.user.id;
    // first visit: you're already a member of the demo club, so there's something to see
    if (!db.clubDemo) { db.clubDemo = true; const cl = clubs.find('NIGHT'); if (cl && !cl.members[db.user.id]) clubs.join(db.user.id, 'NIGHT'); }
    fn(c, m);
  };
  setInterval(() => clubs.tick(), 60000);
  function tview(t) {
    const s = t.view(db.user && db.user.id);
    const cl = t.clubId && clubs.find(t.clubId);
    if (cl) {
      s.club = { id: cl.id, name: cl.name, room: cl.room };
      const champ = cl.champions[0] && cl.champions[0].uid;
      s.champSeats = champ ? t.seats.map((x, i) => (x && (x.userId === champ || (x.kind === 'bot' && 'bot:' + x.name === champ)) ? i : -1)).filter(i => i >= 0) : [];
    }
    return s;
  }
  // The demo club: an owner, a few managers, a season under way and last month's champion.
  if (!clubMap.has('NIGHT')) {
    const now = Date.now(), DAY = 864e5;
    const names = ROSTER.map(b => b.name).slice(0, 14);
    const ym = new Date(now).toISOString().slice(0, 7);
    const prev = new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
    const c = {
      id: 'NIGHT', name: 'Thursday Night', ownerId: 'bot:' + names[0], createdAt: now - 70 * DAY,
      crest: { glyph: 2, color: 1 }, join: 'open', room: 'burgundy',
      members: {}, requests: {}, bans: [], invites: {}, chat: [], results: {},
      announcement: { text: 'Club game every Thursday at 8. Bring snacks, not excuses.', by: 'bot:' + names[0], at: now - 2 * DAY },
      season: { n: 3, ym, startedAt: now - 9 * DAY }, champions: [],
    };
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    names.forEach((n, i) => {
      const uid = 'bot:' + n;
      c.members[uid] = { role: i === 0 ? 'owner' : i < 3 ? 'manager' : 'member', joinedAt: now - (70 - i * 3) * DAY };
      const days = {};
      let season = 0, games = 0;
      for (let d = 0; d < 7; d++) if (rnd() < 0.55) { const v = Math.round((rnd() - 0.45) * 40) * 250; days[new Date(now - d * DAY).toISOString().slice(0, 10)] = v; season += v; games += 1 + Math.floor(rnd() * 6); }
      const extra = Math.round((rnd() - 0.45) * 60) * 500;
      c.results[uid] = { all: { net: season + extra * 3, games: games + 20 + Math.floor(rnd() * 80) }, season: { net: season + extra, games: games + 4 }, days };
    });
    c.champions = [{ ym: prev, n: 2, uid: 'bot:' + names[4], name: names[4], net: 186500 }, { ym: '', n: 1, uid: 'bot:' + names[1], name: names[1], net: 94250 }];
    const lines = [[1, 'who’s in tonight'], [5, 'me, after I lose this SNG'], [2, 'table’s up, 25/50'], [7, 'save me a seat'], [4, 'defending the title, try me']];
    lines.forEach(([i, text], k) => c.chat.push({ id: 'seed' + k, uid: 'bot:' + names[i], name: names[i], text, at: now - (lines.length - k) * 41 * 60000 }));
    clubMap.set(c.id, c);
    saveClubs();
  }
  // Its table is running, with bots.
  {
    const code = makeCode();
    const t = new Table({ code, name: 'Thursday Night 25/50', sb: 25, bb: 50, hostId: 'house', isPrivate: true, game: 'nlh', maxSeats: 6 }, hooks);
    t.clubId = 'NIGHT';
    tables.set(code, t);
    [1, 2, 4].forEach(i => t.addBot(i));
  }

  const H = {
    ...clubHandlers,
    // ---- backgammon ----
    bgCreate(c, m) {
      if (!db.user) return;
      const clubId = m.clubId ? String(m.clubId).toUpperCase() : null;
      if (clubId && !clubs.isMember(clubId, db.user.id)) return out({ t: 'error', message: 'Join the club to start its games' });
      const r = bg.create(db.user.id, { name: db.user.name, avatar: db.user.avatar }, { stake: Number(m.stake), vsBot: !!m.vsBot, level: m.level, isPrivate: !!m.isPrivate, clubId });
      if (r.err) return out({ t: 'error', message: r.err });
      if (clubId) { const cl = clubs.find(clubId); if (cl) hub.push(cl); }
      c.bg = r.code;
      out({ t: 'bgState', s: bg.view(r.code, db.user.id) });
    },
    bgOpen(c, m) {
      const code = String(m.code || '').toUpperCase();
      const s = bg.view(code, db.user.id);
      if (!s) return out({ t: 'bgGone', code });
      if (s.mySeat < 0 && s.clubId && !clubs.isMember(s.clubId, db.user.id)) return out({ t: 'error', message: 'This board is for club members' });
      c.bg = code;
      if (s.mySeat >= 0) bg.setConnected(db.user.id, true);
      out({ t: 'bgState', s: bg.view(code, db.user.id) });
    },
    bgClose(c) { c.bg = null; },
    bgSit(c, m) { const err = bg.sit(db.user.id, { name: db.user.name, avatar: db.user.avatar }, String(m.code || c.bg || '')); if (err) out({ t: 'error', message: err }); },
    bgLeave(c, m) { const err = bg.leave(db.user.id, String(m.code || c.bg || '')); if (err) out({ t: 'error', message: err }); c.bg = null; out(lobby()); },
    bgBot(c, m) { const err = bg.addBot(db.user.id, String(m.code || c.bg || '')); if (err) out({ t: 'error', message: err }); },
    bgAct(c, m) {
      const a = m.a || {};
      if (!['roll', 'move', 'double', 'take', 'drop'].includes(a.t)) return;
      const err = bg.act(db.user.id, String(m.code || c.bg || ''), { t: a.t, steps: a.steps });
      if (err) { out({ t: 'error', message: err }); const s = bg.view(c.bg, db.user.id); if (s) out({ t: 'bgState', s }); }
    },
    tourneys() { out({ t: 'tourneys', list: tm.list(db.user.id) }); },
    tourney(c, m) { c.tview = String(m.id || ''); const d = tm.detail(c.tview, db.user.id); if (!d) return out({ t: 'error', message: 'That tournament doesn’t exist' }); out({ t: 'tourney', d }); },
    tUnwatch(c) { c.tview = null; },
    tReg(c, m) { const tour = tm.tours.get(m.id); if (tour && tour.clubId && !clubs.isMember(tour.clubId, db.user.id)) return out({ t: 'error', message: 'This tournament is for club members' }); const e = tm.register(db.user.id, m.id); if (e) return out({ t: 'error', message: e }); c.followTourney = true; out({ t: 'notice', message: 'You’re registered' }); tm.tours.get(m.id) && tm.tours.get(m.id)._changed(); },
    tUnreg(c, m) { const e = tm.unregister(db.user.id, m.id); if (e) return out({ t: 'error', message: e }); out({ t: 'notice', message: 'Unregistered. Your buy-in is back in your balance.' }); },
    tHost(c, m) {
      const clubId = m.clubId ? String(m.clubId).toUpperCase() : null;
      if (clubId && !clubs.isMember(clubId, db.user.id)) return out({ t: 'error', message: 'Join the club to host its tournaments' });
      const t = tm.host(db.user.id, { ...m, clubId });
      if (clubId) { const cl = clubs.find(clubId); if (cl) hub.push(cl); } c.tview = t.id; out({ t: 'tourneyHosted', id: t.id }); out({ t: 'tourney', d: t.detail(db.user.id) }); },
    tStart(c, m) { const e = tm.start(db.user.id, m.id); if (e) return out({ t: 'error', message: e }); },
    tBots(c, m) { const e = tm.addBots(db.user.id, m.id, Number(m.n)); if (e) return out({ t: 'error', message: e }); },
    tSeat(c, m) {
      const code = tm.myTable(db.user.id, m.id);
      if (!code) return out({ t: 'error', message: 'You don’t have a seat in that tournament right now' });
      c.followTourney = true;
      H.join(c, { code });
    },
    hello(c, m) {
      if (db.user) {
        // chips left at tables from a previous visit come back
        const left = Object.values(db.user.atTables || {}).reduce((a, b) => a + b, 0);
        db.user.bankroll += left; db.user.atTables = {}; persist();
      }
      if (!db.user || db.token !== m.token) return out({ t: 'needProfile' });
      sendMe(); sendCatalog(); out({ t: 'tourneys', list: tm.list(db.user.id) });
    },
    // Preview accounts live only in this browser; the real server hashes passwords and checks them properly.
    signup(c, m) {
      const name = String(m.name || '').trim().slice(0, 16);
      const email = String(m.email || '').trim().toLowerCase();
      if (name.length < 2) return out({ t: 'authError', message: 'Pick a name with at least 2 characters' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return out({ t: 'authError', message: 'Enter a valid email address' });
      if (String(m.password || '').length < 8) return out({ t: 'authError', message: 'Use a password with at least 8 characters' });
      db.user = { id: 'me', email, pw: pwHash(m.password), name, avatar: withLook(startLook(m.avatar)), bankroll: START, atTables: {}, stats: { hands: 0, won: 0, biggestPot: 0, net: 0 }, hist: [] };
      db.token = Math.random().toString(36).slice(2);
      persist();
      out({ t: 'token', token: db.token });
      sendMe(); sendCatalog();
    },
    guest(c, m) {
      const name = String(m.name || '').trim().slice(0, 16);
      if (name.length < 2) return out({ t: 'authError', message: 'Pick a name with at least 2 characters' });
      db.user = { id: 'me', guest: true, email: null, name, avatar: withLook(startLook(m.avatar)), bankroll: START, atTables: {}, stats: { hands: 0, won: 0, biggestPot: 0, net: 0 }, hist: [] };
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
      let avatar;
      if (m.avatar && m.avatar.ch) {
        const ch = looks.cleanLook(m.avatar.ch);
        if (!ch) return out({ t: 'error', message: 'Something’s off with that character. Try again.' });
        shop.ensure(db.user);
        const why = looks.wearError(db.user, ch, !!db.user.club.active);
        if (why) return out({ t: 'error', message: why });
        avatar = withLook(ch);
      } else {
        if (!shop.canUseAvatar(db.user, m.avatar && m.avatar.a)) return out({ t: 'error', message: 'That avatar comes with Pro Pass or the shop' });
        avatar = m.avatar;
      }
      db.user.name = name; db.user.avatar = { ...avatar, vip: db.user.vip ? 1 : 0 };
      avatar = db.user.avatar;
      for (const t of tables.values()) { const i = t.seatOf(db.user.id); if (i >= 0) { t.seats[i].name = name; t.seats[i].avatar = avatar; hooks.onChange(t); } }
      persist();
      sendMe();
    },
    adminUsers(c, m) { out({ t: 'adminUsers', list: adminList(m.q) }); },
    adminLook(c, m) {
      const ch = looks.cleanLook(m.ch);
      if (!ch) return out({ t: 'error', message: 'Couldn’t save that look' });
      const id = String(m.userId || '');
      if (id === 'me') {
        if (ch.sp && !(db.user.specials || []).includes(ch.sp)) db.user.specials = [...(db.user.specials || []), ch.sp];
        db.user.avatar = { ...withLook(ch), vip: db.user.vip ? 1 : 0 };
        for (const t of tables.values()) { const i = t.seatOf(db.user.id); if (i >= 0) { t.seats[i].avatar = db.user.avatar; hooks.onChange(t); } }
        sendMe();
      } else if (id.startsWith('bot:')) {
        const name = id.slice(4);
        db.botLooks = db.botLooks || {}; db.botLooks[name] = ch;
        if (ch.sp) { db.botSpecials = db.botSpecials || {}; db.botSpecials[name] = [...new Set([...(db.botSpecials[name] || []), ch.sp])]; }
        for (const t of tables.values()) hooks.onChange(t);
      }
      persist();
      out({ t: 'notice', message: 'Look saved' });
      out({ t: 'adminUsers', list: adminList(m.q) });
    },
    adminVip(c, m) {
      const id = String(m.userId || '');
      if (id === 'me') {
        db.user.vip = !!m.on; db.user.avatar = { ...db.user.avatar, vip: db.user.vip ? 1 : 0 };
        for (const t of tables.values()) { const i = t.seatOf(db.user.id); if (i >= 0) { t.seats[i].avatar = db.user.avatar; hooks.onChange(t); } }
        sendMe();
      } else if (id.startsWith('bot:')) {
        db.botVip = db.botVip || {}; db.botVip[id.slice(4)] = !!m.on;
        for (const t of tables.values()) hooks.onChange(t);
      }
      persist();
      out({ t: 'adminUsers', list: adminList(m.q) });
    },
    adminGrant(c, m) {
      const id = String(m.userId || ''), sp = String(m.sp || '');
      if (!looks.SPECIAL_IDS.includes(sp)) return;
      const toggle = arr => { const h = new Set(arr || []); if (m.on) h.add(sp); else h.delete(sp); return [...h]; };
      if (id === 'me') {
        db.user.specials = toggle(db.user.specials);
        if (!m.on && db.user.avatar.ch && db.user.avatar.ch.sp === sp) db.user.avatar = withLook({ ...db.user.avatar.ch, sp: '' });
        sendMe();
      } else if (id.startsWith('bot:')) {
        const name = id.slice(4);
        db.botSpecials = db.botSpecials || {}; db.botSpecials[name] = toggle(db.botSpecials[name]);
        const L = db.botLooks || {};
        if (!m.on && L[name] && L[name].sp === sp) L[name] = { ...L[name], sp: '' };
        for (const t of tables.values()) hooks.onChange(t);
      }
      persist();
      out({ t: 'adminUsers', list: adminList(m.q) });
    },
    lobby() { out(lobby()); out({ t: 'tourneys', list: tm.list(db.user.id) }); },
    club(c, m) {
      const r = shop.club(db.user, m.action); if (r.error) return out({ t: 'error', message: r.error });
      if (r.resetAvatar) for (const t of tables.values()) { const i = t.seatOf(db.user.id); if (i >= 0) { t.seats[i].avatar = db.user.avatar; hooks.onChange(t); } }
      persist(); sendMe(); out({ t: 'notice', message: m.action === 'join' ? 'Pro Pass is on' : 'Membership canceled' });
    },
    buyAvatar(c, m) { const r = shop.buyAvatar(db.user, Number(m.a)); if (r.error) return out({ t: 'error', message: r.error }); persist(); sendMe(); out({ t: 'notice', message: 'Avatar unlocked' }); },
    setFelt(c, m) { const r = shop.setFelt(db.user, String(m.felt)); if (r.error) return out({ t: 'error', message: r.error }); persist(); sendMe(); },
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
      const clubId = m.clubId ? String(m.clubId).toUpperCase() : null;
      if (clubId && !clubs.isMember(clubId, db.user.id)) return out({ t: 'error', message: 'Join the club to start its games' });
      const code = makeCode();
      const t = new Table({ code, name: String(m.name || '').trim().slice(0, 28) || `${db.user.name}'s table`, sb: st[0], bb: st[1], hostId: db.user.id, isPrivate: !!m.isPrivate || !!clubId, game: m.game === 'plo' ? 'plo' : 'nlh', maxSeats: Math.max(5, Math.min(9, Math.floor(m.seats) || 6)) }, hooks);
      tables.set(code, t);
      if (clubId) { t.clubId = clubId; const cl = clubs.find(clubId); if (cl) hub.push(cl); }
      const n = t.seats.length; [...new Set([Math.round(n / 4), Math.round(n / 2), Math.round(3 * n / 4)])].forEach(i => t.addBot(i));
      out({ t: 'created', code });
    },
    join(c, m) {
      const t = tables.get(String(m.code || '').toUpperCase());
      if (!t) return out({ t: 'notFound', code: m.code });
      if (t.clubId && !clubs.isMember(t.clubId, db.user.id)) { const cl = clubs.find(t.clubId); return out({ t: 'error', message: `This table is for members of ${cl ? cl.name : 'a club'}` }); }
      c.code = t.code;
      out({ t: 'chat', items: t.chat, reset: true });
      if (t.seatOf(db.user.id) >= 0) t.setConnected(db.user.id, true);
      out({ t: 'state', s: tview(t) });
      if (!t.chat.length && !isTourneyTable(t)) botSay(t, 3, 'gl all', 1200);
    },
    leave(c, m) {
      const t = tables.get(c.code);
      if (isTourneyTable(t)) { c.followTourney = false; t.setConnected(db.user.id, false); }
      else if (t && !(m && m.keepSeat)) t.stand(db.user.id);
      c.code = null; if (!(m && m.keepSeat)) { out(lobby()); out({ t: 'tourneys', list: tm.list(db.user.id) }); }
    },
    sit(c, m) {
      const t = tables.get(c.code), u = db.user;
      if (isTourneyTable(t)) return out({ t: 'error', message: 'Register for the tournament to get a seat' });
      const buyIn = Math.floor(Number(m.buyIn));
      if (!(buyIn >= t.buyInMin && buyIn <= t.buyInMax)) return out({ t: 'error', message: `Buy in between ${money(t.buyInMin)} and ${money(t.buyInMax)}` });
      if (buyIn > u.bankroll) return out({ t: 'error', message: 'You don’t have that many chips in your bankroll' });
      const err = t.sit({ userId: u.id, name: u.name, avatar: u.avatar }, Number(m.seat), buyIn);
      if (err) return out({ t: 'error', message: err });
      u.bankroll -= buyIn; u.atTables[t.code] = buyIn; persist(); sendMe();
    },
    stand(c) { const t = tables.get(c.code); if (t && !isTourneyTable(t)) t.stand(db.user.id); },
    rebuy(c, m) {
      const t = tables.get(c.code), u = db.user, i = t.seatOf(u.id);
      if (isTourneyTable(t)) return out({ t: 'error', message: 'No rebuys in this tournament' });
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
        if (!['hello', 'signup', 'login', 'guest'].includes(m.t) && (!db.user || !db.token)) return out({ t: 'needProfile' });
        try { H[m.t](this, m); } catch (e) { console.error(e); }
      }, 0);
    }
    _recv(m) { const data = JSON.stringify(m); setTimeout(() => { if (this.onmessage) this.onmessage({ data }); }, 0); }
    close() {}
  }
  setInterval(() => { if (db.user && shop.settle(db.user).length) { persist(); sendMe(); } }, 3000);
  window.PokrSocket = PokrSocket;
})();
