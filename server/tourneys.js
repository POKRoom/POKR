'use strict';
// Runs every tournament: the Pokr Championship Series schedule, private tournaments friends host,
// buy-ins and prizes, and keeping each player's screen on the table they've been moved to.
// Shared by the real server and the in-browser preview.
const { Tournament, SPEEDS } = require('./tournament');

// The house series. Times are UTC hours; the app shows them in each player's own time zone.
const SERIES = [
  { key: 'main', name: 'PCS Main Event', buyIn: 10000, speed: 'deep', seats: 9, lateReg: 8, reentries: 0, guarantee: 250000, dailyUtc: 2 },
  { key: 'hr', name: 'PCS High Roller', buyIn: 25000, speed: 'regular', seats: 8, lateReg: 6, reentries: 1, guarantee: 200000, dailyUtc: 4 },
  { key: 'deep', name: 'Daily Deepstack', buyIn: 2500, speed: 'deep', seats: 9, lateReg: 6, reentries: 2, everyMin: 120 },
  { key: 'plo', name: 'Omaha Bounty-Free', buyIn: 1000, speed: 'regular', seats: 6, lateReg: 5, reentries: 1, everyMin: 90, game: 'plo' },
  { key: 'turbo', name: 'Turbo Thirty', buyIn: 1000, speed: 'turbo', seats: 9, lateReg: 4, reentries: 0, everyMin: 30 },
];

// Sit & Gos: one table, starts as soon as it fills. There's always one open at each of these.
const SNG_TIERS = [
  { key: 'h1', game: 'nlh', buyIn: 100, speed: 'hyper', seats: 6 },
  { key: 'h5', game: 'nlh', buyIn: 500, speed: 'turbo', seats: 6 },
  { key: 'h5n', game: 'nlh', buyIn: 500, speed: 'turbo', seats: 9 },
  { key: 'h20', game: 'nlh', buyIn: 2000, speed: 'turbo', seats: 9 },
  { key: 'h50', game: 'nlh', buyIn: 5000, speed: 'regular', seats: 6 },
  { key: 'o2', game: 'plo', buyIn: 200, speed: 'hyper', seats: 6 },
  { key: 'o10', game: 'plo', buyIn: 1000, speed: 'turbo', seats: 6 },
  { key: 'o25', game: 'plo', buyIn: 2500, speed: 'turbo', seats: 6 },
];
// Seconds after the first person sits before bots fill the rest, so nobody waits forever.
const SNG_FILL_AFTER = { live: 45, preview: 6 };

function nextStart(ev, now, preview) {
  if (preview) return now + (ev.previewIn || 90) * 1000;
  if (ev.everyMin) { const ms = ev.everyMin * 60000; return Math.ceil((now + 60000) / ms) * ms; }
  const d = new Date(now); d.setUTCMinutes(0, 0, 0); d.setUTCHours(ev.dailyUtc);
  if (d.getTime() <= now + 60000) d.setUTCDate(d.getUTCDate() + 1);
  return d.getTime();
}

