import { html, raw } from "hono/html";
import { csrfField } from "./layout.js";
import { PERMS, ROLES } from "../lib/core.js";
import { g, plural, truncate } from "../lib/util.js";

const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const REQ_LABEL = { open: "open", added: "added", declined: "can't add" };
const TAB_ICONS = { users: "👥", games: "🎮", import: "📥", polls: "🗳", announce: "📣", pro: "★", stats: "📈", settings: "⚙" };

function statTiles(items) {
  return html`<div class="stats">${items.map(([v, label]) => html`<div class="stat"><b>${v}</b><span>${label}</span></div>`)}</div>`;
}

/* ── people ── */
function usersTab(c, me, d) {
  const resets = d.users.filter((u) => u.reset_at);
  return html`
  <section class="card">
    <div class="card-head">
      <h2>People</h2>
      <span class="muted small">Sign-ups: <b>${d.access_mode}</b></span>
    </div>
    <p class="muted small help">
      <b>Allow</b> lets them in. <b>Ignore</b> keeps them locked out without telling them (they still see "waiting").
      <b>Ban</b> locks them out and shows them they're banned. ${me.is_owner ? "Use the Role menu to let someone help run the site." : ""}
    </p>
    ${resets.length ? html`
    <div class="reset-requests">
      <h3>🔑 Forgot-password requests</h3>
      ${resets.map((u) => html`
      <div class="reset-row">
        <div><b>${u.name}</b> <span class="muted small">${u.email} · ${u.reset_at.slice(0, 16)} UTC</span><br><span class="small">${u.reset_note}</span></div>
        ${u.is_owner || (u.is_staff && !me.is_owner) ? html`<span class="muted small">Only the owner can reset staff</span>` : html`
        <form method="post" action="/admin/user/${u.id}" class="actions">
          ${csrfField(c)}
          <button class="btn good small" name="action" value="reset_pw" data-confirm="Give ${u.name} a new temporary password? Only do this if you know it's really them.">Reset password</button>
          <button class="btn ghost small" name="action" value="dismiss_reset">Dismiss</button>
        </form>`}
      </div>`)}
      <p class="muted small">Make sure it's really them before you hand over a temporary password.</p>
    </div>` : ""}
    <div class="people">
      ${d.users.map((u) => {
        const locked = u.is_owner || (u.is_staff && !me.is_owner);
        return html`
      <div class="person">
        <span class="avatar" style="--h:${(u.id * 47) % 360}">${(u.name || "?").slice(0, 1).toUpperCase()}</span>
        <div class="person-main">
          <div class="person-name"><b>${u.name}</b>
            <span class="status ${u.status}">${u.status}</span>
            ${u.is_staff ? html`<span class="status admin">${u.role_label}</span>` : ""}
            ${u.premium ? html`<span class="status pro">Pro</span>` : ""}
            ${u.chat_muted ? html`<span class="status banned">muted in chat</span>` : ""}
          </div>
          <div class="muted small">${u.email} · joined ${u.created_at.slice(0, 10)} · last seen ${(u.last_seen || "never").slice(0, 16)}</div>
          ${u.role_key === "custom" ? html`<div class="muted small">Can: ${[...u.perms].sort().join(", ")}</div>` : ""}
          ${u.reason ? html`<div class="small person-note">“${u.reason}”</div>` : ""}
          ${u.ban_reason ? html`<div class="small muted">Ban reason: ${u.ban_reason}</div>` : ""}
        </div>
        <div class="person-actions">
          ${u.id === me.id ? html`<span class="muted small">(you)</span>`
          : locked ? html`<span class="muted small">${u.is_owner ? "Owner" : "Only the owner can change staff"}</span>`
          : html`
          <form method="post" action="/admin/user/${u.id}" class="actions">
            ${csrfField(c)}
            ${u.status !== "approved" ? html`<button class="btn good small" name="action" value="approve">Allow</button>` : ""}
            ${u.status === "pending" ? html`<button class="btn ghost small" name="action" value="ignore">Ignore</button>` : ""}
            ${["approved", "ignored", "banned"].includes(u.status) ? html`<button class="btn ghost small" name="action" value="pending">Back to pending</button>` : ""}
            <details class="more">
              <summary class="btn ghost small">More ▾</summary>
              <div class="more-menu">
                ${u.status !== "banned" ? html`
                <input class="input" name="reason" placeholder="Ban reason (optional)">
                <button class="btn bad small" name="action" value="ban" data-confirm="Ban ${u.name}?">Ban</button>` : ""}
                <button class="btn ghost small" name="action" value="${u.chat_muted ? "unmute" : "mute"}">${u.chat_muted ? "Unmute in chat" : "Mute in chat"}</button>
                <button class="btn ghost small" name="action" value="reset_pw" data-confirm="Give ${u.name} a new temporary password? Their old password stops working.">Reset password</button>
                <button class="btn bad small" name="action" value="delete" data-confirm="Delete ${u.name}'s account for good?">Delete account</button>
              </div>
            </details>
          </form>
          ${me.is_owner ? html`
          <details class="staff-edit">
            <summary class="btn warn small">Role: ${u.is_staff ? u.role_label : "Player"} ▾</summary>
            <form method="post" action="/admin/user/${u.id}" class="form role-form">
              ${csrfField(c)}<input type="hidden" name="action" value="set_perms">
              <div class="role-options">
                ${Object.entries(ROLES).map(([key, [label, perms]]) => html`
                <label class="role-option">
                  <input type="radio" name="role" value="${key}" ${u.role_key === key ? raw("checked") : ""}>
                  <span><b>${label}</b><small>${key === "player" ? "Just plays games" : key === "full" ? "Everything except Settings and roles" : perms.map(titleCase).join(" + ")}</small></span>
                </label>`)}
                <label class="role-option">
                  <input type="radio" name="role" value="custom" ${u.role_key === "custom" ? raw("checked") : ""}>
                  <span><b>Custom</b><small>Pick exactly what they can do</small></span>
                </label>
              </div>
              <div class="custom-perms">
                ${Object.entries(PERMS).map(([key, label]) => html`
                <label class="check"><input type="checkbox" name="perms" value="${key}" ${u.perms.has(key) ? raw("checked") : ""}> ${label}</label>`)}
              </div>
              <p class="muted small">Only you can change Settings or give out roles.</p>
              <button class="btn small">Save role</button>
            </form>
          </details>` : ""}`}
        </div>
      </div>`;
      })}
    </div>
  </section>`;
}

