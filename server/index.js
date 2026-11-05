'use strict';
// Pokr server: serves the web app and runs every table over WebSockets.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { attach } = require('./ws');
const { Table } = require('./engine');
const { Store, START_BANKROLL } = require('./store');
const { money } = require('./cards');
const shop = require('./shop');
const looks = require('./looks');
// Admins can edit anyone's character and hand out special looks. Set ADMIN_EMAILS on the host
// (comma-separated) so the list never lives in the code.
const ADMINS = String(process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
const isAdmin = u => !!(u && u.email && ADMINS.includes(u.email));
// A character to save: the one they sent if it's valid and free, otherwise a random one.
const startLook = av => { const ch = looks.cleanLook(av && av.ch); return ch && !ch.sp && !looks.wearError({}, ch, false) ? ch : looks.randomLook(); };
const withLook = ch => ({ a: 0, c: ch.jk % 8, ch });
// The VIP star rides on the avatar so it shows wherever the player does: seats, chat, leaderboard.
const stamp = (u, avatar) => ({ ...avatar, vip: u.vip ? 1 : 0 });
const { createManager } = require('./tourneys');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, '..', 'public');
const store = new Store(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
store.refundTables();

// blinds in cents: 5¢/10¢ up to $2/$5
const STAKES = { '5-10': [5, 10], '10-25': [10, 25], '25-50': [25, 50], '50-100': [50, 100], '100-200': [100, 200], '200-500': [200, 500] };
const REACTIONS = ['👍', '😂', '🔥', '😱', '💀', '👏', '🤡', '💰'];
const AVATAR_COUNT = shop.AVATAR_COUNT, COLOR_COUNT = 8;
const REFILL_BELOW = 10000; // $100

const tables = new Map();
const clients = new Set();

// ---------- static files ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = url.pathname;
  if (p === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  if (p === '/' || /^\/t\/[A-Za-z0-9]{3,8}\/?$/.test(p)) p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
});

// ---------- helpers ----------
const send = (c, msg) => c.ws.send(msg);
function meOf(u) {
  const atTables = Object.values(u.atTables || {}).reduce((a, b) => a + b, 0);
  return { atTablesBy: { ...(u.atTables || {}) }, id: u.id, email: u.email, guest: !!u.guest, name: u.name, avatar: u.avatar, bankroll: u.bankroll, atTables, stats: u.stats, periods: store.periods(u), verification: u.verification, vip: !!u.vip, specials: u.specials || [], admin: isAdmin(u), canRefill: u.bankroll + atTables < REFILL_BELOW, ...shop.publicEconomy(u) };
}
function sendMe(userId) {
  const u = store.byId(userId);
  if (!u) return;
  for (const c of clients) if (c.userId === userId) send(c, { t: 'me', user: meOf(u) });
}
const notifyUser = (userId, msg) => { for (const c of clients) if (c.userId === userId) send(c, msg); };
// Show someone's new name and look at every table they're sitting at.
function restyleSeats(u) {
  for (const t of tables.values()) {
    const i = t.seatOf(u.id);
    if (i >= 0) { t.seats[i].name = u.name; t.seats[i].avatar = u.avatar; broadcastTable(t); }
  }
}
function lobbyPayload() {
  const list = [...tables.values()].filter(t => !t.isPrivate && t.humanCount() > 0).map(t => t.summary());
  return { t: 'lobby', tables: list, leaderboard: store.leaderboard() };
}
let lobbyTimer = null;
function lobbyChanged() {
  if (lobbyTimer) return;
  lobbyTimer = setTimeout(() => {
    lobbyTimer = null;
    const msg = JSON.stringify(lobbyPayload());
    for (const c of clients) if (!c.code && c.userId) c.ws.send(msg);
  }, 1500);
}
function broadcastTable(t) {
  if (t._bcast) return;
  t._bcast = true;
  setImmediate(() => {
    t._bcast = false;
    for (const c of clients) if (c.code === t.code) send(c, { t: 'state', s: t.view(c.userId) });
  });
}
function toTable(t, msg) {
  const s = JSON.stringify(msg);
  for (const c of clients) if (c.code === t.code) c.ws.send(s);
}
function makeCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  for (;;) {
    let code = '';
    for (let i = 0; i < 5; i++) code += A[crypto.randomInt(A.length)];
    if (!tables.has(code)) return code;
  }
}
const cleanText = (s, max) => String(s || '').replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '').trim().slice(0, max);
// slow down password guessing: 8 sign-up/log-in attempts per connection per minute
function allowAuthAttempt(c) {
  const now = Date.now();
  c.auth = (c.auth || []).filter(t => now - t < 60000);
  if (c.auth.length >= 8) return false;
  c.auth.push(now);
  return true;
}
const validAvatar = a => a && Number.isInteger(a.a) && a.a >= 0 && a.a < AVATAR_COUNT && Number.isInteger(a.c) && a.c >= 0 && a.c < COLOR_COUNT;

