'use strict';
// Club rules: who can start one, the three ways in, roles and what each may do, the limits,
// bans, chat, and a monthly season that crowns a champion. Run: node test/clubs.test.js
const assert = require('assert');
const { createClubs, MAX_MEMBERS, MAX_CLUBS } = require('../server/clubs');

let t = Date.parse('2026-11-05T12:00:00Z'), n = 0;
const users = new Map();
const mk = (id, pro) => users.set(id, { id, name: id[0].toUpperCase() + id.slice(1), avatar: { a: 0, c: 0 }, pro });
['owner', 'amy', 'ben', 'cal'].forEach((id, i) => mk(id, i === 0));
const notes = [];
const store = { clubs: new Map(), byId: id => users.get(id) || null, dropClub(id) { this.clubs.delete(id); } };
const C = createClubs({ store, save() {}, changed() {}, notify: (u, m) => notes.push([u, m.message]), clubActive: u => !!u.pro, makeId: () => 'K' + (++n).toString().padStart(5, '0'), now: () => t });

// only Pro Pass members start clubs
assert.match(C.create('amy', { name: 'Amy Club' }).err, /Pro Pass/);
assert.match(C.create('owner', { name: 'ab' }).err, /name/);
const { id } = C.create('owner', { name: 'Pali Card Room', glyph: 3, color: 2, join: 'open', room: 'teal' });
assert.ok(id);
assert.match(C.create('owner', { name: 'pali card room' }).err, /already has that name/);
assert.strictEqual(C.view(id, 'owner').role, 'owner');

// open: walk in with the code
assert.deepStrictEqual(C.join('amy', id), { joined: true });
assert.match(C.join('amy', id).err, /already/);
// members can't run the club
assert.match(C.announce('amy', id, 'hi'), /owner and managers/);
assert.match(C.remove('amy', id, 'owner'), /owner and managers/);
assert.match(C.setRole('amy', id, 'owner', 'member'), /Only the owner/);

// approval: request, then a manager says yes
assert.strictEqual(C.update('owner', id, { join: 'approval' }), null);
assert.deepStrictEqual(C.join('ben', id), { pending: true });
assert.ok(notes.some(([u, m]) => u === 'owner' && /Ben asked to join/.test(m)), 'staff are told about the request');
assert.strictEqual(C.view(id, 'owner').requests.length, 1);
assert.strictEqual(C.view(id, 'ben').member, false);
assert.strictEqual(C.view(id, 'ben').requested, true);
assert.match(C.answer('amy', id, 'ben', true), /owner and managers/);
assert.strictEqual(C.setRole('owner', id, 'amy', 'manager'), null);
assert.strictEqual(C.answer('amy', id, 'ben', true), null, 'a manager can approve');
assert.ok(C.isMember(id, 'ben'));

// invite-only: the code alone isn't enough; a one-time link is
assert.strictEqual(C.update('owner', id, { join: 'invite' }), null);
assert.match(C.join('cal', id).err, /invite-only/);
const { token } = C.invite('amy', id);
assert.deepStrictEqual(C.join('cal', id, token), { joined: true });
assert.ok(C.join('cal2', id, token).err, 'an invite works once');

// managers can't remove managers; the owner can; bans stick
assert.strictEqual(C.setRole('owner', id, 'ben', 'manager'), null);
assert.match(C.remove('amy', id, 'ben'), /Only the owner/);
assert.strictEqual(C.remove('owner', id, 'cal', true), null);
assert.strictEqual(C.update('owner', id, { join: 'open' }), null);
assert.match(C.join('cal', id).err, /can’t join/);
assert.strictEqual(C.unban('amy', id, 'cal'), null);
assert.deepStrictEqual(C.join('cal', id), { joined: true });

// the owner can't just leave; hand it over first
assert.match(C.leave('owner', id), /Make someone else the owner/);
assert.strictEqual(C.setRole('owner', id, 'amy', 'owner'), null);
assert.strictEqual(C.view(id, 'amy').role, 'owner');
assert.strictEqual(C.view(id, 'owner').role, 'manager');
assert.strictEqual(C.leave('owner', id), null);
assert.ok(!C.isMember(id, 'owner'));

// chat and announcements
assert.strictEqual(C.chat('ben', id, 'gg everyone'), null);
assert.match(C.chat('owner', id, 'hello?'), /Join the club/);
assert.strictEqual(C.announce('amy', id, 'Tuesday 8pm Omaha, $20'), null);
const v = C.view(id, 'ben');
assert.strictEqual(v.chat[v.chat.length - 1].text, 'gg everyone');
assert.strictEqual(v.announcement.text, 'Tuesday 8pm Omaha, $20');
assert.strictEqual(v.requests.length, 0, 'members don’t see join requests');

// results, the leaderboard and a season ending
C.record(id, 'ben', 2500); C.record(id, 'ben', -500); C.record(id, 'cal', 4000); C.record(id, 'amy', -6000);
C.record(id, 'owner', 99999); // not a member any more: ignored
let p = Object.fromEntries(C.view(id, 'amy').people.map(x => [x.name, x]));
assert.strictEqual(p.Ben.season.net, 2000); assert.strictEqual(p.Ben.season.games, 2); assert.strictEqual(p.Ben.week, 2000);
assert.strictEqual(p.Cal.all.net, 4000);
t = Date.parse('2026-12-01T09:00:00Z'); // a new month
C.tick();
const after = C.view(id, 'amy');
assert.strictEqual(after.season.n, 2);
assert.strictEqual(after.champions[0].name, 'Cal', 'the season’s top earner is champion');
assert.strictEqual(after.champions[0].ym, '2026-11');
p = Object.fromEntries(after.people.map(x => [x.name, x]));
assert.strictEqual(p.Cal.season.net, 0, 'season totals reset'); assert.strictEqual(p.Cal.all.net, 4000, 'all-time totals stay');
assert.ok(notes.some(([, m]) => /Cal won Pali Card Room’s season 1/.test(m)));