/* ── visitors ── */
function statsTab(c, v) {
  const ch = v.chart;
  return html`
  ${statTiles([[v.today, "unique visitors today"], [v.week, "last 7 days"], [v.month, "last 30 days"], [v.all, "all time"]])}
  <section class="card">
    <h2>Unique visitors per day</h2>
    <p class="muted small help">Last 30 days: ${v.members_month} signed-in ${plural(v.members_month, "person", "people")}
      and ${v.guests_month} ${plural(v.guests_month, "guest")} (people who only saw the login / sign-up pages), ${v.views_month} page views.</p>
    <div class="chart-wrap">
      <svg class="chart" viewBox="0 0 ${ch.width} ${ch.height}" role="img" aria-label="Unique visitors per day, last 30 days">
        ${ch.grid.map((gl) => html`
        <line x1="${ch.pad_l}" x2="${ch.width}" y1="${gl.y}" y2="${gl.y}" class="${gl.v === 0 ? "axis" : "grid"}"/>
        <text x="${ch.pad_l - 6}" y="${gl.y + 4}" text-anchor="end" class="tick">${gl.v}</text>`)}
        ${ch.bars.map((b) => html`
        ${b.path ? html`<path d="${b.path}" class="bar"/>` : ""}
        ${b.tick ? html`<text x="${b.x + b.w / 2}" y="${ch.height - 5}" text-anchor="middle" class="tick">${b.label}</text>` : ""}
        <rect x="${b.x - 1}" y="${b.hit_y}" width="${b.w + 2}" height="${b.hit_h}" class="hit" data-tip="${b.label}: ${b.count} ${plural(b.count, "visitor")}"/>`)}
      </svg>
      <div class="chart-tip" hidden></div>
    </div>
    <details style="margin-top:10px"><summary class="muted small" style="cursor:pointer">Show as table</summary>
      <table style="margin-top:8px"><thead><tr><th>Day</th><th>Unique visitors</th></tr></thead><tbody>
      ${[...v.series].reverse().map((p) => html`<tr><td>${p.day}</td><td>${p.count}</td></tr>`)}
      </tbody></table>
    </details>
  </section>
  <div class="two-col">
    <section class="card">
      <h2>Most active people (30 days)</h2>
      <table><thead><tr><th>User</th><th>Days</th><th>Views</th><th>Last visit</th></tr></thead><tbody>
      ${v.active.length ? v.active.map((a) => html`<tr><td>${a.name}<br><span class="muted small">${a.email}</span></td><td>${a.days}</td><td>${a.views}</td><td class="muted">${a.last}</td></tr>`)
        : html`<tr><td class="muted" colspan="4">No visits yet.</td></tr>`}
      </tbody></table>
    </section>
    <section class="card">
      <h2>Most played games</h2>
      <table><thead><tr><th>Game</th><th>Plays</th></tr></thead><tbody>
      ${v.top_games.length ? v.top_games.map((gm) => html`<tr><td>${gm.name}</td><td>${gm.plays}</td></tr>`)
        : html`<tr><td class="muted" colspan="2">No plays yet.</td></tr>`}
      </tbody></table>
    </section>
  </div>
  <p class="muted small help">A "visitor" is one account, or one browser for people who aren't logged in. Counted once per day no matter how many pages they open. Bots are skipped.</p>`;
}

