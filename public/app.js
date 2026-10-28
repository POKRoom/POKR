'use strict';
/* Pokr web client. The server holds the truth; this file only draws what it's told and sends intents. */

const AVATARS = ['🦊', '🐻', '🐼', '🦁', '🐯', '🐸', '🐵', '🦉', '🐙', '🦈', '🐺', '🐰', '🦄', '🐲', '👽', '🤠'];
const COLORS = ['#C8202B', '#D9A84E', '#2E8F86', '#3E5FB0', '#8E3FA0', '#D0456E', '#5E9A4E', '#7A6A62'];
const REACTIONS = ['👍', '😂', '🔥', '😱', '💀', '👏', '🤡', '💰'];
const STAKES = [['micro', 5, 10], ['low', 10, 20], ['mid', 25, 50], ['high', 50, 100]];
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
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Number(n || 0).toLocaleString('en-US');
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
const isWide = () => matchMedia('(min-width: 700px)').matches;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

const S = {
  view: 'boot', me: null, lobby: null, table: null, tableAt: 0, chat: [], token: store.get('pokr.token'),
  raiseTo: 0, actionKey: '', sideTab: 'chat', stakes: 'low', isPrivate: false, chatOpen: false, menuOpen: false, unread: false,
  draft: Math.floor(Math.random() * AVATARS.length),
};

function avatarHTML(av) {
  const glyph = av && av.a >= 0 ? AVATARS[av.a] : '🤖';
  return `<span class="ava" style="--ac:${COLORS[(av && av.c) || 0]}" aria-hidden="true">${glyph}</span>`;
}
function cardHTML(c, cls = '') {
  if (c === undefined) return `<div class="pc empty ${cls}" aria-hidden="true"></div>`;
  if (c === null) return `<div class="pc back ${cls}" aria-label="Face-down card"></div>`;
  const r = c % 13 + 2, s = Math.floor(c / 13);
  const rt = { 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[r] || String(r);
  const suit = `<svg viewBox="0 0 24 24">${SUIT_SVG[s]}</svg>`;
  return `<div class="pc ${s === 1 || s === 2 ? 'red' : ''} ${cls}" role="img" aria-label="${rt} of ${SUIT_NAME[s]}"><span class="r">${rt}</span><span class="s1">${suit}</span><span class="s2">${suit}</span></div>`;
}
function toast(text) {
  const d = document.createElement('div');
  d.textContent = text;
  $('#toast').appendChild(d);
  setTimeout(() => d.remove(), 3200);
}
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
    setTimeout(connect, Math.min(8000, 400 * 2 ** retry++));
  };
}
function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }

