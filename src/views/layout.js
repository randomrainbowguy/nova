import { html, raw } from "hono/html";
import { PRO_THEMES, ROLES } from "../lib/core.js";
import { plural, truncate, safeLink } from "../lib/util.js";

// Bump when public/static files change so browsers fetch the new copy.
export const ASSET_VERSION = "20261006";
export const asset = (path) => `/static/${path}?v=${ASSET_VERSION}`;

export const csrfField = (c) => html`<input type="hidden" name="csrf" value="${c.var.session.get("csrf")}">`;

const icon = {
  eye: raw('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'),
  user: raw('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>'),
  menu: raw('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'),
};

const POPUP_LABEL = { poll: "New poll", peek: "Pro sneak peek" };
const POPUP_ICON = { game: "🎮", poll: "🗳️", peek: "🔮" };
const POPUP_CTA = { game: "Play now", poll: "Vote" };

function roleButtons(c, me) {
  return Object.entries(ROLES).filter(([k]) => k !== "both").map(([key, [label]]) =>
    html`<button class="pill${key === me.viewing_as ? " active" : ""}" name="role" value="${key}">${label}</button>`);
}

function topbar(c, g) {
  const { me, page } = g;
  const link = (href, name, label, extra = "") =>
    html`<a href="${href}" class="${page === name ? "active" : ""}${extra}">${label}</a>`;
  return html`
  <header class="topbar">
    <a class="logo" href="/">✦ ${g.site_name}${me.is_premium ? html`<span class="pro-badge" title="Pro member">PRO</span>` : ""}</a>
    <button class="icon-btn nav-toggle" data-nav-toggle aria-label="Menu">${icon.menu}</button>
    <nav class="nav" id="nav">
      ${link("/", "index", "Games")}
      ${link("/movies", "movies", "Movies")}
      ${link("/polls", "polls", "Polls")}
      ${link("/notifications", "notifications", html`Updates${g.unread_count ? html`<span class="badge">${g.unread_count}</span>` : ""}`)}
      ${me.is_pro ? link("/chat", "chat", "Chat") : ""}
      ${link("/pro", "pro", me.is_pro ? "Pro" : "★ Get Pro", me.is_pro ? "" : " get-pro")}
      ${me.is_staff && me.status === "approved"
        ? link("/admin", "admin", html`Admin${g.pending_count ? html`<span class="badge">${g.pending_count}</span>` : ""}`) : ""}
    </nav>
    <div class="top-actions">
      <button class="icon-btn" id="cloak-btn" data-panel="cloak-panel" title="Tab cloak & panic key" aria-label="Tab cloak">${icon.eye}</button>
      <button class="icon-btn" data-panel="me-panel" title="${me.name}" aria-label="Account menu">${icon.user}</button>
    </div>
  </header>

  <div class="panel" id="cloak-panel" hidden>
    <h4>Tab cloak</h4>
    <p class="hint">Change this tab's title and icon. Stays on across pages.</p>
    <div class="preset-grid">
      <button class="btn ghost small" data-cloak-title="Dashboard" data-cloak-icon="https://canvas.instructure.com/favicon.ico">Canvas</button>
      <button class="btn ghost small" data-cloak-title="Google Docs" data-cloak-icon="https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico">Google Docs</button>
      <button class="btn ghost small" data-cloak-title="Google Classroom" data-cloak-icon="https://ssl.gstatic.com/classroom/favicon.png">Classroom</button>
      <button class="btn ghost small" data-cloak-title="Khan Academy" data-cloak-icon="https://cdn.kastatic.org/images/favicon.ico">Khan Academy</button>
      <button class="btn ghost small" data-cloak-title="Wikipedia" data-cloak-icon="https://en.wikipedia.org/favicon.ico">Wikipedia</button>
    </div>
    <input class="input" id="cloak-title" placeholder="Tab title">
    <input class="input" id="cloak-icon" placeholder="Icon URL (optional)">
    <div class="preset-grid">
      <button class="btn small" id="cloak-apply">Apply</button>
      <button class="btn ghost small" id="cloak-reset">Reset</button>
    </div>

    <h4 class="panel-section">Panic key</h4>
    <p class="hint">Press it anywhere on the site to instantly leave for another page. Back won't bring you here.</p>
    <button class="btn ghost" id="panic-key">Click, then press a key</button>
    <input class="input" id="panic-url" placeholder="Go to (e.g. canvas.instructure.com)">
    <div class="preset-grid">
      <button class="btn small" id="panic-save">Save</button>
      <button class="btn ghost small" id="panic-off">Turn off</button>
    </div>
  </div>

  <div class="panel" id="me-panel" hidden>
    <div class="me-head">
      <span class="avatar" style="--h:${(me.id * 47) % 360}">${(me.name || "?").slice(0, 1).toUpperCase()}</span>
      <div><b>${me.name}</b><span class="muted small">${me.is_staff ? me.role_label : me.is_premium ? "Pro member" : "Player"}</span></div>
    </div>
    <div class="label">Theme</div>
    <div class="preset-grid">
      <button class="pill" data-set-theme="nova">Nova</button>
      <button class="pill" data-set-theme="neon">Neon</button>
      <button class="pill" data-set-theme="rootbeer">Root Beer</button>
      <button class="pill" data-set-theme="hacker">Hacker</button>
    </div>
    <div class="label">Pro themes${me.is_pro ? "" : " 🔒"}</div>
    <div class="preset-grid">
      ${Object.entries(PRO_THEMES).map(([key, label]) => me.is_pro
        ? html`<button class="pill" data-set-theme="${key}">${label}</button>`
        : html`<a class="pill locked" href="/pro" title="Pro only">🔒 ${label}</a>`)}
    </div>
    ${me.real_owner ? html`
    <div class="label">View site as</div>
    <form method="post" action="/preview" class="preset-grid">${csrfField(c)}${roleButtons(c, me)}</form>` : ""}
    <a class="btn ghost" href="/account">Account &amp; emails</a>
    <form method="post" action="/logout">${csrfField(c)}<button class="btn ghost full">Log out</button></form>
  </div>`;
}

