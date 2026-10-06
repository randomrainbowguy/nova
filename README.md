# Nova

A game hub with accounts, an admin panel, polls, updates, Pro membership and a live Pro chat.
It runs on **Cloudflare Workers**:

| Piece | What it uses |
|---|---|
| Pages and logic | A Worker (`src/`, built with [Hono](https://hono.dev)) |
| Users, games, polls, updates, chat history | **D1** (Cloudflare's SQLite) |
| Uploaded single-file HTML games | **KV** |
| Live Pro chat | A **Durable Object** (`src/chat.js`) |
| CSS, JS, the landing page, EmulatorJS | Static assets in `public/` |

## Deploying to Cloudflare

The Git integration in the Cloudflare dashboard does everything:

1. **Workers & Pages → Create → Import a repository** → `randomrainbowguy/nova`.
2. Leave **Build command** empty. **Deploy command**: `npx wrangler deploy` (the default).
3. Deploy. The first deploy creates the D1 database and the KV namespace by itself, and the
   Worker creates its tables the first time someone opens the site. No IDs to paste.
4. Open the site. With no owner yet you land on **/setup**. It asks for a **setup code**: find it in
   the dashboard under your Worker → **Logs** (search for `Setup code`). Or set your own
   `OWNER_SETUP_CODE` secret (Worker → Settings → Variables and Secrets) and use that.
5. On /setup, either create a fresh owner account, or **bring over the old site**:
   run `python3 scripts/export-to-d1.py` on the computer that has the old `nova.db`. It writes
   `scripts/nova-data.sql`. Upload that file in the "Moving from the old site?" box. Every account,
   game, poll, vote and update comes over, and everyone keeps their password.
   (`nova-data.sql` contains emails and password hashes. It's git-ignored; don't share it.)

### Optional settings (Worker → Settings → Variables and Secrets)

| Name | Type | What it does |
|---|---|---|
| `SECRET_KEY` | secret | Signs login cookies. Without it a random key is made once and kept in D1. |
| `OWNER_SETUP_CODE` | secret | The /setup code. Without it one is generated and printed to the logs. |
| `RESEND_API_KEY` | secret | Turns on email (Resend's free tier: 3,000/month). Without it emails are only logged. |
| `MAIL_FROM` | variable | Sender, e.g. `Nova <nova@yourdomain.com>` (a domain you verified in Resend). |
| `SITE_URL` | variable | The site's public address, used for links in emails. Defaults to the address in use. |

Workers can't send email over SMTP, so email goes through [Resend](https://resend.com)'s HTTP API.

### Notes on the free plan

- Everything used here (Workers, D1, KV, SQLite-backed Durable Objects, static assets) is on the
  free plan.
- Passwords from the old Flask site are checked once with a slow (600,000-round) hash, then saved
  in the Workers format right after that login. That one login takes ~0.3s of CPU. On the free plan
  (10ms CPU per request) it can fail. If an old account can't log in, have a staff member use
  **Reset password** in Admin → People (or upgrade to Workers Paid, $5/month).

## Running it on your computer

```bash
npm install
cp .dev.vars.example .dev.vars   # then edit it
npm run dev                      # http://localhost:8787
```

`npm run dev` uses a local D1/KV in `.wrangler/` and creates the tables automatically.
To load the old data locally, use /setup with the code from `.dev.vars`, or:
`npx wrangler d1 execute nova --local --file scripts/nova-data.sql`.

## Owner & staff

- There is exactly one **owner**. Nobody can sign up as an admin.
- In **Admin → People → Role** the owner can give anyone any mix of:
  add/edit/import games · manage people · run polls · post announcements · see visitor stats ·
  manage Pro (payments, game requests, chat moderation). Settings and roles stay owner-only.
- The owner can preview the site as any role from the account menu ("View site as").

## What the admin panel does

- **People**: Allow, Ignore, Ban (with reason), send back to pending, delete, reset password,
  mute in chat, and (owner) roles. Forgot-password requests show up at the top.
- **Games**: add by link (an embed URL, or a raw `.html` file on GitHub/jsDelivr) or by uploading a
  single-file `.html` game; edit; remove; filter; bulk remove. **Bulk import** takes JSON, a JS
  array or CSV, or many `.html` files at once. New games can be Pro early-access for a few days.
- **Polls**: create polls with options; add or remove options later; close/reopen. Players vote;
  only staff add options.
- **Announce**: post to everyone's Updates tab (or a Pro-only sneak peek), optionally emailed.
- **Pro**: confirm Cash App payments, give Pro, answer game requests.
- **Visitors**: unique visitors per day, most active people, most played games.
- **Settings** (owner): site name, who can join, Pro price, Cash App, movies doc link.

## Games

Most games are raw HTML files on GitHub/jsDelivr. The player downloads the file and runs it in a
frame. `public/static/game-sanitize.js` first strips the game's own ads and trackers and applies
loader fixes. `tools/gametest/` is a headless-Chrome harness that checks every game (see its README).

The emulator is [EmulatorJS](https://github.com/EmulatorJS/EmulatorJS), self-hosted in
`public/emulator/` (all cores are in the repo; nothing loads from a CDN). See `tools/emulator/README.md`.

## Pro chat

`/chat` is a real-time chat for Pro members, staff and the owner. Messages are stored in D1, so
history survives. People can delete their own messages; staff with the Pro permission can delete
anyone's and mute people (Admin → People → More). Sends are rate-limited.

## Tests

- `node tools/e2e/smoke.mjs http://localhost:8787 EMAIL PASSWORD ./shots` logs in, opens every
  page at desktop and phone sizes, takes screenshots and reports errors.
- `node tools/e2e/chat.mjs` runs a two-person chat test.

(Install once with `cd tools/e2e && npm install`. They use your installed Google Chrome.)