function onMessage(m) {
  switch (m.t) {
    case 'needProfile': S.me = null; S.view = 'profile'; renderProfile(false); break;
    case 'token': S.token = m.token; store.set('pokr.token', m.token); break;
    case 'me': {
      const entering = S.view === 'boot' || S.view === 'profile';
      S.me = m.user;
      if (entering) enterApp();
      else if (S.view === 'table') {
        if (S.rejoin) { S.rejoin = false; send({ t: 'join', code: S.table ? S.table.code : routeCode() }); }
        renderMine(true);
      } else if (S.view === 'lobby') renderLobby();
      break;
    }
    case 'lobby': S.lobby = m; if (S.view === 'lobby') renderLobby(); break;
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
    case 'error': toast(m.message); break;
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
  app.innerHTML = `<div class="boot"><p class="wait">Pulling up a chair at <span class="num">${esc(code)}</span>…</p></div>`;
  send({ t: 'join', code });
}
function goLobby() { S.view = 'lobby'; S.table = null; closeChat(); send({ t: 'lobby' }); renderLobby(); }
function leaveTable() { send({ t: 'leave' }); nav('/'); S.view = 'lobby'; S.table = null; closeChat(); renderLobby(); }
window.addEventListener('popstate', () => {
  const code = routeCode();
  if (code) joinCode(code);
  else if (S.view === 'table') { send({ t: 'leave' }); S.view = 'lobby'; S.table = null; closeChat(); renderLobby(); }
});

/* ---------------- welcome / profile ---------------- */
function renderProfile(editing) {
  if (editing && S.me) S.draft = S.me.avatar.a;
  const fan = [[0, 12, -16, 4], [0, 11 + 13, -5, 1], [0, 10 + 26, 6, 1], [0, 9 + 39, 17, 4]]
    .map(([, c, rot, y], i) => cardHTML(c).replace('class="pc', `style="left:${22 + i * 44}px;top:${y + 6}px;transform:rotate(${rot}deg)" class="pc`)).join('');
  app.innerHTML = `
  <main class="welcome">
    <h1 class="marquee xl">Pokr</h1>
    <p class="tagline">${editing ? 'Freshen up before the next hand.' : 'The card room for you and your friends.'}</p>
    ${editing ? '' : `<div class="fan" aria-hidden="true">${fan}</div>`}
    <form class="panel pf" id="pf">
      <h2>${editing ? 'Your profile' : 'Pull up a chair'}</h2>
      <div class="field"><label class="lbl" for="pf-name">Name</label>
        <input id="pf-name" maxlength="16" autocomplete="nickname" placeholder="What should the table call you?" value="${esc(editing && S.me ? S.me.name : '')}"></div>
      <div class="field"><span class="lbl">Avatar</span>
        <div class="ava-grid">${AVATARS.map((g, i) => `<button type="button" data-a="${i}" aria-pressed="${i === S.draft}" style="--ac:${COLORS[i % 8]}" aria-label="Avatar ${i + 1}">${g}</button>`).join('')}</div></div>
      <button class="btn primary" type="submit">${editing ? 'Save' : 'Take a seat'}</button>
      ${editing ? '<button class="btn" type="button" id="pf-cancel">Cancel</button>' : ''}
    </form>
    <p class="fine">${editing ? '' : 'You start with 10,000 play chips. '}Play chips only, no real money.</p>
  </main>`;
  app.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
    S.draft = +b.dataset.a;
    app.querySelectorAll('[data-a]').forEach(x => x.setAttribute('aria-pressed', +x.dataset.a === S.draft));
  });
  if (editing) $('#pf-cancel').onclick = () => goLobby();
  $('#pf').onsubmit = e => {
    e.preventDefault();
    const name = $('#pf-name').value.trim();
    if (name.length < 2) { toast('Pick a name with at least 2 characters'); return; }
    send({ t: 'profile', name, avatar: { a: S.draft, c: S.draft % 8 } });
    if (editing) goLobby();
  };
  if (!editing) $('#pf-name').focus();
}

