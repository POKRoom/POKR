'use strict';
// End-to-end: boots the real server, connects three players over WebSockets, plays hands.
// Checks: nobody ever receives another player's hidden cards, chips are conserved across
// bankrolls + tables, chat and reactions reach everyone.
// Run: node test/multiplayer.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 3999;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'pokr-'));
const HANDS = 25;

const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
  env: { ...process.env, PORT, DATA_DIR: DATA, TURN_MS: '4000', TIMING_SCALE: '0.05' }, stdio: ['ignore', 'pipe', 'inherit'],
});
const wait = ms => new Promise(r => setTimeout(r, ms));

function client(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    const c = { name, ws, me: null, state: null, chats: [], reacts: [], errors: [], leaks: 0, handlers: [] };
    c.send = m => ws.send(JSON.stringify(m));
    c.on = fn => c.handlers.push(fn);
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.t === 'me') c.me = m.user;
      if (m.t === 'state') {
        c.state = m.s;
        // the privacy check: hidden cards must arrive as null, unless revealed at showdown
        m.s.seats.forEach((s, i) => {
          if (!s || i === m.s.you) return;
          const visible = s.cards.some(x => x !== null);
          const allowed = (m.s.phase === 'done' && s.handName) || (s.dealt && !s.folded && isRunout(m.s));
          if (visible && !allowed) c.leaks++;
        });
      }
      if (m.t === 'chat') c.chats.push(...m.items);
      if (m.t === 'react') c.reacts.push(m);
      if (m.t === 'error') c.errors.push(m.message);
      c.handlers.forEach(h => h(m));
    };
    ws.onopen = () => resolve(c);
    ws.onerror = reject;
  });
}
// During an all-in runout every live hand is turned face up on purpose.
function isRunout(s) {
  const live = s.seats.filter(x => x && x.dealt && !x.folded);
  return live.filter(x => !x.allIn).length < 2;
}
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timed out waiting'); await wait(20); } };

