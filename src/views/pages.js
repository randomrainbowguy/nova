import { html, raw } from "hono/html";
import { csrfField, asset } from "./layout.js";
import { plural, timeAgo } from "../lib/util.js";

const art = (game, cls = "") => html`
  <span class="hv-noart ${cls}" style="--h: ${(game.id * 47) % 360}">${(game.name || "?").slice(0, 1)}</span>
  ${game.image ? html`<img class="${cls}" src="${game.image}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ""}`;

/* ── games home ── */
export function indexPage(c, me, d) {
  const { games, favs, genres, latest_poll, featured, trending, new_count, early_count } = d;
  return html`
<main class="page home-v2">
  <section class="hv-hero">
    <div class="hv-hello">
      <span class="pp-eyebrow hv-eyebrow">✦ Welcome back</span>
      <h1>What are we playing,<br><span class="hv-name">${me.name}</span>?</h1>
      <label class="hv-search">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input id="search" type="search" placeholder="Search ${games.length} games…" autocomplete="off" aria-label="Search games">
        <kbd>/</kbd>
      </label>
      <div class="hv-chips">
        <span class="hv-chip"><b>${games.length}</b> games</span>
        ${new_count && new_count < games.length ? html`<span class="hv-chip"><b>${new_count}</b> new this week</span>` : ""}
        ${me.is_pro
          ? (early_count ? html`<a class="hv-chip gold" href="/pro"><b>${early_count}</b> in Pro early access</a>` : "")
          : html`<a class="hv-chip gold" href="/pro">★ Get Pro: new games first</a>`}
      </div>
    </div>
    ${featured ? html`
    <a class="hv-feature" href="/play/${featured.id}">
      <img src="${featured.image}" alt="" onerror="this.remove()">
      <div class="hv-feature-body">
        <span class="hv-kicker">🔥 Most played this week</span>
        <h2>${featured.name}</h2>
        ${featured.description ? html`<p>${featured.description}</p>` : ""}
        <span class="hv-play">▶ Play now</span>
      </div>
    </a>` : ""}
  </section>

  ${trending.length ? html`
  <section class="hv-section">
    <div class="hv-head"><h2>Trending</h2><span class="muted small">What everyone's playing right now</span></div>
    <div class="hv-rail">
      ${trending.map((g, i) => html`
      <a class="hv-trend" href="/play/${g.id}">
        <span class="hv-rank">${i + 2}</span>
        ${art(g)}
        <span class="hv-trend-name">${g.name}</span>
      </a>`)}
    </div>
  </section>` : ""}

  <section class="hv-section hv-split">
    <div>
      <div class="hv-head"><h2>Your favorites</h2><span class="muted small">Tap ★ on any game to pin it</span></div>
      <div class="hv-favs" id="favs"></div>
    </div>
    ${latest_poll ? html`
    <a class="hv-poll" href="/polls#poll-${latest_poll.id}">
      <span class="hv-kicker">🗳 Open poll</span>
      <b>${latest_poll.question}</b>
      <span class="hv-poll-go">Vote →</span>
    </a>` : ""}
  </section>

  <section class="hv-section">
    <div class="hv-head hv-libhead">
      <div><h2>All games</h2><span class="muted small" id="lib-count">${games.length} to choose from</span></div>
      <div class="hv-seg" role="group" aria-label="Sort games">
        <button class="pill active" data-sort="popular">Popular</button>
        <button class="pill" data-sort="az">A–Z</button>
        <button class="pill" data-sort="new">Newest</button>
      </div>
    </div>
    ${genres.length ? html`
    <div class="hv-genres">
      <button class="pill active" data-genre="All">All</button>
      ${genres.map((g) => html`<button class="pill" data-genre="${g}">${g}</button>`)}
    </div>` : ""}

    <div class="hv-grid" id="grid">
      ${games.map((game, i) => html`
      <article class="game hv-card" data-name="${game.name}" data-image="${game.image}" data-id="${game.id}" data-rank="${i}"
        data-play="/play/${game.id}" data-genres="${game.genreList.join("|")}"
        data-search="${`${game.name} ${game.description || ""} ${game.genreList.join(" ")}`.toLowerCase()}">
        <a class="hv-art" href="/play/${game.id}" aria-label="Play ${game.name}">
          ${art(game)}
          <span class="hv-art-play" aria-hidden="true">▶</span>
        </a>
        <div class="hv-badges">
          ${game.early ? html`<span class="hv-badge gold">★ Early access</span>`
            : i < 3 && game.recent > 0 ? html`<span class="hv-badge">🔥 Top ${i + 1}</span>` : ""}
        </div>
        <button class="star${favs.has(game.id) ? " on" : ""}" data-id="${game.id}"
          title="${favs.has(game.id) ? "Remove from favorites" : "Add to favorites"}" aria-label="Favorite ${game.name}">★</button>
        <div class="hv-card-body">
          <h3>${game.name}</h3>
          <span>${game.genreList.length ? game.genreList.join(" · ") : "Game"}</span>
        </div>
      </article>`)}
      <div class="empty" id="empty" ${games.length ? raw("hidden") : ""}>
        ${games.length ? "No games match that search." : "No games yet. Check back soon!"}
      </div>
    </div>
  </section>
</main>`;
}

