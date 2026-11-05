'use strict';
// Clubs: a card room inside Pokr. An owner (a Pro Pass member) runs it with managers; members join
// by code, by request, or by invite link. Clubs never hold money: everyone plays from their own
// Pokr balance and there's no rake. What a club has is a home: its own games, a leaderboard,
// monthly seasons with a champion, announcements and a chat that stays.
// Shared by the real server and the preview. Clubs live in store.clubs and are saved with accounts.

const MAX_MEMBERS = 100;
const MAX_CLUBS = 5;               // clubs one player can belong to
const CHAT_KEEP = 150;
const GLYPHS = 8, COLORS = 8;      // crest choices; the client draws them
const JOIN = ['open', 'approval', 'invite'];
const ROOMS = ['green', 'blue', 'burgundy', 'graphite', 'teal', 'purple', 'tan'];
const DAY = 86400000;

const ymOf = t => new Date(t).toISOString().slice(0, 7);       // season = calendar month (UTC)
const dayOf = t => new Date(t).toISOString().slice(0, 10);
const clean = (s, max) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);

// deps: { store, save(), clubActive(u) -> bool, notify(userId, msg), changed(club), makeId(), now() }
function createClubs(deps) {
  const now = () => (deps.now ? deps.now() : Date.now());
  const clubs = deps.store.clubs;
  const user = id => deps.store.byId(id);
  const roleOf = (c, uid) => (c.members[uid] ? c.members[uid].role : null);
  const isStaff = (c, uid) => ['owner', 'manager'].includes(roleOf(c, uid));
  const count = c => Object.keys(c.members).length;
  const clubsOf = uid => [...clubs.values()].filter(c => c.members[uid]);
  const touch = c => { deps.save(); deps.changed(c); };
  const find = id => clubs.get(String(id || '').toUpperCase()) || null;

  function ensureSeason(c) {
    const ym = ymOf(now());
    if (c.season.ym === ym) return;
    // close the old season: the champion is whoever finished furthest up
    const ranked = Object.entries(c.results).map(([uid, r]) => ({ uid, net: r.season.net, games: r.season.games })).filter(x => x.games > 0).sort((a, b) => b.net - a.net);
    if (ranked.length) {
      const u = user(ranked[0].uid);
      c.champions.unshift({ ym: c.season.ym, n: c.season.n, uid: ranked[0].uid, name: u ? u.name : 'Former member', net: ranked[0].net });
      c.champions = c.champions.slice(0, 24);
      for (const m of Object.keys(c.members)) deps.notify(m, { t: 'notice', message: `${u ? u.name : 'Someone'} won ${c.name}’s season ${c.season.n}` });
    }
    for (const r of Object.values(c.results)) r.season = { net: 0, games: 0 };
    c.season = { n: c.season.n + 1, ym, startedAt: now() };
  }
  function addMember(c, uid, role = 'member') {
    c.members[uid] = { role, joinedAt: now() };
    delete c.requests[uid];
    if (!c.results[uid]) c.results[uid] = { all: { net: 0, games: 0 }, season: { net: 0, games: 0 }, days: {} };
  }
  function canJoin(c, uid) {
    if (c.members[uid]) return 'You’re already in this club';
    if ((c.bans || []).includes(uid)) return 'You can’t join this club';
    if (count(c) >= MAX_MEMBERS) return `This club is full (${MAX_MEMBERS} members)`;
    if (clubsOf(uid).length >= MAX_CLUBS) return `You can be in up to ${MAX_CLUBS} clubs. Leave one to join another.`;
    return null;
  }
  const staffIds = c => Object.entries(c.members).filter(([, m]) => m.role !== 'member').map(([id]) => id);

  const api = {
    MAX_MEMBERS, MAX_CLUBS, GLYPHS, COLORS, JOIN, ROOMS,
    find, roleOf, isStaff,
    isMember: (id, uid) => { const c = find(id); return !!(c && c.members[uid]); },

    create(uid, o) {
      const u = user(uid); if (!u) return { err: 'Sign in first' };
      if (!deps.clubActive(u)) return { err: 'Starting a club comes with Pro Pass' };
      if (clubsOf(uid).length >= MAX_CLUBS) return { err: `You can be in up to ${MAX_CLUBS} clubs` };
      const name = clean(o.name, 28);
      if (name.length < 3) return { err: 'Give your club a name (at least 3 characters)' };
      if ([...clubs.values()].some(c => c.name.toLowerCase() === name.toLowerCase())) return { err: 'A club already has that name' };
      const id = deps.makeId();
      const c = {
        id, name, ownerId: uid, createdAt: now(),
        crest: { glyph: Math.abs(o.glyph | 0) % GLYPHS, color: Math.abs(o.color | 0) % COLORS },
        join: JOIN.includes(o.join) ? o.join : 'approval', room: ROOMS.includes(o.room) ? o.room : 'green',
        members: {}, requests: {}, bans: [], invites: {}, announcement: null, chat: [], results: {},
        season: { n: 1, ym: ymOf(now()), startedAt: now() }, champions: [],
      };
      clubs.set(id, c);
      addMember(c, uid, 'owner');
      touch(c);
      return { id };
    },
    // Join with the club's code; invite-only clubs need an invite link's token.
    join(uid, id, token) {
      const c = find(id); if (!c) return { err: 'No club with that code' };
      const why = canJoin(c, uid); if (why) return { err: why };
      if (c.join === 'invite') {
        const inv = token && c.invites[token];
        if (!inv) return { err: 'This club is invite-only. Ask a manager for an invite link.' };
        delete c.invites[token];
      }
      if (c.join === 'approval' && !token) {
        const u = user(uid);
        c.requests[uid] = { at: now(), name: u ? u.name : 'Player' };
        for (const s of staffIds(c)) deps.notify(s, { t: 'notice', message: `${u ? u.name : 'Someone'} asked to join ${c.name}` });
        touch(c);
        return { pending: true };
      }
      if (c.join === 'approval' && token) { if (!c.invites[token]) return { err: 'That invite has expired' }; delete c.invites[token]; }
      addMember(c, uid);
      touch(c);
      return { joined: true };
    },
    cancelRequest(uid, id) { const c = find(id); if (c && c.requests[uid]) { delete c.requests[uid]; touch(c); } return null; },
    answer(uid, id, target, yes) {
      const c = find(id); if (!c) return 'No such club';
      if (!isStaff(c, uid)) return 'Only the owner and managers can do that';
      if (!c.requests[target]) return 'That request is gone';
      if (!yes) { delete c.requests[target]; touch(c); return null; }
      const why = canJoin(c, target); if (why) { delete c.requests[target]; touch(c); return why; }
      addMember(c, target);
      deps.notify(target, { t: 'notice', message: `You’re in ${c.name}` });
      touch(c);
      return null;
    },
    // A one-time invite link (works for approval and invite-only clubs, skipping the wait).
    invite(uid, id) {
      const c = find(id); if (!c) return { err: 'No such club' };
      if (!isStaff(c, uid)) return { err: 'Only the owner and managers can invite' };
      const token = deps.makeId() + deps.makeId();
      // keep the list short: drop invites older than a week
      for (const [k, v] of Object.entries(c.invites)) if (now() - v.at > 7 * DAY) delete c.invites[k];
      c.invites[token] = { by: uid, at: now() };
      touch(c);
      return { token };
    },
    leave(uid, id) {
      const c = find(id); if (!c || !c.members[uid]) return 'You’re not in that club';
      if (c.ownerId === uid) return count(c) > 1 ? 'Make someone else the owner first, or delete the club' : 'You’re the only member: delete the club instead';
      delete c.members[uid];
      touch(c);
      return null;
    },
    remove(uid, id, target, ban) {
      const c = find(id); if (!c) return 'No such club';
      if (!isStaff(c, uid)) return 'Only the owner and managers can remove people';
      if (!c.members[target]) return 'They’re not in the club';
      if (target === c.ownerId) return 'The owner can’t be removed';
      if (roleOf(c, target) === 'manager' && roleOf(c, uid) !== 'owner') return 'Only the owner can remove a manager';
      delete c.members[target];
      if (ban && !c.bans.includes(target)) c.bans.push(target);
      deps.notify(target, { t: 'notice', message: `You were removed from ${c.name}` });
      touch(c);
      return null;
    },
    unban(uid, id, target) {
      const c = find(id); if (!c) return 'No such club';
      if (!isStaff(c, uid)) return 'Only the owner and managers can do that';
      c.bans = c.bans.filter(x => x !== target); touch(c); return null;
    },
    // Owner only: make someone a manager or a member, or hand the club over.
    setRole(uid, id, target, role) {
      const c = find(id); if (!c) return 'No such club';
      if (c.ownerId !== uid) return 'Only the owner can change roles';
      if (!c.members[target] || target === uid) return 'Pick another member';
      if (role === 'owner') { c.members[uid].role = 'manager'; c.members[target].role = 'owner'; c.ownerId = target; deps.notify(target, { t: 'notice', message: `You’re now the owner of ${c.name}` }); }
      else if (role === 'manager' || role === 'member') c.members[target].role = role;
      else return 'Unknown role';
      touch(c);
      return null;
    },
    // Owner: name, crest, room, who can join. Managers: who can join.
    update(uid, id, o) {
      const c = find(id); if (!c) return 'No such club';
      const owner = c.ownerId === uid;
      if (!owner && !isStaff(c, uid)) return 'Only the owner and managers can change settings';
      if (o.join !== undefined) { if (!JOIN.includes(o.join)) return 'Pick open, approval or invite-only'; c.join = o.join; }
      if (owner) {
        if (o.name !== undefined) {
          const name = clean(o.name, 28);
          if (name.length < 3) return 'Give your club a name (at least 3 characters)';
          if ([...clubs.values()].some(x => x !== c && x.name.toLowerCase() === name.toLowerCase())) return 'A club already has that name';
          c.name = name;
        }
        if (o.glyph !== undefined) c.crest.glyph = Math.abs(o.glyph | 0) % GLYPHS;
        if (o.color !== undefined) c.crest.color = Math.abs(o.color | 0) % COLORS;
        if (o.room !== undefined && ROOMS.includes(o.room)) c.room = o.room;
      }
      touch(c);
      return null;
    },
    announce(uid, id, text) {
      const c = find(id); if (!c) return 'No such club';
      if (!isStaff(c, uid)) return 'Only the owner and managers can post announcements';
      const t = clean(text, 240);
      c.announcement = t ? { text: t, by: uid, at: now() } : null;
      if (t) for (const m of Object.keys(c.members)) if (m !== uid) deps.notify(m, { t: 'notice', message: `${c.name}: ${t.slice(0, 80)}` });
      touch(c);
      return null;
    },
    chat(uid, id, text) {
      const c = find(id); if (!c || !c.members[uid]) return 'Join the club to chat';
      const t = clean(text, 300); if (!t) return null;
      const u = user(uid);
      c.chat.push({ id: deps.makeId(), uid, name: u ? u.name : 'Player', text: t, at: now() });
      if (c.chat.length > CHAT_KEEP) c.chat = c.chat.slice(-CHAT_KEEP);
      touch(c);
      return null;
    },
    deleteClub(uid, id) {
      const c = find(id); if (!c) return 'No such club';
      if (c.ownerId !== uid) return 'Only the owner can delete the club';
      for (const m of Object.keys(c.members)) if (m !== uid) deps.notify(m, { t: 'notice', message: `${c.name} was closed by its owner` });
      deps.store.dropClub(c.id);
      deps.changed(c);
      return null;
    },

    // A finished game at a club table, tournament or board: the player's result (in cents).
    record(id, uid, net) {
      const c = find(id); if (!c || !c.members[uid]) return;
      ensureSeason(c);
      const r = c.results[uid] || (c.results[uid] = { all: { net: 0, games: 0 }, season: { net: 0, games: 0 }, days: {} });
      r.all.net += net; r.all.games++;
      r.season.net += net; r.season.games++;
      const d = dayOf(now());
      r.days[d] = (r.days[d] || 0) + net;
      for (const k of Object.keys(r.days)) if (now() - Date.parse(k) > 8 * DAY) delete r.days[k];
      deps.save();
    },

    // Everything a member's screen needs; a short card for anyone else.
    view(id, uid) {
      const c = find(id); if (!c) return null;
      ensureSeason(c);
      const me = c.members[uid];
      const base = { id: c.id, name: c.name, crest: c.crest, room: c.room, join: c.join, members: count(c), max: MAX_MEMBERS, owner: (user(c.ownerId) || {}).name || '', champion: c.champions[0] || null };
      if (!me) return { ...base, member: false, requested: !!c.requests[uid], banned: (c.bans || []).includes(uid) };
      const weekAgo = dayOf(now() - 6 * DAY);
      const people = Object.entries(c.members).map(([mid, m]) => {
        const u = user(mid), r = c.results[mid] || { all: { net: 0, games: 0 }, season: { net: 0, games: 0 }, days: {} };
        const week = Object.entries(r.days).filter(([d]) => d >= weekAgo).reduce((a, [, n]) => a + n, 0);
        return { id: mid, name: u ? u.name : 'Former player', avatar: u ? u.avatar : { a: 0, c: 0 }, role: m.role, joinedAt: m.joinedAt, week, season: r.season, all: r.all };
      });
      return {
        ...base, member: true, role: me.role, people,
        season: c.season, champions: c.champions.slice(0, 6), announcement: c.announcement,
        chat: c.chat.slice(-60).map(x => { const u = user(x.uid); return { ...x, avatar: u ? u.avatar : null, name: u ? u.name : x.name }; }),
        requests: isStaff(c, uid) ? Object.entries(c.requests).map(([rid, r]) => { const u = user(rid); return { id: rid, name: u ? u.name : r.name, avatar: u ? u.avatar : null, at: r.at }; }) : [],
        bans: isStaff(c, uid) ? c.bans.map(b => ({ id: b, name: (user(b) || {}).name || 'Player' })) : [],
      };
    },
    mine(uid) {
      return clubsOf(uid).map(c => { ensureSeason(c); return { id: c.id, name: c.name, crest: c.crest, members: count(c), role: c.members[uid].role, unread: 0, announcement: c.announcement ? c.announcement.text : null, champion: c.champions[0] ? c.champions[0].name : null }; });
    },
    // A season ending runs on the next look at the club; this makes sure quiet clubs roll over too.
    tick() { for (const c of clubs.values()) { const before = c.season.ym; ensureSeason(c); if (c.season.ym !== before) touch(c); } },
  };
  return api;
}

module.exports = { createClubs, MAX_MEMBERS, MAX_CLUBS };
