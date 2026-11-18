#!/usr/bin/env python3
"""Runs every copied game through tools/gametest (headless Chrome, files served from this checkout)
and records the result in standalone/vendor/manifest.json ("verified": ok | black | stuck_loading |
error | fetch_failed, plus "verify_reason" and "verify_errors"). Only games verified "ok" go into
games.json (see standalone/build-games.py).

While a game runs, the harness also notes every request that still went to another repo (a URL the
copy missed, e.g. built at run time) and every missing file under the copy. Those go to
tools/vendor/extras.json; with --fix, vendor.py copies them and the game is checked again.

    python3 tools/vendor/verify.py [--games 27,33] [--concurrency 6] [--scale 2] [--retry-failed] [--fix] [--rounds 2]

Needs tools/gametest set up (cd tools/gametest && npm install) and Google Chrome.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from vendor import STANDALONE, ROOT, CACHE, EXTRAS_PATH, load_extras, log  # noqa: E402

NODE = os.path.expanduser("~/.local/node/bin/node") if os.path.exists(os.path.expanduser("~/.local/node/bin/node")) else "node"
PORT = 8765
VENDOR = f"http://localhost:{PORT}/standalone/"
IGNORE_MISSING = re.compile(r"\.(ini|dat|sav|save)$|savedata|optiondata|favicon|/\.well-known/", re.I)


def run_harness(games, args, tag):
    out = os.path.join(CACHE, f"verify-results-{tag}.json")
    if args.reuse and os.path.exists(out):
        log(f"reusing {out}")
        return {r["id"]: r for r in json.load(open(out))}
    urls = [{"id": g["num"], "name": g["name"], "url": VENDOR + g["html"]} for g in games]
    os.makedirs(CACHE, exist_ok=True)
    ulist = os.path.join(CACHE, f"verify-urls-{tag}.json")
    json.dump(urls, open(ulist, "w"))
    out = os.path.join(CACHE, f"verify-results-{tag}.json")
    cmd = [NODE, "run.js", "--urls", ulist, "--out", out, "--shots", os.path.join(CACHE, "shots"), "--port", str(PORT),
           "--vendor", VENDOR, "--sanitizer", os.path.join(ROOT, "public", "static", "game-sanitize.js"),
           "--concurrency", args.concurrency, "--scale", args.scale]
    log("running:", " ".join(cmd))
    subprocess.run(cmd, cwd=os.path.join(ROOT, "tools", "gametest"), check=True)
    return {r["id"]: r for r in json.load(open(out))}


def extras_from(result):
    """URLs to copy for one game: leaks as they are, missing vendor files mapped back to their repo."""
    out = set(result.get("leaks") or [])
    for u in result.get("missing") or []:
        rel = urllib.parse.unquote(u[len(VENDOR):].split("?")[0])
        m = re.match(r"vendor/([^/]+)/([^/]+)/([0-9a-f]{7})/(.+)$", rel)
        if not m or IGNORE_MISSING.search(rel):
            continue
        out.add(f"https://cdn.jsdelivr.net/gh/{m.group(1)}/{m.group(2)}@{m.group(3)}/{urllib.parse.quote(m.group(4))}")
    return sorted(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--games", help="only these numbers")
    ap.add_argument("--concurrency", default="6")
    ap.add_argument("--scale", default="1")
    ap.add_argument("--retry-failed", action="store_true", help="only games not yet verified ok")
    ap.add_argument("--fix", action="store_true", help="copy what the run found missing and check those games again")
    ap.add_argument("--rounds", type=int, default=2)
    ap.add_argument("--reuse", action="store_true", help="use an existing round result file instead of running it again")
    args = ap.parse_args()
    mpath = os.path.join(STANDALONE, "vendor", "manifest.json")
    manifest = json.load(open(mpath))
    games = [g for g in manifest["games"].values() if g["status"].startswith("ok") and g.get("html")]
    if args.games:
        want = {int(x) for x in args.games.split(",")}
        games = [g for g in games if g["num"] in want]
    if args.retry_failed:
        games = [g for g in games if g.get("verified") != "ok"]

    for rnd in range(1, args.rounds + 1):
        if not games:
            break
        results = run_harness(games, args, f"r{rnd}")
        extras = load_extras()
        changed = []
        counts = {}
        for g in games:
            r = results.get(g["num"])
            if not r:
                continue
            g["verified"], g["verify_reason"], g["verify_errors"] = r["status"], r.get("reason", ""), r.get("errors", [])[:8]
            g["leaks"], g["missing"] = (r.get("leaks") or [])[:40], (r.get("missing") or [])[:40]
            g["self_contained"] = not r.get("leaks")   # still asked another repo for something?
            counts[r["status"]] = counts.get(r["status"], 0) + 1
            new = [u for u in extras_from(r) if u not in extras.get(g["num"], [])]
            if new:
                extras[g["num"]] = sorted(set(extras.get(g["num"], [])) | set(new))
                changed.append(g)
        json.dump(manifest, open(mpath, "w"), indent=1, ensure_ascii=False)
        json.dump({str(k): v for k, v in sorted(extras.items())}, open(EXTRAS_PATH, "w"), indent=1)
        log(f"round {rnd}: {counts}; {len(changed)} game(s) asked for files the copy lacks -> {EXTRAS_PATH}")
        if not args.fix or not changed or rnd == args.rounds:
            break
        nums = ",".join(str(g["num"]) for g in changed)
        subprocess.run([sys.executable, "-I", os.path.join(HERE, "vendor.py"), "--games", nums], check=True)
        manifest = json.load(open(mpath))
        games = [manifest["games"][str(g["num"])] for g in changed]
        games = [g for g in games if g["status"].startswith("ok") and g.get("html")]   # some may have outgrown the cap
    log("done ->", mpath)


if __name__ == "__main__":
    main()
