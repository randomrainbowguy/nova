// Nova on Cloudflare Workers: a game hub with accounts, an admin panel, polls, updates and Pro chat.
// Data lives in D1 (SQLite), uploaded HTML games in KV, live chat in a Durable Object,
// and static files (CSS, JS, EmulatorJS) are served from ./public.

import { Hono } from "hono";
import { html } from "hono/html";
import {
  PERMS, ROLES, MAX_OPEN_REQUESTS, MAX_LOGIN_FAILS, LOCKOUT_MINUTES, roleKey, withRoles, applyPreview,
  loadSettings, setSettingStmt, notesFilter, isEarly, gameRows, pollDetails, proNumbers, proTodoCount, visitorStats,
} from "./lib/core.js";
import { loadSession, sessionCookie, readCookie, unsign } from "./lib/session.js";
import { hashPassword, checkPassword, tempPassword } from "./lib/passwords.js";
import { notify, emailManagers, sendEmail, siteUrl, emailConfigured } from "./lib/email.js";
import { parseGameList, cleanGenres } from "./lib/importer.js";
import { ensureSchema, storedSecret } from "./lib/schema.js";
import { now, today, daysAgo, addDays, cleanName, EMAIL_RE, randomHex, safeNext, isHttpUrl, safeLink, plural } from "./lib/util.js";
import { layout } from "./views/layout.js";
import * as pages from "./views/pages.js";
import { proPage, proScripts } from "./views/pro.js";
import { adminPage } from "./views/admin.js";
import { chatPage } from "./views/chat.js";
import { badgeFor } from "./chat.js";

export { ChatRoom } from "./chat.js";

const app = new Hono();

const BOT_RE = /bot|crawl|spider|slurp|curl|wget|python-requests|headless/i;
const UNTRACKED = ["/g/", "/api/", "/favicon", "/chat/ws", "/chat/history"];

/* ── per-request setup: session, user, CSRF, visitor counting ── */

app.use("*", async (c, next) => {
  const db = c.env.DB;
  await ensureSchema(db);
  // A SECRET_KEY secret is optional: without one, a random key is made once and kept in D1.
  const secret = c.env.SECRET_KEY || await storedSecret(db, "secret_key", () => randomHex(32));
  c.set("secret", secret);
  const session = await loadSession(c.req.raw, secret);
  if (!session.get("csrf")) session.set("csrf", randomHex(16));
  c.set("session", session);
  c.set("settings", await loadSettings(db));

  const uid = session.get("uid");
  let user = null;
  if (uid) {
    user = applyPreview(withRoles(await db.prepare("SELECT * FROM users WHERE id = ?").bind(uid).first()), session.get("view_as"));
    if (!user) session.del("uid");
  }
  c.set("user", user);

  if (c.req.method === "POST") {
    const type = c.req.header("Content-Type") || "";
    let form = {};
    if (type.includes("form")) form = await c.req.parseBody({ all: true });
    c.set("form", form);
    const sent = first(form.csrf) || c.req.header("X-CSRF-Token");
    if (!sent || sent !== session.get("csrf")) c.set("csrfFailed", true);
  }

  const path = new URL(c.req.url).pathname;
  let newGuest = null;
  if (c.req.method === "GET" && !UNTRACKED.some((p) => path.startsWith(p)) && !BOT_RE.test(c.req.header("User-Agent") || "")) {
    const guest = readCookie(c.req.header("Cookie"), "nv");
    let visitor;
    const stmts = [];
    if (user) {
      visitor = `u${user.id}`;
      if (guest && session.get("merged_nv") !== guest) {
        // Same person as the guest who just signed up / logged in: fold those visits in.
        stmts.push(db.prepare(
          "INSERT INTO visits (day, visitor, user_id, views) SELECT day, ?, ?, views FROM visits WHERE visitor = ? AND true " +
          "ON CONFLICT(day, visitor) DO UPDATE SET views = views + excluded.views").bind(visitor, user.id, "v" + guest));
        stmts.push(db.prepare("DELETE FROM visits WHERE visitor = ?").bind("v" + guest));
        session.set("merged_nv", guest);
      }
    } else {
      newGuest = guest || randomHex(8);
      visitor = "v" + newGuest;
    }
    stmts.push(db.prepare("INSERT INTO visits (day, visitor, user_id) VALUES (?, ?, ?) ON CONFLICT(day, visitor) DO UPDATE SET views = views + 1")
      .bind(today(), visitor, user ? user.id : null));
    c.executionCtx.waitUntil(db.batch(stmts).catch((e) => console.log("visit error", e)));
    if (guest) newGuest = null;
  }

  if (c.get("csrfFailed")) {
    c.res = await render(c, pages.messagePage("Page expired", "Your session changed since this page loaded. Go back, reload the page and try again."),
      { title: "Page expired", status: 400, bare: true });
  } else {
    await next();
  }

  if (c.res.status === 101) return; // WebSocket upgrade
  const secure = new URL(c.req.url).protocol === "https:";
  const cookies = [];
  if (newGuest) cookies.push(`nv=${newGuest}; Path=/; Max-Age=${400 * 86400}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`);
  if (session.dirty) cookies.push(await sessionCookie(session, secret, secure));
  if (cookies.length) {
    try {
      cookies.forEach((v) => c.res.headers.append("Set-Cookie", v));
    } catch {
      // Responses from the static assets binding have read-only headers.
      const res = new Response(c.res.body, c.res);
      cookies.forEach((v) => res.headers.append("Set-Cookie", v));
      c.res = res;
    }
  }
});

/* ── helpers ── */

function first(v) {
  return Array.isArray(v) ? v[0] : v;
}
const field = (c, k) => {
  const v = first((c.get("form") || {})[k]);
  return typeof v === "string" ? v : "";
};
const fieldAll = (c, k) => {
  const v = (c.get("form") || {})[k];
  return v == null ? [] : Array.isArray(v) ? v : [v];
};
const fieldInt = (c, k) => {
  const n = parseInt(field(c, k), 10);
  return Number.isFinite(n) ? n : null;
};
const flash = (c, msg, cat = "ok") => c.get("session").flash(msg, cat);