function popupsBlock(g) {
  if (!g.popups.length) return "";
  return html`
  <div class="popups" aria-live="polite">
    ${g.popups.map((n, i) => {
      const label = n.kind === "game" ? (n.audience === "pro" ? "Early access" : "New game") : POPUP_LABEL[n.kind] || "Announcement";
      const title = (n.kind === "game" || n.kind === "poll") && n.title.includes(": ") ? n.title.split(": ").slice(1).join(": ") : n.title;
      return html`
      <div class="popup kind-${n.kind}" style="animation-delay: ${(i * 0.12).toFixed(2)}s">
        <div class="popup-icon" aria-hidden="true">${POPUP_ICON[n.kind] || "📣"}</div>
        <div class="popup-body">
          <div class="popup-label">${label}</div>
          <div class="popup-title">${title}</div>
          ${n.body && n.kind !== "poll" ? html`<div class="popup-text">${truncate(n.body, 110)}</div>` : ""}
          ${safeLink(n.link) ? html`<a class="btn small" href="${safeLink(n.link)}">${POPUP_CTA[n.kind] || "Open"}</a>` : ""}
        </div>
        <button class="popup-close" aria-label="Dismiss">×</button>
      </div>`;
    })}
    ${g.popup_more ? html`<a class="popup popup-more" href="/notifications">+${g.popup_more} more ${plural(g.popup_more, "update")} →</a>` : ""}
  </div>`;
}

/** The page shell. opts: { title, page, bare (no top bar), head (extra <head> html), scripts } */
export function layout(c, g, body, opts = {}) {
  const { me } = g;
  const title = opts.title ? `${opts.title} · ${g.site_name}` : g.site_name;
  const showBar = !opts.bare && me && (me.status === "approved" || me.is_owner);
  return html`<!DOCTYPE html>
<html lang="en"${me && me.is_pro ? raw(" data-pro") : ""}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="csrf" content="${c.var.session.get("csrf")}">
  <meta name="color-scheme" content="dark">
  <title>${title}</title>
  <link rel="icon" href="${asset("icon.svg")}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${asset("style.css")}">
  <script>try{var t=localStorage.getItem("nova_theme"),d=document.documentElement,pro=${raw(JSON.stringify(Object.keys(PRO_THEMES)))};if(t&&t!=="nova"&&(d.hasAttribute("data-pro")||pro.indexOf(t)<0))d.dataset.theme=t}catch(e){}</script>
  ${opts.head || ""}
</head>
<body class="${opts.bodyClass || ""}">
  ${me && me.viewing_as ? html`
  <div class="preview-bar">
    <span>👁 Viewing the site as <b>${ROLES[me.viewing_as][0]}</b>. Anything you do here is real.</span>
    <form method="post" action="/preview" class="preview-switch">${csrfField(c)}${roleButtons(c, me)}</form>
    <form method="post" action="/preview/exit">${csrfField(c)}<button class="btn small">Exit preview</button></form>
  </div>` : ""}
  ${showBar ? topbar(c, g) : ""}
  ${g.flashes.length ? html`<div class="flashes" role="status">${g.flashes.map(([cat, msg]) =>
    html`<div class="flash ${cat}">${msg}<button class="flash-x" aria-label="Dismiss">×</button></div>`)}</div>` : ""}
  ${popupsBlock(g)}
  ${body}
  <canvas id="matrix" aria-hidden="true"></canvas>
  <script src="${asset("app.js")}"></script>
  ${opts.scripts || ""}
</body>
</html>`;
}
