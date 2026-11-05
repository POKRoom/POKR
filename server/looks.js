'use strict';
// Characters: everyone at the table is a drawn character built from these parts.
// The client draws them; this file is the rule book the server checks before saving one.
//
//   avatar = { a, c, ch: { lk, sk, hr, jk, sh, bd, sp } }
//   lk look (hat or hair), sk skin, hr hair colour, jk jacket, sh shades 0/1, bd beard 0/1,
//   sp a special look ('' for none) that only an admin can give out.

const LOOKS = 11;          // 0-7 free; 8 cowboy hat, 9 fedora, 10 bandana come with Pro Pass
const CLUB_LOOKS = [8, 9, 10];
const SKINS = 5;
const HAIRS = 7;
const JACKETS = 10;        // 0-7 free; 8 gold, 9 white come with Pro Pass
const CLUB_JACKETS = [8, 9];
// One of a kind: an admin gives these to people. They can't be bought.
const SPECIALS = [
  { id: 'crown', name: 'The Crown' },
  { id: 'shark', name: 'Shark' },
  { id: 'diamond', name: 'Diamond Hands' },
  { id: 'flame', name: 'Hot Streak' },
  { id: 'astro', name: 'Moonshot' },
  { id: 'gold', name: 'Gold Plate' },
  { id: 'princess', name: 'Princess' },
];
const SPECIAL_IDS = SPECIALS.map(s => s.id);

const int = (v, max) => (Number.isInteger(v) && v >= 0 && v < max ? v : null);
// A clean copy of a character, or null if any part is out of range.
function cleanLook(ch) {
  if (!ch || typeof ch !== 'object') return null;
  const out = { lk: int(ch.lk, LOOKS), sk: int(ch.sk, SKINS), hr: int(ch.hr, HAIRS), jk: int(ch.jk, JACKETS), sh: ch.sh ? 1 : 0, bd: ch.bd ? 1 : 0, sp: '' };
  if ([out.lk, out.sk, out.hr, out.jk].some(v => v === null)) return null;
  if (ch.sp) { if (!SPECIAL_IDS.includes(ch.sp)) return null; out.sp = ch.sp; }
  return out;
}
// Why this player can't wear this character, or '' if they can.
function wearError(u, ch, clubActive) {
  if (CLUB_LOOKS.includes(ch.lk) || CLUB_JACKETS.includes(ch.jk)) { if (!clubActive) return 'That look comes with Pro Pass'; }
  if (ch.sp && !(u.specials || []).includes(ch.sp)) return 'That one has to be given to you';
  return '';
}
function randomLook() {
  const r = n => Math.floor(Math.random() * n);
  return { lk: r(8), sk: r(SKINS), hr: r(HAIRS), jk: r(8), sh: r(5) === 0 ? 1 : 0, bd: r(4) === 0 ? 1 : 0, sp: '' };
}

module.exports = { LOOKS, CLUB_LOOKS, SKINS, HAIRS, JACKETS, CLUB_JACKETS, SPECIALS, SPECIAL_IDS, cleanLook, wearError, randomLook };
