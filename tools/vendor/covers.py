#!/usr/bin/env python3
"""Copies the cover of every game in standalone/vendor/manifest.json into standalone/vendor/covers/
(<number>.jpg, 640 px wide, made with macOS `sips`; the originals in freebuisness/covers go up to 12 MB).

    python3 tools/vendor/covers.py
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from vendor import COVERS_REPO, COVERS_SHA, STANDALONE, CACHE, http, log  # noqa: E402


def main():
    manifest = json.load(open(os.path.join(STANDALONE, "vendor", "manifest.json")))
    out_dir = os.path.join(STANDALONE, "vendor", "covers")
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(os.path.join(CACHE, "covers"), exist_ok=True)
    n = missing = 0
    for num, g in manifest["games"].items():
        if not g["status"].startswith("ok"):
            continue
        out = os.path.join(out_dir, f"{num}.jpg")
        if os.path.exists(out):
            g["cover"] = f"vendor/covers/{num}.jpg"
            continue
        src = os.path.join(CACHE, "covers", f"{num}.png")
        if not os.path.exists(src):
            try:
                open(src, "wb").write(http(f"https://raw.githubusercontent.com/{COVERS_REPO}/{COVERS_SHA}/{num}.png", binary=True))
            except Exception as e:  # noqa
                log(f"#{num}: no cover ({str(e)[:60]})")
                missing += 1
                continue
        r = subprocess.run(["sips", "-Z", "640", "-s", "format", "jpeg", "-s", "formatOptions", "82", src, "--out", out], capture_output=True, text=True)
        if r.returncode != 0 or not os.path.exists(out):
            log(f"#{num}: sips failed: {r.stderr.strip()[:80]}")
            missing += 1
            continue
        g["cover"] = f"vendor/covers/{num}.jpg"
        n += 1
    json.dump(manifest, open(os.path.join(STANDALONE, "vendor", "manifest.json"), "w"), indent=1, ensure_ascii=False)
    log(f"covers: {n} made, {missing} missing -> {out_dir}")


if __name__ == "__main__":
    main()
