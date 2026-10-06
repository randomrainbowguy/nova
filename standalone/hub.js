/* Nova standalone games hub. Loaded into an about:blank tab by standalone/index.html. */
(async function () {
  const CONFIG = window.NOVA_CONFIG || {};
  const BASE = window.NOVA_BASE || "";
  const MOVIES_DOC = CONFIG.moviesDoc || "";
  const GA_ID = CONFIG.gaId || "";
  let GAMES = [];
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cssUrl = (u) => String(u || "").replace(/["'()\\\s]/g, encodeURIComponent);

  /* ── analytics (Google Analytics 4) ── */
  let cid = store.get("nova_ga_cid");
  if (!cid) { cid = Math.floor(Math.random() * 2147483647) + "." + Math.floor(Date.now() / 1000); store.set("nova_ga_cid", cid); }
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { dataLayer.push(arguments); };
  const gaOn = /^G-[A-Z0-9]{4,20}$/.test(GA_ID);
  if (gaOn) {
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
    document.head.appendChild(s);
    gtag("js", new Date());
    // This tab is about:blank, so give GA a stable client id and readable page names.
    gtag("config", GA_ID, { client_storage: "none", client_id: cid, send_page_view: false });
  }
  function track(name, params) { if (gaOn) try { gtag("event", name, params || {}); } catch (e) {} }
  function pageView(title, path) {
    track("page_view", { page_title: title, page_location: "https://nova.games" + path, page_path: path });
  }

  /* ── theme ── */
  const matrix = (() => {
    const canvas = $("matrix"), ctx = canvas.getContext("2d");
    const glyphs = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉ0123456789ABCDEF<>/*+=".split("");
    const size = 16; let drops = [], timer = null, running = false;
    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drops = Array.from({ length: Math.ceil(innerWidth / size) }, (_, i) => drops[i] ?? Math.random() * -50);
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, innerWidth, innerHeight);
    }
    function frame() {
      ctx.fillStyle = "rgba(0,0,0,0.09)"; ctx.fillRect(0, 0, innerWidth, innerHeight);
      ctx.font = size + "px monospace";
      drops.forEach((y, i) => {
        ctx.fillStyle = Math.random() < 0.04 ? "#d6ffe4" : "#00e676";
        ctx.fillText(glyphs[(Math.random() * glyphs.length) | 0], i * size, y * size);
        drops[i] = y * size > innerHeight && Math.random() > 0.975 ? 0 : y + 1;
      });
    }
    function loop() { if (!running) return; if (!document.hidden && $("player").hidden) frame(); timer = setTimeout(loop, 55); }
    addEventListener("resize", () => running && resize());
    return { start() { if (running) return; running = true; resize(); loop(); }, stop() { running = false; clearTimeout(timer); } };
  })();
  function applyTheme(name) {
    if (name && name !== "nova") document.documentElement.dataset.theme = name;
    else delete document.documentElement.dataset.theme;
    document.querySelectorAll("[data-set-theme]").forEach((b) => b.classList.toggle("active", b.dataset.setTheme === (name || "nova")));
    document.querySelectorAll(".pp-swatch[data-set-theme]").forEach((b) => b.classList.toggle("on", b.dataset.setTheme === name));
    if (name === "hacker") matrix.start(); else matrix.stop();
  }
  applyTheme(store.get("nova_theme"));
  document.querySelectorAll("[data-set-theme]").forEach((b) => b.addEventListener("click", () => {
    store.set("nova_theme", b.dataset.setTheme); applyTheme(b.dataset.setTheme);
  }));

  /* ── tab cloak ── */
  function setIcon(url) {
    document.querySelectorAll("link[rel='icon']").forEach((l) => l.remove());
    if (!url) return;
    const link = document.createElement("link"); link.rel = "icon"; link.href = url; document.head.appendChild(link);
  }
  function applyCloak() {
    let saved = null;
    try { saved = JSON.parse(store.get("nova_cloak") || "null"); } catch (e) {}
    document.title = saved && saved.title ? saved.title : "";
    setIcon(saved && saved.icon ? saved.icon : "data:,");
    $("cloak-btn").classList.toggle("active", !!saved);
  }
  applyCloak();
  document.querySelectorAll("[data-cloak-title]").forEach((b) => b.addEventListener("click", () => {
    $("cloak-title").value = b.dataset.cloakTitle; $("cloak-icon").value = b.dataset.cloakIcon;
  }));
  $("cloak-apply").addEventListener("click", () => {
    const title = $("cloak-title").value.trim(), icon = $("cloak-icon").value.trim();
    if (!title && !icon) return;
    store.set("nova_cloak", JSON.stringify({ title, icon })); applyCloak(); closePanels();
  });
  $("cloak-reset").addEventListener("click", () => { store.del("nova_cloak"); $("cloak-title").value = $("cloak-icon").value = ""; applyCloak(); });

  /* ── panic key ── */
  const PANIC_DEFAULT = "https://canvas.instructure.com";
  let panic = null;
  try { panic = JSON.parse(store.get("nova_panic") || "null"); } catch (e) {}
  let choosingKey = false;
  const keyName = (k) => (k === " " ? "Space" : k.length === 1 ? k.toUpperCase() : k);
  function onPanicKey(e) {
    if (!panic || choosingKey || e.key !== panic.key || e.repeat) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) && panic.key.length === 1) return;
    e.preventDefault();
    location.replace(panic.url || PANIC_DEFAULT);
  }
  addEventListener("keydown", onPanicKey, true);
  let chosen = panic ? panic.key : "";
  const panicLabel = () => { $("panic-key").textContent = chosen ? "Panic key: " + keyName(chosen) : "Click, then press a key"; };
  panicLabel();
  $("panic-url").value = panic ? panic.url : "";
  $("panic-key").addEventListener("click", () => {
    $("panic-key").textContent = "Press any key…"; choosingKey = true;
    document.addEventListener("keydown", (e) => {
      e.preventDefault(); e.stopPropagation(); choosingKey = false;
      if (e.key !== "Escape") chosen = e.key;
      panicLabel();
    }, { capture: true, once: true });
  });
  $("panic-save").addEventListener("click", () => {
    if (!chosen) { $("panic-key").textContent = "Pick a key first"; return; }
    let url = $("panic-url").value.trim() || PANIC_DEFAULT;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    panic = { key: chosen, url }; store.set("nova_panic", JSON.stringify(panic)); closePanels();
  });
  $("panic-off").addEventListener("click", () => { panic = null; chosen = ""; store.del("nova_panic"); panicLabel(); $("panic-url").value = ""; });

  /* ── panels & mobile nav ── */
  function closePanels() { document.querySelectorAll(".panel").forEach((p) => (p.hidden = true)); }
  document.querySelectorAll("[data-panel]").forEach((btn) => btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const panel = $(btn.dataset.panel), was = panel.hidden;
    closePanels(); panel.hidden = !was;
  }));
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".panel")) closePanels();
    if (!e.target.closest("[data-nav-toggle]")) $("nav").classList.remove("open");
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closePanels(); if (!$("player").hidden) closePlayer(); } });
  document.querySelector("[data-nav-toggle]").addEventListener("click", () => $("nav").classList.toggle("open"));

  /* ── views ── */
  function show(view) {
    $("view-games").hidden = view !== "games";
    $("view-movies").hidden = view !== "movies";
    document.querySelectorAll(".nav [data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    scrollTo(0, 0);
    pageView(view === "games" ? "Games" : "Movies", "/" + view);
  }
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); show(b.dataset.view); }));
  if (MOVIES_DOC) $("movies-link").href = MOVIES_DOC; else $("movies-link").replaceWith(Object.assign(document.createElement("span"), { className: "muted", textContent: "Coming soon" }));

  /* ── library (games.json lives in the repo next to this file) ── */
  try {
    GAMES = await fetch(BASE + "games.json").then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  } catch (err) {
    $("grid").innerHTML = `<div class="empty">Couldn't load the game list (${esc(err.message)}). Check your connection and reload.</div>`;
    return;
  }
  const byId = new Map(GAMES.map((g) => [g.id, g]));
  const favs = new Set((() => { try { return JSON.parse(store.get("nova_favs") || "[]"); } catch (e) { return []; } })());
  const art = (g) => `<span class="hv-noart" style="--h:${(g.id * 47) % 360}">${esc((g.name || "?").slice(0, 1))}</span>` +
    (g.image ? `<img src="${esc(g.image)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : "");
  $("game-count").textContent = GAMES.length;
  $("search").placeholder = `Search ${GAMES.length} games…`;

  const featured = GAMES.find((g) => g.image);
  if (featured) {
    const f = $("featured");
    f.hidden = false; f.dataset.play = featured.id;
    f.innerHTML = `<img src="${esc(featured.image)}" alt="" onerror="this.remove()"><div class="hv-feature-body"><span class="hv-kicker">🔥 Most played</span><h2>${esc(featured.name)}</h2>${featured.description ? `<p>${esc(featured.description)}</p>` : ""}<span class="hv-play">▶ Play now</span></div>`;
  }
  const trending = GAMES.filter((g) => g.image && g !== featured).slice(0, 8);
  $("trending").innerHTML = trending.map((g, i) =>
    `<a class="hv-trend" data-play="${g.id}"><span class="hv-rank">${i + 2}</span>${art(g)}<span class="hv-trend-name">${esc(g.name)}</span></a>`).join("");

  const genres = [...new Set(GAMES.flatMap((g) => g.genres))].sort((a, b) => a.localeCompare(b));
  $("genres").innerHTML = `<button class="pill active" data-genre="All">All</button>` + genres.map((g) => `<button class="pill" data-genre="${esc(g)}">${esc(g)}</button>`).join("");

  const PAGE = 120;
  let order = GAMES.slice(), genre = "All", query = "", limit = PAGE;
  const sorters = {
    popular: (a, b) => a.rank - b.rank,
    az: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }),
    new: (a, b) => b.id - a.id,
  };
  function card(g, i) {
    return `<article class="game hv-card"><a class="hv-art" data-play="${g.id}" aria-label="Play ${esc(g.name)}">${art(g)}<span class="hv-art-play" aria-hidden="true">▶</span></a>` +
      `<div class="hv-badges">${i < 3 && query === "" && genre === "All" && order === sortedPopular ? `<span class="hv-badge">🔥 Top ${i + 1}</span>` : ""}</div>` +
      `<button class="star${favs.has(g.id) ? " on" : ""}" data-fav="${g.id}" title="${favs.has(g.id) ? "Remove from favorites" : "Add to favorites"}" aria-label="Favorite ${esc(g.name)}">★</button>` +
      `<div class="hv-card-body"><h3>${esc(g.name)}</h3><span>${esc(g.genres.length ? g.genres.join(" · ") : "Game")}</span></div></article>`;
  }
  let sortedPopular = order;
  function renderGrid() {
    const q = query.toLowerCase();
    const list = order.filter((g) => (!q || g.search.includes(q)) && (genre === "All" || g.genres.includes(genre)));
    $("grid").innerHTML = list.slice(0, limit).map(card).join("");
    $("empty").hidden = list.length > 0;
    $("more-wrap").hidden = list.length <= limit;
    $("lib-count").textContent = list.length === GAMES.length ? `${GAMES.length} to choose from` : `${list.length} of ${GAMES.length} shown`;
  }
  GAMES.forEach((g) => { g.search = `${g.name} ${g.description || ""} ${g.genres.join(" ")}`.toLowerCase(); });
  $("search").addEventListener("input", () => { query = $("search").value.trim(); limit = PAGE; renderGrid(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== $("search") && $("player").hidden) { e.preventDefault(); show("games"); $("search").focus(); }
  });
  document.querySelectorAll("[data-sort]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("[data-sort]").forEach((x) => x.classList.toggle("active", x === b));
    order = b.dataset.sort === "popular" ? sortedPopular : GAMES.slice().sort(sorters[b.dataset.sort]);
    limit = PAGE; renderGrid();
  }));
  $("genres").addEventListener("click", (e) => {
    const p = e.target.closest("[data-genre]"); if (!p) return;
    document.querySelectorAll("[data-genre]").forEach((x) => x.classList.toggle("active", x === p));
    genre = p.dataset.genre; limit = PAGE; renderGrid();
  });
  $("more").addEventListener("click", () => { limit += PAGE; renderGrid(); });

  function renderFavs() {
    const list = [...favs].map((id) => byId.get(id)).filter(Boolean);
    $("favs").innerHTML = list.length ? list.map((g) =>
      `<a class="fav-item" data-play="${g.id}"${g.image ? ` style="background-image:url('${esc(cssUrl(g.image))}')"` : ""}><span>${esc(g.name)}</span></a>`).join("")
      : `<div class="muted small">Star a game to pin it here.</div>`;
  }
  document.addEventListener("click", (e) => {
    const star = e.target.closest("[data-fav]");
    if (star) {
      const id = Number(star.dataset.fav);
      if (favs.has(id)) favs.delete(id); else favs.add(id);
      store.set("nova_favs", JSON.stringify([...favs]));
      star.classList.toggle("on", favs.has(id));
      star.title = favs.has(id) ? "Remove from favorites" : "Add to favorites";
      renderFavs();
      return;
    }
    const play = e.target.closest("[data-play]");
    if (play) { e.preventDefault(); openGame(byId.get(Number(play.dataset.play))); }
  });
  renderGrid();
  renderFavs();

  /* ── player: download the game's HTML, clean it, run it in a frame ── */
  let loaded = null, current = null;
  const frame = $("game-frame");
  // Opened from a downloaded file, the page isn't a "secure context", so crypto.subtle and
  // crypto.randomUUID don't exist and some games (PolyTrack) stall. Give them small stand-ins.
  const CRYPTO_SHIM = `<script>(function(){var c=window.crypto;if(!c)return;
if(!c.randomUUID)c.randomUUID=function(){var b=c.getRandomValues(new Uint8Array(16));b[6]=b[6]&15|64;b[8]=b[8]&63|128;var h=[].map.call(b,function(x){return(x+256).toString(16).slice(1)}).join("");return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20)};
if(c.subtle)return;var K=[],H0=[];(function(){var n=2,i=0;function f(x){return(x-Math.floor(x))*4294967296|0}while(i<64){var p=1;for(var d=2;d*d<=n;d++)if(n%d==0){p=0;break}if(p){if(i<8)H0[i]=f(Math.pow(n,1/2));K[i++]=f(Math.pow(n,1/3))}n++}})();
function sha256(data){var b=new Uint8Array(data.buffer?data.buffer.slice(data.byteOffset||0,(data.byteOffset||0)+data.byteLength):data),l=b.length,n=((l+9+63)>>6)<<6,m=new Uint8Array(n);m.set(b);m[l]=128;var dv=new DataView(m.buffer);dv.setUint32(n-4,l*8>>>0);dv.setUint32(n-8,Math.floor(l/536870912));var h=H0.slice(),w=new Array(64);
for(var o=0;o<n;o+=64){for(var t=0;t<16;t++)w[t]=dv.getUint32(o+t*4);for(t=16;t<64;t++){var a=w[t-15],q=w[t-2];w[t]=(((a>>>7|a<<25)^(a>>>18|a<<14)^a>>>3)+w[t-7]+((q>>>17|q<<15)^(q>>>19|q<<13)^q>>>10)+w[t-16])|0}
var A=h[0],B=h[1],C=h[2],D=h[3],E=h[4],F=h[5],G=h[6],I=h[7];for(t=0;t<64;t++){var t1=(I+((E>>>6|E<<26)^(E>>>11|E<<21)^(E>>>25|E<<7))+((E&F)^(~E&G))+K[t]+w[t])|0,t2=(((A>>>2|A<<30)^(A>>>13|A<<19)^(A>>>22|A<<10))+((A&B)^(A&C)^(B&C)))|0;I=G;G=F;F=E;E=(D+t1)|0;D=C;C=B;B=A;A=(t1+t2)|0}
h[0]=h[0]+A|0;h[1]=h[1]+B|0;h[2]=h[2]+C|0;h[3]=h[3]+D|0;h[4]=h[4]+E|0;h[5]=h[5]+F|0;h[6]=h[6]+G|0;h[7]=h[7]+I|0}var out=new DataView(new ArrayBuffer(32));h.forEach(function(v,i){out.setUint32(i*4,v)});return out.buffer}
try{Object.defineProperty(c,"subtle",{configurable:true,value:{digest:function(alg,data){var name=(alg&&alg.name||alg||"").toUpperCase();if(name!=="SHA-256")return Promise.reject(new Error("Only SHA-256 is available here"));return Promise.resolve(sha256(data))}}})}catch(e){}})();<\/script>`;
  function prepare(html, url) {
    let out;
    if (window.sanitizeGameHtml) out = window.sanitizeGameHtml(html, url);
    else {
      const base = `<base href="${url.slice(0, url.lastIndexOf("/") + 1)}">`;
      out = /<head[^>]*>/i.test(html) ? html.replace(/<head([^>]*)>/i, `<head$1>${base}`) : base + html;
    }
    // The game runs from a blob: URL, which may not count as secure even when this page does,
    // so always add the shim (it only fills in what's missing).
    return /<head[^>]*>/i.test(out) ? out.replace(/<head([^>]*)>/i, (m) => m + CRYPTO_SHIM) : CRYPTO_SHIM + out;
  }
  function openGame(g) {
    if (!g) return;
    current = g;
    closePanels();
    $("player-title").textContent = g.name;
    $("player").hidden = false;
    document.body.style.overflow = "hidden";
    frame.hidden = true;
    $("game-status").hidden = false;
    $("game-status").querySelector(".spinner").hidden = false;
    $("game-status-text").textContent = `Loading ${g.name}…`;
    pageView(g.name, "/play/" + g.id);
    track("play_game", { game_name: g.name, game_id: String(g.id) });
    const token = {};
    loaded = fetch(g.url).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); }).then((h) => prepare(h, g.url));
    loaded.token = token;
    const mine = loaded;
    mine.then((html) => {
      if (loaded !== mine) return;
      frame.src = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      frame.hidden = false;
      $("game-status").hidden = true;
      frame.focus();
    }).catch((err) => {
      if (loaded !== mine) return;
      $("game-status").querySelector(".spinner").hidden = true;
      $("game-status-text").textContent = `Couldn't load this game (${err.message}). The link may be broken or blocked on this network.`;
    });
  }
  function closePlayer() {
    loaded = null;
    if (frame.src.startsWith("blob:")) URL.revokeObjectURL(frame.src);
    frame.src = "about:blank";
    $("player").hidden = true;
    document.body.style.overflow = "";
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
  $("player-back").addEventListener("click", closePlayer);
  $("fullscreen").addEventListener("click", () => frame.requestFullscreen && frame.requestFullscreen());
  $("open-tab").addEventListener("click", () => {
    if (!loaded) return;
    const w = window.open("about:blank");
    if (!w) return;
    loaded.then((html) => { w.document.open(); w.document.write(html); w.document.close(); }).catch(() => w.close());
  });
  frame.addEventListener("load", () => {
    try { if (panic) frame.contentWindow.addEventListener("keydown", onPanicKey, true); } catch (e) {}
  });

  pageView("Games", "/games");
})();
