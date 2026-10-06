import { html, raw } from "hono/html";
import { csrfField } from "./layout.js";
import { PRO_THEMES } from "../lib/core.js";
import { g, plural, safeLink, cssUrl } from "../lib/util.js";

const THEME_NOTES = { aurora: "Teal & indigo", sunset: "Orange & pink", gold: "Black & gold" };
const pad3 = (n) => String(n).padStart(3, "0");
const REQ_LABEL = { open: "waiting", added: "added", declined: "can't add" };

const memberCard = (site, name, number, since) => html`
<div class="pp-card-wrap">
  <div class="pp-card" id="pp-card">
    <div class="pp-card-top"><span class="pp-card-logo">✦ ${site}</span><span class="pro-badge">PRO</span></div>
    <div class="pp-chip" aria-hidden="true"></div>
    <div>
      <div class="pp-card-name">${name}</div>
      <div class="pp-card-meta" style="margin-top:10px">
        <div>Member<b>${number}</b></div>
        <div style="text-align:right">Since<b>${since}</b></div>
      </div>
    </div>
  </div>
</div>`;

function memberView(c, me, d, site) {
  return html`
  <section class="pp-hero">
    <div>
      <span class="pp-eyebrow">★ ${site} Pro</span>
      <h1>Welcome to Pro,<br><span class="gold-text">${me.name}.</span></h1>
      <p class="pp-sub">${me.is_premium ? `You're one of the people keeping ${site} online. Here's everything you've unlocked.`
        : "As staff you get every Pro perk. Here's what members see."}</p>
      <div class="pp-cta" style="margin-top:28px">
        <a class="btn-gold" href="/chat">💬 Open Pro chat</a>
        <a class="btn-soft" href="#requests">Request a game</a>
      </div>
    </div>
    ${memberCard(site, me.name, d.member_no ? `#${pad3(d.member_no)}` : me.role_label, me.premium_since ? me.premium_since.slice(0, 4) : "2026")}
  </section>

  <section class="pp-member">
    <div class="pp-panel">
      <h2>⚡ Early access</h2>
      ${d.early_games.length ? html`
      <div class="pp-early-list">
        ${d.early_games.map((gm) => html`
        <a class="pp-early" href="/play/${gm.id}" ${gm.image ? html`style="background-image:url('${cssUrl(gm.image)}')"` : ""}>
          <small>Public ${gm.early_until.slice(5, 10)}</small><span>${gm.name}</span>
        </a>`)}
      </div>` : html`<p class="muted small">No games in early access right now. New ones show up here days before everyone else gets them.</p>`}
    </div>

    <div class="pp-panel">
      <h2>🎨 Your themes</h2>
      <div class="pp-swatches">
        ${Object.entries(PRO_THEMES).map(([key, label]) => html`
        <button class="pp-swatch" data-set-theme="${key}"><i class="sw-${key}"></i>${label}<small>${THEME_NOTES[key]}</small></button>`)}
        <button class="pp-swatch" data-set-theme="nova"><i style="background:linear-gradient(135deg,#7c3aed,#2563eb)"></i>Nova<small>The default</small></button>
      </div>
    </div>

    <div class="pp-panel" id="requests">
      <h2>🎮 Request a game</h2>
      <form method="post" action="/pro/request" class="form">
        ${csrfField(c)}
        <input class="input" name="name" required maxlength="80" placeholder="Which game should we add?">
        <input class="input" name="link" maxlength="300" placeholder="Where it can be played (optional link)">
        <input class="input" name="note" maxlength="300" placeholder="Anything else? (optional)">
        <div><button class="btn">Send request</button></div>
      </form>
      ${d.my_requests.length ? html`
      <div class="label" style="margin-top:18px">Your requests</div>
      ${d.my_requests.map((r) => html`
      <div class="req">
        <div><b>${r.name}</b>${r.reply ? html`<br><span class="muted small">${r.reply}</span>` : ""}</div>
        <span class="status ${r.status === "open" ? "pending" : r.status}">${REQ_LABEL[r.status]}</span>
      </div>`)}` : ""}
      <p class="muted small" style="margin-top:10px">Up to ${d.max_requests} waiting at a time.</p>
    </div>

    <div class="pp-panel">
      <h2>🔮 Sneak peeks</h2>
      ${d.peeks.length ? d.peeks.map((n) => html`
      <div class="req">
        <div><b>${safeLink(n.link) ? html`<a href="${safeLink(n.link)}">${n.title}</a>` : n.title}</b>${n.body ? html`<br><span class="muted small">${n.body}</span>` : ""}</div>
        <span class="muted small" style="white-space:nowrap">${n.created_at.slice(5, 10)}</span>
      </div>`) : html`<p class="muted small">Nothing yet. When something new is in the works, you'll hear about it here first.</p>`}
      <div class="label" style="margin-top:18px">Pro extras</div>
      <a class="req req-link" href="/chat"><div><b>💬 Pro chat</b><br><span class="muted small">With the owner, admins and other members</span></div><span class="status approved">live</span></a>
      <div class="req"><div><b>🛡️ Proxy</b><br><span class="muted small">Pro-only</span></div><span class="status pro">soon</span></div>
    </div>
  </section>`;
}

function salesView(c, me, d, site, s) {
  const price = g(d.nums.price);
  const cashtag = (s.cashtag || "").replace(/^\$/, "");
  return html`
  <section class="pp-hero">
    <div>
      <span class="pp-eyebrow">★ ${site} Pro</span>
      <h1>Play first.<br><span class="gold-text">Play more.</span></h1>
      <p class="pp-sub">New games before anyone else, a private chat with the owner and admins, themes nobody else has, and a say in what gets added next. One payment, and it's yours for good.</p>
      <div class="pp-price"><b>$${price}</b><span>one time<br>no subscription</span></div>
      <div class="pp-cta">
        <a class="btn-gold" href="#checkout">Get Pro for $${price}</a>
        <a class="btn-soft" href="#perks">See what's included</a>
      </div>
      <div class="pp-trust"><span>Pay once, keep it</span><span>Cash App</span><span>Keeps ${site} running</span></div>
    </div>
    ${memberCard(site, me.name, `#${pad3(d.nums.members + 1)}`, "2026")}
  </section>

  <section id="perks">
    <div class="pp-center">
      <span class="pp-eyebrow">What you unlock</span>
      <h2 class="pp-h2">Everything that makes ${site} better.</h2>
      <p class="pp-sub">Pro members get the good stuff first, and help decide what comes next.</p>
    </div>
    <div class="pp-bento">
      <div class="pp-tile wide">
        <div class="pp-ico">⚡</div>
        <h3>Early access to new games</h3>
        <p>New games go to Pro first. Play them for days before they open up to everyone.
          ${d.early_count ? html`<b style="color:var(--gold1)">${d.early_count} ${plural(d.early_count, "game")} in early access right now.</b>` : ""}</p>
        <div class="pp-demo pp-games" aria-hidden="true">
          <div class="pp-game g1"><span class="tag pro">★ Pro</span><div>Out now<div class="when">for you</div></div></div>
          <div class="pp-game g2"><span class="tag pro">★ Pro</span><div>Out now<div class="when">for you</div></div></div>
          <div class="pp-game locked"><span class="tag">Everyone</span><div>In 3 days<div class="when">for free players</div></div></div>
        </div>
      </div>
      <div class="pp-tile">
        <div class="pp-ico">🎨</div>
        <h3>Pro themes</h3>
        <p>Three looks only Pro gets. Tap one to try it on.</p>
        <div class="pp-demo pp-swatches">
          ${Object.entries(PRO_THEMES).map(([key, label]) => html`
          <button class="pp-swatch" data-try-theme="${key}" data-label="${label}"><i class="sw-${key}"></i>${label}<small>Try it</small></button>`)}
        </div>
      </div>
      <div class="pp-tile">
        <div class="pp-ico">🎮</div>
        <h3>Request games</h3>
        <p>Ask for what you want to play. If it can be added, it will be.</p>
        <div class="pp-demo pp-chat" aria-hidden="true">
          <div class="pp-bubble me">Can you add my favorite game?</div>
          <div class="pp-bubble them"><b>✓ Added.</b> Go play it!</div>
        </div>
      </div>
      <div class="pp-tile">
        <div class="pp-ico">🔮</div>
        <h3>Sneak peeks</h3>
        <p>See what's being planned before it's announced.</p>
        <div class="pp-demo pp-redacted" aria-hidden="true"><i></i><i></i><i></i><i></i><span>🔒 Pro only</span></div>
      </div>
      <div class="pp-tile">
        <div class="pp-ico">✦</div>
        <h3>The PRO badge</h3>
        <p>Right next to the logo, on every page.</p>
        <div class="pp-demo pp-badge-demo" aria-hidden="true"><span class="logo">✦ ${site}<span class="pro-badge">PRO</span></span></div>
      </div>
      <div class="pp-tile half">
        <span class="pp-soon live">Live now</span>
        <div class="pp-ico">💬</div>
        <h3>Pro chat</h3>
        <p>A private, real-time chat with the owner, the admins and other Pro members. Suggest things, report bugs, or just hang out.</p>
        <div class="pp-demo pp-chat" aria-hidden="true">
          <div class="pp-bubble them"><b style="color:var(--gold1)">Owner</b> New game drops tonight 👀</div>
          <div class="pp-bubble me">no way, which one??</div>
        </div>
      </div>
      <div class="pp-tile half">
        <span class="pp-soon">Coming soon</span>
        <div class="pp-ico">🛡️</div>
        <h3>Pro proxy</h3>
        <p>A proxy just for Pro members is in the works. You'll get it the day it launches, at no extra cost.</p>
      </div>
    </div>
  </section>

  <section>
    <div class="pp-center"><span class="pp-eyebrow">Free vs Pro</span><h2 class="pp-h2">Same site. Way more of it.</h2></div>
    <div class="pp-compare">
      <table>
        <thead><tr><th>Feature</th><th>Free</th><th class="pro">Pro</th></tr></thead>
        <tbody>
          <tr><td>Every game in the library</td><td><span class="pp-yes" style="color:var(--muted)">✓</span></td><td class="pro"><span class="pp-yes">✓</span></td></tr>
          <tr><td>Favorites, polls & updates</td><td><span class="pp-yes" style="color:var(--muted)">✓</span></td><td class="pro"><span class="pp-yes">✓</span></td></tr>
          <tr><td>New games days early</td><td><span class="pp-no">—</span></td><td class="pro"><span class="pp-yes">✓</span></td></tr>
          <tr><td>Pro chat</td><td><span class="pp-no">—</span></td><td class="pro"><span class="pp-yes">✓</span></td></tr>
          <tr><td>Request games</td><td><span class="pp-no">—</span></td><td class="pro"><span class="pp-yes">✓</span></td></tr>
          <tr><td>Sneak peeks at what's next</td><td><span class="pp-no">—</span></td><td class="pro"><span class="pp-yes">✓</span></td></tr>
          <tr><td>${Object.keys(PRO_THEMES).length} exclusive themes</td><td><span class="pp-no">—</span></td><td class="pro"><span class="pp-yes">✓</span></td></tr>
          <tr><td>PRO badge</td><td><span class="pp-no">—</span></td><td class="pro"><span class="pp-yes">✓</span></td></tr>
          <tr><td>Pro proxy <span class="muted small">(coming soon)</span></td><td><span class="pp-no">—</span></td><td class="pro"><span class="pp-yes">✓</span></td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <section id="checkout">
    <div class="pp-center" style="margin-bottom:28px"><span class="pp-eyebrow">Get Pro</span><h2 class="pp-h2">Takes about a minute.</h2></div>
    <div class="pp-checkout">
      <div class="pp-why">
        <div class="pp-ico">❤️</div>
        <h3 style="font-size:1.3rem;font-weight:800;letter-spacing:-0.02em">Keep ${site} online</h3>
        <p class="muted">Running ${site} costs <b style="color:var(--text)">$${g(d.nums.monthly)} every month</b>, and adding and fixing games takes real time. Pro is what keeps it going.</p>
        <div style="margin-top:auto">
          <div class="big gold-text">${d.nums.months.toFixed(1)} <span style="font-size:1rem;letter-spacing:0">months</span></div>
          <p class="muted small" style="margin:6px 0 10px">of hosting paid for by ${d.nums.members} Pro ${plural(d.nums.members, "member")}. Goal: a full year.</p>
          <div class="pp-meter"><span style="width: ${Math.min((d.nums.months * 100) / 12, 100).toFixed(1)}%"></span></div>
        </div>
      </div>
      <div class="pp-pay">
        ${me.pro_claim ? html`
        <h3>We're checking your payment</h3>
        <p class="muted small" style="margin-top:6px">You paid from <b style="color:var(--text)">${me.pro_claim}</b>. Pro turns on as soon as it's confirmed, usually within a day, and you'll get an email.</p>
        <div class="pp-track"><div class="done">Payment sent</div><div class="now">Checking</div><div>Pro on</div></div>
        <form method="post" action="/pro/claim" class="pp-claim">
          ${csrfField(c)}
          <input class="input" name="cashapp" value="${me.pro_claim}" required maxlength="60" aria-label="Cash App name">
          <button class="btn-soft">Fix my Cash App name</button>
        </form>` : cashtag ? html`
        <h3>Pay with Cash App</h3>
        <ol class="pp-steps">
          <li class="pp-step">
            <span class="n">1</span>
            <div><div class="what">Send $${price} to</div><div class="val cash">$${cashtag}</div></div>
            <a class="pp-copy" href="https://cash.app/$${encodeURIComponent(cashtag)}/${price}" target="_blank" rel="noopener noreferrer">Open Cash App ↗</a>
          </li>
          <li class="pp-step">
            <span class="n">2</span>
            <div><div class="what">Put this in the note</div><div class="val">${me.email}</div></div>
            <button class="pp-copy" type="button" data-copy="${me.email}">Copy</button>
          </li>
          <li class="pp-step"><span class="n">3</span><div><div class="what">Tell us which Cash App account you paid from</div></div></li>
        </ol>
        <form method="post" action="/pro/claim" class="pp-claim">
          ${csrfField(c)}
          <input class="input" name="cashapp" placeholder="$yourname" required maxlength="60" aria-label="Your Cash App name">
          <button class="btn-gold">I've paid</button>
        </form>
        <p class="pp-fine">Pro turns on once your payment is checked, usually within a day. Cash App is the only way to pay.</p>`
        : html`<h3>Almost ready</h3><p class="muted" style="margin-top:8px">Payments open very soon. Check back in a bit!</p>`}
      </div>
    </div>
  </section>

  <section>
    <div class="pp-center"><span class="pp-eyebrow">Questions</span><h2 class="pp-h2">Good to know</h2></div>
    <div class="pp-faq">
      <details><summary>Is this a subscription?</summary><p>No. You pay $${price} once and keep Pro for good. Nothing renews and you'll never be charged again.</p></details>
      <details><summary>How fast does Pro turn on?</summary><p>Payments are checked by hand, so it's usually within a day. You'll get an email and the PRO badge shows up as soon as it's on.</p></details>
      <details><summary>I paid but Pro isn't on yet</summary><p>Make sure you tapped "I've paid" with the right Cash App name. That's how your payment gets matched to your account. If it's been more than a day, reach out to an admin.</p></details>
      <details><summary>Do free players lose anything?</summary><p>No. Every game still comes to everyone. Pro just gets new ones a few days early, plus the extras.</p></details>
      <details><summary>What's Pro chat like?</summary><p>It's a live group chat for Pro members, the admins and the owner, right here on the site. Messages show up instantly. Be nice: staff can remove messages and mute people.</p></details>
      <details><summary>When is the proxy coming?</summary><p>It's being built. Pro members get it the day it launches, at no extra cost.</p></details>
    </div>
  </section>

  <section class="pp-final">
    <span class="pp-eyebrow">★ ${site} Pro</span>
    <h2 class="pp-h2">Be first to every new game.</h2>
    <p class="pp-sub" style="margin:0 auto">$${price}, once. Early access, Pro chat, exclusive themes, game requests and sneak peeks, and you help keep ${site} online.</p>
    <div class="pp-cta"><a class="btn-gold" href="#checkout">Get Pro for $${price}</a></div>
  </section>

  <div class="pp-tryon" id="pp-tryon" hidden>
    <span>Previewing <b id="pp-tryon-name"></b></span>
    <a class="btn-gold" href="#checkout">Get Pro to keep it</a>
    <button class="btn-soft" type="button" id="pp-tryon-stop">Stop</button>
  </div>`;
}

export function proPage(c, me, d) {
  const site = c.var.settings.site_name;
  return html`<main class="page pro-page">${me.is_pro ? memberView(c, me, d, site) : salesView(c, me, d, site, c.var.settings)}</main>`;
}

export const proScripts = raw(`<script>
(() => {
  const card = document.getElementById("pp-card");
  if (card && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const wrap = card.parentElement;
    wrap.addEventListener("mousemove", (e) => {
      const r = wrap.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = \`rotateY(\${x * 22}deg) rotateX(\${-y * 16}deg)\`;
      card.style.setProperty("--sheen", \`\${x * 60}%\`);
    });
    wrap.addEventListener("mouseleave", () => { card.style.transform = ""; card.style.removeProperty("--sheen"); });
  }
  document.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "Copied ✓"; b.classList.add("done"); }
    catch (e) { b.textContent = "Select & copy"; }
    setTimeout(() => { b.textContent = "Copy"; b.classList.remove("done"); }, 1800);
  }));
  const bar = document.getElementById("pp-tryon");
  if (bar) {
    const root = document.documentElement, original = root.dataset.theme;
    const stop = () => {
      if (original) root.dataset.theme = original; else delete root.dataset.theme;
      bar.hidden = true;
      document.querySelectorAll("[data-try-theme]").forEach((b) => b.classList.remove("on"));
    };
    document.querySelectorAll("[data-try-theme]").forEach((b) => b.addEventListener("click", () => {
      if (b.classList.contains("on")) return stop();
      root.dataset.theme = b.dataset.tryTheme;
      document.querySelectorAll("[data-try-theme]").forEach((x) => x.classList.toggle("on", x === b));
      document.getElementById("pp-tryon-name").textContent = b.dataset.label;
      bar.hidden = false;
    }));
    document.getElementById("pp-tryon-stop").addEventListener("click", stop);
  }
})();
</script>`);
