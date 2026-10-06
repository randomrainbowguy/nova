// Password hashing.
//
// New hashes: PBKDF2-SHA256 with 100,000 iterations through WebCrypto (the most
// Workers allows). Stored as "pbkdf2:sha256:100000$salt$hex" - the same format
// Werkzeug used, so the old Flask app could still read them.
//
// Hashes made by the old Flask app use 600,000 iterations, which WebCrypto on
// Workers refuses. Those are checked once with a pure-JS PBKDF2, and the password
// is re-hashed in the new format right after a successful login.

import { pbkdf2 as noblePbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";

const ITERATIONS = 100000;
const enc = new TextEncoder();
const SALT_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function webcryptoPbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations }, key, 256);
  return toHex(bits);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hashPassword(password) {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = [...bytes].map((b) => SALT_CHARS[b % SALT_CHARS.length]).join("");
  return `pbkdf2:sha256:${ITERATIONS}$${salt}$${await webcryptoPbkdf2(password, salt, ITERATIONS)}`;
}

/** Returns { ok, rehash } - rehash is true when the stored hash should be upgraded. */
export async function checkPassword(stored, password) {
  const m = /^pbkdf2:sha256:(\d+)\$([^$]*)\$([0-9a-f]+)$/.exec(stored || "");
  if (!m) return { ok: false, rehash: false };
  const iterations = Number(m[1]);
  const [, , salt, expected] = m;
  let got;
  if (iterations <= ITERATIONS) {
    got = await webcryptoPbkdf2(password, salt, iterations);
  } else {
    got = toHex(noblePbkdf2(sha256, enc.encode(password), enc.encode(salt), { c: iterations, dkLen: expected.length / 2 }));
  }
  const ok = timingSafeEqual(got, expected);
  return { ok, rehash: ok && iterations !== ITERATIONS };
}

const RESET_WORDS = ("blue red gold green silver purple orange pink tiger panda falcon otter fox wolf " +
  "shark comet rocket planet river maple cactus pixel ninja dragon").split(" ");

export function tempPassword() {
  const pick = () => RESET_WORDS[crypto.getRandomValues(new Uint32Array(1))[0] % RESET_WORDS.length];
  return `${pick()}-${pick()}-${10 + (crypto.getRandomValues(new Uint32Array(1))[0] % 90)}`;
}
