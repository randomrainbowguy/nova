// Email. Workers can't talk SMTP, so this uses Resend's HTTP API (free tier: 3,000/month).
// Set the RESEND_API_KEY secret and MAIL_FROM (an address on a domain you verified in Resend).
// Without a key, emails are only written to the log.

import { sign } from "./session.js";
import { PRO_SQL, withRoles } from "./core.js";
import { now } from "./util.js";

export const emailConfigured = (env) => !!env.RESEND_API_KEY;

export const siteUrl = (c) => (c.env.SITE_URL || new URL(c.req.url).origin).replace(/\/$/, "");

export const unsubscribeToken = (c, userId) => sign(c.get("secret") + ":unsubscribe", String(userId));

async function sendAll(env, messages) {
  if (!emailConfigured(env)) {
    for (const m of messages) console.log(`[email not sent - RESEND_API_KEY not set] to=${m.to} subject=${m.subject}`);
    return;
  }
  const from = env.MAIL_FROM || "Nova <onboarding@resend.dev>";
  // Resend's batch endpoint takes up to 100 emails per call.
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100).map((m) => ({ from, to: [m.to], subject: m.subject, text: m.text }));
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      });
      if (!res.ok) console.log(`[email error] ${res.status} ${await res.text()}`);
    } catch (err) {
      console.log(`[email error] ${err}`); // never let email failures break the site
    }
  }
}

/** recipients: [{ email, id }] - id (or null) adds an unsubscribe link. Sends in the background. */
export async function sendEmail(c, recipients, subject, body) {
  const base = siteUrl(c);
  const messages = [];
  for (const r of recipients) {
    let footer = "";
    if (r.id != null) footer = `\n\n--\nDon't want these emails? ${base}/unsubscribe/${await unsubscribeToken(c, r.id)}`;
    messages.push({ to: r.email, subject, text: body + footer });
  }
  if (messages.length) c.executionCtx.waitUntil(sendAll(c.env, messages));
}

/** Post an in-site update (also pops up for people) and email everyone who opted in.
 *  audience 'pro' keeps it to Pro members and staff. */
export async function notify(c, { title, body = "", link = "", email = true, kind = "announce", audience = "all" }) {
  const db = c.env.DB;
  await db.prepare("INSERT INTO notifications (kind, title, body, link, created_at, audience) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(kind, title, body, link, now(), audience).run();
  if (!email) return;
  const { results } = await db.prepare(
    "SELECT id, email FROM users WHERE status = 'approved' AND email_opt_in = 1" + (audience === "pro" ? ` AND ${PRO_SQL}` : "")).all();
  const text = body + (link ? `\n\n${siteUrl(c)}${link}` : "");
  await sendEmail(c, results.map((r) => ({ email: r.email, id: r.id })), `${c.var.settings.site_name}: ${title}`, text);
}

export async function emailManagers(c, subject, body, perm = "people") {
  const { results } = await c.env.DB.prepare("SELECT * FROM users WHERE role = 'owner' OR perms != ''").all();
  const to = results.map(withRoles).filter((u) => u.perms.has(perm)).map((u) => ({ email: u.email, id: null }));
  await sendEmail(c, to, subject, body);
}
