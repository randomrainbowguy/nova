"""Writes standalone/games.json (the standalone hub's game list) from nova.db.

    python3 standalone/build-games.py [path/to/nova.db]

Applies tools/gametest/decisions.json (fixed links, removed broken games), skips Pro early-access
games, and points the emulator at EmulatorJS in this repo (served by jsDelivr).
Only game info goes in the file - no accounts or anything private.
"""
import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
DB = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "nova.db")
EMU_URL = "https://cdn.jsdelivr.net/gh/randomrainbowguy/nova@overnight/public/emulator/index.html"
RAW_HOSTS = ("raw.githubusercontent.com", "gist.githubusercontent.com", "cdn.jsdelivr.net", "rawcdn.githack.com")


def main():
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    since = (datetime.now(timezone.utc).date() - timedelta(days=13)).isoformat()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    rows = db.execute(
        "SELECT g.*, COALESCE((SELECT SUM(n) FROM game_plays p WHERE p.game_id = g.id AND p.day >= ?), 0) AS recent "
        "FROM games g WHERE g.early_until = '' OR g.early_until <= ? "
        "ORDER BY recent DESC, plays DESC, name COLLATE NOCASE", (since, now)).fetchall()
    with open(os.path.join(HERE, "..", "tools", "gametest", "decisions.json"), encoding="utf-8") as f:
        decisions = json.load(f)
    remove = {r["id"] for r in decisions["remove"]}
    replace = {r["id"]: r["new_url"] for r in decisions["replace"]}
    games = []
    for r in rows:
        if r["id"] in remove:
            continue
        url = replace.get(r["id"], r["url"])
        if r["file"] == "emulator.html" or url == "/emulator/":
            url = EMU_URL
        # freebuisness games load straight from the GitHub repo instead of through jsDelivr.
        url = re.sub(r"^https://cdn\.jsdelivr\.net/gh/freebuisness/html@([^/]+)/",
                     r"https://raw.githubusercontent.com/freebuisness/html/\1/", url or "")
        if re.sub(r"^https?://", "", url or "").split("/")[0].lower() not in RAW_HOSTS:
            continue  # the hub only runs games that load from a code repo
        games.append({"id": r["id"], "name": r["name"], "description": r["description"] or "",
                      "genres": [g.strip() for g in (r["genres"] or "").split(",") if g.strip()],
                      "image": r["image"] or "", "url": url, "rank": len(games)})
    out = os.path.join(HERE, "games.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(games, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {out}: {len(games)} games")


if __name__ == "__main__":
    main()
