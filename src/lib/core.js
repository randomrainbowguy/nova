// Roles, permissions, settings and the database queries several pages share.

import { now, daysAgo, today } from "./util.js";

// What the owner can hand out. Settings and staff management stay owner-only.
export const PERMS = {
  games: "Add, edit & import games",
  people: "Manage people (approve, ignore, ban)",
  polls: "Run polls",
  announce: "Post announcements",
  stats: "See visitor stats",
  pro: "Manage Pro members, game requests & chat",
};

// Themes only Pro members (and staff) can pick. Keep in sync with style.css and app.js.
export const PRO_THEMES = { aurora: "Aurora", sunset: "Sunset", gold: "Midnight Gold" };

// Ready-made roles the owner can hand out (or tick permissions one by one for "Custom").
export const ROLES = {
  player: ["Player", []],
  games: ["Game manager", ["games"]],
  people: ["People manager", ["people"]],
  both: ["Game & people manager", ["games", "people"]],
  full: ["Full admin", Object.keys(PERMS)],
};

export function roleKey(perms) {
  const set = new Set(perms);
  for (const [k, [, p]] of Object.entries(ROLES)) {
    if (p.length === set.size && p.every((x) => set.has(x))) return k;
  }
  return "custom";
}

export const DEFAULT_SETTINGS = {
  access_mode: "approval", // approval | open | closed
  site_name: "Nova",
  cashtag: "",             // Cash App $cashtag Pro payments go to
  pro_price: "5",          // one-time, in dollars
  monthly_cost: "15",      // hosting cost, shown on the Pro page
  early_days: "3",         // how long new games stay Pro-only by default
  movies_doc: "",          // link to the movies doc, shown on the Movies tab
};

export const PRO_SQL = "(premium = 1 OR role = 'owner' OR perms != '')"; // who counts as Pro (members + staff)
export const MAX_OPEN_REQUESTS = 3;
export const MAX_LOGIN_FAILS = 5;
export const LOCKOUT_MINUTES = 10;
export const POPULAR_DAYS = 14;

/** A user row plus is_owner / perms (a Set) / is_staff / is_pro. */
export function withRoles(row) {
  if (!row) return null;
  const u = { ...row };
  u.is_owner = u.role === "owner";
  u.perms = u.is_owner ? new Set(Object.keys(PERMS))
    : new Set(String(u.perms || "").split(",").filter((p) => p in PERMS));
  u.is_staff = u.perms.size > 0;
  u.role_key = u.is_owner ? "owner" : roleKey([...u.perms]);
  u.role_label = u.is_owner ? "Owner" : (ROLES[u.role_key] || ["Custom staff"])[0];
  u.is_premium = !!u.premium;
  u.is_pro = u.is_premium || u.is_staff;
  return u;
}

/** Same as Flask's current_user(): the owner previewing a role gets exactly that role. */
export function applyPreview(u, viewAs) {
  if (!u) return u;
  u.real_owner = u.is_owner;
  if (u.is_owner && viewAs in ROLES) {
    u.is_owner = false;
    u.perms = new Set(ROLES[viewAs][1]);
    u.viewing_as = viewAs;
    u.role_key = viewAs;
    u.role_label = ROLES[viewAs][0];
    u.is_staff = u.perms.size > 0;
    u.is_pro = u.is_premium || u.is_staff;
  }
  return u;
}

export async function loadSettings(db) {
  const { results } = await db.prepare("SELECT key, value FROM settings").all();
  const s = { ...DEFAULT_SETTINGS };
  for (const r of results) s[r.key] = r.value;
  return s;
}

export function setSettingStmt(db, key, value) {
  return db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(key, String(value));
}

/** SQL condition for which updates this person can see (Pro-only ones need Pro). */
export const notesFilter = (user) => (user && user.is_pro ? "1" : "audience = 'all'");

export const isEarly = (game) => !!game.early_until && game.early_until > now();

/** Games, most popular first: plays in the last POPULAR_DAYS days, then all-time plays. */
export async function gameRows(db, includeEarly = true) {
  const since = daysAgo(POPULAR_DAYS - 1);
  const { results } = await db.prepare(
    "SELECT g.*, COALESCE(p.recent, 0) AS recent FROM games g " +
    "LEFT JOIN (SELECT game_id, SUM(n) AS recent FROM game_plays WHERE day >= ? GROUP BY game_id) p ON p.game_id = g.id " +
    "WHERE ? OR g.early_until = '' OR g.early_until <= ? " +
    "ORDER BY recent DESC, plays DESC, name COLLATE NOCASE").bind(since, includeEarly ? 1 : 0, now()).all();
  return results.map((r) => ({
    ...r,
    genreList: String(r.genres || "").split(",").map((x) => x.trim()).filter(Boolean),
    early: isEarly(r),
  }));
}

