'use strict';
/* Pokr web client. The server holds the truth; this file only draws what it's told and sends intents. */

// 0-15 free, 16-21 Pro Pass, 22-27 avatar shop (mirrors server/shop.js)
const AVATARS = ['🦊', '🐻', '🐼', '🦁', '🐯', '🐸', '🐵', '🦉', '🐙', '🦈', '🐺', '🐰', '🦄', '🐲', '👽', '🤠', '🦩', '🐆', '🦚', '🎩', '👑', '🃏', '🐞', '🦖', '🐊', '🦅', '🐋', '🦂'];
const COLORS = ['#C8202B', '#D9A84E', '#2E8F86', '#3E5FB0', '#8E3FA0', '#D0456E', '#5E9A4E', '#7A6A62'];
const REACTIONS = ['👍', '😂', '🔥', '😱', '💀', '👏', '🤡', '💰'];
// blinds in cents, matching the server
const STAKES = [['5-10', 5, 10], ['10-25', 10, 25], ['25-50', 25, 50], ['50-100', 50, 100], ['100-200', 100, 200], ['200-500', 200, 500]];
const SUIT_NAME = ['spades', 'hearts', 'diamonds', 'clubs'];
const SUIT_SVG = [
  '<path d="M12 2C12 2 4 9 4 13.5C4 16 6 18 8.5 18C10 18 11.2 17.3 11.6 16.5L10.3 22H13.7L12.4 16.5C12.8 17.3 14 18 15.5 18C18 18 20 16 20 13.5C20 9 12 2 12 2Z"/>',
  '<path d="M12 21C12 21 3 14.5 3 8.5C3 5.5 5.3 3.5 8 3.5C9.8 3.5 11.2 4.5 12 6C12.8 4.5 14.2 3.5 16 3.5C18.7 3.5 21 5.5 21 8.5C21 14.5 12 21 12 21Z"/>',
  '<path d="M12 2L19 12L12 22L5 12Z"/>',
  '<circle cx="12" cy="7.5" r="4.3"/><circle cx="7" cy="13.5" r="4.3"/><circle cx="17" cy="13.5" r="4.3"/><rect x="9" y="8" width="6" height="7"/><path d="M11 13L9.5 22H14.5L13 13Z"/>',
];
const ICON = {
  felt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="2.5" y="6" width="19" height="12" rx="6"/><rect x="6" y="9" width="12" height="6" rx="3" opacity=".5"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M5 6.5C5 5.67 5.67 5 6.5 5h11c.83 0 1.5.67 1.5 1.5v8c0 .83-.67 1.5-1.5 1.5H10l-4 3v-3h.5C5.67 16 5 15.33 5 14.5v-8Z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 8h14M5 12h14M5 16h14"/></svg>',
  invite: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/></svg>',
  lobby: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 6v12M15 6v12"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M8 5l11 7-11 7V5Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  stand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l4-4-4-4M14 12H4"/></svg>',
};

const $ = s => document.querySelector(s);
const app = $('#app');
// the wordmark: "pokr" where the o is a poker chip
const LOGO = 'p<span class="chip-o" aria-hidden="true"></span>kr';

// Opening animation: chips fly in, the wordmark sets with the chip dropping in as the o,
// then everything clears. Tap to skip; skipped entirely for reduced-motion.
(function splash() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  try { if (sessionStorage.getItem('pokr.splashed')) return; sessionStorage.setItem('pokr.splashed', '1'); } catch { /* storage blocked: show it */ }
  // The letters spiral in, a ring of chips spirals onto the o and collapses into one chip, the chip flips.
  const el = document.createElement('div');
  el.id = 'splash';
  el.setAttribute('aria-hidden', 'true');
  const letter = (ch, a, d) => `<span class="sp-l" style="--a:${a}deg;--d:${d}ms">${ch}</span>`;
  el.innerHTML = `<div class="sp-logo logo">${letter('p', 470, 60)}<span class="chip-o sp-o"></span>${letter('k', -430, 150)}${letter('r', 520, 230)}</div><div class="sp-chips"></div>`;
  document.body.appendChild(el);

  // Center the chip vortex on the o.
  const oEl = el.querySelector('.sp-o'), o = oEl.getBoundingClientRect(), size = oEl.offsetWidth; // offsetWidth ignores the chip's starting scale
  const ring = el.querySelector('.sp-chips');
  ring.style.left = (o.left + o.width / 2) + 'px';
  ring.style.top = (o.top + o.height / 2) + 'px';
  const colors = ['#C8202B', '#F4ECDC', '#2E8F86', '#151010', '#3E5FB0', '#D9A84E'];
  const N = 14, DUR = 1050, landings = [];
  let chips = '';
  for (let i = 0; i < N; i++) {
    const a0 = Math.round(i * 360 / N + Math.random() * 18);
    const d = Math.round(40 + i * 24 + Math.random() * 40);
    landings.push(d + DUR);
    chips += `<i style="--a0:${a0}deg;--a1:${a0 + 640 + Math.round(Math.random() * 120)}deg;--R:${(62 + Math.random() * 18).toFixed(1)}vmax;--s:${size}px;--c:${colors[i % colors.length]};--d:${d}ms"></i>`;
  }
  ring.innerHTML = chips;

  // Chip clacks, synthesized so there's no sound file to load. Browsers only allow sound after a tap,
  // so on a cold open this is usually silent; a tap during the splash turns it on.
  let ctx = null;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ }
  const clack = (when, loud = 1) => {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + Math.max(0, when) / 1000;
    const len = Math.floor(ctx.sampleRate * .05), buf = ctx.createBuffer(1, len, ctx.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600 + Math.random() * 1600; bp.Q.value = 3;
    const g = ctx.createGain(); g.gain.value = .55 * loud;
    src.connect(bp).connect(g).connect(ctx.destination); src.start(t);
    const tone = ctx.createOscillator(), tg = ctx.createGain();
    tone.frequency.value = 1900 + Math.random() * 900; tg.gain.setValueAtTime(.08 * loud, t); tg.gain.exponentialRampToValueAtTime(.0001, t + .07);
    tone.connect(tg).connect(ctx.destination); tone.start(t); tone.stop(t + .08);
  };
  const t0 = performance.now();
  const FLIP = 2330; // when the flipped chip lands
  const playFrom = () => {
    const now = performance.now() - t0;
    landings.forEach(ms => { if (ms > now) clack(ms - now, .7); });
    if (FLIP > now) { clack(FLIP - now, 1.2); clack(FLIP - now + 45, .8); }
  };
  if (ctx) { if (ctx.state === 'running') playFrom(); else ctx.resume().then(() => { if (performance.now() - t0 < 300) playFrom(); }).catch(() => {}); }

  const done = () => { if (!el.isConnected) return; el.classList.add('gone'); setTimeout(() => { el.remove(); if (ctx) ctx.close().catch(() => {}); }, 420); };
  el.addEventListener('click', () => {
    if (ctx && ctx.state !== 'running' && performance.now() - t0 < FLIP) { ctx.resume().then(playFrom).catch(() => {}); return; }
    done();
  });
  setTimeout(done, 3000);
})();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// all amounts are whole cents; show them as dollars
const money = c => { const d = (c || 0) / 100; return '$' + d.toLocaleString('en-US', Number.isInteger(d) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
const inTourneyTable = () => S.view === 'table' && S.table && !!S.table.tourney;
const fmt = c => (inTourneyTable() ? Number(c || 0).toLocaleString('en-US') : money(c));
const signedMoney = n => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));
const signed = signedMoney;
// Big numbers styled like chip values: a chip, a small $, bold dollars, small cents.
function chipNum(c, cls = '') {
  if (inTourneyTable()) return `<span class="cv ${cls}">${Number(c || 0).toLocaleString('en-US')}</span>`;
  const neg = (c || 0) < 0, d = Math.abs(c || 0) / 100;
  const [w, f] = d.toFixed(2).split('.');
  const whole = Number(w).toLocaleString('en-US');
  return `<span class="cv ${cls}" aria-label="${neg ? 'minus ' : ''}${money(Math.abs(c || 0))}"><i class="cv-chip" aria-hidden="true"></i><span aria-hidden="true">${neg ? '−' : ''}<span class="cv-d">$</span>${whole}${f !== '00' ? `<span class="cv-c">.${f}</span>` : ''}</span></span>`;
}
// A stack of chips whose height follows the amount (log scale, so $5 and $5,000 both look right).
const STACK_COLORS = ['#C8202B', '#F4ECDC', '#2E8F86', '#3E5FB0', '#151010', '#D9A84E'];
function chipStack(c, { max = 12, unit = 100, cols = 1, cls = '' } = {}) {
  const n = c > 0 ? Math.max(1, Math.min(max, Math.round(Math.log10(c / unit + 1) * 4))) : 0;
  const per = Math.ceil(n / cols);
  let html = '';
  for (let k = 0; k < cols; k++) {
    const h = Math.max(0, Math.min(per, n - k * per));
    if (!h) continue;
    html += `<span class="col">${Array.from({ length: h }, (_, i) => `<i style="--c:${STACK_COLORS[(k * 2 + Math.floor(i / 3)) % STACK_COLORS.length]};--i:${i}"></i>`).join('')}</span>`;
  }
  return `<span class="cstack ${cls}" style="--n:${per}" aria-hidden="true">${html}</span>`;
}
const count = n => Number(n || 0).toLocaleString('en-US');
const blindAmt = c => (c < 100 ? c + '¢' : money(c));
const blinds = (sb, bb) => `${blindAmt(sb)}/${blindAmt(bb)}`;
const isWide = () => matchMedia('(min-width: 700px)').matches;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

const S = {
  view: 'boot', me: null, lobby: null, table: null, tableAt: 0, chat: [], token: store.get('pokr.token'),
  raiseTo: 0, actionKey: '', sideTab: 'chat', stakes: '10-25', period: store.get('pokr.period') || 'day', isPrivate: false, chatOpen: false, menuOpen: false, unread: false,
  draft: Math.floor(Math.random() * AVATARS.length),
};