/* ── games ── */
function gamesTab(c, d) {
  const e = d.edit_game;
  const earlyNow = e && e.early_until && e.early_until > d.now_utc;
  return html`
  <div class="two-col wide-right">
    <form class="card form sticky" method="post" action="/admin/game" enctype="multipart/form-data">
      ${csrfField(c)}
      <h2>${e ? `Edit ${e.name}` : "Add a game"}</h2>
      ${e ? html`<input type="hidden" name="id" value="${e.id}">` : ""}
      <label>Name <input class="input" name="name" required value="${e ? e.name : ""}"></label>
      <label>Description <input class="input" name="description" value="${e ? e.description : ""}"></label>
      <label>Genres (comma separated) <input class="input" name="genres" placeholder="Action, 2 Player" value="${e ? e.genres : ""}"></label>
      <label>Cover image URL <input class="input" name="image" placeholder="https://…" value="${e ? e.image : ""}"></label>
      <label>Game link (an embed URL or a raw .html file on GitHub / jsDelivr)
        <input class="input" name="url" placeholder="https://…" value="${e ? e.url : ""}">
      </label>
      <label>…or upload a single-file HTML game
        <input class="input" type="file" name="file" accept=".html,.htm">
        ${e && e.file ? html`<span class="muted small">Current file: ${e.file} (leave empty to keep it)</span>` : ""}
      </label>
      <label class="check"><input type="checkbox" name="early" ${earlyNow ? raw("checked") : ""}>
        ${earlyNow ? html`Pro early access (until ${e.early_until.slice(0, 16)} UTC, untick to open it to everyone now)`
          : html`Pro early access for <input class="input inline-num" type="number" name="early_days" value="${d.early_days}" min="1" max="60"> days`}
      </label>
      ${e ? "" : html`<label class="check"><input type="checkbox" name="announce" checked> Announce it (update + email to subscribers; with early access, Pro hears first)</label>`}
      <div class="row-tight">
        <button class="btn">${e ? "Save changes" : "Add game"}</button>
        ${e ? html`<a class="btn ghost" href="/admin?tab=games">Cancel</a>` : ""}
      </div>
    </form>

    <section class="card">
      <div class="card-head">
        <h2>Game list <span class="muted">(${d.games.length})</span></h2>
        <div class="row-tight">
          <a class="btn ghost small" href="/admin?tab=import">Bulk import</a>
          <a class="btn ghost small" href="/admin/games/export">Export JSON</a>
        </div>
      </div>
      <form method="post" action="/admin/games/bulk-delete" id="bulk-form">${csrfField(c)}</form>
      ${d.games.length ? html`
      <div class="filter-row">
        <input class="input" id="admin-game-search" type="search" placeholder="Filter ${d.games.length} games…" style="flex:1;min-width:180px">
        <label class="check small"><input type="checkbox" id="select-all"> Select all</label>
        <button class="btn bad small" form="bulk-form" data-confirm="Remove the selected games?">Remove selected</button>
      </div>` : ""}
      <div class="game-list" id="admin-games">
        ${d.games.length ? d.games.map((gm) => html`
        <div class="game-row" data-search="${gm.name.toLowerCase()}">
          <input type="checkbox" name="ids" value="${gm.id}" form="bulk-form" class="pick" aria-label="Select ${gm.name}">
          <div class="thumb" ${gm.image ? html`style="background-image:url('${gm.image}')"` : ""}></div>
          <div class="game-row-main"><b>${gm.name}</b>${gm.early ? html` <span class="status pro">early</span>` : ""}<br>
            <span class="muted small">${gm.genreList.join(", ") || "No genre"} · ${gm.plays} plays · ${gm.file ? "uploaded file" : "link"}</span></div>
          <div class="actions">
            <a class="btn ghost small" href="/play/${gm.id}" target="_blank">Test</a>
            <a class="btn ghost small" href="/admin?tab=games&edit=${gm.id}">Edit</a>
            <form method="post" action="/admin/game/${gm.id}/delete" class="inline">
              ${csrfField(c)}<button class="btn bad small" data-confirm="Remove ${gm.name}?">Remove</button>
            </form>
          </div>
        </div>`) : html`<p class="muted">No games yet.</p>`}
      </div>
    </section>
  </div>`;
}