const hooks = {
  onChange: t => { broadcastTable(t); lobbyChanged(); },
  onHandEnd: (t, summary) => {
    for (const r of summary) {
      if (r.kind !== 'human') continue;
      const u = store.byId(r.userId);
      if (!u) continue;
      store.recordHand(u, r);
      u.atTables[t.code] = r.chips;
    }
    store.save();
    for (const r of summary) if (r.kind === 'human') sendMe(r.userId);
  },
  onStand: (t, userId, chips) => {
    const u = store.byId(userId);
    if (!u) return;
    u.bankroll += chips;
    delete u.atTables[t.code];
    store.ledger(u, 'cashout', chips, t.code);
    store.save();
    sendMe(userId);
  },
};

// ---------- tournaments ----------
const tm = createManager({
  Table, tables,
  makeCode,
  broadcast: t => broadcastTable(t),
  charge(userId, cents, why) {
    const u = store.byId(userId); if (!u) return 'Sign in first';
    if (u.bankroll < cents) return 'Not enough in your balance for that buy-in';
    u.bankroll -= cents; store.ledger(u, 'tourney-buyin', -cents, why); store.save(); sendMe(userId);
    return null;
  },
  credit(userId, cents, why) {
    const u = store.byId(userId); if (!u || !cents) return;
    u.bankroll += cents; store.ledger(u, 'tourney-prize', cents, why); store.save(); sendMe(userId);
  },
  userInfo(userId) { const u = store.byId(userId); return u ? { name: u.name, avatar: u.avatar } : { name: 'Player', avatar: { a: 0, c: 0 } }; },
  notify(userId, msg) { for (const c of clients) if (c.userId === userId) send(c, msg); },
  moveClient(userId, code) {
    const t = tables.get(code);
    for (const c of clients) {
      if (c.userId !== userId) continue;
      const watchingTourney = c.code && tm.byTable.has(c.code);
      if (!watchingTourney && !c.followTourney) continue;
      c.code = code;
      send(c, { t: 'moved', code });
      if (t) { send(c, { t: 'chat', items: t.chat, reset: true }); send(c, { t: 'state', s: t.view(c.userId) }); }
    }
  },
  changed: tour => tourneyChanged(tour),
});
let tourTimer = null;
const dirtyTours = new Set();
function tourneyChanged(tour) {
  if (tour) dirtyTours.add(tour.id);
  if (tourTimer) return;
  tourTimer = setTimeout(() => {
    tourTimer = null;
    for (const c of clients) {
      if (!c.userId) continue;
      if (!c.code) send(c, { t: 'tourneys', list: tm.list(c.userId) });
      if (c.tview && dirtyTours.has(c.tview)) send(c, { t: 'tourney', d: tm.detail(c.tview, c.userId) });
    }
    dirtyTours.clear();
  }, 1000);
}
setInterval(() => tm.tick(), 1000).unref();
const isTourneyTable = t => !!(t && t.tourney);

