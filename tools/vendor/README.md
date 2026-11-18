# vendor — games copied into this repo

The most-played games from [freebuisness/html](https://github.com/freebuisness/html) (a mirror of
gn-math/html), together with every file they load from other GitHub repos, copied into
`standalone/games/` and `standalone/vendor/`. A copied game needs nothing outside this repo: no
third-party repo can rename, delete or outgrow its files and break the game.

```
standalone/games/<n>.html                       the game, URLs rewritten to this repo
standalone/vendor/<owner>/<repo>/<commit7>/...  its files (shared between games that use the same repo)
standalone/vendor/covers/<n>.jpg                its cover (640 px, from freebuisness/covers)
standalone/vendor/manifest.json                 every game: files, sizes, sources, check result, notes
```

`<n>` is the game's number in freebuisness/html (`27-fix2.html` → `27`).

## Commands

```sh
python3 tools/vendor/rank.py                 # ranking.json: games by jsDelivr downloads over the last year
python3 tools/vendor/vendor.py --top 300     # copy the top 300 (re-runnable; only new files are downloaded)
python3 tools/vendor/vendor.py --dry-run --top 300   # plan only: sizes, what would be skipped
python3 tools/vendor/covers.py               # covers for the copied games
python3 tools/vendor/verify.py --fix         # run every copied game in headless Chrome; copy what it asked
                                             # for that the copy lacked; run it again
python3 standalone/build-games.py            # games.json: copied games verified "ok" load from here
```

`verify.py` needs `cd tools/gametest && npm install` once (uses the installed Google Chrome).

## How vendor.py finds a game's files

1. Every URL in the game's HTML that points at a GitHub repo (jsDelivr `gh/`, githack,
   raw.githubusercontent, statically, github.com blob/raw) is resolved against that repo's file tree at
   that commit (branch names are pinned to the commit of the day the copy was made).
2. A file is copied as is. A folder (the `<base href>` of a Unity build, say) is copied whole when it is
   under 48 MB; a bigger one contributes only the entries the game names, plus files derived from those
   names (`x.data` → `x.data.br`, `x.data.part0` …).
3. Copied `.js/.css/.json/.html` files are scanned the same way, so loaders that fetch more files are
   followed.
4. The game's HTML and the copied text files get every repo URL rewritten to
   `https://cdn.jsdelivr.net/gh/randomrainbowguy/nova@overnight/standalone/vendor/<owner>/<repo>/<commit7>/…`.
   The hub (`standalone/hub.js`, `localize()`) swaps that prefix for whatever address it is running from:
   the pinned commit, a jsDelivr mirror, or a local checkout. Files over 20 MB (jsDelivr's limit) are
   written against `raw.githubusercontent.com/randomrainbowguy/nova/overnight/…` instead; GitHub's own
   limit is 100 MB, and a game needing a bigger file is skipped.
5. A small script is put first in every copied game (`RUNTIME_MAP` in vendor.py): any repo URL the game
   builds at run time (many loaders are obfuscated) is redirected to the copy, for fetch, XHR, Worker,
   script/img/audio/video/link/iframe sources, setAttribute, document.write and innerHTML.
6. `verify.py` runs the game and records every request that still went to another repo and every
   missing file under the copy, in `tools/vendor/extras.json`; with `--fix`, vendor.py copies those too.

## Why not just link the other repos

The games were loading from ~120 repos belonging to other people. Several were already gone (deleted
or blocked on GitHub: Hollow Knight, Plants vs Zombies, Angry Birds, Johnny Trigger …), others get
renamed or outgrow jsDelivr's limits, and each one is a point of failure outside our control.

## Limits worth knowing

- jsDelivr serves single files from a GitHub repo of any size (tested on 2–6 GB repos), but refuses
  files over 20 MB. raw.githubusercontent.com serves files up to 100 MB but marks `.js`/`.css` as plain
  text, which browsers refuse to run; that is why only data files go through it.
- Some games also talk to non-GitHub hosts (their own servers, ad SDKs): `foreign_hosts` in the manifest.
  Those cannot be copied.
- `tools/vendor/.cache/` (API answers, downloaded source HTML, check results and screenshots) is
  git-ignored.
