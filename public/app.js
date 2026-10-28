'use strict';
/* Pokr web client. The server holds the truth; this file only draws what it's told and sends intents. */

const AVATARS = ['🦊', '🐻', '🐼', '🦁', '🐯', '🐸', '🐵', '🦉', '🐙', '🦈', '🐺', '🐰', '🦄', '🐲', '👽', '🤠'];
const COLORS = ['#f2603f', '#e8b85c', '#3fa796', '#5f7df0', '#b863d1', '#dc4f78', '#6cb35c', '#7d8a96'];
const REACTIONS = ['👍', '😂', '🔥', '😱', '💀', '👏', '🤡', '💰'];
const STAKES = [['micro', 5, 10], ['low', 10, 20], ['mid', 25, 50], ['high', 50, 100]];
const SUIT_SYM = ['♠', '♥', '♦', '♣'], SUIT_NAME = ['spades', 'hearts', 'diamonds', 'clubs'];
// Seat spots around the oval, as % of the stage. Index 0 is always the bottom (you).
const POS = [[50, 89], [10, 66], [10, 27], [50, 9], [90, 27], [90, 66]];

const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Number(n || 0).toLocaleString('en-US');
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

const S = {
  view: 'boot', me: null, lobby: null, table: null, tableAt: 0, chat: [], token: store.get('pokr.token'),
  connected: false, raiseTo: 0, actionKey: '', sideTab: 'chat', stakes: 'low', isPrivate: false,
  draft: { a: Math.floor(Math.random() * AVATARS.length), c: Math.floor(Math.random() * COLORS.length) },
};

function avatarHTML(av, size) {
  const glyph = av && av.a >= 0 ? AVATARS[av.a] : '🤖';
  const color = COLORS[(av && av.c) || 0];
  return `<span class="ava" style="--ac:${color};${size ? `--size:${size}px` : ''}" aria-hidden="true">${glyph}</span>`;
}
function cardHTML(c, cls = '') {
  if (c === undefined) return `<div class="pc empty ${cls}" aria-hidden="true"></div>`;
  if (c === null) return `<div class="pc back ${cls}" aria-label="Face-down card"></div>`;
  const r = c % 13 + 2, s = Math.floor(c / 13);
  const rt = { 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[r] || String(r);
  return `<div class="pc ${s === 1 || s === 2 ? 'red' : ''} ${cls}" aria-label="${rt} of ${SUIT_NAME[s]}"><span class="r">${rt}</span><span class="s">${SUIT_SYM[s]}</span></div>`;
}
function toast(text) {
  const d = document.createElement('div');
  d.textContent = text;
  $('#toast').appendChild(d);
  setTimeout(() => d.remove(), 3200);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/* ---------------- connection ---------------- */
let ws, retry = 0;
function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
  ws.onopen = () => { S.connected = true; retry = 0; $('#conn').hidden = true; S.rejoin = S.view === 'table'; send({ t: 'hello', token: S.token }); };
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } onMessage(m); };
  ws.onclose = () => {
    S.connected = false;
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
      const wasEntering = S.view === 'boot' || S.view === 'profile';
      S.me = m.user;
      if (wasEntering) enterApp();
      else if (S.view === 'table') {
        if (S.rejoin) { S.rejoin = false; send({ t: 'join', code: S.table ? S.table.code : routeCode() }); }
        renderMine(true);
      }
      else if (S.view === 'lobby') renderLobby();
      break;
    }
    case 'lobby': S.lobby = m; if (S.view === 'lobby') renderLobby(); break;
    case 'created': history.pushState({}, '', '/t/' + m.code); joinCode(m.code); break;
    case 'state': {
      const fresh = S.view !== 'table' || !S.table || S.table.code !== m.s.code || !$('#stage');
      S.table = m.s; S.tableAt = performance.now();
      if (fresh) { S.view = 'table'; renderTableShell(); }
      renderTable();
      break;
    }
    case 'notFound': toast('That table is closed or the code is wrong'); history.replaceState({}, '', '/'); goLobby(); break;
    case 'chat': if (m.reset) S.chat = []; S.chat.push(...m.items); if (S.chat.length > 80) S.chat.splice(0, S.chat.length - 80); renderFeed(); break;
    case 'react': showReaction(m); break;
    case 'error': toast(m.message); break;
  }
}

