'use strict';
// Player accounts, bankrolls and stats, saved as JSON on disk.
// Every chip movement in or out of a bankroll is also appended to ledger.jsonl: an audit trail you
// will need anyway the day Pokr handles real money.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const START_BANKROLL = 10000;

class Store {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'users.json');
    this.ledgerFile = path.join(dir, 'ledger.jsonl');
    this.users = new Map();
    this.byTokenMap = new Map();
    if (fs.existsSync(this.file)) {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const u of raw.users || []) this._index(u);
    }
    this.saveTimer = null;
  }

  _index(u) { this.users.set(u.id, u); this.byTokenMap.set(u.tokenHash, u); }
  static hash(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }

  createUser(name, avatar) {
    const token = crypto.randomBytes(24).toString('base64url');
    const u = {
      id: 'u_' + crypto.randomBytes(8).toString('hex'),
      tokenHash: Store.hash(token),
      name, avatar,
      bankroll: START_BANKROLL,
      atTables: {},
      stats: { hands: 0, won: 0, biggestPot: 0, net: 0 },
      createdAt: Date.now(),
    };
    this._index(u);
    this.ledger(u, 'signup', START_BANKROLL, 'starting chips');
    this.save();
    return { user: u, token };
  }

  byToken(token) { return token ? this.byTokenMap.get(Store.hash(token)) || null : null; }
  byId(id) { return this.users.get(id) || null; }

  // Signed amounts from the bankroll's point of view.
  ledger(u, type, amount, ref) {
    const line = JSON.stringify({ ts: new Date().toISOString(), user: u.id, type, amount, bankroll: u.bankroll, ref });
    fs.appendFile(this.ledgerFile, line + '\n', () => {});
  }

  // After a restart, chips that were sitting at tables go back to their owners.
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
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, users: [...this.users.values()] }));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Store, START_BANKROLL };