/** Gathers what every page's shell needs (badges, pop-ups, flashes), then renders. */
async function render(c, body, opts = {}) {
  const db = c.env.DB;
  const me = c.get("user");
  const settings = c.get("settings");
  const g = { me, site_name: settings.site_name, page: opts.page, unread_count: 0, pending_count: 0, popups: [], popup_more: 0,
    flashes: c.get("session").takeFlashes() };
  if (me && (me.status === "approved" || me.is_owner) && !opts.bare) {
    const audience = notesFilter(me);
    const can = (p) => me.status === "approved" && me.perms.has(p);
    const queries = [db.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE id > ? AND ${audience}`).bind(me.last_notif_seen).first()];
    queries.push(can("people") ? db.prepare("SELECT COUNT(*) AS n FROM users WHERE status = 'pending' OR reset_at != ''").first() : null);
    queries.push(can("pro") ? proTodoCount(db) : 0);
    const showPopups = me.status === "approved" && !["play", "notifications", "pro", "chat"].includes(opts.page);
    queries.push(showPopups ? db.prepare(
      `SELECT * FROM notifications WHERE id > ? AND created_at >= ? AND ${audience} ORDER BY id DESC LIMIT 20`)
      .bind(me.last_popup_seen, daysAgo(7, true)).all() : null);
    const [unread, pending, proTodo, fresh] = await Promise.all(queries);
    g.unread_count = unread.n;
    g.pending_count = (pending ? pending.n : 0) + (proTodo || 0);
    if (fresh && fresh.results.length) {
      g.popups = fresh.results.slice(0, 3);
      g.popup_more = Math.max(fresh.results.length - 3, 0);
      // each update pops up once
      c.executionCtx.waitUntil(db.prepare("UPDATE users SET last_popup_seen = ? WHERE id = ?").bind(fresh.results[0].id, me.id).run());
    }
  }
  const page = layout(c, g, body, opts);
  return c.html(page, opts.status || 200);
}

/** Only approved users (and the owner) get through. */
function loginRequired(handler) {
  return async (c) => {
    const user = c.get("user");
    const path = new URL(c.req.url).pathname;
    if (!user) return c.redirect(`/login?next=${encodeURIComponent(path)}`);
    if (user.status !== "approved" && !user.is_owner) return c.redirect("/waiting");
    if (user.must_change_pw && path !== "/account") return c.redirect("/account");
    c.executionCtx.waitUntil(c.env.DB.prepare("UPDATE users SET last_seen = ? WHERE id = ?").bind(now(), user.id).run());
    return handler(c);
  };
}

const can = (c, perm) => {
  const u = c.get("user");
  return !!(u && u.status === "approved" && u.perms.has(perm));
};

/** perm undefined: any staff. 'owner': the owner only. Otherwise that permission. */
function staffRequired(perm, handler) {
  return async (c) => {
    const user = c.get("user");
    if (!user) return c.redirect(`/login?next=${encodeURIComponent(new URL(c.req.url).pathname)}`);
    const allowed = perm === "owner" ? user.is_owner : perm === undefined ? user.is_staff && user.status === "approved" : can(c, perm);
    if (!allowed) return render(c, pages.messagePage("Not allowed", "That page is for admins."), { title: "Not allowed", status: 403 });
    return handler(c);
  };
}

const ownerExists = async (db) => !!(await db.prepare("SELECT 1 FROM users WHERE role = 'owner'").first());

async function accountError(db, name, email, password, minLen = 6) {
  if (!name) return "Enter your name.";
  if (!EMAIL_RE.test(email)) return "Enter a valid email address.";
  if (password.length < minLen) return `Password must be at least ${minLen} characters.`;
  if (await db.prepare("SELECT 1 FROM users WHERE lower(email) = lower(?)").bind(email).first()) {
    return "There's already an account with that email. Try logging in.";
  }
  return null;
}

/** Accounts still have a unique internal username; build one from the email. */
async function makeUsername(db, email) {
  let base = email.split("@")[0].toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 18) || "user";
  if (base.length < 3) base = base + "123".slice(0, 3 - base.length);
  let candidate = base;
  for (let n = 2; await db.prepare("SELECT 1 FROM users WHERE username = ?").bind(candidate).first(); n++) candidate = `${base}${n}`;
  return candidate;
}

function startSession(c, userId) {
  const s = c.get("session");
  s.clear();
  s.set("uid", userId);
  s.set("csrf", randomHex(16)); // new login, new token
}

/* ── landing / games ── */

app.get("/", async (c) => {
  // Logged-out visitors get the math practice front page; everyone else gets the games.
  if (!c.get("user")) return c.env.ASSETS.fetch(new Request(new URL("/landing.html", c.req.url)));
  return loginRequired(gamesHome)(c);
});

async function releaseEarlyGames(c) {
  const { results } = await c.env.DB.prepare("SELECT * FROM games WHERE announce_on_release = 1 AND early_until <= ?").bind(now()).all();
  for (const game of results) {
    await c.env.DB.prepare("UPDATE games SET announce_on_release = 0, early_until = '' WHERE id = ?").bind(game.id).run();
    await notify(c, { title: `New game: ${game.name}`, body: game.description || "", link: `/play/${game.id}`, kind: "game" });
  }
}

async function gamesHome(c) {
  const db = c.env.DB;
  await releaseEarlyGames(c);
  const me = c.get("user");
  const [games, favRows, latestPoll] = await Promise.all([
    gameRows(db, me.is_pro),
    db.prepare("SELECT game_id FROM favorites WHERE user_id = ?").bind(me.id).all(),
    db.prepare("SELECT * FROM polls WHERE is_open = 1 ORDER BY id DESC LIMIT 1").first(),
  ]);
  const weekAgo = daysAgo(7, true);
  const withArt = games.filter((g) => g.image);
  const body = pages.indexPage(c, me, {
    games, favs: new Set(favRows.results.map((r) => r.game_id)),
    genres: [...new Set(games.flatMap((g) => g.genreList))].sort((a, b) => a.localeCompare(b)),
    latest_poll: latestPoll, featured: withArt[0] || null, trending: withArt.slice(1, 9),
    new_count: games.filter((g) => g.created_at >= weekAgo).length, early_count: games.filter((g) => g.early).length,
  });
  return render(c, body, { page: "index" });
}

app.get("/demo", (c) => c.redirect("/"));

const RAW_HOSTS = ["raw.githubusercontent.com", "gist.githubusercontent.com", "cdn.jsdelivr.net"];
const GITHUB_BLOB = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+?)(?:\?.*)?$/;

/** Raw HTML files on GitHub/jsDelivr are served as plain text, so they can't just go in an iframe.
 *  Returns the URL to download and run in the browser, or null for a normal web page. */
function rawFileUrl(url) {
  const m = GITHUB_BLOB.exec(url || "");
  if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`;
  const host = String(url || "").replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
  return RAW_HOSTS.includes(host) ? url : null;
}

app.get("/play/:id{[0-9]+}", loginRequired(async (c) => {
  const db = c.env.DB;
  const id = Number(c.req.param("id"));
  const game = await db.prepare("SELECT * FROM games WHERE id = ?").bind(id).first();
  if (!game) return notFound(c);
  if (isEarly(game) && !c.get("user").is_pro) {
    flash(c, `${game.name} is in Pro early access right now. Everyone gets it soon, or get Pro to play it today.`, "error");
    return c.redirect("/pro");
  }
  c.executionCtx.waitUntil(db.batch([
    db.prepare("UPDATE games SET plays = plays + 1 WHERE id = ?").bind(id),
    db.prepare("INSERT INTO game_plays (game_id, day) VALUES (?, ?) ON CONFLICT(game_id, day) DO UPDATE SET n = n + 1").bind(id, today()),
  ]));
  let src = game.url, mode = "frame";
  if (game.file) src = `/g/${encodeURIComponent(game.file)}`;
  else if (rawFileUrl(game.url)) { src = rawFileUrl(game.url); mode = "raw"; }
  return render(c, pages.playPage(c, game, src, mode), { title: game.name, page: "play", scripts: pages.playScripts });
}));

app.get("/g/:file", loginRequired(async (c) => {
  if (!c.env.GAME_FILES) return notFound(c);
  const body = await c.env.GAME_FILES.get(c.req.param("file"), "stream");
  if (!body) return notFound(c);
  // Uploaded games run as their own sandboxed origin, so a game's scripts can't act as whoever is logged in.
  return new Response(body, { headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, max-age=300",
    "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-popups allow-pointer-lock allow-modals allow-orientation-lock allow-presentation allow-downloads",
  } });
}));

app.post("/api/favorite/:id{[0-9]+}", loginRequired(async (c) => {
  const db = c.env.DB;
  const uid = c.get("user").id, gid = Number(c.req.param("id"));
  const exists = await db.prepare("SELECT 1 FROM favorites WHERE user_id = ? AND game_id = ?").bind(uid, gid).first();
  if (exists) await db.prepare("DELETE FROM favorites WHERE user_id = ? AND game_id = ?").bind(uid, gid).run();
  else await db.prepare("INSERT OR IGNORE INTO favorites (user_id, game_id) SELECT ?, id FROM games WHERE id = ?").bind(uid, gid).run();
  return c.json({ favorite: !exists });
}));

/* ── accounts ── */

app.get("/signup", async (c) => {
  if (!(await ownerExists(c.env.DB))) return c.redirect("/setup");
  const s = c.get("settings");
  return render(c, pages.signupPage(c, s.site_name, s.access_mode, {}), { title: "Sign up", bare: true });
});

app.post("/signup", async (c) => {
  const db = c.env.DB;
  if (!(await ownerExists(db))) return c.redirect("/setup");
  const s = c.get("settings");
  const mode = s.access_mode;
  const name = cleanName(field(c, "name"));
  const email = field(c, "email").trim();
  const password = field(c, "password");
  const reason = field(c, "reason").trim().slice(0, 300);
  const error = mode === "closed" ? "Sign-ups are closed right now." : await accountError(db, name, email, password);
  if (error) {
    flash(c, error, "error");
    return render(c, pages.signupPage(c, s.site_name, mode, { name, email, reason }), { title: "Sign up", bare: true });
  }
  const status = mode === "open" ? "approved" : "pending";
  const res = await db.prepare(
    "INSERT INTO users (username, name, email, password_hash, status, reason, created_at, last_popup_seen) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(id), 0) FROM notifications))")
    .bind(await makeUsername(db, email), name, email, await hashPassword(password), status, reason, now()).run();
  startSession(c, res.meta.last_row_id);
  if (status === "pending") {
    await emailManagers(c, `New access request: ${name}`,
      `${name} (${email}) wants access.\n\nReason: ${reason || "(none)"}\n\nReview it: ${siteUrl(c)}/admin`);
    return c.redirect("/waiting");
  }
  return c.redirect("/");
});

/** The code needed to create the owner account (or import the old site) on a fresh site: the
 *  OWNER_SETUP_CODE secret, or one made up once and printed to the Worker logs. */
async function setupCode(c) {
  if (c.env.OWNER_SETUP_CODE) return c.env.OWNER_SETUP_CODE;
  const code = await storedSecret(c.env.DB, "setup_code", () => randomHex(4));
  console.log(`No owner yet. Setup code: ${code}`);
  return code;
}

const setupView = (c, form) => render(c, pages.setupPage(c, c.get("settings").site_name, form, !!c.env.OWNER_SETUP_CODE),
  { title: "Set up", bare: true });

app.get("/setup", async (c) => {
  if (await ownerExists(c.env.DB)) return notFound(c);
  await setupCode(c);
  return setupView(c, {});
});

app.post("/setup", async (c) => {
  const db = c.env.DB;
  if (await ownerExists(db)) return notFound(c);
  const code = field(c, "code").trim();
  if (!timingSafeEqualStr(code, await setupCode(c))) {
    flash(c, "Wrong setup code.", "error");
    return setupView(c, { name: field(c, "name"), email: field(c, "email") });
  }
  if (field(c, "action") === "import") return importOldSite(c);
  const name = cleanName(field(c, "name")), email = field(c, "email").trim(), password = field(c, "password");
  const error = await accountError(db, name, email, password, 8);
  if (error) {
    flash(c, error, "error");
    return setupView(c, { name, email, code });
  }
  const res = await db.prepare("INSERT INTO users (username, name, email, password_hash, status, role, created_at) VALUES (?, ?, ?, ?, 'approved', 'owner', ?)")
    .bind(await makeUsername(db, email), name, email, await hashPassword(password), now()).run();
  startSession(c, res.meta.last_row_id);
  flash(c, "You're the owner. Welcome!");
  return c.redirect("/admin");
});

const IMPORT_TABLES = "settings|users|games|polls|poll_options|votes|favorites|notifications|game_plays|visits|game_requests";
const IMPORT_LINE = new RegExp(`^(PRAGMA defer_foreign_keys = true|DELETE FROM (${IMPORT_TABLES})( WHERE .*)?|` +
  `(INSERT|INSERT OR REPLACE) INTO (${IMPORT_TABLES}) \\(.*|UPDATE games SET .*);$`);

/** Loads nova-data.sql (made by scripts/export-to-d1.py from the old Flask site's nova.db). */
async function importOldSite(c) {
  const db = c.env.DB;
  const file = first(c.get("form").data_file);
  if (!file || typeof file === "string" || !file.name) {
    flash(c, "Pick the nova-data.sql file first.", "error");
    return setupView(c, {});
  }
  const lines = (await file.text()).split(/\r?\n/).filter((l) => l.trim());
  const bad = lines.findIndex((l) => !IMPORT_LINE.test(l));
  if (!lines.length || bad !== -1) {
    flash(c, bad === -1 ? "That file is empty." : `That doesn't look like a nova-data.sql file (line ${bad + 1}).`, "error");
    return setupView(c, {});
  }
  // One batch = one transaction, so a failed import leaves nothing half-done and can be retried.
  const stmts = lines.map((l) => db.prepare(l.replace(/;$/, "")));
  try {
    await db.batch(stmts);
  } catch (e) {
    console.log("import failed", e);
    flash(c, `The import stopped partway: ${e.message}`, "error");
    return setupView(c, {});
  }
  const counts = await db.prepare("SELECT (SELECT COUNT(*) FROM users) AS u, (SELECT COUNT(*) FROM games) AS g").first();
  flash(c, `Imported ${counts.u} ${plural(counts.u, "account")} and ${counts.g} ${plural(counts.g, "game")}. Log in with your old email and password.`);
  return c.redirect("/login");
}

function timingSafeEqualStr(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

app.get("/login", async (c) => {
  if (!(await ownerExists(c.env.DB))) return c.redirect("/setup");
  if (c.get("user")) return c.redirect("/");
  return render(c, pages.loginPage(c, c.get("settings").site_name, ""), { title: "Log in", bare: true });
});

app.post("/login", async (c) => {
  const db = c.env.DB;
  if (!(await ownerExists(db))) return c.redirect("/setup");
  const loginId = field(c, "email").trim();
  const password = field(c, "password");
  const site = c.get("settings").site_name;
  const again = (msg) => {
    flash(c, msg, "error");
    return render(c, pages.loginPage(c, site, loginId), { title: "Log in", bare: true });
  };
  const user = await db.prepare("SELECT * FROM users WHERE lower(email) = lower(?) OR username = ? ORDER BY id LIMIT 1").bind(loginId, loginId).first();
  if (user && user.locked_until > now()) {
    const minutes = Math.max(1, Math.ceil((Date.parse(user.locked_until.replace(" ", "T") + "Z") - Date.now()) / 60000));
    return again(`Too many wrong passwords. Try again in ${minutes} ${plural(minutes, "minute")}.`);
  }
  const check = user ? await checkPassword(user.password_hash, password) : { ok: false };
  if (!check.ok) {
    if (user) {
      const fails = user.failed_logins + 1;
      if (fails >= MAX_LOGIN_FAILS) {
        await db.prepare("UPDATE users SET failed_logins = 0, locked_until = ? WHERE id = ?").bind(addDays(LOCKOUT_MINUTES / 1440), user.id).run();
      } else {
        await db.prepare("UPDATE users SET failed_logins = ? WHERE id = ?").bind(fails, user.id).run();
      }
    }
    return again("Wrong email or password.");
  }
  const stmts = [db.prepare("UPDATE users SET failed_logins = 0, locked_until = '' WHERE id = ?").bind(user.id)];
  if (check.rehash) stmts.push(db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(password), user.id));
  await db.batch(stmts);
  startSession(c, user.id);
  if (user.must_change_pw) {
    flash(c, "You logged in with a temporary password. Pick a new one now.");
    return c.redirect("/account");
  }
  return c.redirect(safeNext(c.req.query("next")));
});

app.post("/logout", (c) => {
  const s = c.get("session");
  s.clear();
  s.del("uid");
  return c.redirect("/");
});

app.get("/forgot", (c) => render(c, pages.forgotPage(c), { title: "Forgot password", bare: true }));

app.post("/forgot", async (c) => {
  // No email needed: the request shows up in Admin, and staff hand over a temporary password.
  const db = c.env.DB;
  const email = field(c, "email").trim();
  const note = field(c, "note").replace(/\s+/g, " ").trim().slice(0, 200);
  const user = await db.prepare("SELECT * FROM users WHERE lower(email) = lower(?) AND status != 'banned'").bind(email).first();
  if (user) {
    await db.prepare("UPDATE users SET reset_note = ?, reset_at = ? WHERE id = ?").bind(note || "(no note)", now(), user.id).run();
    await emailManagers(c, `Password reset request: ${user.name}`,
      `${user.name} (${user.email}) forgot their password.\n\nNote: ${note || "(none)"}\n\nReset it: ${siteUrl(c)}/admin?tab=users`);
  }
  // Same message either way, so this page can't be used to check who has an account.
  return render(c, pages.messagePage("Request sent", "If that email has an account, the admin will see your request. " +
    "They'll give you a temporary password. Ask them in person or by message."), { title: "Request sent", bare: true });
});

app.get("/waiting", (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/login");
  if (user.status === "approved" || user.is_owner) return c.redirect("/");
  return render(c, pages.waitingPage(c, user), { bare: true });
});

app.get("/account", loginRequired((c) => render(c, pages.accountPage(c, c.get("user")), { title: "Account", page: "account" })));

app.post("/account", loginRequired(async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  const action = field(c, "action");
  if (action === "email_prefs") {
    const optIn = field(c, "email_opt_in") ? 1 : 0;
    const email = field(c, "email").trim();
    const name = cleanName(field(c, "name"));
    if (!name) flash(c, "Enter your name.", "error");
    else if (!EMAIL_RE.test(email)) flash(c, "Enter a valid email address.", "error");
    else if (await db.prepare("SELECT 1 FROM users WHERE lower(email) = lower(?) AND id != ?").bind(email, user.id).first()) {
      flash(c, "Another account already uses that email.", "error");
    } else {
      await db.prepare("UPDATE users SET email_opt_in = ?, email = ?, name = ? WHERE id = ?").bind(optIn, email, name, user.id).run();
      flash(c, "Saved.");
    }
  } else if (action === "password") {
    const check = await checkPassword(user.password_hash, field(c, "current"));
    if (!check.ok) flash(c, "Current password is wrong.", "error");
    else if (field(c, "new").length < 6) flash(c, "New password must be at least 6 characters.", "error");
    else {
      await db.prepare("UPDATE users SET password_hash = ?, must_change_pw = 0 WHERE id = ?").bind(await hashPassword(field(c, "new")), user.id).run();
      flash(c, "Password changed.");
      if (user.must_change_pw) return c.redirect("/");
    }
  }
  return c.redirect("/account");
}));