/* ── player ── */
export function playPage(c, game, src, mode) {
  // mode: "raw" (HTML text fetched and run in a blob frame), "frame" (normal page)
  return html`
<div class="player">
  <div class="player-bar">
    <a class="btn ghost small" href="/">← Back</a>
    <h2>${game.name}</h2>
    ${mode === "raw"
      ? html`<button class="btn ghost small" id="open-tab">Open in new tab</button>`
      : html`<a class="btn ghost small" href="${src}" target="_blank" rel="noopener">Open in new tab</a>`}
    <button class="btn small" id="fullscreen">Fullscreen</button>
  </div>
  ${mode === "raw" ? html`
  <div class="player-status" id="game-status"><div class="spinner"></div><p>Loading ${game.name}…</p></div>
  <iframe id="game-frame" data-raw-src="${src}" allow="fullscreen; autoplay; gamepad; clipboard-write" allowfullscreen hidden></iframe>`
  : html`<iframe id="game-frame" src="${src}" allow="fullscreen; autoplay; gamepad; clipboard-write" allowfullscreen></iframe>`}
</div>`;
}

export const playScripts = html`<script src="${asset("game-sanitize.js")}"></script>`;

/* ── polls ── */
function pollCard(c, p) {
  const { poll } = p;
  const top = p.options.length ? Math.max(...p.options.map((o) => o.votes)) : 0;
  const showResults = !!p.my_vote || !poll.is_open;
  return html`
<section class="poll-card${poll.is_open ? "" : " is-closed"}" id="poll-${poll.id}">
  <header class="poll-head">
    <div class="poll-meta">
      ${poll.is_open ? html`<span class="live-dot"></span><span>Live</span>` : html`<span>Closed</span>`}
      <span class="sep">·</span><span>${p.total} ${plural(p.total, "vote")}</span>
      <span class="sep">·</span><span>${timeAgo(poll.created_at)}</span>
    </div>
    <h2>${poll.question}</h2>
  </header>
  ${p.options.length ? html`
  <form method="post" action="/polls/${poll.id}/vote" class="poll-options${showResults ? " results" : " choices"}">
    ${csrfField(c)}
    ${p.options.map((o) => {
      const pct = p.total ? Math.round((o.votes * 100) / p.total) : 0;
      const leading = top > 0 && o.votes === top;
      const mine = o.id === p.my_vote;
      return html`
    <button class="poll-row${mine ? " mine" : ""}${showResults && leading ? " leading" : ""}" name="option" value="${o.id}"
      ${poll.is_open ? "" : raw("disabled")} title="${mine ? "Your vote" : poll.is_open ? "Vote for this" : ""}">
      ${showResults ? html`<span class="poll-fill" style="width: ${pct}%"></span>` : ""}
      <span class="poll-check" aria-hidden="true">${mine ? "✓" : ""}</span>
      <span class="poll-label">
        ${o.label}
        ${showResults && leading ? html`<span class="chip lead">${poll.is_open ? "👑 Leading" : "🏆 Winner"}</span>` : ""}
        ${mine ? html`<span class="chip you">Your vote</span>` : ""}
      </span>
      ${showResults ? html`<span class="poll-num"><b>${pct}%</b><small>${o.votes}</small></span>` : ""}
    </button>`;
    })}
  </form>
  ${poll.is_open ? html`<p class="poll-hint">${p.my_vote ? "Tap another option to change your vote." : "Pick one. Results show after you vote."}</p>` : ""}`
  : html`<p class="poll-hint">No options yet.</p>`}
</section>`;
}

