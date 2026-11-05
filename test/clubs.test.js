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
console.log('clubs test passed: Pro Pass to start, open/approval/invite joins, roles, bans, limits, chat, seasons and champions');