// With a name, avatars render as a quiet monogram on a toned disc (the serious look);
// the emoji set is only used in the picker for now.
const TONES = ['#5A3A36', '#5B4A2E', '#2F4A44', '#33405A', '#463A55', '#563945', '#3C4A35', '#46403B'];
function initials(name) { const w = String(name || '?').trim().split(/\s+/); return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase(); }
// At the table everyone is a poker chip with their initials on it.
function chipAvatar(av, name) {
  return `<span class="cava" style="--tone:${TONES[(av && av.c) || 0]}" aria-hidden="true"><b>${esc(initials(name))}</b></span>`;
}
// At the table everyone is a drawn character: a bust with a look picked from their name.
// Eight looks, five skin tones, eight jacket colours. Original art, drawn in SVG.
const SKIN = ['#F2CBA8', '#DDAA82', '#B57D57', '#8C5B3D', '#5F3D29'];
const JACKET = ['#3D5A80', '#8E3B46', '#2F6F5E', '#6B4E9B', '#A86F2C', '#3A3D45', '#7A2E2E', '#2E5E8E', '#C9A04A', '#E9E6E0'];
const HAIR = ['#1E1712', '#3B2516', '#6B4423', '#A9742F', '#D8C3A0', '#2B2B30', '#7A2F24'];
const DOTC = ['#E07A5F', '#E9B44C', '#3FB28C', '#5B8DEF', '#A77BDB', '#E26D9A', '#8DBF5A', '#C9A86A'];
// Must match server/looks.js
const LOOK_NAMES = ['Short hair', 'Cap', 'Beanie', 'Hood', 'Top hat', 'Headphones', 'Long hair', 'Top knot', 'Cowboy hat', 'Fedora', 'Bandana'];
const CLUB_LOOKS = [8, 9, 10], CLUB_JACKETS = [8, 9];
const SPECIALS = [
  { id: 'crown', name: 'The Crown', blurb: 'A gold crown and a royal robe' },
  { id: 'shark', name: 'Shark', blurb: 'For the one who eats the table' },
  { id: 'diamond', name: 'Diamond Hands', blurb: 'Ice shades, white suit, gold chain' },
  { id: 'flame', name: 'Hot Streak', blurb: 'On fire, literally' },
  { id: 'astro', name: 'Moonshot', blurb: 'A helmet for the long shot' },
  { id: 'gold', name: 'Gold Plate', blurb: 'All gold, name plate included' },
  { id: 'princess', name: 'Princess', blurb: 'A tiara, long hair and a pink gown' },
];
function hashStr(s) { let h = 2166136261; for (const ch of String(s || '?')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
// The character someone has picked, or (for bots and old profiles) one chosen from their name.
function lookOf(av, name) {
  if (av && av.ch) return av.ch;
  const h = hashStr(name);
  return { lk: (h >>> 15) % 8, sk: (h >>> 3) % SKIN.length, hr: (h >>> 7) % HAIR.length, jk: ((av && av.c) || 0) % 8, sh: ((h >>> 19) % 5) === 0 ? 1 : 0, bd: ((h >>> 22) % 4) === 0 ? 1 : 0, sp: '' };
}
const specialOf = av => (av && av.ch && av.ch.sp) || '';
// A gold star after the name for anyone made VIP.
const vipStar = av => (av && av.vip ? '<span class="vipstar" role="img" aria-label="VIP">★</span>' : '');
function portrait(av, name, cls = '') { return drawLook(lookOf(av, name), cls); }
function drawLook(ch, cls = '') {
  const seed = ch.jk * 7 + ch.hr * 3 + ch.sk + ch.lk * 11;
  const pick = (arr, k) => arr[(seed + k) % arr.length];
  const sp = ch.sp || '';
  const skin = SKIN[ch.sk] || SKIN[0], hair = HAIR[ch.hr] || HAIR[0];
  let jk = JACKET[ch.jk] || JACKET[0];
  if (sp === 'crown') jk = '#5B2A86'; else if (sp === 'diamond' || sp === 'astro') jk = '#EDEFF3'; else if (sp === 'flame') jk = '#B3261E'; else if (sp === 'gold') jk = '#C9A04A'; else if (sp === 'shark') jk = '#5E6B78'; else if (sp === 'princess') jk = '#E26D9A';
  const look = ch.lk, shades = ch.sh || sp === 'diamond', beard = ch.bd && look !== 3 && sp !== 'astro';
  const dark = 'rgba(0,0,0,.22)';
  let body = `<path d="M5 64c1.5-13 11.5-20.5 27-20.5S57.5 51 59 64Z" fill="${jk}"/><path d="M32 43.5c-9 0-16 2.6-20.5 7.6L15 64h17Z" fill="${dark}"/><path d="M24.5 44.5 32 53l7.5-8.5c-2-.7-4.7-1-7.5-1s-5.5.3-7.5 1Z" fill="#ECE8E1"/><path d="M27 44.2 32 53l5-8.8" fill="none" stroke="${dark}" stroke-width="1.2"/>`;
  if (sp === 'crown') body += `<path d="M10 54c6-6 14-8.5 22-8.5S48 48 54 54" stroke="#F4F1EA" stroke-width="4" fill="none"/><circle cx="18" cy="51" r="1" fill="#222"/><circle cx="46" cy="51" r="1" fill="#222"/><path d="M8 60c7-7 15-9.5 24-9.5S49 53 56 60" stroke="#E2B33C" stroke-width="1.4" fill="none"/>`;
  if (sp === 'diamond') body += `<path d="M22 46c2 7 6 10 10 10s8-3 10-10" stroke="#E2B33C" stroke-width="2" fill="none" stroke-dasharray="2 1.2"/><path d="M32 55.5l2.4 3-2.4 3-2.4-3Z" fill="#9FE6FF" stroke="#fff" stroke-width=".6"/>`;
  if (sp === 'gold') body += `<path d="M24 50h16" stroke="#8A6A1E" stroke-width="1"/><circle cx="32" cy="57" r="2.4" fill="#F4D77A" stroke="#8A6A1E" stroke-width=".8"/>`;
  if (sp === 'princess') body += `<path d="M18 47.5c4 3 9 4.6 14 4.6s10-1.6 14-4.6" stroke="#F7B6CF" stroke-width="2.4" fill="none"/><circle cx="24" cy="57" r="1.1" fill="#FFE3EE"/><circle cx="32" cy="59" r="1.1" fill="#FFE3EE"/><circle cx="40" cy="57" r="1.1" fill="#FFE3EE"/><path d="M27.5 48.5 32 52l4.5-3.5" fill="none" stroke="#E2B33C" stroke-width="1.2"/><circle cx="32" cy="53.4" r="1.6" fill="#9FE6FF" stroke="#fff" stroke-width=".5"/>`;
  if (sp === 'astro') body += `<rect x="25" y="52" width="14" height="8" rx="2" fill="#C8CDD6"/><circle cx="29" cy="56" r="1.4" fill="#E0544B"/><circle cx="34" cy="56" r="1.4" fill="#3FB28C"/>`;
  const neck = `<rect x="27" y="35" width="10" height="11" rx="4" fill="${skin}"/><rect x="27" y="35" width="10" height="5" fill="${dark}"/>`;
  const head = `<ellipse cx="32" cy="27" rx="12.5" ry="13.5" fill="${skin}"/><path d="M38 14.6c4.4 2.2 6.5 6.7 6.5 12.4S42.4 37.2 38 39.4c2.6-3 3.6-7.4 3.6-12.4S40.6 17.6 38 14.6Z" fill="${dark}"/><ellipse cx="19.6" cy="28.5" rx="1.8" ry="2.8" fill="${skin}"/><ellipse cx="44.4" cy="28.5" rx="1.8" ry="2.8" fill="${skin}"/>`;
  const lens = sp === 'diamond' ? '#7FDCFF' : '#111';
  const face = shades
    ? `<rect x="21" y="24.5" width="22" height="6.5" rx="3.2" fill="${lens}"/><path d="M23 26h5" stroke="#fff" stroke-opacity=".6" stroke-width="1.2" stroke-linecap="round"/>`
    : `<path d="M24.5 23.4q3-1.6 5.5 0M34 23.4q2.6-1.6 5.5 0" stroke="${hair}" stroke-width="1.6" fill="none" stroke-linecap="round"/><ellipse cx="27.4" cy="27.6" rx="1.6" ry="2" fill="#1B1512"/><ellipse cx="36.6" cy="27.6" rx="1.6" ry="2" fill="#1B1512"/><circle cx="27.9" cy="27" r=".5" fill="#fff"/><circle cx="37.1" cy="27" r=".5" fill="#fff"/>`;
  const mouth = `<path d="M28.6 33.6q3.4 2.2 6.8 0" stroke="#6E3B2A" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
  const beardP = beard ? `<path d="M19.8 29c.8 9.4 6 13.3 12.2 13.3S43.4 38.4 44.2 29c-2.6 4.2-6.4 5.6-12.2 5.6S22.4 33.2 19.8 29Z" fill="${hair}"/><path d="M28.6 34q3.4 1.8 6.8 0" stroke="#000" stroke-opacity=".35" stroke-width="1.3" fill="none" stroke-linecap="round"/>` : '';
  const shortHair = `<path d="M19.4 27c-.6-10 5.4-15.4 12.6-15.4S45.2 17 44.6 27c-1.8-5.4-5.6-8.6-12.6-8.6S21.2 21.6 19.4 27Z" fill="${hair}"/>`;
  let back = '', top = '', faceOverride = '', front = '';
  if (look === 0) top = shortHair;
  else if (look === 1) { const c = pick(JACKET.slice(0, 8), 5); top = `<path d="M19 24.5c0-8.4 6-13 13-13s13 4.6 13 13Z" fill="${c}"/><path d="M29 23h21.5c0 2.3-2.2 3.6-5.4 3.6H29Z" fill="${c}"/><path d="M29 23h21.5c0 2.3-2.2 3.6-5.4 3.6H29Z" fill="${dark}"/><circle cx="32" cy="11.6" r="1.5" fill="${dark}"/>`; }
  else if (look === 2) { const c = pick(DOTC, 5); top = `<path d="M18.6 25.5c0-9.2 6-14.6 13.4-14.6s13.4 5.4 13.4 14.6Z" fill="${c}"/><path d="M22 15v9M26 12.6v11.4M30 11.4V24M34 11.4V24M38 12.6v11.4M42 15v9" stroke="${dark}" stroke-width="1"/><rect x="17.6" y="21.6" width="28.8" height="5.4" rx="2.7" fill="${c}"/><rect x="17.6" y="21.6" width="28.8" height="5.4" rx="2.7" fill="${dark}"/><circle cx="32" cy="9.6" r="3.2" fill="${c}"/>`; }
  else if (look === 3) {
    back = `<path d="M13 42c-3-19 5.6-32 19-32s22 13 19 32c-4.4 3.6-11 5.4-19 5.4S17.4 45.6 13 42Z" fill="${jk}"/><path d="M13 42c-3-19 5.6-32 19-32 -9 3-14 15-12.6 33Z" fill="${dark}"/>`;
    faceOverride = `<ellipse cx="32" cy="29" rx="10.4" ry="11.6" fill="#0E0E12"/><path d="M24.6 27.4l5.4 1.6-5 1.2Z M39.4 27.4l-5.4 1.6 5 1.2Z" fill="${pick(['#FFFFFF', '#7FE3FF', '#FFD36B', '#FF7A7A'], 9)}"/>`;
  }
  else if (look === 4) top = `${shortHair}<rect x="21.5" y="1.5" width="21" height="15" rx="2" fill="#16161A"/><rect x="21.5" y="11" width="21" height="2.8" fill="${pick(DOTC, 9)}"/><rect x="16" y="14.6" width="32" height="3.6" rx="1.8" fill="#16161A"/>`;
  else if (look === 5) { const c = pick(DOTC, 9); top = `${shortHair}<path d="M17.4 28a14.6 14.6 0 0 1 29.2 0" stroke="#1E1E22" stroke-width="2.8" fill="none"/><rect x="14.4" y="24" width="6.6" height="11" rx="3.3" fill="${c}"/><rect x="43" y="24" width="6.6" height="11" rx="3.3" fill="${c}"/>`; }
  else if (look === 6) { back = `<path d="M18.2 31c-1.2-13.4 5-20 13.8-20s15 6.6 13.8 20l1.4 13H16.8Z" fill="${hair}"/>`; top = `<path d="M19.4 26c0-9.6 5.6-14.6 12.6-14.6S44.6 16.4 44.6 26c-3-5.6-8-7.4-13.6-6.8-4.6.5-8.6 2.8-11.6 6.8Z" fill="${hair}"/>`; }
  else if (look === 7) top = `${shortHair}<circle cx="32" cy="10.2" r="5.2" fill="${hair}"/>`;
  else if (look === 8) top = `${shortHair}<path d="M6 21.5c4 3 14 4.4 26 4.4s22-1.4 26-4.4c-2 4.4-12 7-26 7S8 25.9 6 21.5Z" fill="#7A4E2A"/><path d="M19 22c-.4-6 1.6-12.6 6.4-12.6 2.4 0 4 2 6.6 2s4.2-2 6.6-2c4.8 0 6.8 6.6 6.4 12.6-3.6 1.4-8.4 2-13 2s-9.4-.6-13-2Z" fill="#8E5E34"/><path d="M19.6 19.6c3.6 1.2 8 1.8 12.4 1.8s8.8-.6 12.4-1.8" stroke="#3B2414" stroke-width="2"/>`;
  else if (look === 9) top = `${shortHair}<path d="M10.5 21.4c4 2.4 12 3.4 21.5 3.4s17.5-1 21.5-3.4c-1.4 3.2-10 5.4-21.5 5.4s-20.1-2.2-21.5-5.4Z" fill="#2A2A30"/><path d="M18.5 22c0-7.4 3.6-12 13.5-12s13.5 4.6 13.5 12c-3.6 1.2-8.4 1.8-13.5 1.8s-9.9-.6-13.5-1.8Z" fill="#33333A"/><path d="M27 11q5 3 10 0" stroke="#1C1C20" stroke-width="1.4" fill="none"/><path d="M18.8 19.4c3.6 1.2 8.2 1.8 13.2 1.8s9.6-.6 13.2-1.8" stroke="${pick(DOTC, 3)}" stroke-width="2.2"/>`;
  else if (look === 10) { const c = pick(['#B3261E', '#2E5E8E', '#1E1E22', '#2F6F5E'], 4); top = `<path d="M19 24c0-8.6 6-13.4 13-13.4S45 15.4 45 24c-3.6-1.6-8-2.4-13-2.4S22.6 22.4 19 24Z" fill="${c}"/><path d="M22 15.5h.01M28 13h.01M35 13h.01M41 15.5h.01M25 19h.01M32 17h.01M39 19h.01" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".7"/><path d="M44 21c3 0 6 1 7 3-2 .4-4 0-6-1.4Z" fill="${c}"/>`; }
  // specials draw over the look
  if (sp === 'crown') top = `${shortHair}<path d="M20 18 22 6l5.5 6.4L32 3.5l4.5 8.9L42 6l2 12Z" fill="#E2B33C" stroke="#8A6A1E" stroke-width=".8"/><rect x="20" y="16" width="24" height="4" rx="1.2" fill="#C9962A"/><circle cx="32" cy="9.5" r="1.6" fill="#D23A2F"/><circle cx="25.4" cy="13" r="1.1" fill="#3FB28C"/><circle cx="38.6" cy="13" r="1.1" fill="#5B8DEF"/>`;
  if (sp === 'shark') {
    back = `<path d="M11 44c-4-21 6-34 21-34s25 13 21 34c-5 3-12 4.4-21 4.4S16 47 11 44Z" fill="#6E7B88"/><path d="M28 11.4 35 1l3.4 12Z" fill="#5E6B78"/><path d="M11 44c-4-21 6-34 21-34 -10 3-16 16-14 36Z" fill="${dark}"/>`;
    front = `<path d="M19.6 20.4c4-3.4 8-4.6 12.4-4.6s8.4 1.2 12.4 4.6" stroke="#6E7B88" stroke-width="4" fill="none"/><path d="M20.6 19.6l2.2 3.2 2.2-3.8 2.2 3.4 2.4-3.8 2.4 3.6 2.4-3.6 2.4 3.8 2.2-3.4 2.2 3.8 2.2-3.2" fill="#fff" stroke="#fff" stroke-width=".6" stroke-linejoin="round"/>`;
  }
  if (sp === 'princess') {
    back = `<path d="M17.6 31c-1.4-13.6 5-20.4 14.4-20.4S47.8 17.4 46.4 31l2 15H15.6Z" fill="${hair}"/><path d="M17.6 31c-1.4-13.6 5-20.4 14.4-20.4 -7 1.6-11.6 8-11 19l-1 17h-4.4Z" fill="${dark}"/>`;
    top = `<path d="M19.4 26c0-9.6 5.6-14.6 12.6-14.6S44.6 16.4 44.6 26c-2.6-4.8-7.4-7.6-12.6-7.6S22 21.2 19.4 26Z" fill="${hair}"/><path d="M22.4 15.4 25 9.6l3 4 4-6.8 4 6.8 3-4 2.6 5.8c-2.8 1.2-6 1.8-9.6 1.8s-6.8-.6-9.6-1.8Z" fill="#E8EAF0" stroke="#A9AEB8" stroke-width=".6"/><circle cx="32" cy="10" r="1.7" fill="#F06AA0"/><circle cx="25.2" cy="11.6" r=".9" fill="#9FE6FF"/><circle cx="38.8" cy="11.6" r=".9" fill="#9FE6FF"/><circle cx="19.8" cy="32.6" r="1.1" fill="#F7E7A0"/><circle cx="44.2" cy="32.6" r="1.1" fill="#F7E7A0"/>`;
  }
  if (sp === 'flame') top = `<path d="M18.6 26c-2-9 1-13 3.4-15.6.2 3 1.4 4.8 3 5.6-.4-5 1.6-9.6 5.4-12 0 3.6 1.4 6 3.6 7 0-3 1.2-5.6 3.4-7 .6 3.4 2.4 5 4 6.4 1.6-1.6 2.4-3.6 2.4-5.8 2.6 3.6 4.4 9.6 2.6 15.4-2.6-4-7-6-12.4-6s-9.8 2-15.4 6Z" fill="#F08A24"/><path d="M23 22c.4-4 2-6.6 4-8 .2 2.2 1 3.6 2.4 4.2.2-3 1.6-5.6 3.6-7 .2 2.6 1.4 4.6 3.4 5.6.8-1.4 1.2-2.8 1.2-4.4 2.2 2.4 3.4 6 2.4 9.6-2.8-1.6-6-2.4-9-2.4s-5.2.6-8 2.4Z" fill="#FFD34A"/>`;
  if (sp === 'astro') {
    back = `<circle cx="32" cy="28" r="20" fill="#E9ECF1"/><circle cx="32" cy="28" r="20" fill="none" stroke="#B8BEC8" stroke-width="1.6"/>`;
    front = `<path d="M17.4 27.6a14.6 14.8 0 0 1 29.2 0c0 3-1 5-2.4 6.4H19.8c-1.4-1.4-2.4-3.4-2.4-6.4Z" fill="#7FB2FF" opacity=".22"/><path d="M21 21c2-3 5-4.6 8.4-5" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".8"/><rect x="45" y="22" width="4" height="9" rx="2" fill="#C8CDD6"/>`;
  }
  if (sp === 'shark' || sp === 'astro' || sp === 'princess') faceOverride = '';
  const faceBits = faceOverride || `${face}${mouth}${beardP}`;
  const hairTop = sp === 'astro' ? shortHair : sp === 'shark' ? '' : top;
  return `<svg class="por ${cls}" viewBox="9 3 46 61" aria-hidden="true">${back}${body}${neck}${head}${faceBits}${hairTop}${front}</svg>`;
}
// A short stack of chips for a bet: more chips and a richer colour for bigger bets.
function chipStack(amount, bb) {
  const r = bb ? amount / bb : 1;
  const col = r < 1 ? '#E8E4DC' : r < 5 ? '#C8372D' : r < 25 ? '#2F8F5B' : r < 100 ? '#2A2A30' : '#7B4FC0';
  const n = Math.max(1, Math.min(4, Math.ceil(Math.log2(r + 1))));
  let g = '';
  for (let i = 0; i < n; i++) {
    const y = 15 - i * 3.4;
    g += `<g><ellipse cx="11" cy="${y + 1.6}" rx="9" ry="3.4" fill="#000" opacity=".35"/><ellipse cx="11" cy="${y}" rx="9" ry="3.4" fill="${col}"/><path d="M2 ${y}v1.4c0 1.9 4 3.4 9 3.4s9-1.5 9-3.4V${y}" fill="${col}"/><path d="M2 ${y}v1.4c0 1.9 4 3.4 9 3.4s9-1.5 9-3.4V${y}" fill="#000" opacity=".25"/><path d="M5 ${y + 2.2}v1.2M11 ${y + 3}v1.3M17 ${y + 2.2}v1.2" stroke="#fff" stroke-width="1.3" opacity=".85"/><ellipse cx="11" cy="${y}" rx="5.4" ry="1.9" fill="none" stroke="#fff" stroke-width=".8" stroke-dasharray="1.6 1.4" opacity=".7"/></g>`;
  }
  return `<svg class="cstack" viewBox="0 0 22 21" aria-hidden="true">${g}</svg>`;
}
function avatarHTML(av, name) {
  if (name) return `<span class="ava pava ${specialOf(av) ? 'vip' : ''}" style="--tone:${TONES[(av && av.c) || 0]}" aria-hidden="true">${portrait(av, name)}</span>`;
  if (name) return `<span class="ava mono" style="--tone:${TONES[(av && av.c) || 0]}" aria-hidden="true">${esc(initials(name))}</span>`;
  const glyph = av && av.a >= 0 ? AVATARS[av.a] : '🤖';
  return `<span class="ava" style="--ac:${COLORS[(av && av.c) || 0]}" aria-hidden="true">${glyph}</span>`;
}
// Clean white cards (four-color ink): a big rank top-left, a small suit under it, a big suit bottom-right.
// Easy to read at any size, which matters more than decoration when money is on the line.
function cardHTML(c, cls = '', style = '') {
  const st = style ? ` style="${style}"` : '';
  if (c === undefined) return `<div class="pc empty ${cls}" aria-hidden="true"></div>`;
  if (c === null) return `<div class="pc back ${cls}"${st} aria-label="Face-down card"><i class="bk-mark"></i></div>`;
  const r = c % 13 + 2, s = Math.floor(c / 13);
  const rt = { 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[r] || String(r);
  const suit = `<svg viewBox="0 0 24 24">${SUIT_SVG[s]}</svg>`;
  return `<div class="pc face s${s} r${rt} ${cls}"${st} role="img" aria-label="${rt} of ${SUIT_NAME[s]}"><span class="cr">${rt}</span><span class="cs">${suit}</span><span class="cb">${suit}</span></div>`;
}
// toast with an optional fix-it action: toast('Not enough money', ['Cashier', () => renderCashier('deposit')])
function toast(text, action) {
  const d = document.createElement('div');
  const t = document.createElement('span'); t.textContent = text; d.appendChild(t);
  if (action) {
    const b = document.createElement('button'); b.textContent = action[0];
    b.onclick = () => { d.remove(); action[1](); };
    d.appendChild(b); d.classList.add('has-action');
  }
  $('#toast').appendChild(d);
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 250); }, action ? 5200 : 2800);
}
// a fix for common server errors, so nobody is left stranded
function errorAction(msg) {
  if (/bankroll|balance|enough/i.test(msg) && S.view !== 'cashier') return ['Cashier', () => renderCashier('deposit')];
  if (/Pro Pass/i.test(msg)) return ['See Pro Pass', () => renderClub()];
  return null;
}
// screen-to-screen transition, only when the screen actually changes
function enter() {
  const key = S.view;
  if (key === S.lastPainted) return;
  S.lastPainted = key;
  const el = app.firstElementChild;
  if (el) el.classList.add('enter');
  window.scrollTo(0, 0);
}
// a tiny tap of feedback on phones that support it
const skelRows = n => `<div class="rows">${Array.from({ length: n }, () => '<div class="trow"><span class="skel" style="width:28px;height:28px;border-radius:50%"></span><div class="txt" style="gap:6px"><span class="skel" style="width:55%;height:12px"></span><span class="skel" style="width:35%;height:10px"></span></div></div>').join('')}</div>`;
function buzz(ms = 8) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* not supported */ } }
async function copy(text) { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } }

/* ---------------- connection ---------------- */
let ws, retry = 0;
function connect() {
  const Sock = window.PokrSocket || WebSocket; // the in-Claude preview swaps in a local, bots-only server
  ws = new Sock((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
  ws.onopen = () => { retry = 0; $('#conn').hidden = true; S.rejoin = S.view === 'table'; send({ t: 'hello', token: S.token }); };
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } onMessage(m); };
  ws.onclose = () => {
    if (S.view !== 'boot') $('#conn').hidden = false;
    clearTimeout(S.retryTimer);
    S.retryTimer = setTimeout(connect, Math.min(8000, 400 * 2 ** retry++));
  };
}
function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }

function onMessage(m) {
  switch (m.t) {
    case 'needProfile': S.me = null; document.body.dataset.skin = 'lounge'; closeChat(); renderAuth(store.get('pokr.hadAccount') ? 'login' : 'signup'); break;
    case 'authError': showAuthError(m.message); break;
    case 'catalog': S.catalog = m.catalog; break;
    case 'notice': toast(m.message); break;
    case 'adminUsers': S.adminList = m.list; if (S.view === 'admin') { const q = $('#ad-q'), at = q && q.selectionStart; renderAdmin(); const q2 = $('#ad-q'); if (q && q2 && document.activeElement !== q2 && S.adminQ) { q2.focus(); q2.setSelectionRange(at, at); } } break;
    case 'tourneys': S.tourneys = m.list; if (S.view === 'tabs' && S.tab === 'tourneys') renderTabs(); break;
    case 'tourney': if (!S.tourView || m.d.id === S.tourView) { S.tour = m.d; if (S.view === 'tourney') renderTourney(m.d.id, true); } break;
    case 'tourneyHosted': renderTourney(m.id); break;
    case 'moved': { const T = S.table; nav('/t/' + m.code); toast(T && T.code !== m.code ? 'You’ve been moved to a new table' : 'Your seat is ready'); break; }
    case 'tourneyResult': showTourneyResult(m); break;
    case 'token': S.token = m.token; store.set('pokr.token', m.token); store.set('pokr.hadAccount', '1'); break;
    case 'me': {
      const entering = S.view === 'boot' || S.view === 'auth';
      S.me = m.user;
      document.body.dataset.skin = S.me.theme || 'lounge';
      document.body.dataset.felt = S.me.felt || 'green';
      if (entering) enterApp();
      else if (S.view === 'table') {
        if (S.rejoin) { S.rejoin = false; send({ t: 'join', code: S.table ? S.table.code : routeCode() }); }
        renderMine(true);
      } else if (S.view === 'tabs') renderTabs();
      else if (S.view === 'club') renderClub();
      else if (S.view === 'cashier') renderCashier();
      break;
    }
    case 'lobby': S.lobby = m; if (S.view === 'tabs' && (S.tab === 'play' || S.tab === 'social')) renderTabs(); else if (S.view === 'alltables') renderAllTables(); break;
    case 'created': nav('/t/' + m.code); joinCode(m.code); break;
    case 'state': {
      const fresh = S.view !== 'table' || !S.table || S.table.code !== m.s.code || !$('#stage');
      S.table = m.s; S.tableAt = performance.now();
      if (fresh) { S.view = 'table'; renderTableShell(); }
      renderTable();
      break;
    }
    case 'notFound': if (/^[A-Z0-9]{5}$/i.test(m.code || '') && S.triedTour !== m.code) { S.triedTour = m.code; nav('/', true); renderTourney(String(m.code).toUpperCase()); break; } toast('That table is closed or the code is wrong'); nav('/', true); goLobby(); break;
    case 'chat':
      if (m.reset) S.chat = [];
      S.chat.push(...m.items);
      if (S.chat.length > 80) S.chat.splice(0, S.chat.length - 80);
      if (!m.reset && !S.chatOpen && m.items.some(i => !S.me || i.userId !== S.me.id)) { S.unread = true; renderCorner(); }
      renderFeed();
      break;
    case 'react': showReaction(m); break;
    case 'error': if (S.view === 'tourney' && !S.tour) { toast('That code doesn’t match a table or tournament'); S.tourView = null; goLobby(); break; } toast(m.message, errorAction(m.message)); break;
  }
}

/* ---------------- routing ---------------- */
const PREVIEW = !!window.PokrSocket;
function nav(path, replace) { if (PREVIEW) return; if (replace) history.replaceState({}, '', path); else history.pushState({}, '', path); }
function routeCode() {
  if (PREVIEW) return null;
  const m = location.pathname.match(/^\/t\/([A-Za-z0-9]{3,8})/);
  return m ? m[1].toUpperCase() : null;
}
function enterApp() { const code = routeCode(); if (code) joinCode(code); else goLobby(); }
function joinCode(code) {
  S.view = 'table'; S.table = null; S.chat = []; S.actionKey = ''; S.chatOpen = false; S.menuOpen = false; S.unread = false;
  app.innerHTML = `<div class="tbl skel-table" aria-busy="true" aria-label="Joining table ${esc(code)}">
    <div class="tbar"><div class="skel" style="width:110px;height:34px"></div><div class="skel" style="width:88px;height:40px;border-radius:999px"></div></div>
    <div class="stage"><div class="rail skel"></div></div>
    <div class="mine"><div class="skel" style="height:56px"></div><div class="skel" style="height:44px;border-radius:999px"></div></div>
  </div>`;
  send({ t: 'join', code });
}
// stepping away from a table to another screen keeps your seat
function leaveTableView() { if (S.view === 'table') { send({ t: 'leave', keepSeat: true }); nav('/'); S.table = null; closeChat(); closeMenu(); } }
function goLobby() { S.table = null; closeChat(); send({ t: 'lobby' }); renderTabs(); }
function leaveTable() { send({ t: 'leave' }); nav('/'); S.table = null; closeChat(); renderTabs(); }
window.addEventListener('popstate', () => {
  const code = routeCode();
  if (code) joinCode(code);
  else if (S.view === 'table') { send({ t: 'leave' }); S.table = null; closeChat(); renderTabs(); }
});

/* ---------------- sign up / log in / profile ---------------- */
function canUseAvatar(i) {
  if (i < 16) return true;
  if (!S.me) return false;
  if (i < 22) return !!(S.me.club && S.me.club.active);
  return (S.me.ownedAvatars || []).includes(i);
}
function avatarGrid(all) {
  const list = AVATARS.map((g, i) => [g, i]).filter(([, i]) => all || i < 16);
  return `<div class="ava-grid">${list.map(([g, i]) => {
    const locked = !canUseAvatar(i);
    return `<button type="button" data-a="${i}" ${locked ? 'data-locked="1"' : ''} class="${locked ? 'locked' : ''}" aria-pressed="${i === S.draft}" style="--ac:${COLORS[i % 8]}" aria-label="Avatar ${i + 1}${locked ? ' (locked)' : ''}">${g}</button>`;
  }).join('')}</div>`;
}
function bindAvatarGrid() {
  app.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
    if (b.dataset.locked) { renderClub(); return; }
    S.draft = +b.dataset.a;
    app.querySelectorAll('[data-a]').forEach(x => x.setAttribute('aria-pressed', +x.dataset.a === S.draft));
  });
}
// Accounts (email + password) are off for now: players just pick a name. Flip this to true
// when accounts come back; they're required before any real money.
const ACCOUNTS = true;
function renderGuest() {
  S.view = 'auth';
  const fan = [12, 24, 36, 48].map((c, i) => cardHTML(c).replace('class="pc', `style="left:${22 + i * 44}px;top:${[4, 1, 1, 4][i] + 6}px;transform:rotate(${[-16, -5, 6, 17][i]}deg)" class="pc`)).join('');
  app.innerHTML = `
  <main class="welcome">
    <h1 class="logo xl" aria-label="Pokr">${LOGO}</h1>
    <p class="tagline">The card room for you and your friends.</p>
    <div class="fan" aria-hidden="true">${fan}</div>
    <form class="panel pf" id="auth" novalidate>
      <div class="field"><label class="lbl" for="au-name">Name at the table</label>
        <input id="au-name" maxlength="16" autocomplete="nickname" placeholder="What should the table call you?"></div>
      <p class="formerr" id="au-err" role="alert" hidden></p>
      <button class="btn primary" type="submit" id="au-go">Let’s play</button>
    </form>
    <p class="fine">Guests start with $1,000 in play money. Make an account to keep it on every device.</p>
    ${ACCOUNTS ? '<button type="button" class="textbtn guestlink" id="au-acct">Have an account? Log in</button>' : ''}
  </main>`;
  enter();
  $('#auth').onsubmit = e => {
    e.preventDefault();
    const name = $('#au-name').value.trim();
    if (name.length < 2) { const el = $('#au-err'); el.textContent = 'Pick a name with at least 2 characters'; el.hidden = false; return; }
    send({ t: 'guest', name, avatar: {} });
    $('#au-go').disabled = true;
  };
  const ac = $('#au-acct'); if (ac) ac.onclick = () => renderAuth('login');
  $('#au-name').focus();
}
function renderAuth(mode) {
  if (!ACCOUNTS) return renderGuest();
  S.view = 'auth'; S.authMode = mode;
  const fan = [12, 24, 36, 48].map((c, i) => cardHTML(c).replace('class="pc', `style="left:${22 + i * 44}px;top:${[4, 1, 1, 4][i] + 6}px;transform:rotate(${[-16, -5, 6, 17][i]}deg)" class="pc`)).join('');
  const signup = mode === 'signup';
  app.innerHTML = `
  <main class="welcome">
    <h1 class="logo xl" aria-label="Pokr">${LOGO}</h1>
    <p class="tagline">The card room for you and your friends.</p>
    <div class="fan" aria-hidden="true">${fan}</div>
    <form class="panel pf" id="auth" novalidate>
      <div class="seg2" role="tablist">
        <button type="button" role="tab" aria-selected="${signup}" data-mode="signup">Create account</button>
        <button type="button" role="tab" aria-selected="${!signup}" data-mode="login">Log in</button>
      </div>
      ${signup ? `<div class="field"><label class="lbl" for="au-name">Name at the table</label>
        <input id="au-name" maxlength="16" autocomplete="nickname" placeholder="What should the table call you?"></div>` : ''}
      <div class="field"><label class="lbl" for="au-email">Email</label>
        <input id="au-email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com"></div>
      <div class="field"><label class="lbl" for="au-pass">Password</label>
        <input id="au-pass" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" placeholder="${signup ? 'At least 8 characters' : 'Your password'}"></div>
      <p class="formerr" id="au-err" role="alert" hidden></p>
      <button class="btn primary" type="submit" id="au-go">${signup ? 'Create account' : 'Log in'}</button>
    </form>
    <p class="fine">${signup ? 'Your account keeps your balance, stats and character on any device. You get a character to start; change it any time.' : 'Play money only for now, no real money.'}</p>
    <button type="button" class="textbtn guestlink" id="au-guest">Just looking? Play as a guest</button>
  </main>`;
  enter();
  app.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => renderAuth(b.dataset.mode));
  $('#au-guest').onclick = () => renderGuest();
  $('#auth').onsubmit = e => {
    e.preventDefault();
    const email = $('#au-email').value.trim(), password = $('#au-pass').value;
    const err = msg => { const el = $('#au-err'); el.textContent = msg; el.hidden = false; };
    if (signup) {
      const name = $('#au-name').value.trim();
      if (name.length < 2) return err('Pick a name with at least 2 characters');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return err('Enter a valid email address');
      if (password.length < 8) return err('Use a password with at least 8 characters');
      send({ t: 'signup', name, email, password, avatar: {} });
    } else {
      if (!email || !password) return err('Enter your email and password');
      send({ t: 'login', email, password });
    }
    $('#au-go').disabled = true;
  };
  (signup ? $('#au-name') : $('#au-email')).focus();
}
function showAuthError(message) {
  const el = $('#au-err');
  if (!el) { toast(message); return; }
  el.textContent = message; el.hidden = false;
  const go = $('#au-go'); if (go) go.disabled = false;
}

// The character builder. For yourself: name and look, with Pro Pass parts locked unless you have it.
// For an admin dressing someone else: every part is open, and specials can be given or taken back.
function renderProfileEdit() { renderLookEditor({ self: true }); }
function renderLookEditor(opt) {
  const self = !!opt.self, target = opt.target || null;
  S.view = self ? 'profile-edit' : 'admin-player';
  const club = self ? !!(S.me.club && S.me.club.active) : true;
  const have = self ? (S.me.specials || []) : (target.specials || []);
  const D = S.lookDraft = { ...(self ? lookOf(S.me.avatar, S.me.name) : lookOf(target.avatar, target.name)) };
  const name = self ? S.me.name : target.name;
  const lockedLook = i => !club && CLUB_LOOKS.includes(i), lockedJk = i => !club && CLUB_JACKETS.includes(i);
  const swatch = (key, i, color, locked, label) => `<button type="button" class="swatch ${locked ? 'locked' : ''}" data-k="${key}" data-v="${i}" aria-pressed="${D[key] === i}" aria-label="${label}${locked ? ', Pro Pass' : ''}" style="--sw:${color}">${locked ? '<i aria-hidden="true">PRO</i>' : ''}</button>`;
  const lookBtn = i => `<button type="button" class="lookopt ${lockedLook(i) ? 'locked' : ''}" data-k="lk" data-v="${i}" aria-pressed="${D.lk === i}" aria-label="${LOOK_NAMES[i]}${lockedLook(i) ? ', Pro Pass' : ''}">${drawLook({ ...D, lk: i, sp: '' })}<span>${LOOK_NAMES[i]}</span>${lockedLook(i) ? '<i>PRO</i>' : ''}</button>`;
  const specialBtn = x => {
    const own = have.includes(x.id);
    if (self && !own) return '';
    return `<div class="specopt ${D.sp === x.id ? 'on' : ''}">
      <button type="button" class="lookopt sp" data-k="sp" data-v="${x.id}" aria-pressed="${D.sp === x.id}">${drawLook({ ...D, sp: x.id })}<span>${x.name}</span></button>
      ${self ? '' : `<button type="button" class="textbtn give" data-give="${x.id}" data-on="${own ? 0 : 1}">${own ? 'Take back' : 'Give'}</button>`}
    </div>`;
  };
  const specials = SPECIALS.map(specialBtn).join('');
  app.innerHTML = `<div class="page lookpage">
    ${pageBar(self ? 'Your character' : esc(target.name))}
    <section class="look-hero"><div class="look-stage" id="lk-prev">${drawLook(D)}</div>
      <div class="look-plate ${D.sp ? 'vip' : ''}" id="lk-plate"><span>${esc(name)}${(self ? S.me.vip : target.vip) ? '<span class="vipstar" role="img" aria-label="VIP">★</span>' : ''}</span><b>${self ? money(S.me.bankroll) : `${count(target.hands || 0)} hands`}</b></div>
      <button type="button" class="btn small" id="lk-shuffle">Shuffle</button></section>
    ${self ? `<div class="field"><label class="lbl" for="pf-name">Name at the table</label><input id="pf-name" maxlength="16" autocomplete="nickname" value="${esc(S.me.name)}"></div>` : `<p class="lead">${target.bot ? 'A bot at your tables.' : target.email ? esc(target.email) : 'Guest player'} You can change any part of their look, and give them a special.</p>`}
    ${specials ? `<section class="sec first"><div class="sec-head"><div><h2 class="sec-title">Specials</h2><p class="sec-sub">${self ? 'Given to you. Nobody can buy these.' : 'One of a kind. Give one and it’s theirs to wear.'}</p></div></div>
      <div class="lookgrid">${specials}${self ? '' : ''}</div>${D.sp ? `<button type="button" class="textbtn" id="lk-nosp">Wear no special</button>` : ''}</section>` : ''}
    <section class="sec first"><div class="sec-head"><h2 class="sec-title">Style</h2></div><div class="lookgrid">${LOOK_NAMES.map((_, i) => lookBtn(i)).join('')}</div></section>
    <section class="sec first"><div class="sec-head"><h2 class="sec-title">Skin</h2></div><div class="swatches">${SKIN.map((c, i) => swatch('sk', i, c, false, 'Skin tone ' + (i + 1))).join('')}</div></section>
    <section class="sec first"><div class="sec-head"><h2 class="sec-title">Hair</h2></div><div class="swatches">${HAIR.map((c, i) => swatch('hr', i, c, false, 'Hair colour ' + (i + 1))).join('')}</div></section>
    <section class="sec first"><div class="sec-head"><h2 class="sec-title">Jacket</h2></div><div class="swatches">${JACKET.map((c, i) => swatch('jk', i, c, lockedJk(i), 'Jacket ' + (i + 1))).join('')}</div></section>
    ${self ? '' : `<div class="list togs"><label class="lrowbtn static switch vipsw"><div class="lr-txt"><b>VIP star <span class="vipstar" aria-hidden="true">★</span></b><span>A gold star after their name, everywhere</span></div><input type="checkbox" id="lk-vip" ${target.vip ? 'checked' : ''}></label></div>`}
    <div class="list togs">
      <label class="lrowbtn static switch"><div class="lr-txt"><b>Sunglasses</b></div><input type="checkbox" id="lk-sh" ${D.sh ? 'checked' : ''}></label>
      <label class="lrowbtn static switch"><div class="lr-txt"><b>Beard</b></div><input type="checkbox" id="lk-bd" ${D.bd ? 'checked' : ''}></label>
    </div>
    ${self && !club ? `<button class="club-banner" id="lk-club"><span><span class="lbl">Pro Pass · ${money(499)}/mo</span><b>Cowboy hat, fedora, bandana, gold and white jackets</b></span>${TICON.chev}</button>` : ''}
    <div class="look-save"><button class="btn primary" id="lk-save">${self ? 'Save' : `Save ${esc(target.name)}’s look`}</button></div>
  </div>`;
  enter();
  const redraw = () => {
    $('#lk-prev').innerHTML = drawLook(D);
    $('#lk-plate').classList.toggle('vip', !!D.sp);
    app.querySelectorAll('[data-k]').forEach(b => {
      const k = b.dataset.k, v = k === 'sp' ? b.dataset.v : +b.dataset.v;
      b.setAttribute('aria-pressed', String(D[k] === v));
      if (k === 'lk') b.querySelector('svg').outerHTML = drawLook({ ...D, lk: v, sp: '' });
      if (k === 'sp') { b.querySelector('svg').outerHTML = drawLook({ ...D, sp: v }); b.parentElement.classList.toggle('on', D.sp === v); }
    });
  };
  app.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
    if (b.classList.contains('locked')) { toast('That one comes with Pro Pass', ['See Pro Pass', () => renderClub()]); return; }
    const k = b.dataset.k; D[k] = k === 'sp' ? (D.sp === b.dataset.v ? '' : b.dataset.v) : +b.dataset.v;
    buzz(4); redraw();
  });
  $('#lk-sh').onchange = e => { D.sh = e.target.checked ? 1 : 0; redraw(); };
  $('#lk-bd').onchange = e => { D.bd = e.target.checked ? 1 : 0; redraw(); };
  const vipEl = $('#lk-vip');
  if (vipEl) vipEl.onchange = e => {
    target.vip = e.target.checked;
    send({ t: 'adminVip', userId: target.id, on: target.vip, q: S.adminQ || '' });
    $('#lk-plate span').innerHTML = esc(name) + (target.vip ? '<span class="vipstar" role="img" aria-label="VIP">★</span>' : '');
    toast(target.vip ? `${target.name} is VIP` : 'VIP star removed'); buzz(6);
  };
  const nosp = $('#lk-nosp'); if (nosp) nosp.onclick = () => { D.sp = ''; redraw(); nosp.remove(); };
  $('#lk-shuffle').onclick = () => {
    const r = n => Math.floor(Math.random() * n);
    const free = n => { let v; do v = r(n); while (!club && (n === LOOK_NAMES.length ? CLUB_LOOKS : CLUB_JACKETS).includes(v)); return v; };
    Object.assign(D, { lk: free(LOOK_NAMES.length), sk: r(SKIN.length), hr: r(HAIR.length), jk: free(JACKET.length), sh: r(5) === 0 ? 1 : 0, bd: r(4) === 0 ? 1 : 0 });
    $('#lk-sh').checked = !!D.sh; $('#lk-bd').checked = !!D.bd; redraw();
  };
  const cl = $('#lk-club'); if (cl) cl.onclick = () => renderClub();
  app.querySelectorAll('[data-give]').forEach(b => b.onclick = () => {
    const on = b.dataset.on === '1';
    send({ t: 'adminGrant', userId: target.id, sp: b.dataset.give, on, q: S.adminQ || '' });
    target.specials = on ? [...new Set([...(target.specials || []), b.dataset.give])] : (target.specials || []).filter(x => x !== b.dataset.give);
    if (!on && D.sp === b.dataset.give) D.sp = '';
    toast(on ? `Gave ${target.name} ${SPECIALS.find(x => x.id === b.dataset.give).name}` : 'Taken back');
    renderLookEditor({ target: { ...target, avatar: { a: 0, c: D.jk % 8, ch: { ...D } } } });
  });
  $('#pg-back').onclick = () => (self ? goLobby() : renderAdmin());
  $('#lk-save').onclick = () => {
    if (self) {
      const nm = $('#pf-name').value.trim();
      if (nm.length < 2) { toast('Pick a name with at least 2 characters'); return; }
      send({ t: 'profile', name: nm, avatar: { a: 0, c: D.jk % 8, ch: { ...D } } });
      toast('Saved'); goLobby();
    } else {
      send({ t: 'adminLook', userId: target.id, ch: { ...D }, q: S.adminQ || '' });
      renderAdmin();
    }
  };
}

