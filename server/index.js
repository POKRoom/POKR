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
  return { id: u.id, email: u.email, name: u.name, avatar: u.avatar, bankroll: u.bankroll, atTables, stats: u.stats, periods: store.periods(u), verification: u.verification, canRefill: u.bankroll + atTables < REFILL_BELOW, ...shop.publicEconomy(u) };
}
function sendMe(userId) {
  const u = store.byId(userId);
  if (!u) return;
  for (const c of clients) if (c.userId === userId) send(c, { t: 'me', user: meOf(u) });
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

// ---------- messages ----------
const handlers = {
  hello(c, m) {
    const u = store.bySessionToken(m.token);
    if (!u) return send(c, { t: 'needProfile' });
    c.userId = u.id; c.token = m.token;
    send(c, { t: 'me', user: meOf(u) });
    send(c, { t: 'catalog', catalog: shop.catalog() });
  },

  signup(c, m) {
    if (!allowAuthAttempt(c)) return send(c, { t: 'authError', message: 'Too many tries. Wait a minute and try again.' });
    const name = cleanText(m.name, 16);
    if (name.length < 2) return send(c, { t: 'authError', message: 'Pick a name with at least 2 characters' });
    if (!validAvatar(m.avatar) || m.avatar.a >= shop.FREE_AVATARS) return send(c, { t: 'authError', message: 'Pick an avatar' });
    const r = store.signup({ email: m.email, password: m.password, name, avatar: { a: m.avatar.a, c: m.avatar.c } });
    if (r.error) return send(c, { t: 'authError', message: r.error });
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
    if (!validAvatar(m.avatar)) return send(c, { t: 'error', message: 'Pick an avatar' });
    const avatar = { a: m.avatar.a, c: m.avatar.c };
    const u = c.userId && store.byId(c.userId);
    if (u && !shop.canUseAvatar(u, avatar.a)) return send(c, { t: 'error', message: 'That avatar comes with Pokr Club or the shop' });
    if (u) {
      u.name = name; u.avatar = avatar;
      store.save();
      for (const t of tables.values()) {
        const i = t.seatOf(u.id);
        if (i >= 0) { t.seats[i].name = name; t.seats[i].avatar = avatar; broadcastTable(t); }
      }
      sendMe(u.id);
    }
  },

  lobby(c) { send(c, lobbyPayload()); },

  // ---- Pokr Club, avatar shop, themes (test mode: nothing is charged) ----
  club(c, m) {
    const u = store.byId(c.userId);
    const r = shop.club(u, m.action);
    if (r.error) return send(c, { t: 'error', message: r.error });
    if (r.resetAvatar) for (const t of tables.values()) { const i = t.seatOf(u.id); if (i >= 0) { t.seats[i].avatar = u.avatar; broadcastTable(t); } }
    store.save(); sendMe(u.id);
    send(c, { t: 'notice', message: m.action === 'join' ? 'Welcome to Pokr Club' : 'Membership canceled' });
  },
  buyAvatar(c, m) {
    const u = store.byId(c.userId);
    const r = shop.buyAvatar(u, Number(m.a));
    if (r.error) return send(c, { t: 'error', message: r.error });
    store.save(); sendMe(u.id);
    send(c, { t: 'notice', message: 'Avatar unlocked' });
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
    const t = new Table({ code, name, sb: stakes[0], bb: stakes[1], hostId: u.id, isPrivate: !!m.isPrivate }, hooks);
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
    if (t && c.userId && !m.keepSeat) t.stand(c.userId);
    c.code = null;
    if (!m.keepSeat) send(c, lobbyPayload());
  },

  sit(c, m) {
    const t = tables.get(c.code), u = store.byId(c.userId);
    if (!t || !u) return;
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

  stand(c) { const t = tables.get(c.code); if (t && c.userId) t.stand(c.userId); },

  rebuy(c, m) {
    const t = tables.get(c.code), u = store.byId(c.userId);
    if (!t || !u) return;
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
    if (!['hello', 'signup', 'login'].includes(m.t) && !c.userId) return send(c, { t: 'needProfile' });
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
