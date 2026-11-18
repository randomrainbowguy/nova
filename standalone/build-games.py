"""Writes standalone/games.json (the standalone hub's game list) from nova.db.

    python3 standalone/build-games.py [path/to/nova.db]

Applies tools/gametest/decisions.json (fixed links, removed broken games), skips Pro early-access
games, and points the emulator at EmulatorJS in this repo (served by jsDelivr).
Games copied into this repo by tools/vendor (standalone/vendor/manifest.json, verified "ok") load from
here ("nova:games/<n>.html") and come first, ordered by how much they are played; a Nova game that has
a copy keeps its id, the rest get ids from 200000 + their freebuisness number.
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
# Covers of copied games, written the way tools/vendor writes URLs (the hub swaps this for its own address).
VENDOR_URL = "https://cdn.jsdelivr.net/gh/randomrainbowguy/nova@overnight/standalone/"
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
    # Games kept in this repo (standalone/games/). "nova:" means "next to games.json"; the hub fills
    # in the address, so they load from the same commit as everything else.
    local = {698: "games/2351.html"}
    # Games with a site lock that blacks them out on about:blank; the hub runs these walled off.
    walled = {698}
    # freebuisness is no longer used: games that have a copy in g4m3sss load from there, the rest are
    # dropped, and games only in g4m3sss are added (see g4m3sss.json).
    with open(os.path.join(HERE, "g4m3sss.json"), encoding="utf-8") as f:
        g4 = json.load(f)
    g4_base = f"https://raw.githubusercontent.com/randomrainbowguy/g4m3sss/{g4['commit']}/offline/"
    g4_match = {int(k): v for k, v in g4["match"].items()}
    # Games that exist in both repos load from CorduroyBrick49 (see prefer-corduroy.json).
    with open(os.path.join(HERE, "prefer-corduroy.json"), encoding="utf-8") as f:
        corduroy = {int(k): v["file"] for k, v in json.load(f)["games"].items()}
    replace = {r["id"]: r["new_url"] for r in decisions["replace"]}
    # Games copied into this repo (tools/vendor), by freebuisness number; only the ones that passed the check.
    vendored = {}
    mpath = os.path.join(HERE, "vendor", "manifest.json")
    if os.path.exists(mpath):
        with open(mpath, encoding="utf-8") as f:
            vendored = {int(k): v for k, v in json.load(f)["games"].items() if v.get("verified") == "ok" and v.get("html")}
    def fb_number(url):
        m = re.search(r"freebuisness/html@[^/]+/(\d+)", url or "")
        return int(m.group(1)) if m else None
    games = []
    seen_nums = set()
    for r in rows:
        if r["id"] in remove:
            continue
        url = replace.get(r["id"], r["url"])
        num = fb_number(r["url"]) or fb_number(url)
        hits = 0
        if r["id"] in local:
            url = "nova:" + local[r["id"]]
        elif num in vendored:
            url, hits = "nova:" + vendored[num]["html"], vendored[num]["hits"]
            seen_nums.add(num)
        elif r["id"] in corduroy:
            url = f"https://raw.githubusercontent.com/CorduroyBrick49/Games/main/{corduroy[r['id']]}"
        elif r["id"] in g4_match:
            url = g4_base + g4_match[r["id"]]
        elif "freebuisness/html" in (url or ""):
            continue  # no longer offered
        if r["file"] == "emulator.html" or url == "/emulator/":
            url = EMU_URL
        # freebuisness games load straight from the GitHub repo instead of through jsDelivr.
        url = re.sub(r"^https://cdn\.jsdelivr\.net/gh/freebuisness/html@([^/]+)/",
                     r"https://raw.githubusercontent.com/freebuisness/html/\1/", url or "")
        if not url.startswith("nova:") and re.sub(r"^https?://", "", url or "").split("/")[0].lower() not in RAW_HOSTS:
            continue  # the hub only runs games that load from a code repo
        image = pin(r["image"])
        if num in vendored and vendored[num].get("cover"):
            image = VENDOR_URL + vendored[num]["cover"]
        games.append({"id": r["id"], "name": r["name"], "description": r["description"] or "",
                      "genres": [g.strip() for g in (r["genres"] or "").split(",") if g.strip()],
                      "image": image, "url": pin(url), "rank": len(games), "_recent": r["recent"], "_hits": hits, "_plays": r["plays"],
                      **({"walled": True} if r["id"] in walled else {})})
    for i, n in enumerate(g4["new"]):  # games only in g4m3sss; ids above any Nova game id
        games.append({"id": 100000 + i, "name": n["name"], "description": "", "genres": [], "image": n.get("image", ""),
                      "url": g4_base + n["file"], "rank": len(games), "_recent": 0, "_hits": 0, "_plays": 0})
    for num, v in vendored.items():  # copied games Nova didn't have yet
        if num in seen_nums:
            continue
        games.append({"id": 200000 + num, "name": v["name"], "description": "", "genres": [],
                      "image": VENDOR_URL + v["cover"] if v.get("cover") else "", "url": "nova:" + v["html"],
                      "rank": len(games), "_recent": 0, "_hits": v["hits"], "_plays": 0})
    # Order: what Nova's players opened lately, then by plays everywhere (jsDelivr hits), then Nova plays.
    games.sort(key=lambda g: (-g["_recent"], -g["_hits"], -g["_plays"], g["name"].lower()))
    for i, g in enumerate(games):
        g["rank"] = i
        for k in ("_recent", "_hits", "_plays"):
            del g[k]
    out = os.path.join(HERE, "games.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(games, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {out}: {len(games)} games")


if __name__ == "__main__":
    main()
