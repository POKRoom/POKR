# Pokr: standing instructions

Pokr is Brandon's poker app: Hold'em and Omaha cash tables, tournaments and Sit & Gos,
backgammon, characters, Pro Pass. Play money now; real money is the goal later.

## Rules that always apply
- Work on the `lounge-redesign` branch. Never push to `main` (the live site) until Brandon says "ship it".
- After every change: run the tests, rebuild the preview, republish the "Pokr Preview" artifact,
  commit and push `lounge-redesign`. Pushing also redeploys the test site, pokr-test.onrender.com.
- Commit messages end with the Co-Authored-By and Claude-Session lines the session provides.
- Money is whole cents everywhere. Never use floats for money. `money()` in server/cards.js formats it.
- Every money movement goes through the ledger (store.ledger) and every chip at a table or board
  is tracked in `u.atTables` (boards use the key `bg:CODE`) so a restart refunds it.
- Never put secrets or personal emails in the code. Admins come from the ADMIN_EMAILS env var;
  the Upstash keys from UPSTASH_REDIS_REST_URL / _TOKEN.

## How the code fits together
- `server/` is zero-dependency Node 22. The rules modules are shared by the real server
  (`server/index.js`) and the in-browser preview (`preview/sim.js`, bundled by `preview/build.js`):
  engine.js (poker table), cards.js, bots.js, tournament.js + tourneys.js (MTTs and Sit & Gos),
  backgammon.js + bgbot.js + bgrooms.js, shop.js (Pro Pass), looks.js (characters), store.js + cloud.js.
- Any new message handler goes in BOTH server/index.js and preview/sim.js. New server modules
  must be added to the bundle list in preview/build.js.
- `public/app.js` is the whole client (vanilla JS). `public/app.css` is stacked layers: later rules win.
  Add a new layer at the end rather than editing old ones in place.

## Design rules (Brandon's taste, learned the hard way)
- Serious, not cartoony; not "vibe coded". Flat dark surfaces tinted by the app theme, one accent,
  sentence-case labels, no glows or gradients on app screens (the table rooms are the exception).
- The table: drawn characters on our own name tags (colour stripe, quiet name, white stack after a
  gold chip), clean white four-colour cards, Fold + Check/Call boxes and the chip tower (no Raise
  button), the winning hand stated plainly and chips flying to the winner.
- Don't copy Pure Poker outright: same quality, our own details.
- Phone first: 44pt touch targets, 16px inputs, safe areas, six tabs that fit at 375px.

## Before calling a change done
- `npm test` passes (engine, PLO, tournaments, Sit & Gos, backgammon rules + boards, shop,
  characters, cloud save, multiplayer).
- Screenshot the changed screens at 375/390 and desktop width and look at them.
- Update `claude/pokr-status.md` in the Pokr project when something durable changes.
