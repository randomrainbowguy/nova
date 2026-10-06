// The Worker sets up its own database: on the first request after a deploy it runs
// migrations/*.sql (every statement is idempotent), so a fresh D1 database just works.

import init from "../../migrations/0001_init.sql";

const MIGRATIONS = [init];
let ready = null;

function statements(sql) {
  return sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
    .split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);
}

async function migrate(db) {
  const have = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'chat_messages'").first();
  if (have) return;
  for (const sql of MIGRATIONS) await db.batch(statements(sql).map((s) => db.prepare(s)));
}

/** Runs once per Worker instance. */
export function ensureSchema(db) {
  ready ||= migrate(db).catch((e) => { ready = null; throw e; });
  return ready;
}

/** A value kept in the settings table, created the first time it's asked for (secret key, setup code). */
export async function storedSecret(db, key, make) {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first();
  if (row) return row.value;
  const value = make();
  await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").bind(key, value).run();
  return (await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first()).value;
}
