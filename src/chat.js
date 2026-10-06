// Pro chat: one Durable Object holds everyone's live WebSocket connections and
// broadcasts messages. Messages are stored in D1 (chat_messages) so history survives.
// Uses the WebSocket Hibernation API, so an idle chat costs nothing.

import { withRoles } from "./lib/core.js";
import { now } from "./lib/util.js";

const MAX_LEN = 500;
const RATE_WINDOW_MS = 10000;
const RATE_MAX = 6; // messages per window per person

export const badgeFor = (u) => (u.is_owner ? "Owner" : u.is_staff ? "Staff" : u.is_premium ? "Pro" : "");

export class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.recent = new Map(); // user id -> timestamps of recent messages (rate limit)
  }

  async fetch(request) {
    // The Worker tells us when someone loses access (banned, deleted, Pro removed): drop their sockets.
    const kick = request.headers.get("X-Chat-Kick");
    if (kick) {
      for (const ws of this.state.getWebSockets()) {
        if (ws.deserializeAttachment()?.id === Number(kick)) {
          try { ws.send(JSON.stringify({ type: "error", text: "You don't have access to Pro chat anymore." })); ws.close(4003, "No access"); } catch { /* closed */ }
        }
      }
      this.broadcastPresence();
      return new Response("ok");
    }
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
    const who = JSON.parse(request.headers.get("X-Chat-User") || "null");
    if (!who) return new Response("Forbidden", { status: 403 });
    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment(who);
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  online(except) {
    const seen = new Map();
    for (const ws of this.state.getWebSockets()) {
      if (ws === except) continue;
      const u = ws.deserializeAttachment();
      if (u) seen.set(u.id, { id: u.id, name: u.name, badge: u.badge });
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  broadcast(msg, except) {
    const data = JSON.stringify(msg);
    for (const ws of this.state.getWebSockets()) {
      if (ws === except) continue;
      try { ws.send(data); } catch { /* closed */ }
    }
  }

  broadcastPresence(except) {
    this.broadcast({ type: "presence", online: this.online(except) }, except);
  }

  async webSocketMessage(ws, raw) {
    const who = ws.deserializeAttachment();
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const reply = (m) => { try { ws.send(JSON.stringify(m)); } catch { /* closed */ } };

    // Re-check the account on every action (and at least once a minute while someone only listens):
    // Pro can be removed, people can be banned or muted.
    if (msg.type === "ping" && Date.now() - (who.checked || 0) < 60000) return reply({ type: "pong" });
    const row = await this.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(who.id).first();
    const u = withRoles(row);
    if (!u || u.status !== "approved" || !u.is_pro) {
      reply({ type: "error", text: "You don't have access to Pro chat anymore." });
      return ws.close(4003, "No access");
    }
    ws.serializeAttachment({ ...who, name: u.name, checked: Date.now() });
    if (msg.type === "ping") return reply({ type: "pong" });

    if (msg.type === "send") {
      const body = String(msg.body || "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_LEN);
      if (!body) return;
      if (u.chat_muted) return reply({ type: "error", text: "You're muted in chat. Ask an admin if you think that's a mistake." });
      const t = Date.now();
      const times = (this.recent.get(u.id) || []).filter((x) => t - x < RATE_WINDOW_MS);
      if (times.length >= RATE_MAX) return reply({ type: "error", text: "Slow down a little. Try again in a few seconds." });
      times.push(t);
      this.recent.set(u.id, times);
      const created = now();
      const res = await this.env.DB.prepare("INSERT INTO chat_messages (user_id, body, created_at) VALUES (?, ?, ?)")
        .bind(u.id, body, created).run();
      this.broadcast({ type: "msg", msg: { id: res.meta.last_row_id, user_id: u.id, name: u.name, badge: badgeFor(u),
        body, created_at: created, nonce: msg.nonce || null } });
    } else if (msg.type === "delete") {
      const id = Number(msg.id);
      const target = await this.env.DB.prepare("SELECT user_id FROM chat_messages WHERE id = ?").bind(id).first();
      if (!target) return;
      // Anyone can delete their own message; staff who manage Pro can delete any.
      if (target.user_id !== u.id && !u.perms.has("pro")) return reply({ type: "error", text: "You can only delete your own messages." });
      await this.env.DB.prepare("UPDATE chat_messages SET deleted = 1 WHERE id = ?").bind(id).run();
      this.broadcast({ type: "del", id });
    } else if (msg.type === "typing") {
      this.broadcast({ type: "typing", id: u.id, name: u.name }, ws);
    }
  }

  async webSocketClose(ws, code) {
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, "bye"); } catch { /* already closed */ }
    this.broadcastPresence(ws);
  }

  async webSocketError(ws) {
    this.broadcastPresence(ws);
  }
}
