# Standalone Nova

A version of Nova that runs from **one tiny HTML file** (under 1 KB) with no server and no logins.
The file only knows this folder's address; everything else loads from this repo through
[jsDelivr](https://www.jsdelivr.com) (a free CDN for public GitHub repos).

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
// Everything else lives in github.com/randomrainbowguy/nova (standalone/), served by jsDelivr.
var REPO = "randomrainbowguy/nova", BRANCH = "overnight";
var HOSTS = ["https://cdn.jsdelivr.net", "https://fastly.jsdelivr.net", "https://gcore.jsdelivr.net"];
var tried = [];
// Load the newest commit (jsDelivr can serve a branch hours late); fall back to the branch name.
var version = fetch("https://api.github.com/repos/" + REPO + "/commits/" + BRANCH, { headers: { Accept: "application/vnd.github.sha" }, cache: "no-cache" })
  .then(function (r) { return r.ok ? r.text() : ""; }).catch(function () { return ""; })
  .then(function (sha) { return /^[0-9a-f]{40}$/.test(sha.trim()) ? sha.trim() : BRANCH; });
function next(i, ver) {
  if (i >= HOSTS.length) {
    document.body.innerHTML = '<div style="max-width:520px;margin:15vh auto;padding:0 16px;color:#1b1f1d"><h2>Couldn\'t load</h2>' +
      '<p>Check your connection and reload. If it keeps happening, this network or app may be blocking jsDelivr.</p>' +
      '<pre style="white-space:pre-wrap;font-size:12px;color:#5d6662">' + tried.join("\n").replace(/</g, "&lt;") + '</pre></div>';
    return;
  }
  var base = HOSTS[i] + "/gh/" + REPO + "@" + ver + "/standalone/";
  fetch(base + "index.html", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); }).then(function (html) {
    html = html.replace(/<head>/i, '<head><script>window.NOVA_BASE=' + JSON.stringify(base) + ';<\/script>');
    document.open(); document.write(html); document.close();
  }).catch(function (e) { tried.push(HOSTS[i] + ": " + (e && e.message || e)); next(i + 1, ver); });
}
version.then(function (ver) { next(0, ver); });
</script>
</body></html>
```

`@overnight` is the branch it reads. After merging into main, change it to `@main` (and in
`index.html`, `build-games.py`).

## Updating

Commit changes here and the tiny file picks them up. Browsers always re-check for the latest files
(jsDelivr would otherwise let them keep a copy for 7 days), but jsDelivr itself caches branch files
for up to 12 hours; to push a change out right away, open `https://purge.jsdelivr.net/gh/randomrainbowguy/nova@overnight/standalone/<file>`.

## Analytics

Set `gaId` in `config.js`. You'll see visitors and page views (front page, games, movies, each game).
For the most-played games, add `game_name` as an event-scoped custom dimension in GA
(Admin → Custom definitions), then look at the `play_game` event.
