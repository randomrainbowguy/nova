#!/usr/bin/env node
// Minimal static file server for local testing of public/ (mirrors how Cloudflare
// Workers static assets will serve it). No dependencies.
//
//   node tools/emulator/serve.mjs [port] [rootDir]
//   -> http://localhost:8787/emulator/
//
// Note: EmulatorJS pings cdn.emulatorjs.org for an update check ONLY when the
// hostname is "localhost" or "127.0.0.1". Open it via another name (e.g.
// http://nova.test:8787 mapped to 127.0.0.1) to avoid that during testing.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || process.env.PORT || 8787);
const root = path.resolve(process.argv[3] || path.join(here, '..', '..', 'public'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.zip': 'application/zip',
  '.7z': 'application/x-7z-compressed',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end('bad request');
    return;
  }
  if (pathname === '/__frame_test.html') {
    // Test-only page that frames /emulator/ the way the site's player page does.
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(
      `<!doctype html><meta charset="utf-8"><title>frame test</title>
<body style="margin:0;background:#222;font-family:sans-serif"><h3 style="color:#fff;margin:8px">Player page (iframe test)</h3>
<iframe id="f" src="/emulator/" style="width:960px;height:640px;border:0" allow="fullscreen; gamepad; autoplay" allowfullscreen></iframe></body>`);
    return;
  }
  let file = path.join(root, pathname);
  if (!file.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }

  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) {
      if (!pathname.endsWith('/')) {
        // Same behaviour as Cloudflare's default auto-trailing-slash.
        res.writeHead(307, { Location: pathname + '/' + (new URL(req.url, 'http://x').search) }).end();
        return;
      }
      file = path.join(file, 'index.html');
    }
    fs.stat(file, (err2, st2) => {
      if (err2 || !st2.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
        console.log(404, req.method, pathname);
        return;
      }
      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': st2.size, 'Cache-Control': 'no-cache' });
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(file).pipe(res);
    });
  });
});

server.listen(port, () => console.log(`Serving ${root} at http://localhost:${port}/emulator/`));