// Admin: everyone who plays, searchable. Tap someone to change their look or give them a special.
function renderAdmin() {
  S.view = 'admin';
  const list = S.adminList;
  app.innerHTML = `<div class="page">
    ${pageBar('Players')}
    <input id="ad-q" type="search" placeholder="Search by name or email" aria-label="Search players" value="${esc(S.adminQ || '')}">
    <p class="fine left">Only admins see this. Changes show up at the table right away.</p>
    ${!list ? skelRows(4) : list.length ? `<div class="glist">${list.map(u => `
      <button class="grow prow" data-uid="${esc(u.id)}"><span class="pmini ${specialOf(u.avatar) ? 'vip' : ''}">${portrait(u.avatar, u.name)}</span>
        <span class="gr-main"><b>${esc(u.name)}${u.vip ? '<span class="vipstar" role="img" aria-label="VIP">★</span>' : ''}</b><span>${u.bot ? 'Bot' : u.email ? esc(u.email) : 'Guest'} · ${count(u.hands)} hands</span></span>
        ${u.specials && u.specials.length ? `<span class="gr-side spc">${u.specials.length} special${u.specials.length > 1 ? 's' : ''}</span>` : ''}${TICON.chev}</button>`).join('')}</div>`
      : '<div class="empty card-empty"><p>No one matches that.</p></div>'}
  </div>`;
  $('#pg-back').onclick = goLobby;
  let tm;
  $('#ad-q').oninput = e => { clearTimeout(tm); tm = setTimeout(() => { S.adminQ = e.target.value; send({ t: 'adminUsers', q: S.adminQ }); }, 250); };
  app.querySelectorAll('[data-uid]').forEach(b => b.onclick = () => renderLookEditor({ target: S.adminList.find(u => u.id === b.dataset.uid) }));
  if (!list) send({ t: 'adminUsers', q: S.adminQ || '' });
}

/* ---------------- lobby ---------------- */
const PERIODS = [['day', 'Last 24 hours'], ['week', 'Last 7 days'], ['month', 'Last 30 days'], ['all', 'All time']];
/* ---------------- app shell: tab bar + tabs ---------------- */
const TICON = {
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path class="f" d="M12 3C12 3 5 9 5 13.2C5 15.4 6.8 17 8.9 17C10.2 17 11.2 16.4 11.6 15.7L10.6 20.5H13.4L12.4 15.7C12.8 16.4 13.8 17 15.1 17C17.2 17 19 15.4 19 13.2C19 9 12 3 12 3Z"/></svg>',
  games: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect class="f" x="3" y="7" width="18" height="10" rx="5"/><path d="M8 12h.01M12 12h.01M16 12h.01" stroke-width="2.4" stroke-linecap="round"/></svg>',
  social: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle class="f" cx="9" cy="8.5" r="3.5"/><path class="f" d="M2.8 19.5c.6-3.3 3.1-5.2 6.2-5.2s5.6 1.9 6.2 5.2Z"/><path d="M16 5.2a3.4 3.4 0 0 1 0 6.6M18 14.6c1.9.6 3.1 2.4 3.4 4.9"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect class="f" x="3" y="6" width="18" height="13" rx="3"/><path d="M3 9.5h18M16 14h2"/></svg>',
  me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><circle class="f" cx="12" cy="8.5" r="4"/><path class="f" d="M4.5 20c.8-3.8 3.8-6 7.5-6s6.7 2.2 7.5 6Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  tourneys: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path class="f" d="M7 4h10v5a5 5 0 0 1-10 0Z"/><path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 3.4M17 6h2.5a2.5 2.5 0 0 1-2.6 3.4M12 14v3.5M8.5 20h7M9.5 17.5h5v2.5h-5Z"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2 2M14 9l2 2"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
};
const suitIcon = i => `<svg viewBox="0 0 24 24" class="suit"><g class="f" fill="currentColor">${SUIT_SVG[i]}</g></svg>`;
TICON.play = suitIcon(0); TICON.games = suitIcon(1); TICON.social = suitIcon(3); TICON.wallet = suitIcon(2);
const TABS = [['play', 'Play'], ['games', 'Home games'], ['tourneys', 'Tournaments'], ['social', 'Social'], ['me', 'Profile']];

