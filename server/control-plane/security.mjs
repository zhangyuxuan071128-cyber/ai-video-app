import {
  createCipheriv,
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;

export function randomId(prefix = "id") {
  return `${prefix}_${randomBytes(16).toString("hex")}`;
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(String(password), salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    Buffer.from(derived).toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password, encoded) {
  const [algorithm, nText, rText, pText, saltText, hashText] = String(encoded).split("$");
  if (algorithm !== "scrypt" || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, "base64url");
  const derived = await scrypt(String(password), Buffer.from(saltText, "base64url"), expected.length, {
    N: Number(nText),
    r: Number(rText),
    p: Number(pText),
    maxmem: 64 * 1024 * 1024,
  });
  const actual = Buffer.from(derived);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hashOpaqueToken(token) {
  return sha256(`control-plane-session:${token}`);
}

export function hashCode(code) {
  return sha256(`control-plane-code:${String(code).trim().toUpperCase()}`);
}

export function codeSummary(code) {
  const normalized = String(code).trim().toUpperCase();
  return {
    prefix: normalized.slice(0, Math.min(5, normalized.length)),
    last4: normalized.slice(-4),
  };
}

export function encryptSecret(secret, masterKey) {
  const key = sha256(`control-plane-secret:${masterKey}`);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  const ciphertext = Buffer.concat([cipher.update(String(secret), "utf8"), cipher.final()]);
  return {
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
}

export function secretLast4(secret) {
  return String(secret).slice(-4);
}

export function normalizeUsername(username) {
  return String(username ?? "").trim().toLowerCase();
}

export function parseCookies(header) {
  const result = {};
  for (const part of String(header ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

export function sessionCookie(token, { maxAgeSeconds, secure = false } = {}) {
  const attributes = [
    `sid=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds ?? 0))}`,
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

export function clearSessionCookie({ secure = false } = {}) {
  return sessionCookie("", { maxAgeSeconds: 0, secure });
}

export function redact(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value !== "object") return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (/password|secret|token|credential|ciphertext|codeHash|^(?:code|inviteCode|rechargeCode)$/i.test(key)) {
      output[key] = "[REDACTED]";
    } else {
      output[key] = redact(child);
    }
  }
  return output;
}

export function requestFingerprint(value) {
  const project = (current, key = "") => {
    if (current === null || current === undefined) return current;
    if (/password|secret|token|credential|ciphertext|codeHash/i.test(key)) {
      return `[VALUE_SHA256:${sha256(JSON.stringify(current))}]`;
    }
    if (Array.isArray(current)) return current.map((item) => project(item));
    if (typeof current !== "object") return current;
    return Object.fromEntries(Object.entries(current).map(([childKey, child]) => [childKey, project(child, childKey)]));
  };
  return sha256(JSON.stringify(project(value ?? null)));
}