app.get("/unsubscribe/:token", async (c) => {
  const id = await unsign(c.get("secret") + ":unsubscribe", c.req.param("token"));
  if (!id) return notFound(c);
  await c.env.DB.prepare("UPDATE users SET email_opt_in = 0 WHERE id = ?").bind(Number(id)).run();
  return render(c, pages.messagePage("Unsubscribed", "You won't get any more emails. You can turn them back on in your account page."),
    { title: "Unsubscribed", bare: true });
});

/* ── polls (players vote; only staff add options) ── */

app.get("/polls", loginRequired(async (c) => {
  const db = c.env.DB;
  const uid = c.get("user").id;
  const { results } = await db.prepare("SELECT * FROM polls ORDER BY is_open DESC, id DESC").all();
  const polls = await Promise.all(results.map((p) => pollDetails(db, p, uid)));
  return render(c, pages.pollsPage(c, polls), { title: "Polls", page: "polls" });
}));

app.post("/polls/:id{[0-9]+}/vote", loginRequired(async (c) => {
  const db = c.env.DB;
  const pollId = Number(c.req.param("id"));
  const poll = await db.prepare("SELECT * FROM polls WHERE id = ?").bind(pollId).first();
  const optionId = fieldInt(c, "option");
  const valid = optionId && await db.prepare("SELECT 1 FROM poll_options WHERE id = ? AND poll_id = ?").bind(optionId, pollId).first();
  if (!poll || !poll.is_open || !valid) flash(c, "That poll is closed.", "error");
  else {
    await db.prepare("INSERT INTO votes (poll_id, user_id, option_id) VALUES (?, ?, ?) ON CONFLICT(poll_id, user_id) DO UPDATE SET option_id = excluded.option_id")
      .bind(pollId, c.get("user").id, optionId).run();
    flash(c, "Vote saved.");
  }
  return c.redirect(`/polls#poll-${pollId}`);
}));