function renderTabs() {
  S.view = 'tabs';
  S.tab = S.tab || 'play';
  const me = S.me;
  if (!me) return;
  const same = S.lastTab === S.tab && S.lastPainted === 'tabs';
  const y = same ? window.scrollY : 0;
  const keepX = ['#hs-track', '.gscroll'].map(q => { const e = document.querySelector(q); return e ? e.scrollLeft : 0; });
  const body = { play: tabPlay, games: tabGames, tourneys: tabTourneys, social: tabSocial, wallet: tabWallet, me: tabMe }[S.tab]();
  app.innerHTML = `<div class="shell">
    <nav class="tabbar" aria-label="Sections"><span class="rail-logo logo" aria-hidden="true">${LOGO}</span>
      ${TABS.map(([k, l]) => `<button class="tab t-${k}" data-tab="${k}" ${S.tab === k ? 'aria-current="page"' : ''}>${k === 'me' ? avatarHTML(me.avatar, me.name) : TICON[k]}<span>${l}</span></button>`).join('')}</nav>
    <main class="tabpage ${same ? '' : 'enter'}" id="tabpage">${body.html}</main>
  </div>`;
  S.lastTab = S.tab; S.lastPainted = 'tabs';
  window.scrollTo(0, y);
  app.querySelectorAll('.tabbar [data-tab]').forEach(b => b.onclick = () => { if (S.tab === b.dataset.tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; } S.tab = b.dataset.tab; renderTabs(); });
  ['#hs-track', '.gscroll'].forEach((q, i) => { const e = document.querySelector(q); if (e && keepX[i]) e.scrollLeft = keepX[i]; });
  if (body.bind) body.bind();
}
const renderLobby = renderTabs;
const greet = () => { const h = new Date().getHours(); return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const largeTitle = (title, right = '', eyebrow = '') => `<header class="lt"><div>${eyebrow ? `<span class="lt-eyebrow">${eyebrow}</span>` : ''}<h1>${title}</h1></div>${right}</header>`;
const soonRow = (title, sub) => `<div class="lrowbtn static"><div class="lr-txt"><b>${title}</b><span>${sub}</span></div><span class="soon">Soon</span></div>`;

/* ---------------- tournaments ---------------- */
const clock = ms => { ms = Math.max(0, ms || 0); const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const chips = n => Number(n || 0).toLocaleString('en-US');
const whenLocal = ts => { const d = new Date(ts), today = new Date(); const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); return d.toDateString() === today.toDateString() ? t : `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${t}`; };
function tourStatus(t) {
  if (t.status === 'registering') return t.startsAt ? (t.startsAt - Date.now() < 3600000 ? `Starts in <span data-cd="${t.startsAt}">${clock(t.startsAt - Date.now())}</span>` : `Starts ${whenLocal(t.startsAt)}`) : 'Waiting for the host';
  if (t.status === 'running') return `${t.lateReg ? 'Late reg open · ' : ''}Level ${t.level} · ${t.left} left`;
  if (t.status === 'finished') return 'Finished';
  return 'Canceled';
}
function tourMine(t) {
  const me = t.me;
  if (!me) return '';
  if (me.status === 'registered') return '<span class="tmine">Registered</span>';
  if (me.status === 'playing') return '<span class="tmine live">Playing</span>';
  if (me.status === 'won') return '<span class="tmine win">You won</span>';
  if (me.status === 'busted') return `<span class="tmine">${ordinal(me.place)}${me.prize ? ' · ' + money(me.prize) : ''}</span>`;
  return '';
}
function tourRows(list) {
  const pool = t => t.guarantee && t.prizePool < t.guarantee ? `${money(t.guarantee)} GTD` : `${money(t.prizePool)} pool`;
  return `<div class="glist">${list.map(t => `
      <button class="trow2 ${t.status}" data-tour="${t.id}">
        <span class="gr-main"><b>${esc(t.name)}${tourMine(t)}</b><span>${tourStatus(t)}</span><span>${GAME_SHORT(t.game)} · ${t.speedName} · ${t.seatsPerTable}-max${t.reentries ? ' · Re-entry' : ''}</span></span>
        <span class="tr2-side"><b class="num">${t.buyIn ? money(t.buyIn) : 'Free'}</b><span class="num">${pool(t)}</span></span>${TICON.chev}
      </button>`).join('')}</div>`;
}
function tabTourneys() {
  const all = (S.tourneys || []).filter(t => t.status !== 'canceled');
  const series = all.filter(t => t.series), hosted = all.filter(t => !t.series);
  const html = `
    ${largeTitle('Tournaments', '<button class="btn small" id="host-t">Host one</button>')}
    <p class="lead">Register for one and we’ll seat you when it starts. Last one standing takes the top prize.</p>
    ${!S.tourneys ? skelRows(3) : ''}
    ${series.length ? `<section class="sec first"><div class="sec-head"><h2 class="sec-title">Pokr Championship Series</h2></div>${tourRows(series)}</section>` : ''}
    <section class="sec"><div class="sec-head"><h2 class="sec-title">Hosted by friends</h2></div>
      ${hosted.length ? tourRows(hosted) : '<div class="empty card-empty"><p>No private tournaments right now.</p><p class="sub">Host one, then send your friends the code.</p></div>'}</section>`;
  return { html, bind: bindTourneysSection };
}
function bindTourneysSection() {
  app.querySelectorAll('[data-tour]').forEach(b => b.onclick = () => renderTourney(b.dataset.tour));
  const h = $('#host-t'); if (h) h.onclick = openHostTourney;
}

// One tournament: the clock, your status and button, then players, payouts, structure and tables.
function renderTourney(id, refresh) {
  if (!refresh) { S.tourView = id; S.tourTab = S.tourTab || 'players'; if (!S.tour || S.tour.id !== id) S.tour = null; send({ t: 'tourney', id }); }
  S.view = 'tourney';
  const d = S.tour && S.tour.id === id ? S.tour : null;
  const y = refresh ? window.scrollY : 0;
  if (!d) { app.innerHTML = `<div class="page">${pageBar('Tournament')}${skelRows(4)}</div>`; $('#pg-back').onclick = closeTourney; return; }
  const me = d.me, tab = S.tourTab;
  let cta = '';
  if (d.isHost && d.status === 'registering') cta = `<div class="t-host"><button class="btn primary" id="t-start" ${d.registered < 2 ? 'disabled' : ''}>Start now · ${d.registered} in</button><button class="btn" id="t-bots">Add 5 bots</button><button class="btn" id="t-share">Share code ${esc(d.id)}</button></div>`;
  if (me && me.status === 'playing') cta = `<button class="btn primary big" id="t-seat">Take your seat</button>` + cta;
  else if (me && me.status === 'registered') cta = `<div class="t-in"><span>You’re in. ${d.startsAt ? 'We’ll seat you when it starts.' : 'Waiting for the host to start.'}</span><button class="textbtn" id="t-unreg">Unregister</button></div>` + cta;
  else if (me && (me.status === 'busted' || me.status === 'won')) cta = `<div class="t-in done"><span>${me.status === 'won' ? 'You won it' : `You finished ${ordinal(me.place)}`}${me.prize ? ` · ${money(me.prize)}` : ''}</span>${me.canEnter ? `<button class="btn primary" id="t-reg">Re-enter · ${money(d.buyIn)}</button>` : ''}</div>` + cta;
  else if (d.lateReg) cta = `<button class="btn primary big" id="t-reg">${d.status === 'running' ? 'Late register' : 'Register'} · ${d.buyIn ? money(d.buyIn) : 'Free'}</button>` + cta;
  else if (d.status === 'running') cta = `<p class="fine">Registration is closed.</p>` + cta;
  const cur = d.level;
  const tabs = [['players', d.status === 'registering' ? `Players (${d.registered})` : 'Players'], ['payouts', 'Payouts'], ['structure', 'Structure'], ['tables', 'Tables']];
  let body = '';
  if (tab === 'players') {
    if (d.status === 'registering') body = d.field.length ? `<div class="tlist">${d.field.map(p => `<div class="trow">${chipAvatar(p.avatar, p.name)}<span class="tn">${esc(p.name)}${vipStar(p.avatar)}</span></div>`).join('')}</div>` : '<p class="wait">Nobody’s registered yet.</p>';
    else body = `<div class="tlist">${d.standings.map(p => `<div class="trow ${p.me ? 'me' : ''}"><span class="tr-rk">${p.rank}</span>${chipAvatar(p.avatar, p.name)}<span class="tn">${esc(p.name)}${vipStar(p.avatar)}</span><span class="tc">${chips(p.chips)}</span><span class="tt">T${p.table}</span></div>`).join('')}
      ${d.results.length ? `<h3 class="tsub">Finished</h3>${d.results.map(r => `<div class="trow out"><span class="tr-rk">${ordinal(r.place)}</span><span class="tn">${esc(r.name)}</span><span class="tc">${r.prize ? money(r.prize) : ''}</span></div>`).join('')}` : ''}</div>`;
  } else if (tab === 'payouts') {
    body = d.payouts.length ? `<p class="wait">${d.payouts.length} paid of ${d.entries} entries${d.status !== 'finished' && d.lateReg ? ' so far' : ''}.</p><div class="tlist">${d.payouts.map(x => `<div class="trow"><span class="tr-rk">${ordinal(x.place)}</span><span class="tn"></span><span class="tc gold">${money(x.amount)}</span></div>`).join('')}</div>` : '<p class="wait">Payouts appear once there are at least two entries.</p>';
  } else if (tab === 'structure') {
    body = `<div class="tlist">${d.structure.map(l => `<div class="trow lv ${l.level === cur && d.status === 'running' ? 'now' : ''}"><span class="tr-rk">${l.level}</span><span class="tn">${chips(l.sb)} / ${chips(l.bb)}</span><span class="tc">ante ${chips(l.ante)}</span>${l.level === d.lateRegLevels && d.lateRegLevels ? '<span class="tt">late reg ends</span>' : ''}</div>`).join('')}</div>`;
  } else {
    body = d.tables.length ? `<div class="tlist">${d.tables.map(t => `<button class="trow tb" data-watch="${t.code}"><span class="tr-rk">T${t.no}</span><span class="tn">${t.players} players</span><span class="tc">Big stack ${chips(t.big)}</span><span class="tt">Watch ›</span></button>`).join('')}</div>` : '<p class="wait">Tables appear when it starts.</p>';
  }
  app.innerHTML = `<div class="page tpage">
    ${pageBar(d.series ? 'Pokr Championship Series' : 'Tournament')}
    <section class="thero ${d.series === 'main' ? 'main' : ''}">
      <span class="lbl">${GAME_LONG(d.game)} · ${d.speedName} · ${d.seatsPerTable}-max</span>
      <h1>${esc(d.name)}</h1>
      <div class="th-status">${d.status === 'running' ? `<b>Level ${d.level}</b> ${chips(d.sb)}/${chips(d.bb)} · ante ${chips(d.ante)} · next in <span data-cd="${Date.now() + d.nextLevelMs}">${clock(d.nextLevelMs)}</span>` : tourStatus(d)}</div>
      <div class="th-pool"><i>Prize pool</i><b>${money(d.prizePool)}</b>${d.guarantee ? `<span>${money(d.guarantee)} guaranteed</span>` : ''}</div>
      <div class="th-grid">
        <span><i>Buy-in</i>${d.buyIn ? money(d.buyIn) : 'Free'}</span>
        <span><i>Starting stack</i>${chips(d.stack)}</span>
        <span><i>Levels</i>${d.levelMin} min</span>
        <span><i>${d.status === 'running' ? 'Left' : 'Registered'}</i>${d.status === 'running' ? `${d.left}/${d.entries}` : d.registered}</span>
        <span><i>Late reg</i>${d.lateRegLevels ? `Until level ${d.lateRegLevels}` : 'None'}</span>
        <span><i>Re-entry</i>${d.reentries ? `${d.reentries}×` : 'Freezeout'}</span>
      </div>
      ${cta}
    </section>
    <div class="seg4" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-ttab="${k}" aria-selected="${tab === k}">${l}</button>`).join('')}</div>
    ${body}
  </div>`;
  if (!refresh) enter();
  window.scrollTo(0, y);
  $('#pg-back').onclick = closeTourney;
  app.querySelectorAll('[data-ttab]').forEach(b => b.onclick = () => { S.tourTab = b.dataset.ttab; renderTourney(id, true); });
  const on = (sel, fn) => { const e = $(sel); if (e) e.onclick = fn; };
  on('#t-reg', () => { buzz(8); send({ t: 'tReg', id }); });
  on('#t-unreg', () => send({ t: 'tUnreg', id }));
  on('#t-seat', () => send({ t: 'tSeat', id }));
  on('#t-start', () => { buzz(10); send({ t: 'tStart', id }); });
  on('#t-bots', () => send({ t: 'tBots', id, n: 5 }));
  on('#t-share', async () => { if (await copy(d.id)) toast(`Code ${d.id} copied. Friends join with + → Join with code.`); });
  app.querySelectorAll('[data-watch]').forEach(b => b.onclick = () => { nav('/t/' + b.dataset.watch); joinCode(b.dataset.watch); });
}
function closeTourney() { send({ t: 'tUnwatch' }); S.tourView = null; S.tour = null; goLobby(); }

function openHostTourney() {
  closeModal();
  S.ht = S.ht || { game: 'nlh', buyIn: 1000, speed: 'turbo', seats: 9, lateReg: true, reentry: false };
  const H = S.ht;
  const opt = (key, val, label, sub) => `<button type="button" class="hopt" data-hk="${key}" data-hv="${val}" aria-pressed="${String(H[key]) === String(val)}"><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</button>`;
  openSheet(`<h2>Host a tournament</h2>
    <input id="ht-name" maxlength="30" placeholder="${esc(S.me.name)}'s tournament" aria-label="Tournament name">
    <span class="lbl">Game</span><div class="hrow2">${opt('game', 'nlh', 'Hold’em')}${opt('game', 'plo', 'Omaha')}</div>
    <span class="lbl">Buy-in</span><div class="hrow6">${[[0, 'Free'], [500, '$5'], [1000, '$10'], [2500, '$25'], [5000, '$50'], [10000, '$100']].map(([v, l]) => opt('buyIn', v, l)).join('')}</div>
    <span class="lbl">Speed</span><div class="hrow4">${opt('speed', 'hyper', 'Hyper', '2 min')}${opt('speed', 'turbo', 'Turbo', '4 min')}${opt('speed', 'regular', 'Regular', '8 min')}${opt('speed', 'deep', 'Deep', '12 min')}</div>
    <span class="lbl">Players per table</span><div class="hrow4">${[6, 7, 8, 9].map(n => opt('seats', n, n)).join('')}</div>
    <label class="switch"><input type="checkbox" id="ht-late" ${H.lateReg ? 'checked' : ''}> Late registration for the first 4 levels</label>
    <label class="switch"><input type="checkbox" id="ht-re" ${H.reentry ? 'checked' : ''}> One re-entry</label>
    <button class="btn primary" id="ht-go">Create tournament</button>
    <p class="fine">You start it when everyone’s in. Friends join with the code.</p>`, () => {
    document.querySelectorAll('.hopt').forEach(b => b.onclick = () => {
      const k = b.dataset.hk; H[k] = isNaN(+b.dataset.hv) ? b.dataset.hv : +b.dataset.hv;
      document.querySelectorAll(`.hopt[data-hk="${k}"]`).forEach(x => x.setAttribute('aria-pressed', String(H[k]) === x.dataset.hv));
    });
    $('#ht-late').onchange = e => { H.lateReg = e.target.checked; };
    $('#ht-re').onchange = e => { H.reentry = e.target.checked; };
    $('#ht-go').onclick = () => { const name = $('#ht-name').value; closeModal(); send({ t: 'tHost', name, ...H }); };
  });
}

function showTourneyResult(m) {
  buzz(m.won ? [30, 60, 30] : 20);
  const head = m.won ? `You won the ${esc(m.name)}` : `You finished ${ordinal(m.place)} of ${m.entries}`;
  openModal(`<div class="tresult ${m.won ? 'won' : ''}">
    <span class="lbl">${esc(m.name)}</span>
    <h2>${head}</h2>
    ${m.prize ? `<div class="tr-prize">+${money(m.prize)}</div><p class="wait">Added to your balance.</p>` : '<p class="wait">Out before the money this time.</p>'}
    <div class="acts">${m.canReenter ? `<button class="btn primary" id="tr-re">Re-enter · ${money(m.buyIn)}</button>` : ''}<button class="btn" id="tr-lobby">Tournament lobby</button></div>
  </div>`, () => {
    const re = $('#tr-re'); if (re) re.onclick = () => { closeModal(); send({ t: 'tReg', id: m.id }); };
    $('#tr-lobby').onclick = () => { closeModal(); leaveTableView(); renderTourney(m.id); };
  });
}

// A ring that fills with the seats taken: "4/9 seats".
function seatRing(filled, seats) {
  const r = 15, C = 2 * Math.PI * r, f = seats ? filled / seats : 0;
  return `<span class="sring" aria-label="${filled} of ${seats} seats taken"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="${r}" class="sr-bg"/><circle cx="18" cy="18" r="${r}" class="sr-fg" stroke-dasharray="${(C * f).toFixed(1)} ${C.toFixed(1)}"/></svg><span class="sr-txt"><b>${filled}/${seats}</b><i>seats</i></span></span>`;
}
// The blinds you've sat at most recently, newest first.
function recentBlinds() { try { return JSON.parse(store.get('pokr.recentBlinds') || '[]'); } catch { return []; } }
function noteBlinds(game, sb, bb) {
  const k = `${game || 'nlh'}|${sb}|${bb}`, r = recentBlinds();
  if (r[0] === k) return;
  store.set('pokr.recentBlinds', JSON.stringify([k, ...r.filter(x => x !== k)].slice(0, 4)));
}
const blindKey = t => `${t.game || 'nlh'}|${t.sb}|${t.bb}`;
// The table itself, small: a wood rail, the felt, and every seat — taken seats in the player's colour, open ones as a green ring.
function seatMap(filled, seats, taken) {
  const list = taken && taken.length === seats ? taken : Array.from({ length: seats }, (_, i) => (i < filled ? i : -1));
  const dots = list.map((c, i) => {
    const a = Math.PI / 2 + (i / seats) * Math.PI * 2;
    const cx = (26 + 20 * Math.cos(a)).toFixed(2), cy = (16 + 11.6 * Math.sin(a)).toFixed(2);
    return c >= 0 ? `<circle cx="${cx}" cy="${cy}" r="3.1" fill="${DOTC[c % DOTC.length]}" stroke="#fff" stroke-width="1"/>`
      : `<circle cx="${cx}" cy="${cy}" r="2.7" class="open"/>`;
  }).join('');
  return `<svg class="smap" viewBox="0 0 52 32" role="img" aria-label="${filled} of ${seats} seats taken"><rect x="10" y="7.5" width="32" height="17" rx="8.5" class="rail"/><rect x="12" y="9.5" width="28" height="13" rx="6.5" class="felt"/><rect x="15" y="12" width="22" height="8" rx="4" class="line"/>${dots}</svg>`;
}
// One table as a list row: the seat map, the game and blinds, and how many seats are open.
function tableRow(t) {
  const n = t.players + t.bots, open = t.seats - n;
  return `<button class="grow" data-join="${t.code}">${seatMap(n, t.seats, t.taken)}
    <span class="gr-main"><b>${GAME_SHORT(t.game)} <span class="num">${blinds(t.sb, t.bb)}</span></b><span>${t.seats}-max · ${n ? `${n} playing` : 'Empty'}</span></span>
    <span class="gr-side num ${open ? '' : 'full'}">${open ? `${open} open` : 'Full'}</span>${TICON.chev}</button>`;
}
const GAME_SHORT = g => (g === 'plo' ? 'PLO' : 'NLH');
const GAME_LONG = g => (g === 'plo' ? 'Pot-Limit Omaha' : 'No-Limit Hold’em');
function filteredTables() {
  const L = S.lobby || { tables: [] };
  S.blindFilter = S.blindFilter || 'all'; S.gameFilter = S.gameFilter || 'all';
  return (L.tables || []).filter(t =>
    (S.blindFilter === 'all' || STAKES.some(([k, sb, bb]) => k === S.blindFilter && t.sb === sb && t.bb === bb)) &&
    (S.gameFilter === 'all' || (t.game || 'nlh') === S.gameFilter) &&
    (!S.hideFull || t.players + t.bots < t.seats));
}
function gameChips() {
  const bl = S.blindFilter && S.blindFilter !== 'all' ? blindLabel(S.blindFilter) : 'Blinds';
  return `<div class="filters gchips" role="group" aria-label="Filter tables">
    ${[['all', 'All'], ['nlh', 'NLH'], ['plo', 'PLO']].map(([k, l]) => `<button type="button" class="fchip" data-gf="${k}" aria-pressed="${S.gameFilter === k}">${l}</button>`).join('')}
    <button type="button" class="fchip drop ${S.blindFilter !== 'all' ? 'set' : ''}" id="blinds-drop">${bl} <span aria-hidden="true">▾</span></button>
  </div>`;
}
function bindGameChips(rerender) {
  app.querySelectorAll('[data-gf]').forEach(b => b.onclick = () => { S.gameFilter = b.dataset.gf; rerender(); });
  const d = $('#blinds-drop');
  if (d) d.onclick = () => openSheet(`<h2>Blinds</h2><div class="list">${[['all', 'Any blinds'], ...STAKES.map(([k, sb, bb]) => [k, blinds(sb, bb)])].map(([k, l]) => `<button class="lrowbtn" data-bpick="${k}"><div class="lr-txt"><b>${l}</b></div>${S.blindFilter === k ? '<span class="soon">✓</span>' : ''}</button>`).join('')}</div>`, () => {
    document.querySelectorAll('[data-bpick]').forEach(b => b.onclick = () => { S.blindFilter = b.dataset.bpick; closeModal(); rerender(); });
  });
}
function tabPlay() {
  const me = S.me, L = S.lobby || { tables: [] };
  const seated = Object.entries(me.atTablesBy || {});
  const list = filteredTables();
  const open = t => t.players + t.bots < t.seats;
  const recent = recentBlinds();
  const mine = recent.length ? (L.tables || []).filter(t => open(t) && recent.includes(blindKey(t))).sort((a, b) => recent.indexOf(blindKey(a)) - recent.indexOf(blindKey(b)) || (b.players + b.bots) - (a.players + a.bots)) : [];
  const featured = (mine.length ? mine : [...(L.tables || [])].filter(open).sort((a, b) => (b.players * 3 + b.bots) - (a.players * 3 + a.bots))).slice(0, 5);
  const heroTitle = mine.length ? 'Your blinds' : 'Popular now';
  const heroSub = mine.length ? 'Tables at the stakes you’ve been playing' : 'The busiest tables with a seat open';
  const ovalSeats = t => {
    const taken = t.taken && t.taken.length === t.seats ? t.taken : Array.from({ length: t.seats }, (_, i) => (i < t.players + t.bots ? i : -1));
    return taken.map((c, i) => {
      const a = Math.PI / 2 + (i / t.seats) * Math.PI * 2;
      const pos = `left:${(50 + 47 * Math.cos(a)).toFixed(1)}%;top:${(50 + 46 * Math.sin(a)).toFixed(1)}%`;
      return c >= 0 ? `<i class="on" style="${pos};--c:${DOTC[c % DOTC.length]}"><svg viewBox="0 0 20 20"><circle cx="10" cy="7.4" r="3.4"/><path d="M3.6 17.4c.8-3.8 3.4-5.6 6.4-5.6s5.6 1.8 6.4 5.6Z"/></svg></i>` : `<i style="${pos}"><b>+</b></i>`;
    }).join('');
  };
  const heroSlide = t => {
    const n = t.players + t.bots;
    return `<article class="hslide">
      <div class="hs-felt"><div class="hs-rail"><div class="hs-cloth"><span class="hs-mark">${blinds(t.sb, t.bb)}</span></div>${ovalSeats(t)}</div></div>
      <div class="hs-info"><div><h3>${blinds(t.sb, t.bb)}</h3>
        <p class="hs-game">${GAME_LONG(t.game)} · ${t.seats}-max</p>
        <p class="hs-sub"><span class="live-dot"></span>${n} seated · ${t.seats - n} open</p>
        ${t.recent && t.recent.length ? `<p class="hs-last">${esc(t.recent[t.recent.length - 1])}</p>` : ''}</div>
      <button class="btn primary hs-go" data-join="${t.code}">Sit down</button></div>
    </article>`;
  };
  const totals = (L.tables || []).reduce((a, t) => [a[0] + t.players + t.bots, a[1] + 1], [0, 0]);
  const html = `
    <header class="phead">
      <button class="ph-me" id="to-me" aria-label="Your profile">${avatarHTML(me.avatar, me.name)}</button>
      <div class="ph-title"><h1>Play</h1>${S.lobby ? `<span class="ph-live"><span class="live-dot"></span>${totals[0]} playing at ${totals[1]} tables</span>` : ''}</div>
      <button class="bal-chip" id="to-wallet" aria-label="Wallet balance ${money(me.bankroll)}">${chipNum(me.bankroll)}<span class="bc-plus" aria-hidden="true">+</span></button>
    </header>
    ${seated.length ? `<div class="seated">${seated.map(([code, amt]) => `<button class="seated-row" data-back="${esc(code)}"><span class="pulse"></span><span>You’re seated at <b>${esc(code)}</b> with ${money(amt)}</span><span class="go">Return ›</span></button>`).join('')}</div>` : ''}
    <section class="hero-tables" aria-label="${heroTitle}">
      <div class="sec-head"><div><h2 class="sec-title">${heroTitle}</h2><p class="sec-sub">${heroSub}</p></div></div>
      <div class="hs-track" id="hs-track">${!S.lobby ? '<article class="hslide skel"></article>' : featured.length ? featured.map(heroSlide).join('') : `<article class="hslide empty-hero">
        <div class="hs-felt"><div class="hs-oval"></div><div class="hs-live"><span>No one’s at a table yet</span></div></div>
        <h3>Start the first table</h3><p class="hs-sub">Pick a game, send your friends the code</p>
        <button class="btn primary hs-go" id="hero-new">Start a table</button></article>`}</div>
      ${featured.length > 1 ? `<div class="hs-dots" id="hs-dots">${featured.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}
    </section>
    <section class="sec">
      <div class="sec-head"><button class="sec-link" id="view-all"><h2>Active games</h2><span aria-hidden="true">›</span></button>${S.lobby ? `<button class="textbtn" id="view-all2">View all</button>` : ''}</div>
      ${gameChips()}
      ${!S.lobby ? skelRows(2) : list.length ? `<div class="glist">${list.slice(0, 6).map(tableRow).join('')}${list.length > 6 ? `<button class="grow more" id="view-all3"><span class="gr-main"><b>All ${list.length} tables</b></span>${TICON.chev}</button>` : ''}</div>`
        : `<div class="empty card-empty"><span class="empty-icon chip"></span><p>No tables match.</p><p class="sub"><button class="linkbtn" id="clear-f">Clear filters</button> or tap + to start one.</p></div>`}
    </section>
    <p class="fine">Play money only for now. No real money.</p>`;
  const bind = () => {
    $('#to-wallet').onclick = () => { S.tab = 'wallet'; renderTabs(); };
    $('#to-me').onclick = () => { S.tab = 'me'; renderTabs(); };
    bindGameChips(renderTabs);
    bindTourneysSection();
    if ($('#clear-f')) $('#clear-f').onclick = () => { S.gameFilter = 'all'; S.blindFilter = 'all'; S.hideFull = false; renderTabs(); };
    if ($('#hero-new')) $('#hero-new').onclick = openNewTable;
    ['#view-all', '#view-all2', '#view-all3'].forEach(id => { const b = $(id); if (b) b.onclick = renderAllTables; });
    app.querySelectorAll('[data-join]').forEach(b => b.onclick = () => { nav('/t/' + b.dataset.join); joinCode(b.dataset.join); });
    app.querySelectorAll('[data-back]').forEach(b => b.onclick = () => { nav('/t/' + b.dataset.back); joinCode(b.dataset.back); });
    const tr = $('#hs-track'), dots = $('#hs-dots');
    if (tr && dots) tr.onscroll = () => { const i = Math.round(tr.scrollLeft / tr.clientWidth); dots.querySelectorAll('i').forEach((d, j) => d.classList.toggle('on', i === j)); };
  };
  return { html, bind };
}

