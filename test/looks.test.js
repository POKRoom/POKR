'use strict';
// Characters and admin tools against the real server:
// accounts save a character, Pro Pass parts and specials are enforced, only admins can give
// specials or change someone else's look, and everything is still there after a restart.
// Run: node test/looks.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const looks = require('../server/looks');

const PORT = 3997;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'pokr-looks-'));
const wait = ms => new Promise(r => setTimeout(r, ms));

function boot() {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
    env: { ...process.env, PORT, DATA_DIR: DATA, ADMIN_EMAILS: 'boss@example.com' }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  return new Promise(res => srv.stdout.on('data', d => { if (/listening|running|http/i.test(String(d))) res(srv); }));
}
function client() {
  return new Promise(resolve => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    const c = { ws, me: null, errors: [], notices: [], users: null };
    c.send = m => ws.send(JSON.stringify(m));
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.t === 'me') c.me = m.user;
      if (m.t === 'token') c.token = m.token;
      if (m.t === 'error' || m.t === 'authError') c.errors.push(m.message);
      if (m.t === 'notice') c.notices.push(m.message);
      if (m.t === 'adminUsers') c.users = m.list;
    };
    ws.onopen = () => resolve(c);
  });
}

(async () => {
  // the rule book on its own
  assert.deepStrictEqual(looks.cleanLook({ lk: 3, sk: 1, hr: 2, jk: 4, sh: 1, bd: 0 }), { lk: 3, sk: 1, hr: 2, jk: 4, sh: 1, bd: 0, sp: '' });
  assert.strictEqual(looks.cleanLook({ lk: 99, sk: 1, hr: 2, jk: 4 }), null);
  assert.strictEqual(looks.cleanLook({ lk: 1, sk: 1, hr: 2, jk: 4, sp: 'nope' }), null);
  assert.ok(looks.wearError({}, { lk: 8, jk: 0 }, false), 'cowboy hat needs Pro Pass');
  assert.ok(looks.wearError({}, { lk: 0, jk: 0, sp: 'crown' }, true), 'specials must be given');
  assert.strictEqual(looks.wearError({ specials: ['crown'] }, { lk: 0, jk: 0, sp: 'crown' }, false), '');

  let srv = await boot();
  process.on('exit', () => { try { srv.kill(); } catch { /* already gone */ } });
  const boss = await client(), amy = await client();
  boss.send({ t: 'signup', name: 'Boss', email: 'boss@example.com', password: 'password123' });
  amy.send({ t: 'signup', name: 'Amy', email: 'amy@example.com', password: 'password123', avatar: { ch: { lk: 8, sk: 0, hr: 0, jk: 0 } } });
  await wait(400);
  assert.ok(boss.me.admin, 'boss is an admin');
  assert.ok(!amy.me.admin, 'amy is not');
  assert.ok(amy.me.avatar.ch, 'new accounts get a character');
  assert.notStrictEqual(amy.me.avatar.ch.lk, 8, 'a Pro Pass look can’t sneak in at sign-up');

  // Amy picks her own free look; she can't wear Pro Pass parts or a special she wasn't given
  amy.send({ t: 'profile', name: 'Amy', avatar: { a: 0, c: 0, ch: { lk: 5, sk: 2, hr: 3, jk: 2, sh: 1, bd: 0 } } });
  await wait(200);
  assert.strictEqual(amy.me.avatar.ch.lk, 5);
  amy.send({ t: 'profile', name: 'Amy', avatar: { a: 0, c: 0, ch: { lk: 9, sk: 2, hr: 3, jk: 2 } } });
  amy.send({ t: 'profile', name: 'Amy', avatar: { a: 0, c: 0, ch: { lk: 5, sk: 2, hr: 3, jk: 2, sp: 'crown' } } });
  await wait(200);
  assert.strictEqual(amy.errors.length, 2, 'both refused: ' + amy.errors.join(' / '));
  assert.strictEqual(amy.me.avatar.ch.lk, 5);

  // Amy isn't an admin
  amy.send({ t: 'adminUsers', q: '' });
  amy.send({ t: 'adminGrant', userId: amy.me.id, sp: 'crown', on: true });
  await wait(200);
  assert.strictEqual(amy.users, null);
  assert.deepStrictEqual(amy.me.specials, []);

  // the admin finds Amy, gives her the Crown, and she can wear it
  boss.send({ t: 'adminUsers', q: 'amy' });
  await wait(200);
  assert.strictEqual(boss.users.length, 1);
  boss.send({ t: 'adminGrant', userId: amy.me.id, sp: 'crown', on: true });
  await wait(200);
  assert.deepStrictEqual(amy.me.specials, ['crown']);
  assert.ok(amy.notices.some(n => /gave you The Crown/.test(n)));
  amy.send({ t: 'profile', name: 'Amy', avatar: { a: 0, c: 0, ch: { lk: 5, sk: 2, hr: 3, jk: 2, sp: 'crown' } } });
  await wait(200);
  assert.strictEqual(amy.me.avatar.ch.sp, 'crown');
  // the admin restyles her completely (any part, including Pro Pass ones) and puts the Shark on her
  boss.send({ t: 'adminLook', userId: amy.me.id, ch: { lk: 8, sk: 4, hr: 1, jk: 8, sh: 0, bd: 1, sp: 'shark' } });
  await wait(200);
  assert.strictEqual(amy.me.avatar.ch.sp, 'shark');
  assert.deepStrictEqual([...amy.me.specials].sort(), ['crown', 'shark']);
  // taking one back takes it off her
  boss.send({ t: 'adminGrant', userId: amy.me.id, sp: 'shark', on: false });
  await wait(200);
  assert.strictEqual(amy.me.avatar.ch.sp, '');
  assert.deepStrictEqual(amy.me.specials, ['crown']);

  // restart the server: the account, the character and the specials are all still there
  const token = amy.token;
  srv.kill(); await wait(500);
  srv = await boot();
  const again = await client();
  again.send({ t: 'hello', token });
  await wait(300);
  assert.ok(again.me, 'still logged in after a restart');
  assert.strictEqual(again.me.avatar.ch.lk, 8);
  assert.deepStrictEqual(again.me.specials, ['crown']);
  const relog = await client();
  relog.send({ t: 'login', email: 'amy@example.com', password: 'password123' });
  await wait(300);
  assert.strictEqual(relog.me && relog.me.name, 'Amy', 'logs back in with email and password');

  srv.kill();
  console.log('looks test passed: characters save, Pro Pass and specials enforced, admin tools work, survives a restart');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