/* ── movies, updates ── */

app.get("/movies", loginRequired((c) => render(c, pages.moviesPage(c, c.get("user"), c.get("settings").movies_doc), { title: "Movies", page: "movies" })));

app.get("/notifications", loginRequired(async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  const { results } = await db.prepare(`SELECT * FROM notifications WHERE ${notesFilter(user)} ORDER BY id DESC LIMIT 100`).all();
  const seen = user.last_notif_seen;
  if (results.length && results[0].id > seen) {
    c.executionCtx.waitUntil(db.prepare("UPDATE users SET last_notif_seen = ? WHERE id = ?").bind(results[0].id, user.id).run());
  }
  c.set("user", { ...user, last_notif_seen: results.length ? Math.max(results[0].id, seen) : seen }); // the badge clears now
  return render(c, pages.notificationsPage(c, results, seen, can(c, "announce")), { title: "Updates", page: "notifications" });
}));

/* ── Pro ── */

app.get("/pro", loginRequired(async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  const [reqs, peeks, all, nums, memberNo] = await Promise.all([
    db.prepare("SELECT * FROM game_requests WHERE user_id = ? ORDER BY id DESC").bind(user.id).all(),
    user.is_pro ? db.prepare("SELECT * FROM notifications WHERE audience = 'pro' ORDER BY id DESC LIMIT 5").all() : { results: [] },
    gameRows(db),
    proNumbers(db, c.get("settings")),
    user.is_premium ? db.prepare("SELECT COUNT(*) AS n FROM users WHERE premium = 1 AND premium_since <= ?").bind(user.premium_since).first() : null,
  ]);
  const early = all.filter((g) => g.early);
  const body = proPage(c, user, {
    my_requests: reqs.results, peeks: peeks.results, early_games: user.is_pro ? early : [], early_count: early.length,
    member_no: memberNo ? memberNo.n : null, nums, max_requests: MAX_OPEN_REQUESTS,
  });
  return render(c, body, { title: "Pro", page: "pro", scripts: proScripts });
}));

app.post("/pro/claim", loginRequired(async (c) => {
  // "I've paid": the owner (or a Pro manager) checks Cash App and confirms it.
  const user = c.get("user");
  if (user.is_premium) return c.redirect("/pro");
  const handle = field(c, "cashapp").trim().slice(0, 60);
  if (!handle) {
    flash(c, "Put the Cash App name you paid from, so we can find your payment.", "error");
    return c.redirect("/pro");
  }
  await c.env.DB.prepare("UPDATE users SET pro_claim = ?, pro_claim_at = ? WHERE id = ?").bind(handle, now(), user.id).run();
  await emailManagers(c, `${c.get("settings").site_name}: ${user.name} says they paid for Pro`,
    `${user.name} (${user.email}) says they sent the Pro payment from Cash App account: ${handle}\n\nCheck Cash App, then confirm it: ${siteUrl(c)}/admin?tab=pro`, "pro");
  flash(c, "Thanks! We'll check Cash App and turn on Pro for you soon.");
  return c.redirect("/pro");
}));

