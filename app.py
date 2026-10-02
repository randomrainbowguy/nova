"""Nova - a game hub with accounts, an admin panel, polls and notifications."""

import os
import re
import secrets
import smtplib
import sqlite3
import sys
import threading
import uuid
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from functools import wraps

from flask import (
    Flask, abort, flash, g, jsonify, redirect, render_template, request,
    send_from_directory, session, url_for,
)
from itsdangerous import BadSignature, URLSafeSerializer
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("NOVA_DB", os.path.join(BASE_DIR, "nova.db"))
GAMES_DIR = os.path.join(BASE_DIR, "games")
# Hosts that won't take a .db upload: `app.py export-data` writes the database as text,
# and a site with no database yet rebuilds it from that file on start.
DATA_FILE = os.path.join(BASE_DIR, "nova-data.txt")
SECRET_FILE = os.path.join(BASE_DIR, ".secret_key")
ALLOWED_UPLOADS = {".html", ".htm"}


def load_env_file():
    """Read KEY=VALUE lines from .env so settings work without extra packages."""
    path = os.path.join(BASE_DIR, ".env")
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def load_secret_key():
    if os.environ.get("SECRET_KEY"):
        return os.environ["SECRET_KEY"]
    if not os.path.exists(SECRET_FILE):
        with open(SECRET_FILE, "w") as f:
            f.write(secrets.token_hex(32))
    with open(SECRET_FILE) as f:
        return f.read().strip()