export async function pollDetails(db, poll, userId) {
  const [{ results: options }, mine] = await Promise.all([
    db.prepare(
      "SELECT o.id, o.label, u.name AS suggested_by, " +
      "(SELECT COUNT(*) FROM votes v WHERE v.option_id = o.id) AS votes " +
      "FROM poll_options o LEFT JOIN users u ON u.id = o.suggested_by WHERE o.poll_id = ? ORDER BY o.id").bind(poll.id).all(),
    db.prepare("SELECT option_id FROM votes WHERE poll_id = ? AND user_id = ?").bind(poll.id, userId).first(),
  ]);
  const total = options.reduce((s, o) => s + o.votes, 0);
  return { poll, options, total, my_vote: mine ? mine.option_id : null };
}

export async function proNumbers(db, settings) {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM users WHERE premium = 1").first();
  const members = row.n;
  const price = parseFloat(settings.pro_price) || 0;
  const monthly = parseFloat(settings.monthly_cost) || 0;
  const raised = members * price;
  return { members, price, raised, monthly, months: monthly ? raised / monthly : 0 };
}

/** Payment claims waiting for a look, plus open game requests. */
export async function proTodoCount(db) {
  const r = await db.prepare(
    "SELECT (SELECT COUNT(*) FROM users WHERE pro_claim != '' AND premium = 0) + " +
    "(SELECT COUNT(*) FROM game_requests WHERE status = 'open') AS n").first();
  return r.n;
}

export function barChart(series, width = 720, height = 180) {
  const top = Math.max(1, ...series.map((p) => p.count));
  let step = 1;
  for (const s of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000]) {
    if (top / s <= 4) { step = s; break; }
  }
  const yMax = step * Math.ceil(top / step);
  const padL = 34, padB = 22, padT = 8;
  const plotW = width - padL, plotH = height - padB - padT;
  const slot = plotW / series.length;
  const barW = Math.max(slot - 2, 1);
  const f = (n) => n.toFixed(1);
  const bars = series.map((p, i) => {
    const x = padL + i * slot + 1;
    const h = (plotH * p.count) / yMax;
    const y = padT + plotH - h;
    const r = Math.min(4, h, barW / 2);
    const path = h <= 0 ? "" :
      `M${f(x)},${f(padT + plotH)} V${f(y + r)} Q${f(x)},${f(y)} ${f(x + r)},${f(y)} ` +
      `H${f(x + barW - r)} Q${f(x + barW)},${f(y)} ${f(x + barW)},${f(y + r)} V${f(padT + plotH)} Z`;
    return { path, x, w: barW, hit_y: padT, hit_h: plotH, label: p.label, count: p.count,
      tick: (series.length - 1 - i) % 7 === 0 };
  });
  const grid = [];
  for (let v = 0; v <= yMax; v += step) grid.push({ y: padT + plotH - (plotH * v) / yMax, v });
  return { bars, grid, width, height, pad_l: padL };
}

export async function visitorStats(db, days = 30) {
  const since = (n) => daysAgo(n - 1);
  const one = async (sql, ...a) => Object.values(await db.prepare(sql).bind(...a).first())[0];
  const uniq = "SELECT COUNT(DISTINCT visitor) AS n FROM visits WHERE day >= ?";
  const { results: perDay } = await db.prepare(
    "SELECT day, COUNT(*) AS n FROM visits WHERE day >= ? GROUP BY day").bind(since(days)).all();
  const counts = Object.fromEntries(perDay.map((r) => [r.day, r.n]));
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const day = d.toISOString().slice(0, 10);
    series.push({ day, label: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      count: counts[day] || 0 });
  }
  const [t, w, m, all, mem, guests, views, top, active] = await Promise.all([
    one(uniq, today()), one(uniq, since(7)), one(uniq, since(30)),
    one("SELECT COUNT(DISTINCT visitor) AS n FROM visits"),
    one(uniq + " AND visitor LIKE 'u%'", since(30)),
    one(uniq + " AND visitor LIKE 'v%'", since(30)),
    one("SELECT COALESCE(SUM(views), 0) AS n FROM visits WHERE day >= ?", since(30)),
    db.prepare("SELECT name, plays FROM games WHERE plays > 0 ORDER BY plays DESC LIMIT 8").all(),
    db.prepare(
      "SELECT u.name, u.email, COUNT(*) AS days, SUM(v.views) AS views, MAX(v.day) AS last " +
      "FROM visits v JOIN users u ON u.id = v.user_id WHERE v.day >= ? " +
      "GROUP BY u.id ORDER BY days DESC, views DESC LIMIT 8").bind(since(30)).all(),
  ]);
  return { today: t, week: w, month: m, all, members_month: mem, guests_month: guests, views_month: views,
    chart: barChart(series), series, top_games: top.results, active: active.results };
}
