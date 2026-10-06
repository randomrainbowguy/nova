# gametest — headless check of every game

Loads each game exactly the way the site does (fetch the HTML → `sanitizeGameHtml()` from
`static/game-sanitize.js` → Blob → `<iframe src=blob:…>`), in headless Google Chrome, and classifies it.

## Setup (once)

```sh
export PATH=~/.local/node/bin:$PATH
cd tools/gametest && npm install        # playwright-core + pngjs; uses the installed Google Chrome
```

## Run

```sh
node run.js                              # all games in ../../nova.db (read-only), 7–8 at a time, ~40 min
node run.js --ids 55,397                 # just some ids
node run.js --sanitize 0                 # the old behaviour (only the <base> tag) for comparison
node run.js --scale 2                    # double every wait (slow / huge games)
node run.js --override 397=https://…     # try a different URL for a game
node run.js --sanitizer other.js         # test an alternative sanitizer file
```

Options: `--concurrency N` (default 8), `--out results.json`, `--shots DIR` (last screenshot of every
game, plus an early one for failures), `--port`, `--db`, `--urls list.json` (array of {id,name,url}).

Per game: wait 4 s and 8 s (screenshots), click an HTML "Play/Start" button if there is one, click the
centre, press Space and Enter, then screenshots at ~12, 16 and 19 s. Status:

* `ok` — content on screen (`reason` says `animated`, or `static frame` = never changed: usually a menu)
* `black` — the last three frames are one flat colour
* `stuck_loading` — visible "loading/NN%" text or a loading bar at the end and earlier, frame not moving
* `error` — flat frame plus an uncaught page error (or the page hung / navigated away)
* `fetch_failed` — the HTML itself couldn't be downloaded

The classifier is a heuristic: it flags slow loaders (multi-hundred-MB Unity/emulator games) and games
that need a real click as failures. Always look at the screenshots before removing a game.

## Helpers

* `node compare.js before.json after.json` — what got fixed / broken between two runs
* `node contact.js out.png SHOTS_DIR id id …` or `--results results.json --status black,error` —
  contact sheet of screenshots
* `node debug.js <game url> [--wait 30] [--click | --click X,Y] [--all] [--sanitize 0] [--headed]` —
  every console message, page error, failed request and worker for one game, plus a screenshot
* `node reclassify.js results.json [out.json]` — re-apply the current rules to stored metrics
* `node server.js` — serve the harness page at http://localhost:8765/?url=<game url>&sanitize=1
  (`&top=1` runs the game as the top-level page instead of in an iframe)

## Files

* `results.json` — last full run with the sanitizer: `{id, name, url, status, reason, errors[], metrics, diffs}`
* `decisions.json` — `replace` (new URL per game), `remove`, `sanitizer_fixed` (ids that only work
  thanks to the sanitizer)