app.post("/pro/request", loginRequired(async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  if (!user.is_pro) return c.redirect("/pro");
  const name = field(c, "name").trim().slice(0, 80);
  if (!name) {
    flash(c, "Which game do you want?", "error");
    return c.redirect("/pro#requests");
  }
  const open = (await db.prepare("SELECT COUNT(*) AS n FROM game_requests WHERE user_id = ? AND status = 'open'").bind(user.id).first()).n;
  if (open >= MAX_OPEN_REQUESTS) {
    flash(c, `You have ${open} requests waiting already. Once one is answered you can ask for another.`, "error");
    return c.redirect("/pro#requests");
  }
  let link = field(c, "link").trim().slice(0, 300);
  if (!isHttpUrl(link)) link = "";
  await db.prepare("INSERT INTO game_requests (user_id, name, link, note, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(user.id, name, link, field(c, "note").trim().slice(0, 300), now()).run();
  flash(c, `Requested ${name}. You'll see the answer here.`);
  return c.redirect("/pro#requests");
}));

/* ── Pro chat ── */

const CHAT_PAGE = 50;
const chatSelect = "SELECT m.id, m.user_id, m.body, m.created_at, u.name, u.role, u.perms, u.premium FROM chat_messages m " +
  "LEFT JOIN users u ON u.id = m.user_id WHERE m.deleted = 0";
const chatRow = (r) => {
  const u = withRoles({ role: r.role || "", perms: r.perms || "", premium: r.premium || 0 });
  return { id: r.id, user_id: r.user_id, name: r.name || "Deleted user", badge: r.name ? badgeFor(u) : "", body: r.body, created_at: r.created_at };
};

function proRequired(handler) {
  return loginRequired(async (c) => {
    if (!c.get("user").is_pro) {
      if (new URL(c.req.url).pathname === "/chat") {
        flash(c, "Pro chat is for Pro members. Get Pro to join in!", "error");
        return c.redirect("/pro");
      }
      return c.json({ error: "Pro only" }, 403);
    }
    return handler(c);
  });
}

app.get("/chat", proRequired(async (c) => {
  const { results } = await c.env.DB.prepare(`${chatSelect} ORDER BY m.id DESC LIMIT ${CHAT_PAGE}`).all();
  const me = c.get("user");
  return render(c, chatPage(c, me, results.reverse().map(chatRow), me.perms.has("pro")), { title: "Pro chat", page: "chat", bodyClass: "is-chat" });
}));

app.get("/chat/history", proRequired(async (c) => {
  const before = parseInt(c.req.query("before") || "0", 10);
  const after = parseInt(c.req.query("after") || "0", 10);
  let rows;
  if (after > 0) {
    rows = (await c.env.DB.prepare(`${chatSelect} AND m.id > ? ORDER BY m.id LIMIT 200`).bind(after).all()).results;
    // ...and which of the messages the page already shows were deleted while it was disconnected.
    const since = parseInt(c.req.query("since") || "0", 10);
    const { results: gone } = await c.env.DB.prepare("SELECT id FROM chat_messages WHERE deleted = 1 AND id >= ? AND id <= ?")
      .bind(since || after, after).all();
    return c.json({ messages: rows.map(chatRow), deleted: gone.map((r) => r.id) });
  } else {
    rows = (await c.env.DB.prepare(`${chatSelect} AND m.id < ? ORDER BY m.id DESC LIMIT ${CHAT_PAGE}`).bind(before || 2 ** 31).all()).results.reverse();
  }
  return c.json({ messages: rows.map(chatRow) });
}));

app.get("/chat/ws", proRequired(async (c) => {
  if (c.req.header("Upgrade") !== "websocket") return c.text("Expected a WebSocket", 426);
  // Only our own pages may open a chat socket with the visitor's cookies.
  if (c.req.header("Origin") !== new URL(c.req.url).origin) return c.text("Forbidden", 403);
  const u = c.get("user");
  if (c.get("session").get("view_as")) return c.text("Exit the role preview to use chat.", 403);
  const stub = c.env.CHAT.get(c.env.CHAT.idFromName("pro"));
  const headers = new Headers(c.req.raw.headers);
  headers.set("X-Chat-User", JSON.stringify({ id: u.id, name: u.name, badge: badgeFor(u) }));
  return stub.fetch(new Request(c.req.url, { headers }));
}));

/** Closes someone's open chat connections right away (after a ban, delete or Pro removal). */
function kickFromChat(c, userId) {
  if (!c.env.CHAT) return;
  const stub = c.env.CHAT.get(c.env.CHAT.idFromName("pro"));
  c.executionCtx.waitUntil(stub.fetch("https://chat/kick", { headers: { "X-Chat-Kick": String(userId) } }).catch(() => {}));
}

/* ── owner: preview the site as another role ── */

app.post("/preview", loginRequired(async (c) => {
  if (!c.get("user").real_owner) return c.redirect("/");
  const role = field(c, "role");
  const s = c.get("session");
  if (!(role in ROLES)) {
    s.del("view_as");
    return c.redirect("/admin");
  }
  s.set("view_as", role);
  return c.redirect(role === "player" ? "/" : "/admin");
}));

app.post("/preview/exit", loginRequired((c) => {
  c.get("session").del("view_as");
  return c.redirect("/admin");
}));

/* ── admin ── */

const ADMIN_TABS = [
  ["users", "People", "people"], ["games", "Games", "games"], ["import", "Bulk import", "games"], ["polls", "Polls", "polls"],
  ["announce", "Announce", "announce"], ["pro", "Pro", "pro"], ["stats", "Visitors", "stats"], ["settings", "Settings", "owner"],
];
const IMPORT_REPORT_TTL = 600;

app.get("/admin", staffRequired(undefined, async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const tabs = ADMIN_TABS.filter(([, , perm]) => me.perms.has(perm) || (perm === "owner" && me.is_owner)).map(([k, l]) => [k, l]);
  let tab = c.req.query("tab") || tabs[0][0];
  if (!tabs.some(([k]) => k === tab)) tab = tabs[0][0];
  const [userRows, counts, todo] = await Promise.all([
    db.prepare("SELECT * FROM users ORDER BY role = 'owner' DESC, perms != '' DESC, " +
      "CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'ignored' THEN 2 ELSE 3 END, created_at DESC").all(),
    db.prepare("SELECT (SELECT COUNT(*) FROM games) AS games, (SELECT COALESCE(SUM(plays), 0) FROM games) AS plays, " +
      "(SELECT COUNT(*) FROM users WHERE status = 'approved' AND email_opt_in = 1) AS subscribers").first(),
    can(c, "pro") ? proTodoCount(db) : 0,
  ]);
  const users = userRows.results.map(withRoles);
  const d = {
    tab, tabs, users, access_mode: c.get("settings").access_mode, now_utc: now(), pro_todo: todo,
    early_days: c.get("settings").early_days, cashtag: c.get("settings").cashtag, subscribers: counts.subscribers,
    email_ok: emailConfigured(c.env),
    stats: { users: users.filter((u) => u.status === "approved").length, pending: users.filter((u) => u.status === "pending").length,
      games: counts.games, plays: counts.plays },
  };
  if (tab === "games" || tab === "import") d.games = await gameRows(db);
  if (tab === "games" && c.req.query("edit")) d.edit_game = await db.prepare("SELECT * FROM games WHERE id = ?").bind(Number(c.req.query("edit"))).first();
  if (tab === "polls") {
    const { results } = await db.prepare("SELECT * FROM polls ORDER BY id DESC").all();
    d.polls = await Promise.all(results.map((p) => pollDetails(db, p, me.id)));
  }
  if (tab === "stats") d.visitors = await visitorStats(db);
  if (tab === "pro") {
    const [claims, members, others, requests, nums] = await Promise.all([
      db.prepare("SELECT * FROM users WHERE pro_claim != '' AND premium = 0 ORDER BY pro_claim_at").all(),
      db.prepare("SELECT * FROM users WHERE premium = 1 ORDER BY premium_since DESC").all(),
      db.prepare("SELECT id, name, email FROM users WHERE premium = 0 AND status = 'approved' AND role != 'owner' ORDER BY name COLLATE NOCASE").all(),
      db.prepare("SELECT r.*, u.name AS who FROM game_requests r JOIN users u ON u.id = r.user_id ORDER BY r.status = 'open' DESC, r.id DESC LIMIT 200").all(),
      proNumbers(db, c.get("settings")),
    ]);
    d.pro = { claims: claims.results, members: members.results, others: others.results, requests: requests.results, nums };
  }
  if (tab === "import" && c.env.GAME_FILES) {
    const key = `import-report:${me.id}`;
    const rep = await c.env.GAME_FILES.get(key, "json");
    if (rep) { d.import_report = rep; c.executionCtx.waitUntil(c.env.GAME_FILES.delete(key)); }
  }
  return render(c, adminPage(c, me, d), { title: "Admin", page: "admin" });
}));

