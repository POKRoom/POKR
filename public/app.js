'use strict';
/* Pokr web client. The server holds the truth; this file only draws what it's told and sends intents. */

// 0-15 free, 16-21 Pokr Club, 22-27 avatar shop (mirrors server/shop.js)
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
  const el = document.createElement('div');
  el.id = 'splash';
  el.setAttribute('aria-hidden', 'true');
  const colors = ['#C8202B', '#F4ECDC', '#2E8F86', '#151010', '#3E5FB0', '#D9A84E'];
  let chips = '';
  for (let i = 0; i < 18; i++) {
    const ang = (i / 18) * Math.PI * 2 + Math.random() * .4;
    const far = 75 + Math.random() * 25;           // start off-screen, in vmax
    const near = 10 + Math.random() * 26;          // where it hovers around the logo, in vmin
    const out = 90 + Math.random() * 40;           // where it bursts to
    const x0 = Math.cos(ang) * far, y0 = Math.sin(ang) * far;
    const x1 = Math.cos(ang + .5) * near, y1 = Math.sin(ang + .5) * near * .7;
    const x2 = Math.cos(ang + .7) * out, y2 = Math.sin(ang + .7) * out;
    const size = 26 + Math.round(Math.random() * 30);
    chips += `<i style="--x0:${x0.toFixed(1)}vmax;--y0:${y0.toFixed(1)}vmax;--x1:${x1.toFixed(1)}vmin;--y1:${y1.toFixed(1)}vmin;--x2:${x2.toFixed(1)}vmax;--y2:${y2.toFixed(1)}vmax;--s:${size}px;--c:${colors[i % colors.length]};--d:${i * 28}ms;--r:${Math.round(Math.random() * 720 - 360)}deg"></i>`;
  }
  el.innerHTML = `<div class="sp-chips">${chips}</div><div class="sp-logo logo"><span class="l1">p</span><span class="chip-o"></span><span class="l2">k</span><span class="l3">r</span></div>`;
  document.body.appendChild(el);
  const done = () => { if (!el.isConnected) return; el.classList.add('gone'); setTimeout(() => el.remove(), 420); };
  el.addEventListener('click', done);
  setTimeout(done, 2300);
})();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// all amounts are whole cents; show them as dollars
const money = c => { const d = (c || 0) / 100; return '$' + d.toLocaleString('en-US', Number.isInteger(d) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
const fmt = money;
const signedMoney = n => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));
const signed = signedMoney;
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