// "View all": every table as a compact tile, with filters.
function renderAllTables() {
  S.view = 'alltables';
  const list = filteredTables();
  app.innerHTML = `<div class="page">
    ${pageBar('Active games')}
    ${gameChips()}
    <label class="switch hide-full"><input type="checkbox" id="hide-full" ${S.hideFull ? 'checked' : ''}> Hide full tables</label>
    ${list.length ? `<div class="glist">${list.map(tableRow).join('')}</div>` : '<div class="empty card-empty"><p>No tables match.</p></div>'}
  </div>`;
  enter();
  $('#pg-back').onclick = goLobby;
  bindGameChips(renderAllTables);
  $('#hide-full').onchange = e => { S.hideFull = e.target.checked; renderAllTables(); };
  app.querySelectorAll('[data-join]').forEach(b => b.onclick = () => { nav('/t/' + b.dataset.join); joinCode(b.dataset.join); });
}

// The + in the middle of the tab bar.
function openPlusSheet() {
  openSheet(`<h2>New game</h2><div class="list">
    <button class="lrowbtn" id="ps-new">${TICON.plus}<div class="lr-txt"><b>Start a table</b><span>Hold’em or Omaha, 5 to 9 seats</span></div>${TICON.chev}</button>
    <button class="lrowbtn" id="ps-tour">${TICON.games}<div class="lr-txt"><b>Host a tournament</b><span>Blind levels, payouts, a winner</span></div>${TICON.chev}</button>
    <button class="lrowbtn" id="ps-join">${TICON.key}<div class="lr-txt"><b>Join with code</b><span>Got an invite from a friend?</span></div>${TICON.chev}</button>
  </div>`, () => {
    $('#ps-new').onclick = () => { closeModal(); openNewTable(); };
    $('#ps-join').onclick = () => { closeModal(); openJoinCode(); };
    $('#ps-tour').onclick = () => { closeModal(); openHostTourney(); };
  });
}

const blindLabel = k => { const st = STAKES.find(x => x[0] === k); return st ? blinds(st[1], st[2]) : ''; };
function openNewTable() {
  const me = S.me;
  openSheet(`
    <h2>Start a table</h2>
    <input id="tname" maxlength="28" placeholder="${esc(me.name)}'s table" aria-label="Table name">
    <span class="lbl">Game</span>
    <div class="seg2 game-seg" role="radiogroup" aria-label="Game"><button type="button" role="radio" data-game="nlh" aria-checked="${S.game !== 'plo'}">No-Limit Hold’em</button><button type="button" role="radio" data-game="plo" aria-checked="${S.game === 'plo'}">Pot-Limit Omaha</button></div>
    <span class="lbl">Seats</span>
    <div class="seatpick" role="radiogroup" aria-label="Table size">${[5, 6, 7, 8, 9].map(n => `<button type="button" role="radio" data-seats="${n}" aria-checked="${(S.seats || 6) === n}"><b>${n}</b><span>${n === 9 ? 'full ring' : n === 6 ? '6-max' : 'seats'}</span></button>`).join('')}</div>
    <span class="lbl">Blinds</span>
    <div class="books">${STAKES.map(([k, sb, bb]) => `<button type="button" class="book" data-st="${k}" aria-pressed="${S.stakes === k}"><span class="cover">${blinds(sb, bb)}</span><span class="strike"></span><span class="buy">Max buy-in ${money(bb * 100)}</span></button>`).join('')}</div>
    <label class="switch"><input type="checkbox" id="tpriv" ${S.isPrivate ? 'checked' : ''}> Private: only people with the link can join</label>
    <button class="btn primary" id="create-go">Open the table</button>`, () => {
    document.querySelectorAll('[data-st]').forEach(b => b.onclick = () => {
      S.stakes = b.dataset.st;
      document.querySelectorAll('[data-st]').forEach(x => x.setAttribute('aria-pressed', x.dataset.st === S.stakes));
    });
    $('#tpriv').onchange = e => { S.isPrivate = e.target.checked; };
    document.querySelectorAll('[data-seats]').forEach(b => b.onclick = () => {
      S.seats = +b.dataset.seats;
      document.querySelectorAll('[data-seats]').forEach(x => x.setAttribute('aria-checked', +x.dataset.seats === S.seats));
    });
    document.querySelectorAll('[data-game]').forEach(b => b.onclick = () => {
      S.game = b.dataset.game;
      document.querySelectorAll('[data-game]').forEach(x => x.setAttribute('aria-checked', x.dataset.game === S.game));
    });
    $('#create-go').onclick = () => { closeModal(); send({ t: 'create', name: $('#tname') ? $('#tname').value : '', stakes: S.stakes, isPrivate: S.isPrivate, game: S.game === 'plo' ? 'plo' : 'nlh', seats: S.seats || 6 }); };
  });
}
function openJoinCode() {
  openSheet(`<h2>Join with a code</h2><p class="wait">Ask whoever started the table for its 5-letter code.</p>
    <form class="join-row" id="joinf"><input id="jcode" maxlength="8" placeholder="TG626" autocomplete="off" aria-label="Table code" autocapitalize="characters"><button class="btn primary" type="submit">Join</button></form>`, () => {
    $('#jcode').focus();
    $('#joinf').onsubmit = e => {
      e.preventDefault();
      const code = $('#jcode').value.trim().toUpperCase();
      if (!code) return;
      closeModal(); nav('/t/' + code); joinCode(code);
    };
  });
}

function tabGames() {
  const html = `
    ${largeTitle('Home games')}
    <p class="lead">A private table for your group. Pick the game and blinds, then send the code.</p>
    <div class="list">
      <button class="lrowbtn" id="new-table">${TICON.plus}<div class="lr-txt"><b>Start a table</b><span>Hold’em or Omaha, 5 to 9 seats</span></div>${TICON.chev}</button>
      <button class="lrowbtn" id="host-t2">${TICON.games}<div class="lr-txt"><b>Host a tournament</b><span>Blind levels, payouts, a winner</span></div>${TICON.chev}</button>
      <button class="lrowbtn" id="join-code">${TICON.key}<div class="lr-txt"><b>Join with code</b><span>Six letters from whoever is hosting</span></div>${TICON.chev}</button>
    </div>
    <p class="fine left">Coming later: a tracker for in-person games, settle-up, and a blind timer.</p>`;
  const bind = () => { $('#new-table').onclick = openNewTable; $('#join-code').onclick = openJoinCode; $('#host-t2').onclick = openHostTourney; };
  return { html, bind };
}

function tabSocial() {
  const me = S.me, L = S.lobby || { leaderboard: [] };
  S.socialSeg = S.socialSeg || 'board';
  const board = S.socialSeg === 'board';
  const html = `
    ${largeTitle('Social')}
    <div class="seg2" role="tablist"><button role="tab" data-seg="board" aria-selected="${board}">Leaderboard</button><button role="tab" data-seg="crews" aria-selected="${!board}">Crews</button></div>
    ${board ? `<section class="panel">
      <div class="sec-head"><h2>High Rollers</h2><span class="lbl">All time</span></div>
      ${!S.lobby ? skelRows(4) : L.leaderboard.length ? `<div class="rows">${L.leaderboard.map((p, i) => `
        <div class="lrow ${i === 0 ? 'first' : ''} ${p.id === me.id ? 'me' : ''}"><span class="rk">${i + 1}</span>${avatarHTML(p.avatar, p.name)}<span class="nm">${esc(p.name)}${vipStar(p.avatar)}</span>
        <span class="num ${p.net > 0 ? 'up' : p.net < 0 ? 'down' : ''}">${signedMoney(p.net)}</span><span class="h">${count(p.hands)} hands</span></div>`).join('')}</div>`
        : '<div class="empty"><p>Nobody’s on the board yet.</p><p class="sub">Play a hand to claim the top spot.</p></div>'}
    </section>` : `
    <div class="empty card-empty"><p>Crews aren’t open yet.</p><p class="sub">Your group’s own leaderboard, seasons and rivalries. Coming with friend accounts.</p></div>`}`;
  const bind = () => app.querySelectorAll('[data-seg]').forEach(b => b.onclick = () => { S.socialSeg = b.dataset.seg; renderTabs(); });
  return { html, bind };
}

function tabWallet() {
  const me = S.me, C = S.catalog;
  const txs = me.transactions || [];
  const pending = txs.filter(t => t.status === 'pending').length;
  const html = `
    ${largeTitle('Wallet')}
    <section class="balance-card">
      <div class="bc-top"><div class="bc-amt"><span class="lbl">Balance</span>
      <span class="big">${chipNum(me.bankroll)}</span></div></div>
      <span class="sub">${me.atTables ? `${money(me.atTables)} at tables · ` : ''}${pending ? `${pending} transfer${pending > 1 ? 's' : ''} on the way · ` : ''}Test mode</span>
      <div class="acts"><button class="btn primary" id="w-dep">Deposit</button><button class="btn" id="w-wd">Withdraw</button></div>
    </section>
    <p class="fine left">Deposits and standard withdrawals are free. Instant transfers cost ${C ? C.fees.instantPct : 1.5}% (min ${money(C ? C.fees.instantMinCents : 50)}).</p>
    <section class="sec">
      <div class="sec-head"><h2>Activity</h2>${txs.length > 5 ? '<button class="textbtn" id="w-all">See all</button>' : ''}</div>
      ${txs.length ? `<div class="list">${txs.slice(0, 5).map(t => `
        <div class="lrowbtn static"><span class="txicon ${t.type}">${t.type === 'deposit' ? '↓' : '↑'}</span><div class="lr-txt"><b>${t.type === 'deposit' ? 'Deposit' : 'Withdrawal'}</b><span>${t.speed === 'instant' ? 'Instant' : 'Standard'} · ${new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></div>
        <div class="txr"><span class="num ${t.type === 'deposit' ? 'up' : ''}">${t.type === 'deposit' ? '+' : '−'}${money(t.type === 'deposit' ? t.net : t.amount)}</span><span class="pill ${t.status}">${t.status === 'pending' ? 'On the way' : 'Done'}</span></div></div>`).join('')}</div>`
        : '<div class="empty card-empty"><p>No activity yet.</p><p class="sub">Deposits and withdrawals will show up here.</p></div>'}
    </section>
    <button class="club-banner" id="w-club"><span><span class="lbl">${me.club && me.club.active ? 'Member' : `Pro Pass · ${money(499)}/mo`}</span><b>${me.club && me.club.active ? 'Pro Pass themes & avatars' : 'Unlock themes and avatars'}</b></span>${TICON.chev}</button>
    ${me.canRefill ? '<button class="textbtn" id="refill">Reload play money (back to $1,000)</button>' : ''}`;
  const bind = () => {
    $('#w-dep').onclick = () => renderCashier('deposit');
    $('#w-wd').onclick = () => renderCashier('withdraw');
    const all = $('#w-all'); if (all) all.onclick = () => renderCashier();
    $('#w-club').onclick = () => renderClub();
    const r = $('#refill'); if (r) r.onclick = () => send({ t: 'refill' });
  };
  return { html, bind };
}

