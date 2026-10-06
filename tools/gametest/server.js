// Tiny static server for the game-test harness.
//   /                      -> harness.html
//   /static/<file>         -> ../../static/<file>   (so the real game-sanitize.js is used)
//   /<file>                -> files in this folder
// Usage: node server.js [port]   (default 8765). Also exported as start(port) for run.js.
const http = require("http");
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const STATIC = path.resolve(HERE, "..", "..", "static");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };

let SANITIZER = null;   // optional override for /static/game-sanitize.js (run.js --sanitizer FILE)
function resolve(urlPath) {
  const p = decodeURIComponent(urlPath.split("?")[0]);
  if (SANITIZER && p === "/static/game-sanitize.js") return SANITIZER;
  if (p === "/" || p === "") return path.join(HERE, "harness.html");
  if (p.startsWith("/static/")) {
    const f = path.resolve(STATIC, "." + p.slice("/static".length));
    return f.startsWith(STATIC + path.sep) ? f : null;
  }
  const f = path.resolve(HERE, "." + p);
  return f.startsWith(HERE + path.sep) ? f : null;
}

function start(port = 8765, sanitizer = null) {
  SANITIZER = sanitizer ? path.resolve(sanitizer) : null;
  const server = http.createServer((req, res) => {
    const file = resolve(req.url);
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { "content-type": "text/plain" });
      return res.end("not found");
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream",
      "cache-control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}

if (require.main === module) {
  const port = Number(process.argv[2]) || 8765;
  start(port).then(() => console.log(`harness at http://localhost:${port}/?url=<game url>&sanitize=1`));
}
module.exports = { start };
