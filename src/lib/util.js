// Small helpers shared by the routes and views.

export const now = () => new Date().toISOString().slice(0, 19).replace("T", " ");
export const today = () => new Date().toISOString().slice(0, 10);

export function daysAgo(n, withTime = false) {
  const d = new Date(Date.now() - n * 86400000).toISOString();
  return withTime ? d.slice(0, 19).replace("T", " ") : d.slice(0, 10);
}

export function addDays(n) {
  return new Date(Date.now() + n * 86400000).toISOString().slice(0, 19).replace("T", " ");
}

export const plural = (n, one, many = one + "s") => (n === 1 ? one : many);

export const truncate = (s, n) => {
  s = String(s ?? "");
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
};

export const cleanName = (v) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 40);

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function randomHex(bytes) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomInt(max) {
  return crypto.getRandomValues(new Uint32Array(1))[0] % max;
}

/** "12.0" -> "12", "4.5" -> "4.5" (Python's '%g'). */
export const g = (n) => String(Number(Number(n).toFixed(2)));

export function safeNext(nxt) {
  return nxt && nxt.startsWith("/") && !nxt.startsWith("//") && !nxt.startsWith("/\\") ? nxt : "/";
}

export function isHttpUrl(v) {
  return /^https?:\/\//i.test(v || "");
}

/** Only allow links that can't run script: http(s) or site-relative. */
export function safeLink(v) {
  v = String(v || "").trim();
  return isHttpUrl(v) || (v.startsWith("/") && !v.startsWith("//")) ? v : "";
}

export function timeAgo(ts) {
  if (!ts) return "";
  const then = Date.parse(ts.replace(" ", "T") + "Z");
  const s = Math.max(0, (Date.now() - then) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(then).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