/* ---------------- routing ---------------- */
function routeCode() { const m = location.pathname.match(/^\/t\/([A-Za-z0-9]{3,8})/); return m ? m[1].toUpperCase() : null; }
function enterApp() { const code = routeCode(); if (code) joinCode(code); else goLobby(); }
function joinCode(code) {
  S.view = 'table'; S.table = null; S.chat = []; S.actionKey = '';
  app.innerHTML = `<div class="boot"><p class="wait">Joining table <span class="code">${esc(code)}</span>…</p></div>`;
  send({ t: 'join', code });
}
function goLobby() { S.view = 'lobby'; S.table = null; send({ t: 'lobby' }); renderLobby(); }
function leaveTable() { send({ t: 'leave' }); history.pushState({}, '', '/'); S.view = 'lobby'; S.table = null; renderLobby(); }
window.addEventListener('popstate', () => {
  const code = routeCode();
  if (code) joinCode(code);
  else if (S.view === 'table') { send({ t: 'leave' }); S.view = 'lobby'; S.table = null; renderLobby(); }
});

/* ---------------- profile ---------------- */
function renderProfile(editing) {
  if (editing && S.me) S.draft = { ...S.me.avatar };
  const d = S.draft;
  app.innerHTML = `
  <main class="onboard">
    <h1 class="logo big" aria-label="Pokr">p<span class="o"></span>kr</h1>
    <p class="lede">${editing ? 'Update how you show up at the table.' : 'Hold’em with your friends. Pick a name and an avatar, then start a table and send the link.'}</p>
    <form class="card pf" id="pf">
      <div class="row">${avatarHTML(d, 64).replace('class="ava"', 'class="ava" id="pf-prev"')}
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:6px">
          <label for="pf-name">Name</label>
          <input id="pf-name" maxlength="16" autocomplete="nickname" placeholder="What should the table call you?" value="${esc(editing && S.me ? S.me.name : '')}">
        </div>
      </div>
      <div class="lbl">Avatar</div>
      <div class="ava-grid">${AVATARS.map((g, i) => `<button type="button" data-a="${i}" aria-pressed="${i === d.a}" style="--ac:${COLORS[d.c]}" aria-label="Avatar ${i + 1}">${g}</button>`).join('')}</div>
      <div class="lbl">Color</div>
      <div class="swatches">${COLORS.map((c, i) => `<button type="button" data-c="${i}" aria-pressed="${i === d.c}" style="--sw:${c}" aria-label="Color ${i + 1}"></button>`).join('')}</div>
      <button class="btn primary" type="submit">${editing ? 'Save profile' : 'Start playing'}</button>
      ${editing ? '<button class="btn ghost" type="button" id="pf-cancel">Cancel</button>' : ''}
    </form>
    <p class="fine">${editing ? '' : 'You start with 10,000 play chips. '}Pokr uses play chips only. No real money.</p>
  </main>`;
  const paint = () => {
    app.querySelectorAll('[data-a]').forEach(b => { b.setAttribute('aria-pressed', +b.dataset.a === S.draft.a); b.style.setProperty('--ac', COLORS[S.draft.c]); });
    app.querySelectorAll('[data-c]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.c === S.draft.c));
    const p = $('#pf-prev'); p.textContent = AVATARS[S.draft.a]; p.style.setProperty('--ac', COLORS[S.draft.c]);
  };
  app.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { S.draft.a = +b.dataset.a; paint(); });
  app.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { S.draft.c = +b.dataset.c; paint(); });
  if (editing) $('#pf-cancel').onclick = () => goLobby();
  $('#pf').onsubmit = e => {
    e.preventDefault();
    const name = $('#pf-name').value.trim();
    if (name.length < 2) { toast('Pick a name with at least 2 characters'); return; }
    send({ t: 'profile', name, avatar: S.draft });
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
      <h1 class="logo" aria-label="Pokr">p<span class="o"></span>kr</h1>
      <button class="me-chip" id="edit-me" title="Edit profile">${avatarHTML(me.avatar)}<span class="nm">${esc(me.name)}</span><span class="num">${fmt(me.bankroll)}</span></button>
    </div>
    <div class="lobby-grid">
      <div class="col">
        <form class="card" id="create">
          <h2>Start a table</h2>
          <div style="display:flex;flex-direction:column;gap:6px"><label for="tname">Table name</label>
          <input id="tname" maxlength="28" placeholder="${esc(me.name)}'s table"></div>
          <div class="lbl">Blinds</div>
          <div class="seg">${STAKES.map(([k, sb, bb]) => `<button type="button" data-st="${k}" aria-pressed="${S.stakes === k}"><b>${sb}/${bb}</b><span>buy-in ${fmt(bb * 100)}</span></button>`).join('')}</div>
          <label class="check"><input type="checkbox" id="tpriv" ${S.isPrivate ? 'checked' : ''}> Private: only people with the link can find it</label>
          <button class="btn primary" type="submit">Create table</button>
        </form>
        <form class="card" id="joinf">
          <h2>Join with a code</h2>
          <div class="join-row"><input id="jcode" maxlength="8" placeholder="ABC12" autocomplete="off" aria-label="Table code"><button class="btn" type="submit">Join</button></div>
        </form>
        <section class="card">
          <h2>Open tables</h2>
          ${L.tables.length ? `<div class="tables-list">${L.tables.map(t => `
            <div class="trow"><span class="nm">${esc(t.name)}</span><span class="meta">${t.sb}/${t.bb} · ${t.players + t.bots}/${t.seats}</span><button class="btn small" data-join="${t.code}">Join</button></div>`).join('')}</div>`
            : '<p class="empty-note">No public tables right now. Start one and send the link to your friends.</p>'}
        </section>
      </div>
      <div class="col">
        <section class="card">
          <h2>Your chips</h2>
          <div class="stats">
            <div class="stat big"><b>${fmt(me.bankroll)}</b><span>Bankroll${me.atTables ? ` · ${fmt(me.atTables)} at tables` : ''}</span></div>
            <div class="stat"><b class="${st.net > 0 ? 'pos' : st.net < 0 ? 'neg' : ''}">${signed(st.net)}</b><span>Net winnings</span></div>
            <div class="stat"><b>${fmt(st.hands)}</b><span>Hands played</span></div>
            <div class="stat"><b>${winRate}%</b><span>Hands won</span></div>
            <div class="stat"><b>${fmt(st.biggestPot)}</b><span>Biggest pot</span></div>
          </div>
          ${me.canRefill ? '<button class="btn primary" id="refill">Get free chips (back to 10,000)</button>' : ''}
        </section>
        <section class="card">
          <h2>Leaderboard</h2>
          ${L.leaderboard.length ? `<div class="lb-wrap"><table class="lb">
            <thead><tr><th></th><th>Player</th><th>Net</th><th>Hands</th><th>Won</th></tr></thead>
            <tbody>${L.leaderboard.map((p, i) => `<tr class="${p.id === me.id ? 'me' : ''}"><td class="rank">${i + 1}</td>
              <td class="who"><div class="row">${avatarHTML(p.avatar)}<span>${esc(p.name)}</span></div></td>
              <td class="${p.net > 0 ? 'pos' : p.net < 0 ? 'neg' : ''}">${signed(p.net)}</td><td>${fmt(p.hands)}</td><td>${Math.round(p.winRate * 100)}%</td></tr>`).join('')}</tbody>
          </table></div>` : '<p class="empty-note">Play a hand to get on the board. Ranked by net chips won.</p>'}
        </section>
      </div>
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
    history.pushState({}, '', '/t/' + code); joinCode(code);
  };
  app.querySelectorAll('[data-join]').forEach(b => b.onclick = () => { history.pushState({}, '', '/t/' + b.dataset.join); joinCode(b.dataset.join); });
  const r = $('#refill'); if (r) r.onclick = () => send({ t: 'refill' });
}

