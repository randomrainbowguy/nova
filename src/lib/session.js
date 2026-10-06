// Signed-cookie sessions (like Flask's): the data lives in the cookie, an HMAC stops tampering.

const COOKIE = "nova_s";
const enc = new TextEncoder();
const keyCache = new Map();

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(str) {
  const s = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function hmacKey(secret) {
  if (!keyCache.has(secret)) {
    keyCache.set(secret, crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" },
      false, ["sign", "verify"]));
  }
  return keyCache.get(secret);
}

export async function sign(secret, value) {
  const data = b64url(enc.encode(value));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(data));
  return `${data}.${b64url(new Uint8Array(sig))}`;
}

export async function unsign(secret, token) {
  const [data, sig] = String(token || "").split(".");
  if (!data || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), unb64url(sig), enc.encode(data));
    return ok ? new TextDecoder().decode(unb64url(data)) : null;
  } catch {
    return null;
  }
}

export function readCookie(header, name) {
  for (const part of (header || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export async function loadSession(req, secret) {
  const raw = await unsign(secret, readCookie(req.headers.get("Cookie"), COOKIE));
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
  let dirty = false;
  const session = {
    data,
    get: (k) => data[k],
    set(k, v) { data[k] = v; dirty = true; },
    del(k) { if (k in data) { delete data[k]; dirty = true; } },
    clear() { for (const k of Object.keys(data)) if (k !== "csrf") delete data[k]; dirty = true; },
    flash(msg, cat = "ok") { (data.flashes ||= []).push([cat, msg]); dirty = true; },
    takeFlashes() {
      const f = data.flashes || [];
      if (f.length) { delete data.flashes; dirty = true; }
      return f;
    },
    get dirty() { return dirty; },
  };
  return session;
}

export async function sessionCookie(session, secret, secure) {
  const value = await sign(secret, JSON.stringify(session.data));
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 31}${secure ? "; Secure" : ""}`;
}