// ---------- messages ----------
const handlers = {
  tourneys(c) { send(c, { t: 'tourneys', list: tm.list(c.userId) }); },
  tourney(c, m) { c.tview = String(m.id || ''); const d = tm.detail(c.tview, c.userId); if (!d) return send(c, { t: 'error', message: 'That tournament doesn’t exist' }); send(c, { t: 'tourney', d }); },
  tUnwatch(c) { c.tview = null; },
  tReg(c, m) { const e = tm.register(c.userId, m.id); if (e) return send(c, { t: 'error', message: e }); c.followTourney = true; send(c, { t: 'notice', message: 'You’re registered' }); tourneyChanged(tm.tours.get(m.id)); },
  tUnreg(c, m) { const e = tm.unregister(c.userId, m.id); if (e) return send(c, { t: 'error', message: e }); send(c, { t: 'notice', message: 'Unregistered. Your buy-in is back in your balance.' }); },
  tHost(c, m) { const t = tm.host(c.userId, m); c.tview = t.id; send(c, { t: 'tourneyHosted', id: t.id }); send(c, { t: 'tourney', d: t.detail(c.userId) }); },
  tStart(c, m) { const e = tm.start(c.userId, m.id); if (e) return send(c, { t: 'error', message: e }); },
  tBots(c, m) { const e = tm.addBots(c.userId, m.id, Number(m.n)); if (e) return send(c, { t: 'error', message: e }); },
  tSeat(c, m) {
    const code = tm.myTable(c.userId, m.id);
    if (!code) return send(c, { t: 'error', message: 'You don’t have a seat in that tournament right now' });
    c.followTourney = true;
    handlers.join(c, { code });
  },
  hello(c, m) {
    const u = store.bySessionToken(m.token);
    if (!u) return send(c, { t: 'needProfile' });
    c.userId = u.id; c.token = m.token;
    send(c, { t: 'me', user: meOf(u) });
    send(c, { t: 'catalog', catalog: shop.catalog() });
    send(c, { t: 'tourneys', list: tm.list(u.id) });
  },

  signup(c, m) {
    if (!allowAuthAttempt(c)) return send(c, { t: 'authError', message: 'Too many tries. Wait a minute and try again.' });
    const name = cleanText(m.name, 16);
    if (name.length < 2) return send(c, { t: 'authError', message: 'Pick a name with at least 2 characters' });
    const r = store.signup({ email: m.email, password: m.password, name, avatar: withLook(startLook(m.avatar)) });
    if (r.error) return send(c, { t: 'authError', message: r.error });
    c.userId = r.user.id; c.token = r.token;
    send(c, { t: 'token', token: r.token });
    send(c, { t: 'me', user: meOf(r.user) });
    send(c, { t: 'catalog', catalog: shop.catalog() });
  },

  guest(c, m) {
    if (!allowAuthAttempt(c)) return send(c, { t: 'authError', message: 'Too many tries. Wait a minute and try again.' });
    const name = cleanText(m.name, 16);
    if (name.length < 2) return send(c, { t: 'authError', message: 'Pick a name with at least 2 characters' });
    const r = store.guest({ name, avatar: withLook(startLook(m.avatar)) });
    c.userId = r.user.id; c.token = r.token;
    send(c, { t: 'token', token: r.token });
    send(c, { t: 'me', user: meOf(r.user) });
    send(c, { t: 'catalog', catalog: shop.catalog() });
  },

  login(c, m) {
    if (!allowAuthAttempt(c)) return send(c, { t: 'authError', message: 'Too many tries. Wait a minute and try again.' });
    const r = store.login({ email: m.email, password: m.password });
    if (r.error) return send(c, { t: 'authError', message: r.error });
    c.userId = r.user.id; c.token = r.token;
    send(c, { t: 'token', token: r.token });
    send(c, { t: 'me', user: meOf(r.user) });
    send(c, { t: 'catalog', catalog: shop.catalog() });
  },

  logout(c) {
    if (c.code) handlers.leave(c, { keepSeat: true });
    if (c.token) store.logout(c.token);
    c.userId = null; c.token = null;
    send(c, { t: 'needProfile' });
  },

  profile(c, m) {
    const name = cleanText(m.name, 16);
    if (name.length < 2) return send(c, { t: 'error', message: 'Pick a name with at least 2 characters' });
    const u = c.userId && store.byId(c.userId);
    if (!u) return;
    let avatar;
    if (m.avatar && m.avatar.ch) {
      const ch = looks.cleanLook(m.avatar.ch);
      if (!ch) return send(c, { t: 'error', message: 'Something’s off with that character. Try again.' });
      shop.ensure(u);
      const why = looks.wearError(u, ch, !!u.club.active);
      if (why) return send(c, { t: 'error', message: why });
      avatar = withLook(ch);
    } else {
      if (!validAvatar(m.avatar)) return send(c, { t: 'error', message: 'Pick an avatar' });
      avatar = { a: m.avatar.a, c: m.avatar.c, ...(u.avatar && u.avatar.ch ? { ch: u.avatar.ch } : {}) };
      if (!shop.canUseAvatar(u, avatar.a)) return send(c, { t: 'error', message: 'That avatar comes with Pro Pass or the shop' });
    }
    u.name = name; u.avatar = stamp(u, avatar);
    store.save();
    restyleSeats(u);
    sendMe(u.id);
  },

  // ---- admin: edit anyone's character, give out special looks ----
  adminUsers(c, m) {
    if (!isAdmin(store.byId(c.userId))) return send(c, { t: 'error', message: 'Admins only' });
    const q = cleanText(m.q || '', 40).toLowerCase();
    const list = store.all().filter(u => !q || String(u.name).toLowerCase().includes(q) || String(u.email || '').includes(q))
      .sort((a, b) => (b.stats.hands || 0) - (a.stats.hands || 0)).slice(0, 60)
      .map(u => ({ id: u.id, name: u.name, avatar: u.avatar, email: u.email || null, guest: !!u.guest, hands: u.stats.hands || 0, specials: u.specials || [], vip: !!u.vip }));
    send(c, { t: 'adminUsers', list });
  },
  adminLook(c, m) {
    const me = store.byId(c.userId);
    if (!isAdmin(me)) return send(c, { t: 'error', message: 'Admins only' });
    const u = store.byId(String(m.userId || ''));
    const ch = looks.cleanLook(m.ch);
    if (!u || !ch) return send(c, { t: 'error', message: 'Couldn’t save that look' });
    // an admin can dress anyone in anything; a special they put on someone is also given to them
    if (ch.sp && !(u.specials || []).includes(ch.sp)) u.specials = [...(u.specials || []), ch.sp];
    u.avatar = stamp(u, withLook(ch));
    store.save(); restyleSeats(u); sendMe(u.id);
    if (u.id !== me.id) notifyUser(u.id, { t: 'notice', message: `${me.name} changed your look` });
    handlers.adminUsers(c, { q: m.q });
  },
  adminVip(c, m) {
    const me = store.byId(c.userId);
    if (!isAdmin(me)) return send(c, { t: 'error', message: 'Admins only' });
    const u = store.byId(String(m.userId || ''));
    if (!u) return send(c, { t: 'error', message: 'Couldn’t find that player' });
    u.vip = !!m.on;
    u.avatar = stamp(u, u.avatar || { a: 0, c: 0 });
    store.save(); restyleSeats(u); sendMe(u.id);
    if (u.vip && u.id !== me.id) notifyUser(u.id, { t: 'notice', message: `${me.name} gave you a VIP star` });
    handlers.adminUsers(c, { q: m.q });
  },
  adminGrant(c, m) {
    const me = store.byId(c.userId);
    if (!isAdmin(me)) return send(c, { t: 'error', message: 'Admins only' });
    const u = store.byId(String(m.userId || ''));
    const sp = String(m.sp || '');
    if (!u || !looks.SPECIAL_IDS.includes(sp)) return send(c, { t: 'error', message: 'Couldn’t do that' });
    const has = new Set(u.specials || []);
    if (m.on) has.add(sp); else has.delete(sp);
    u.specials = [...has];
    if (!m.on && u.avatar && u.avatar.ch && u.avatar.ch.sp === sp) { u.avatar = stamp(u, withLook({ ...u.avatar.ch, sp: '' })); restyleSeats(u); }
    store.save(); sendMe(u.id);
    const nm = (looks.SPECIALS.find(x => x.id === sp) || {}).name;
    if (m.on && u.id !== me.id) notifyUser(u.id, { t: 'notice', message: `${me.name} gave you ${nm}. Wear it from Name & avatar.` });
    handlers.adminUsers(c, { q: m.q });
  },

  lobby(c) { send(c, lobbyPayload()); send(c, { t: 'tourneys', list: tm.list(c.userId) }); },

  // ---- Pro Pass, avatar shop, themes (test mode: nothing is charged) ----
  club(c, m) {
    const u = store.byId(c.userId);
    const r = shop.club(u, m.action);
    if (r.error) return send(c, { t: 'error', message: r.error });
    if (r.resetAvatar) for (const t of tables.values()) { const i = t.seatOf(u.id); if (i >= 0) { t.seats[i].avatar = u.avatar; broadcastTable(t); } }
    store.save(); sendMe(u.id);
    send(c, { t: 'notice', message: m.action === 'join' ? 'Pro Pass is on' : 'Membership canceled' });
  },
  buyAvatar(c, m) {
    const u = store.byId(c.userId);
    const r = shop.buyAvatar(u, Number(m.a));
    if (r.error) return send(c, { t: 'error', message: r.error });
    store.save(); sendMe(u.id);
    send(c, { t: 'notice', message: 'Avatar unlocked' });
  },
  setFelt(c, m) {
    const u = store.byId(c.userId);
    const r = shop.setFelt(u, String(m.felt));
    if (r.error) return send(c, { t: 'error', message: r.error });
    store.save(); sendMe(u.id);
  },
  setTheme(c, m) {
    const u = store.byId(c.userId);
    const r = shop.setTheme(u, String(m.theme));
    if (r.error) return send(c, { t: 'error', message: r.error });
    store.save(); sendMe(u.id);
  },

  // ---- Cashier: free deposits and standard withdrawals; a fee only on instant transfers ----
  cashier(c, m) {
    const u = store.byId(c.userId);
    const r = shop.cashier(u, { action: m.action, amount: m.amount, speed: m.speed });
    if (r.error) return send(c, { t: 'error', message: r.error });
    const tx = r.tx;
    store.ledger(u, tx.type + ':' + tx.speed + (tx.status === 'pending' ? ':started' : ''), r.bankrollChange, tx.id + (tx.fee ? ` fee ${tx.fee}` : ''));
    store.save(); sendMe(u.id);
    const verb = tx.type === 'deposit' ? 'Deposit' : 'Withdrawal';
    send(c, { t: 'notice', message: tx.status === 'completed' ? `${verb} of ${money(tx.amount)} done` : `${verb} of ${money(tx.amount)} is on its way` });
  },

  refill(c) {
    const u = store.byId(c.userId);
    if (!u) return;
    if (!meOf(u).canRefill) return send(c, { t: 'error', message: `Free chips are for players under ${money(REFILL_BELOW)}` });
    const add = START_BANKROLL - u.bankroll;
    u.bankroll = START_BANKROLL;
    store.ledger(u, 'refill', add, 'free chips');
    store.save();
    sendMe(u.id);
  },

  create(c, m) {
    const u = store.byId(c.userId);
    if (!u) return;
    const stakes = STAKES[m.stakes] || STAKES['10-25'];
    const code = makeCode();
    const name = cleanText(m.name, 28) || `${u.name}'s table`;
    const t = new Table({ code, name, sb: stakes[0], bb: stakes[1], hostId: u.id, isPrivate: !!m.isPrivate, game: m.game === 'plo' ? 'plo' : 'nlh', maxSeats: Math.max(5, Math.min(9, Math.floor(m.seats) || 6)) }, hooks);
    tables.set(code, t);
    send(c, { t: 'created', code });
    lobbyChanged();
  },

  join(c, m) {
    const t = tables.get(String(m.code || '').toUpperCase());
    if (!t) return send(c, { t: 'notFound', code: m.code });
    if (c.code && c.code !== t.code) handlers.leave(c, { keepSeat: true });
    c.code = t.code;
    send(c, { t: 'chat', items: t.chat, reset: true });
    if (c.userId && t.seatOf(c.userId) >= 0) t.setConnected(c.userId, true);
    send(c, { t: 'state', s: t.view(c.userId) });
  },

  leave(c, m = {}) {
    const t = tables.get(c.code);
    if (t && c.userId && !m.keepSeat && !isTourneyTable(t)) t.stand(c.userId);
    if (t && c.userId && isTourneyTable(t)) { c.followTourney = false; if (![...clients].some(o => o !== c && o.userId === c.userId && o.code === t.code)) t.setConnected(c.userId, false); }
    c.code = null;
    if (!m.keepSeat) send(c, lobbyPayload());
  },

  sit(c, m) {
    const t = tables.get(c.code), u = store.byId(c.userId);
    if (!t || !u) return;
    if (isTourneyTable(t)) return send(c, { t: 'error', message: 'Register for the tournament to get a seat' });
    const buyIn = Math.floor(Number(m.buyIn));
    if (!(buyIn >= t.buyInMin && buyIn <= t.buyInMax)) return send(c, { t: 'error', message: `Buy in between ${money(t.buyInMin)} and ${money(t.buyInMax)}` });
    if (buyIn > u.bankroll) return send(c, { t: 'error', message: 'You don’t have that many chips in your bankroll' });
    const err = t.sit({ userId: u.id, name: u.name, avatar: u.avatar }, Number(m.seat), buyIn);
    if (err) return send(c, { t: 'error', message: err });
    u.bankroll -= buyIn;
    u.atTables[t.code] = buyIn;
    store.ledger(u, 'buyin', -buyIn, t.code);
    store.save();
    sendMe(u.id);
  },

  stand(c) { const t = tables.get(c.code); if (t && c.userId && !isTourneyTable(t)) t.stand(c.userId); },

  rebuy(c, m) {
    const t = tables.get(c.code), u = store.byId(c.userId);
    if (!t || !u) return;
    if (isTourneyTable(t)) return send(c, { t: 'error', message: 'No rebuys in this tournament' });
    const i = t.seatOf(u.id);
    if (i < 0) return;
    const room = t.buyInMax - t.seats[i].chips;
    const amt = Math.min(Math.floor(Number(m.amount)) || 0, room, u.bankroll);
    if (amt <= 0) return send(c, { t: 'error', message: room <= 0 ? 'You’re already at the maximum buy-in' : 'Your bankroll is empty. Grab free chips in the lobby.' });
    const err = t.rebuy(u.id, amt);
    if (err) return send(c, { t: 'error', message: err });
    u.bankroll -= amt;
    u.atTables[t.code] = t.seats[i].chips;
    store.ledger(u, 'buyin', -amt, t.code);
    store.save();
    sendMe(u.id);
  },

  sitout(c, m) { const t = tables.get(c.code); if (t && c.userId) t.setSittingOut(c.userId, !!m.out); },

  act(c, m) {
    const t = tables.get(c.code);
    if (!t || !c.userId) return;
    const i = t.seatOf(c.userId);
    if (i < 0) return;
    const err = t.act(i, String(m.kind), m.amount);
    if (err) send(c, { t: 'error', message: err });
  },

  chat(c, m) {
    const t = tables.get(c.code), u = store.byId(c.userId);
    if (!t || !u) return;
    const now = Date.now();
    if (now - (c.lastChat || 0) < 700) return;
    c.lastChat = now;
    const text = cleanText(m.text, 200);
    if (!text) return;
    const item = { id: crypto.randomBytes(5).toString('hex'), name: u.name, avatar: u.avatar, userId: u.id, text, ts: now };
    t.chat.push(item);
    if (t.chat.length > 60) t.chat.shift();
    toTable(t, { t: 'chat', items: [item] });
  },

  react(c, m) {
    const t = tables.get(c.code), u = store.byId(c.userId);
    if (!t || !u || !REACTIONS.includes(m.e)) return;
    const now = Date.now();
    if (now - (c.lastReact || 0) < 600) return;
    c.lastReact = now;
    toTable(t, { t: 'react', seat: t.seatOf(u.id), e: m.e, name: u.name, userId: u.id });
  },

  addBot(c, m) {
    const t = tables.get(c.code);
    if (!t || t.hostId !== c.userId) return send(c, { t: 'error', message: 'Only the table host can add bots' });
    const err = t.addBot(Number(m.seat));
    if (err) send(c, { t: 'error', message: err });
  },

  removeBot(c, m) {
    const t = tables.get(c.code);
    if (!t || t.hostId !== c.userId) return;
    const s = t.seats[Number(m.seat)];
    if (s && s.kind === 'bot') t.removeSeat(Number(m.seat));
  },
};

