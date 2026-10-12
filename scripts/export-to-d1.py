"""Copy everything from the old Flask database (nova.db) into a SQL file D1 can import.

    python3 scripts/export-to-d1.py            # reads nova.db, writes scripts/nova-data.sql
    npx wrangler d1 execute nova --remote --file scripts/nova-data.sql
    (or upload it on the new site's /setup page, before anyone has made an owner account)

The SQL file has everyone's emails and password hashes - it's in .gitignore, keep it private.
It replaces everything in the new database (users, games, polls...), so run it on a fresh site.
"""

import json
import os
import re
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "nova.db")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "nova-data.sql")
# Broken games found by tools/gametest: new working links, and games that couldn't be fixed.
DECISIONS = os.path.join(HERE, "..", "tools", "gametest", "decisions.json")

# Upstream repos rename and delete files (freebuisness renamed most of theirs on 2026-10-11), so every
# link is pinned to the commit the games were tested at (tools/gametest). Their changes can't break us.
PINS = {
    "freebuisness/html": "b329f92bab254daca7abce41facb94884b02834d",
    "freebuisness/covers": "298e9bedbc2ae3d7257bb67f28752a4c151ba5f8",
    "CorduroyBrick49/Games": "38c8fabee53bd919875e4845df1bfacff6d6d426",
}


def pin(url):
    url = url or ""
    for repo, sha in PINS.items():
        url = re.sub(rf"^https://cdn\.jsdelivr\.net/gh/{repo}@main/", f"https://cdn.jsdelivr.net/gh/{repo}@{sha}/", url)
        url = re.sub(rf"^https://raw\.githubusercontent\.com/{repo}/(?:refs/heads/)?main/",
                     f"https://raw.githubusercontent.com/{repo}/{sha}/", url)
        url = re.sub(rf"^https://github\.com/{repo}/(?:blob|raw)/main/([^?]+)(?:\?raw=true)?$",
                     rf"https://raw.githubusercontent.com/{repo}/{sha}/\1", url)
    return url


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
            values = ", ".join(quote(pin(row[c]) if table == "games" and c in ("url", "image") else row[c]) for c in cols)
            verb = "INSERT OR REPLACE" if table == "settings" else "INSERT"
            lines.append(f"{verb} INTO {table} ({', '.join(cols)}) VALUES ({values});")
            n += 1
        counts[table] = n
    if os.path.exists(DECISIONS):
        with open(DECISIONS, encoding="utf-8") as f:
            decisions = json.load(f)
        for r in decisions.get("replace", []):
            lines.append(f"UPDATE games SET url = {quote(pin(r['new_url']))} WHERE id = {int(r['id'])} AND url = {quote(pin(r['old_url']))};")
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
