"""Copy everything from the old Flask database (nova.db) into a SQL file D1 can import.

    python3 scripts/export-to-d1.py            # reads nova.db, writes scripts/nova-data.sql
    npx wrangler d1 execute nova --remote --file scripts/nova-data.sql
    (or upload it on the new site's /setup page, before anyone has made an owner account)

The SQL file has everyone's emails and password hashes - it's in .gitignore, keep it private.
It replaces everything in the new database (users, games, polls...), so run it on a fresh site.
"""

import json
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "nova.db")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "nova-data.sql")
# Broken games found by tools/gametest: new working links, and games that couldn't be fixed.
DECISIONS = os.path.join(HERE, "..", "tools", "gametest", "decisions.json")

# Parents before children, so foreign keys line up.
TABLES = ["settings", "users", "games", "polls", "poll_options", "votes", "favorites", "notifications",
          "game_plays", "visits", "game_requests"]


def quote(value):
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return repr(value)
    # One statement per line: newlines inside text become char(10) so the file can be split by line.
    text = "'" + str(value).replace("'", "''") + "'"
    return text.replace("\r\n", "\n").replace("\r", "\n").replace("\n", "' || char(10) || '")


def main():
    src = sqlite3.connect(SRC)
    src.row_factory = sqlite3.Row
    have = {r[0] for r in src.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    lines = ["PRAGMA defer_foreign_keys = true;"]
    for table in reversed(TABLES):
        # keep the new site's own secret key and setup code
        lines.append("DELETE FROM settings WHERE key NOT IN ('secret_key', 'setup_code');" if table == "settings"
                     else f"DELETE FROM {table};")
    counts = {}
    for table in TABLES:
        if table not in have:
            continue
        cols = [r[1] for r in src.execute(f"PRAGMA table_info({table})")]
        n = 0
        for row in src.execute(f"SELECT {', '.join(cols)} FROM {table}"):
            values = ", ".join(quote(row[c]) for c in cols)
            verb = "INSERT OR REPLACE" if table == "settings" else "INSERT"
            lines.append(f"{verb} INTO {table} ({', '.join(cols)}) VALUES ({values});")
            n += 1
        counts[table] = n
    if os.path.exists(DECISIONS):
        with open(DECISIONS, encoding="utf-8") as f:
            decisions = json.load(f)
        for r in decisions.get("replace", []):
            lines.append(f"UPDATE games SET url = {quote(r['new_url'])} WHERE id = {int(r['id'])} AND url = {quote(r['old_url'])};")
        for r in decisions.get("remove", []):
            lines.append(f"DELETE FROM games WHERE id = {int(r['id'])};")
        print(f"  game fixes: {len(decisions.get('replace', []))} new links, {len(decisions.get('remove', []))} broken games removed")
    # Games that pointed at the old self-hosted emulator file now use the EmulatorJS page in /public.
    lines.append("UPDATE games SET url = '/emulator/', file = '' WHERE file = 'emulator.html';")
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"Wrote {OUT}")
    for table, n in counts.items():
        print(f"  {table}: {n}")


if __name__ == "__main__":
    main()
