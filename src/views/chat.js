import { html, raw } from "hono/html";
import { asset } from "./layout.js";

// JSON inside a <script> tag: escape "<" so a message can't close the tag.
const safeJson = (v) => raw(JSON.stringify(v).replace(/[<\u2028\u2029]/g, (ch) => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0")));

export function chatPage(c, me, messages, canModerate) {
  const boot = { me: { id: me.id, name: me.name }, canModerate, messages, muted: !!me.chat_muted };
  return html`
<main class="chat-page">
  <section class="chat-shell">
    <header class="chat-head">
      <div>
        <h1>💬 Pro chat</h1>
        <p class="muted small">The owner, admins and Pro members. Be nice. Staff can remove messages.</p>
      </div>
      <div class="chat-status"><span class="conn-dot" id="conn-dot"></span><span id="conn-text">Connecting…</span></div>
    </header>
    <div class="chat-body">
      <div class="chat-log" id="chat-log" aria-live="polite">
        ${messages.length >= 50 ? html`<button class="btn ghost small chat-older" id="chat-older">Load older messages</button>` : ""}
        <div class="chat-empty" id="chat-empty" ${messages.length ? raw("hidden") : ""}>
          <div aria-hidden="true">👋</div><p>No messages yet. Say hi!</p>
        </div>
      </div>
      <aside class="chat-people">
        <div class="label">Online now</div>
        <ul id="chat-online"></ul>
      </aside>
    </div>
    <div class="chat-typing" id="chat-typing"></div>
    <form class="chat-form" id="chat-form" autocomplete="off">
      <textarea id="chat-input" rows="1" maxlength="500" placeholder="${me.chat_muted ? "You're muted in chat" : "Message Pro chat…"}"
        ${me.chat_muted ? raw("disabled") : ""} aria-label="Message"></textarea>
      <button class="btn" id="chat-send" ${me.chat_muted ? raw("disabled") : ""}>Send</button>
    </form>
  </section>
</main>
<script>window.NOVA_CHAT = ${safeJson(boot)};</script>
<script src="${asset("chat.js")}"></script>`;
}
