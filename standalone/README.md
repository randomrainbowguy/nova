# Standalone Nova

A version of Nova that runs from **one tiny HTML file** (under 1 KB) with no server and no logins.
The file only knows this folder's address; everything else loads from this repo through
**raw.githubusercontent.com** (GitHub's own file server). Nothing loads from jsDelivr.

raw.githubusercontent.com sends `.js`, `.css` and `.html` as `text/plain` (and `.wasm` as
`application/octet-stream`) with `nosniff`, so the browser won't run them from a plain `<script src>`.
Images, audio, `fetch()` and XHR are fine. So:
- `index.html` downloads `hub.html` and puts its scripts and stylesheets into the page inline.
- `hub.js` turns every jsDelivr GitHub link (`cdn.jsdelivr.net/gh/user/repo@ref/...`) into the same file on
  raw.githubusercontent.com, and jsDelivr npm links (`cdn.jsdelivr.net/npm/...`) into `lib/npm/` here.
- `public/static/game-sanitize.js` (with `window.NOVA_RAW_ONLY`, set by the hub) adds a shim to every game that
  downloads its raw.githubusercontent.com scripts/stylesheets and runs them as `blob:` copies (keeping order and
  `onload`), and makes `WebAssembly.instantiateStreaming` work without `application/wasm`.
- `lib/npm/`: npm packages games use: Ruffle (Flash) and Bootstrap's CSS.

- `index.html`: the math-practice front page. Its "Sign in" links open an `about:blank` tab with the hub.
- `hub.html`, `hub.js`, `hub.css`: the games hub and Movies tab (styles come from `public/static/style.css`,
  game cleanup from `public/static/game-sanitize.js`, the emulator from `public/emulator/`, all of it in this repo).
- `games.json`: the game list. Rebuild it from `nova.db` with `python3 standalone/build-games.py`.
- `g4m3sss.json`: games load from github.com/randomrainbowguy/g4m3sss (`offline/`), pinned to a commit.
  `match` maps Nova games to their g4m3sss file; `new` lists games only in g4m3sss. freebuisness isn't used.
- `prefer-corduroy.json`: games that load from CorduroyBrick49/Games.
- `fake-idb.js`: an in-memory IndexedDB for games when Nova is opened from a downloaded file (the browser
  blocks the real one there). Built from `tools/fake-idb` with `npm run build`.
- `config.js`: your Google Analytics ID (`gaId`) and the movies doc link.
- `ga.js`: sends visits and game plays to Google Analytics. (Google's own gtag.js won't send from a
  downloaded file or an about:blank tab, so this talks to GA's collection endpoint directly.)

## The tiny file

```html
<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Math Practice</title></head>
<body style="background:#f7f6f2;font-family:system-ui,sans-serif">
<script>
// Everything else lives in github.com/randomrainbowguy/nova (standalone/), read from raw.githubusercontent.com.
var REPO = "randomrainbowguy/nova", BRANCH = "overnight";
// Load the newest commit so nothing is stale; fall back to the branch name if GitHub's API says no.
fetch("https://api.github.com/repos/" + REPO + "/commits/" + BRANCH, { headers: { Accept: "application/vnd.github.sha" }, cache: "no-cache" })
  .then(function (r) { return r.ok ? r.text() : ""; }).catch(function () { return ""; })
  .then(function (sha) {
    var base = "https://raw.githubusercontent.com/" + REPO + "/" + (/^[0-9a-f]{40}$/.test(sha.trim()) ? sha.trim() : BRANCH) + "/standalone/";
    return fetch(base + "index.html", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); }).then(function (html) {
      html = html.replace(/<head>/i, '<head><script>window.NOVA_BASE=' + JSON.stringify(base) + ';<\/script>');
      document.open(); document.write(html); document.close();
    });
  }).catch(function (e) {
    document.body.innerHTML = '<div style="max-width:520px;margin:15vh auto;padding:0 16px;color:#1b1f1d"><h2>Couldn\'t load</h2>' +
      '<p>Check your connection and reload. If it keeps happening, this network may be blocking raw.githubusercontent.com.</p>' +
      '<pre style="white-space:pre-wrap;font-size:12px;color:#5d6662">' + String(e && e.message || e).replace(/</g, "&lt;") + '</pre></div>';
  });
</script>
</body></html>
```

`overnight` is the branch it reads. After merging into main, change it to `main` (and in
`index.html`, `build-games.py`).

## Updating

Commit changes here and the tiny file picks them up right away: it asks GitHub for the branch's newest
commit and loads that exact commit from raw.githubusercontent.com. (If GitHub's API refuses, e.g. its limit of
60 requests an hour per network, it loads the branch name instead, which raw.githubusercontent.com caches for
about 5 minutes.)

## Analytics

Set `gaId` in `config.js`. You'll see visitors and page views (front page, games, movies, each game).
For the most-played games, add `game_name` as an event-scoped custom dimension in GA
(Admin → Custom definitions), then look at the `play_game` event.
