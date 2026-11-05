'use strict';
// Pokr's business rules in one place, shared by the real server and the in-Claude preview.
//
// How Pokr makes money: never from the games. No rake, no cut of pots, free deposits, free
// standard withdrawals. Revenue comes from Pro Pass (themes + member avatars), single avatar
// purchases, and an optional fee for instant transfers.
//
// Everything here runs in TEST MODE: no card is charged and no bank is touched. Cosmetic
// purchases are tracked separately from the poker balance and never draw from it.

const CLUB = { priceCents: 499, period: 'month', name: 'Pro Pass' };

// Table felts: classic green is free; the rest come with Pro Pass.
const FELTS = [
  { id: 'green', name: 'Card Room', felt: '#1F7049', deep: '#0A3220', club: false },
  { id: 'blue', name: 'Midnight Lounge', felt: '#1C3B66', deep: '#08142A', club: true },
  { id: 'burgundy', name: 'Velvet Room', felt: '#5C1B26', deep: '#21070C', club: true },
  { id: 'graphite', name: 'Concrete Loft', felt: '#2E2F33', deep: '#0F1012', club: true },
  { id: 'teal', name: 'Shoji Room', felt: '#0E5152', deep: '#03201F', club: true },
  { id: 'purple', name: 'Neon Club', felt: '#3D2763', deep: '#140B27', club: true },
  { id: 'tan', name: 'Casino Floor', felt: '#6E5638', deep: '#2B2013', club: true },
];

const THEMES = [
  { id: 'lounge', name: 'Black Room', blurb: 'Graphite, deep green felt, a touch of gold', club: false },
  { id: 'neon', name: 'Neon Strip', blurb: 'Black glass, hot pink and electric blue', club: true },
  { id: 'monaco', name: 'Monte Carlo', blurb: 'Midnight navy felt with gold leaf', club: true },
  { id: 'zebra', name: 'Zebra Room', blurb: 'Lacquer-red felt and zebra-print walls', club: true },
];

// Avatar indexes: 0-15 free for everyone, 16-21 included with Pro Pass, 22-27 sold one at a time.
const FREE_AVATARS = 16;
const CLUB_AVATARS = [16, 17, 18, 19, 20, 21];
const SHOP_AVATARS = [22, 23, 24, 25, 26, 27];
const AVATAR_PRICE_CENTS = 99;
const AVATAR_COUNT = 28;

// Fees apply only to instant transfers. Standard deposits and withdrawals are free.
const FEES = { instantPct: 1.5, instantMinCents: 50 };
const LIMITS = { minCents: 500, maxDepositCents: 100000 };
const SETTLE_MS = Number((typeof process !== 'undefined' && process.env && process.env.CASHIER_SETTLE_MS) || 45000); // test mode stand-in for "1-3 business days"

const looks = require('./looks');
function ensure(u) {
  if (!u.club) u.club = { active: false };
  if (!u.theme) u.theme = 'lounge';
  if (!u.felt) u.felt = 'green';
  if (!Array.isArray(u.ownedAvatars)) u.ownedAvatars = [];
  if (!Array.isArray(u.transactions)) u.transactions = [];
  if (!Array.isArray(u.purchases)) u.purchases = [];
  return u;
}

const instantFee = amount => Math.max(FEES.instantMinCents, Math.round(amount * FEES.instantPct / 100));

function canUseAvatar(u, a) {
  ensure(u);
  if (!Number.isInteger(a) || a < 0 || a >= AVATAR_COUNT) return false;
  if (a < FREE_AVATARS) return true;
  if (CLUB_AVATARS.includes(a)) return !!u.club.active;
  return u.ownedAvatars.includes(a);
}
function canUseTheme(u, id) {
  ensure(u);
  const t = THEMES.find(x => x.id === id);
  return !!t && (!t.club || !!u.club.active);
}

// Club membership. Returns { error } or { ok }.
function club(u, action, now = Date.now()) {
  ensure(u);
  if (action === 'join') {
    if (u.club.active) return { error: 'You already have Pro Pass' };
    u.club = { active: true, since: now, renewsAt: now + 30 * 864e5, test: true };
    u.purchases.push({ ts: now, item: 'club', cents: CLUB.priceCents, test: true });
    return { ok: true };
  }
  if (action === 'cancel') {
    if (!u.club.active) return { error: 'You don’t have Pro Pass' };
    u.club = { active: false, endedAt: now };
    if (!canUseTheme(u, u.theme)) u.theme = 'lounge';
    if (!canUseFelt(u, u.felt)) u.felt = 'green';
    if (u.avatar && !canUseAvatar(u, u.avatar.a)) u.avatar = { a: 0, c: 0, ...(u.avatar.ch ? { ch: u.avatar.ch } : {}) };
    // Pro Pass parts come off the character when the membership ends
    const ch = u.avatar && u.avatar.ch;
    if (ch && looks.CLUB_LOOKS.includes(ch.lk)) ch.lk = 0;
    if (ch && looks.CLUB_JACKETS.includes(ch.jk)) { ch.jk = 0; u.avatar.c = 0; }
    return { ok: true, resetAvatar: true };
  }
  return { error: 'Unknown action' };
}