/* ── bulk import ── */
function importTab(c, d) {
  const rep = d.import_report;
  return html`
  ${rep ? html`
  <section class="card">
    <h2>Last import</h2>
    ${[["added", "Added"], ["updated", "Updated"], ["skipped", "Skipped (already existed)"], ["errors", "Problems"]].map(([k, label]) =>
      rep[k] && rep[k].length ? html`<p class="small" style="margin-bottom:6px"><b>${label} (${rep[k].length}):</b>
        <span class="${k === "errors" ? "bad-text" : "muted"}">${rep[k].join(k === "errors" ? " · " : ", ")}</span></p>` : "")}
    <a class="btn ghost small" href="/">See the games page</a>
  </section>` : ""}
  <form class="two-col" method="post" action="/admin/games/import" enctype="multipart/form-data">
    ${csrfField(c)}
    <section class="card form">
      <h2>Paste or upload a list</h2>
      <p class="muted small">Works with JSON, a JavaScript array (like <code>const data = [ {...}, {...} ];</code>), or CSV with a header row.
        Each game needs a <b>name</b> and a <b>url</b>. Optional: <b>description</b>, <b>genres</b>, <b>image</b>.</p>
      <textarea class="input mono" name="list" rows="12" spellcheck="false" placeholder='[
  {
    "name": "My Game",
    "description": "What it is",
    "genres": ["Action", "2 Player"],
    "url": "https://…",
    "image": "https://…/cover.jpg"
  }
]

— or CSV —
name,description,genres,url,image
My Game,What it is,Action|2 Player,https://…,https://…'></textarea>
      <label>…or upload a .json / .csv / .js file <input class="input" type="file" name="list_file" accept=".json,.csv,.js,.txt"></label>
    </section>
    <section class="card form">
      <h2>Upload many HTML games</h2>
      <p class="muted small">Pick as many single-file <code>.html</code> games as you want. The file name becomes the game name
        (<code>drift-boss.html</code> → "Drift Boss"). You can edit names, pictures and descriptions afterwards.</p>
      <label>HTML files <input class="input" type="file" name="files" accept=".html,.htm" multiple></label>
      <label>Genres for these files (optional) <input class="input" name="file_genres" placeholder="Arcade, Action"></label>
      <h2 style="margin-top:8px">Options</h2>
      <label>If a game with the same name already exists
        <select class="input" name="on_duplicate">
          <option value="skip">Skip it</option>
          <option value="update">Replace it with the imported one</option>
        </select>
      </label>
      <label class="check"><input type="checkbox" name="announce"> Announce the new games (one update + one email)</label>
      <div><button class="btn">Import</button></div>
      <p class="muted small">Tip: <a href="/admin/games/export">Export</a> first if you want a backup.</p>
    </section>
  </form>`;
}

