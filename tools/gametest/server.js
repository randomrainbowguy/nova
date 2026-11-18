// Tiny static server for the game-test harness.
//   /                      -> harness.html
//   /static/<file>         -> ../../public/static/<file>   (so the real game-sanitize.js is used)
//   /standalone/<file>     -> ../../standalone/<file>       (games copied into the repo, see tools/vendor)
//   /<file>                -> files in this folder
// Usage: node server.js [port]   (default 8765). Also exported as start(port) for run.js.
const http = require("http");
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const STATIC = path.resolve(HERE, "..", "..", "public", "static");
const STANDALONE = path.resolve(HERE, "..", "..", "standalone");
const TYPES = { ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".mp4": "video/mp4",
  ".webm": "video/webm", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml", ".swf": "application/x-shockwave-flash", ".pck": "application/octet-stream" };

let SANITIZER = null;   // optional override for /static/game-sanitize.js (run.js --sanitizer FILE)
function resolve(urlPath) {
  const p = decodeURIComponent(urlPath.split("?")[0]);
  if (SANITIZER && p === "/static/game-sanitize.js") return SANITIZER;
  if (p === "/" || p === "") return path.join(HERE, "harness.html");
  if (p.startsWith("/static/")) {
    const f = path.resolve(STATIC, "." + p.slice("/static".length));
    return f.startsWith(STATIC + path.sep) ? f : null;
  }
  if (p.startsWith("/standalone/")) {
    const f = path.resolve(STANDALONE, "." + p.slice("/standalone".length));
    return f.startsWith(STANDALONE + path.sep) ? f : null;
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
    res.writeHead(200, { "content-type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store", "access-control-allow-origin": "*" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}

if (require.main === module) {
  const port = Number(process.argv[2]) || 8765;
  start(port).then(() => console.log(`harness at http://localhost:${port}/?url=<game url>&sanitize=1`));
}
module.exports = { start };
