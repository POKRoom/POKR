'use strict';
// Accounts, bankrolls and stats, saved as JSON on disk. All money is whole cents.
// Every chip movement in or out of a bankroll is also appended to ledger.jsonl — the audit trail
// real money will need.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const START_BANKROLL = 100000; // $1,000 of play money
const HOUR = 3600000;
const KEEP_HOURS = 24 * 32;    // hourly stat buckets kept for the week/month views

// scrypt password hashing; the plain password is never stored or logged.
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `scrypt$${salt}$${h}`;
}
function checkPassword(pw, stored) {
  const [alg, salt, h] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !h) return false;
  const got = crypto.scryptSync(pw, salt, 64);
  const want = Buffer.from(h, 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
const sha = t => crypto.createHash('sha256').update(String(t)).digest('hex');

class Store {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'users.json');
    this.ledgerFile = path.join(dir, 'ledger.jsonl');
    this.users = new Map();
    this.byEmailMap = new Map();
    this.bySession = new Map();
    this.clubs = new Map(); // club id -> club (see clubs.js); saved with the accounts
    if (fs.existsSync(this.file)) {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const u of raw.users || []) if (u.email || u.guest) this._index(u); // pre-account profiles without either are dropped
      for (const c of raw.clubs || []) this.clubs.set(c.id, c);
    }
    this.saveTimer = null;
    this.cloud = null;
  }

  // Use the cloud database as the source of truth: load everyone from it (or, the first time,
  // upload what's on disk), then copy changes back to it. Retries a few times before giving up.
  async attachCloud(cloud) {
    let users, err;
    for (let i = 0; i < 4 && !users; i++) {
      try { users = await cloud.loadUsers(); } catch (e) { err = e; await new Promise(r => setTimeout(r, 1500 * (i + 1))); }
    }
    if (!users) throw new Error('Couldn’t reach the cloud database: ' + (err && err.message));
    const clubs = cloud.loadClubs ? await cloud.loadClubs() : [];
    this.cloud = cloud;
    this.pushed = new Map(); // 'u:id' / 'c:id' -> the JSON last uploaded
    if (users.length) {
      this.users.clear(); this.byEmailMap.clear(); this.bySession.clear();
      for (const u of users) if (u.email || u.guest) { this._index(u); this.pushed.set('u:' + u.id, JSON.stringify(u)); }
    }
    if (clubs.length) {
      this.clubs.clear();
      for (const c of clubs) { this.clubs.set(c.id, c); this.pushed.set('c:' + c.id, JSON.stringify(c)); }
    }
    this.cloudTimer = null; this.cloudBusy = null;
    await this.pushCloud(); // first run: uploads anyone who was only on disk
    return users.length;
  }
  // Upload the people who changed since the last upload.
  async pushCloud() {
    if (!this.cloud) return;
    if (this.cloudBusy) { this.cloudAgain = true; return this.cloudBusy; }
    const pairs = [], cpairs = [];
    for (const u of this.users.values()) {
      const j = JSON.stringify(u);
      if (this.pushed.get('u:' + u.id) !== j) pairs.push([u.id, j]);
    }
    for (const c of this.clubs.values()) {
      const j = JSON.stringify(c);
      if (this.pushed.get('c:' + c.id) !== j) cpairs.push([c.id, j]);
    }
    if (!pairs.length && !cpairs.length) return;
    this.cloudBusy = Promise.all([this.cloud.saveUsers(pairs), cpairs.length && this.cloud.saveClubs ? this.cloud.saveClubs(cpairs) : null])
      .then(() => { for (const [id, j] of pairs) this.pushed.set('u:' + id, j); for (const [id, j] of cpairs) this.pushed.set('c:' + id, j); })
      .catch(e => console.error('cloud save failed, will retry:', e.message))
      .finally(() => { this.cloudBusy = null; if (this.cloudAgain) { this.cloudAgain = false; this.scheduleCloud(); } });
    return this.cloudBusy;
  }
  // At most one upload every few seconds keeps well inside the free plan's monthly commands.
  scheduleCloud() {
    if (!this.cloud || this.cloudTimer) return;
    this.cloudTimer = setTimeout(() => { this.cloudTimer = null; this.pushCloud(); }, Number(process.env.CLOUD_SAVE_MS) || 15000);
    if (this.cloudTimer.unref) this.cloudTimer.unref();
  }
  // Before the server stops: write everything out.
  async flush() {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    this.saveNow();
    if (this.cloudTimer) { clearTimeout(this.cloudTimer); this.cloudTimer = null; }
    if (this.cloud) { await this.cloudBusy; await this.pushCloud(); }
  }

  _index(u) {
    this.users.set(u.id, u);
    if (u.email) this.byEmailMap.set(u.email, u);
    for (const s of u.sessions || []) this.bySession.set(s, u);
  }

  static normEmail(e) { return String(e || '').trim().toLowerCase(); }
  static validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254; }

  // Returns { user, token } or { error }.
  signup({ email, password, name, avatar }) {
    email = Store.normEmail(email);
    if (!Store.validEmail(email)) return { error: 'Enter a valid email address' };
    if (String(password || '').length < 8) return { error: 'Use a password with at least 8 characters' };
    if (this.byEmailMap.has(email)) return { error: 'There’s already an account with that email. Log in instead.' };
    const u = {
      id: 'u_' + crypto.randomBytes(8).toString('hex'),
      email, pass: hashPassword(String(password)),
      name, avatar,
      bankroll: START_BANKROLL,
      atTables: {},
      stats: { hands: 0, won: 0, biggestPot: 0, net: 0 },
      hourly: {},
      // Identity checks (ID + SSN last 4) happen through a verification provider before real money;
      // only the provider's result is ever kept here, never the documents or numbers.
      verification: { status: 'not_started' },
      sessions: [],
      createdAt: Date.now(),
    };
    this._index(u);
    const token = this.newSession(u);
    this.ledger(u, 'signup', START_BANKROLL, 'starting play money');
    this.save();
    return { user: u, token };
  }

  // Accounts are switched off for now: a name is enough. Real money will require a full account
  // (email, password, ID) before launch, and a guest can be upgraded then.
  guest({ name, avatar }) {
    const u = {
      id: 'u_' + crypto.randomBytes(8).toString('hex'), guest: true, email: null, pass: null,
      name, avatar, bankroll: START_BANKROLL, atTables: {},
      stats: { hands: 0, won: 0, biggestPot: 0, net: 0 }, hourly: {},
      verification: { status: 'not_started' }, sessions: [], createdAt: Date.now(),
    };
    this._index(u);
    const token = this.newSession(u);
    this.ledger(u, 'signup', START_BANKROLL, 'starting play money (guest)');
    this.save();
    return { user: u, token };
  }

  login({ email, password }) {
    const u = this.byEmailMap.get(Store.normEmail(email));
    // same message either way, so the form doesn't reveal which emails have accounts
    if (!u || !checkPassword(String(password || ''), u.pass)) return { error: 'That email and password don’t match' };
    return { user: u, token: this.newSession(u) };
  }

  newSession(u) {
    const token = crypto.randomBytes(24).toString('base64url');
    const h = sha(token);
    u.sessions = [...(u.sessions || []), h].slice(-10);
    this.bySession.clear();
    for (const x of this.users.values()) for (const s of x.sessions || []) this.bySession.set(s, x);
    this.save();
    return token;
  }

  logout(token) {
    const h = sha(token);
    const u = this.bySession.get(h);
    if (!u) return;
    u.sessions = u.sessions.filter(s => s !== h);
    this.bySession.delete(h);
    this.save();
  }

  bySessionToken(token) { return token ? this.bySession.get(sha(token)) || null : null; }
  byId(id) { return this.users.get(id) || null; }
  all() { return [...this.users.values()]; }
  // A club was deleted: drop it here and in the cloud.
  dropClub(id) {
    this.clubs.delete(id);
    if (this.cloud && this.cloud.deleteClub) { this.pushed.delete('c:' + id); this.cloud.deleteClub(id).catch(e => console.error('cloud delete failed:', e.message)); }
    this.save();
  }

  // One finished hand for this player.
  recordHand(u, { delta, won, pot }) {
    u.stats.hands++;
    u.stats.net += delta;
    if (won > 0 && delta > 0) u.stats.won++;
    if (won > u.stats.biggestPot) u.stats.biggestPot = won;
    const hr = Math.floor(Date.now() / HOUR);
    const b = u.hourly[hr] || (u.hourly[hr] = { n: 0, h: 0, w: 0, b: 0 });
    b.n += delta; b.h++; if (won > 0 && delta > 0) b.w++; if (won > b.b) b.b = won;
    for (const k of Object.keys(u.hourly)) if (+k < hr - KEEP_HOURS) delete u.hourly[k];
  }

  // Net, hands, wins and best pot for the last day, week, month and all time.
  periods(u) {
    const hr = Math.floor(Date.now() / HOUR);
    const sum = hours => {
      const r = { net: 0, hands: 0, won: 0, biggestPot: 0 };
      for (const [k, b] of Object.entries(u.hourly || {})) {
        if (+k > hr - hours) { r.net += b.n; r.hands += b.h; r.won += b.w; r.biggestPot = Math.max(r.biggestPot, b.b); }
      }
      return r;
    };
    return { day: sum(24), week: sum(24 * 7), month: sum(24 * 30), all: { ...u.stats } };
  }

  // Signed amounts from the bankroll's point of view.
  ledger(u, type, amount, ref) {
    const line = JSON.stringify({ ts: new Date().toISOString(), user: u.id, type, amount, bankroll: u.bankroll, ref });
    fs.appendFile(this.ledgerFile, line + '\n', () => {});
    if (this.cloud) this.cloud.appendLedger(line).catch(e => console.error('cloud ledger failed:', e.message));
  }

  // After a restart, money that was sitting at tables goes back to its owners.
  refundTables() {
    for (const u of this.users.values()) {
      const total = Object.values(u.atTables || {}).reduce((a, b) => a + b, 0);
      if (total > 0) { u.bankroll += total; this.ledger(u, 'refund', total, 'server restart'); }
      u.atTables = {};
    }
    this.save();
  }

  leaderboard(limit = 25) {
    return [...this.users.values()]
      .filter(u => u.stats.hands > 0)
      .sort((a, b) => b.stats.net - a.stats.net)
      .slice(0, limit)
      .map(u => ({
        id: u.id, name: u.name, avatar: u.avatar, net: u.stats.net, hands: u.stats.hands,
        winRate: u.stats.hands ? u.stats.won / u.stats.hands : 0, biggestPot: u.stats.biggestPot,
      }));
  }

  save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.saveNow(); }, 400);
  }
  saveNow() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ version: 3, users: [...this.users.values()], clubs: [...this.clubs.values()] }));
    fs.renameSync(tmp, this.file);
    this.scheduleCloud();
  }
}

module.exports = { Store, START_BANKROLL };