export function pollsPage(c, polls) {
  const open = polls.filter((p) => p.poll.is_open);
  const closed = polls.filter((p) => !p.poll.is_open);
  return html`
<main class="page medium">
  <div class="page-head"><div><span class="pp-eyebrow hv-eyebrow">🗳 Polls</span><h1>Have your say</h1><p>Vote on what gets added next.</p></div></div>
  ${open.map((p) => pollCard(c, p))}
  ${open.length ? "" : html`<div class="poll-empty"><div aria-hidden="true">🗳️</div><p>No polls running right now. Check back soon!</p></div>`}
  ${closed.length ? html`<h3 class="section-label">Past polls</h3>${closed.map((p) => pollCard(c, p))}` : ""}
</main>`;
}

/* ── updates ── */
const KIND = {
  game: { icon: "🎮", label: "New game", cta: "Play" },
  poll: { icon: "🗳️", label: "Poll", cta: "Vote" },
  peek: { icon: "🔮", label: "Sneak peek", cta: "Open" },
  announce: { icon: "📣", label: "Announcement", cta: "Open" },
};

function dayGroup(ts) {
  const then = Date.parse(ts.replace(" ", "T") + "Z");
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days < 1) return "Today";
  if (days < 7) return "This week";
  if (days < 31) return "This month";
  return "Earlier";
}

export function notificationsPage(c, notes, seen, canDelete) {
  const groups = [];
  for (const n of notes) {
    const name = dayGroup(n.created_at);
    if (!groups.length || groups[groups.length - 1].name !== name) groups.push({ name, items: [] });
    groups[groups.length - 1].items.push(n);
  }
  const unread = notes.filter((n) => n.id > seen).length;
  const kinds = new Set(notes.map((n) => (n.audience === "pro" ? "pro" : n.kind)));
  const filters = [["all", "All"], ["game", "Games"], ["poll", "Polls"], ["announce", "Announcements"], ["pro", "Pro"]]
    .filter(([k]) => k === "all" || kinds.has(k));
  return html`
<main class="page medium updates-page">
  <div class="page-head">
    <div>
      <span class="pp-eyebrow hv-eyebrow">📣 Updates</span>
      <h1>What's new</h1>
      <p>${unread ? html`<b class="accent-text">${unread} new</b> since your last visit · ` : ""}New games, polls and announcements. <a href="/account">Email settings</a></p>
    </div>
  </div>
  ${filters.length > 2 ? html`
  <div class="hv-genres" role="group" aria-label="Filter updates">
    ${filters.map(([k, label], i) => html`<button class="pill${i === 0 ? " active" : ""}" data-note-filter="${k}">${label}</button>`)}
  </div>` : ""}
  ${groups.length ? groups.map((g) => html`
  <section class="up-group">
    <h3 class="section-label">${g.name}</h3>
    <div class="up-list">
      ${g.items.map((n) => {
        const k = KIND[n.kind] || KIND.announce;
        const pro = n.audience === "pro";
        return html`
      <article class="up-item kind-${n.kind}${n.id > seen ? " unread" : ""}" data-kind="${pro ? "pro" : n.kind}">
        <div class="up-icon" aria-hidden="true">${k.icon}</div>
        <div class="up-body">
          <div class="up-meta">
            <span class="up-kind">${pro && n.kind !== "peek" ? "Pro · " : ""}${n.kind === "game" && pro ? "Early access" : k.label}</span>
            <span class="sep">·</span>
            <time datetime="${n.created_at.replace(" ", "T")}Z" title="${n.created_at} UTC">${timeAgo(n.created_at)}</time>
            ${n.id > seen ? html`<span class="up-new">New</span>` : ""}
          </div>
          <h3>${n.title}</h3>
          ${n.body ? html`<p>${n.body}</p>` : ""}
        </div>
        <div class="up-actions">
          ${n.link ? html`<a class="btn small" href="${n.link}">${k.cta} →</a>` : ""}
          ${canDelete ? html`
          <form method="post" action="/admin/notification/${n.id}/delete">
            ${csrfField(c)}<button class="icon-btn danger" data-confirm="Delete this update?" title="Delete" aria-label="Delete update">✕</button>
          </form>` : ""}
        </div>
      </article>`;
      })}
    </div>
  </section>`) : html`
  <div class="poll-empty"><div aria-hidden="true">📭</div><p>Nothing yet. New games, polls and announcements will show up here.</p></div>`}
</main>`;
}