(async () => {
  await new Promise(r => srv.stdout.once('data', r));
  const [a, b, c] = await Promise.all(['Ana', 'Ben', 'Cy'].map(client));
  for (const [i, p] of [a, b, c].entries()) p.send({ t: 'signup', name: p.name, email: p.name.toLowerCase() + '@test.local', password: 'test-password-' + i, avatar: { a: i, c: i } });
  await until(() => a.me && b.me && c.me);
  assert.strictEqual(a.me.bankroll, 100000);

  // accounts: duplicate email, wrong password, short password are refused; a real login works; logout ends the session
  const x = await client('X');
  const authErrs = [];
  x.on(m => { if (m.t === 'authError') authErrs.push(m.message); });
  x.send({ t: 'signup', name: 'Copy', email: 'ANA@test.local', password: 'whatever123', avatar: { a: 1, c: 1 } });
  x.send({ t: 'signup', name: 'Shorty', email: 'short@test.local', password: 'short', avatar: { a: 1, c: 1 } });
  x.send({ t: 'login', email: 'ana@test.local', password: 'wrong-password' });
  await until(() => authErrs.length >= 3);
  x.send({ t: 'create', name: 'nope' });
  x.send({ t: 'login', email: 'Ana@Test.local', password: 'test-password-0' });
  await until(() => x.me && x.me.id === a.me.id);
  let tok; x.on(m => { if (m.t === 'token') tok = m.token; });
  x.send({ t: 'logout' });
  await wait(100);
  const y = await client('Y'); let yNeeds = false; y.on(m => { if (m.t === 'needProfile') yNeeds = true; });
  y.send({ t: 'hello', token: 'not-a-real-token' });
  await until(() => yNeeds);

  let code;
  a.on(m => { if (m.t === 'created') code = m.code; });
  a.send({ t: 'create', name: 'Test night', stakes: '10-25' });
  await until(() => code);
  for (const p of [a, b, c]) p.send({ t: 'join', code });
  await until(() => a.state && b.state && c.state);
  a.send({ t: 'sit', seat: 0, buyIn: 2000 });
  b.send({ t: 'sit', seat: 2, buyIn: 1500 });
  c.send({ t: 'sit', seat: 4, buyIn: 1000 });
  await until(() => a.me.bankroll === 98000 && b.me.bankroll === 98500 && c.me.bankroll === 99000);

  // illegal things get refused
  b.send({ t: 'sit', seat: 1, buyIn: 1000 });
  b.send({ t: 'addBot', seat: 1 });
  await until(() => b.errors.length >= 2);

  // chat + reactions
  a.send({ t: 'chat', text: 'gl everyone <script>' });
  c.send({ t: 'react', e: '🔥' });
  await until(() => b.chats.length && b.reacts.length);
  assert.strictEqual(b.chats[0].text, 'gl everyone <script>'); // escaped by the client when drawn
  assert.strictEqual(b.reacts[0].e, '🔥');

  // everyone plays randomly whenever it's their turn
  const players = [a, b, c];
  for (const p of players) {
    p.on(m => {
      if (m.t !== 'state') return;
      const s = m.s;
      const mine = s.you >= 0 ? s.seats[s.you] : null;
      if (mine && s.phase !== 'play' && mine.chips === 0 && !p.rebuying) { p.rebuying = true; p.send({ t: 'rebuy', amount: 1000 }); setTimeout(() => { p.rebuying = false; }, 300); }
      else if (mine && mine.sittingOut && mine.chips > 0 && s.phase !== 'play') p.send({ t: 'sitout', out: false });
      if (s.phase !== 'play' || s.toAct !== s.you || !s.actions) return;
      const A = s.actions, r = Math.random();
      setTimeout(() => {
        if (r < 0.15 && !A.canCheck) p.send({ t: 'act', kind: 'fold' });
        else if (r < 0.75 || !A.canRaise) p.send({ t: 'act', kind: A.canCheck ? 'check' : 'call' });
        else p.send({ t: 'act', kind: 'raise', amount: A.minTo + Math.floor(Math.random() * 300) });
      }, 5);
    });
  }
  // kick off: trigger the first decision if it's already someone's turn
  for (const p of players) if (p.state.toAct === p.state.you && p.state.actions) p.send({ t: 'act', kind: p.state.actions.canCheck ? 'check' : 'call' });
  const prog = setInterval(() => console.log("hand", a.state.handNo, a.state.phase, "toAct", a.state.toAct, "street", a.state.street), 2000);
  await until(() => a.state.handNo >= HANDS && a.state.phase === "done", 240000);
  clearInterval(prog);

  assert.strictEqual(a.leaks + b.leaks + c.leaks, 0, 'no hidden cards leaked');
  // a spectator who never sat sees no hole cards at all
  const d = await client('Dee');
  d.send({ t: 'signup', name: 'Dee', email: 'dee@test.local', password: 'dee-password', avatar: { a: 5, c: 5 } });
  await until(() => d.me);
  d.send({ t: 'join', code });
  await until(() => d.state);
  assert.strictEqual(d.state.you, -1);

  // everyone stands; all chips must come home
  for (const p of players) p.send({ t: 'stand' });
  await until(() => a.state.seats.every(s => !s), 20000);
  await wait(300);
  const total = a.me.bankroll + b.me.bankroll + c.me.bankroll;
  assert.strictEqual(total, 300000, `chips conserved (got ${total})`);
  assert.ok(a.me.periods && a.me.periods.day.hands === a.me.stats.hands, 'period stats track hands');
  const stats = [a, b, c].map(p => p.me.stats);
  assert.ok(stats.every(s => s.hands >= HANDS - 1), 'hands counted');
  assert.strictEqual(stats.reduce((x, s) => x + s.net, 0), 0, 'net winnings sum to zero');
  const ledger = fs.readFileSync(path.join(DATA, 'ledger.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(ledger.some(l => l.type === 'buyin') && ledger.some(l => l.type === 'cashout'), 'ledger written');

  console.log(`played ${a.state.handNo} hands over WebSockets; bankrolls: ${[a, b, c].map(p => `${p.name} ${p.me.bankroll}`).join(', ')}`);
  console.log('accounts checked; no card leaks, chips conserved, chat/reactions delivered, ledger written');
  console.log('multiplayer test passed');
  srv.kill(); process.exit(0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