// deps: { Table, makeCode, tables(Map), timing?, broadcast(t), charge(userId, cents) -> err, credit(userId, cents, why),
//         userInfo(userId) -> { name, avatar }, notify(userId, msg), moveClient(userId, code), changed(), preview }
function createManager(deps) {
  const tours = new Map();
  const byTable = new Map(); // table code -> tournament
  let seq = 0;

  const makeTable = tour => o => {
    const code = deps.makeCode();
    const t = new deps.Table({ code, name: o.name, sb: o.sb, bb: o.bb, maxSeats: o.maxSeats, tourney: o.tourney, game: o.game, isPrivate: true, hostId: null, timing: deps.timing }, {
      onChange: x => deps.broadcast(x),
      onHandEnd: x => tour.handEnded(x),
    });
    deps.tables.set(code, t);
    byTable.set(code, tour);
    return t;
  };
  function make(cfg) {
    const id = cfg.id || deps.makeCode();
    const tour = new Tournament({ ...cfg, id }, {
      makeTable: null,
      destroyTable: t => { setTimeout(() => { t.destroy(); deps.tables.delete(t.code); byTable.delete(t.code); }, 4000); },
      onMove: (userId, code) => deps.moveClient(userId, code),
      onBust: (p, info) => {
        if (p.kind !== 'human' || !p.userId) return;
        if (info.prize) deps.credit(p.userId, info.prize, `${tour.name}: ${ordinal(info.place)} place`);
        if (deps.onResult) deps.onResult(tour, p, info); // e.g. a club's leaderboard
        deps.notify(p.userId, { t: 'tourneyResult', id: tour.id, name: tour.name, place: info.place, prize: info.prize, entries: info.entries, won: !!info.won, canReenter: !!info.canReenter, buyIn: tour.buyIn });
      },
      onRefund: (p, cents) => { if (p.kind === 'human' && p.userId && cents) deps.credit(p.userId, cents, `${tour.name} canceled: refund`); },
      onFinish: () => { tour.closeAt = Date.now() + (tour.sng ? 5 : 15) * 60000; for (const t of tour.tables) tour.deps.destroyTable(t); if (tour.series) schedule(SERIES.find(s => s.key === tour.series)); },
      onChange: () => deps.changed(tour),
      now: () => Date.now(),
    });
    tour.deps.makeTable = makeTable(tour);
    tours.set(id, tour);
    return tour;
  }

  function schedule(ev) {
    if (!ev) return;
    if ([...tours.values()].some(t => t.series === ev.key && t.status === 'registering')) return;
    const now = Date.now();
    const tour = make({
      name: ev.name, series: ev.key, buyIn: ev.buyIn, speed: deps.preview ? 'hyper' : ev.speed, seatsPerTable: ev.seats,
      lateRegLevels: ev.lateReg, reentries: ev.reentries, guarantee: deps.preview ? 0 : (ev.guarantee || 0), game: ev.game || 'nlh',
      startsAt: nextStart(ev, now, deps.preview), levelMs: deps.preview ? 120000 : undefined,
    });
    if (deps.preview) tour.botPlan = { total: ev.previewBots || 20, until: tour.startsAt };
    return tour;
  }
  if (deps.preview) {
    SERIES[0].previewIn = 75; SERIES[0].previewBots = 25;
    SERIES[4].previewIn = 45; SERIES[4].previewBots = 12;
    SERIES[3].previewIn = 150; SERIES[3].previewBots = 10;
    SERIES[1].previewIn = 240; SERIES[1].previewBots = 14;
    SERIES[2].previewIn = 360; SERIES[2].previewBots = 20;
  }
  SERIES.forEach(schedule);

  function openSng(tier) {
    if ([...tours.values()].some(t => t.tier === tier.key && t.status === 'registering')) return;
    const gameName = tier.game === 'plo' ? 'Omaha' : 'Hold’em';
    const money = c => '$' + (c / 100).toLocaleString('en-US', c % 100 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : {});
    make({
      name: `${gameName} Sit & Go ${money(tier.buyIn)}`, sng: true, tier: tier.key, game: tier.game, buyIn: tier.buyIn,
      speed: tier.speed, seatsPerTable: tier.seats, levelMs: deps.sngLevelMs || (deps.preview ? 60000 : undefined),
    });
  }
  SNG_TIERS.forEach(openSng);

  const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const find = id => tours.get(String(id || '').toUpperCase()) || tours.get(String(id || ''));
  const keyFor = userId => 'u:' + userId;

  return {
    tours, byTable,
    list(userId) {
      return [...tours.values()].filter(t => !t.isPrivate || (userId && [...t.players.values()].some(p => p.userId === userId)) || t.hostId === userId)
        .filter(t => t.status !== 'canceled')
        .map(t => t.summary(userId))
        .sort((a, b) => (a.status === 'running' ? 0 : a.status === 'registering' ? 1 : 2) - (b.status === 'running' ? 0 : b.status === 'registering' ? 1 : 2) || (a.startsAt || 0) - (b.startsAt || 0));
    },
    detail(id, userId) { const t = find(id); return t ? t.detail(userId) : null; },
    register(userId, id) {
      const t = find(id); if (!t) return 'That tournament doesn’t exist';
      const err = t.canEnter(keyFor(userId)); if (err) return err;
      const pay = deps.charge(userId, t.buyIn, `${t.name}: buy-in`); if (pay) return pay;
      const info = deps.userInfo(userId);
      const e = t.enter({ key: keyFor(userId), userId, kind: 'human', name: info.name, avatar: info.avatar });
      if (e) { deps.credit(userId, t.buyIn, 'refund'); return e; }
      return null;
    },
    unregister(userId, id) {
      const t = find(id); if (!t) return 'That tournament doesn’t exist';
      const e = t.unregister(keyFor(userId)); if (e) return e;
      deps.credit(userId, t.buyIn, `${t.name}: unregistered`);
      return null;
    },
    host(userId, cfg) {
      const info = deps.userInfo(userId);
      const speed = SPEEDS[cfg.speed] ? cfg.speed : 'turbo';
      const buyIn = [0, 500, 1000, 2500, 5000, 10000].includes(cfg.buyIn) ? cfg.buyIn : 1000;
      const t = make({
        id: deps.makeCode(), name: String(cfg.name || '').trim().slice(0, 30) || `${info.name}'s tournament`, buyIn, speed,
        seatsPerTable: Math.max(5, Math.min(9, cfg.seats || 9)), lateRegLevels: cfg.lateReg ? 4 : 0, reentries: cfg.reentry ? 1 : 0,
        hostId: userId, isPrivate: true, game: cfg.game === 'plo' ? 'plo' : 'nlh',
      });
      if (cfg.clubId) t.clubId = cfg.clubId;
      return t;
    },
    start(userId, id) { const t = find(id); if (!t) return 'Not found'; if (t.hostId !== userId) return 'Only the host can start it'; return t.start(); },
    addBots(userId, id, n) {
      const t = find(id); if (!t) return 'Not found';
      if (t.hostId !== userId) return 'Only the host can add bots';
      t.addBots(Math.max(1, Math.min(40, n || 5)));
      return null;
    },
    myTable(userId, id) { const t = find(id); if (!t) return null; const p = t.players.get(keyFor(userId)); return p && p.table; },
    setConnected(userId, on) {
      for (const t of tours.values()) {
        const p = t.players.get(keyFor(userId));
        if (!p || p.status !== 'playing' || !p.table) continue;
        const tb = deps.tables.get(p.table); if (!tb) continue;
        const i = tb.seats.findIndex(s => s && s.key === p.key);
        if (i >= 0) { tb.seats[i].connected = on; tb.seats[i].sittingOut = on ? false : tb.seats[i].sittingOut; tb._changed(); }
      }
    },
    tick() {
      const now = Date.now();
      for (const t of tours.values()) {
        // preview: bots trickle in before the start
        if (t.botPlan && t.status === 'registering') {
          const due = Math.round(t.botPlan.total * Math.min(1, 1 - (t.startsAt - now) / ((t.botPlan.until - (t.botPlan.from || (t.botPlan.from = now))) || 1)));
          const have = [...t.players.values()].filter(p => p.kind === 'bot').length;
          if (due > have) t.addBots(due - have);
        }
        // Sit & Go: bots fill the empty seats a little while after the first player sits, then it starts.
        if (t.sng && t.status === 'registering') {
          const humans = [...t.players.values()].filter(p => p.kind === 'human' && p.status === 'registered').length;
          if (humans && !t.fillAt) t.fillAt = now + (deps.sngFillMs != null ? deps.sngFillMs : (deps.preview ? SNG_FILL_AFTER.preview : SNG_FILL_AFTER.live) * 1000);
          if (!humans) t.fillAt = 0;
          if (t.fillAt && now >= t.fillAt && t.registered < t.maxPlayers) t.addBots(t.maxPlayers - t.registered);
          if (t.registered >= t.maxPlayers) {
            t.start();
            openSng(SNG_TIERS.find(x => x.key === t.tier));
          }
        }
        const before = t.status;
        t.tick();
        if (before === 'registering' && t.status === 'canceled' && t.series) schedule(SERIES.find(s => s.key === t.series));
        if (before === 'registering' && t.status === 'running' && t.series) schedule(SERIES.find(s => s.key === t.series));
        if ((t.status === 'finished' || t.status === 'canceled') && t.closeAt && now > t.closeAt) tours.delete(t.id);
        if (t.status === 'canceled' && !t.closeAt) t.closeAt = now + 5 * 60000;
      }
    },
  };
}

module.exports = { createManager, SERIES, SNG_TIERS };