function buyAvatar(u, a, now = Date.now()) {
  ensure(u);
  if (!SHOP_AVATARS.includes(a)) return { error: 'That avatar isn’t for sale' };
  if (u.ownedAvatars.includes(a)) return { error: 'You already own that one' };
  u.ownedAvatars.push(a);
  u.purchases.push({ ts: now, item: 'avatar:' + a, cents: AVATAR_PRICE_CENTS, test: true });
  return { ok: true };
}

function canUseFelt(u, id) {
  ensure(u);
  const f = FELTS.find(x => x.id === id);
  return !!f && (!f.club || !!u.club.active);
}
function setFelt(u, id) {
  ensure(u);
  if (!FELTS.some(f => f.id === id)) return { error: 'Unknown felt' };
  if (!canUseFelt(u, id)) return { error: 'That felt comes with Pro Pass' };
  u.felt = id;
  return { ok: true };
}

function setTheme(u, id) {
  ensure(u);
  if (!THEMES.some(t => t.id === id)) return { error: 'Unknown theme' };
  if (!canUseTheme(u, id)) return { error: 'That theme comes with Pro Pass' };
  u.theme = id;
  return { ok: true };
}

// Deposits and withdrawals. Amounts in cents. Returns { error } or { tx, bankrollChange }.
// A standard deposit lands after settlement; an instant one lands now, minus the fee.
// A withdrawal leaves the balance immediately (it's on its way); instant ones also pay the fee.
function cashier(u, { action, amount, speed }, now = Date.now()) {
  ensure(u);
  amount = Math.floor(Number(amount));
  if (!Number.isFinite(amount) || amount < LIMITS.minCents) return { error: 'The minimum is $5' };
  if (speed !== 'instant' && speed !== 'standard') return { error: 'Pick standard or instant' };
  const fee = speed === 'instant' ? instantFee(amount) : 0;
  const id = 'tx_' + now.toString(36) + Math.random().toString(36).slice(2, 7);
  if (action === 'deposit') {
    if (amount > LIMITS.maxDepositCents) return { error: 'Test mode deposits are capped at $1,000' };
    if (fee >= amount) return { error: 'That’s smaller than the instant fee' };
    const tx = { id, type: 'deposit', speed, amount, fee, net: amount - fee, status: speed === 'instant' ? 'completed' : 'pending', createdAt: now, settlesAt: speed === 'instant' ? now : now + SETTLE_MS, test: true };
    u.transactions.unshift(tx);
    u.transactions = u.transactions.slice(0, 50);
    if (speed === 'instant') u.bankroll += tx.net;
    return { tx, bankrollChange: speed === 'instant' ? tx.net : 0 };
  }
  if (action === 'withdraw') {
    if (amount + fee > u.bankroll) return { error: fee ? 'Not enough balance to cover that plus the instant fee' : 'That’s more than your balance' };
    const tx = { id, type: 'withdraw', speed, amount, fee, net: amount, status: speed === 'instant' ? 'completed' : 'pending', createdAt: now, settlesAt: speed === 'instant' ? now : now + SETTLE_MS, test: true };
    u.transactions.unshift(tx);
    u.transactions = u.transactions.slice(0, 50);
    u.bankroll -= amount + fee;
    return { tx, bankrollChange: -(amount + fee) };
  }
  return { error: 'Unknown action' };
}

// Completes standard transfers whose time has come. Returns the settled transactions.
function settle(u, now = Date.now()) {
  ensure(u);
  const done = [];
  for (const tx of u.transactions) {
    if (tx.status !== 'pending' || tx.settlesAt > now) continue;
    tx.status = 'completed';
    if (tx.type === 'deposit') u.bankroll += tx.net;
    done.push(tx);
  }
  return done;
}

// What the client gets to see about a user's account.
function publicEconomy(u) {
  ensure(u);
  return {
    club: { active: !!u.club.active, renewsAt: u.club.renewsAt || null },
    theme: u.theme,
    felt: u.felt,
    ownedAvatars: u.ownedAvatars.slice(),
    transactions: u.transactions.slice(0, 20),
  };
}

const catalog = () => ({ club: CLUB, themes: THEMES, felts: FELTS, clubAvatars: CLUB_AVATARS, shopAvatars: SHOP_AVATARS, avatarPrice: AVATAR_PRICE_CENTS, fees: FEES, limits: LIMITS, freeAvatars: FREE_AVATARS, testMode: true });

module.exports = { catalog, ensure, canUseAvatar, canUseTheme, canUseFelt, club, buyAvatar, setTheme, setFelt, cashier, settle, publicEconomy, instantFee, AVATAR_COUNT, FREE_AVATARS };