/* ---------------- table ---------------- */
const inviteLabel = () => (matchMedia('(max-width: 640px)').matches ? 'Invite' : 'Copy invite link');
function renderTableShell() {
  const T = S.table;
  app.innerHTML = `
  <div class="tbl">
    <header class="tbar">
      <button class="btn small ghost" id="back" aria-label="Back to lobby">← Lobby</button>
      <div class="title"><b>${esc(T.name)}</b><span>Blinds ${T.sb}/${T.bb} · Code <span class="code">${esc(T.code)}</span></span></div>
      <button class="btn small" id="invite">${inviteLabel()}</button>
    </header>
    <div class="tmain">
      <div class="play">
        <div class="stage" id="stage"></div>
        <section class="mine" id="mine"></section>
      </div>
      <aside class="side">
        <div class="tabs" role="tablist">
          <button role="tab" id="tab-chat" aria-selected="${S.sideTab === 'chat'}">Chat</button>
          <button role="tab" id="tab-hist" aria-selected="${S.sideTab === 'hist'}">Hand history</button>
        </div>
        <div class="feed" id="feed"></div>
        <form class="chatform" id="chatform"><input id="chatin" maxlength="200" placeholder="Say something…" autocomplete="off" aria-label="Chat message"><button class="btn small primary" type="submit">Send</button></form>
      </aside>
    </div>
  </div>`;
  $('#back').onclick = () => {
    const T2 = S.table, me = T2 && T2.you >= 0 ? T2.seats[T2.you] : null;
    if (me && T2.phase === 'play' && me.dealt && !me.folded) { openLeaveConfirm(); return; }
    leaveTable();
  };
  $('#invite').onclick = async e => {
    const url = location.origin + '/t/' + S.table.code;
    if (await copy(url)) { e.target.textContent = 'Link copied'; setTimeout(() => { e.target.textContent = inviteLabel(); }, 1800); }
    else openModal(`<h2>Invite friends</h2><p class="wait">Send them this link:</p><input readonly value="${esc(url)}" id="inv-url"><button class="btn primary" data-close>Done</button>`, () => $('#inv-url').select());
  };
  $('#tab-chat').onclick = () => { S.sideTab = 'chat'; renderFeed(); };
  $('#tab-hist').onclick = () => { S.sideTab = 'hist'; renderFeed(); };
  $('#chatform').onsubmit = e => {
    e.preventDefault();
    const v = $('#chatin').value.trim();
    if (!v) return;
    send({ t: 'chat', text: v });
    $('#chatin').value = '';
    if (S.sideTab !== 'chat') { S.sideTab = 'chat'; renderFeed(); }
  };
  renderFeed();
}

