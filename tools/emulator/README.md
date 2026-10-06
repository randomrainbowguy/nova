# Emulator (self-hosted EmulatorJS)

`public/emulator/` is a fully self-hosted copy of [EmulatorJS](https://github.com/EmulatorJS/EmulatorJS)
plus our own front page (`public/emulator/index.html`). It is served from our own origin at
`/emulator/` — nothing is loaded from cdn.emulatorjs.org, jsDelivr or any other CDN. The only
external request is the Manrope font from Google Fonts.

The user picks a ROM from their computer (file picker or drag-and-drop). The system is auto-detected
from the file extension (or chosen by hand), the file becomes a `blob:` URL, and EmulatorJS starts
full-size in the page. An optional BIOS file can be supplied too. EmulatorJS's own menu bar (shown
on mouse move) provides save/load state, in-game saves (kept in IndexedDB, keyed by ROM name),
controls/gamepad mapping, cheats, screenshots, volume, settings and fullscreen. `?system=gba`
preselects a system.

## Version

- EmulatorJS **v4.2.3** (latest stable GitHub release, published 2025-07-05)
- Source archive: `4.2.3.7z` from https://github.com/EmulatorJS/EmulatorJS/releases/tag/v4.2.3
- SHA-256 `07d451bc06fa3ad04ab30d9b94eb63ac34ad0babee52d60357b002bde8f3850b` (matches the digest GitHub publishes for the asset)
- License: GPL-3.0 (`public/emulator/data/LICENSE`); non-minified source kept in `data/src/`.

## What is in `public/emulator/data/`

| Path | Purpose |
|---|---|
| `loader.js` | entry point loaded by `index.html` |
| `emulator.min.js`, `emulator.min.css` | runtime (`emulator.css` + `src/` are the unminified fallback/source) |
| `localization/` | UI translations (auto-picked from the browser locale) |
| `compression/` | 7z / zip / rar extractors (for zipped ROMs and core packages) |
| `cores/<core>-wasm.data` | core, WebGL2 build |
| `cores/<core>-legacy-wasm.data` | same core, WebGL1 build |
| `cores/reports/<core>.json` | per-core metadata (EmulatorJS fetches it before the core; used for caching/defaults) |