function tabMe() {
  const me = S.me;
  const per = (me.periods && me.periods[S.period]) || me.stats;
  const winRate = per.hands ? Math.round((per.won / per.hands) * 100) : 0;
  const theme = ((S.catalog && S.catalog.themes.find(t => t.id === me.theme)) || { name: 'Black Room' }).name;
  const html = `
    ${largeTitle('Profile')}
    <section class="profile-card">
      ${avatarHTML(me.avatar, me.name)}
      <div class="pc-txt"><b>${esc(me.name)}${me.vip ? '<span class="vipstar" role="img" aria-label="VIP">★</span>' : ''}</b><span>${me.guest ? 'Playing as a guest' : esc(me.email || '')}</span></div>
      <button class="btn small" id="p-edit">Edit</button>
    </section>
    <section class="panel">
      <div class="sec-head"><h2>Your stats</h2>
        <label class="period"><span class="sr">Show stats for</span><select id="period">${PERIODS.map(([k, l]) => `<option value="${k}" ${S.period === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <div class="stats">
        <div class="stat"><b class="${per.net > 0 ? 'up' : per.net < 0 ? 'down' : ''}">${signedMoney(per.net)}</b><span>Net</span></div>
        <div class="stat"><b>${count(per.hands)}</b><span>Hands</span></div>
        <div class="stat"><b>${winRate}%</b><span>Won</span></div>
        <div class="stat"><b>${money(per.biggestPot)}</b><span>Best pot</span></div>
      </div>
    </section>
    <div class="list">
      <button class="lrowbtn" id="p-wallet"><div class="lr-txt"><b>Wallet</b><span>${money(me.bankroll)} · deposit or withdraw</span></div>${TICON.chev}</button>
      <button class="lrowbtn" id="p-club"><div class="lr-txt"><b>Pro Pass & themes</b><span>${me.club && me.club.active ? 'Member · ' : ''}${esc(theme)}</span></div>${TICON.chev}</button>
      <button class="lrowbtn" id="p-edit2"><span class="pmini">${portrait(me.avatar, me.name)}</span><div class="lr-txt"><b>Your character</b><span>${me.specials && me.specials.length ? `${me.specials.length} special${me.specials.length > 1 ? 's' : ''} to wear · ` : ''}How you look at the table</span></div>${TICON.chev}</button>
      ${me.admin ? `<button class="lrowbtn" id="p-admin"><div class="lr-txt"><b>Players</b><span>Admin: change looks, give out specials</span></div>${TICON.chev}</button>` : ''}
    </div>
    <p class="fine left">Budgets, cool-offs and identity checks arrive before real money does.</p>
    <div class="list"><button class="lrowbtn danger" id="p-logout"><div class="lr-txt"><b>Log out</b></div></button></div>`;
  const bind = () => {
    $('#p-edit').onclick = renderProfileEdit;
    $('#p-edit2').onclick = renderProfileEdit;
    const ad = $('#p-admin'); if (ad) ad.onclick = () => { S.adminList = null; renderAdmin(); };
    $('#p-club').onclick = () => renderClub();
    $('#p-wallet').onclick = () => { S.tab = 'wallet'; renderTabs(); };
    $('#period').onchange = e => { S.period = e.target.value; store.set('pokr.period', S.period); renderTabs(); };
    $('#p-logout').onclick = () => { store.set('pokr.token', ''); S.token = null; S.tab = 'play'; send({ t: 'logout' }); };
  };
  return { html, bind };
}

// bottom sheet on phones, centered card on computers
function openSheet(html, after) {
  $('#modal').innerHTML = `<div class="mscrim sheetish"><div class="panel dialog" role="dialog" aria-modal="true"><span class="grab" aria-hidden="true"></span><button type="button" class="sheet-cancel" data-close>Cancel</button>${html}</div></div>`;
  const scrim = $('#modal .mscrim');
  scrim.onclick = e => { if (e.target === scrim || e.target.hasAttribute('data-close')) closeModal(); };
  if (after) after();
}

/* ---------------- Pro Pass: themes + avatars ---------------- */
const THEME_LOOK = {
  lounge: { wall: '#7A1520', felt: '#1A6B52', accent: '#D9A84E' },
  neon: { wall: '#1B1035', felt: '#3A1D6E', accent: '#FF4FB8' },
  monaco: { wall: '#1E2D52', felt: '#1C4E8A', accent: '#D6B26A' },
  zebra: { wall: '#F2EDE4', felt: '#8E1520', accent: '#F2EDE4' },
};
function pageBar(title) {
  return `<div class="pagebar"><button class="btn small ghost" id="pg-back">‹ Back</button><h1 class="pb-title">${title}</h1><span class="pb-gap"></span></div>`;
}
function renderClub() {
  leaveTableView();
  S.view = 'club';
  const me = S.me, C = S.catalog;
  if (!me || !C) { goLobby(); return; }
  const member = me.club && me.club.active;
  const ava = i => `<span class="ava" style="--ac:${COLORS[i % 8]}">${AVATARS[i]}</span>`;
  app.innerHTML = `
  <div class="page">
    ${pageBar('Pro Pass')}
    <section class="panel club-hero">
      <span class="lbl">${member ? 'You’re a member' : 'Membership'}</span>
      <div class="price"><span class="num">${money(C.club.priceCents)}</span><span>/ month</span></div>
      <ul class="perks"><li>Six table rooms, each with its own felt and walls</li><li>Three app themes</li><li>Cowboy hat, fedora and bandana, plus gold and white jackets</li><li>New looks added as we make them</li></ul>
      ${member
        ? `<p class="wait">Renews ${new Date(me.club.renewsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.</p><button class="textbtn" id="club-cancel">Cancel membership</button>`
        : `<button class="btn primary" id="club-join">Get Pro Pass</button>`}
      <p class="test">Test mode: nothing is charged yet.</p>
    </section>
    <section class="panel">
      <h2>Table rooms</h2>
      ${feltPickerHTML(me, C, member)}
    </section>
    <section class="panel">
      <h2>App themes</h2>
      <div class="themes">${C.themes.map(t => {
        const look = THEME_LOOK[t.id] || THEME_LOOK.lounge;
        const using = me.theme === t.id, locked = t.club && !member;
        return `<button class="theme ${using ? 'using' : ''}" data-theme="${t.id}" ${locked ? 'data-locked="1"' : ''}>
          <span class="thumb t-${t.id}" style="--wall:${look.wall};--felt:${look.felt};--acc:${look.accent}"><span class="oval"></span></span>
          <span class="tname">${esc(t.name)}</span><span class="tblurb">${esc(t.blurb)}</span>
          <span class="tstate">${using ? 'In use' : locked ? 'Pro Pass' : 'Use this'}</span></button>`;
  enter();
      }).join('')}</div>
    </section>
    <section class="panel">
      <h2>Pro Pass looks</h2>
      <p class="wait">Extra parts for your character. Specials can’t be bought; they’re given out.</p>
      <div class="lookgrid club">${[8, 9, 10].map(i => `<div class="lookopt static">${drawLook({ ...lookOf(me.avatar, me.name), lk: i, sp: '' })}<span>${LOOK_NAMES[i]}</span></div>`).join('')}
        ${[8, 9].map(i => `<div class="lookopt static">${drawLook({ ...lookOf(me.avatar, me.name), jk: i, sp: '' })}<span>${i === 8 ? 'Gold jacket' : 'White jacket'}</span></div>`).join('')}</div>
      <button class="btn" id="club-look">Open your character</button>
      <p class="test">Test mode: nothing is charged, and it never comes out of your poker balance.</p>
    </section>
  </div>`;
  $('#pg-back').onclick = goLobby;
  const j = $('#club-join'); if (j) j.onclick = () => send({ t: 'club', action: 'join' });
  const c = $('#club-cancel'); if (c) c.onclick = () => openModal(`<h2>Cancel Pro Pass?</h2><p class="wait">You’ll go back to the Black Room theme, and any Pro Pass parts come off your character.</p><div class="acts"><button class="btn" data-close>Keep it</button><button class="btn primary" id="cc-go">Cancel membership</button></div>`, () => { $('#cc-go').onclick = () => { closeModal(); send({ t: 'club', action: 'cancel' }); }; });
  app.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => {
    if (b.dataset.locked) { toast('That theme comes with Pro Pass'); return; }
    send({ t: 'setTheme', theme: b.dataset.theme });
  });
  $('#club-look').onclick = renderProfileEdit;
  bindFeltPicker(app);
}
function feltPickerHTML(me, C, member) {
  return `<div class="felts">${(C.felts || []).map(f => {
    const using = (me.felt || 'green') === f.id, locked = f.club && !member;
    return `<button class="feltopt ${using ? 'using' : ''}" data-felt="${f.id}" ${locked ? 'data-locked="1"' : ''} aria-pressed="${using}">
      <span class="fswatch" style="--f:${f.felt};--fd:${f.deep}"></span><span class="fname">${esc(f.name)}</span>
      <span class="fstate">${using ? 'In use' : locked ? 'Pro Pass' : 'Use'}</span></button>`;
  }).join('')}</div>`;
}
function bindFeltPicker(root) {
  root.querySelectorAll('[data-felt]').forEach(b => b.onclick = () => {
    if (b.dataset.locked) { toast('That felt comes with Pro Pass', ['See Pro Pass', () => { closeModal(); renderClub(); }]); return; }
    document.body.dataset.felt = b.dataset.felt;
    send({ t: 'setFelt', felt: b.dataset.felt });
    root.querySelectorAll('[data-felt]').forEach(x => { const on = x === b; x.classList.toggle('using', on); x.setAttribute('aria-pressed', on); const st = x.querySelector('.fstate'); if (st && !x.dataset.locked) st.textContent = on ? 'In use' : 'Use'; });
  });
}

/* ---------------- Cashier ---------------- */
function feeFor(amount, speed) {
  const F = S.catalog && S.catalog.fees;
  if (speed !== 'instant' || !F) return 0;
  return Math.max(F.instantMinCents, Math.round(amount * F.instantPct / 100));
}
function renderCashier(tab) {
  leaveTableView();
  S.view = 'cashier';
  if (tab) S.cashTab = tab;
  const me = S.me, C = S.catalog;
  if (!me || !C) { goLobby(); return; }
  const dep = S.cashTab !== 'withdraw';
  const F = C.fees;
  const txs = me.transactions || [];
  const pending = txs.filter(t => t.status === 'pending');
  app.innerHTML = `
  <div class="page">
    ${pageBar('Cashier')}
    <section class="panel bank">
      <span class="lbl">Balance</span>
      <span class="num big">${money(me.bankroll)}</span>
      ${pending.length ? `<span class="wait">${pending.length} transfer${pending.length > 1 ? 's' : ''} on the way</span>` : ''}
    </section>
    <form class="panel cashier" id="cash" novalidate>
      <div class="seg2" role="tablist">
        <button type="button" role="tab" aria-selected="${dep}" data-tab="deposit">Deposit</button>
        <button type="button" role="tab" aria-selected="${!dep}" data-tab="withdraw">Withdraw</button>
      </div>
      <div class="field"><label class="lbl" for="cash-amt">Amount</label>
        <div class="money-in"><span>$</span><input id="cash-amt" inputmode="decimal" autocomplete="off" placeholder="0" value="${S.cashAmt || ''}"></div></div>
      <div class="quick">${[20, 50, 100, 250].map(v => `<button type="button" class="btn small" data-q="${v}">$${v}</button>`).join('')}</div>
      <div class="speeds" role="radiogroup" aria-label="Speed">
        <label class="speed"><input type="radio" name="speed" value="standard" ${S.cashSpeed !== 'instant' ? 'checked' : ''}><span class="sp-name">Standard</span><span class="sp-fee free">Free</span><span class="sp-time">1–3 business days</span></label>
        <label class="speed"><input type="radio" name="speed" value="instant" ${S.cashSpeed === 'instant' ? 'checked' : ''}><span class="sp-name">Instant</span><span class="sp-fee">${F.instantPct}% fee</span><span class="sp-time">Right away · min ${money(F.instantMinCents)}</span></label>
      </div>
      <div class="summary" id="cash-sum"></div>
      <button class="btn primary" type="submit" id="cash-go">${dep ? 'Deposit' : 'Withdraw'}</button>
      <p class="test">Test mode: no card or bank is charged, and standard transfers finish in about a minute. Real money needs ID verification and a payment partner before launch.</p>
    </form>
    <section class="panel">
      <h2>History</h2>
      ${txs.length ? `<div class="rows">${txs.map(t => `
        <div class="txrow"><span class="txicon ${t.type}">${t.type === 'deposit' ? '↓' : '↑'}</span>
          <div class="txt"><span class="nm">${t.type === 'deposit' ? 'Deposit' : 'Withdrawal'} · ${t.speed === 'instant' ? 'Instant' : 'Standard'}</span>
          <span class="lbl">${new Date(t.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${t.fee ? ` · fee ${money(t.fee)}` : ''}</span></div>
          <div class="txr"><span class="num ${t.type === 'deposit' ? 'up' : ''}">${t.type === 'deposit' ? '+' : '−'}${money(t.type === 'deposit' ? t.net : t.amount)}</span><span class="pill ${t.status}">${t.status === 'pending' ? 'On the way' : 'Done'}</span></div></div>`).join('')}</div>`
        : '<div class="empty"><p>No deposits or withdrawals yet.</p><p class="sub">Your transfers will show up here with their status.</p></div>'}
    </section>
  </div>`;
  enter();
  $('#pg-back').onclick = goLobby;
  app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => renderCashier(b.dataset.tab));
  const amtIn = $('#cash-amt');
  const cents = () => Math.round((parseFloat(String(amtIn.value).replace(/[^0-9.]/g, '')) || 0) * 100);
  const speed = () => app.querySelector('input[name=speed]:checked').value;
  const update = () => {
    S.cashAmt = amtIn.value; S.cashSpeed = speed();
    const a = cents(), fee = feeFor(a, speed());
    const rows = dep
      ? [['Amount', money(a)], ['Fee', fee ? money(fee) : 'Free'], ['Added to your balance', money(Math.max(0, a - fee))]]
      : [['Amount', money(a)], ['Fee', fee ? money(fee) : 'Free'], ['Taken from your balance', money(a + fee)]];
    $('#cash-sum').innerHTML = rows.map(([k, v], i) => `<div class="${i === 2 ? 'tot' : ''}"><span>${k}</span><span class="num">${v}</span></div>`).join('');
    $('#cash-go').textContent = a ? `${dep ? 'Deposit' : 'Withdraw'} ${money(a)}` : (dep ? 'Deposit' : 'Withdraw');
  };
  amtIn.oninput = update;
  app.querySelectorAll('input[name=speed]').forEach(r => r.onchange = update);
  app.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { amtIn.value = b.dataset.q; update(); });
  $('#cash').onsubmit = e => {
    e.preventDefault();
    const a = cents();
    if (a < C.limits.minCents) { toast(`The minimum is ${money(C.limits.minCents)}`); return; }
    send({ t: 'cashier', action: dep ? 'deposit' : 'withdraw', amount: a, speed: speed() });
    S.cashAmt = '';
  };
  update();
}

/* ---------------- table ---------------- */
function renderTableShell() {
  S.skipAnim = true; S.boardHand = null; S.dealHand = null;
  app.innerHTML = `
  <div class="tbl">
    <header class="tbar">
      <div class="session" id="session"></div>
      <div class="corner" id="corner"></div>
      <div class="menu" id="menu" role="menu" hidden></div>
    </header>
    <div class="stage" id="stage"></div>
    <section class="mine" id="mine"></section>
  </div>`;
  enter();
  renderCorner();
}

function renderCorner() {
  const el = $('#corner');
  if (!el) return;
  el.innerHTML = `
    <button class="icon-btn" id="chatBtn" aria-label="Open chat" aria-expanded="${S.chatOpen}">${ICON.chat}${S.unread ? '<span class="dot"></span>' : ''}</button>
    <button class="icon-btn" id="menuBtn" aria-label="Table menu" aria-haspopup="menu" aria-expanded="${S.menuOpen}">${ICON.menu}</button>`;
  $('#chatBtn').onclick = () => (S.chatOpen ? closeChat() : openChat());
  $('#menuBtn').onclick = e => { e.stopPropagation(); S.menuOpen ? closeMenu() : openMenu(); };
}

function renderSession() {
  const T = S.table, el = $('#session');
  if (!el || !T) return;
  if (T.tourney) {
    const h = T.tourney;
    S.levelEndsAt = performance.now() + (h.nextLevelMs || 0);
    el.innerHTML = `<span class="lbl">${h.finalTable ? 'Final table · ' : ''}Level ${h.level}</span>
      <b class="tclock">${fmt(h.sb)}/${fmt(h.bb)}<small> · ante ${fmt(h.ante)}</small></b>
      <span class="tmeta">${h.status === 'running' ? `Next <span id="lvl-cd">${clock(h.nextLevelMs)}</span> · ` : ''}${h.left}/${h.entries} left${h.rank ? ` · you’re ${ordinal(h.rank)}` : ''}</span>`;
    return;
  }
  if (T.you < 0) { el.innerHTML = `<span class="lbl">Watching · ${blinds(T.sb, T.bb)}</span><span class="watch">${esc(T.name)}</span>`; return; }
  const n = T.net || 0;
  const label = n > 0 ? 'Up this table' : n < 0 ? 'Down this table' : 'Even so far';
  el.innerHTML = `<span class="lbl">${label}</span><b class="${n > 0 ? 'up' : n < 0 ? 'down' : ''}">${signed(n)}</b>`;
}

/* menu */
function openMenu() {
  const T = S.table, menu = $('#menu');
  if (!T || !menu) return;
  const me = T.you >= 0 ? T.seats[T.you] : null;
  const inHand = me && T.phase === 'play' && me.dealt && !me.folded;
  const items = [
    ['invite', 'Invite friends', ICON.invite],
    ['felt', 'Table felt', ICON.felt],
    ['lobby', T.tourney ? 'Tournament lobby' : 'Back to lobby', ICON.lobby],
  ];
  if (T.tourney) items.splice(0, 1);
  const seated = [];
  if (me && !T.tourney) {
    if (me.sittingOut && me.chips > 0) seated.push(['back', 'I’m back', ICON.play]);
    else if (!me.sittingOut) seated.push(['out', 'Sit out next hand', ICON.pause]);
    if (!inHand && me.chips < T.buyIn.max) seated.push(['rebuy', 'Add chips', ICON.plus]);
    seated.push(['stand', 'Stand up', ICON.stand]);
  }
  menu.innerHTML = items.map(([k, l, i]) => `<button role="menuitem" data-m="${k}">${i}${l}</button>`).join('')
    + (seated.length ? '<hr>' + seated.map(([k, l, i]) => `<button role="menuitem" data-m="${k}">${i}${l}</button>`).join('') : '')
    + `<div class="meta">Blinds ${blinds(T.sb, T.bb)} · Code ${esc(T.code)}</div>`;
  menu.hidden = false;
  S.menuOpen = true;
  renderCorner();
  menu.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { closeMenu(); menuAction(b.dataset.m); });
  setTimeout(() => document.addEventListener('click', outsideMenu), 0);
}
function outsideMenu(e) { const m = $('#menu'); if (m && !m.contains(e.target)) closeMenu(); }
function closeMenu() {
  document.removeEventListener('click', outsideMenu);
  const m = $('#menu'); if (m) m.hidden = true;
  if (S.menuOpen) { S.menuOpen = false; renderCorner(); }
}
async function menuAction(k) {
  const T = S.table;
  if (k === 'invite') {
    if (PREVIEW) { openModal('<h2>Invites need the live version</h2><p class="wait">In this preview you play against bots. On the live site this copies a link your friends can open to join your table.</p><button class="btn primary" data-close>Got it</button>'); return; }
    const url = location.origin + '/t/' + T.code;
    if (await copy(url)) toast('Invite link copied');
    else openModal(`<h2>Invite friends</h2><p class="wait">Send them this link:</p><input readonly value="${esc(url)}" id="inv-url"><button class="btn primary" data-close>Done</button>`, () => $('#inv-url').select());
  } else if (k === 'felt') {
    const C = S.catalog, member = S.me && S.me.club && S.me.club.active;
    if (!C) return;
    openModal(`<h2>Table felt</h2>${feltPickerHTML(S.me, C, member)}<button class="btn" data-close>Done</button>`, () => bindFeltPicker($('#modal')));
  } else if (k === 'lobby' && T.tourney) {
    const id = T.tourney.id; leaveTableView(); renderTourney(id);
  } else if (k === 'lobby') {
    const me = T.you >= 0 ? T.seats[T.you] : null;
    if (me && T.phase === 'play' && me.dealt && !me.folded) openLeaveConfirm(); else leaveTable();
  } else if (k === 'out') { send({ t: 'sitout', out: true }); toast('You’ll sit out from the next hand'); }
  else if (k === 'back') send({ t: 'sitout', out: false });
  else if (k === 'rebuy') openBuyIn(T.you, true);
  else if (k === 'stand') send({ t: 'stand' });
}

/* chat sheet */
function openChat() {
  closeMenu();
  S.chatOpen = true; S.unread = false;
  let root = $('#chatroot');
  if (!root) { root = document.createElement('div'); root.id = 'chatroot'; document.body.appendChild(root); }
  root.innerHTML = `
    <div class="scrim" id="chatScrim"></div>
    <aside class="sheet" role="dialog" aria-label="Table chat">
      <div class="grab"></div>
      <div class="sheet-head">
        <div class="tabs" role="tablist">
          <button role="tab" id="tab-chat" aria-selected="${S.sideTab === 'chat'}">Chat</button>
          <button role="tab" id="tab-hist" aria-selected="${S.sideTab === 'hist'}">Hand history</button>
        </div>
        <button class="close" id="chatClose" aria-label="Close chat">×</button>
      </div>
      <div class="feed" id="feed"></div>
      <div class="reacts" id="reacts">${REACTIONS.map(e => `<button data-r="${e}" aria-label="React ${e}">${e}</button>`).join('')}</div>
      <form class="composer" id="chatform"><input id="chatin" maxlength="200" placeholder="Say something…" autocomplete="off" aria-label="Chat message"><button class="btn primary small" type="submit">Send</button></form>
    </aside>`;
  $('#chatScrim').onclick = closeChat;
  // drag the sheet down to dismiss it, like a native sheet
  const sheet = root.querySelector('.sheet'), handle = root.querySelector('.sheet-head').parentElement.querySelector('.grab');
  let y0 = null, dy = 0;
  const startDrag = e => { if (isWide()) return; y0 = e.clientY; dy = 0; sheet.style.transition = 'none'; sheet.setPointerCapture(e.pointerId); };
  const moveDrag = e => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); sheet.style.transform = `translateY(${dy}px)`; };
  const endDrag = () => {
    if (y0 === null) return; y0 = null;
    sheet.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1)';
    if (dy > 90) { sheet.style.transform = 'translateY(100%)'; setTimeout(closeChat, 200); } else sheet.style.transform = '';
  };
  for (const zone of [handle, root.querySelector('.sheet-head')]) zone.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; startDrag(e); });
  sheet.addEventListener('pointermove', moveDrag);
  sheet.addEventListener('pointerup', endDrag);
  sheet.addEventListener('pointercancel', endDrag);
  $('#chatClose').onclick = closeChat;
  $('#tab-chat').onclick = () => { S.sideTab = 'chat'; renderFeed(); };
  $('#tab-hist').onclick = () => { S.sideTab = 'hist'; renderFeed(); };
  root.querySelectorAll('[data-r]').forEach(b => b.onclick = () => send({ t: 'react', e: b.dataset.r }));
  $('#chatform').onsubmit = e => {
    e.preventDefault();
    const v = $('#chatin').value.trim();
    if (!v) return;
    send({ t: 'chat', text: v });
    $('#chatin').value = '';
    if (S.sideTab !== 'chat') { S.sideTab = 'chat'; renderFeed(); }
  };
  renderFeed();
  renderCorner();
  if (isWide()) $('#chatin').focus();
}
function closeChat() {
  const root = $('#chatroot'); if (root) root.innerHTML = '';
  if (S.chatOpen) { S.chatOpen = false; renderCorner(); }
}

function renderFeed() {
  const feed = $('#feed');
  if (!feed) return;
  $('#tab-chat').setAttribute('aria-selected', S.sideTab === 'chat');
  $('#tab-hist').setAttribute('aria-selected', S.sideTab === 'hist');
  $('#chatform').hidden = S.sideTab !== 'chat';
  $('#reacts').hidden = S.sideTab !== 'chat';
  if (S.sideTab === 'chat') {
    feed.innerHTML = S.chat.length ? S.chat.map(m => m.sys
      ? `<div class="msg sys">${esc(m.text)}</div>`
      : `<div class="msg">${avatarHTML(m.avatar, m.name)}<div class="body"><span class="who">${esc(m.name)}${vipStar(m.avatar)}</span><span>${esc(m.text)}</span></div></div>`).join('')
      : '<div class="empty"><p>It’s quiet in here.</p><p class="sub">Say hi, or send a reaction.</p></div>';
  } else {
    const log = S.table ? S.table.log : [];
    feed.innerHTML = log.length ? log.map(l => `<div class="histline ${/^Hand #/.test(l) ? 'h' : ''}">${esc(l)}</div>`).join('') : '<p class="empty-note">Hands will show up here.</p>';
  }
  feed.scrollTop = feed.scrollHeight;
}

function renderTable() {
  renderSession();
  renderStage();
  renderMine(false);
  S.skipAnim = false;
  if (S.chatOpen && S.sideTab === 'hist') renderFeed();
}

function bestSet(T) {
  if (T.phase !== 'done' || !T.result || T.result.foldWin) return null;
  const set = new Set();
  for (const w of T.result.winners) { const s = T.seats[w.seat]; if (s && s.best) s.best.forEach(c => set.add(c)); }
  return set;
}

// Seat spots as % of the stage for any table size. Index 0 is always the bottom (you); the rest
// go clockwise around the rail, spaced evenly along the oval and kept inside the screen.
function seatPos(n, k, wide) {
  const cx = 50, cy = wide ? 49 : 49, rx = wide ? 43 : 37.5, ry = wide ? 42 : 44.5;
  // Start at the bottom and go clockwise. Your seat at the bottom gets a wider gap
  // so your cards have room beside you, the way a real card room seats it.
  const gap = n >= 5 ? ((wide ? 112 : 130) * Math.PI) / 180 : (Math.PI * 2) / n;
  const a = k === 0 ? Math.PI / 2 : Math.PI / 2 + gap / 2 + ((k - 1) * (Math.PI * 2 - gap)) / Math.max(1, n - 2);
  let x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a);
  x = Math.max(wide ? 8 : 10.5, Math.min(wide ? 92 : 89.5, x));
  y = Math.max(4, Math.min(94, y));
  return [x, y];
}

function renderStage() {
  const T = S.table, stage = $('#stage');
  if (!stage) return;
  const wide = isWide();
  const n = T.seats.length, base = T.you >= 0 ? T.you : 0;
  const hi = bestSet(T);
  const meSeated = T.you >= 0;
  if (meSeated && !T.tourney) noteBlinds(T.game, T.sb, T.bb);
  const now0 = performance.now();
  // Showdown choreography, timed once per hand so re-renders don't restart it:
  // opponents' cards flip one player at a time, then the banner, then the chips fly to the winner.
  const revealing = T.seats.map((s, i) => s && i !== T.you && s.cards.length && s.cards[0] !== null ? i : -1).filter(i => i >= 0);
  if (S.revealHand !== T.handNo) { S.revealHand = T.handNo; S.revealAt = 0; S.revealOrder = []; S.bannerAt = 0; S.flownHand = S.flownHand === T.handNo ? T.handNo : S.flownHand; }
  if (revealing.length && !S.revealAt) { S.revealAt = S.skipAnim ? now0 - 5000 : now0 + 150; }
  revealing.forEach(i => { if (!S.revealOrder.includes(i)) S.revealOrder.push(i); });
  if (T.phase === 'done' && T.result && !S.bannerAt) {
    const flips = T.result.foldWin ? 0 : S.revealOrder.length;
    S.bannerAt = S.skipAnim ? now0 - 5000 : Math.max(now0 + 150, (S.revealAt || now0) + flips * 280 + 450);
    if (S.flownHand !== T.handNo && !S.skipAnim) {
      S.flownHand = T.handNo;
      const winners = T.result.winners.map(w => ({ seat: w.seat, amount: w.amount }));
      setTimeout(() => flyChips(winners), Math.max(0, S.bannerAt - now0 + 350));
    }
  }

  let msg = '', result = false;
  if (T.phase === 'waiting') {
    const seated = T.seats.filter(Boolean).length;
    msg = seated < 2 ? (T.isHost ? 'Waiting for players. Invite friends from the menu or add a bot.' : 'Waiting for players') : 'Dealing soon…';
  } else if (T.phase === 'done' && T.result) {
    result = true;
    const ws = T.result.winners;
    const nm = w => (w.seat === T.you ? 'You' : esc(w.name));
    if (ws.length === 1) msg = `${nm(ws[0])} ${ws[0].seat === T.you ? 'take' : 'takes'} ${fmt(ws[0].amount)}${ws[0].hand ? ` with ${ws[0].hand}` : ''}`;
    else msg = `Split pot: ${ws.map(w => `${nm(w)} ${fmt(w.amount)}`).join(', ')}`;
  } else if (T.phase === 'play') {
    const a = T.seats[T.toAct];
    msg = '';
  }
  // flop flips card by card; turn and river flip as they land (timed so re-renders don't restart it)
  const now = performance.now();
  if (S.boardHand !== T.handNo || T.board.length < S.boardSeen) { S.boardHand = T.handNo; S.boardSeen = S.skipAnim ? T.board.length : 0; S.flipAt = []; }
  if (T.board.length > S.boardSeen) {
    for (let i = S.boardSeen; i < T.board.length; i++) S.flipAt[i] = now + 60 + (i - S.boardSeen) * 190;
    S.boardSeen = T.board.length;
  }
  const board = [0, 1, 2, 3, 4].map(i => {
    const c = T.board[i];
    const t0 = S.flipAt[i];
    const anim = c !== undefined && t0 && now - t0 < 700;
    const cls = (hi && c !== undefined ? (hi.has(c) ? 'hi' : 'dim') : '') + (anim ? ' flip' : '');
    if (c === undefined && T.board.length >= 3) return cardHTML(null, 'waiting');
    return cardHTML(c === undefined ? undefined : c, cls, anim ? `animation-delay:${Math.round(t0 - now)}ms` : '');
  }).join('');
  const onTable = T.seats.reduce((a, s) => a + (s ? s.bet || 0 : 0), 0), collected = T.pot - onTable;
  const potPill = T.pot ? `<div class="pot2 ${result ? 'drain' : ''}"${result ? ` style="animation-delay:${Math.round(S.bannerAt + 350 - now0)}ms"` : ''}>${collected > 0 && onTable > 0 ? `<span class="p-coll">${chipStack(collected, T.bb)}<b>${fmt(collected)}</b></span>` : ''}<span class="p-total"><span class="lbl">Total pot</span><b>${fmt(T.pot)}</b></span></div>` : '<div class="pot2 ghost" aria-hidden="true"></div>';
  let html = `<div class="rail"><div class="trim"><div class="felt">
    <div class="felt-line" aria-hidden="true"></div>
    <div class="felt-mark" aria-hidden="true"><span class="logo">${LOGO}</span><span class="fm-game">${GAME_SHORT(T.game)}</span><span class="fm-bl">${T.tourney ? `${fmt(T.sb)}/${fmt(T.bb)}` : blinds(T.sb, T.bb)}</span></div>
    ${potPill}
    <div class="board" aria-label="Board${T.street ? ', ' + esc(T.street) : ''}">${board}</div>
    ${result ? winBanner(T, now0) : `<div class="fmsg">${msg}</div>`}
  </div></div></div>`;

  for (let i = 0; i < n; i++) {
    const k = (i - base + n) % n;
    const [x, y] = seatPos(n, k, wide);
    const s = T.seats[i];
    if (!s) {
      if (T.tourney || (meSeated && !(T.isHost && T.phase === 'waiting'))) continue;
      const inner = !meSeated && S.me ? `<button class="open" data-sit="${i}" aria-label="Sit in seat ${i + 1}">Sit</button>` : '<div class="open" aria-label="Open seat"></div>';
      const bot = T.isHost ? `<button class="textbtn addbot" data-bot="${i}">+ Bot</button>` : '';
      html += `<div class="seat empty" style="left:${x}%;top:${y}%" data-seat="${i}">${inner}${bot}</div>`;
      continue;
    }
    const isMe = i === T.you;
    const turn = T.phase === 'play' && T.toAct === i;
    const won = T.phase === 'done' && s.won > 0;
    const shown = !isMe && s.cards.length && s.cards[0] !== null;
    const cls = ['seat', isMe && 'me', turn && 'turn', won && 'won', s.folded && 'folded', (s.sittingOut || !s.connected) && 'away', shown && 'shown'].filter(Boolean).join(' ');
    const order = S.revealOrder.indexOf(i);
    const flipAt = shown && order >= 0 && S.revealAt ? S.revealAt + order * 280 : 0;
    const hole = isMe ? '' : s.cards.map((c, j) => {
      if (flipAt) {
        const t1 = flipAt + j * 70, flipping = now0 - t1 < 700;
        const keepHi = true;
        return cardHTML(c, (hi && keepHi && c !== null ? (hi.has(c) ? 'hi' : 'dim') : '') + (flipping ? ' flip' : ''), flipping ? `animation-delay:${Math.round(t1 - now0)}ms` : '');
      }
      const t0 = S.dealAt ? S.dealAt + j * 120 + 60 : 0;
      const anim = !shown && t0 && performance.now() - t0 < 500;
      return cardHTML(c, (hi && c !== null ? (hi.has(c) ? 'hi' : 'dim') : '') + (anim ? ' deal' : ''), anim ? `animation-delay:${Math.round(t0 - performance.now())}ms` : '');
    }).join('');
    // What they just did is a small tag above them; results sit under the plate.
    let tag = '', ttone = '', under = '', utone = '';
    const last = s.last || '';
    if (/^small blind/i.test(last)) { tag = 'SB'; ttone = 'blind'; }
    else if (/^big blind/i.test(last)) { tag = 'BB'; ttone = 'blind'; }
    else if (s.folded && T.phase === 'play') { tag = 'Fold'; ttone = 'fold'; }
    else if (last && T.phase === 'play' && !turn) {
      const allin = /\ball[ -]?in\b/i.test(last);
      tag = allin ? 'All in' : last.split(/\s+/)[0].replace(/s$/, '').replace(/^\w/, c => c.toUpperCase());
      ttone = allin ? 'allin' : /^(bet|raise)/i.test(last) ? 'raise' : 'call';
    }
    if (won) { under = `+${fmt(s.won)}`; utone = 'win'; }
    else if (!s.connected) { under = 'Away'; utone = 'away'; }
    else if (s.sittingOut && !s.dealt) { under = last === 'Busted' ? 'Busted' : 'Sitting out'; utone = 'away'; }
    const dealerHere = T.dealer === i && T.phase !== 'waiting';
    // Cards sit beside the plate: backs while they're in the hand, faces at showdown, yours face up.
    let fan = '';
    if (isMe && s.cards.length) {
      fan = s.cards.map((c, j) => {
        const t0 = S.dealAt ? S.dealAt + j * 120 : 0;
        const anim = t0 && now0 - t0 < 500;
        return cardHTML(c, (hi && c !== null ? (hi.has(c) ? 'hi' : 'dim') : '') + (anim ? ' deal' : ''), anim ? `animation-delay:${Math.round(t0 - now0)}ms` : '');
      }).join('');
    } else if (!isMe && s.cards.length && (shown || (!s.folded && T.phase === 'play'))) fan = hole;
    const side = (isMe ? 'right' : x < 50 ? 'right' : 'left') + (!isMe && Math.abs(y - 48) < 16 ? ' mid' : '');
    html += `<div class="${cls}" style="left:${x}%;top:${y}%" data-seat="${i}">
      <div class="sp2 ${side} ${specialOf(s.avatar) ? 'vip sp-' + specialOf(s.avatar) : ''}">
        ${tag ? `<span class="sp-tag ${ttone}">${tag}</span>` : ''}
        <div class="sp-fig">${portrait(s.avatar, s.name)}${dealerHere ? '<span class="sp-badge d" aria-label="Dealer">D</span>' : ''}</div>
        <div class="sp-plate"><span class="nm">${isMe ? esc(S.me ? S.me.name : 'You') : esc(s.name)}${vipStar(s.avatar)}</span><span class="ch">${fmt(s.chips)}</span>${turn ? '<span class="sp-timer" id="ring"></span>' : ''}</div>
        ${under ? `<span class="sp-under ${utone}">${under}</span>` : ''}
        ${fan ? `<div class="sp-fan n${s.cards.length} ${shown ? 'up' : ''} ${isMe ? 'myc' : ''}">${fan}</div>` : ''}
      </div>
      ${T.isHost && s.kind === 'bot' && T.phase === 'waiting' ? `<button class="kick" data-kick="${i}" aria-label="Remove ${esc(s.name)}">×</button>` : ''}
    </div>`;
    if (s.bet > 0) {
      const bx = x + (50 - x) * 0.4, by = y + (46 - y) * 0.4;
      html += `<div class="bet2" style="left:${bx}%;top:${by}%">${chipStack(s.bet, T.bb)}<span class="amt">${fmt(s.bet)}</span></div>`;
    }
  }
  stage.className = 'stage n' + n;
  stage.innerHTML = html;
  stage.querySelectorAll('[data-sit]').forEach(b => b.onclick = () => openBuyIn(+b.dataset.sit, false));
  stage.querySelectorAll('[data-bot]').forEach(b => b.onclick = () => send({ t: 'addBot', seat: +b.dataset.bot }));
  stage.querySelectorAll('[data-kick]').forEach(b => b.onclick = () => send({ t: 'removeBot', seat: +b.dataset.kick }));
}

// "Two pair, kings and nines" — big; "Mae takes $3.40" — small. Pops in once the cards are shown.
function winBanner(T, now) {
  const ws = T.result.winners;
  const nm = w => (w.seat === T.you ? 'You' : esc(w.name));
  const cap = t => t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  const head = ws.length > 1 ? 'Split pot' : (ws[0].hand ? cap(ws[0].hand) : 'Everyone folded');
  const sub = ws.length > 1 ? ws.map(w => `${nm(w)} ${fmt(w.amount)}`).join(' · ') + (ws[0].hand ? ` · ${esc(ws[0].hand)}` : '')
    : `${nm(ws[0])} ${ws[0].seat === T.you ? 'win' : 'wins'} ${fmt(ws[0].amount)}`;
  const t = S.bannerAt || now;
  const style = now - t < 600 ? ` style="animation-delay:${Math.round(t - now)}ms"` : '';
  return `<div class="winbanner ${ws.some(w => w.seat === T.you) ? 'mywin' : ''} ${now - t < 600 ? 'pop' : ''}"${style} aria-live="polite" aria-label="${head}. ${sub.replace(/"/g, '')}">
    <span class="wb-hand">${head}</span></div>`;
}

// Chips slide from the pot to each winner's seat, then the seat flashes the amount won.
function flyChips(winners) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const pot = document.querySelector('#stage .p-total') || document.querySelector('#stage .pot2');
  if (!pot || S.view !== 'table') return;
  const p = pot.getBoundingClientRect();
  const from = { x: p.left + p.width / 2, y: p.top + p.height / 2 };
  const colors = ['#C9A86A', '#F2F0EC', '#B8322A', '#2A2A2F'];
  winners.forEach((w, wi) => {
    const seat = document.querySelector(`#stage .seat[data-seat="${w.seat}"] .sp-plate`) || document.querySelector(`#stage .seat[data-seat="${w.seat}"]`);
    if (!seat) return;
    const r = seat.getBoundingClientRect();
    const to = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const n = 9;
    for (let k = 0; k < n; k++) {
      const c = document.createElement('i');
      c.className = 'flychip';
      c.style.setProperty('--c', colors[k % colors.length]);
      c.style.left = from.x + 'px'; c.style.top = from.y + 'px';
      document.body.appendChild(c);
      const jx = (Math.random() - .5) * 26, jy = (Math.random() - .5) * 14;
      const mid = { x: (from.x + to.x) / 2 + jx * 2, y: Math.min(from.y, to.y) - 30 + jy };
      const a = c.animate([
        { transform: `translate(-50%,-50%) translate(${jx}px,${jy}px) scale(.7)`, opacity: 0 },
        { transform: `translate(-50%,-50%) translate(${jx}px,${jy}px) scale(1)`, opacity: 1, offset: .12 },
        { transform: `translate(-50%,-50%) translate(${mid.x - from.x}px,${mid.y - from.y}px) scale(1)`, opacity: 1, offset: .55 },
        { transform: `translate(-50%,-50%) translate(${to.x - from.x}px,${to.y - from.y}px) scale(.6)`, opacity: .2 },
      ], { duration: 720, delay: wi * 160 + k * 45, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'both' });
      a.onfinish = () => c.remove();
    }
    setTimeout(() => {
      const plus = document.createElement('span');
      plus.className = 'wonfloat'; plus.textContent = '+' + fmt(w.amount);
      plus.style.left = to.x + 'px'; plus.style.top = (r.top - 4) + 'px';
      document.body.appendChild(plus);
      plus.animate([{ transform: 'translate(-50%,0)', opacity: 0 }, { transform: 'translate(-50%,-10px)', opacity: 1, offset: .2 }, { transform: 'translate(-50%,-34px)', opacity: 0 }], { duration: 1500, easing: 'ease-out' }).onfinish = () => plus.remove();
      seat.animate([{ boxShadow: '0 0 0 0 rgba(201,168,106,0)' }, { boxShadow: '0 0 0 3px rgba(201,168,106,.9), 0 0 30px rgba(201,168,106,.6)' }, { boxShadow: '0 0 0 0 rgba(201,168,106,0)' }], { duration: 900 });
      buzz(w.seat === (S.table && S.table.you) ? 25 : 6);
    }, wi * 160 + 9 * 45 + 650);
  });
}

