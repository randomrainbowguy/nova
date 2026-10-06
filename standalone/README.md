# Standalone Nova

A version of Nova that runs from **one tiny HTML file** (under 1 KB) with no server and no logins.
The file only knows this folder's address; everything else loads from this repo through
[jsDelivr](https://www.jsdelivr.com) (a free CDN for public GitHub repos).

- `index.html`: the math-practice front page. Its "Sign in" links open an `about:blank` tab with the hub.
- `hub.html`, `hub.js`, `hub.css`: the games hub and Movies tab (styles come from `public/static/style.css`,
  game cleanup from `public/static/game-sanitize.js`, the emulator from `public/emulator/`).
- `games.json`: the game list. Rebuild it from `nova.db` with `python3 standalone/build-games.py`.
- `config.js`: your Google Analytics ID (`gaId`) and the movies doc link.
- `ga.js`: sends visits and game plays to Google Analytics. (Google's own gtag.js won't send from a
  downloaded file or an about:blank tab, so this talks to GA's collection endpoint directly.)

## The tiny file

```html
<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Math Practice</title></head>
<body style="background:#f7f6f2">
<script>
var NOVA_BASE = "https://cdn.jsdelivr.net/gh/randomrainbowguy/nova@overnight/standalone/";
fetch(NOVA_BASE + "index.html").then(function (r) { return r.text(); }).then(function (html) {
  html = html.replace(/<head>/i, '<head><script>window.NOVA_BASE=' + JSON.stringify(NOVA_BASE) + ';<\/script>');
  document.open(); document.write(html); document.close();
}).catch(function () { document.body.textContent = "Couldn't load. Check your connection and reload."; });
</script>
</body></html>
```

`@overnight` is the branch it reads. After merging into main, change it to `@main` (and in
`index.html`, `build-games.py`).

## Updating

Commit changes here and the tiny file picks them up. jsDelivr caches branch files for up to
12 hours; to see a change right away, open `https://purge.jsdelivr.net/gh/randomrainbowguy/nova@overnight/standalone/<file>`.

## Analytics

Set `gaId` in `config.js`. You'll see visitors and page views (front page, games, movies, each game).
For the most-played games, add `game_name` as an event-scoped custom dimension in GA
(Admin → Custom definitions), then look at the `play_game` event.
