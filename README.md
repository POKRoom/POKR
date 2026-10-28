# Pokr

Texas Hold'em with your friends. Start a table, send the link, and play from any phone or laptop. Play chips only.

## What's in it

- **Online tables.** Create a table, share the invite link or 5-letter code, and play with up to six people. There are four blind levels, from 5/10 to 50/100. Tables can be public (listed in the lobby) or private (link only).
- **Server-side dealing.** The server shuffles with a cryptographic random number generator and deals every card. Each player's browser only receives their own hole cards. Other players' cards arrive face down until showdown.
- **Profiles and avatars.** Pick a name, an animal avatar and a color. Everyone starts with 10,000 play chips, and players under 1,000 can get free chips back up to 10,000.
- **Stats and leaderboard.** Pokr tracks hands played, hands won, net winnings and biggest pot, and ranks players by net chips won.
- **Chat and reactions.** Each table has its own chat and eight quick reactions that float over your seat.
- **Bots.** The table host can fill empty seats with computer players. Each bot has a style: Rook plays tight, Mae loose, Dex aggressive, Juno calls a lot.
- **Full Hold'em rules.** Blinds, min-raises, all-ins, side pots, split pots, a 30-second turn timer (two timeouts sits you out), and seats held for 5 minutes if someone disconnects.
- **Chip ledger.** Every buy-in, cash-out and refill is written to `data/ledger.jsonl`.

There are no npm dependencies. Pokr is plain Node.js with its own WebSocket server, so there's nothing to install.

## Run it on your computer

1. Install Node.js 22 from https://nodejs.org (the LTS version).
2. Open a terminal in this folder and run `npm start`.
3. Go to http://localhost:3000. To try multiplayer alone, open a second window in private/incognito mode. That gives you a second player.

Run `npm test` to check the hand rankings, side pots, chip accounting and card privacy.

## Put it online (free, about 10 minutes)

You need two free accounts: GitHub, which holds the code, and Render, which runs the server.

1. **Upload the code to GitHub.** Sign up at https://github.com and click **New repository**. Name it `pokr`; Private is fine. On the next page, click **uploading an existing file**. Drag in everything *inside* this folder (`public`, `server`, `test`, `package.json`, `render.yaml`, `README.md`), then click **Commit changes**.
2. **Create the server on Render.** Sign up at https://render.com with your GitHub account, then click **New → Web Service** and pick your `pokr` repo. Use these settings:
   - Language: **Node**
   - Build command: `npm install`
   - Start command: `npm start`
   - Instance type: **Free**
3. Click **Deploy**. After a minute or two you'll get a link like `https://pokr-xxxx.onrender.com`. That's your app. Open it, make a profile, start a table and hit **Copy invite link**.
4. On a phone, open the link in Safari, tap Share, then **Add to Home Screen**. Pokr will open like a regular app.

### The free plan's catch

On Render's free plan, the server goes to sleep after 15 minutes with nobody connected, and the next visit takes about a minute to wake it. Its storage is also wiped whenever it sleeps or redeploys, so **profiles, bankrolls and the leaderboard reset**. That's fine for testing with friends.

To keep accounts, switch the service to the $7/month instance and add a 1 GB disk (about $0.25/month):

1. In Render, go to **Disks** and add one with mount path `/var/data`.
2. In **Environment**, add `DATA_DIR` = `/var/data`.

Every time you upload new code to GitHub, Render redeploys automatically.

## How the code is laid out

| File | What it does |
|---|---|
| `server/index.js` | Web server, WebSocket messages, tables, chat, accounts |
| `server/engine.js` | The poker rules: betting rounds, timers, side pots, what each player is allowed to see |
| `server/cards.js` | Shuffling, hand ranking, odds for bots |
| `server/bots.js` | Computer players |
| `server/store.js` | Accounts, bankrolls, stats, chip ledger (JSON files in `data/`) |
| `server/ws.js` | The WebSocket layer |
| `public/` | The app people see: `index.html`, `app.js`, `app.css` |

## Before real money

Pokr is built so real money could be added later: the server deals every card, chip amounts are whole numbers, and every chip movement is logged. But real-money poker in the US is regulated state by state, and only a few states allow online poker at all. Real money would need:

- Gaming licenses in each state you operate in, and legal counsel before anything else
- Identity, age (21+ in most states) and location checks for every player
- A licensed payment processor, plus anti-fraud and anti-collusion monitoring
- Certified random number generation, a real database and audits

Some apps use a "sweepstakes" model instead, which follows different rules. Talk to a gaming lawyer before building either. Until then, keep the "play chips only" line in the app.