load_env_file()
app = Flask(__name__)
app.config.update(
    SECRET_KEY=load_secret_key(),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    MAX_CONTENT_LENGTH=200 * 1024 * 1024,  # big single-file games
)
signer = URLSafeSerializer(app.config["SECRET_KEY"], salt="unsubscribe")

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,  -- internal id; people log in with email
    name TEXT NOT NULL DEFAULT '',                 -- shown everywhere
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | ignored | banned
    is_admin INTEGER NOT NULL DEFAULT 0,  -- legacy, replaced by role/perms
    role TEXT NOT NULL DEFAULT '',         -- 'owner' or ''
    perms TEXT NOT NULL DEFAULT '',        -- comma list of PERMS keys
    email_opt_in INTEGER NOT NULL DEFAULT 1,
    reason TEXT DEFAULT '',
    ban_reason TEXT DEFAULT '',
    last_notif_seen INTEGER NOT NULL DEFAULT 0,
    last_popup_seen INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    last_seen TEXT
);
CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    genres TEXT DEFAULT '',
    image TEXT DEFAULT '',
    url TEXT DEFAULT '',
    file TEXT DEFAULT '',
    plays INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS favorites (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, game_id)
);
CREATE TABLE IF NOT EXISTS polls (
    id INTEGER PRIMARY KEY,
    question TEXT NOT NULL,
    is_open INTEGER NOT NULL DEFAULT 1,
    allow_suggestions INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS poll_options (
    id INTEGER PRIMARY KEY,
    poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    suggested_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS votes (
    poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    option_id INTEGER NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
    PRIMARY KEY (poll_id, user_id)
);
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL DEFAULT 'announce',  -- game | poll | announce
    title TEXT NOT NULL,
    body TEXT DEFAULT '',
    link TEXT DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS game_plays (
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    n INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (game_id, day)
);
CREATE TABLE IF NOT EXISTS visits (
    day TEXT NOT NULL,                     -- YYYY-MM-DD (UTC)
    visitor TEXT NOT NULL,                 -- 'u<id>' for accounts, 'v<cookie>' for guests
    user_id INTEGER,
    views INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (day, visitor)
);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS game_requests (          -- Pro members asking for games
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    link TEXT DEFAULT '',
    note TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',  -- open | added | declined
    reply TEXT DEFAULT '',
    created_at TEXT NOT NULL
);
"""

# What the owner can hand out. Settings and staff management stay owner-only.
PERMS = {
    "games": "Add, edit & import games",
    "people": "Manage people (approve, ignore, ban)",
    "polls": "Run polls",
    "announce": "Post announcements",
    "stats": "See visitor stats",
    "pro": "Manage Pro members & game requests",
}

# Themes only Pro members (and staff) can pick. Keep in sync with style.css.
PRO_THEMES = {"aurora": "Aurora", "sunset": "Sunset", "gold": "Midnight Gold"}

# Ready-made roles the owner can hand out (or tick permissions one by one for "Custom").
ROLES = {
    "player": ("Player", ()),
    "games": ("Game manager", ("games",)),
    "people": ("People manager", ("people",)),
    "both": ("Game & people manager", ("games", "people")),
    "full": ("Full admin", tuple(PERMS)),
}


def role_key(perms):
    return next((k for k, (_, p) in ROLES.items() if set(p) == set(perms)), "custom")


DEFAULT_SETTINGS = {
    "access_mode": "approval",  # approval | open | closed
    "site_name": "Nova",
    "cashtag": "",         # Cash App $cashtag Pro payments go to
    "pro_price": "5",      # one-time, in dollars
    "monthly_cost": "15",  # hosting cost, shown on the Pro page
    "early_days": "3",     # how long new games stay Pro-only by default
    "movies_doc": "",      # link to the movies doc, shown on the Movies tab
}


# ── database ──────────────────────────────────────────────

def db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def restore_from_text():
    if os.path.exists(DB_PATH) or not os.path.exists(DATA_FILE):
        return
    with open(DATA_FILE, encoding="utf-8") as f:
        dump = f.read()
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(dump)
    except sqlite3.Error:
        conn.close()
        os.remove(DB_PATH)
        raise
    conn.close()
    os.replace(DATA_FILE, DATA_FILE.replace(".txt", ".restored.txt"))  # so it's only used once
    print(f"Restored the database from {os.path.basename(DATA_FILE)}.", flush=True)


def cli_export_data():
    conn = sqlite3.connect(DB_PATH)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        for line in conn.iterdump():
            f.write(line + "\n")
    conn.close()
    print(f"Wrote {DATA_FILE} - upload it next to app.py. It has everyone's emails and password hashes, keep it private.")


def init_db():
    restore_from_text()
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    cols = {r[1] for r in conn.execute("PRAGMA table_info(users)")}
    if "role" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT ''")
    if "perms" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN perms TEXT NOT NULL DEFAULT ''")
    if "name" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN name TEXT NOT NULL DEFAULT ''")
    conn.execute("UPDATE users SET name = username WHERE name = ''")
    if "last_popup_seen" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN last_popup_seen INTEGER NOT NULL DEFAULT 0")
        # don't pop up everything that happened before this feature existed
        conn.execute("UPDATE users SET last_popup_seen = (SELECT COALESCE(MAX(id), 0) FROM notifications)")
    for col, ddl in (("premium", "INTEGER NOT NULL DEFAULT 0"), ("premium_since", "TEXT NOT NULL DEFAULT ''"),
                     ("premium_note", "TEXT NOT NULL DEFAULT ''"), ("pro_claim", "TEXT NOT NULL DEFAULT ''"),
                     ("pro_claim_at", "TEXT NOT NULL DEFAULT ''"),
                     ("reset_note", "TEXT NOT NULL DEFAULT ''"),      # "forgot password" request, '' = none
                     ("reset_at", "TEXT NOT NULL DEFAULT ''"),
                     ("must_change_pw", "INTEGER NOT NULL DEFAULT 0"),  # logged in with a temporary password
                     ("failed_logins", "INTEGER NOT NULL DEFAULT 0"),
                     ("locked_until", "TEXT NOT NULL DEFAULT ''")):
        if col not in cols:
            conn.execute(f"ALTER TABLE users ADD COLUMN {col} {ddl}")
    game_cols = {r[1] for r in conn.execute("PRAGMA table_info(games)")}
    if "early_until" not in game_cols:  # Pro-only until this time (UTC), '' = public
        conn.execute("ALTER TABLE games ADD COLUMN early_until TEXT NOT NULL DEFAULT ''")
    if "announce_on_release" not in game_cols:  # post the public "New game" update when early access ends
        conn.execute("ALTER TABLE games ADD COLUMN announce_on_release INTEGER NOT NULL DEFAULT 0")
    if "audience" not in {r[1] for r in conn.execute("PRAGMA table_info(notifications)")}:
        conn.execute("ALTER TABLE notifications ADD COLUMN audience TEXT NOT NULL DEFAULT 'all'")  # all | pro
    if "kind" not in {r[1] for r in conn.execute("PRAGMA table_info(notifications)")}:
        conn.execute("ALTER TABLE notifications ADD COLUMN kind TEXT NOT NULL DEFAULT 'announce'")
        conn.execute("UPDATE notifications SET kind = 'game' WHERE title LIKE 'New game:%' OR title LIKE '% new games added'")
        conn.execute("UPDATE notifications SET kind = 'poll' WHERE title LIKE 'New poll:%'")
    # Older databases: the first admin becomes the owner, other admins keep full staff access.
    if not conn.execute("SELECT 1 FROM users WHERE role = 'owner'").fetchone():
        first = conn.execute("SELECT id FROM users WHERE is_admin = 1 ORDER BY id LIMIT 1").fetchone()
        if first:
            conn.execute("UPDATE users SET role = 'owner', status = 'approved' WHERE id = ?", first)
    conn.execute("UPDATE users SET perms = ?, is_admin = 0 WHERE is_admin = 1 AND role != 'owner'",
                 (",".join(PERMS),))
    for key, value in DEFAULT_SETTINGS.items():
        conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (key, value))
    # Seed the emulator the first time the site runs.
    if conn.execute("SELECT COUNT(*) FROM games").fetchone()[0] == 0 and os.path.exists(
        os.path.join(GAMES_DIR, "emulator.html")
    ):
        conn.execute(
            "INSERT INTO games (name, description, genres, file, created_at) VALUES (?, ?, ?, ?, ?)",
            ("EmulatorJS", "Play retro console games - load your own ROM.", "Retro, Emulator",
             "emulator.html", now()),
        )
    conn.commit()
    conn.close()


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def setting(key):
    row = db().execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else DEFAULT_SETTINGS.get(key, "")


def set_setting(key, value):
    db().execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )


# ── email ─────────────────────────────────────────────────

def smtp_configured():
    return bool(os.environ.get("SMTP_HOST") and os.environ.get("SMTP_USER"))


def _send_emails(messages):
    host = os.environ.get("SMTP_HOST")
    if not smtp_configured():
        for msg in messages:
            print(f"[email not sent - SMTP not configured] to={msg['To']} subject={msg['Subject']}")
        return
    port = int(os.environ.get("SMTP_PORT", "587"))
    try:
        with smtplib.SMTP(host, port, timeout=30) as server:
            server.starttls()
            server.login(os.environ["SMTP_USER"], os.environ.get("SMTP_PASS", ""))
            for msg in messages:
                server.send_message(msg)
        print(f"[email] sent {len(messages)} message(s)")
    except Exception as exc:  # never let email failures break the site
        print(f"[email error] {exc}")


def send_email(recipients, subject, body):
    """recipients: list of (email, user_id). Sends in the background."""
    sender = os.environ.get("MAIL_FROM") or os.environ.get("SMTP_USER") or "nova@localhost"
    base = os.environ.get("SITE_URL", request.host_url.rstrip("/") if request else "")
    messages = []
    for email, user_id in recipients:
        msg = EmailMessage()
        msg["From"] = sender
        msg["To"] = email
        msg["Subject"] = subject
        footer = ""
        if user_id is not None:
            token = signer.dumps(user_id)
            footer = f"\n\n--\nDon't want these emails? {base}/unsubscribe/{token}"
        msg.set_content(body + footer)
        messages.append(msg)
    if messages:
        threading.Thread(target=_send_emails, args=(messages,), daemon=True).start()


PRO_SQL = "(premium = 1 OR role = 'owner' OR perms != '')"  # who counts as Pro (members + staff)


def notify(title, body="", link="", email=True, kind="announce", audience="all"):
    """Post an in-site notification (also pops up for people) and email everyone who opted in.
    audience='pro' keeps it to Pro members and staff (early access / sneak peeks)."""
    db().execute(
        "INSERT INTO notifications (kind, title, body, link, created_at, audience) VALUES (?, ?, ?, ?, ?, ?)",
        (kind, title, body, link, now(), audience),
    )
    db().commit()
    if email:
        rows = db().execute(
            "SELECT id, email FROM users WHERE status = 'approved' AND email_opt_in = 1"
            + (f" AND {PRO_SQL}" if audience == "pro" else "")
        ).fetchall()
        base = os.environ.get("SITE_URL", request.host_url.rstrip("/"))
        text = body + (f"\n\n{base}{link}" if link else "")
        send_email([(r["email"], r["id"]) for r in rows], f"{setting('site_name')}: {title}", text)


def email_people_managers(subject, body, perm="people"):
    rows = [u for u in map(with_roles, db().execute(
        "SELECT * FROM users WHERE role = 'owner' OR perms != ''")) if perm in u["perms"]]
    send_email([(u["email"], None) for u in rows], subject, body)


# ── auth helpers ──────────────────────────────────────────

def hash_password(password):
    # pbkdf2 works on every Python build (scrypt is missing on macOS's system Python).
    return generate_password_hash(password, method="pbkdf2:sha256:600000")


def with_roles(row):
    """A user row as a dict, plus is_owner / perms (a set) / is_staff."""
    if row is None:
        return None
    u = dict(row)
    u["is_owner"] = u.get("role") == "owner"
    u["perms"] = set(PERMS) if u["is_owner"] else {p for p in (u.get("perms") or "").split(",") if p in PERMS}
    u["is_staff"] = bool(u["perms"])
    u["role_key"] = "owner" if u["is_owner"] else role_key(u["perms"])
    u["role_label"] = "Owner" if u["is_owner"] else ROLES.get(u["role_key"], ("Custom staff",))[0]
    u["is_premium"] = bool(u.get("premium"))            # actually paid (or was given Pro)
    u["is_pro"] = u["is_premium"] or u["is_staff"]       # gets the Pro perks
    return u


def current_user():
    """The logged-in user. While the owner is previewing another role ("view as"),
    they get exactly that role's access until they exit the preview."""
    if "user" not in g:
        uid = session.get("uid")
        row = db().execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone() if uid else None
        u = with_roles(row)
        if u:
            u["real_owner"] = u["is_owner"]
            view_as = session.get("view_as")
            if u["is_owner"] and view_as in ROLES:
                u.update(is_owner=False, perms=set(ROLES[view_as][1]), viewing_as=view_as,
                         role_key=view_as, role_label=ROLES[view_as][0])
                u["is_staff"] = bool(u["perms"])
                u["is_pro"] = u["is_premium"] or u["is_staff"]
        g.user = u
    return g.user


def can(perm):
    user = current_user()
    return bool(user and user["status"] == "approved" and perm in user["perms"])


def owner_exists():
    return db().execute("SELECT 1 FROM users WHERE role = 'owner'").fetchone() is not None


def csrf_token():
    if "csrf" not in session:
        session["csrf"] = secrets.token_hex(16)
    return session["csrf"]


@app.before_request
def check_csrf():
    if request.method == "POST":
        sent = request.form.get("csrf") or request.headers.get("X-CSRF-Token")
        if not sent or sent != session.get("csrf"):
            abort(400, "Bad or missing CSRF token - reload the page and try again.")


def login_required(view):
    """Only approved users (and admins) get through."""
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if not user:
            return redirect(url_for("login", next=request.path))
        if user["status"] != "approved" and not user["is_owner"]:
            return redirect(url_for("waiting"))
        if user["must_change_pw"] and request.endpoint != "account":
            return redirect(url_for("account"))
        db().execute("UPDATE users SET last_seen = ? WHERE id = ?", (now(), user["id"]))
        db().commit()
        return view(*args, **kwargs)
    return wrapped


def staff_required(perm=None):
    """perm=None: any staff member. perm='owner': the owner only. Otherwise that permission."""
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            user = current_user()
            if not user:
                return redirect(url_for("login", next=request.path))
            if perm == "owner":
                allowed = user["is_owner"]
            elif perm is None:
                allowed = user["is_staff"] and user["status"] == "approved"
            else:
                allowed = can(perm)
            if not allowed:
                abort(403)
            return view(*args, **kwargs)
        return wrapped
    return decorator


def asset_url(filename):
    """Static file URL with its modified time attached, so browsers pick up changes right away."""
    try:
        version = int(os.path.getmtime(os.path.join(app.static_folder, filename)))
    except OSError:
        version = 0
    return url_for("static", filename=filename, v=version)


@app.context_processor
def inject_globals():
    user = current_user()
    unread = 0
    audience = notes_filter(user)
    if user:
        unread = db().execute(
            f"SELECT COUNT(*) FROM notifications WHERE id > ? AND {audience}", (user["last_notif_seen"],)
        ).fetchone()[0]
    pending = 0
    if can("people"):
        pending = db().execute("SELECT COUNT(*) FROM users WHERE status = 'pending' OR reset_at != ''").fetchone()[0]
    if can("pro"):
        pending += pro_todo_count()
    popups, popup_more = [], 0
    if user and user["status"] == "approved" and request.endpoint not in ("play", "notifications", "pro", None):
        week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d %H:%M:%S")
        fresh = db().execute(
            f"SELECT * FROM notifications WHERE id > ? AND created_at >= ? AND {audience} ORDER BY id DESC",
            (user["last_popup_seen"], week_ago)).fetchall()
        popups, popup_more = fresh[:3], max(len(fresh) - 3, 0)
        if fresh:  # each update pops up once
            db().execute("UPDATE users SET last_popup_seen = ? WHERE id = ?", (fresh[0]["id"], user["id"]))
            db().commit()
    return {
        "popups": popups,
        "popup_more": popup_more,
        "me": user,
        "csrf_token": csrf_token,
        "unread_count": unread,
        "pending_count": pending,
        "site_name": setting("site_name"),
        "can": can,
        "PERMS": PERMS,
        "ROLES": ROLES,
        "PRO_THEMES": PRO_THEMES,
        "asset": asset_url,
    }


def notes_filter(user):
    """SQL condition for which updates this person can see (Pro-only ones need Pro)."""
    return "1" if user and user["is_pro"] else "audience = 'all'"


def pro_todo_count():
    """Payment claims waiting for a look, plus open game requests."""
    return db().execute(
        "SELECT (SELECT COUNT(*) FROM users WHERE pro_claim != '' AND premium = 0) + "
        "(SELECT COUNT(*) FROM game_requests WHERE status = 'open')").fetchone()[0]


# ── visitor counting ──────────────────────────────────────

BOT_RE = re.compile(r"bot|crawl|spider|slurp|curl|wget|python-requests|headless", re.I)
UNTRACKED = ("/static/", "/g/", "/api/", "/favicon")


@app.before_request
def count_visit():
    if request.method != "GET" or request.path.startswith(UNTRACKED):
        return
    if BOT_RE.search(request.headers.get("User-Agent", "")):
        return
    user = current_user()
    if user:
        visitor = f"u{user['id']}"
        guest = request.cookies.get("nv")
        if guest and session.get("merged_nv") != guest:
            # Same person as the guest who just signed up / logged in: fold those visits in.
            db().execute(
                "INSERT INTO visits (day, visitor, user_id, views) "
                "SELECT day, ?, ?, views FROM visits WHERE visitor = ? AND true "
                "ON CONFLICT(day, visitor) DO UPDATE SET views = views + excluded.views",
                (visitor, user["id"], "v" + guest))
            db().execute("DELETE FROM visits WHERE visitor = ?", ("v" + guest,))
            session["merged_nv"] = guest
    else:
        g.visitor_cookie = request.cookies.get("nv") or secrets.token_hex(8)
        visitor = "v" + g.visitor_cookie
    db().execute(
        "INSERT INTO visits (day, visitor, user_id) VALUES (?, ?, ?) "
        "ON CONFLICT(day, visitor) DO UPDATE SET views = views + 1",
        (datetime.now(timezone.utc).strftime("%Y-%m-%d"), visitor, user["id"] if user else None))
    db().commit()


@app.after_request
def set_visitor_cookie(response):
    cookie = g.get("visitor_cookie")
    if cookie and request.cookies.get("nv") != cookie:
        response.set_cookie("nv", cookie, max_age=400 * 86400, httponly=True, samesite="Lax")
    return response


def visitor_stats(days=30):
    today = datetime.now(timezone.utc).date()
    since = lambda n: (today - timedelta(days=n - 1)).isoformat()
    q = lambda sql, *a: db().execute(sql, a).fetchone()[0]
    uniq = "SELECT COUNT(DISTINCT visitor) FROM visits WHERE day >= ?"
    counts = dict(db().execute(
        "SELECT day, COUNT(*) FROM visits WHERE day >= ? GROUP BY day", (since(days),)).fetchall())
    series = []
    for i in range(days - 1, -1, -1):
        d = today - timedelta(days=i)
        series.append({"day": d.isoformat(), "label": d.strftime("%b %-d"), "count": counts.get(d.isoformat(), 0)})
    return {
        "today": q(uniq, today.isoformat()),
        "week": q(uniq, since(7)),
        "month": q(uniq, since(30)),
        "all": q("SELECT COUNT(DISTINCT visitor) FROM visits"),
        "members_month": q(uniq + " AND visitor LIKE 'u%'", since(30)),
        "guests_month": q(uniq + " AND visitor LIKE 'v%'", since(30)),
        "views_month": q("SELECT COALESCE(SUM(views), 0) FROM visits WHERE day >= ?", since(30)),
        "chart": bar_chart(series),
        "series": series,
        "top_games": db().execute("SELECT name, plays FROM games WHERE plays > 0 "
                                  "ORDER BY plays DESC LIMIT 8").fetchall(),
        "active": db().execute(
            "SELECT u.name, u.email, COUNT(*) AS days, SUM(v.views) AS views, MAX(v.day) AS last "
            "FROM visits v JOIN users u ON u.id = v.user_id WHERE v.day >= ? "
            "GROUP BY u.id ORDER BY days DESC, views DESC LIMIT 8", (since(30),)).fetchall(),
    }


def bar_chart(series, width=720, height=180):
    """Geometry for a simple daily bar chart (rounded tops, 2px gaps, nice y max)."""
    top = max([p["count"] for p in series] + [1])
    step = 1
    for s_ in (1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000):
        if top / s_ <= 4:
            step = s_
            break
    y_max = step * -(-top // step)
    pad_l, pad_b, pad_t = 34, 22, 8
    plot_w, plot_h = width - pad_l, height - pad_b - pad_t
    slot = plot_w / len(series)
    bar_w = max(slot - 2, 1)
    bars = []
    for i, p in enumerate(series):
        x = pad_l + i * slot + 1
        h = plot_h * p["count"] / y_max
        y = pad_t + plot_h - h
        r = min(4, h, bar_w / 2)
        path = "" if h <= 0 else (
            f"M{x:.1f},{pad_t + plot_h:.1f} V{y + r:.1f} Q{x:.1f},{y:.1f} {x + r:.1f},{y:.1f} "
            f"H{x + bar_w - r:.1f} Q{x + bar_w:.1f},{y:.1f} {x + bar_w:.1f},{y + r:.1f} V{pad_t + plot_h:.1f} Z")
        bars.append({"path": path, "x": x, "w": bar_w, "hit_y": pad_t, "hit_h": plot_h,
                     "label": p["label"], "count": p["count"], "tick": (len(series) - 1 - i) % 7 == 0})
    grid = [{"y": pad_t + plot_h - plot_h * v / y_max, "v": v} for v in range(0, y_max + 1, step)]
    return {"bars": bars, "grid": grid, "width": width, "height": height, "base": pad_t + plot_h,
            "pad_l": pad_l}


# ── account pages ─────────────────────────────────────────

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,24}$")


def clean_name(value):
    return re.sub(r"\s+", " ", value or "").strip()[:40]


def make_username(email):
    """Accounts still have a unique internal username; build one from the email."""
    base = re.sub(r"[^a-z0-9_.-]", "", email.split("@")[0].lower())[:18] or "user"
    base = base if len(base) >= 3 else base + "123"[:3 - len(base)]
    candidate, n = base, 1
    while db().execute("SELECT 1 FROM users WHERE username = ?", (candidate,)).fetchone():
        n += 1
        candidate = f"{base}{n}"
    return candidate


def account_error(name, email, password, min_len=6):
    if not name:
        return "Enter your name."
    if not EMAIL_RE.match(email):
        return "Enter a valid email address."
    if len(password) < min_len:
        return f"Password must be at least {min_len} characters."
    if db().execute("SELECT 1 FROM users WHERE lower(email) = lower(?)", (email,)).fetchone():
        return "There's already an account with that email - try logging in."
    return None
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@app.route("/signup", methods=["GET", "POST"])
def signup():
    if not owner_exists():
        return redirect(url_for("setup"))
    mode = setting("access_mode")
    if request.method == "POST":
        name = clean_name(request.form.get("name"))
        email = request.form.get("email", "").strip()
        password = request.form.get("password", "")
        reason = request.form.get("reason", "").strip()[:300]
        error = "Sign-ups are closed right now." if mode == "closed" else account_error(name, email, password)
        if error:
            flash(error, "error")
            return render_template("signup.html", mode=mode, form=request.form)

        status = "approved" if mode == "open" else "pending"
        cur = db().execute(
            "INSERT INTO users (username, name, email, password_hash, status, reason, created_at, "
            "last_popup_seen) VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(id), 0) FROM notifications))",
            (make_username(email), name, email, hash_password(password), status, reason, now()),
        )
        db().commit()
        session.clear()
        session["uid"] = cur.lastrowid
        if status == "pending":
            base = os.environ.get("SITE_URL", request.host_url.rstrip("/"))
            email_people_managers(
                f"New access request: {name}",
                f"{name} ({email}) wants access.\n\nReason: {reason or '(none)'}\n\n"
                f"Review it: {base}/admin",
            )
            return redirect(url_for("waiting"))
        return redirect(url_for("index"))
    return render_template("signup.html", mode=mode, form={})


def setup_code():
    """The code needed to create the owner account on a fresh site. Set OWNER_SETUP_CODE
    in .env, or use the one printed in the server log when the site starts."""
    if not os.environ.get("OWNER_SETUP_CODE"):
        os.environ["OWNER_SETUP_CODE"] = secrets.token_hex(4)
    return os.environ["OWNER_SETUP_CODE"]


@app.route("/setup", methods=["GET", "POST"])
def setup():
    if owner_exists():
        abort(404)
    if request.method == "POST":
        f = request.form
        name, email, password = clean_name(f.get("name")), f.get("email", "").strip(), f.get("password", "")
        if not secrets.compare_digest(f.get("code", "").strip(), setup_code()):
            error = "Wrong setup code. It's in the server log (or OWNER_SETUP_CODE in .env)."
        else:
            error = account_error(name, email, password, min_len=8)
        if error:
            flash(error, "error")
            return render_template("setup.html", form=f)
        cur = db().execute(
            "INSERT INTO users (username, name, email, password_hash, status, role, created_at) "
            "VALUES (?, ?, ?, ?, 'approved', 'owner', ?)",
            (make_username(email), name, email, hash_password(password), now()))
        db().commit()
        session.clear()
        session["uid"] = cur.lastrowid
        flash("You're the owner. Welcome!", "ok")
        return redirect(url_for("admin"))
    return render_template("setup.html", form={})


@app.route("/login", methods=["GET", "POST"])
def login():
    if not owner_exists():
        return redirect(url_for("setup"))
    if request.method == "POST":
        login_id = request.form.get("email", "").strip()
        password = request.form.get("password", "")
        user = db().execute(
            "SELECT * FROM users WHERE lower(email) = lower(?) OR username = ? ORDER BY id LIMIT 1",
            (login_id, login_id)).fetchone()
        if user and user["locked_until"] > now():
            wait = datetime.strptime(user["locked_until"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
            minutes = max(1, -(-int((wait - datetime.now(timezone.utc)).total_seconds()) // 60))
            flash(f"Too many wrong passwords. Try again in {minutes} minute{'' if minutes == 1 else 's'}.", "error")
            return render_template("login.html", login_id=login_id)
        if not user or not check_password_hash(user["password_hash"], password):
            if user:
                fails = user["failed_logins"] + 1
                if fails >= MAX_LOGIN_FAILS:
                    until = (datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)).strftime("%Y-%m-%d %H:%M:%S")
                    db().execute("UPDATE users SET failed_logins = 0, locked_until = ? WHERE id = ?", (until, user["id"]))
                else:
                    db().execute("UPDATE users SET failed_logins = ? WHERE id = ?", (fails, user["id"]))
                db().commit()
            flash("Wrong email or password.", "error")
            return render_template("login.html", login_id=login_id)
        db().execute("UPDATE users SET failed_logins = 0, locked_until = '' WHERE id = ?", (user["id"],))
        db().commit()
        session.clear()
        session["uid"] = user["id"]
        if user["must_change_pw"]:
            flash("You logged in with a temporary password. Pick a new one now.", "ok")
            return redirect(url_for("account"))
        nxt = request.args.get("next", "")
        return redirect(nxt if nxt.startswith("/") and not nxt.startswith("//") else url_for("index"))
    return render_template("login.html", login_id="")


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return redirect(url_for("index"))


MAX_LOGIN_FAILS = 5   # wrong passwords in a row before the account is paused
LOCKOUT_MINUTES = 10

RESET_WORDS = ("blue red gold green silver purple orange pink tiger panda falcon otter fox wolf "
               "shark comet rocket planet river maple cactus pixel ninja dragon").split()


def temp_password():
    return f"{secrets.choice(RESET_WORDS)}-{secrets.choice(RESET_WORDS)}-{secrets.randbelow(90) + 10}"


@app.route("/forgot", methods=["GET", "POST"])
def forgot():
    """No email needed: the request shows up in Admin, and staff hand over a temporary password."""
    if request.method == "POST":
        email = request.form.get("email", "").strip()
        note = re.sub(r"\s+", " ", request.form.get("note", "")).strip()[:200]
        user = db().execute("SELECT * FROM users WHERE lower(email) = lower(?) AND status != 'banned'",
                            (email,)).fetchone()
        if user:
            db().execute("UPDATE users SET reset_note = ?, reset_at = ? WHERE id = ?",
                         (note or "(no note)", now(), user["id"]))
            db().commit()
            base = os.environ.get("SITE_URL", request.host_url.rstrip("/"))
            email_people_managers(f"Password reset request: {user['name']}",
                                  f"{user['name']} ({user['email']}) forgot their password.\n\n"
                                  f"Note: {note or '(none)'}\n\nReset it: {base}/admin?tab=users")
        # Same message either way, so this page can't be used to check who has an account.
        return render_template("message.html", title="Request sent",
                               text="If that email has an account, the admin will see your request. "
                                    "They'll give you a temporary password - ask them in person or by message.")
    return render_template("forgot.html")


@app.route("/waiting")
def waiting():
    user = current_user()
    if not user:
        return redirect(url_for("login"))
    if user["status"] == "approved" or user["is_owner"]:
        return redirect(url_for("index"))
    return render_template("waiting.html")


@app.route("/account", methods=["GET", "POST"])
@login_required
def account():
    user = current_user()
    if request.method == "POST":
        action = request.form.get("action")
        if action == "email_prefs":
            opt_in = 1 if request.form.get("email_opt_in") else 0
            email = request.form.get("email", "").strip()
            name = clean_name(request.form.get("name"))
            if not name:
                flash("Enter your name.", "error")
            elif not EMAIL_RE.match(email):
                flash("Enter a valid email address.", "error")
            elif db().execute("SELECT 1 FROM users WHERE lower(email) = lower(?) AND id != ?",
                              (email, user["id"])).fetchone():
                flash("Another account already uses that email.", "error")
            else:
                db().execute("UPDATE users SET email_opt_in = ?, email = ?, name = ? WHERE id = ?",
                             (opt_in, email, name, user["id"]))
                db().commit()
                flash("Saved.", "ok")
        elif action == "password":
            if not check_password_hash(user["password_hash"], request.form.get("current", "")):
                flash("Current password is wrong.", "error")
            elif len(request.form.get("new", "")) < 6:
                flash("New password must be at least 6 characters.", "error")
            else:
                db().execute("UPDATE users SET password_hash = ?, must_change_pw = 0 WHERE id = ?",
                             (hash_password(request.form["new"]), user["id"]))
                db().commit()
                flash("Password changed.", "ok")
                if user["must_change_pw"]:
                    return redirect(url_for("index"))
        return redirect(url_for("account"))
    return render_template("account.html")


@app.route("/unsubscribe/<token>")
def unsubscribe(token):
    try:
        user_id = signer.loads(token)
    except BadSignature:
        abort(404)
    db().execute("UPDATE users SET email_opt_in = 0 WHERE id = ?", (user_id,))
    db().commit()
    return render_template("message.html", title="Unsubscribed",
                           text="You won't get any more emails. You can turn them back on in your account page.")


# ── games ─────────────────────────────────────────────────

POPULAR_DAYS = 14


def game_rows(include_early=True):
    """Games, most popular first: plays in the last POPULAR_DAYS days, then all-time plays.
    include_early=False hides games that are still in Pro early access."""
    since = (datetime.now(timezone.utc).date() - timedelta(days=POPULAR_DAYS - 1)).isoformat()
    rows = db().execute(
        "SELECT g.*, COALESCE((SELECT SUM(n) FROM game_plays p WHERE p.game_id = g.id AND p.day >= ?), 0) "
        "AS recent FROM games g WHERE ? OR g.early_until = '' OR g.early_until <= ? "
        "ORDER BY recent DESC, plays DESC, name COLLATE NOCASE", (since, include_early, now())).fetchall()
    games = []
    for r in rows:
        d = dict(r)
        d["genres"] = [x.strip() for x in r["genres"].split(",") if x.strip()]
        d["early"] = is_early(r)
        games.append(d)
    return games


def is_early(game):
    return bool(game["early_until"]) and game["early_until"] > now()


def release_early_games():
    """Games whose Pro early access just ended get their public "New game" update now."""
    for game in db().execute("SELECT * FROM games WHERE announce_on_release = 1 AND early_until <= ?",
                             (now(),)).fetchall():
        db().execute("UPDATE games SET announce_on_release = 0, early_until = '' WHERE id = ?", (game["id"],))
        notify(f"New game: {game['name']}", game["description"], f"/play/{game['id']}", kind="game")


@app.route("/")
def index():
    """Logged-out visitors get the math practice front page; everyone else gets the games."""
    if not current_user():
        return render_template("landing.html")
    return games_home()


@login_required
def games_home():
    release_early_games()
    user = current_user()
    games = game_rows(include_early=user["is_pro"])
    favs = {r["game_id"] for r in db().execute(
        "SELECT game_id FROM favorites WHERE user_id = ?", (user["id"],))}
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d %H:%M:%S")
    with_art = [g for g in games if g["image"]]
    return render_template(
        "index.html", games=games, favs=favs,
        genres=sorted({g_ for game in games for g_ in game["genres"]}),
        latest_poll=db().execute("SELECT * FROM polls WHERE is_open = 1 ORDER BY id DESC LIMIT 1").fetchone(),
        featured=with_art[0] if with_art else None,
        trending=with_art[1:9],
        new_count=sum(1 for g in games if g["created_at"] >= week_ago),
        early_count=sum(1 for g in games if g["early"]))


@app.route("/demo")
def demo_home():
    """The redesign preview became the real games page."""
    return redirect(url_for("index"))


@app.route("/play/<int:game_id>")
@login_required
def play(game_id):
    game = db().execute("SELECT * FROM games WHERE id = ?", (game_id,)).fetchone()
    if not game:
        abort(404)
    if is_early(game) and not current_user()["is_pro"]:
        flash(f"{game['name']} is in Pro early access right now. Everyone gets it soon, or get Pro to play it today.", "error")
        return redirect(url_for("pro"))
    db().execute("UPDATE games SET plays = plays + 1 WHERE id = ?", (game_id,))
    db().execute("INSERT INTO game_plays (game_id, day) VALUES (?, ?) "
                 "ON CONFLICT(game_id, day) DO UPDATE SET n = n + 1",
                 (game_id, datetime.now(timezone.utc).strftime("%Y-%m-%d")))
    db().commit()
    if game["file"]:
        return render_template("play.html", game=game, src=url_for("game_file", filename=game["file"]))
    raw = raw_file_url(game["url"])
    if raw:
        return render_template("play.html", game=game, src=raw, raw=True)
    return render_template("play.html", game=game, src=game["url"])


RAW_HOSTS = ("raw.githubusercontent.com", "gist.githubusercontent.com", "cdn.jsdelivr.net")
GITHUB_BLOB = re.compile(r"^https?://github\.com/([^/]+)/([^/]+)/(?:blob|raw)/(.+?)(?:\?.*)?$")


def raw_file_url(url):
    """Links to raw HTML files on GitHub are served as plain text, so they can't
    just be put in an iframe. Returns the raw URL to load in the browser instead,
    or None for a normal web page."""
    m = GITHUB_BLOB.match(url or "")
    if m:
        user, repo, rest = m.groups()
        return f"https://raw.githubusercontent.com/{user}/{repo}/{rest}"
    host = re.sub(r"^https?://", "", url or "").split("/", 1)[0].lower()
    return url if host in RAW_HOSTS else None


@app.route("/g/<path:filename>")
@login_required
def game_file(filename):
    return send_from_directory(GAMES_DIR, filename)


@app.route("/api/favorite/<int:game_id>", methods=["POST"])
@login_required
def toggle_favorite(game_id):
    uid = current_user()["id"]
    exists = db().execute("SELECT 1 FROM favorites WHERE user_id = ? AND game_id = ?",
                          (uid, game_id)).fetchone()
    if exists:
        db().execute("DELETE FROM favorites WHERE user_id = ? AND game_id = ?", (uid, game_id))
    else:
        db().execute("INSERT OR IGNORE INTO favorites (user_id, game_id) VALUES (?, ?)", (uid, game_id))
    db().commit()
    return jsonify(favorite=not exists)


# ── polls ─────────────────────────────────────────────────

def poll_details(poll, user_id):
    options = db().execute(
        "SELECT o.id, o.label, u.name AS suggested_by, "
        "(SELECT COUNT(*) FROM votes v WHERE v.option_id = o.id) AS votes "
        "FROM poll_options o LEFT JOIN users u ON u.id = o.suggested_by "
        "WHERE o.poll_id = ? ORDER BY o.id", (poll["id"],)).fetchall()
    total = sum(o["votes"] for o in options)
    mine = db().execute("SELECT option_id FROM votes WHERE poll_id = ? AND user_id = ?",
                        (poll["id"], user_id)).fetchone()
    return {"poll": poll, "options": options, "total": total,
            "my_vote": mine["option_id"] if mine else None}


@app.route("/polls")
@login_required
def polls():
    uid = current_user()["id"]
    rows = db().execute("SELECT * FROM polls ORDER BY is_open DESC, id DESC").fetchall()
    return render_template("polls.html", polls=[poll_details(p, uid) for p in rows])


@app.route("/polls/<int:poll_id>/vote", methods=["POST"])
@login_required
def vote(poll_id):
    poll = db().execute("SELECT * FROM polls WHERE id = ?", (poll_id,)).fetchone()
    option_id = request.form.get("option", type=int)
    valid = option_id and db().execute(
        "SELECT 1 FROM poll_options WHERE id = ? AND poll_id = ?", (option_id, poll_id)).fetchone()
    if not poll or not poll["is_open"] or not valid:
        flash("That poll is closed.", "error")
    else:
        db().execute(
            "INSERT INTO votes (poll_id, user_id, option_id) VALUES (?, ?, ?) "
            "ON CONFLICT(poll_id, user_id) DO UPDATE SET option_id = excluded.option_id",
            (poll_id, current_user()["id"], option_id))
        db().commit()
        flash("Vote saved.", "ok")
    return redirect(url_for("polls") + f"#poll-{poll_id}")


@app.route("/polls/<int:poll_id>/suggest", methods=["POST"])
@login_required
def suggest(poll_id):
    poll = db().execute("SELECT * FROM polls WHERE id = ?", (poll_id,)).fetchone()
    label = request.form.get("label", "").strip()[:80]
    if not poll or not poll["is_open"] or not poll["allow_suggestions"]:
        flash("Suggestions are off for that poll.", "error")
    elif not label:
        flash("Type something to suggest.", "error")
    elif db().execute("SELECT 1 FROM poll_options WHERE poll_id = ? AND label = ? COLLATE NOCASE",
                      (poll_id, label)).fetchone():
        flash("That's already an option - vote for it!", "error")
    else:
        uid = current_user()["id"]
        cur = db().execute("INSERT INTO poll_options (poll_id, label, suggested_by) VALUES (?, ?, ?)",
                           (poll_id, label, uid))
        db().execute(
            "INSERT INTO votes (poll_id, user_id, option_id) VALUES (?, ?, ?) "
            "ON CONFLICT(poll_id, user_id) DO UPDATE SET option_id = excluded.option_id",
            (poll_id, uid, cur.lastrowid))
        db().commit()
        flash("Added your suggestion and voted for it.", "ok")
    return redirect(url_for("polls") + f"#poll-{poll_id}")


# ── movies ────────────────────────────────────────────────

@app.route("/movies")
@login_required
def movies():
    return render_template("movies.html", movies_doc=setting("movies_doc"))


# ── notifications ─────────────────────────────────────────

@app.route("/notifications")
@login_required
def notifications():
    user = current_user()
    rows = db().execute(f"SELECT * FROM notifications WHERE {notes_filter(user)} "
                        "ORDER BY id DESC LIMIT 100").fetchall()
    seen = user["last_notif_seen"]
    if rows:
        db().execute("UPDATE users SET last_notif_seen = ? WHERE id = ?", (rows[0]["id"], user["id"]))
        db().commit()
    return render_template("notifications.html", notes=rows, seen=seen)


# ── Pro ───────────────────────────────────────────────────

MAX_OPEN_REQUESTS = 3  # per Pro member, so the list stays manageable


def pro_numbers():
    members = db().execute("SELECT COUNT(*) FROM users WHERE premium = 1").fetchone()[0]
    price = float(setting("pro_price") or 0)
    monthly = float(setting("monthly_cost") or 0)
    raised = members * price
    return {"members": members, "price": price, "raised": raised, "monthly": monthly,
            "months": raised / monthly if monthly else 0}


@app.route("/pro")
@login_required
def pro():
    user = current_user()
    requests_ = db().execute("SELECT * FROM game_requests WHERE user_id = ? ORDER BY id DESC",
                             (user["id"],)).fetchall()
    peeks = []
    if user["is_pro"]:
        peeks = db().execute("SELECT * FROM notifications WHERE audience = 'pro' "
                             "ORDER BY id DESC LIMIT 5").fetchall()
    early = [g for g in game_rows() if g["early"]]
    member_no = None
    if user["is_premium"]:
        member_no = db().execute("SELECT COUNT(*) FROM users WHERE premium = 1 AND premium_since <= ?",
                                 (user["premium_since"],)).fetchone()[0]
    return render_template("pro.html", my_requests=requests_, peeks=peeks,
                           early_games=early if user["is_pro"] else [], early_count=len(early),
                           peek_count=db().execute("SELECT COUNT(*) FROM notifications WHERE kind = 'peek'").fetchone()[0],
                           member_no=member_no, cashtag=setting("cashtag").lstrip("$"), nums=pro_numbers(),
                           max_requests=MAX_OPEN_REQUESTS)


@app.route("/pro/claim", methods=["POST"])
@login_required
def pro_claim():
    """"I've paid" - the owner (or a Pro manager) checks Cash App and confirms it."""
    user = current_user()
    if user["is_premium"]:
        return redirect(url_for("pro"))
    handle = request.form.get("cashapp", "").strip()[:60]
    if not handle:
        flash("Put the Cash App name you paid from, so we can find your payment.", "error")
        return redirect(url_for("pro"))
    db().execute("UPDATE users SET pro_claim = ?, pro_claim_at = ? WHERE id = ?", (handle, now(), user["id"]))
    db().commit()
    base = os.environ.get("SITE_URL", request.host_url.rstrip("/"))
    email_people_managers(f"{setting('site_name')}: {user['name']} says they paid for Pro",
                          f"{user['name']} ({user['email']}) says they sent the Pro payment from Cash App "
                          f"account: {handle}\n\nCheck Cash App, then confirm it: {base}/admin?tab=pro", perm="pro")
    flash("Thanks! We'll check Cash App and turn on Pro for you soon.", "ok")
    return redirect(url_for("pro"))


@app.route("/pro/request", methods=["POST"])
@login_required
def pro_request():
    user = current_user()
    if not user["is_pro"]:
        abort(403)
    name = request.form.get("name", "").strip()[:80]
    if not name:
        flash("Which game do you want?", "error")
        return redirect(url_for("pro") + "#requests")
    open_count = db().execute("SELECT COUNT(*) FROM game_requests WHERE user_id = ? AND status = 'open'",
                              (user["id"],)).fetchone()[0]
    if open_count >= MAX_OPEN_REQUESTS:
        flash(f"You have {open_count} requests waiting already. Once one is answered you can ask for another.", "error")
        return redirect(url_for("pro") + "#requests")
    link = request.form.get("link", "").strip()[:300]
    if link and not link.startswith(("http://", "https://")):
        link = ""
    db().execute("INSERT INTO game_requests (user_id, name, link, note, created_at) VALUES (?, ?, ?, ?, ?)",
                 (user["id"], name, link, request.form.get("note", "").strip()[:300], now()))
    db().commit()
    flash(f"Requested {name}. You'll see the answer here.", "ok")
    return redirect(url_for("pro") + "#requests")


# ── owner: preview the site as another role ───────────────

@app.route("/preview", methods=["POST"])
@login_required
def preview():
    if not current_user()["real_owner"]:
        abort(403)
    role = request.form.get("role")
    if role not in ROLES:
        session.pop("view_as", None)
        return redirect(url_for("admin"))
    session["view_as"] = role
    return redirect(url_for("index") if role == "player" else url_for("admin"))


@app.route("/preview/exit", methods=["POST"])
@login_required
def preview_exit():
    session.pop("view_as", None)
    return redirect(url_for("admin"))


# ── admin ─────────────────────────────────────────────────

ADMIN_TABS = [  # key, label, permission needed
    ("users", "People", "people"),
    ("games", "Games", "games"),
    ("import", "Bulk import", "games"),
    ("polls", "Polls", "polls"),
    ("announce", "Announce", "announce"),
    ("pro", "Pro", "pro"),
    ("stats", "Visitors", "stats"),
    ("settings", "Settings", "owner"),
]


@app.route("/admin")
@staff_required()
def admin():
    me = current_user()
    tabs = [(key, label) for key, label, perm in ADMIN_TABS if perm in me["perms"] or
            (perm == "owner" and me["is_owner"])]
    tab = request.args.get("tab") or tabs[0][0]
    if tab not in dict(tabs):
        tab = tabs[0][0]
    users = [with_roles(u) for u in db().execute(
        "SELECT * FROM users ORDER BY role = 'owner' DESC, perms != '' DESC, "
        "CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 "
        "WHEN 'ignored' THEN 2 ELSE 3 END, created_at DESC")]
    uid = me["id"]
    poll_list = [poll_details(p, uid) for p in
                 db().execute("SELECT * FROM polls ORDER BY id DESC").fetchall()]
    edit_game = None
    if request.args.get("edit"):
        edit_game = db().execute("SELECT * FROM games WHERE id = ?",
                                 (request.args.get("edit", type=int),)).fetchone()
    stats = {
        "users": sum(1 for u in users if u["status"] == "approved"),
        "pending": sum(1 for u in users if u["status"] == "pending"),
        "games": db().execute("SELECT COUNT(*) FROM games").fetchone()[0],
        "plays": db().execute("SELECT COALESCE(SUM(plays), 0) FROM games").fetchone()[0],
    }
    return render_template(
        "admin.html", tab=tab, tabs=tabs, users=users, visitors=visitor_stats() if tab == "stats" else None, games=game_rows(), polls=poll_list,
        edit_game=edit_game, stats=stats, import_report=IMPORT_REPORTS.pop(uid, None), access_mode=setting("access_mode"),
        smtp_ok=smtp_configured(), pro=pro_admin_data() if tab == "pro" else None,
        cashtag=setting("cashtag"), pro_price=setting("pro_price"), monthly_cost=setting("monthly_cost"),
        early_days=setting("early_days"), movies_doc=setting("movies_doc"), now_utc=now(), pro_todo=pro_todo_count() if can("pro") else 0,
        subscribers=db().execute("SELECT COUNT(*) FROM users WHERE status='approved' AND email_opt_in=1")
        .fetchone()[0],
    )


@app.route("/admin/user/<int:user_id>", methods=["POST"])
@staff_required("people")
def admin_user(user_id):
    action = request.form.get("action")
    target = db().execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not target:
        abort(404)
    me = current_user()
    target = with_roles(target)
    if target["id"] == me["id"]:
        flash("You can't change your own account here.", "error")
        return redirect(url_for("admin"))
    if target["is_owner"] or (target["is_staff"] and not me["is_owner"]):
        flash("Only the owner can change staff accounts.", "error")
        return redirect(url_for("admin", tab="users"))
    if action == "set_perms":
        if not me["is_owner"]:
            abort(403)
        role = request.form.get("role")
        if role in ROLES:
            perms = list(ROLES[role][1])
        else:
            perms = [p for p in request.form.getlist("perms") if p in PERMS]
        db().execute("UPDATE users SET perms = ?, status = CASE WHEN ? != '' THEN 'approved' ELSE status END "
                     "WHERE id = ?", (",".join(perms), ",".join(perms), user_id))
        db().commit()
        label = ROLES.get(role_key(perms), ("custom staff",))[0]
        flash(f"{target['name']} is now: {label}.", "ok")
        return redirect(url_for("admin", tab="users"))
    base = os.environ.get("SITE_URL", request.host_url.rstrip("/"))
    if action == "approve":
        db().execute("UPDATE users SET status = 'approved', ban_reason = '' WHERE id = ?", (user_id,))
        send_email([(target["email"], None)], f"You're in - {setting('site_name')} access approved",
                   f"Hi {target['name']}, your access was approved. Log in: {base}/login")
        flash(f"Approved {target['name']}.", "ok")
    elif action == "ignore":
        db().execute("UPDATE users SET status = 'ignored' WHERE id = ?", (user_id,))
        flash(f"Ignored {target['name']}. They stay locked out but aren't banned.", "ok")
    elif action == "pending":
        db().execute("UPDATE users SET status = 'pending' WHERE id = ?", (user_id,))
        flash(f"Moved {target['name']} back to pending.", "ok")
    elif action == "ban":
        reason = request.form.get("reason", "").strip()[:200]
        db().execute("UPDATE users SET status = 'banned', ban_reason = ? WHERE id = ?", (reason, user_id))
        flash(f"Banned {target['name']}.", "ok")
    elif action == "reset_pw":
        temp = temp_password()
        db().execute("UPDATE users SET password_hash = ?, must_change_pw = 1, reset_note = '', reset_at = '', "
                     "failed_logins = 0, locked_until = '' WHERE id = ?", (hash_password(temp), user_id))
        flash(f"{target['name']}'s temporary password is: {temp}  - give it to them now, it won't be shown "
              "again. They'll pick a new one when they log in.", "ok")
    elif action == "dismiss_reset":
        db().execute("UPDATE users SET reset_note = '', reset_at = '' WHERE id = ?", (user_id,))
        flash(f"Dismissed {target['name']}'s reset request.", "ok")
    elif action == "delete":
        db().execute("DELETE FROM users WHERE id = ?", (user_id,))
        flash(f"Deleted {target['name']}'s account.", "ok")
    db().commit()
    return redirect(url_for("admin", tab="users"))


def pro_admin_data():
    return {
        "claims": db().execute("SELECT * FROM users WHERE pro_claim != '' AND premium = 0 "
                               "ORDER BY pro_claim_at").fetchall(),
        "members": db().execute("SELECT * FROM users WHERE premium = 1 ORDER BY premium_since DESC").fetchall(),
        "others": db().execute("SELECT id, name, email FROM users WHERE premium = 0 AND status = 'approved' "
                               "AND role != 'owner' ORDER BY name COLLATE NOCASE").fetchall(),
        "requests": db().execute(
            "SELECT r.*, u.name AS who FROM game_requests r JOIN users u ON u.id = r.user_id "
            "ORDER BY r.status = 'open' DESC, r.id DESC LIMIT 200").fetchall(),
        "nums": pro_numbers(),
    }


@app.route("/admin/pro", methods=["POST"])
@staff_required("pro")
def admin_pro():
    f = request.form
    action = f.get("action")
    back = redirect(url_for("admin", tab="pro"))
    if action == "request":
        status = f.get("status")
        if status in ("open", "added", "declined"):
            db().execute("UPDATE game_requests SET status = ?, reply = ? WHERE id = ?",
                         (status, f.get("reply", "").strip()[:300], f.get("request_id", type=int)))
            db().commit()
            flash("Request updated.", "ok")
        return back
    target = db().execute("SELECT * FROM users WHERE id = ?", (f.get("user_id", type=int),)).fetchone()
    if not target:
        abort(404)
    if action in ("confirm", "grant"):
        note = f.get("note", "").strip()[:120] or (f"Cash App: {target['pro_claim']}" if target["pro_claim"] else "")
        db().execute("UPDATE users SET premium = 1, premium_since = ?, premium_note = ?, pro_claim = '', "
                     "status = CASE WHEN status = 'pending' THEN 'approved' ELSE status END WHERE id = ?",
                     (now(), note, target["id"]))
        send_email([(target["email"], None)], f"You're Pro on {setting('site_name')}!",
                   f"Hi {target['name']}, Pro is turned on for your account. Thanks for supporting the site!\n\n"
                   f"{os.environ.get('SITE_URL', request.host_url.rstrip('/'))}/pro")
        flash(f"{target['name']} is Pro now.", "ok")
    elif action == "reject":
        db().execute("UPDATE users SET pro_claim = '' WHERE id = ?", (target["id"],))
        flash(f"Cleared {target['name']}'s payment claim. They can send a new one from the Pro page.", "ok")
    elif action == "revoke":
        db().execute("UPDATE users SET premium = 0, premium_since = '' WHERE id = ?", (target["id"],))
        flash(f"Removed Pro from {target['name']}.", "ok")
    db().commit()
    return back


@app.route("/admin/settings", methods=["POST"])
@staff_required("owner")
def admin_settings():
    mode = request.form.get("access_mode")
    if mode in ("approval", "open", "closed"):
        set_setting("access_mode", mode)
    name = request.form.get("site_name", "").strip()
    if name:
        set_setting("site_name", name[:40])
    if "cashtag" in request.form:
        set_setting("cashtag", request.form.get("cashtag", "").strip().lstrip("$")[:40])
        for key in ("pro_price", "monthly_cost", "early_days"):
            value = request.form.get(key, "").strip()
            if re.fullmatch(r"\d{1,4}(\.\d{1,2})?", value):
                set_setting(key, value)
    if "movies_doc" in request.form:
        link = request.form.get("movies_doc", "").strip()
        if link and not re.match(r"https?://", link):
            flash("The movies doc link needs to start with http:// or https://", "error")
        else:
            set_setting("movies_doc", link[:500])
    db().commit()
    flash("Settings saved.", "ok")
    return redirect(url_for("admin", tab="settings"))


@app.route("/admin/test-email", methods=["POST"])
@staff_required("owner")
def admin_test_email():
    send_email([(current_user()["email"], None)], "Nova test email",
               "If you're reading this, email notifications work.")
    flash("Test email sent to " + current_user()["email"] + " (check the server log if it doesn't arrive).", "ok")
    return redirect(url_for("admin", tab="settings"))


def save_upload(upload):
    ext = os.path.splitext(upload.filename or "")[1].lower()
    if ext not in ALLOWED_UPLOADS:
        return None
    name = re.sub(r"[^a-z0-9]+", "-", os.path.splitext(upload.filename)[0].lower()).strip("-") or "game"
    filename = f"{name}-{uuid.uuid4().hex[:6]}{ext}"
    upload.save(os.path.join(GAMES_DIR, filename))
    return filename


@app.route("/admin/game", methods=["POST"])
@staff_required("games")
def admin_game_save():
    f = request.form
    game_id = f.get("id", type=int)
    name = f.get("name", "").strip()
    url = f.get("url", "").strip()
    upload = request.files.get("file")
    if not name:
        flash("Games need a name.", "error")
        return redirect(url_for("admin", tab="games"))
    if url and not url.startswith(("http://", "https://", "/")):
        flash("Game link must start with https://", "error")
        return redirect(url_for("admin", tab="games"))

    filename = None
    if upload and upload.filename:
        filename = save_upload(upload)
        if not filename:
            flash("Only .html / .htm files can be uploaded.", "error")
            return redirect(url_for("admin", tab="games"))

    genres = ", ".join(x.strip() for x in f.get("genres", "").split(",") if x.strip())
    fields = (name, f.get("description", "").strip(), genres, f.get("image", "").strip())
    early_days = f.get("early_days", type=int) if f.get("early") else 0
    early_until = ((datetime.now(timezone.utc) + timedelta(days=min(early_days, 60))).strftime("%Y-%m-%d %H:%M:%S")
                   if early_days and early_days > 0 else "")
    if game_id:
        old = db().execute("SELECT * FROM games WHERE id = ?", (game_id,)).fetchone()
        if not old:
            abort(404)
        new_file = filename or (old["file"] if not url else "")
        if old["file"] and old["file"] != new_file:
            remove_game_file(old["file"])
        if is_early(old) and f.get("early"):
            early_until = old["early_until"]  # still ticked: keep the current window
        db().execute(
            "UPDATE games SET name=?, description=?, genres=?, image=?, url=?, file=?, early_until=? WHERE id=?",
            fields + (url if not filename else "", new_file, early_until, game_id))
        db().commit()
        flash(f"Updated {name}.", "ok")
    else:
        if not url and not filename:
            flash("Add a link or upload an HTML file.", "error")
            return redirect(url_for("admin", tab="games"))
        taken = url and not filename and db().execute(
            "SELECT name FROM games WHERE url = ?", (url,)).fetchone()
        if taken:
            flash(f"That link is already on the site as \"{taken['name']}\".", "error")
            return redirect(url_for("admin", tab="games"))
        announce = bool(f.get("announce"))
        cur = db().execute(
            "INSERT INTO games (name, description, genres, image, url, file, created_at, early_until, "
            "announce_on_release) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            fields + ("" if filename else url, filename or "", now(), early_until, int(announce and bool(early_until))))
        db().commit()
        if early_until:
            flash(f"Added {name}. Pro members get it for {early_days} day{'' if early_days == 1 else 's'} "
                  "before everyone else.", "ok")
            if announce:  # Pro hears now; everyone else hears when early access ends
                notify(f"Early access: {name}", f.get("description", "").strip() or "Pro gets it first.",
                       f"/play/{cur.lastrowid}", kind="game", audience="pro")
        else:
            flash(f"Added {name}.", "ok")
            if announce:
                notify(f"New game: {name}", f.get("description", "").strip(), f"/play/{cur.lastrowid}", kind="game")
    return redirect(url_for("admin", tab="games"))


def remove_game_file(filename):
    path = os.path.join(GAMES_DIR, filename)
    if filename != "emulator.html" and os.path.isfile(path):
        os.remove(path)


@app.route("/admin/game/<int:game_id>/delete", methods=["POST"])
@staff_required("games")
def admin_game_delete(game_id):
    game = db().execute("SELECT * FROM games WHERE id = ?", (game_id,)).fetchone()
    if game:
        if game["file"]:
            remove_game_file(game["file"])
        db().execute("DELETE FROM games WHERE id = ?", (game_id,))
        db().commit()
        flash(f"Removed {game['name']}.", "ok")
    return redirect(url_for("admin", tab="games"))


# ── bulk import / export ──────────────────────────────────

IMPORT_REPORTS = {}  # admin id -> last import result (too big for the session cookie)

def js_to_json(text):
    """Turn a JavaScript array literal (unquoted keys, 'single quotes', trailing
    commas, `const data = [...];`) into JSON, without touching text inside strings."""
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1:
        raise ValueError("Couldn't find a [ ... ] list in what you pasted.")
    text = text[start:end + 1]
    out, i, n = [], 0, len(text)
    while i < n:
        ch = text[i]
        if ch in "\"'`":  # copy a whole string, normalising it to double quotes
            quote, i, buf = ch, i + 1, []
            while i < n and text[i] != quote:
                if text[i] == "\\" and i + 1 < n:
                    nxt = text[i + 1]
                    buf.append(nxt if nxt == "'" else "\\" + nxt)
                    i += 2
                    continue
                buf.append('\\"' if text[i] == '"' else text[i])
                i += 1
            out.append('"' + "".join(buf) + '"')
            i += 1
        elif text.startswith("//", i):  # line comment
            while i < n and text[i] != "\n":
                i += 1
        elif text.startswith("/*", i):  # block comment
            close = text.find("*/", i + 2)
            i = n if close == -1 else close + 2
        elif ch.isalpha() or ch in "_$":  # bare word: a key, or true/false/null
            j = i
            while j < n and (text[j].isalnum() or text[j] in "_$"):
                j += 1
            word = text[i:j]
            k = j
            while k < n and text[k] in " \t\r\n":
                k += 1
            out.append(f'"{word}"' if k < n and text[k] == ":" else word)
            i = j
        else:
            out.append(ch)
            i += 1
    result = "".join(out)
    return re.sub(r",(\s*[\]}])", r"\1", result)  # trailing commas


def parse_game_list(text):
    """Accepts JSON, a JS array literal, or CSV with a header row."""
    import csv
    import io
    import json

    stripped = text.strip()
    if not stripped:
        return []
    if stripped.startswith(("[", "{")) or "[" in stripped.split("\n", 1)[0]:
        try:
            items = json.loads(stripped)
        except ValueError:
            items = json.loads(js_to_json(stripped))
        if isinstance(items, dict):
            items = items.get("games") or items.get("data") or [items]
        return [x for x in items if isinstance(x, dict)]
    rows = csv.DictReader(io.StringIO(stripped))
    return [{(k or "").strip().lower(): (v or "").strip() for k, v in row.items()} for row in rows]


def clean_genres(value):
    if isinstance(value, list):
        parts = value
    else:
        parts = re.split(r"[,|;]", str(value or ""))
    return ", ".join(str(p).strip() for p in parts if str(p).strip())


@app.route("/admin/games/import", methods=["POST"])
@staff_required("games")
def admin_games_import():
    f = request.form
    on_duplicate = f.get("on_duplicate", "skip")  # skip | update
    text = f.get("list", "")
    upload = request.files.get("list_file")
    if upload and upload.filename:
        text = upload.read().decode("utf-8", errors="replace")

    added, updated, skipped, errors = [], [], [], []
    existing = {r["name"].lower(): r for r in db().execute("SELECT * FROM games")}
    link_owner = {r["url"]: r["name"] for r in existing.values() if r["url"]}  # link -> game name

    # 1) a pasted / uploaded list of games
    try:
        items = parse_game_list(text) if text.strip() else []
    except ValueError as exc:
        flash(f"Couldn't read that list: {exc}", "error")
        return redirect(url_for("admin", tab="import"))

    for n, item in enumerate(items, 1):
        name = str(item.get("name") or item.get("title") or "").strip()
        url = str(item.get("url") or item.get("link") or "").strip()
        if not name:
            errors.append(f"#{n}: missing name")
            continue
        if not url.startswith(("http://", "https://", "/")):
            errors.append(f"{name}: link must start with https://")
            continue
        fields = (
            name,
            str(item.get("description") or "").strip(),
            clean_genres(item.get("genres") or item.get("genre") or item.get("tags")),
            str(item.get("image") or item.get("cover") or "").strip(),
            url,
        )
        old = existing.get(name.lower())
        same_link = link_owner.get(url)
        if same_link and same_link.lower() != name.lower():
            skipped.append(f"{name} (same link as {same_link})")
        elif old and (on_duplicate == "skip" or old["id"] is None):  # None = earlier in this same list
            skipped.append(name)
        elif old:
            db().execute("UPDATE games SET name=?, description=?, genres=?, image=?, url=?, file='' WHERE id=?",
                         fields + (old["id"],))
            if old["file"]:
                remove_game_file(old["file"])
            updated.append(name)
        else:
            db().execute("INSERT INTO games (name, description, genres, image, url, created_at) "
                         "VALUES (?, ?, ?, ?, ?, ?)", fields + (now(),))
            existing[name.lower()] = {"id": None, "file": "", "name": name}
            link_owner[url] = name
            added.append(name)

    # 2) a batch of .html files - the file name becomes the game name
    default_genres = clean_genres(f.get("file_genres", ""))
    for upload in request.files.getlist("files"):
        if not upload or not upload.filename:
            continue
        base = os.path.splitext(os.path.basename(upload.filename))[0]
        name = re.sub(r"[-_]+", " ", base).strip().title() or "Game"
        old = existing.get(name.lower())
        if old and (on_duplicate == "skip" or old["id"] is None):
            skipped.append(name)
            continue
        filename = save_upload(upload)
        if not filename:
            errors.append(f"{upload.filename}: only .html / .htm files")
            continue
        if old:
            if old["file"]:
                remove_game_file(old["file"])
            db().execute("UPDATE games SET url='', file=? WHERE id=?", (filename, old["id"]))
            updated.append(name)
        else:
            db().execute("INSERT INTO games (name, genres, file, created_at) VALUES (?, ?, ?, ?)",
                         (name, default_genres, filename, now()))
            existing[name.lower()] = {"id": None, "file": filename, "name": name}
            added.append(name)

    db().commit()

    if not (added or updated or skipped or errors):
        flash("Nothing to import - paste a list or pick some files.", "error")
        return redirect(url_for("admin", tab="import"))
    summary = f"Imported: {len(added)} added, {len(updated)} updated, {len(skipped)} skipped"
    if errors:
        summary += f", {len(errors)} with problems"
    flash(summary + ".", "ok" if not errors else "error")
    IMPORT_REPORTS[current_user()["id"]] = {"added": added, "updated": updated, "skipped": skipped,
                                            "errors": errors}

    if added and f.get("announce"):
        shown = ", ".join(added[:8]) + (f" and {len(added) - 8} more" if len(added) > 8 else "")
        title = f"New game: {added[0]}" if len(added) == 1 else f"{len(added)} new games added"
        notify(title, shown, "/", kind="game")
    return redirect(url_for("admin", tab="import"))


@app.route("/admin/games/export")
@staff_required("games")
def admin_games_export():
    import json
    games = [
        {"name": g_["name"], "description": g_["description"], "genres": g_["genres"],
         "url": g_["url"] or (f"/g/{g_['file']}" if g_["file"] else ""), "image": g_["image"]}
        for g_ in game_rows()
    ]
    body = json.dumps(games, indent=2)
    return app.response_class(body, mimetype="application/json", headers={
        "Content-Disposition": f"attachment; filename=nova-games-{datetime.now():%Y-%m-%d}.json"})


@app.route("/admin/games/bulk-delete", methods=["POST"])
@staff_required("games")
def admin_games_bulk_delete():
    ids = [int(x) for x in request.form.getlist("ids") if x.isdigit()]
    for game_id in ids:
        game = db().execute("SELECT file FROM games WHERE id = ?", (game_id,)).fetchone()
        if game and game["file"]:
            remove_game_file(game["file"])
        db().execute("DELETE FROM games WHERE id = ?", (game_id,))
    db().commit()
    flash(f"Removed {len(ids)} game{'' if len(ids) == 1 else 's'}.", "ok")
    return redirect(url_for("admin", tab="games"))


@app.route("/admin/poll", methods=["POST"])
@staff_required("polls")
def admin_poll_create():
    question = request.form.get("question", "").strip()
    options = [o.strip() for o in request.form.get("options", "").splitlines() if o.strip()]
    if not question:
        flash("Polls need a question.", "error")
        return redirect(url_for("admin", tab="polls"))
    allow = 1 if request.form.get("allow_suggestions") else 0
    if not options and not allow:
        flash("Add some options or let people suggest their own.", "error")
        return redirect(url_for("admin", tab="polls"))
    cur = db().execute("INSERT INTO polls (question, allow_suggestions, created_at) VALUES (?, ?, ?)",
                       (question, allow, now()))
    for label in dict.fromkeys(options):
        db().execute("INSERT INTO poll_options (poll_id, label) VALUES (?, ?)", (cur.lastrowid, label[:80]))
    db().commit()
    flash("Poll created.", "ok")
    if request.form.get("announce"):
        notify(f"New poll: {question}", "Vote on what gets added next.", f"/polls#poll-{cur.lastrowid}",
               kind="poll")
    return redirect(url_for("admin", tab="polls"))


@app.route("/admin/poll/<int:poll_id>", methods=["POST"])
@staff_required("polls")
def admin_poll_action(poll_id):
    action = request.form.get("action")
    if action == "close":
        db().execute("UPDATE polls SET is_open = 0 WHERE id = ?", (poll_id,))
    elif action == "open":
        db().execute("UPDATE polls SET is_open = 1 WHERE id = ?", (poll_id,))
    elif action == "delete":
        db().execute("DELETE FROM polls WHERE id = ?", (poll_id,))
    elif action == "remove_option":
        db().execute("DELETE FROM poll_options WHERE id = ? AND poll_id = ?",
                     (request.form.get("option_id", type=int), poll_id))
    db().commit()
    return redirect(url_for("admin", tab="polls"))


@app.route("/admin/announce", methods=["POST"])
@staff_required("announce")
def admin_announce():
    title = request.form.get("title", "").strip()
    if not title:
        flash("Announcements need a title.", "error")
    else:
        peek = request.form.get("audience") == "pro"
        notify(title, request.form.get("body", "").strip(), request.form.get("link", "").strip(),
               email=bool(request.form.get("email")), kind="peek" if peek else "announce",
               audience="pro" if peek else "all")
        flash(("Sneak peek posted for Pro" if peek else "Announcement posted")
              + (" and emailed." if request.form.get("email") else "."), "ok")
    return redirect(url_for("admin", tab="announce"))


@app.route("/admin/notification/<int:note_id>/delete", methods=["POST"])
@staff_required("announce")
def admin_notification_delete(note_id):
    db().execute("DELETE FROM notifications WHERE id = ?", (note_id,))
    db().commit()
    return redirect(url_for("notifications"))


@app.errorhandler(403)
def forbidden(_e):
    return render_template("message.html", title="Not allowed", text="That page is for admins."), 403


@app.errorhandler(404)
def not_found(_e):
    return render_template("message.html", title="Not found", text="Nothing here."), 404


init_db()

def cli_make_owner(username):
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute("SELECT id FROM users WHERE username = ? COLLATE NOCASE OR lower(email) = lower(?)",
                       (username, username)).fetchone()
    if not row:
        sys.exit(f"No user called {username!r}.")
    conn.execute("UPDATE users SET role = '' WHERE role = 'owner'")
    conn.execute("UPDATE users SET role = 'owner', status = 'approved' WHERE id = ?", row)
    conn.commit()
    print(f"{username} is now the owner.")


def cli_reset_password(username):
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute("SELECT id FROM users WHERE username = ? COLLATE NOCASE OR lower(email) = lower(?)",
                       (username, username)).fetchone()
    if not row:
        sys.exit(f"No user called {username!r}.")
    temp = temp_password()
    conn.execute("UPDATE users SET password_hash = ?, must_change_pw = 1, reset_note = '', reset_at = '', "
                 "failed_logins = 0, locked_until = '' WHERE id = ?", (hash_password(temp), row[0]))
    conn.commit()
    print(f"Temporary password for {username}: {temp}")


if __name__ == "__main__" and sys.argv[1:] == ["export-data"]:
    cli_export_data()
    sys.exit()

if __name__ == "__main__" and len(sys.argv) == 3 and sys.argv[1] == "reset-password":
    cli_reset_password(sys.argv[2])
    sys.exit()

if __name__ == "__main__" and len(sys.argv) == 3 and sys.argv[1] == "make-owner":
    cli_make_owner(sys.argv[2])
    sys.exit()

if __name__ == "__main__":
    with app.app_context():
        if not owner_exists():
            print(f"\n  No owner yet. Go to /setup and use this setup code: {setup_code()}\n", flush=True)
    port = int(os.environ.get("PORT", "5050"))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG") == "1")
