'use strict';
// Pokr server: serves the web app and runs every table over WebSockets.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { attach } = require('./ws');
const { Table } = require('./engine');
const { Store, START_BANKROLL } = require('./store');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, '..', 'public');
const store = new Store(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
store.refundTables();

const STAKES = { micro: [5, 10], low: [10, 20], mid: [25, 50], high: [50, 100] };
const REACTIONS = ['👍', '😂', '🔥', '😱', '💀', '👏', '🤡', '💰'];
const AVATAR_COUNT = 16, COLOR_COUNT = 8;
const REFILL_BELOW = 1000;

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
  return { id: u.id, name: u.name, avatar: u.avatar, bankroll: u.bankroll, atTables, stats: u.stats, canRefill: u.bankroll + atTables < REFILL_BELOW };
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
const validAvatar = a => a && Number.isInteger(a.a) && a.a >= 0 && a.a < AVATAR_COUNT && Number.isInteger(a.c) && a.c >= 0 && a.c < COLOR_COUNT;

const hooks = {
  onChange: t => { broadcastTable(t); lobbyChanged(); },
  onHandEnd: (t, summary) => {
    for (const r of summary) {
      if (r.kind !== 'human') continue;
      const u = store.byId(r.userId);
      if (!u) continue;
      u.stats.hands++;
      u.stats.net += r.delta;
      if (r.won > 0 && r.delta > 0) u.stats.won++;
      if (r.won > u.stats.biggestPot) u.stats.biggestPot = r.won;
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
    const u = store.byToken(m.token);
    if (!u) return send(c, { t: 'needProfile' });
    c.userId = u.id;
    send(c, { t: 'me', user: meOf(u) });
  },

  profile(c, m) {
    const name = cleanText(m.name, 16);
    if (name.length < 2) return send(c, { t: 'error', message: 'Pick a name with at least 2 characters' });
    if (!validAvatar(m.avatar)) return send(c, { t: 'error', message: 'Pick an avatar' });
    const avatar = { a: m.avatar.a, c: m.avatar.c };
    let u = c.userId && store.byId(c.userId);
    if (u) {
      u.name = name; u.avatar = avatar;
      store.save();
      for (const t of tables.values()) {
        const i = t.seatOf(u.id);
        if (i >= 0) { t.seats[i].name = name; t.seats[i].avatar = avatar; broadcastTable(t); }
      }
      sendMe(u.id);
    } else {
      const made = store.createUser(name, avatar);
      c.userId = made.user.id;
      send(c, { t: 'token', token: made.token });
      send(c, { t: 'me', user: meOf(made.user) });
    }
  },

  lobby(c) { send(c, lobbyPayload()); },

  refill(c) {
    const u = store.byId(c.userId);
    if (!u) return;
    if (!meOf(u).canRefill) return send(c, { t: 'error', message: `Free chips are for players under ${REFILL_BELOW}` });
    const add = START_BANKROLL - u.bankroll;
    u.bankroll = START_BANKROLL;
    store.ledger(u, 'refill', add, 'free chips');
    store.save();
    sendMe(u.id);
  },

  create(c, m) {
    const u = store.byId(c.userId);
    if (!u) return;
    const stakes = STAKES[m.stakes] || STAKES.low;
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
    if (!(buyIn >= t.buyInMin && buyIn <= t.buyInMax)) return send(c, { t: 'error', message: `Buy in between ${t.buyInMin} and ${t.buyInMax}` });
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
    if (m.t !== 'hello' && m.t !== 'profile' && !c.userId) return send(c, { t: 'needProfile' });
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
