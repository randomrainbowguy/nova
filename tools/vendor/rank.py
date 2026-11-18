#!/usr/bin/env python3
"""Ranks the freebuisness/html games by how often they are played and writes tools/vendor/ranking.json.

    python3 tools/vendor/rank.py [--db nova.db]

"Played" = downloads of the game's HTML file from jsDelivr over the last year, for gn-math/html (the
original repo, ~140M hits/year) plus freebuisness/html (its mirror), added up per game number. Files
are renamed now and then (119.html -> 119-fix.html ...), so hits for every name a number ever had count
together. When a number has several files today, the one downloaded most this month wins (the others
are stale copies); ties go to the highest "-fixN".
Names and Nova ids come from nova.db where it knows the game; otherwise from the file's <title>.
"""
import argparse
import json
import os
import re
import sqlite3
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from vendor import SRC_REPO, SRC_SHA, api, http, log  # noqa: E402

STAT_REPOS = ["gn-math/html", "freebuisness/html"]


def stats(repo, period):
    out = {}
    for page in range(1, 20):
        for attempt in range(6):
            d = json.loads(http(f"https://data.jsdelivr.com/v1/stats/packages/gh/{repo}@main/files?period={period}&limit=100&page={page}"))
            if isinstance(d, list):
                break
            log(f"  jsDelivr stats {repo} {period} p{page}: {d.get('message', d)[:80]}; retrying")
            time.sleep(5 * (attempt + 1))
        if not isinstance(d, list):
            raise SystemExit(f"jsDelivr stats unavailable for {repo} ({period})")
        if not d:
            break
        for e in d:
            out[e["name"].lstrip("/")] = out.get(e["name"].lstrip("/"), 0) + e["hits"]["total"]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.path.join(HERE, "..", "..", "nova.db"))
    ap.add_argument("--out", default=os.path.join(HERE, "ranking.json"))
    args = ap.parse_args()

    year, month = {}, {}
    for repo in STAT_REPOS:
        for name, h in stats(repo, "year").items():
            year[name] = year.get(name, 0) + h
        for name, h in stats(repo, "month").items():
            month[name] = month.get(name, 0) + h
    hits = {}
    for name, h in year.items():
        m = re.match(r"^(\d+)", name)
        if m:
            hits[int(m.group(1))] = hits.get(int(m.group(1)), 0) + h

    tree = api(f"repos/{SRC_REPO}/git/trees/{SRC_SHA}")
    files = {}
    for e in tree["tree"]:
        m = re.match(r"^(\d+)(?:-.*)?\.html$", e["path"])
        if m and e["type"] == "blob":
            files.setdefault(int(m.group(1)), []).append(e["path"])

    names, ids = {}, {}
    if os.path.exists(args.db):
        db = sqlite3.connect(args.db)
        for gid, name, url in db.execute("SELECT id, name, url FROM games"):
            m = re.search(rf"{SRC_REPO}@[^/]+/(\d+)", url or "")
            if m and int(m.group(1)) not in names:
                names[int(m.group(1))], ids[int(m.group(1))] = name, gid

    def fixn(f):
        m = re.search(r"(\d+)\.html$", f.split("-", 1)[1] if "-" in f else "")
        return int(m.group(1)) if m else (1 if "-" in f else 0)

    ranking = []
    for num, h in sorted(hits.items(), key=lambda kv: -kv[1]):
        if num not in files:
            continue   # deleted upstream
        best = max(files[num], key=lambda f: (month.get(f, 0), fixn(f)))
        name = names.get(num)
        if not name:
            t = http(f"https://raw.githubusercontent.com/{SRC_REPO}/{SRC_SHA}/{best}")
            m = re.search(r"<title[^>]*>(.*?)</title>", t, re.I | re.S)
            name = re.sub(r"\s+", " ", m.group(1)).strip() if m else f"Game {num}"
        ranking.append({"num": num, "hits": h, "file": best, "other_files": [f for f in files[num] if f != best],
                        "name": name, "nova_id": ids.get(num)})
    json.dump(ranking, open(args.out, "w"), indent=1, ensure_ascii=False)
    log(f"Wrote {args.out}: {len(ranking)} games; top 5: {[(r['num'], r['name']) for r in ranking[:5]]}")


if __name__ == "__main__":
    main()