app.post("/admin/user/:id{[0-9]+}", staffRequired(undefined, async (c) => {
  const db = c.env.DB;
  const userId = Number(c.req.param("id"));
  const action = field(c, "action");
  const target = withRoles(await db.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first());
  if (!target) return notFound(c);
  const me = c.get("user");
  // Muting in chat is also allowed for Pro managers; everything else needs "people".
  const isMute = action === "mute" || action === "unmute";
  if (!can(c, "people") && !(isMute && can(c, "pro"))) {
    return render(c, pages.messagePage("Not allowed", "That page is for admins."), { title: "Not allowed", status: 403 });
  }
  const back = c.redirect(can(c, "people") ? "/admin?tab=users" : "/admin?tab=pro");
  if (target.id === me.id) { flash(c, "You can't change your own account here.", "error"); return back; }
  if (target.is_owner || (target.is_staff && !me.is_owner)) { flash(c, "Only the owner can change staff accounts.", "error"); return back; }
  if (action === "set_perms") {
    if (!me.is_owner) return back;
    const role = field(c, "role");
    const perms = role in ROLES ? [...ROLES[role][1]] : fieldAll(c, "perms").filter((p) => p in PERMS);
    const joined = perms.join(",");
    await db.prepare("UPDATE users SET perms = ?, status = CASE WHEN ? != '' THEN 'approved' ELSE status END WHERE id = ?").bind(joined, joined, userId).run();
    if (!perms.length && !target.premium) kickFromChat(c, userId);
    flash(c, `${target.name} is now: ${(ROLES[roleKey(perms)] || ["custom staff"])[0]}.`);
    return back;
  }
  const s = c.get("settings");
  if (action === "approve") {
    await db.prepare("UPDATE users SET status = 'approved', ban_reason = '' WHERE id = ?").bind(userId).run();
    await sendEmail(c, [{ email: target.email, id: null }], `You're in! ${s.site_name} access approved`,
      `Hi ${target.name}, your access was approved. Log in: ${siteUrl(c)}/login`);
    flash(c, `Approved ${target.name}.`);
  } else if (action === "ignore") {
    await db.prepare("UPDATE users SET status = 'ignored' WHERE id = ?").bind(userId).run();
    kickFromChat(c, userId);
    flash(c, `Ignored ${target.name}. They stay locked out but aren't banned.`);
  } else if (action === "pending") {
    await db.prepare("UPDATE users SET status = 'pending' WHERE id = ?").bind(userId).run();
    kickFromChat(c, userId);
    flash(c, `Moved ${target.name} back to pending.`);
  } else if (action === "ban") {
    await db.prepare("UPDATE users SET status = 'banned', ban_reason = ? WHERE id = ?").bind(field(c, "reason").trim().slice(0, 200), userId).run();
    kickFromChat(c, userId);
    flash(c, `Banned ${target.name}.`);
  } else if (action === "mute" || action === "unmute") {
    await db.prepare("UPDATE users SET chat_muted = ? WHERE id = ?").bind(action === "mute" ? 1 : 0, userId).run();
    flash(c, action === "mute" ? `Muted ${target.name} in Pro chat.` : `${target.name} can chat again.`);
  } else if (action === "reset_pw") {
    const temp = tempPassword();
    await db.prepare("UPDATE users SET password_hash = ?, must_change_pw = 1, reset_note = '', reset_at = '', failed_logins = 0, locked_until = '' WHERE id = ?")
      .bind(await hashPassword(temp), userId).run();
    flash(c, `${target.name}'s temporary password is: ${temp}  Give it to them now, it won't be shown again. They'll pick a new one when they log in.`);
  } else if (action === "dismiss_reset") {
    await db.prepare("UPDATE users SET reset_note = '', reset_at = '' WHERE id = ?").bind(userId).run();
    flash(c, `Dismissed ${target.name}'s reset request.`);
  } else if (action === "delete") {
    await db.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
    kickFromChat(c, userId);
    flash(c, `Deleted ${target.name}'s account.`);
  }
  return back;
}));

app.post("/admin/pro", staffRequired("pro", async (c) => {
  const db = c.env.DB;
  const action = field(c, "action");
  const back = c.redirect("/admin?tab=pro");
  if (action === "request") {
    const status = field(c, "status");
    if (["open", "added", "declined"].includes(status)) {
      await db.prepare("UPDATE game_requests SET status = ?, reply = ? WHERE id = ?").bind(status, field(c, "reply").trim().slice(0, 300), fieldInt(c, "request_id")).run();
      flash(c, "Request updated.");
    }
    return back;
  }
  const target = await db.prepare("SELECT * FROM users WHERE id = ?").bind(fieldInt(c, "user_id")).first();
  if (!target) { flash(c, "Pick a person first.", "error"); return back; }
  const s = c.get("settings");
  if (action === "confirm" || action === "grant") {
    const note = field(c, "note").trim().slice(0, 120) || (target.pro_claim ? `Cash App: ${target.pro_claim}` : "");
    await db.prepare("UPDATE users SET premium = 1, premium_since = ?, premium_note = ?, pro_claim = '', " +
      "status = CASE WHEN status = 'pending' THEN 'approved' ELSE status END WHERE id = ?").bind(now(), note, target.id).run();
    await sendEmail(c, [{ email: target.email, id: null }], `You're Pro on ${s.site_name}!`,
      `Hi ${target.name}, Pro is turned on for your account. Thanks for supporting the site!\n\n${siteUrl(c)}/pro`);
    flash(c, `${target.name} is Pro now.`);
  } else if (action === "reject") {
    await db.prepare("UPDATE users SET pro_claim = '' WHERE id = ?").bind(target.id).run();
    flash(c, `Cleared ${target.name}'s payment claim. They can send a new one from the Pro page.`);
  } else if (action === "revoke") {
    await db.prepare("UPDATE users SET premium = 0, premium_since = '' WHERE id = ?").bind(target.id).run();
    kickFromChat(c, target.id);
    flash(c, `Removed Pro from ${target.name}.`);
  }
  return back;
}));

