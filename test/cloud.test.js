'use strict';
// Cloud save, the way Render's free plan treats us: sign up, change things, then restart the
// server on a brand-new empty disk. Everyone must still be there, loaded from the database.
// A small stand-in for Upstash's REST API runs inside this test, so no real account is needed.
// Run: node test/cloud.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const PORT = 3996, FAKE = 3995, TOKEN = 'test-token';
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---- a tiny Upstash: HGETALL, HSET, RPUSH over POST /pipeline ----
const db = { hashes: {}, lists: {}, calls: 0, up: true };
const fake = http.createServer((req, res) => {
  let body = '';
  req.on('data', d => (body += d));
  req.on('end', () => {
    if (!db.up) { res.writeHead(503); return res.end('down'); }
    if (req.headers.authorization !== 'Bearer ' + TOKEN) { res.writeHead(401); return res.end('{"error":"Unauthorized"}'); }
    const out = JSON.parse(body).map(([cmd, key, ...args]) => {
      db.calls++;
      if (cmd === 'HGETALL') return { result: Object.entries(db.hashes[key] || {}).flat() };
      if (cmd === 'HSET') { const h = (db.hashes[key] = db.hashes[key] || {}); for (let i = 0; i < args.length; i += 2) h[args[i]] = args[i + 1]; return { result: args.length / 2 }; }
      if (cmd === 'RPUSH') { (db.lists[key] = db.lists[key] || []).push(...args); return { result: db.lists[key].length }; }
      return { error: 'unknown command ' + cmd };
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out));
  });
});

let srv;
function boot(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pokr-cloud-')); // a fresh, empty disk every time
  srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
    env: { ...process.env, PORT, DATA_DIR: dir, UPSTASH_REDIS_REST_URL: `http://localhost:${FAKE}`, UPSTASH_REDIS_REST_TOKEN: TOKEN, CLOUD_SAVE_MS: '200', ...extra },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  const done = new Promise(res => {
    srv.stdout.on('data', d => { log += d; if (/running on/.test(log)) res(log); });
    srv.stderr.on('data', d => { log += d; });
    srv.on('exit', code => res(log + `\n[exited ${code}]`));
  });
  return done;
}
const stop = sig => new Promise(r => { srv.once('exit', r); srv.kill(sig); });
function client() {
  return new Promise(resolve => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    const c = { me: null, errors: [] };
    c.send = m => ws.send(JSON.stringify(m));
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.t === 'me') c.me = m.user; if (m.t === 'token') c.token = m.token; if (/error/i.test(m.t)) c.errors.push(m.message); };
    ws.onopen = () => resolve(c);
  });
}

(async () => {
  await new Promise(r => fake.listen(FAKE, r));
  process.on('exit', () => { try { srv.kill('SIGKILL'); } catch { /* gone */ } });

  let log = await boot();
  assert.match(log, /Cloud save on .*loaded 0 accounts/);
  const amy = await client();
  amy.send({ t: 'signup', name: 'Amy', email: 'amy@example.com', password: 'password123' });
  await wait(300);
  assert.ok(amy.me, 'signed up');
  amy.send({ t: 'profile', name: 'Amy B', avatar: { a: 0, c: 0, ch: { lk: 6, sk: 1, hr: 2, jk: 3, sh: 0, bd: 0 } } });
  await wait(700); // let the cloud save run
  assert.ok(db.hashes['pokr:users'] && Object.keys(db.hashes['pokr:users']).length === 1, 'uploaded to the database');
  assert.ok((db.lists['pokr:ledger'] || []).some(l => /signup/.test(l)), 'ledger line uploaded');

  // a normal restart (Render sends SIGTERM) onto a wiped disk
  await stop('SIGTERM');
  log = await boot();
  assert.match(log, /loaded 1 account/);
  const back = await client();
  back.send({ t: 'hello', token: amy.token });
  await wait(300);
  assert.ok(back.me, 'still logged in on this device after the disk was wiped');
  assert.strictEqual(back.me.name, 'Amy B');
  assert.strictEqual(back.me.avatar.ch.lk, 6);
  const relog = await client();
  relog.send({ t: 'login', email: 'amy@example.com', password: 'password123' });
  await wait(300);
  assert.strictEqual(relog.me && relog.me.name, 'Amy B', 'logs in with email and password after the wipe');

  // a second person, then a crash with no warning (SIGKILL) after the save interval
  const ben = await client();
  ben.send({ t: 'signup', name: 'Ben', email: 'ben@example.com', password: 'password123' });
  await wait(700);
  await stop('SIGKILL');
  log = await boot();
  assert.match(log, /loaded 2 accounts/);

  // if the database can't be reached, the server refuses to start rather than run empty
  await stop('SIGTERM');
  db.up = false;
  log = await boot();
  assert.match(log, /Couldn’t reach the cloud database/);
  assert.match(log, /exited 1/);
  db.up = true;

  // a wrong token is reported clearly
  log = await boot({ UPSTASH_REDIS_REST_TOKEN: 'nope' });
  assert.match(log, /check UPSTASH_REDIS_REST_TOKEN/);

  console.log(`cloud test passed: accounts survive a wiped disk and a crash (${db.calls} database commands used)`);
  fake.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