function renderMine(force) {
  const T = S.table, el = $('#mine');
  if (!el || !T) return;
  const me = T.you >= 0 ? T.seats[T.you] : null;
  const A = T.actions;
  const myTurn = T.phase === 'play' && T.toAct === T.you && A;
  if (!myTurn) S.raiseOpen = false;
  const turnKey = myTurn ? `${T.handNo}:${T.street}:${A.currentBet}:${A.toCall}` : '';
  if (turnKey && turnKey !== S.lastTurnKey) { buzz(15); S.raiseTo = 0; }
  S.lastTurnKey = turnKey;
  const key = JSON.stringify([T.you, T.phase, T.handNo, T.toAct, A, me && [me.chips, me.cards, me.folded, me.sittingOut, me.last, me.bet, me.dealt], T.myHand, S.me && S.me.bankroll, isWide(), S.raiseOpen]);
  if (!force && key === S.actionKey) return;
  S.actionKey = key;

  if (!me && T.tourney) {
    el.className = 'mine';
    el.innerHTML = `<div class="t-watch"><p class="wait">You’re watching table ${T.tourney.tableNo || ''} of the ${esc(T.tourney.name)}.</p><button class="btn" id="tw-lobby">Tournament lobby</button></div>`;
    $('#tw-lobby').onclick = () => { const id = T.tourney.id; leaveTableView(); renderTourney(id); };
    return;
  }
  if (!me) {
    el.className = 'mine';
    el.innerHTML = `<p class="wait">Tap an open seat to sit down. Buy-ins run ${money(T.buyIn.min)} to ${money(T.buyIn.max)}, and you have <span class="num" style="color:var(--brass)">${money(S.me ? S.me.bankroll : 0)}</span>.</p>`;
    return;
  }

  el.className = 'mine' + (myTurn ? ' turn' : '') + (S.raiseOpen ? ' picking' : '') + (me.folded ? ' folded-hand' : '');
  const hi = bestSet(T);
  // deal-in animation for your two cards, once per hand
  const now = performance.now();
  if (me.cards.length && S.dealHand !== T.handNo) { S.dealHand = T.handNo; S.dealAt = S.skipAnim ? 0 : now + 150; renderStage(); }
  const cards = me.cards.length ? me.cards.map((c, i) => {
    const t0 = S.dealAt ? S.dealAt + i * 120 : 0;
    const anim = t0 && now - t0 < 500;
    return cardHTML(c, (hi ? (hi.has(c) ? 'hi' : 'dim') : '') + (anim ? ' deal' : ''), anim ? `animation-delay:${Math.round(t0 - now)}ms` : '');
  }).join('') : '';
  const inHand = T.phase === 'play' && me.dealt && !me.folded;
  let wait = 'next hand in a moment';
  if (inHand) wait = me.allIn ? 'you’re all in' : 'waiting on the table…';
  else if (T.phase === 'waiting') wait = 'waiting for another player';
  const handLine = me.folded && T.phase === 'play' ? 'folded' : (T.myHand || (myTurn ? '' : wait));
  const nHole = me.cards.length || (T.game === 'plo' ? 4 : 2);
  const hero = `<div class="hero slim"><span class="hand">${esc(handLine)}</span></div>`;
  let html = hero;

  if (myTurn) {
    // Two boxes: Fold and Check/Call. To bet or raise, drag the chip tower up: the Call box becomes "Raise to $X".
    const allInCall = !A.canCheck && A.toCall >= me.chips;
    const callTop = A.canCheck ? 'Check' : allInCall ? 'All in' : 'Call';
    const callSub = A.canCheck ? '' : fmt(Math.min(A.toCall, me.chips));
    S.callLabel = `<b>${callTop}</b>${callSub ? `<span>${callSub}</span>` : ''}`;
    html = `<div class="turnwrap ${A.canRaise ? '' : 'noraise'}"><div class="tw-left">${hero}
      <div class="dock two"><div class="turnbar" id="turnbar"></div>
        <button class="act-btn fold" id="a-fold" ${A.canCheck ? 'disabled' : ''}><b>Fold</b></button>
        <button class="act-btn call" id="a-call">${S.callLabel}</button>
      </div></div>
      ${A.canRaise ? towerHTML(A) : ''}</div>`;
  } else if (me.chips === 0 && !inHand) {
    html += `<div class="dock single"><button class="act-btn raise" id="a-rebuy"><b>Add chips</b></button></div>`;
  } else if (me.sittingOut && !inHand) {
    html += `<div class="dock single"><button class="act-btn raise" id="a-back"><b>I’m back</b></button></div>`;
  }
  el.innerHTML = html;

  const on = (id, fn) => { const b = el.querySelector('#' + id); if (b) b.onclick = fn; };
  const act = (kind, amount) => { buzz(); el.querySelectorAll('.act-btn, .pk-go').forEach(b => { b.disabled = true; }); send({ t: 'act', kind, amount }); };
  on('a-fold', () => act('fold'));
  on('a-call', () => { if (S.raiseTo) act('raise', S.raiseTo); else act(A.canCheck ? 'check' : 'call'); });
  on('a-back', () => send({ t: 'sitout', out: false }));
  on('a-rebuy', () => openBuyIn(T.you, true));
  if (myTurn && A.canRaise) bindTower(T, A);
}