app.post("/admin/settings", staffRequired("owner", async (c) => {
  const db = c.env.DB;
  const stmts = [];
  const mode = field(c, "access_mode");
  if (["approval", "open", "closed"].includes(mode)) stmts.push(setSettingStmt(db, "access_mode", mode));
  const name = field(c, "site_name").trim();
  if (name) stmts.push(setSettingStmt(db, "site_name", name.slice(0, 40)));
  const form = c.get("form");
  if ("cashtag" in form) {
    stmts.push(setSettingStmt(db, "cashtag", field(c, "cashtag").trim().replace(/^\$/, "").slice(0, 40)));
    for (const key of ["pro_price", "monthly_cost", "early_days"]) {
      const v = field(c, key).trim();
      if (/^\d{1,4}(\.\d{1,2})?$/.test(v)) stmts.push(setSettingStmt(db, key, v));
    }
  }
  let ok = true;
  if ("movies_doc" in form) {
    const link = field(c, "movies_doc").trim();
    if (link && !isHttpUrl(link)) { flash(c, "The movies doc link needs to start with http:// or https://", "error"); ok = false; }
    else stmts.push(setSettingStmt(db, "movies_doc", link.slice(0, 500)));
  }
  if (stmts.length) await db.batch(stmts);
  if (ok) flash(c, "Settings saved.");
  return c.redirect("/admin?tab=settings");
}));

app.post("/admin/test-email", staffRequired("owner", async (c) => {
  const me = c.get("user");
  await sendEmail(c, [{ email: me.email, id: null }], `${c.get("settings").site_name} test email`, "If you're reading this, email notifications work.");
  flash(c, `Test email sent to ${me.email} (check the Worker logs if it doesn't arrive).`);
  return c.redirect("/admin?tab=settings");
}));

/** Stores an uploaded .html game in KV. Returns its key, or null if it isn't an HTML file. */
async function saveUpload(c, file) {
  if (!file || typeof file === "string" || !file.name) return undefined;
  const m = /\.(html?)$/i.exec(file.name);
  if (!m) return null;
  if (!c.env.GAME_FILES) throw new Error("GAME_FILES KV namespace isn't set up");
  const base = file.name.slice(0, -m[0].length).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "game";
  const key = `${base}-${randomHex(3)}.${m[1].toLowerCase()}`;
  await c.env.GAME_FILES.put(key, await file.arrayBuffer());
  return key;
}

async function removeGameFile(c, key) {
  if (key && c.env.GAME_FILES) await c.env.GAME_FILES.delete(key);
}

app.post("/admin/game", staffRequired("games", async (c) => {
  const db = c.env.DB;
  const gameId = fieldInt(c, "id");
  const name = field(c, "name").trim();
  const url = field(c, "url").trim();
  const back = c.redirect("/admin?tab=games");
  if (!name) { flash(c, "Games need a name.", "error"); return back; }
  if (url && !isHttpUrl(url) && !(url.startsWith("/") && !url.startsWith("//"))) { flash(c, "Game link must start with https://", "error"); return back; }
  const filename = await saveUpload(c, first(c.get("form").file));
  if (filename === null) { flash(c, "Only .html / .htm files can be uploaded.", "error"); return back; }

  const genres = cleanGenres(field(c, "genres"));
  const description = field(c, "description").trim();
  const image = safeLink(field(c, "image"));
  const earlyDays = field(c, "early") ? fieldInt(c, "early_days") || 0 : 0;
  let earlyUntil = earlyDays > 0 ? addDays(Math.min(earlyDays, 60)) : "";
  if (gameId) {
    const old = await db.prepare("SELECT * FROM games WHERE id = ?").bind(gameId).first();
    if (!old) return notFound(c);
    const newFile = filename || (url ? "" : old.file);
    if (old.file && old.file !== newFile) await removeGameFile(c, old.file);
    if (isEarly(old) && field(c, "early")) earlyUntil = old.early_until; // still ticked: keep the current window
    await db.prepare("UPDATE games SET name=?, description=?, genres=?, image=?, url=?, file=?, early_until=? WHERE id=?")
      .bind(name, description, genres, image, filename ? "" : url, newFile, earlyUntil, gameId).run();
    flash(c, `Updated ${name}.`);
    return back;
  }
  if (!url && !filename) { flash(c, "Add a link or upload an HTML file.", "error"); return back; }
  const taken = url && !filename && await db.prepare("SELECT name FROM games WHERE url = ?").bind(url).first();
  if (taken) { flash(c, `That link is already on the site as "${taken.name}".`, "error"); return back; }
  const announce = !!field(c, "announce");
  const res = await db.prepare("INSERT INTO games (name, description, genres, image, url, file, created_at, early_until, announce_on_release) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(name, description, genres, image, filename ? "" : url, filename || "", now(), earlyUntil,
    announce && earlyUntil ? 1 : 0).run();
  const id = res.meta.last_row_id;
  if (earlyUntil) {
    flash(c, `Added ${name}. Pro members get it for ${earlyDays} ${plural(earlyDays, "day")} before everyone else.`);
    if (announce) await notify(c, { title: `Early access: ${name}`, body: description || "Pro gets it first.", link: `/play/${id}`, kind: "game", audience: "pro" });
  } else {
    flash(c, `Added ${name}.`);
    if (announce) await notify(c, { title: `New game: ${name}`, body: description, link: `/play/${id}`, kind: "game" });
  }
  return back;
}));

app.post("/admin/game/:id{[0-9]+}/delete", staffRequired("games", async (c) => {
  const db = c.env.DB;
  const game = await db.prepare("SELECT * FROM games WHERE id = ?").bind(Number(c.req.param("id"))).first();
  if (game) {
    await removeGameFile(c, game.file);
    await db.prepare("DELETE FROM games WHERE id = ?").bind(game.id).run();
    flash(c, `Removed ${game.name}.`);
  }
  return c.redirect("/admin?tab=games");
}));

app.post("/admin/games/bulk-delete", staffRequired("games", async (c) => {
  const db = c.env.DB;
  const ids = fieldAll(c, "ids").filter((x) => /^\d+$/.test(x)).map(Number);
  for (const id of ids) {
    const game = await db.prepare("SELECT file FROM games WHERE id = ?").bind(id).first();
    if (game) await removeGameFile(c, game.file);
  }
  if (ids.length) await db.batch(ids.map((id) => db.prepare("DELETE FROM games WHERE id = ?").bind(id)));
  flash(c, `Removed ${ids.length} ${plural(ids.length, "game")}.`);
  return c.redirect("/admin?tab=games");
}));