/* ── polls ── */
function pollsTab(c, d) {
  return html`
  <div class="two-col">
    <form class="card form sticky" method="post" action="/admin/poll">
      ${csrfField(c)}
      <h2>New poll</h2>
      <label>Question <input class="input" name="question" required placeholder="What should I add next?"></label>
      <label>Options (one per line, at least 2)
        <textarea class="input" name="options" rows="5" required placeholder="Snow Rider 3D&#10;Friday Night Funkin'&#10;Basket Random"></textarea>
      </label>
      <p class="muted small">Only staff can add options. Players just vote.</p>
      <label class="check"><input type="checkbox" name="announce" checked> Announce it (update + email)</label>
      <div><button class="btn">Create poll</button></div>
    </form>
    <div class="stack">
      ${d.polls.length ? d.polls.map((p) => html`
      <section class="card">
        <div class="card-head">
          <h3>${p.poll.question}</h3>
          <span class="status ${p.poll.is_open ? "open" : "closed"}">${p.poll.is_open ? "open" : "closed"}</span>
        </div>
        <div class="opt-list">
          ${p.options.map((o) => {
            const pct = p.total ? Math.round((o.votes * 100) / p.total) : 0;
            return html`
          <div class="opt-row">
            <span class="opt-bar" style="width:${pct}%"></span>
            <span class="opt-label">${o.label}${o.suggested_by ? html` <span class="muted small">· ${o.suggested_by}</span>` : ""}</span>
            <span class="opt-num"><b>${o.votes}</b> <span class="muted small">${pct}%</span></span>
            <form method="post" action="/admin/poll/${p.poll.id}">
              ${csrfField(c)}<input type="hidden" name="option_id" value="${o.id}">
              <button class="icon-btn danger small" name="action" value="remove_option" data-confirm="Remove '${o.label}' and its votes?" title="Remove option" aria-label="Remove option">✕</button>
            </form>
          </div>`;
          })}
        </div>
        <form method="post" action="/admin/poll/${p.poll.id}" class="add-opt">
          ${csrfField(c)}<input type="hidden" name="action" value="add_option">
          <input class="input" name="label" maxlength="80" placeholder="Add an option…" required>
          <button class="btn ghost small">Add</button>
        </form>
        <form method="post" action="/admin/poll/${p.poll.id}" class="row-tight" style="margin-top:12px">
          ${csrfField(c)}
          ${p.poll.is_open ? html`<button class="btn ghost small" name="action" value="close">Close voting</button>`
            : html`<button class="btn ghost small" name="action" value="open">Reopen</button>`}
          <button class="btn bad small" name="action" value="delete" data-confirm="Delete this poll?">Delete</button>
          <span class="muted small" style="margin-left:auto">${p.total} ${plural(p.total, "vote")}</span>
        </form>
      </section>`) : html`<section class="card"><p class="muted">No polls yet.</p></section>`}
    </div>
  </div>`;
}

