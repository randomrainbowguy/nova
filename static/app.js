(function () {
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const csrf = document.querySelector('meta[name="csrf"]')?.content || "";

  /* ── matrix rain (hacker theme) ── */
  const matrix = (() => {
    const canvas = document.getElementById("matrix");
    const ctx = canvas?.getContext("2d");
    const glyphs = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEF<>/*+=".split("");
    const size = 16;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let drops = [], timer = null, running = false;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cols = Math.ceil(innerWidth / size);
      drops = Array.from({ length: cols }, (_, i) => drops[i] ?? Math.random() * -50);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, innerWidth, innerHeight);
    }
    function frame() {
      ctx.fillStyle = "rgba(0, 0, 0, 0.09)";
      ctx.fillRect(0, 0, innerWidth, innerHeight);
      ctx.font = `${size}px monospace`;
      drops.forEach((y, i) => {
        const ch = glyphs[(Math.random() * glyphs.length) | 0];
        ctx.fillStyle = Math.random() < 0.04 ? "#d6ffe4" : "#00e676";
        ctx.fillText(ch, i * size, y * size);
        drops[i] = y * size > innerHeight && Math.random() > 0.975 ? 0 : y + 1;
      });
    }
    function loop() {
      if (!running) return;
      if (!document.hidden) frame();
      timer = setTimeout(loop, 55);
    }
    return {
      start() {
        // No rain behind a running game - it would only cost CPU.
        if (!ctx || running || document.querySelector(".player")) return;
        running = true;
        resize();
        if (still) { for (let i = 0; i < 60; i++) frame(); running = false; return; }
        loop();
      },
      stop() { running = false; clearTimeout(timer); },
      resize() { if (running) resize(); },
    };
  })();
  window.addEventListener("resize", () => matrix.resize());

  /* ── theme ── */
  const PRO_THEMES = ["aurora", "sunset", "gold"];  // keep in sync with PRO_THEMES in app.py
  function applyTheme(name) {
    if (PRO_THEMES.includes(name) && !document.documentElement.hasAttribute("data-pro")) name = "nova";
    if (name && name !== "nova") document.documentElement.dataset.theme = name;
    else delete document.documentElement.dataset.theme;
    document.querySelectorAll("[data-set-theme]").forEach((b) =>
      b.classList.toggle("active", b.dataset.setTheme === (name || "nova")));
    if (name === "hacker") matrix.start(); else matrix.stop();
  }
  applyTheme(store.get("nova_theme"));
  document.querySelectorAll("[data-set-theme]").forEach((b) => {
    b.onclick = () => { store.set("nova_theme", b.dataset.setTheme); applyTheme(b.dataset.setTheme); };
  });

  /* ── tab cloak (remembered across pages) ── */
  const originalTitle = document.title;
  const originalIcon = document.querySelector("link[rel='icon']")?.href || "";
  function setIcon(url) {
    document.querySelectorAll("link[rel='icon']").forEach((l) => l.remove());
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = url;
    document.head.appendChild(link);
  }
  function applyCloak() {
    const saved = JSON.parse(store.get("nova_cloak") || "null");
    const btn = document.getElementById("cloak-btn");
    if (saved) {
      if (saved.title) document.title = saved.title;
      if (saved.icon) setIcon(saved.icon);
    } else {
      document.title = originalTitle;
      if (originalIcon) setIcon(originalIcon);
    }
    btn?.classList.toggle("active", !!saved);
  }
  applyCloak();
  const titleIn = document.getElementById("cloak-title");
  const iconIn = document.getElementById("cloak-icon");
  document.querySelectorAll("[data-cloak-title]").forEach((b) => {
    b.onclick = () => { titleIn.value = b.dataset.cloakTitle; iconIn.value = b.dataset.cloakIcon; };
  });
  document.getElementById("cloak-apply")?.addEventListener("click", () => {
    const title = titleIn.value.trim(), icon = iconIn.value.trim();
    if (!title && !icon) return;
    store.set("nova_cloak", JSON.stringify({ title, icon }));
    applyCloak();
    closePanels();
  });
  document.getElementById("cloak-reset")?.addEventListener("click", () => {
    store.del("nova_cloak");
    titleIn.value = iconIn.value = "";
    applyCloak();
  });

  /* ── panic key: one key press leaves the site for a safe page ── */
  const PANIC_DEFAULT = "https://canvas.instructure.com";
  const panic = JSON.parse(store.get("nova_panic") || "null");
  let choosingKey = false;
  const keyName = (k) => (k === " " ? "Space" : k.length === 1 ? k.toUpperCase() : k);
  function goPanic() {
    // replace() so the Back button can't bring someone straight back here
    window.top.location.replace(panic.url || PANIC_DEFAULT);
  }
  function onPanicKey(e) {
    if (!panic || choosingKey || e.key !== panic.key || e.repeat) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) && panic.key.length === 1) return;
    e.preventDefault();
    goPanic();
  }
  if (panic) {
    window.addEventListener("keydown", onPanicKey, true);
    // Games we host run in a same-site frame, so the key works while playing them too.
    // (Games embedded from other sites can't be listened to - click outside the game first.)
    const hook = (frame) => {
      try { frame.contentWindow.addEventListener("keydown", onPanicKey, true); } catch (err) {}
    };
    document.querySelectorAll("iframe").forEach((f) => { hook(f); f.addEventListener("load", () => hook(f)); });
  }
  const panicBtn = document.getElementById("panic-key");
  const panicUrl = document.getElementById("panic-url");
  if (panicBtn) {
    let chosen = panic?.key || "";
    const label = () => { panicBtn.textContent = chosen ? `Panic key: ${keyName(chosen)}` : "Click, then press a key"; };
    label();
    panicUrl.value = panic?.url || "";
    panicBtn.addEventListener("click", () => {
      panicBtn.textContent = "Press any key…";
      choosingKey = true;
      const grab = (e) => {
        e.preventDefault();
        e.stopPropagation();
        choosingKey = false;
        if (e.key !== "Escape") chosen = e.key;
        label();
      };
      document.addEventListener("keydown", grab, { capture: true, once: true });
    });
    document.getElementById("panic-save").addEventListener("click", () => {
      if (!chosen) { panicBtn.textContent = "Pick a key first"; return; }
      let url = panicUrl.value.trim() || PANIC_DEFAULT;
      if (!/^https?:\/\//i.test(url)) url = "https://" + url;
      store.set("nova_panic", JSON.stringify({ key: chosen, url }));
      location.reload();
    });
    document.getElementById("panic-off").addEventListener("click", () => {
      store.del("nova_panic");
      location.reload();
    });
  }

  /* ── popover panels ── */
  function closePanels() { document.querySelectorAll(".panel").forEach((p) => (p.hidden = true)); }
  document.querySelectorAll("[data-panel]").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const panel = document.getElementById(btn.dataset.panel);
      const wasHidden = panel.hidden;
      closePanels();
      panel.hidden = !wasHidden;
    };
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".panel")) closePanels(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanels(); });

  /* ── pop-up updates ── */
  const popups = document.querySelector(".popups");
  if (popups) {
    const dismiss = (el) => {
      el.classList.add("leaving");
      setTimeout(() => { el.remove(); if (!popups.querySelector(".popup")) popups.remove(); }, 250);
    };
    popups.querySelectorAll(".popup-close").forEach((b) =>
      b.addEventListener("click", () => dismiss(b.closest(".popup"))));
    // Fade out on their own after a while, unless the mouse is over them.
    let hideTimer;
    const schedule = () => { hideTimer = setTimeout(() => popups.querySelectorAll(".popup").forEach(dismiss), 12000); };
    popups.addEventListener("mouseenter", () => clearTimeout(hideTimer));
    popups.addEventListener("mouseleave", schedule);
    schedule();
  }

  /* ── confirm before destructive admin actions ── */
  document.querySelectorAll("[data-confirm]").forEach((el) => {
    el.addEventListener("click", (e) => { if (!confirm(el.dataset.confirm)) e.preventDefault(); });
  });

  /* ── admin: chart tooltip ── */
  document.querySelectorAll(".chart-wrap").forEach((wrap) => {
    const tip = wrap.querySelector(".chart-tip");
    wrap.querySelectorAll(".hit").forEach((hit) => {
      hit.addEventListener("mouseenter", () => {
        const box = hit.getBoundingClientRect(), outer = wrap.getBoundingClientRect();
        tip.textContent = hit.dataset.tip;
        tip.style.left = `${box.left - outer.left + box.width / 2}px`;
        tip.style.top = `${Math.max(box.top - outer.top, 0) + 6}px`;
        tip.hidden = false;
      });
      hit.addEventListener("mouseleave", () => (tip.hidden = true));
    });
  });

  /* ── admin: select all games ── */
  document.getElementById("select-all")?.addEventListener("change", (e) => {
    document.querySelectorAll(".pick").forEach((c) => (c.checked = e.target.checked));
  });

  /* ── game library: search, genre filter, favorites ── */
  const grid = document.getElementById("grid");
  if (grid) {
    const search = document.getElementById("search");
    const cards = [...grid.querySelectorAll(".game")];
    const emptyMsg = document.getElementById("empty");
    let genre = "All";

    function filter() {
      const q = search.value.toLowerCase().trim();
      let shown = 0;
      cards.forEach((c) => {
        const ok = (!q || c.dataset.search.includes(q)) &&
          (genre === "All" || c.dataset.genres.split("|").includes(genre));
        c.hidden = !ok;
        if (ok) shown++;
      });
      emptyMsg.hidden = shown > 0;
    }
    search.addEventListener("input", filter);

    const sorters = {
      popular: (a, b) => a.dataset.rank - b.dataset.rank,
      az: (a, b) => a.dataset.name.localeCompare(b.dataset.name, undefined, { sensitivity: "base", numeric: true }),
      new: (a, b) => b.dataset.id - a.dataset.id,
    };
    document.querySelectorAll("[data-sort]").forEach((btn) => {
      btn.onclick = () => {
        document.querySelectorAll("[data-sort]").forEach((x) => x.classList.toggle("active", x === btn));
        [...cards].sort(sorters[btn.dataset.sort]).forEach((c) => grid.insertBefore(c, emptyMsg));
      };
    });
    document.querySelectorAll("[data-genre]").forEach((p) => {
      p.onclick = () => {
        document.querySelectorAll("[data-genre]").forEach((x) => x.classList.remove("active"));
        p.classList.add("active");
        genre = p.dataset.genre;
        filter();
      };
    });
    // "/" jumps to search
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement !== search) { e.preventDefault(); search.focus(); }
    });

    grid.addEventListener("click", async (e) => {
      const star = e.target.closest(".star");
      if (!star) return;
      const res = await fetch(`/api/favorite/${star.dataset.id}`, {
        method: "POST", headers: { "X-CSRF-Token": csrf },
      });
      if (!res.ok) return;
      const { favorite } = await res.json();
      star.classList.toggle("on", favorite);
      star.title = favorite ? "Remove from favorites" : "Add to favorites";
      renderFavs();
    });

    function renderFavs() {
      const list = document.getElementById("favs");
      const favCards = cards.filter((c) => c.querySelector(".star.on"));
      list.innerHTML = "";
      if (!favCards.length) {
        list.innerHTML = '<div class="muted small">Star a game to pin it here.</div>';
        return;
      }
      favCards.forEach((c) => {
        const a = document.createElement("a");
        a.className = "fav-item";
        a.href = c.dataset.play;
        if (c.dataset.image) a.style.backgroundImage = `url("${c.dataset.image}")`;
        const span = document.createElement("span");
        span.textContent = c.dataset.name;
        a.appendChild(span);
        list.appendChild(a);
      });
    }
    renderFavs();
  }

  /* ── player: raw HTML files (e.g. raw.githubusercontent.com) ──
     Those are sent as plain text, so download the HTML, add a <base> tag so the
     game's relative paths still point at the original folder, and run it. */
  const rawFrame = document.querySelector("#game-frame[data-raw-src]");
  if (rawFrame) {
    const url = rawFrame.dataset.rawSrc;
    const status = document.getElementById("game-status");
    const withBase = (html) => {
      const base = `<base href="${url.slice(0, url.lastIndexOf("/") + 1)}">`;
      return /<head[^>]*>/i.test(html) ? html.replace(/<head([^>]*)>/i, `<head$1>${base}`) : base + html;
    };
    const loaded = fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
      .then(withBase);
    loaded
      .then((html) => {
        rawFrame.src = URL.createObjectURL(new Blob([html], { type: "text/html" }));
        rawFrame.hidden = false;
        status.remove();
        rawFrame.focus();
      })
      .catch((err) => {
        status.innerHTML = "";
        const p = document.createElement("p");
        p.textContent = `Couldn't load this game (${err.message}). The link may be broken or blocked on this network.`;
        status.appendChild(p);
      });
    document.getElementById("open-tab")?.addEventListener("click", () => {
      const w = window.open("about:blank");
      if (!w) return;
      loaded.then((html) => { w.document.open(); w.document.write(html); w.document.close(); })
        .catch(() => w.close());
    });
  }

  /* ── show / hide password ── */
  document.querySelectorAll('input[type="password"]').forEach((input) => {
    const wrap = document.createElement("span");
    wrap.className = "pw-wrap";
    input.replaceWith(wrap);
    wrap.appendChild(input);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pw-toggle";
    btn.textContent = "Show";
    btn.setAttribute("aria-label", "Show password");
    btn.addEventListener("click", () => {
      const hidden = input.type === "password";
      input.type = hidden ? "text" : "password";
      btn.textContent = hidden ? "Hide" : "Show";
      btn.setAttribute("aria-label", hidden ? "Hide password" : "Show password");
      input.focus();
    });
    wrap.appendChild(btn);
  });

  /* ── player: fullscreen ── */
  document.getElementById("fullscreen")?.addEventListener("click", () => {
    document.getElementById("game-frame")?.requestFullscreen?.();
  });
})();