// limits: 5 clubs per player, 100 members per club
for (let i = 0; i < MAX_CLUBS + 1; i++) mk('pro' + i, true);
const ids = [];
for (let i = 0; i < MAX_CLUBS; i++) ids.push(C.create('pro0', { name: 'Club number ' + i, join: 'open' }).id);
assert.ok(C.create('pro0', { name: 'One too many' }).err, 'a sixth club is refused');
for (let i = 1; i < MAX_MEMBERS; i++) { mk('m' + i); assert.deepStrictEqual(C.join('m' + i, ids[0]), { joined: true }); }
mk('late');
assert.match(C.join('late', ids[0]).err, /full/);
for (const cid of ids.slice(1)) C.join('late', cid);
mk('x'); C.join('late', id);
assert.match(C.join('late', C.create('pro1', { name: 'Sixth for late', join: 'open' }).id).err, /up to 5 clubs/);

// deleting
assert.match(C.deleteClub('ben', id), /Only the owner/);
assert.strictEqual(C.deleteClub('amy', id), null);
assert.strictEqual(C.view(id, 'amy'), null);

// club chat: joins are posted, unread counts per member, reading clears them
{
  const opened = [];
  const st2 = { clubs: new Map(), byId: id => users.get(id) || null, dropClub(id) { this.clubs.delete(id); } };
  const D = createClubs({ store: st2, save() {}, changed() {}, notify() {}, clubActive: u => !!u.pro, makeId: () => 'N' + (++n).toString().padStart(5, '0'), now: () => t,
    openNight: (club, night) => { opened.push([night.kind, night.next]); return { kind: night.kind, code: 'GAME' + opened.length }; } });
  t = Date.parse('2026-11-05T20:00:00Z'); // Thursday, noon in Los Angeles
  const cid = D.create('owner', { name: 'Night Owls', join: 'open' }).id;
  t += 1000; D.join('amy', cid);
  assert.ok(D.view(cid, 'owner').chat.some(x => x.sys && /Amy joined/.test(x.text)), 'joins are posted');
  assert.strictEqual(D.mine('owner')[0].unread, 1);
  t += 1000; D.chat('amy', cid, 'who’s in');
  assert.strictEqual(D.mine('owner')[0].unread, 2);
  assert.strictEqual(D.mine('amy')[0].unread, 0, 'your own messages are read');
  assert.strictEqual(D.mine('owner')[0].last.text, 'who’s in');
  D.markRead('owner', cid);
  assert.strictEqual(D.mine('owner')[0].unread, 0);

  // game nights: staff only, weekly in the scheduler's time zone, opening by themselves
  assert.match(D.addNight('amy', cid, { kind: 'table', day: 4, time: '20:00', tz: 'America/Los_Angeles' }).err, /owner and managers/);
  assert.match(D.addNight('owner', cid, { kind: 'table', day: 9, time: '20:00' }).err, /day/);
  assert.match(D.addNight('owner', cid, { kind: 'table', day: 4, time: '8pm' }).err, /time/);
  const tn = D.addNight('owner', cid, { kind: 'table', day: 4, time: '20:00', tz: 'America/Los_Angeles', stakes: '25-50', name: 'Thursday game' });
  D.addNight('owner', cid, { kind: 'tourney', day: 4, time: '21:00', tz: 'America/Los_Angeles', buyIn: 2500, speed: 'turbo' });
  const nights = D.view(cid, 'amy').nights;
  assert.strictEqual(nights.length, 2);
  assert.strictEqual(new Date(nights[0].next).toISOString(), '2026-11-06T04:00:00.000Z', '8 pm Pacific tonight');
  assert.strictEqual(D.mine('amy')[0].nextNight, nights[0].next);
  t = Date.parse('2026-11-06T03:40:00Z'); D.tick();
  assert.deepStrictEqual(opened.map(x => x[0]), [], 'not yet: the table opens ten minutes early');
  t = Date.parse('2026-11-06T03:51:00Z'); D.tick();
  assert.deepStrictEqual(opened.map(x => x[0]), ['table'], 'the table opens ten minutes early');
  t = Date.parse('2026-11-06T04:01:00Z'); D.tick();
  assert.deepStrictEqual(opened.map(x => x[0]), ['table', 'tourney'], 'tournament registration opens an hour before it starts');
  assert.strictEqual(opened[1][1], Date.parse('2026-11-06T05:00:00Z'), 'the tournament starts at 9 pm');
  const v = D.view(cid, 'amy');
  assert.ok(v.chat.some(x => x.sys && x.link && x.link.kind === 'table' && x.link.code === 'GAME1'), 'the chat links to the table');
  assert.strictEqual(new Date(v.nights.find(x => x.id === tn.id).next).toISOString(), '2026-11-13T04:00:00.000Z', 'then next week');
  D.tick(); assert.strictEqual(opened.length, 2, 'opens once a week');
  assert.strictEqual(D.removeNight('owner', cid, tn.id), null);
  assert.strictEqual(D.view(cid, 'owner').nights.length, 1);
  D.post(cid, 'Amy won Friday Freezeout · $40');
  assert.ok(D.view(cid, 'owner').chat.some(x => /Amy won/.test(x.text)));
}
console.log('clubs test passed: Pro Pass to start, open/approval/invite joins, roles, bans, limits, chat, seasons and champions, unread counts, game nights');