/* ── Pro ── */
function proTab(c, me, d) {
  const pro = d.pro;
  return html`
  ${statTiles([[pro.nums.members, "Pro members"], [`$${g(pro.nums.raised)}`, "collected"],
    [pro.nums.months.toFixed(1), "months of hosting covered"], [pro.claims.length, "payments to check"]])}
  <div class="two-col">
    <section class="card">
      <h2>Payments to check</h2>
      ${!d.cashtag && me.is_owner ? html`<p class="small"><span class="status pending">not set up</span> Add your Cash App $cashtag in <a href="/admin?tab=settings">Settings</a> so people know where to pay.</p>` : ""}
      ${pro.claims.length ? pro.claims.map((u) => html`
      <form method="post" action="/admin/pro" class="req">
        ${csrfField(c)}<input type="hidden" name="user_id" value="${u.id}">
        <div><b>${u.name}</b> <span class="muted small">${u.email}</span><br>
          <span class="small">Paid from Cash App: <b>${u.pro_claim}</b></span> <span class="muted small">· ${u.pro_claim_at.slice(0, 16)}</span></div>
        <div class="row-tight">
          <button class="btn good small" name="action" value="confirm">Confirm</button>
          <button class="btn ghost small" name="action" value="reject" data-confirm="Clear ${u.name}'s claim? Only do this if you can't find the payment.">Not found</button>
        </div>
      </form>`) : html`<p class="muted small">Nobody waiting. When someone taps "I've paid", they show up here (and you get an email).</p>`}
      <h2 style="margin-top:20px">Give someone Pro</h2>
      <p class="muted small" style="margin-bottom:10px">For payments made in person, or as a gift.</p>
      <form method="post" action="/admin/pro" class="form">
        ${csrfField(c)}<input type="hidden" name="action" value="grant">
        <select class="input" name="user_id" required>
          <option value="">Pick a person…</option>
          ${pro.others.map((u) => html`<option value="${u.id}">${u.name} (${u.email})</option>`)}
        </select>
        <input class="input" name="note" placeholder="Note, e.g. paid cash 10/2 (optional)" maxlength="120">
        <div><button class="btn">Give Pro</button></div>
      </form>
    </section>
    <section class="card">
      <h2>Game requests</h2>
      ${pro.requests.length ? pro.requests.map((r) => html`
      <form method="post" action="/admin/pro" class="req req-col">
        ${csrfField(c)}<input type="hidden" name="action" value="request"><input type="hidden" name="request_id" value="${r.id}">
        <div class="req-top">
          <div><b>${r.name}</b> <span class="muted small">from ${r.who} · ${r.created_at.slice(0, 10)}</span>
            ${r.link ? html`<br><a class="small" href="${r.link}" target="_blank" rel="noopener noreferrer">${truncate(r.link, 60)}</a>` : ""}
            ${r.note ? html`<br><span class="muted small">${r.note}</span>` : ""}</div>
          <span class="status ${r.status === "open" ? "pending" : r.status}">${REQ_LABEL[r.status]}</span>
        </div>
        <div class="row-tight">
          <input class="input" name="reply" value="${r.reply}" placeholder="Reply they'll see (optional)" maxlength="300" style="flex:1;min-width:160px">
          <button class="btn good small" name="status" value="added">Added</button>
          <button class="btn ghost small" name="status" value="declined">Can't add</button>
          ${r.status !== "open" ? html`<button class="btn ghost small" name="status" value="open">Reopen</button>` : ""}
        </div>
      </form>`) : html`<p class="muted small">No requests yet.</p>`}
    </section>
  </div>
  <section class="card">
    <h2>Pro members (${pro.members.length})</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Person</th><th>Pro since</th><th>Note</th><th></th></tr></thead>
        <tbody>
        ${pro.members.length ? pro.members.map((u) => html`
        <tr>
          <td><b>${u.name}</b><br><span class="muted small">${u.email}</span></td>
          <td class="small muted">${u.premium_since.slice(0, 10)}</td>
          <td class="small">${u.premium_note}</td>
          <td><form method="post" action="/admin/pro">${csrfField(c)}<input type="hidden" name="user_id" value="${u.id}">
            <button class="btn bad small" name="action" value="revoke" data-confirm="Remove Pro from ${u.name}? They paid for it, so only do this for refunds or mistakes.">Remove Pro</button></form></td>
        </tr>`) : html`<tr><td colspan="4" class="muted small">No Pro members yet.</td></tr>`}
        </tbody>
      </table>
    </div>
    <p class="muted small help">Staff get every Pro perk automatically, without the badge. Chat moderation (delete messages, mute people) is in the chat itself and on the People tab.</p>
  </section>`;
}

/* ── announce ── */
const announceTab = (c, d) => html`
  <form class="card form narrow-card" method="post" action="/admin/announce">
    ${csrfField(c)}
    <h2>Post an announcement</h2>
    <p class="muted small">Shows up in everyone's Updates tab. ${d.subscribers} ${plural(d.subscribers, "person has", "people have")} emails turned on.</p>
    <label>Title <input class="input" name="title" required placeholder="New theme just dropped"></label>
    <label>Message <textarea class="input" name="body" rows="4"></textarea></label>
    <label>Link (optional) <input class="input" name="link" placeholder="/polls or https://…"></label>
    <label>Who sees it?
      <select class="input" name="audience">
        <option value="all">Everyone</option>
        <option value="pro">Pro only: sneak peek of what's coming</option>
      </select>
    </label>
    <label class="check"><input type="checkbox" name="email" checked> Also email subscribers</label>
    <div><button class="btn">Post</button></div>
  </form>`;