// The chip tower: the bottom notch is "no raise"; drag up to raise, all the way up for all in (or the pot in PLO).
const CALL_ZONE = 0.07;
function towerHTML(A) {
  return `<div class="tower" id="tower" role="slider" tabindex="0" aria-label="${A.currentBet === 0 ? 'Bet' : 'Raise'} amount" aria-valuemin="0" aria-valuemax="${A.maxTo}">
    <span class="tw-cap top">${A.potLimit ? 'Pot' : 'All in'}</span>
    <div class="tw-track"><div class="tw-fill" id="tw-fill"></div><div class="tw-thumb" id="tw-thumb"><i></i><i></i><i></i></div></div>
    <span class="tw-cap bot">${A.currentBet === 0 ? 'Bet' : 'Raise'}</span>
  </div>`;
}
function bindTower(T, A) {
  const tw = $('#tower'), track = tw.querySelector('.tw-track');
  let dragging = false, lastStep = -1;
  const toValue = t => t < CALL_ZONE ? 0 : (t >= .995 ? A.maxTo : A.minTo + (A.maxTo - A.minTo) * Math.pow((t - CALL_ZONE) / (1 - CALL_ZONE), TOWER_EASE));
  const fromY = y => {
    const r = track.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (r.bottom - y) / r.height));
    setTower(toValue(t));
    const step = S.raiseTo ? Math.round(S.raiseTo / T.bb) : -1;
    if (step !== lastStep) { lastStep = step; buzz(2); }
  };
  tw.addEventListener('pointerdown', e => { dragging = true; tw.setPointerCapture(e.pointerId); tw.classList.add('drag'); fromY(e.clientY); e.preventDefault(); });
  tw.addEventListener('pointermove', e => { if (dragging) fromY(e.clientY); });
  const end = () => { dragging = false; tw.classList.remove('drag'); };
  tw.addEventListener('pointerup', end); tw.addEventListener('pointercancel', end);
  tw.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { setTower(S.raiseTo ? S.raiseTo + T.bb : A.minTo); e.preventDefault(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { setTower(S.raiseTo - T.bb < A.minTo ? 0 : S.raiseTo - T.bb); e.preventDefault(); }
  });
  setTower(S.raiseTo || 0);
}
function setTower(v) {
  const T = S.table, A = T && T.actions;
  if (!A) return;
  if (v) {
    v = Math.round(v);
    if (v < A.maxTo) v = Math.round(v / T.sb) * T.sb;
    v = Math.max(A.minTo, Math.min(A.maxTo, v));
  }
  S.raiseTo = v || 0;
  const t = !v ? 0 : CALL_ZONE + (1 - CALL_ZONE) * (A.maxTo > A.minTo ? Math.pow((v - A.minTo) / (A.maxTo - A.minTo), 1 / TOWER_EASE) : 1);
  const tw = $('#tower');
  if (tw) { tw.style.setProperty('--t', t.toFixed(4)); tw.setAttribute('aria-valuenow', v || 0); tw.setAttribute('aria-valuetext', v ? fmt(v) : 'No raise'); tw.classList.toggle('max', !!v && v === A.maxTo); tw.classList.toggle('up', !!v); }
  const b = $('#a-call');
  if (b) {
    const allIn = v && v === (A.allIn || A.maxTo);
    b.classList.toggle('raising', !!v);
    b.innerHTML = v ? `<b>${allIn ? 'All in' : A.currentBet === 0 ? 'Bet' : 'Raise to'}</b><span>${fmt(v)}</span>` : S.callLabel;
  }
}

// The raise picker: a chip tower you drag up or down, presets beside it, and one confirm button.
// The tower is eased (finer control near the minimum, faster toward all in) and snaps to the small blind.
const TOWER_EASE = 1.7;
function raiseTargets(T, A) {
  const potAfterCall = T.pot + A.toCall;
  const at = x => Math.max(A.minTo, Math.min(A.maxTo, Math.round(x / T.sb) * T.sb));
  const list = [
    ['min', 'Min', A.minTo],
    ['half', '½ Pot', at(A.currentBet + potAfterCall / 2)],
    ['3q', '¾ Pot', at(A.currentBet + potAfterCall * 0.75)],
    ['pot', 'Pot', at(A.currentBet + potAfterCall)],
  ];
  if (!A.potLimit) list.push(['all', 'All in', A.maxTo]);
  return list;
}
function raisePickerHTML(T, A) {
  if (!S.raiseTo || S.raiseTo < A.minTo || S.raiseTo > A.maxTo) S.raiseTo = A.minTo;
  const verb = A.currentBet === 0 ? 'Bet' : 'Raise to';
  return `<div class="picker tower-picker" role="group" aria-label="${verb} amount">
    <div class="tp-left">
      <div class="pk-head"><button class="pk-back" id="pk-back" aria-label="Back to actions">‹ Back</button><span class="pk-bb" id="pk-bb"></span></div>
      <span class="lbl">${verb}${A.potLimit ? ' · pot limit' : ''}</span>
      <span class="pk-val" id="pk-val" aria-live="polite"></span>
      <div class="tp-presets">${raiseTargets(T, A).map(([k, l, v]) => `<button class="tp-pre" data-v="${v}"><b>${l}</b><span>${money(v)}</span></button>`).join('')}</div>
      <button class="pk-go" id="pk-go"></button>
    </div>
    <div class="tower" id="tower" role="slider" tabindex="0" aria-label="${verb} amount" aria-valuemin="${A.minTo}" aria-valuemax="${A.maxTo}">
      <div class="tw-track"><div class="tw-fill" id="tw-fill"></div><div class="tw-thumb" id="tw-thumb"><i></i><i></i><i></i></div></div>
      <span class="tw-cap top">${A.potLimit ? 'Pot' : 'All in'}</span><span class="tw-cap bot">Min</span>
    </div>
  </div>`;
}
const towerT = (A, v) => A.maxTo > A.minTo ? Math.pow((v - A.minTo) / (A.maxTo - A.minTo), 1 / TOWER_EASE) : 1;
function bindRaisePicker(T, A) {
  $('#pk-back').onclick = () => { S.raiseOpen = false; renderMine(true); };
  document.querySelectorAll('.tp-pre').forEach(b => b.onclick = () => { setRaise(+b.dataset.v); });
  $('#pk-go').onclick = () => { buzz(); $('#pk-go').disabled = true; send({ t: 'act', kind: 'raise', amount: S.raiseTo }); S.raiseOpen = false; };
  const tw = $('#tower'), track = tw.querySelector('.tw-track');
  let dragging = false, lastStep = -1;
  const fromY = y => {
    const r = track.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (r.bottom - y) / r.height));
    const v = A.minTo + (A.maxTo - A.minTo) * Math.pow(t, TOWER_EASE);
    setRaise(t >= .995 ? A.maxTo : v);
    const step = Math.round(S.raiseTo / T.bb);
    if (step !== lastStep) { lastStep = step; buzz(2); }
  };
  tw.addEventListener('pointerdown', e => { dragging = true; tw.setPointerCapture(e.pointerId); tw.classList.add('drag'); fromY(e.clientY); e.preventDefault(); });
  tw.addEventListener('pointermove', e => { if (dragging) fromY(e.clientY); });
  const end = () => { dragging = false; tw.classList.remove('drag'); };
  tw.addEventListener('pointerup', end); tw.addEventListener('pointercancel', end);
  tw.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { setRaise(S.raiseTo + T.bb); e.preventDefault(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { setRaise(S.raiseTo - T.bb); e.preventDefault(); }
  });
  setRaise(S.raiseTo);
}
function setRaise(v) {
  const T = S.table, A = T && T.actions;
  if (!A) return;
  v = Math.round(v);
  if (v < A.maxTo) v = Math.round(v / T.sb) * T.sb;
  v = Math.max(A.minTo, Math.min(A.maxTo, v));
  S.raiseTo = v;
  const t = towerT(A, v);
  const tw = $('#tower');
  if (tw) { tw.style.setProperty('--t', t.toFixed(4)); tw.setAttribute('aria-valuenow', v); tw.setAttribute('aria-valuetext', money(v)); tw.classList.toggle('max', v === A.maxTo); }
  const val = $('#pk-val'); if (val) val.textContent = money(v);
  const bb = $('#pk-bb'); if (bb) bb.textContent = `${(v / T.bb).toFixed(v % T.bb ? 1 : 0)} BB`;
  document.querySelectorAll('.tp-pre').forEach(b => b.classList.toggle('on', +b.dataset.v === v));
  const go = $('#pk-go');
  const allIn = v === (A.allIn || A.maxTo) && !(A.potLimit && v < (A.allIn || 0));
  if (go) go.textContent = allIn ? `All in · ${money(v)}` : `${A.currentBet === 0 ? 'Bet' : 'Raise to'} ${money(v)}`;
}

function showReaction(m) {
  const seat = m.seat >= 0 && document.querySelector(`.seat[data-seat="${m.seat}"]`);
  if (seat) {
    const b = document.createElement('span');
    b.className = 'bubble'; b.textContent = m.e;
    seat.appendChild(b);
    setTimeout(() => b.remove(), 2500);
    return;
  }
  S.chat.push({ id: 'r' + Date.now(), sys: true, text: `${m.name} reacted ${m.e}` });
  renderFeed();
}

/* ---------------- dialogs ---------------- */
function openModal(html, after) {
  $('#modal').innerHTML = `<div class="mscrim"><div class="panel dialog" role="dialog" aria-modal="true">${html}</div></div>`;
  const scrim = $('#modal .mscrim');
  scrim.onclick = e => { if (e.target === scrim || e.target.hasAttribute('data-close')) closeModal(); };
  if (after) after();
}
function closeModal() { $('#modal').innerHTML = ''; }
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeMenu(); closeChat(); } });

function openBuyIn(seat, isRebuy) {
  const T = S.table, me = S.me;
  if (!T || !me) return;
  const current = isRebuy && T.you >= 0 ? T.seats[T.you].chips : 0;
  const max = Math.min(T.buyIn.max - current, me.bankroll);
  const min = isRebuy ? Math.min(T.bb, max) : T.buyIn.min;
  if (max < min || max <= 0) {
    openModal(`<h2>Not enough in your balance</h2><p class="wait">You have ${money(me.bankroll)}${isRebuy ? '' : `, and this table needs at least ${money(T.buyIn.min)}`}.</p>
      <div class="acts"><button class="btn" data-close>Not now</button><button class="btn primary" id="nb-cash">Add money</button></div>`, () => {
      $('#nb-cash').onclick = () => { closeModal(); renderCashier('deposit'); };
    });
    return;
  }
  let v = max;
  openModal(`
    <h2>${isRebuy ? 'Add chips' : 'Take a seat'}</h2>
    <p class="wait">Bankroll <span class="num">${fmt(me.bankroll)}</span></p>
    <div style="display:flex;justify-content:space-between;align-items:baseline"><span class="lbl">${isRebuy ? 'Add' : 'Buy in for'}</span><b class="num" id="bi-v" style="font-size:24px;color:var(--marquee)">${fmt(v)}</b></div>
    <input type="range" id="bi-s" min="${min}" max="${max}" step="${T.bb}" value="${v}" aria-label="Buy-in amount">
    <div class="acts"><button class="btn" data-close>Cancel</button><button class="btn primary" id="bi-go">${isRebuy ? 'Add chips' : 'Sit down'}</button></div>`, () => {
    const s = $('#bi-s');
    s.oninput = () => { v = +s.value; if (+s.max - v < T.bb) v = +s.max; $('#bi-v').textContent = fmt(v); };
    $('#bi-go').onclick = () => {
      if (isRebuy) send({ t: 'rebuy', amount: v });
      else send({ t: 'sit', seat, buyIn: v });
      closeModal();
    };
  });
}

function openLeaveConfirm() {
  openModal(`<h2>Leave the table?</h2><p class="wait">You’re in a hand. Leaving folds your cards, and your chips go back to your bankroll.</p>
    <div class="acts"><button class="btn" data-close>Stay</button><button class="btn primary" id="lv-go">Leave</button></div>`,
  () => { $('#lv-go').onclick = () => { closeModal(); leaveTable(); }; });
}

/* ---------------- turn timer + resize ---------------- */
function tick() {
  const T = S.table;
  if (T && S.view === 'table' && T.phase === 'play' && T.turnMs) {
    const left = Math.max(0, T.turnMs - (performance.now() - S.tableAt));
    const p = left / T.turnTotal;
    const ring = $('#ring'); if (ring) ring.style.setProperty('--p', p.toFixed(3));
    const bar = $('#turnbar'); if (bar) bar.style.setProperty('--p', p.toFixed(3));
    const tm = $('#timer'); if (tm) { const s = Math.ceil(left / 1000); tm.textContent = `0:${String(s).padStart(2, '0')}`; }
  }
  // tournament clocks: the level timer at the table, and every countdown on the tournament screens
  const lc = $('#lvl-cd'); if (lc && S.levelEndsAt) lc.textContent = clock(S.levelEndsAt - performance.now());
  if (!S._cdTick || performance.now() - S._cdTick > 500) {
    S._cdTick = performance.now();
    document.querySelectorAll('[data-cd]').forEach(e => { e.textContent = clock(+e.dataset.cd - Date.now()); });
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
let wasWide = isWide();
addEventListener('resize', () => { const w = isWide(); if (w !== wasWide && S.view === 'table' && S.table) { wasWide = w; renderStage(); renderMine(true); } });

$('#conn').innerHTML = '<span>Connection lost. Reconnecting…</span><button id="conn-retry">Retry now</button>';
$('#conn-retry').onclick = () => { if (ws && ws.readyState === 3) { clearTimeout(S.retryTimer); retry = 0; connect(); } };
connect();