app.post("/admin/games/import", staffRequired("games", async (c) => {
  const db = c.env.DB;
  const back = c.redirect("/admin?tab=import");
  const onDuplicate = field(c, "on_duplicate") || "skip";
  let text = field(c, "list");
  const listFile = first(c.get("form").list_file);
  if (listFile && typeof listFile !== "string" && listFile.name) text = await listFile.text();

  const added = [], updated = [], skipped = [], errors = [];
  const { results: all } = await db.prepare("SELECT * FROM games").all();
  const existing = new Map(all.map((r) => [r.name.toLowerCase(), r]));
  const linkOwner = new Map(all.filter((r) => r.url).map((r) => [r.url, r.name]));
  const stmts = [];

  let items;
  try { items = text.trim() ? parseGameList(text) : []; }
  catch (e) { flash(c, `Couldn't read that list: ${e.message}`, "error"); return back; }

  items.forEach((item, i) => {
    const name = String(item.name || item.title || "").trim();
    const url = String(item.url || item.link || "").trim();
    if (!name) return errors.push(`#${i + 1}: missing name`);
    if (!isHttpUrl(url) && !url.startsWith("/")) return errors.push(`${name}: link must start with https://`);
    const fields = [name, String(item.description || "").trim(), cleanGenres(item.genres || item.genre || item.tags),
      safeLink(String(item.image || item.cover || "")), url];
    const old = existing.get(name.toLowerCase());
    const sameLink = linkOwner.get(url);
    if (sameLink && sameLink.toLowerCase() !== name.toLowerCase()) skipped.push(`${name} (same link as ${sameLink})`);
    else if (old && (onDuplicate === "skip" || old.id == null)) skipped.push(name); // id null = earlier in this same list
    else if (old) {
      stmts.push(db.prepare("UPDATE games SET name=?, description=?, genres=?, image=?, url=?, file='' WHERE id=?").bind(...fields, old.id));
      if (old.file) c.executionCtx.waitUntil(removeGameFile(c, old.file));
      updated.push(name);
    } else {
      stmts.push(db.prepare("INSERT INTO games (name, description, genres, image, url, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(...fields, now()));
      existing.set(name.toLowerCase(), { id: null, file: "", name });
      linkOwner.set(url, name);
      added.push(name);
    }
  });

  // A batch of .html files: the file name becomes the game name.
  const defaultGenres = cleanGenres(field(c, "file_genres"));
  for (const file of fieldAll(c, "files")) {
    if (!file || typeof file === "string" || !file.name) continue;
    const base = file.name.replace(/^.*[\\/]/, "").replace(/\.[^.]*$/, "");
    const name = base.replace(/[-_]+/g, " ").trim().replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()) || "Game";
    const old = existing.get(name.toLowerCase());
    if (old && (onDuplicate === "skip" || old.id == null)) { skipped.push(name); continue; }
    const key = await saveUpload(c, file);
    if (!key) { errors.push(`${file.name}: only .html / .htm files`); continue; }
    if (old) {
      if (old.file) await removeGameFile(c, old.file);
      stmts.push(db.prepare("UPDATE games SET url='', file=? WHERE id=?").bind(key, old.id));
      updated.push(name);
    } else {
      stmts.push(db.prepare("INSERT INTO games (name, genres, file, created_at) VALUES (?, ?, ?, ?)").bind(name, defaultGenres, key, now()));
      existing.set(name.toLowerCase(), { id: null, file: key, name });
      added.push(name);
    }
  }
  if (stmts.length) await db.batch(stmts);

  if (!(added.length || updated.length || skipped.length || errors.length)) {
    flash(c, "Nothing to import. Paste a list or pick some files.", "error");
    return back;
  }
  let summary = `Imported: ${added.length} added, ${updated.length} updated, ${skipped.length} skipped`;
  if (errors.length) summary += `, ${errors.length} with problems`;
  flash(c, summary + ".", errors.length ? "error" : "ok");
  if (c.env.GAME_FILES) {
    await c.env.GAME_FILES.put(`import-report:${c.get("user").id}`, JSON.stringify({ added, updated, skipped, errors }), { expirationTtl: IMPORT_REPORT_TTL });
  }
  if (added.length && field(c, "announce")) {
    const shown = added.slice(0, 8).join(", ") + (added.length > 8 ? ` and ${added.length - 8} more` : "");
    await notify(c, { title: added.length === 1 ? `New game: ${added[0]}` : `${added.length} new games added`, body: shown, link: "/", kind: "game" });
  }
  return back;
}));

app.get("/admin/games/export", staffRequired("games", async (c) => {
  const games = (await gameRows(c.env.DB)).map((g) => ({ name: g.name, description: g.description, genres: g.genres,
    url: g.url || (g.file ? `/g/${g.file}` : ""), image: g.image }));
  return new Response(JSON.stringify(games, null, 2), { headers: {
    "Content-Type": "application/json", "Content-Disposition": `attachment; filename=nova-games-${today()}.json` } });
}));

app.post("/admin/poll", staffRequired("polls", async (c) => {
  const db = c.env.DB;
  const question = field(c, "question").trim();
  const options = [...new Set(field(c, "options").split(/\r?\n/).map((o) => o.trim().slice(0, 80)).filter(Boolean))];
  const back = c.redirect("/admin?tab=polls");
  if (!question) { flash(c, "Polls need a question.", "error"); return back; }
  if (options.length < 2) { flash(c, "Add at least two options, one per line.", "error"); return back; }
  const res = await db.prepare("INSERT INTO polls (question, allow_suggestions, created_at) VALUES (?, 0, ?)").bind(question, now()).run();
  const id = res.meta.last_row_id;
  await db.batch(options.map((label) => db.prepare("INSERT INTO poll_options (poll_id, label) VALUES (?, ?)").bind(id, label)));
  flash(c, "Poll created.");
  if (field(c, "announce")) await notify(c, { title: `New poll: ${question}`, body: "Vote on what gets added next.", link: `/polls#poll-${id}`, kind: "poll" });
  return back;
}));

app.post("/admin/poll/:id{[0-9]+}", staffRequired("polls", async (c) => {
  const db = c.env.DB;
  const pollId = Number(c.req.param("id"));
  const action = field(c, "action");
  if (action === "close") await db.prepare("UPDATE polls SET is_open = 0 WHERE id = ?").bind(pollId).run();
  else if (action === "open") await db.prepare("UPDATE polls SET is_open = 1 WHERE id = ?").bind(pollId).run();
  else if (action === "delete") await db.prepare("DELETE FROM polls WHERE id = ?").bind(pollId).run();
  else if (action === "remove_option") await db.prepare("DELETE FROM poll_options WHERE id = ? AND poll_id = ?").bind(fieldInt(c, "option_id"), pollId).run();
  else if (action === "add_option") {
    const label = field(c, "label").trim().slice(0, 80);
    if (label && !(await db.prepare("SELECT 1 FROM poll_options WHERE poll_id = ? AND label = ? COLLATE NOCASE").bind(pollId, label).first())) {
      await db.prepare("INSERT INTO poll_options (poll_id, label) SELECT id, ? FROM polls WHERE id = ?").bind(label, pollId).run();
    } else if (label) flash(c, "That's already an option.", "error");
  }
  return c.redirect("/admin?tab=polls");
}));

app.post("/admin/announce", staffRequired("announce", async (c) => {
  const title = field(c, "title").trim();
  if (!title) flash(c, "Announcements need a title.", "error");
  else {
    const peek = field(c, "audience") === "pro";
    const email = !!field(c, "email");
    await notify(c, { title, body: field(c, "body").trim(), link: safeLink(field(c, "link")), email,
      kind: peek ? "peek" : "announce", audience: peek ? "pro" : "all" });
    flash(c, (peek ? "Sneak peek posted for Pro" : "Announcement posted") + (email ? " and emailed." : "."));
  }
  return c.redirect("/admin?tab=announce");
}));

app.post("/admin/notification/:id{[0-9]+}/delete", staffRequired("announce", async (c) => {
  await c.env.DB.prepare("DELETE FROM notifications WHERE id = ?").bind(Number(c.req.param("id"))).run();
  return c.redirect("/notifications");
}));

/* ── errors ── */

function notFound(c) {
  return render(c, pages.messagePage("Not found", "Nothing here."), { title: "Not found", status: 404, bare: !c.get("user") });
}
app.notFound(notFound);
app.onError((err, c) => {
  console.log("error", err && err.stack ? err.stack : err);
  return c.html(`<!DOCTYPE html><meta charset="utf-8"><title>Something went wrong</title><body style="font-family:system-ui;background:#0b0d14;color:#eee;display:grid;place-items:center;min-height:100vh;margin:0"><div style="text-align:center"><h1>Something went wrong</h1><p>Try again in a moment.</p><p><a style="color:#a78bfa" href="/">Back home</a></p></div>`, 500);
});

export default app;
