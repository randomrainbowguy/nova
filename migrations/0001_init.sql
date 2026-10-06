-- Nova schema (same tables as the old Flask/SQLite version, plus chat).
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,  -- internal id; people log in with email
    name TEXT NOT NULL DEFAULT '',                 -- shown everywhere
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',        -- pending | approved | ignored | banned
    is_admin INTEGER NOT NULL DEFAULT 0,           -- legacy, replaced by role/perms
    role TEXT NOT NULL DEFAULT '',                 -- 'owner' or ''
    perms TEXT NOT NULL DEFAULT '',                -- comma list of PERMS keys
    email_opt_in INTEGER NOT NULL DEFAULT 1,
    reason TEXT DEFAULT '',
    ban_reason TEXT DEFAULT '',
    last_notif_seen INTEGER NOT NULL DEFAULT 0,
    last_popup_seen INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    last_seen TEXT,
    premium INTEGER NOT NULL DEFAULT 0,
    premium_since TEXT NOT NULL DEFAULT '',
    premium_note TEXT NOT NULL DEFAULT '',
    pro_claim TEXT NOT NULL DEFAULT '',
    pro_claim_at TEXT NOT NULL DEFAULT '',
    reset_note TEXT NOT NULL DEFAULT '',           -- "forgot password" request, '' = none
    reset_at TEXT NOT NULL DEFAULT '',
    must_change_pw INTEGER NOT NULL DEFAULT 0,     -- logged in with a temporary password
    failed_logins INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT NOT NULL DEFAULT '',
    chat_muted INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    genres TEXT DEFAULT '',
    image TEXT DEFAULT '',
    url TEXT DEFAULT '',
    file TEXT DEFAULT '',                          -- key of an uploaded HTML file in the GAME_FILES KV
    plays INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    early_until TEXT NOT NULL DEFAULT '',          -- Pro-only until this time (UTC), '' = public
    announce_on_release INTEGER NOT NULL DEFAULT 0
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
    allow_suggestions INTEGER NOT NULL DEFAULT 0,  -- unused: players can't add options
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
    kind TEXT NOT NULL DEFAULT 'announce',         -- game | poll | announce | peek
    title TEXT NOT NULL,
    body TEXT DEFAULT '',
    link TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    audience TEXT NOT NULL DEFAULT 'all'           -- all | pro
);
CREATE TABLE IF NOT EXISTS game_plays (
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    n INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (game_id, day)
);
CREATE TABLE IF NOT EXISTS visits (
    day TEXT NOT NULL,                             -- YYYY-MM-DD (UTC)
    visitor TEXT NOT NULL,                         -- 'u<id>' for accounts, 'v<cookie>' for guests
    user_id INTEGER,
    views INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (day, visitor)
);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS game_requests (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    link TEXT DEFAULT '',
    note TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',           -- open | added | declined
    reply TEXT DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_chat_id ON chat_messages(deleted, id);
CREATE INDEX IF NOT EXISTS idx_visits_visitor ON visits(visitor);
CREATE INDEX IF NOT EXISTS idx_plays_day ON game_plays(day);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('access_mode', 'approval'), ('site_name', 'Nova'), ('cashtag', ''), ('pro_price', '5'),
  ('monthly_cost', '15'), ('early_days', '3'), ('movies_doc', '');
