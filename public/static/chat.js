/* Pro chat client: one WebSocket to /chat/ws, auto-reconnects, renders messages safely (textContent only). */
(function () {
  const boot = window.NOVA_CHAT;
  if (!boot) return;
  const log = document.getElementById("chat-log");
  const empty = document.getElementById("chat-empty");
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  const online = document.getElementById("chat-online");
  const dot = document.getElementById("conn-dot");
  const connText = document.getElementById("conn-text");
  const typingEl = document.getElementById("chat-typing");
  const olderBtn = document.getElementById("chat-older");
  const shown = new Map(); // message id -> element
  let ws, retry = 0, pingTimer, lastTyping = 0;
  const typers = new Map();

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const time = (ts) => {
    const d = new Date(ts.replace(" ", "T") + "Z");
    const today = new Date().toDateString() === d.toDateString();
    return today ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };
  const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 120;
  const toBottom = () => { log.scrollTop = log.scrollHeight; };

  function render(m) {
    const mine = m.user_id === boot.me.id;
    const row = el("div", "chat-msg" + (mine ? " mine" : ""));
    row.dataset.id = m.id;
    row.dataset.user = m.user_id;
    const head = el("div", "chat-meta");
    head.appendChild(el("b", "", m.name || "Someone"));
    if (m.badge) head.appendChild(el("span", "chat-badge " + m.badge.toLowerCase(), m.badge));
    const t = el("time", "", time(m.created_at));
    t.title = m.created_at + " UTC";
    head.appendChild(t);
    if (mine || boot.canModerate) {
      const del = el("button", "chat-del", "Delete");
      del.type = "button";
      del.addEventListener("click", () => {
        if (confirm("Delete this message?")) send({ type: "delete", id: m.id });
      });
      head.appendChild(del);
    }
    row.appendChild(head);
    row.appendChild(el("div", "chat-text", m.body));
    return row;
  }

  // Consecutive messages from the same person within 5 minutes collapse their header.
  function groupWith(prev, row) {
    if (!prev || !prev.classList.contains("chat-msg")) return;
    if (prev.dataset.user === row.dataset.user) row.classList.add("cont");
  }

  function add(m, { prepend = false } = {}) {
    if (shown.has(m.id)) return;
    empty.hidden = true;
    const stick = nearBottom();
    const row = render(m);
    shown.set(m.id, row);
    if (prepend) {
      const first = [...log.querySelectorAll(".chat-msg")][0];
      log.insertBefore(row, first || null);
      if (first && first.dataset.user === row.dataset.user) first.classList.add("cont");
    } else {
      groupWith([...log.querySelectorAll(".chat-msg")].pop(), row);
      log.appendChild(row);
      if (stick || m.user_id === boot.me.id) toBottom();
    }
  }

  function remove(id) {
    const row = shown.get(id);
    if (!row) return;
    const next = row.nextElementSibling;
    row.remove();
    shown.delete(id);
    if (next && next.classList.contains("cont") && (!next.previousElementSibling || next.previousElementSibling.dataset.user !== next.dataset.user)) {
      next.classList.remove("cont");
    }
    if (!shown.size) empty.hidden = false;
  }

  function setConn(state) {
    dot.className = "conn-dot " + state;
    connText.textContent = { on: "Live", off: "Reconnecting…", wait: "Connecting…" }[state];
  }

  function renderOnline(list) {
    online.textContent = "";
    list.forEach((p) => {
      const li = el("li");
      li.appendChild(el("span", "on-dot"));
      li.appendChild(el("span", "", p.name));
      if (p.badge && p.badge !== "Pro") li.appendChild(el("span", "chat-badge " + p.badge.toLowerCase(), p.badge));
      online.appendChild(li);
    });
    if (!list.length) online.appendChild(el("li", "muted small", "Just you"));
  }

  function renderTyping() {
    const names = [...typers.keys()];
    typingEl.textContent = !names.length ? "" : names.length === 1 ? `${names[0]} is typing…` : `${names.length} people are typing…`;
  }

  function send(obj) {
    if (ws && ws.readyState === 1) { ws.send(JSON.stringify(obj)); return true; }
    return false;
  }

  function connect() {
    setConn(retry ? "off" : "wait");
    ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/chat/ws");
    ws.onopen = () => {
      retry = 0;
      setConn("on");
      clearInterval(pingTimer);
      pingTimer = setInterval(() => send({ type: "ping" }), 25000);
      // Catch up on anything sent while we were away.
      const last = Math.max(0, ...shown.keys());
      fetch(`/chat/history?after=${last}`).then((r) => r.ok ? r.json() : null).then((d) => d && d.messages.forEach((m) => add(m)));
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === "msg") { add(m.msg); typers.delete(m.msg.name); renderTyping(); }
      else if (m.type === "del") remove(m.id);
      else if (m.type === "presence") renderOnline(m.online);
      else if (m.type === "error") flash(m.text);
      else if (m.type === "typing") {
        clearTimeout(typers.get(m.name));
        typers.set(m.name, setTimeout(() => { typers.delete(m.name); renderTyping(); }, 3500));
        renderTyping();
      }
    };
    ws.onclose = (e) => {
      clearInterval(pingTimer);
      if (e.code === 4003) { setConn("off"); connText.textContent = "No access"; return; }
      setConn("off");
      retry = Math.min(retry + 1, 6);
      setTimeout(connect, 500 * 2 ** retry);
    };
  }

  function flash(text) {
    const box = document.querySelector(".flashes") || document.body.appendChild(el("div", "flashes"));
    const f = el("div", "flash error", text);
    box.appendChild(f);
    setTimeout(() => f.remove(), 4200);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const body = input.value.trim();
    if (!body) return;
    if (!send({ type: "send", body })) { flash("Not connected yet. Try again in a second."); return; }
    input.value = "";
    autosize();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  input.addEventListener("input", () => {
    autosize();
    if (Date.now() - lastTyping > 2500 && input.value.trim()) { lastTyping = Date.now(); send({ type: "typing" }); }
  });
  function autosize() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 160) + "px";
  }

  olderBtn?.addEventListener("click", async () => {
    const first = Math.min(...shown.keys());
    const r = await fetch(`/chat/history?before=${first}`);
    if (!r.ok) return;
    const d = await r.json();
    const h = log.scrollHeight;
    d.messages.slice().reverse().forEach((m) => add(m, { prepend: true }));
    log.scrollTop = log.scrollHeight - h;
    if (d.messages.length < 50) olderBtn.remove();
  });

  boot.messages.forEach((m) => add(m));
  toBottom();
  renderOnline([]);
  connect();
  input.focus();
})();