/* ── settings ── */
function settingsTab(c, d) {
  const s = c.var.settings;
  const sel = (v) => (s.access_mode === v ? raw("selected") : "");
  return html`
  <div class="two-col">
    <form class="card form" method="post" action="/admin/settings">
      ${csrfField(c)}
      <h2>Site</h2>
      <label>Site name <input class="input" name="site_name" value="${s.site_name}" maxlength="40"></label>
      <label>Who can join?
        <select class="input" name="access_mode">
          <option value="approval" ${sel("approval")}>Anyone can request, I approve each person</option>
          <option value="open" ${sel("open")}>Open: anyone who signs up gets in</option>
          <option value="closed" ${sel("closed")}>Closed: no new sign-ups</option>
        </select>
      </label>
      <h2 style="margin-top:8px">Pro</h2>
      <label>Cash App $cashtag payments go to <input class="input" name="cashtag" value="${s.cashtag}" placeholder="$yourname" maxlength="40"></label>
      <div class="row">
        <label>Price ($, one time) <input class="input" name="pro_price" value="${s.pro_price}" inputmode="decimal"></label>
        <label>Hosting cost ($/month) <input class="input" name="monthly_cost" value="${s.monthly_cost}" inputmode="decimal"></label>
      </div>
      <label>Default early-access days for new games <input class="input" name="early_days" value="${s.early_days}" inputmode="numeric"></label>
      <h2 style="margin-top:8px">Movies</h2>
      <label>Link to the movies doc <input class="input" name="movies_doc" value="${s.movies_doc}" placeholder="https://docs.google.com/..." maxlength="500"></label>
      <div><button class="btn">Save</button></div>
    </form>
    <section class="card form">
      <h2>Email</h2>
      ${d.email_ok ? html`
      <p class="small"><span class="status approved">connected</span> Emails go out when you add games, create polls, post announcements, and approve people. You also get an email when someone requests access.</p>
      <form method="post" action="/admin/test-email">${csrfField(c)}<button class="btn ghost">Send me a test email</button></form>`
      : html`
      <p class="small"><span class="status pending">not set up</span> Emails are only written to the Worker log right now.</p>
      <p class="small muted">To send real emails, make a free <a href="https://resend.com" target="_blank" rel="noopener">Resend</a> account, then add the
        <code>RESEND_API_KEY</code> secret and the <code>MAIL_FROM</code> variable to the Worker (see README).</p>`}
    </section>
  </div>`;
}

export function adminPage(c, me, d) {
  const tabs = d.tabs;
  const body = {
    users: () => usersTab(c, me, d), stats: () => statsTab(c, d.visitors), games: () => gamesTab(c, d),
    import: () => importTab(c, d), polls: () => pollsTab(c, d), pro: () => proTab(c, me, d),
    announce: () => announceTab(c, d), settings: () => settingsTab(c, d),
  }[d.tab]();
  return html`
<main class="page admin-page">
  <div class="page-head">
    <div><span class="pp-eyebrow hv-eyebrow">⚙ Admin</span><h1>Run ${c.var.settings.site_name}</h1><p>People, games, polls and announcements, all in one place.</p></div>
  </div>
  ${["users", "games", "import"].includes(d.tab) ? statTiles([[d.stats.users, "approved users"], [d.stats.pending, "waiting for approval"],
    [d.stats.games, "games"], [d.stats.plays, "total plays"]]) : ""}
  <nav class="tabs" aria-label="Admin sections">
    ${tabs.map(([key, label]) => html`
    <a class="tab${d.tab === key ? " active" : ""}" href="/admin?tab=${key}"><span aria-hidden="true">${TAB_ICONS[key]}</span> ${label}${
      key === "users" && d.stats.pending ? html` <span class="badge">${d.stats.pending}</span>` : ""}${
      key === "pro" && d.pro_todo ? html` <span class="badge">${d.pro_todo}</span>` : ""}</a>`)}
  </nav>
  ${body}
</main>`;
}