/* ── account & auth ── */
export function accountPage(c, me) {
  return html`
<main class="page medium">
  <div class="page-head"><div><span class="pp-eyebrow hv-eyebrow">⚙ Account</span><h1>Your account</h1><p>Signed in as ${me.name} · ${me.email}</p></div></div>
  ${me.must_change_pw ? html`<div class="notice">You're using a temporary password. Pick a new one below to keep going.</div>` : ""}
  <div class="stack">
    <form class="card form" method="post">
      ${csrfField(c)}<input type="hidden" name="action" value="email_prefs">
      <h2>Your details</h2>
      <label>Name <input class="input" name="name" value="${me.name}" maxlength="40" required></label>
      <label>Email (you log in with this) <input class="input" name="email" type="email" value="${me.email}" required></label>
      <label class="check"><input type="checkbox" name="email_opt_in" ${me.email_opt_in ? raw("checked") : ""}> Email me about new games, polls and announcements</label>
      <div><button class="btn">Save</button></div>
    </form>
    <form class="card form" method="post">
      ${csrfField(c)}<input type="hidden" name="action" value="password">
      <h2>Change password</h2>
      <div class="row">
        <label>${me.must_change_pw ? "Temporary password" : "Current password"} <input class="input" name="current" type="password" required autocomplete="current-password"></label>
        <label>New password <input class="input" name="new" type="password" minlength="6" required autocomplete="new-password"></label>
      </div>
      <p class="pw-note">💡 Save this password somewhere safe, like your notes app, so you won't forget it.</p>
      <div><button class="btn">Change password</button></div>
    </form>
  </div>
</main>`;
}

const authShell = (title, sub, inner) => html`
<main class="auth">
  <div class="auth-card">
    <a class="auth-logo" href="/">✦</a>
    <h1>${title}</h1>
    ${sub ? html`<p class="muted">${sub}</p>` : ""}
    ${inner}
  </div>
</main>`;

export const loginPage = (c, site, loginId) => authShell(`Log in to ${site}`, "Welcome back. Log in to play.", html`
  <form class="form" method="post">
    ${csrfField(c)}
    <label>Email <input class="input" name="email" type="text" value="${loginId}" required autofocus autocomplete="email"></label>
    <label>Password <input class="input" name="password" type="password" required autocomplete="current-password"></label>
    <button class="btn full big">Log in</button>
    <p class="muted small center"><a href="/forgot">Forgot password?</a> · No account? <a href="/signup">Request access</a></p>
  </form>`);

export function signupPage(c, site, mode, form) {
  const sub = mode === "closed" ? "Sign-ups are closed right now." : mode === "open" ? "Make an account to start playing." : "Request access. The admin will approve you.";
  return authShell(`Join ${site}`, sub, mode === "closed" ? html`<p class="center"><a class="btn ghost" href="/login">Back to log in</a></p>` : html`
  <form class="form" method="post">
    ${csrfField(c)}
    <label>Your name <input class="input" name="name" value="${form.name || ""}" maxlength="40" required autofocus autocomplete="name" placeholder="e.g. Sam Lee"></label>
    <label>Email <input class="input" name="email" type="email" value="${form.email || ""}" required autocomplete="email"></label>
    <label>Password <input class="input" name="password" type="password" minlength="6" required autocomplete="new-password"></label>
    <p class="pw-note">💡 Save this password somewhere safe, like your notes app, so you won't forget it.</p>
    ${mode === "approval" ? html`
    <label>Anything else? (optional, helps the admin approve you)
      <input class="input" name="reason" value="${form.reason || ""}" maxlength="300" placeholder="e.g. from 3rd period">
    </label>` : ""}
    <button class="btn full big">${mode === "open" ? "Sign up" : "Request access"}</button>
    <p class="muted small center">Already have an account? <a href="/login">Log in</a></p>
  </form>`);
}

export const forgotPage = (c) => authShell("Forgot password", "The admin will reset it and give you a temporary password.", html`
  <form class="form" method="post">
    ${csrfField(c)}
    <label>Email you signed up with <input class="input" name="email" type="email" required autofocus autocomplete="email"></label>
    <label>Note for the admin (optional) <input class="input" name="note" maxlength="200" placeholder="e.g. it's Sam from 3rd period"></label>
    <button class="btn full big">Send request</button>
    <p class="muted small center"><a href="/login">Back to log in</a></p>
  </form>`);

export const setupPage = (c, site, form, fromSecret) => authShell(`Set up ${site}`,
  fromSecret ? raw("You need the setup code: the <code>OWNER_SETUP_CODE</code> secret you set in Cloudflare.")
    : raw("You need the setup code. It's in the Worker's logs: Cloudflare dashboard → your Worker → <b>Logs</b> (look for \"Setup code\")."), html`
  <form class="form" method="post">
    ${csrfField(c)}<input type="hidden" name="action" value="owner">
    <h2 class="auth-sub">Start fresh</h2>
    <label>Setup code <input class="input" name="code" required autocomplete="off" value="${form.code || ""}"></label>
    <label>Your name <input class="input" name="name" value="${form.name || ""}" maxlength="40" required autocomplete="name"></label>
    <label>Email <input class="input" name="email" type="email" value="${form.email || ""}" required autocomplete="email"></label>
    <label>Password (8+ characters) <input class="input" name="password" type="password" minlength="8" required autocomplete="new-password"></label>
    <p class="pw-note">💡 Save this password somewhere safe, like your notes app, so you won't forget it.</p>
    <button class="btn full big">Create owner account</button>
  </form>
  <form class="form auth-alt" method="post" enctype="multipart/form-data">
    ${csrfField(c)}<input type="hidden" name="action" value="import">
    <h2 class="auth-sub">Moving from the old site?</h2>
    <p class="muted small">Upload <code>nova-data.sql</code> (made by <code>scripts/export-to-d1.py</code>) to bring over every account, game, poll and update. Everyone keeps their password.</p>
    <label>Setup code <input class="input" name="code" required autocomplete="off"></label>
    <label>nova-data.sql <input class="input" type="file" name="data_file" accept=".sql,.txt" required></label>
    <button class="btn ghost full">Import old site</button>
  </form>`);

export const waitingPage = (c, me) => authShell(me.status === "banned" ? "You've been banned" : "Waiting for approval",
  me.status === "banned" ? (me.ban_reason || "The admin has removed your access.")
    : html`Hi ${me.name}! Your request is in. You'll get an email at <b>${me.email}</b> once the admin lets you in.`, html`
  <div class="form">
    ${me.status === "banned" ? "" : html`<a class="btn ghost full" href="/waiting">Check again</a>`}
    <form method="post" action="/logout">${csrfField(c)}<button class="btn ghost full">Log out</button></form>
  </div>`);

export const messagePage = (title, text) => authShell(title, text, html`<a class="btn ghost full" href="/">Back home</a>`);

export function moviesPage(c, me, doc) {
  return html`
<main class="page medium">
  <div class="page-head"><div><span class="pp-eyebrow hv-eyebrow">🎬 Movies</span><h1>Movie night</h1><p>Heads up: not every link works, but most of them do.</p></div></div>
  <div class="card feature-card">
    ${doc ? html`
    <div class="feature-ico">🍿</div>
    <div><h2>The full movie list</h2><p class="muted">Everything is in one doc. Open it and pick something.</p></div>
    <a class="btn" href="${doc}" target="_blank" rel="noopener">Open the movies list ↗</a>`
    : html`
    <div class="feature-ico">🍿</div>
    <div><h2>Coming soon</h2><p class="muted">The movie list isn't up yet. Check back later!
      ${me.is_owner ? html`Add the doc link in <a href="/admin?tab=settings">Admin → Settings</a>.` : ""}</p></div>`}
  </div>
</main>`;
}
