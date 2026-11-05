'use strict';
// Cloud save: keeps accounts in an Upstash Redis database so they survive restarts on hosts whose
// disk is wiped (Render's free plan). Talks to Upstash's REST API with fetch, so there's still
// nothing to install. Turned on by two environment variables from the Upstash console:
//   UPSTASH_REDIS_REST_URL    https://<name>.upstash.io
//   UPSTASH_REDIS_REST_TOKEN  the REST token (keep it secret; it's a password)
//
// Layout: one hash, "pokr:users", field = user id, value = that user as JSON;
// and one list, "pokr:ledger", of ledger lines.

function fromEnv(env = process.env) {
  const url = String(env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
  const token = String(env.UPSTASH_REDIS_REST_TOKEN || '');
  if (!url || !token) return null;
  return client(url, token);
}

function client(url, token) {
  // Runs several Redis commands in one request; returns their results in order.
  async function pipeline(cmds) {
    const r = await fetch(url + '/pipeline', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmds),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`Upstash answered ${r.status}${r.status === 401 ? ' (check UPSTASH_REDIS_REST_TOKEN)' : ''}`);
    const out = await r.json();
    return out.map(x => { if (x.error) throw new Error('Upstash: ' + x.error); return x.result; });
  }
  return {
    where: url.replace(/^https?:\/\//, ''),
    async loadUsers() {
      const [flat] = await pipeline([['HGETALL', 'pokr:users']]);
      const users = [];
      for (let i = 0; i + 1 < (flat || []).length; i += 2) {
        try { users.push(JSON.parse(flat[i + 1])); } catch { console.error('cloud: skipped an unreadable user', flat[i]); }
      }
      return users;
    },
    async saveUsers(pairs) { // [[id, json], ...]
      if (!pairs.length) return;
      await pipeline([['HSET', 'pokr:users', ...pairs.flat()]]);
    },
    async appendLedger(line) { await pipeline([['RPUSH', 'pokr:ledger', line]]); },
  };
}

module.exports = { fromEnv, client };