attach(server, ws => {
  const c = { ws, userId: null, code: null };
  clients.add(c);
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string' || !Object.prototype.hasOwnProperty.call(handlers, m.t)) return;
    if (!['hello', 'signup', 'login', 'guest'].includes(m.t) && !c.userId) return send(c, { t: 'needProfile' });
    try { handlers[m.t](c, m); } catch (e) { console.error(e); send(c, { t: 'error', message: 'Something went wrong on the server' }); }
  });
  ws.on('close', () => {
    clients.delete(c);
    if (c.code && c.userId) {
      const still = [...clients].some(o => o.userId === c.userId && o.code === c.code);
      const t = tables.get(c.code);
      if (t && !still) t.setConnected(c.userId, false);
    }
  });
});

// Standard (free) transfers settle in the background.
setInterval(() => {
  for (const u of store.users.values()) {
    const done = shop.settle(u);
    if (!done.length) continue;
    for (const tx of done) store.ledger(u, tx.type + ':standard:settled', tx.type === 'deposit' ? tx.net : 0, tx.id);
    store.save(); sendMe(u.id);
  }
}, 5000).unref();

// Housekeeping: stand up players who vanished, close empty tables.
setInterval(() => {
  const now = Date.now();
  for (const t of tables.values()) {
    if (isTourneyTable(t)) continue;
    t.seats.forEach((s, i) => {
      if (s && s.kind === 'human' && !s.connected && s.disconnectedAt && now - s.disconnectedAt > 5 * 60000) t.removeSeat(i);
    });
    const watching = [...clients].some(c => c.code === t.code);
    if (t.humanCount() === 0 && !watching && now - t.lastActive > 10 * 60000) {
      t.destroy();
      tables.delete(t.code);
      lobbyChanged();
    }
  }
}, 30000).unref();

function shutdown() { try { store.saveNow(); } catch (e) { console.error(e); } process.exit(0); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(PORT, () => console.log(`Pokr is running on http://localhost:${PORT}`));
module.exports = { server, tables, store };