function renderTable() {
  renderStage();
  renderMine(false);
  if (S.sideTab === 'hist') renderFeed();
}

function bestSet(T) {
  // Cards that make up a winner's best five, so they can be lifted at showdown.
  if (T.phase !== 'done' || !T.result || T.result.foldWin) return null;
  const set = new Set();
  for (const w of T.result.winners) { const s = T.seats[w.seat]; if (s && s.best) s.best.forEach(c => set.add(c)); }
  return set;
}

function renderStage() {
  const T = S.table, stage = $('#stage');
  if (!stage) return;
  const n = T.seats.length, base = T.you >= 0 ? T.you : 0;
  const hi = bestSet(T);
  const meSeated = T.you >= 0;
  let html = '';

  // felt center
  let msg = '', sub = '';
  if (T.phase === 'waiting') {
    const seated = T.seats.filter(Boolean).length;
    msg = seated < 2 ? 'Waiting for players' : 'Starting soon…';
    sub = seated < 2 ? (T.isHost ? 'Invite friends with the link, or add a bot to an empty seat.' : 'Invite friends with the link above.') : '';
  } else if (T.phase === 'done' && T.result) {
    const ws = T.result.winners;
    const nm = w => (w.seat === T.you ? 'You' : esc(w.name));
    if (ws.length === 1) msg = `${nm(ws[0])} ${ws[0].seat === T.you ? 'win' : 'wins'} ${fmt(ws[0].amount)}${ws[0].hand ? ` with ${ws[0].hand.toLowerCase()}` : ''}`;
    else msg = `Split pot: ${ws.map(w => `${nm(w)} ${fmt(w.amount)}`).join(', ')}`;
    sub = T.result.foldWin ? 'Everyone else folded' : 'Next hand in a moment';
  } else if (T.phase === 'play') {
    const a = T.seats[T.toAct];
    msg = T.toAct === T.you ? 'Your move' : a ? `${esc(a.name)} to act` : '';
  }
  const board = [0, 1, 2, 3, 4].map(i => {
    const c = T.board[i];
    return cardHTML(c === undefined ? undefined : c, hi ? (hi.has(c) ? 'hi' : 'dim') : '');
  }).join('');
  html += `<div class="felt">
    <div class="street">${T.phase === 'play' || T.phase === 'done' ? esc(T.street) + ' · Hand ' + T.handNo : 'Table open'}</div>
    <div class="board" aria-label="Board">${board}</div>
    <div class="pot">Pot <b>${fmt(T.pot)}</b></div>
    <div class="fmsg">${msg}</div>${sub ? `<div class="fsub">${sub}</div>` : ''}
  </div>`;

  for (let i = 0; i < n; i++) {
    const k = (i - base + n) % n;
    const [x, y] = POS[k] || POS[0];
    const s = T.seats[i];
    if (!s) {
      let inner;
      if (!meSeated && S.me) inner = `<button class="open" data-sit="${i}" aria-label="Sit in seat ${i + 1}">Sit</button>`;
      else inner = `<div class="open">Open</div>`;
      const bot = T.isHost ? `<button class="btn small ghost addbot" data-bot="${i}">+ Bot</button>` : '';
      html += `<div class="seat empty" style="left:${x}%;top:${y}%" data-seat="${i}">${inner}${bot}</div>`;
      continue;
    }
    const isMe = i === T.you;
    const turn = T.phase === 'play' && T.toAct === i;
    const won = T.phase === 'done' && s.won > 0;
    const shown = !isMe && s.cards.length && s.cards[0] !== null;
    const cls = ['seat', turn && 'turn', won && 'won', s.folded && 'folded', (s.sittingOut || !s.connected) && 'away', shown && 'shown'].filter(Boolean).join(' ');
    const hole = isMe ? '' : s.cards.map(c => cardHTML(c, hi && c !== null ? (hi.has(c) ? 'hi' : 'dim') : '')).join('');
    let status = s.last;
    if (won) status = `Won ${fmt(s.won)}`;
    else if (s.handName && T.phase === 'done') status = s.handName;
    else if (turn) status = isMe ? 'Your turn' : 'Thinking…';
    else if (!s.connected) status = 'Away';
    else if (s.sittingOut && !s.dealt) status = s.last === 'Busted' ? 'Busted' : 'Sitting out';
    html += `<div class="${cls}" style="left:${x}%;top:${y}%" data-seat="${i}">
      <div class="hole">${hole}</div>
      <div style="position:relative">${avatarHTML(s.avatar)}${turn ? '<span class="ring" id="ring"></span>' : ''}${T.dealer === i && T.phase !== 'waiting' ? '<span class="dbtn">D</span>' : ''}</div>
      <div class="plate"><span class="nm">${isMe ? 'You' : esc(s.name)}</span><span class="ch">${fmt(s.chips)}</span></div>
      <div class="act">${esc(status || '')}</div>
      ${T.isHost && s.kind === 'bot' ? `<button class="kick" data-kick="${i}" aria-label="Remove ${esc(s.name)}">×</button>` : ''}
    </div>`;
    if (s.bet > 0) {
      const bx = x + (50 - x) * 0.42, by = y + (47 - y) * 0.42;
      html += `<div class="bet" style="left:${bx}%;top:${by}%">${fmt(s.bet)}</div>`;
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
  const key = JSON.stringify([T.you, T.phase, T.handNo, T.toAct, A, me && [me.chips, me.cards, me.folded, me.sittingOut, me.last, me.bet, me.dealt], T.myHand, S.me && S.me.bankroll]);
  if (!force && key === S.actionKey) return;
  S.actionKey = key;
  const reacts = S.me ? `<div class="reacts" aria-label="Reactions">${REACTIONS.map(e => `<button data-r="${e}" aria-label="React ${e}">${e}</button>`).join('')}</div>` : '';

  if (!me) {
    el.className = 'mine';
    el.innerHTML = `<div class="info"><span class="eyebrow">Watching</span><span class="num">${fmt(S.me ? S.me.bankroll : 0)}</span><span class="sub">in your bankroll</span></div>
      <div class="controls"><p class="wait" style="margin:0">Tap an open seat to sit down. Buy-ins are ${fmt(T.buyIn.min)} to ${fmt(T.buyIn.max)}.</p>${reacts}</div>`;
    bindReacts(el);
    return;
  }

  const myTurn = T.phase === 'play' && T.toAct === T.you && A;
  el.className = 'mine' + (myTurn ? ' turn' : '');
  const cards = me.cards.length ? me.cards.map(c => cardHTML(c, bestSet(T) ? (bestSet(T).has(c) ? 'hi' : 'dim') : '')).join('') : cardHTML(undefined) + cardHTML(undefined);
  const hn = me.folded && T.phase === 'play' ? 'Folded' : (T.myHand || '');
  const left = `<div class="hand"><div class="cards">${cards}</div>
    <div class="info"><span class="hn">${esc(hn)}</span><span class="num">${fmt(me.chips)}</span><span class="sub">${me.bet > 0 && T.phase === 'play' ? `${fmt(me.bet)} in this round` : 'chips at the table'}</span></div></div>`;

  let right = '';
  if (myTurn) {
    const callLbl = A.canCheck ? 'Check' : (A.toCall >= me.chips ? `All in ${fmt(A.toCall)}` : `Call ${fmt(A.toCall)}`);
    if (!S.raiseTo || S.raiseTo < A.minTo || S.raiseTo > A.maxTo) S.raiseTo = A.minTo;
    right = `<div class="btns">
        <button class="btn" id="a-fold" ${A.canCheck ? 'disabled' : ''}>Fold</button>
        <button class="btn" id="a-call">${callLbl}</button>
        <button class="btn primary" id="a-raise" ${A.canRaise ? '' : 'disabled'}>Raise</button>
      </div>
      ${A.canRaise ? `<div class="raise">
        <input type="range" id="a-slider" min="${A.minTo}" max="${A.maxTo}" step="1" value="${S.raiseTo}" aria-label="Raise amount">
        <div class="presets"><button class="btn" data-p="min">Min</button><button class="btn" data-p="half">½ pot</button><button class="btn" data-p="pot">Pot</button><button class="btn" data-p="all">All in</button></div>
      </div>` : ''}${reacts}<div class="turnbar" id="turnbar"></div>`;
  } else if (me.sittingOut && !(T.phase === 'play' && me.dealt && !me.folded)) {
    const busted = me.chips === 0;
    right = `<p class="wait" style="margin:0">${busted ? 'You’re out of chips at this table.' : 'You’re sitting out. You won’t be dealt in.'}</p>
      <div class="btns">${busted ? '<button class="btn primary" id="a-rebuy">Add chips</button>' : '<button class="btn primary" id="a-back">I’m back</button>'}<button class="btn" id="a-stand">Stand up</button></div>${reacts}`;
  } else {
    let wait = 'Waiting for the next hand…';
    if (T.phase === 'play' && me.dealt && !me.folded) wait = me.allIn ? 'You’re all in. Good luck.' : 'Waiting for your turn…';
    else if (T.phase === 'play' && me.folded) wait = 'You folded. Next hand soon.';
    else if (T.phase === 'waiting') wait = 'Waiting for at least one more player.';
    right = `<p class="wait" style="margin:0">${wait}</p>${reacts}
      <div class="mini-links"><button class="link" id="a-out">Sit out next hand</button>${me.chips < T.buyIn.max && !(T.phase === 'play' && me.dealt && !me.folded) ? '<button class="link" id="a-rebuy">Add chips</button>' : ''}<button class="link" id="a-stand">Stand up</button></div>`;
  }
  el.innerHTML = left + `<div class="controls">${right}</div>`;
  bindReacts(el);

  const on = (id, fn) => { const b = el.querySelector('#' + id); if (b) b.onclick = fn; };
  on('a-fold', () => send({ t: 'act', kind: 'fold' }));
  on('a-call', () => send({ t: 'act', kind: A.canCheck ? 'check' : 'call' }));
  on('a-raise', () => send({ t: 'act', kind: 'raise', amount: S.raiseTo }));
  on('a-back', () => send({ t: 'sitout', out: false }));
  on('a-out', () => { send({ t: 'sitout', out: true }); toast('You’ll sit out from the next hand'); });
  on('a-stand', () => send({ t: 'stand' }));
  on('a-rebuy', () => openBuyIn(T.you, true));
  if (myTurn && A.canRaise) {
    const sl = el.querySelector('#a-slider');
    sl.oninput = () => setRaise(+sl.value);
    el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
      const potAfter = T.pot + A.toCall;
      const map = { min: A.minTo, half: A.currentBet + potAfter / 2, pot: A.currentBet + potAfter, all: A.maxTo };
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
  if (b) b.textContent = v === A.maxTo ? `All in ${fmt(v)}` : (A.currentBet === 0 ? `Bet ${fmt(v)}` : `Raise to ${fmt(v)}`);
}

function bindReacts(el) {
  el.querySelectorAll('[data-r]').forEach(b => b.onclick = () => send({ t: 'react', e: b.dataset.r }));
}

function showReaction(m) {
  if (m.seat >= 0) {
    const seat = document.querySelector(`.seat[data-seat="${m.seat}"]`);
    if (seat) {
      const b = document.createElement('span');
      b.className = 'bubble'; b.textContent = m.e;
      seat.appendChild(b);
      setTimeout(() => b.remove(), 2500);
      return;
    }
  }
  S.chat.push({ id: 'r' + Date.now(), sys: true, text: `${m.name} reacted ${m.e}` });
  renderFeed();
}

function renderFeed() {
  const feed = $('#feed');
  if (!feed) return;
  $('#tab-chat').setAttribute('aria-selected', S.sideTab === 'chat');
  $('#tab-hist').setAttribute('aria-selected', S.sideTab === 'hist');
  $('#chatform').hidden = S.sideTab !== 'chat';
  const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 40;
  if (S.sideTab === 'chat') {
    feed.innerHTML = S.chat.length ? S.chat.map(m => m.sys
      ? `<div class="msg sys">${esc(m.text)}</div>`
      : `<div class="msg">${avatarHTML(m.avatar)}<div class="body"><b>${esc(m.name)}</b>${esc(m.text)}</div></div>`).join('')
      : '<p class="empty-note">No messages yet. Say hi.</p>';
  } else {
    const log = S.table ? S.table.log : [];
    feed.innerHTML = log.length ? log.map(l => `<div class="histline ${/^Hand #/.test(l) ? 'h' : ''}">${esc(l)}</div>`).join('') : '<p class="empty-note">Hands will show up here.</p>';
  }
  if (atBottom || S.sideTab === 'hist') feed.scrollTop = feed.scrollHeight;
}

/* ---------------- dialogs ---------------- */
function openModal(html, after) {
  $('#modal').innerHTML = `<div class="scrim"><div class="card dialog" role="dialog" aria-modal="true">${html}</div></div>`;
  const scrim = $('#modal .scrim');
  scrim.onclick = e => { if (e.target === scrim || e.target.hasAttribute('data-close')) closeModal(); };
  if (after) after();
}
function closeModal() { $('#modal').innerHTML = ''; }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function openBuyIn(seat, isRebuy) {
  const T = S.table, me = S.me;
  if (!T || !me) return;
  const current = isRebuy && T.you >= 0 ? T.seats[T.you].chips : 0;
  const max = Math.min(T.buyIn.max - current, me.bankroll);
  const min = isRebuy ? Math.min(T.bb, max) : T.buyIn.min;
  if (max < min || max <= 0) {
    openModal(`<h2>Not enough chips</h2><p class="wait">You have ${fmt(me.bankroll)} in your bankroll${isRebuy ? '' : ` and this table needs at least ${fmt(T.buyIn.min)}`}. Head to the lobby to grab free chips.</p><button class="btn primary" data-close>OK</button>`);
    return;
  }
  let v = max;
  openModal(`
    <h2>${isRebuy ? 'Add chips' : 'Take a seat'}</h2>
    <p class="wait" style="margin:0">Bankroll: <span class="num">${fmt(me.bankroll)}</span></p>
    <div class="row between"><span class="lbl">${isRebuy ? 'Add' : 'Buy in for'}</span><b class="num" id="bi-v" style="font-size:22px;color:var(--brass)">${fmt(v)}</b></div>
    <input type="range" id="bi-s" min="${min}" max="${max}" step="${T.bb}" value="${v}" aria-label="Buy-in amount">
    <div class="btns"><button class="btn" data-close>Cancel</button><button class="btn primary" id="bi-go">${isRebuy ? 'Add chips' : 'Sit down'}</button></div>`, () => {
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
  openModal(`<h2>Leave the table?</h2><p class="wait" style="margin:0">You’re in a hand. Leaving folds your cards and your chips go back to your bankroll.</p>
    <div class="btns"><button class="btn" data-close>Stay</button><button class="btn primary" id="lv-go">Leave</button></div>`,
  () => { $('#lv-go').onclick = () => { closeModal(); leaveTable(); }; });
}

/* ---------------- turn timer ---------------- */
function tick() {
  const T = S.table;
  if (T && S.view === 'table' && T.phase === 'play' && T.turnMs) {
    const left = Math.max(0, T.turnMs - (performance.now() - S.tableAt));
    const p = left / T.turnTotal;
    const ring = $('#ring'); if (ring) ring.style.setProperty('--p', p.toFixed(3));
    const bar = $('#turnbar'); if (bar) bar.style.setProperty('--p', p.toFixed(3));
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

connect();
