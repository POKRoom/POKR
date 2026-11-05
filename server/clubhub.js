'use strict';
// The club messages, shared by the real server and the preview so they can't drift apart.
// The host passes in how to talk to clients and how to list a club's live games.
//
// io: { send(c, msg), clients() -> iterable of { userId, club }, tablesFor(id), tourneysFor(id, userId), boardsFor(id) }
function createClubHub(clubs, io) {
  const state = (id, uid) => {
    const v = clubs.view(id, uid);
    if (v && v.member) v.games = { tables: io.tablesFor(id), tourneys: io.tourneysFor(id, uid), boards: io.boardsFor(id) };
    return v;
  };
  const err = (c, message) => io.send(c, { t: 'error', message });
  const sendState = (c, id) => { const s = state(id, c.userId); if (s) io.send(c, { t: 'clubState', s }); else io.send(c, { t: 'clubGone', id }); };
  const sendMine = c => io.send(c, { t: 'clubs', list: clubs.mine(c.userId) });

  // Something changed in a club: refresh whoever is looking at it, and members' club lists.
  const dirty = new Set();
  let timer = null;
  function push(club) {
    dirty.add(club.id);
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      const ids = [...dirty]; dirty.clear();
      for (const c of io.clients()) {
        if (!c.userId) continue;
        if (c.club && ids.includes(c.club)) sendState(c, c.club);
        if (ids.some(id => { const x = clubs.find(id); return !x || x.members[c.userId]; })) sendMine(c);
      }
    }, 150);
  }

  const handlers = {
    clubMine(c) { sendMine(c); },
    clubOpen(c, m) { c.club = String(m.id || '').toUpperCase(); sendState(c, c.club); },
    clubClose(c) { c.club = null; },
    clubCreate(c, m) {
      const r = clubs.create(c.userId, { name: m.name, glyph: m.glyph, color: m.color, join: m.join, room: m.room });
      if (r.err) return err(c, r.err);
      c.club = r.id; sendState(c, r.id); sendMine(c);
    },
    clubJoin(c, m) {
      const id = String(m.id || '').toUpperCase();
      const r = clubs.join(c.userId, id, m.token ? String(m.token) : null);
      if (r.err) return err(c, r.err);
      if (r.pending) io.send(c, { t: 'notice', message: 'Request sent. A manager will let you in.' });
      c.club = id; sendState(c, id); sendMine(c);
    },
    clubCancel(c, m) { clubs.cancelRequest(c.userId, m.id); sendState(c, String(m.id || '').toUpperCase()); },
    clubAnswer(c, m) { const e = clubs.answer(c.userId, m.id, String(m.user || ''), !!m.yes); if (e) err(c, e); },
    clubInvite(c, m) { const r = clubs.invite(c.userId, m.id); if (r.err) return err(c, r.err); io.send(c, { t: 'clubInvite', id: String(m.id).toUpperCase(), token: r.token }); },
    clubLeave(c, m) { const e = clubs.leave(c.userId, m.id); if (e) return err(c, e); c.club = null; sendMine(c); io.send(c, { t: 'notice', message: 'You left the club' }); },
    clubRemove(c, m) { const e = clubs.remove(c.userId, m.id, String(m.user || ''), !!m.ban); if (e) err(c, e); },
    clubUnban(c, m) { const e = clubs.unban(c.userId, m.id, String(m.user || '')); if (e) err(c, e); },
    clubRole(c, m) { const e = clubs.setRole(c.userId, m.id, String(m.user || ''), String(m.role || '')); if (e) err(c, e); },
    clubUpdate(c, m) { const e = clubs.update(c.userId, m.id, m.set || {}); if (e) err(c, e); else io.send(c, { t: 'notice', message: 'Saved' }); },
    clubAnnounce(c, m) { const e = clubs.announce(c.userId, m.id, m.text); if (e) err(c, e); },
    clubChat(c, m) {
      const now = Date.now();
      if (now - (c.lastClubChat || 0) < 700) return; // a little breathing room
      c.lastClubChat = now;
      const e = clubs.chat(c.userId, m.id, m.text); if (e) err(c, e);
    },
    clubRead(c, m) { clubs.markRead(c.userId, m.id); sendMine(c); },
    clubNight(c, m) { const r = clubs.addNight(c.userId, m.id, m.set || {}); if (r.err) return err(c, r.err); io.send(c, { t: 'notice', message: 'Game night saved' }); },
    clubNightRemove(c, m) { const e = clubs.removeNight(c.userId, m.id, String(m.night || '')); if (e) err(c, e); },
    clubDelete(c, m) { const e = clubs.deleteClub(c.userId, m.id); if (e) return err(c, e); c.club = null; sendMine(c); },
  };
  return { handlers, push, state };
}

module.exports = { createClubHub };
