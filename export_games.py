"""Build one standalone HTML file with every game in nova.db, to share without the site.

    .venv/bin/python export_games.py [output.html]

Games load from their original links, so the file needs internet but no server.
Pro early-access games are left out until they're public.
"""
import html
import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("NOVA_DB", os.path.join(BASE_DIR, "nova.db"))
GITHUB_BLOB = re.compile(r"^https?://github\.com/([^/]+)/([^/]+)/(?:blob|raw)/(.+?)(?:\?.*)?$")
RAW_HOSTS = ("raw.githubusercontent.com", "gist.githubusercontent.com")


def raw_github(url):
    m = GITHUB_BLOB.match(url or "")
    return f"https://raw.githubusercontent.com/{m[1]}/{m[2]}/{m[3]}" if m else None


def game_entry(row):
    entry = {"n": row["name"], "g": [g.strip() for g in (row["genres"] or "").split(",") if g.strip()],
             "i": raw_github(row["image"]) or row["image"] or ""}
    if row["file"]:
        # Uploaded games live on the Nova server, so put the whole file inside this one.
        with open(os.path.join(BASE_DIR, "games", row["file"]), encoding="utf-8") as f:
            entry["h"] = f.read()
        return entry
    raw = raw_github(row["url"])
    host = re.sub(r"^https?://", "", row["url"] or "").split("/", 1)[0].lower()
    if raw or host in RAW_HOSTS:
        entry["r"] = raw or row["url"]  # served as plain text: fetch it and run it
    else:
        entry["u"] = row["url"]
    return entry


def main(out_path):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    site = (conn.execute("SELECT value FROM settings WHERE key = 'site_name'").fetchone() or ["Nova"])[0]
    rows = conn.execute("SELECT * FROM games WHERE early_until = '' OR early_until <= ? "
                        "ORDER BY name COLLATE NOCASE", (now,)).fetchall()
    games = [game_entry(r) for r in rows if r["url"] or r["file"]]
    data = json.dumps(games, separators=(",", ":")).replace("</", "<\\/")
    with open(os.path.join(BASE_DIR, "export_template.html"), encoding="utf-8") as f:
        page = f.read()
    page = page.replace("{{SITE}}", html.escape(site)).replace("{{DATA}}", data)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(page)
    print(f"Wrote {len(games)} games to {out_path} ({os.path.getsize(out_path) // 1024} KB)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(BASE_DIR, "nova-games.html"))