/* ---------------- lobby ---------------- */
function renderLobby() {
  const me = S.me;
  if (!me) return;
  const L = S.lobby || { tables: [], leaderboard: [] };
  const st = me.stats;
  const winRate = st.hands ? Math.round((st.won / st.hands) * 100) : 0;
  app.innerHTML = `
  <div class="lobby">
    <div class="topbar">
      <h1 class="marquee" aria-label="Pokr">Pokr</h1>
      <button class="me-chip" id="edit-me" title="Edit profile">${avatarHTML(me.avatar)}<span class="nm">${esc(me.name)}</span><span class="num">${fmt(me.bankroll)}</span></button>
    </div>
    <div class="lobby-grid">
      <section class="panel bank a-bank">
        <span class="lbl">Bankroll${me.atTables ? ` · ${fmt(me.atTables)} at tables` : ''}</span>
        <span class="num big">${fmt(me.bankroll)}</span>
        <div class="stats">
          <div class="stat"><b class="${st.net > 0 ? 'up' : st.net < 0 ? 'down' : ''}">${signed(st.net)}</b><span>Net</span></div>
          <div class="stat"><b>${fmt(st.hands)}</b><span>Hands</span></div>
          <div class="stat"><b>${winRate}%</b><span>Won</span></div>
          <div class="stat"><b>${fmt(st.biggestPot)}</b><span>Best pot</span></div>
        </div>
        ${me.canRefill ? '<button class="btn primary" id="refill">Get free chips (back to 10,000)</button>' : ''}
      </section>
      <form class="panel a-start" id="create">
        <h2>Start a table</h2>
        <input id="tname" maxlength="28" placeholder="${esc(me.name)}'s table" aria-label="Table name">
        <span class="lbl">Blinds</span>
        <div class="books">${STAKES.map(([k, sb, bb]) => `<button type="button" class="book" data-st="${k}" aria-pressed="${S.stakes === k}"><span class="cover">${sb}/${bb}</span><span class="strike"></span><span class="buy">Buy-in ${fmt(bb * 100)}</span></button>`).join('')}</div>
        <label class="switch"><input type="checkbox" id="tpriv" ${S.isPrivate ? 'checked' : ''}> Private: only people with the link can join</label>
        <button class="btn primary" type="submit">Open the table</button>
      </form>
      <form class="panel a-join" id="joinf">
        <h2>Got a code?</h2>
        <div class="join-row"><input id="jcode" maxlength="8" placeholder="TG626" autocomplete="off" aria-label="Table code"><button class="btn" type="submit">Join</button></div>
      </form>
      <section class="panel a-open">
        <h2>Open tables</h2>
        ${L.tables.length ? `<div class="rows">${L.tables.map(t => `
          <div class="trow"><span class="chip"></span><div class="txt"><span class="nm">${esc(t.name)}</span><span class="lbl">${t.sb}/${t.bb} · ${t.players + t.bots}/${t.seats} seated</span></div><button class="btn ghost small" data-join="${t.code}">Join</button></div>`).join('')}</div>`
          : '<p class="empty-note">No open tables right now. Start one and send the link to your friends.</p>'}
      </section>
      <section class="panel a-board">
        <h2>High Rollers</h2>
        ${L.leaderboard.length ? `<div class="rows">${L.leaderboard.map((p, i) => `
          <div class="lrow ${i === 0 ? 'first' : ''} ${p.id === me.id ? 'me' : ''}"><span class="rk">${i + 1}</span>${avatarHTML(p.avatar)}<span class="nm">${esc(p.name)}</span>
          <span class="num ${p.net > 0 ? 'up' : p.net < 0 ? 'down' : ''}">${signed(p.net)}</span><span class="h">${fmt(p.hands)} hands</span></div>`).join('')}</div>`
          : '<p class="empty-note">Play a hand to get on the board. Ranked by net chips won.</p>'}
      </section>
    </div>
    <p class="fine">Play chips only. No real money.</p>
  </div>`;
  $('#edit-me').onclick = () => { S.view = 'profile-edit'; renderProfile(true); };
  app.querySelectorAll('[data-st]').forEach(b => b.onclick = () => {
    S.stakes = b.dataset.st;
    app.querySelectorAll('[data-st]').forEach(x => x.setAttribute('aria-pressed', x.dataset.st === S.stakes));
  });
  $('#tpriv').onchange = e => { S.isPrivate = e.target.checked; };
  $('#create').onsubmit = e => { e.preventDefault(); send({ t: 'create', name: $('#tname').value, stakes: S.stakes, isPrivate: S.isPrivate }); };
  $('#joinf').onsubmit = e => {
    e.preventDefault();
    const code = $('#jcode').value.trim().toUpperCase();
    if (!code) return;
    nav('/t/' + code); joinCode(code);
  };
  app.querySelectorAll('[data-join]').forEach(b => b.onclick = () => { nav('/t/' + b.dataset.join); joinCode(b.dataset.join); });
  const r = $('#refill'); if (r) r.onclick = () => send({ t: 'refill' });
}