function avatarHTML(av) {
  const glyph = av && av.a >= 0 ? AVATARS[av.a] : '🤖';
  return `<span class="ava" style="--ac:${COLORS[(av && av.c) || 0]}" aria-hidden="true">${glyph}</span>`;
}
function cardHTML(c, cls = '', style = '') {
  const st = style ? ` style="${style}"` : '';
  if (c === undefined) return `<div class="pc empty ${cls}" aria-hidden="true"></div>`;
  if (c === null) return `<div class="pc back ${cls}"${st} aria-label="Face-down card"></div>`;
  const r = c % 13 + 2, s = Math.floor(c / 13);
  const rt = { 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[r] || String(r);
  const suit = `<svg viewBox="0 0 24 24">${SUIT_SVG[s]}</svg>`;
  return `<div class="pc ${s === 1 || s === 2 ? 'red' : ''} ${cls}"${st} role="img" aria-label="${rt} of ${SUIT_NAME[s]}"><span class="r">${rt}</span><span class="s1">${suit}</span><span class="s2">${suit}</span></div>`;
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
  if (/Pokr Club/i.test(msg)) return ['See the club', () => renderClub()];
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
    case 'token': S.token = m.token; store.set('pokr.token', m.token); store.set('pokr.hadAccount', '1'); break;
    case 'me': {
      const entering = S.view === 'boot' || S.view === 'auth';
      S.me = m.user;
      document.body.dataset.skin = S.me.theme || 'lounge';
      if (entering) enterApp();
      else if (S.view === 'table') {
        if (S.rejoin) { S.rejoin = false; send({ t: 'join', code: S.table ? S.table.code : routeCode() }); }
        renderMine(true);
      } else if (S.view === 'tabs') renderTabs();
      else if (S.view === 'club') renderClub();
      else if (S.view === 'cashier') renderCashier();
      break;
    }
    case 'lobby': S.lobby = m; if (S.view === 'tabs' && (S.tab === 'play' || S.tab === 'social')) renderTabs(); break;
    case 'created': nav('/t/' + m.code); joinCode(m.code); break;
    case 'state': {
      const fresh = S.view !== 'table' || !S.table || S.table.code !== m.s.code || !$('#stage');
      S.table = m.s; S.tableAt = performance.now();
      if (fresh) { S.view = 'table'; renderTableShell(); }
      renderTable();
      break;
    }
    case 'notFound': toast('That table is closed or the code is wrong'); nav('/', true); goLobby(); break;
    case 'chat':
      if (m.reset) S.chat = [];
      S.chat.push(...m.items);
      if (S.chat.length > 80) S.chat.splice(0, S.chat.length - 80);
      if (!m.reset && !S.chatOpen && m.items.some(i => !S.me || i.userId !== S.me.id)) { S.unread = true; renderCorner(); }
      renderFeed();
      break;
    case 'react': showReaction(m); break;
    case 'error': toast(m.message, errorAction(m.message)); break;
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
function renderAuth(mode) {
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
      ${signup ? `<div class="field"><span class="lbl">Avatar</span>${avatarGrid()}</div>` : ''}
      <p class="formerr" id="au-err" role="alert" hidden></p>
      <button class="btn primary" type="submit" id="au-go">${signup ? 'Create account' : 'Log in'}</button>
    </form>
    <p class="fine">${signup ? 'You start with $1,000 in play money. ' : ''}Play money only for now, no real money.</p>
  </main>`;
  enter();
  app.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => renderAuth(b.dataset.mode));
  if (signup) bindAvatarGrid();
  $('#auth').onsubmit = e => {
    e.preventDefault();
    const email = $('#au-email').value.trim(), password = $('#au-pass').value;
    const err = msg => { const el = $('#au-err'); el.textContent = msg; el.hidden = false; };
    if (signup) {
      const name = $('#au-name').value.trim();
      if (name.length < 2) return err('Pick a name with at least 2 characters');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return err('Enter a valid email address');
      if (password.length < 8) return err('Use a password with at least 8 characters');
      send({ t: 'signup', name, email, password, avatar: { a: S.draft, c: S.draft % 8 } });
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

function renderProfileEdit() {
  S.view = 'profile-edit';
  S.draft = S.me.avatar.a;
  app.innerHTML = `
  <main class="welcome">
    <h1 class="logo md" aria-label="Pokr">${LOGO}</h1>
    <form class="panel pf" id="pf">
      <h2>Your profile</h2>
      <div class="field"><label class="lbl" for="pf-name">Name at the table</label>
        <input id="pf-name" maxlength="16" autocomplete="nickname" value="${esc(S.me.name)}"></div>
      <div class="field"><span class="lbl">Avatar</span>${avatarGrid(true)}<button type="button" class="textbtn" id="pf-more">More avatars in Pokr Club ›</button></div>
      <div class="field"><span class="lbl">Account</span><span>${esc(S.me.email || '')}</span></div>
      <button class="btn primary" type="submit">Save</button>
      <div class="acts"><button class="btn" type="button" id="pf-cancel">Back</button><button class="btn ghost" type="button" id="pf-logout">Log out</button></div>
    </form>
  </main>`;
  enter();
  bindAvatarGrid();
  $('#pf-cancel').onclick = () => goLobby();
  $('#pf-more').onclick = () => renderClub();
  $('#pf-logout').onclick = () => { store.set('pokr.token', ''); S.token = null; send({ t: 'logout' }); };
  $('#pf').onsubmit = e => {
    e.preventDefault();
    const name = $('#pf-name').value.trim();
    if (name.length < 2) { toast('Pick a name with at least 2 characters'); return; }
    send({ t: 'profile', name, avatar: { a: S.draft, c: S.draft % 8 } });
    goLobby();
  };
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
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2 2M14 9l2 2"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
};
const TABS = [['play', 'Play'], ['games', 'Home games'], ['social', 'Social'], ['wallet', 'Wallet'], ['me', 'Profile']];

function renderTabs() {
  S.view = 'tabs';
  S.tab = S.tab || 'play';
  const me = S.me;
  if (!me) return;
  const same = S.lastTab === S.tab && S.lastPainted === 'tabs';
  const y = same ? window.scrollY : 0;
  const body = { play: tabPlay, games: tabGames, social: tabSocial, wallet: tabWallet, me: tabMe }[S.tab]();
  app.innerHTML = `<div class="shell">
    <nav class="tabbar" aria-label="Sections"><span class="rail-logo logo" aria-hidden="true">${LOGO}</span>
      ${TABS.map(([k, l]) => `<button class="tab" data-tab="${k}" ${S.tab === k ? 'aria-current="page"' : ''}>${TICON[k]}<span>${l}</span></button>`).join('')}</nav>
    <main class="tabpage ${same ? '' : 'enter'}" id="tabpage">${body.html}</main>
  </div>`;
  S.lastTab = S.tab; S.lastPainted = 'tabs';
  window.scrollTo(0, y);
  app.querySelectorAll('.tabbar [data-tab]').forEach(b => b.onclick = () => { if (S.tab === b.dataset.tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; } buzz(4); S.tab = b.dataset.tab; renderTabs(); });
  if (body.bind) body.bind();
}
const renderLobby = renderTabs;
const greet = () => { const h = new Date().getHours(); return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const largeTitle = (title, right = '', eyebrow = '') => `<header class="lt"><div>${eyebrow ? `<span class="lt-eyebrow">${eyebrow}</span>` : ''}<h1>${title}</h1></div>${right}</header>`;
const soonRow = (title, sub) => `<div class="lrowbtn static"><div class="lr-txt"><b>${title}</b><span>${sub}</span></div><span class="soon">Soon</span></div>`;

function tabPlay() {
  const me = S.me, L = S.lobby || { tables: [] };
  const seated = Object.entries(me.atTablesBy || {});
  S.blindFilter = S.blindFilter || 'all';
  const shown = (L.tables || []).filter(t => S.blindFilter === 'all' || STAKES.some(([k, sb, bb]) => k === S.blindFilter && t.sb === sb && t.bb === bb));
  const dots = (n, of) => `<span class="dots" aria-label="${n} of ${of} seats taken">${Array.from({ length: of }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
  const html = `
    ${largeTitle('Play', `<button class="bal-chip" id="to-wallet" aria-label="Wallet balance ${money(me.bankroll)}">${avatarHTML(me.avatar)}<span class="num">${money(me.bankroll)}</span></button>`, `${greet()}, ${esc(me.name)}`)}
    ${seated.length ? `<div class="seated">${seated.map(([code, amt]) => `<button class="seated-row" data-back="${esc(code)}"><span class="pulse"></span><span>You’re seated at <b>${esc(code)}</b> with ${money(amt)}</span><span class="go">Return ›</span></button>`).join('')}</div>` : ''}
    <section class="sec">
      <div class="sec-head"><h2>Open tables</h2>${S.lobby ? `<span class="count">${shown.length}</span>` : ''}</div>
      <div class="filters" role="radiogroup" aria-label="Blinds">
        ${[['all', 'All blinds'], ...STAKES.map(([k, sb, bb]) => [k, blinds(sb, bb)])].map(([k, l]) => `<button type="button" role="radio" class="fchip ${k === 'all' ? '' : 'num'}" data-bf="${k}" aria-checked="${S.blindFilter === k}">${l}</button>`).join('')}
      </div>
      ${!S.lobby ? skelRows(3) : shown.length ? `<div class="cards">${shown.map(t => `
        <button class="tcard" data-join="${t.code}"><span class="bl num">${blinds(t.sb, t.bb)}</span>
          <span class="tc-mid"><b>${esc(t.name)}</b>${dots(t.players + t.bots, t.seats)}</span>
          <span class="tc-go">Join</span></button>`).join('')}</div>`
        : S.blindFilter !== 'all' && L.tables.length ? `<div class="empty card-empty"><span class="empty-icon chip"></span><p>No open tables at ${esc(blindLabel(S.blindFilter))}.</p><p class="sub"><button class="linkbtn" data-bf="all">Show all blinds</button> or start one in Home games.</p></div>`
        : `<div class="empty card-empty"><span class="empty-icon chip"></span><p>No open tables right now.</p><p class="sub">Start one in <button class="linkbtn" id="to-games">Home games</button> and send your friends the code.</p></div>`}
    </section>
    <p class="fine">Play money only for now. No real money.</p>`;
  const bind = () => {
    $('#to-wallet').onclick = () => { S.tab = 'wallet'; renderTabs(); };
    app.querySelectorAll('[data-bf]').forEach(b => b.onclick = () => { buzz(4); S.blindFilter = b.dataset.bf; renderTabs(); });
    if ($('#to-games')) $('#to-games').onclick = () => { S.tab = 'games'; renderTabs(); };
    app.querySelectorAll('[data-join]').forEach(b => b.onclick = () => { nav('/t/' + b.dataset.join); joinCode(b.dataset.join); });
    app.querySelectorAll('[data-back]').forEach(b => b.onclick = () => { nav('/t/' + b.dataset.back); joinCode(b.dataset.back); });
  };
  return { html, bind };
}

const blindLabel = k => { const st = STAKES.find(x => x[0] === k); return st ? blinds(st[1], st[2]) : ''; };
function openNewTable() {
  const me = S.me;
  openSheet(`
    <h2>Start a table</h2>
    <input id="tname" maxlength="28" placeholder="${esc(me.name)}'s table" aria-label="Table name">
    <span class="lbl">Blinds</span>
    <div class="books">${STAKES.map(([k, sb, bb]) => `<button type="button" class="book" data-st="${k}" aria-pressed="${S.stakes === k}"><span class="cover">${blinds(sb, bb)}</span><span class="strike"></span><span class="buy">Max buy-in ${money(bb * 100)}</span></button>`).join('')}</div>
    <label class="switch"><input type="checkbox" id="tpriv" ${S.isPrivate ? 'checked' : ''}> Private: only people with the link can join</label>
    <button class="btn primary" id="create-go">Open the table</button>`, () => {
    document.querySelectorAll('[data-st]').forEach(b => b.onclick = () => {
      S.stakes = b.dataset.st; buzz(4);
      document.querySelectorAll('[data-st]').forEach(x => x.setAttribute('aria-pressed', x.dataset.st === S.stakes));
    });
    $('#tpriv').onchange = e => { S.isPrivate = e.target.checked; };
    $('#create-go').onclick = () => { closeModal(); send({ t: 'create', name: $('#tname') ? $('#tname').value : '', stakes: S.stakes, isPrivate: S.isPrivate }); };
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
    ${largeTitle('Home games', '', 'Your game, your friends')}
    <div class="tiles2">
      <button class="tile primary" id="new-table">${TICON.plus}<b>Start a table</b><span>Invite your friends</span></button>
      <button class="tile" id="join-code">${TICON.key}<b>Join with code</b><span>Got an invite?</span></button>
    </div>
    <section class="hero-card">
      <span class="lbl">Coming soon</span>
      <h2>Run your in-person game from your phone</h2>
      <p>Track buy-ins and cash-outs, settle up in one tap, and keep every hand for your monthly Wrapped.</p>
    </section>
    <div class="list">
      ${soonRow('Game tracker', 'Buy-ins, rebuys, cash-outs and results')}
      ${soonRow('Settle up', 'Who owes whom, with history')}
      ${soonRow('Invites & RSVPs', 'An event page with a waitlist and reminders')}
      ${soonRow('Blind timer & payouts', 'For home tournaments')}
      ${soonRow('Chip counter', 'Count stacks with your camera, on your phone')}
      ${soonRow('Seat draw & dealer button', 'Fair seats, no arguing')}
    </div>`;
  const bind = () => { $('#new-table').onclick = openNewTable; $('#join-code').onclick = openJoinCode; };
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
        <div class="lrow ${i === 0 ? 'first' : ''} ${p.id === me.id ? 'me' : ''}"><span class="rk">${i + 1}</span>${avatarHTML(p.avatar)}<span class="nm">${esc(p.name)}</span>
        <span class="num ${p.net > 0 ? 'up' : p.net < 0 ? 'down' : ''}">${signedMoney(p.net)}</span><span class="h">${count(p.hands)} hands</span></div>`).join('')}</div>`
        : '<div class="empty"><p>Nobody’s on the board yet.</p><p class="sub">Play a hand to claim the top spot.</p></div>'}
    </section>` : `
    <section class="hero-card">
      <span class="lbl">Coming soon</span>
      <h2>Crews</h2>
      <p>Your poker group, in one place: a crew leaderboard, seasons, rivalries and a chat that stays after the game.</p>
    </section>
    <div class="list">
      ${soonRow('Rivalries', 'Your record against everyone you’ve played')}
      ${soonRow('Monthly Wrapped', 'Your month at the tables, in one swipe')}
      ${soonRow('Hand sharing', 'Send a hand to the group chat')}
      ${soonRow('Spectate', 'Watch friends play, on a delay')}
    </div>`}`;
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
      <span class="lbl">Balance</span>
      <span class="num big">${money(me.bankroll)}</span>
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
    <button class="club-banner" id="w-club"><span><span class="lbl">${me.club && me.club.active ? 'Member' : `Pokr Club · ${money(499)}/mo`}</span><b>${me.club && me.club.active ? 'Pokr Club themes & avatars' : 'Unlock themes and avatars'}</b></span>${TICON.chev}</button>
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
  const theme = ((S.catalog && S.catalog.themes.find(t => t.id === me.theme)) || { name: 'The Lounge' }).name;
  const html = `
    ${largeTitle('Profile')}
    <section class="profile-card">
      ${avatarHTML(me.avatar)}
      <div class="pc-txt"><b>${esc(me.name)}</b><span>${esc(me.email || '')}</span></div>
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
      <button class="lrowbtn" id="p-club"><div class="lr-txt"><b>Pokr Club & themes</b><span>${me.club && me.club.active ? 'Member · ' : ''}${esc(theme)}</span></div>${TICON.chev}</button>
      <button class="lrowbtn" id="p-edit2"><div class="lr-txt"><b>Name & avatar</b><span>How you show up at the table</span></div>${TICON.chev}</button>
      ${soonRow('Responsible play', 'Budgets, cool-offs and session timers')}
      ${soonRow('Accessibility', 'Four-color deck, large text, screen reader')}
      ${soonRow('Identity verification', 'Needed before real money')}
    </div>
    <div class="list"><button class="lrowbtn danger" id="p-logout"><div class="lr-txt"><b>Log out</b></div></button></div>`;
  const bind = () => {
    $('#p-edit').onclick = renderProfileEdit;
    $('#p-edit2').onclick = renderProfileEdit;
    $('#p-club').onclick = () => renderClub();
    $('#period').onchange = e => { S.period = e.target.value; store.set('pokr.period', S.period); renderTabs(); };
    $('#p-logout').onclick = () => { store.set('pokr.token', ''); S.token = null; S.tab = 'play'; send({ t: 'logout' }); };
  };
  return { html, bind };
}

// bottom sheet on phones, centered card on computers
function openSheet(html, after) {
  $('#modal').innerHTML = `<div class="mscrim sheetish"><div class="panel dialog" role="dialog" aria-modal="true"><span class="grab" aria-hidden="true"></span>${html}</div></div>`;
  const scrim = $('#modal .mscrim');
  scrim.onclick = e => { if (e.target === scrim || e.target.hasAttribute('data-close')) closeModal(); };
  if (after) after();
}

/* ---------------- Pokr Club: themes + avatars ---------------- */
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
    ${pageBar('Pokr Club')}
    <section class="panel club-hero">
      <span class="lbl">${member ? 'You’re a member' : 'Membership'}</span>
      <div class="price"><span class="num">${money(C.club.priceCents)}</span><span>/ month</span></div>
      <ul class="perks"><li>Three extra table themes</li><li>Six members-only avatars</li><li>New looks added as we make them</li></ul>
      ${member
        ? `<p class="wait">Renews ${new Date(me.club.renewsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.</p><button class="textbtn" id="club-cancel">Cancel membership</button>`
        : `<button class="btn primary" id="club-join">Join Pokr Club</button>`}
      <p class="test">Test mode: nothing is charged yet.</p>
    </section>
    <section class="panel">
      <h2>Table themes</h2>
      <div class="themes">${C.themes.map(t => {
        const look = THEME_LOOK[t.id] || THEME_LOOK.lounge;
        const using = me.theme === t.id, locked = t.club && !member;
        return `<button class="theme ${using ? 'using' : ''}" data-theme="${t.id}" ${locked ? 'data-locked="1"' : ''}>
          <span class="thumb t-${t.id}" style="--wall:${look.wall};--felt:${look.felt};--acc:${look.accent}"><span class="oval"></span></span>
          <span class="tname">${esc(t.name)}</span><span class="tblurb">${esc(t.blurb)}</span>
          <span class="tstate">${using ? 'In use' : locked ? 'Pokr Club' : 'Use this'}</span></button>`;
  enter();
      }).join('')}</div>
    </section>
    <section class="panel">
      <h2>Members-only avatars</h2>
      <div class="ava-shop">${C.clubAvatars.map(i => `<div class="aitem ${member ? '' : 'locked'}">${ava(i)}<span>${member ? 'Included' : 'Pokr Club'}</span></div>`).join('')}</div>
      <h2 style="margin-top:6px">Avatar shop</h2>
      <div class="ava-shop">${C.shopAvatars.map(i => {
        const owned = (me.ownedAvatars || []).includes(i);
        return `<div class="aitem">${ava(i)}${owned ? '<span>Owned</span>' : `<button class="btn small" data-buy="${i}">${money(C.avatarPrice)}</button>`}</div>`;
      }).join('')}</div>
      <p class="test">Test mode: purchases unlock instantly and aren’t charged. They never come out of your poker balance.</p>
    </section>
  </div>`;
  $('#pg-back').onclick = goLobby;
  const j = $('#club-join'); if (j) j.onclick = () => send({ t: 'club', action: 'join' });
  const c = $('#club-cancel'); if (c) c.onclick = () => openModal(`<h2>Cancel Pokr Club?</h2><p class="wait">You’ll go back to The Lounge theme and a free avatar.</p><div class="acts"><button class="btn" data-close>Keep it</button><button class="btn primary" id="cc-go">Cancel membership</button></div>`, () => { $('#cc-go').onclick = () => { closeModal(); send({ t: 'club', action: 'cancel' }); }; });
  app.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => {
    if (b.dataset.locked) { toast('That theme comes with Pokr Club'); return; }
    send({ t: 'setTheme', theme: b.dataset.theme });
  });
  app.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => send({ t: 'buyAvatar', a: +b.dataset.buy }));
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
    ['lobby', 'Back to lobby', ICON.lobby],
  ];
  const seated = [];
  if (me) {
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
      : `<div class="msg">${avatarHTML(m.avatar)}<div class="body"><span class="who">${esc(m.name)}</span><span>${esc(m.text)}</span></div></div>`).join('')
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

// Seat spots as % of the stage. Index 0 is always the bottom (you).
const POS_WIDE = [[50, 91], [10, 69], [10, 28], [50, 7], [90, 28], [90, 69]];
const POS_TALL = [[50, 93], [15, 68], [15, 28], [50, 5], [85, 28], [85, 68]];

function renderStage() {
  const T = S.table, stage = $('#stage');
  if (!stage) return;
  const POS = isWide() ? POS_WIDE : POS_TALL;
  const n = T.seats.length, base = T.you >= 0 ? T.you : 0;
  const hi = bestSet(T);
  const meSeated = T.you >= 0;

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
    msg = T.toAct === T.you ? 'Your move' : a ? `${esc(a.name)}’s turn` : '';
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
    return cardHTML(c === undefined ? undefined : c, cls, anim ? `animation-delay:${Math.round(t0 - now)}ms` : '');
  }).join('');
  let html = `<div class="rail"><div class="felt">
    <div class="street">${T.phase === 'play' || T.phase === 'done' ? esc(T.street) + ' · Hand ' + T.handNo : 'Table open'}</div>
    <div class="board" aria-label="Board">${board}</div>
    ${T.pot ? `<div class="pot"><span class="chip"></span>${fmt(T.pot)}</div>` : ''}
    <div class="fmsg ${result ? 'result' : ''}">${msg}</div>
  </div></div>`;

  for (let i = 0; i < n; i++) {
    const k = (i - base + n) % n;
    const [x, y] = POS[k] || POS[0];
    const s = T.seats[i];
    if (!s) {
      const inner = !meSeated && S.me ? `<button class="open" data-sit="${i}" aria-label="Sit in seat ${i + 1}">Sit</button>` : '<div class="open">Open</div>';
      const bot = T.isHost ? `<button class="textbtn addbot" data-bot="${i}">+ Bot</button>` : '';
      html += `<div class="seat empty" style="left:${x}%;top:${y}%" data-seat="${i}">${inner}${bot}</div>`;
      continue;
    }
    const isMe = i === T.you;
    const turn = T.phase === 'play' && T.toAct === i;
    const won = T.phase === 'done' && s.won > 0;
    const shown = !isMe && s.cards.length && s.cards[0] !== null;
    const cls = ['seat', isMe && 'me', turn && 'turn', won && 'won', s.folded && 'folded', (s.sittingOut || !s.connected) && 'away', shown && 'shown'].filter(Boolean).join(' ');
    const hole = isMe ? '' : s.cards.map(c => cardHTML(c, hi && c !== null ? (hi.has(c) ? 'hi' : 'dim') : '')).join('');
    let tag = s.last;
    if (won) tag = `Won ${fmt(s.won)}`;
    else if (s.handName && T.phase === 'done') tag = s.handName;
    else if (turn) tag = isMe ? 'Your turn' : 'Thinking…';
    else if (!s.connected) tag = 'Away';
    else if (s.sittingOut && !s.dealt) tag = s.last === 'Busted' ? 'Busted' : 'Sitting out';
    html += `<div class="${cls}" style="left:${x}%;top:${y}%" data-seat="${i}">
      <div class="hole">${hole}</div>
      <div class="cap">${avatarHTML(s.avatar)}${turn ? '<span class="ring" id="ring"></span>' : ''}${T.dealer === i && T.phase !== 'waiting' ? '<span class="dealer">D</span>' : ''}
        <span class="pl"><span class="nm">${isMe ? 'You' : esc(s.name)}</span><span class="ch">${fmt(s.chips)}</span></span></div>
      <div class="tag">${esc(tag || '')}</div>
      ${T.isHost && s.kind === 'bot' && T.phase !== 'play' ? `<button class="kick" data-kick="${i}" aria-label="Remove ${esc(s.name)}">×</button>` : ''}
    </div>`;
    if (s.bet > 0) {
      const bx = x + (50 - x) * 0.4, by = y + (48 - y) * 0.4;
      html += `<div class="bet" style="left:${bx}%;top:${by}%"><span class="chip"></span>${fmt(s.bet)}</div>`;
    }
  }
  stage.innerHTML = html;
  stage.querySelectorAll('[data-sit]').forEach(b => b.onclick = () => openBuyIn(+b.dataset.sit, false));
  stage.querySelectorAll('[data-bot]').forEach(b => b.onclick = () => send({ t: 'addBot', seat: +b.dataset.bot }));
  stage.querySelectorAll('[data-kick]').forEach(b => b.onclick = () => send({ t: 'removeBot', seat: +b.dataset.kick }));
}

function renderMine(force) {
  const T = S.table, el = $('#mine');
  if (!el || !T) return;
  const me = T.you >= 0 ? T.seats[T.you] : null;
  const A = T.actions;
  const myTurn = T.phase === 'play' && T.toAct === T.you && A;
  if (!myTurn) S.raiseOpen = false;
  const turnKey = myTurn ? `${T.handNo}:${T.street}:${A.currentBet}:${A.toCall}` : '';
  if (turnKey && turnKey !== S.lastTurnKey) buzz(15);
  S.lastTurnKey = turnKey;
  const key = JSON.stringify([T.you, T.phase, T.handNo, T.toAct, A, me && [me.chips, me.cards, me.folded, me.sittingOut, me.last, me.bet, me.dealt], T.myHand, S.me && S.me.bankroll, isWide(), S.raiseOpen]);
  if (!force && key === S.actionKey) return;
  S.actionKey = key;

  if (!me) {
    el.className = 'mine';
    el.innerHTML = `<p class="wait">Tap an open seat to sit down. Buy-ins run ${money(T.buyIn.min)} to ${money(T.buyIn.max)}, and you have <span class="num" style="color:var(--brass)">${money(S.me ? S.me.bankroll : 0)}</span>.</p>`;
    return;
  }

  el.className = 'mine' + (myTurn ? ' turn' : '') + (S.raiseOpen ? ' picking' : '');
  const hi = bestSet(T);
  // deal-in animation for your two cards, once per hand
  const now = performance.now();
  if (me.cards.length && S.dealHand !== T.handNo) { S.dealHand = T.handNo; S.dealAt = S.skipAnim ? 0 : now + 150; }
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
  let html = `<div class="hrow">
    ${cards ? `<div class="cards">${cards}</div>` : ''}
    <div class="info"><span class="hand">${esc(handLine)}</span><span class="num">${money(me.chips)}</span></div>
    ${myTurn ? '<span class="timer" id="timer"></span>' : ''}
  </div>`;

  if (myTurn && S.raiseOpen && A.canRaise) {
    html += raisePickerHTML(T, A) + '<div class="turnbar" id="turnbar"></div>';
  } else if (myTurn) {
    const callLbl = A.canCheck ? 'Check' : (A.toCall >= me.chips ? `All in ${money(A.toCall)}` : `Call ${money(A.toCall)}`);
    const raiseLbl = A.minTo >= A.maxTo ? `All in ${money(A.maxTo)}` : (A.currentBet === 0 ? 'Bet' : 'Raise');
    html += `<div class="acts">
        <button class="btn" id="a-fold" ${A.canCheck ? 'disabled' : ''}>Fold</button>
        <button class="btn" id="a-call">${callLbl}</button>
        <button class="btn primary" id="a-raise" ${A.canRaise ? '' : 'disabled'}>${raiseLbl}${A.minTo < A.maxTo ? ' <span class="caret">▴</span>' : ''}</button>
      </div><div class="turnbar" id="turnbar"></div>`;
  } else if (me.chips === 0 && !inHand) {
    html += `<div class="acts"><button class="btn primary" id="a-rebuy">Add chips</button></div>`;
  } else if (me.sittingOut && !inHand) {
    html += `<div class="acts"><button class="btn primary" id="a-back">I’m back</button></div>`;
  }
  el.innerHTML = html;

  const on = (id, fn) => { const b = el.querySelector('#' + id); if (b) b.onclick = fn; };
  const act = (kind, amount) => { buzz(); el.querySelectorAll('.acts .btn, .pk-go').forEach(b => { b.disabled = true; }); send({ t: 'act', kind, amount }); };
  on('a-fold', () => act('fold'));
  on('a-call', () => act(A.canCheck ? 'check' : 'call'));
  on('a-raise', () => {
    if (A.minTo >= A.maxTo) { act('raise', A.maxTo); return; }
    buzz(5);
    S.raiseOpen = true; S.raiseTo = A.minTo; renderMine(true);
  });
  on('a-back', () => send({ t: 'sitout', out: false }));
  on('a-rebuy', () => openBuyIn(T.you, true));
  if (myTurn && S.raiseOpen) bindRaisePicker(T, A);
}

// The raise picker: a big readout, poker-chip presets, +/- steps of one big blind, and a slider.
function raiseTargets(T, A) {
  const potAfterCall = T.pot + A.toCall;
  const at = x => Math.max(A.minTo, Math.min(A.maxTo, Math.round(x / T.sb) * T.sb));
  return [
    ['min', 'Min', A.minTo, 'cream'],
    ['half', '½ pot', at(A.currentBet + potAfterCall / 2), 'teal'],
    ['3q', '¾ pot', at(A.currentBet + potAfterCall * 0.75), 'blue'],
    ['pot', 'Pot', at(A.currentBet + potAfterCall), 'red'],
    ['all', 'All in', A.maxTo, 'black'],
  ];
}
function raisePickerHTML(T, A) {
  if (!S.raiseTo || S.raiseTo < A.minTo || S.raiseTo > A.maxTo) S.raiseTo = A.minTo;
  const verb = A.currentBet === 0 ? 'Bet' : 'Raise to';
  return `<div class="picker" role="group" aria-label="${verb} amount">
    <div class="pk-head"><button class="pk-back" id="pk-back" aria-label="Back to actions">‹ Back</button><span class="lbl">${verb}</span><span class="pk-bb" id="pk-bb"></span></div>
    <div class="pk-amt">
      <button class="step" id="pk-minus" aria-label="Less">−</button>
      <span class="pk-val" id="pk-val" aria-live="polite"></span>
      <button class="step" id="pk-plus" aria-label="More">+</button>
    </div>
    <div class="pk-chips">${raiseTargets(T, A).map(([k, l, v, col]) => `<button class="pchip ${col}" data-v="${v}" aria-label="${l}, ${money(v)}"><span class="disc">${l}</span><span class="amt">${money(v)}</span></button>`).join('')}</div>
    <input type="range" class="pk-slider" id="pk-slider" min="${A.minTo}" max="${A.maxTo}" step="1" value="${S.raiseTo}" aria-label="${verb} amount">
    <button class="btn primary pk-go" id="pk-go"></button>
  </div>`;
}
function bindRaisePicker(T, A) {
  $('#pk-back').onclick = () => { S.raiseOpen = false; renderMine(true); };
  $('#pk-minus').onclick = () => setRaise(S.raiseTo - T.bb);
  $('#pk-plus').onclick = () => setRaise(S.raiseTo + T.bb);
  $('#pk-slider').oninput = e => setRaise(+e.target.value);
  document.querySelectorAll('.pchip').forEach(b => b.onclick = () => { buzz(4); setRaise(+b.dataset.v); });
  $('#pk-go').onclick = () => { buzz(); $('#pk-go').disabled = true; send({ t: 'act', kind: 'raise', amount: S.raiseTo }); S.raiseOpen = false; };
  setRaise(S.raiseTo);
}
function setRaise(v) {
  const T = S.table, A = T && T.actions;
  if (!A) return;
  v = Math.round(v);
  if (v < A.maxTo) v = Math.round(v / T.sb) * T.sb;
  v = Math.max(A.minTo, Math.min(A.maxTo, v));
  S.raiseTo = v;
  const sl = $('#pk-slider'); if (sl && +sl.value !== v) sl.value = v;
  const val = $('#pk-val'); if (val) val.textContent = money(v);
  const bb = $('#pk-bb'); if (bb) bb.textContent = `${(v / T.bb).toFixed(v % T.bb ? 1 : 0)} BB`;
  document.querySelectorAll('.pchip').forEach(b => b.classList.toggle('on', +b.dataset.v === v));
  const go = $('#pk-go');
  if (go) go.textContent = v === A.maxTo ? `All in · ${money(v)}` : `${A.currentBet === 0 ? 'Bet' : 'Raise to'} ${money(v)}`;
  const minus = $('#pk-minus'), plus = $('#pk-plus');
  if (minus) minus.disabled = v <= A.minTo;
  if (plus) plus.disabled = v >= A.maxTo;
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
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
let wasWide = isWide();
addEventListener('resize', () => { const w = isWide(); if (w !== wasWide && S.view === 'table' && S.table) { wasWide = w; renderStage(); renderMine(true); } });

$('#conn').innerHTML = '<span>Connection lost. Reconnecting…</span><button id="conn-retry">Retry now</button>';
$('#conn-retry').onclick = () => { if (ws && ws.readyState === 3) { clearTimeout(S.retryTimer); retry = 0; connect(); } };
connect();
