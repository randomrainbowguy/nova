#!/bin/sh
# Commits and pushes the copied games in pieces. GitHub refuses a single push over 2 GB, and
# standalone/vendor is bigger than that, so each commit holds about 1.2 GB and is pushed on its own.
#
#   sh tools/vendor/push-batches.sh [branch]      (default: the current branch)
#
# Safe to re-run: it only touches standalone/games, standalone/vendor and the tool files listed below.
set -e
cd "$(dirname "$0")/../.."
BRANCH=${1:-$(git rev-parse --abbrev-ref HEAD)}
LIMIT=$((1200 * 1024 * 1024))

# 1. the code (small)
git add .gitignore standalone/build-games.py standalone/hub.js standalone/games.json \
        tools/gametest/harness.html tools/gametest/run.js tools/gametest/server.js tools/vendor/*.py tools/vendor/*.sh \
        tools/vendor/README.md tools/vendor/ranking.json tools/vendor/extras.json standalone/vendor/manifest.json \
        standalone/vendor/covers 2>/dev/null || true
if ! git diff --cached --quiet; then
  git commit -q -m "Vendor: copy the most-played games and their files into this repo

tools/vendor copies the top games from freebuisness/html, with every file they load
from other GitHub repos, into standalone/games and standalone/vendor, and rewrites
them to load from here. The hub maps those URLs to wherever it runs from.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  git push -q origin "HEAD:$BRANCH"
  echo "pushed: code, manifest, covers"
fi

# 2. the games and their files, in batches
n=0; size=0; batch=1
git ls-files --others --exclude-standard -z standalone/games standalone/vendor | while IFS= read -r -d '' f; do
  s=$(stat -f %z "$f" 2>/dev/null || stat -c %s "$f")
  git add -- "$f"
  size=$((size + s)); n=$((n + 1))
  if [ "$size" -ge "$LIMIT" ]; then
    git commit -q -m "Vendor: game files, batch $batch ($n files)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
    git push -q origin "HEAD:$BRANCH"
    echo "pushed batch $batch: $n files, $((size / 1024 / 1024)) MB"
    batch=$((batch + 1)); n=0; size=0
  fi
done
if ! git diff --cached --quiet; then
  git commit -q -m "Vendor: game files, last batch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  git push -q origin "HEAD:$BRANCH"
  echo "pushed last batch"
fi
echo "done. jsDelivr may take up to 12 h to see @$BRANCH; the tiny launcher reads the newest commit, so it sees it at once."
