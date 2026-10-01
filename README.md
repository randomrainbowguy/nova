# Nova

A game hub with accounts, an admin panel, polls, and email notifications.
Built with Flask + SQLite (one file database, `nova.db`).

## Run it locally

```bash
cd ~/claude/nova
.venv/bin/python app.py
```

Open http://localhost:5050.

## Owner & staff

- There is exactly one **owner** (you). Nobody can sign up as an admin.
- On a brand-new site, the owner account is created at `/setup`, which needs a **setup code**.
  The code is printed in the server log at startup, or you can set `OWNER_SETUP_CODE=...` in `.env`.
  `/setup` disappears once the owner exists.
- To move ownership to another account: `.venv/bin/python app.py make-owner USERNAME`
- In **Admin → People → Staff access** the owner can give anyone any mix of:
  add/edit/import games · manage people · run polls · post announcements · see visitor stats.
  Settings and staff access stay owner-only. People-managers can't touch staff or the owner.

## What the admin panel does

- **People** - Allow, Ignore, Ban (with reason), send back to pending, delete, and (owner) staff access.
  - *Ignore* keeps someone locked out on the "waiting for approval" screen without telling them.
  - *Ban* shows them they're banned.
- **Games** - add by link (embed URL) or by uploading a single-file `.html` game; edit; remove.
  Adding a game can announce it automatically.
- **Polls** - create polls, let people suggest options, close/reopen, remove options.
- **Announce** - post an update to everyone's Updates tab, optionally emailed.
- **Visitors** - unique visitors today / 7 days / 30 days / all time, a daily chart, most active people,
  most played games. One account or one browser = one visitor per day; bots are skipped.
- **Settings** (owner only) - site name, and who can join: approval (default) / open / closed.

You get an email whenever someone requests access (once email is set up).

## Passwords (no email needed)

- **Forgot password:** people click "Forgot password?" on the login page. The request shows up in
  **Admin → People** with a badge. Click **Reset password** to get a temporary password, give it to them,
  and they pick a new one when they log in. You can also reset anyone from their row in People.
- **You forgot yours (owner):** `.venv/bin/python app.py reset-password YOUR_EMAIL`
- **Wrong guesses:** after 5 wrong passwords in a row, that account's logins pause for 10 minutes.

## Email setup

Copy `.env.example` to `.env`, fill in SMTP details, restart. With Gmail you need an
**App password**, not your normal password. Without it, emails are printed to the terminal instead.
Every email has an unsubscribe link; users can also turn emails off on their Account page.

## Hosting on W3Spaces

W3Spaces only runs Python on its **paid Full-Stack plan** - the free plan is static files only
and can't run this. On a Full-Stack Python/Flask space:

1. Upload everything **except** `.venv/`, `nova.db`, `.secret_key`.
2. Install from `requirements.txt` and run `python app.py`. It listens on the `PORT` env var (default 5050).
3. Set `SITE_URL` to your space's address in `.env`.
4. Visit `/setup` with the setup code from the log (or `OWNER_SETUP_CODE`) to create your owner account.
   To keep your existing users and games, upload your `nova.db` too.

## Notes

- Uploaded games are served from your own site. Only upload files you trust -
  a game's JavaScript runs with the same access as the site itself.
- Back up `nova.db` - that's all your users, games, polls and votes.