Both the normal and the `-legacy` build are shipped for every core: EmulatorJS picks `-legacy`
by default for most cores (anything whose report doesn't set `defaultWebGL2`), picks the non-legacy
one for N64/NDS/PSX, and the user can flip the "WebGL2" setting. If a needed file is missing,
EmulatorJS silently falls back to downloading it from cdn.emulatorjs.org — so never drop one half.

**Only the non-threaded builds are shipped.** The `-thread-` builds need `SharedArrayBuffer`, which
needs COOP/COEP headers; without those headers EmulatorJS never asks for them. `index.html` also sets
`EJS_threads = false`. **No special headers are required.** (If someone ever adds
`Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy` to the site, a user could turn on the
"threads" setting and EmulatorJS would then fall back to the CDN for the missing `-thread-` cores.)

### Cores (34) and systems

| System (`EJS_core`) | Cores shipped (first = default) |
|---|---|
| NES / Famicom (`nes`) | fceumm, nestopia |
| SNES (`snes`) | snes9x |
| Game Boy / Color (`gb`) | gambatte |
| Game Boy Advance (`gba`) | mgba |
| Nintendo 64 (`n64`) | mupen64plus_next, parallel_n64 |
| Nintendo DS (`nds`) | melonds, desmume, desmume2015 |
| Virtual Boy (`vb`) | beetle_vb |
| Master System (`segaMS`) | smsplus, genesis_plus_gx, picodrive |
| Genesis / Mega Drive (`segaMD`) | genesis_plus_gx, picodrive |
| Game Gear (`segaGG`) | genesis_plus_gx |
| Sega CD (`segaCD`, BIOS needed) | genesis_plus_gx, picodrive |
| 32X (`sega32x`) | picodrive |
| Saturn (`segaSaturn`) | yabause |
| PlayStation (`psx`) | pcsx_rearmed, mednafen_psx_hw |
| Atari 2600 / 5200 / 7800 | stella2014 / a5200 / prosystem |
| Atari Lynx / Jaguar | handy / virtualjaguar |
| PC Engine / TurboGrafx-16 (`pce`), PC-FX (`pcfx`) | mednafen_pce, mednafen_pcfx |
| WonderSwan (`ws`), Neo Geo Pocket (`ngp`) | mednafen_wswan, mednafen_ngp |
| ColecoVision (`coleco`) | gearcoleco |
| 3DO (`3do`, BIOS needed) | opera |
| Arcade (`arcade`) | fbneo, fbalpha2012_cps1, fbalpha2012_cps2 |
| Arcade MAME (`mame2003`, `mame2003_plus`) | mame2003, mame2003_plus |

Left out on purpose:
- **PSP (`ppsspp`) and DOS (`dosbox_pure`)** — EmulatorJS only ships threaded builds of these, so they
  cannot run without COOP/COEP headers (PPSSPP also needs an 11 MB assets zip).
- **Home computers** (C64/C128/PET/Plus4/VIC-20 `vice_*`, Amiga `puae`, Amstrad `cap32`/`crocods`,
  ZX Spectrum `fuse`, ZX81 `81`), **Doom** (`prboom`) and **CD-i** (`same_cdi`) — not part of the old
  page's system list; skipped to keep the repo smaller (~30 MB more). They can be added the same way.

No file comes close to the 25 MiB Cloudflare limit: the biggest is `fbneo-wasm.data` at 8.3 MB.

### Size

`public/emulator/` = **~96 MB, 140 files** (cores ≈ 94 MB). Well under GitHub's 50/100 MB per-file
limits and Cloudflare's 25 MiB/file, 20,000-file limits.

## Integration notes

- Mount: `public/emulator/` → `/emulator/`. All paths inside are relative (`EJS_pathtodata = "data/"`),
  so it works at any mount point. The page fixes up a missing trailing slash itself (and Cloudflare's
  default `auto-trailing-slash` redirects anyway).
- MIME: `.wasm` → `application/wasm`; the cores are `.data` (served as `application/octet-stream`, fine).
- Iframe: the player page should frame it with
  `<iframe src="/emulator/" allow="fullscreen; gamepad; autoplay" allowfullscreen>` so fullscreen,
  controllers and sound work from inside the frame. Tested framed: works.
- EmulatorJS pings `cdn.emulatorjs.org/stable/data/version.json` (update check) **only** when the page
  hostname is `localhost`/`127.0.0.1`. Production is unaffected; for local testing open it via another
  hostname (the test script uses `nova.test`).
- Netplay is off (it needs `EJS_gameID`, which we don't set), so no socket to netplay.emulatorjs.org.
- Emulation is paced off the audio clock: if the visitor's audio output device is stalled, the game
  freezes after a few frames (seen in testing with sleeping Bluetooth headphones). That's upstream
  behaviour, not a bug in our page.

## Testing

```sh
cd tools/emulator
npm install                                      # playwright-core only (node_modules is gitignored)
node serve.mjs 8787                              # http://localhost:8787/emulator/ (serves ../../public)
node test.mjs /tmp/emu-out nes=/path/x.nes gba=/path/y.gba [gb=…] [snes=…] [n64=…] [--iframe]
```

`test.mjs` starts `serve.mjs`, drives headless Chrome (`/Applications/Google Chrome.app`, or
`CHROME=…`), loads each ROM through the real file input, checks the emulator frame counter advances,
writes screenshots + network/console logs to the out dir, and fails if any request leaves our origin
(Google Fonts excepted). `--iframe` runs it inside a same-origin framing page (`/__frame_test.html`,
served only by `serve.mjs`). It uses `--disable-audio-output` (fake audio sink) — see the audio note above.

Verified 2026-10-06 (screenshots inspected): NES (fceumm, spritecans + nestest), GBA (mgba,
jsmolka gba-tests), Game Boy (gambatte, dmg-acid2), SNES (snes9x, PeterLemon HelloWorld),
N64 (mupen64plus_next, PeterLemon HelloWorld CPU/RDP), plus NES and GBA inside an iframe.
Every request was same-origin except Google Fonts. Test ROMs are freely distributed homebrew/test
ROMs and are **not** stored in the repo.

## Updating EmulatorJS

1. Find the latest release: `gh release view -R EmulatorJS/EmulatorJS` (asset `<version>.7z`, with a sha256 digest).
2. Download into an empty temp dir, check `shasum -a 256` against the digest, extract (`bsdtar -xf <version>.7z`).
3. Replace in `public/emulator/data/`: `loader.js emulator.min.js emulator.min.css emulator.css version.json LICENSE`
   and the `localization/ compression/ src/` folders.
4. For each core listed above copy `cores/<core>-wasm.data`, `cores/<core>-legacy-wasm.data` and
   `cores/reports/<core>.json`. Check nothing exceeds 25 MiB (`find public/emulator -size +24M`).
   If EmulatorJS renamed/added a default core for a system (see `getCores()` in `data/src/emulator.js`), ship that too.
5. Run `node tools/emulator/test.mjs …` with a few ROMs and look at the screenshots; confirm `external=0`.
6. Update the version/size in this README.