/* ---------------- table ---------------- */
function renderTableShell() {
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
  if (T.you < 0) { el.innerHTML = `<span class="lbl">Watching · ${T.sb}/${T.bb}</span><span class="watch">${esc(T.name)}</span>`; return; }
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
    + `<div class="meta">Blinds ${T.sb}/${T.bb} · Code ${esc(T.code)}</div>`;
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
      : '<p class="empty-note">No messages yet. Say something.</p>';
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
  const board = [0, 1, 2, 3, 4].map(i => {
    const c = T.board[i];
    return cardHTML(c === undefined ? undefined : c, hi && c !== undefined ? (hi.has(c) ? 'hi' : 'dim') : '');
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
  const key = JSON.stringify([T.you, T.phase, T.handNo, T.toAct, A, me && [me.chips, me.cards, me.folded, me.sittingOut, me.last, me.bet, me.dealt], T.myHand, S.me && S.me.bankroll, isWide()]);
  if (!force && key === S.actionKey) return;
  S.actionKey = key;

  if (!me) {
    el.className = 'mine';
    el.innerHTML = `<p class="wait">Tap an open seat to sit down. Buy-ins run ${fmt(T.buyIn.min)} to ${fmt(T.buyIn.max)}, and you have <span class="num" style="color:var(--brass)">${fmt(S.me ? S.me.bankroll : 0)}</span>.</p>`;
    return;
  }

  const myTurn = T.phase === 'play' && T.toAct === T.you && A;
  el.className = 'mine' + (myTurn ? ' turn' : '');
  const hi = bestSet(T);
  const cards = me.cards.length ? me.cards.map(c => cardHTML(c, hi ? (hi.has(c) ? 'hi' : 'dim') : '')).join('') : '';
  const myTurnNow = T.phase === 'play' && T.toAct === T.you && A;
  const inHand = T.phase === 'play' && me.dealt && !me.folded;
  let wait = 'next hand in a moment';
  if (inHand) wait = me.allIn ? 'you’re all in' : 'waiting on the table…';
  else if (T.phase === 'waiting') wait = 'waiting for another player';
  const handLine = me.folded && T.phase === 'play' ? 'folded' : (T.myHand || (myTurnNow ? '' : wait));
  let html = `<div class="hrow">
    ${cards ? `<div class="cards">${cards}</div>` : ''}
    <div class="info"><span class="hand">${esc(handLine)}</span><span class="num">${fmt(me.chips)}</span></div>
    ${myTurn ? '<span class="timer" id="timer"></span>' : ''}
  </div>`;

  if (myTurn) {
    const callLbl = A.canCheck ? 'Check' : (A.toCall >= me.chips ? `All in ${fmt(A.toCall)}` : `Call ${fmt(A.toCall)}`);
    if (!S.raiseTo || S.raiseTo < A.minTo || S.raiseTo > A.maxTo) S.raiseTo = A.minTo;
    html += `<div class="acts">
        <button class="btn" id="a-fold" ${A.canCheck ? 'disabled' : ''}>Fold</button>
        <button class="btn" id="a-call">${callLbl}</button>
        <button class="btn primary" id="a-raise" ${A.canRaise ? '' : 'disabled'}>Raise</button>
      </div>
      ${A.canRaise ? `<div class="raise">
        <input type="range" id="a-slider" min="${A.minTo}" max="${A.maxTo}" step="1" value="${S.raiseTo}" aria-label="Raise amount">
        <button class="textbtn" data-p="half">½ pot</button><button class="textbtn" data-p="pot">pot</button><button class="textbtn" data-p="all">all in</button>
      </div>` : ''}<div class="turnbar" id="turnbar"></div>`;
  } else if (me.chips === 0 && !(T.phase === 'play' && me.dealt && !me.folded)) {
    html += `<div class="acts"><button class="btn primary" id="a-rebuy">Add chips</button></div>`;
  } else if (me.sittingOut && !(T.phase === 'play' && me.dealt && !me.folded)) {
    html += `<div class="acts"><button class="btn primary" id="a-back">I’m back</button></div>`;
  }
  el.innerHTML = html;

  const on = (id, fn) => { const b = el.querySelector('#' + id); if (b) b.onclick = fn; };
  on('a-fold', () => send({ t: 'act', kind: 'fold' }));
  on('a-call', () => send({ t: 'act', kind: A.canCheck ? 'check' : 'call' }));
  on('a-raise', () => send({ t: 'act', kind: 'raise', amount: S.raiseTo }));
  on('a-back', () => send({ t: 'sitout', out: false }));
  on('a-rebuy', () => openBuyIn(T.you, true));
  if (myTurn && A.canRaise) {
    const sl = el.querySelector('#a-slider');
    sl.oninput = () => setRaise(+sl.value);
    el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
      const potAfter = T.pot + A.toCall;
      const map = { half: A.currentBet + potAfter / 2, pot: A.currentBet + potAfter, all: A.maxTo };
      setRaise(map[b.dataset.p]);
    });
    setRaise(S.raiseTo);
  }
}

function setRaise(v) {
  const A = S.table && S.table.actions;
  if (!A) return;
  v = Math.round(v);
  const step = S.table.sb;
  if (v < A.maxTo) v = Math.round(v / step) * step;
  v = Math.max(A.minTo, Math.min(A.maxTo, v));
  S.raiseTo = v;
  const sl = $('#a-slider'); if (sl && +sl.value !== v) sl.value = v;
  const b = $('#a-raise');
  if (b) b.textContent = v === A.maxTo ? `All in ${fmt(v)}` : (A.currentBet === 0 ? `Bet ${fmt(v)}` : `Raise ${fmt(v)}`);
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
    openModal(`<h2>Not enough chips</h2><p class="wait">You have ${fmt(me.bankroll)} in your bankroll${isRebuy ? '' : ` and this table needs at least ${fmt(T.buyIn.min)}`}. Grab free chips in the lobby.</p><button class="btn primary" data-close>OK</button>`);
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

connect();
