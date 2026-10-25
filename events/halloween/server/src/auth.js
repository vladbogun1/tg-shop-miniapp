// Who is calling: the shop's own JWT (HS256, subject = Telegram id), checked with the shared secret.
// Website: the HttpOnly `access` cookie (same origin through the gateway). Mini App / admin: Bearer.
import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

const key = config.jwtSecret ? Buffer.from(config.jwtSecret, "base64") : null;

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

export function verifyJwt(token) {
  if (!key || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  let header;
  try {
    header = JSON.parse(Buffer.from(h, "base64url").toString());
  } catch {
    return null;
  }
  if (header.alg !== "HS256") return null;
  const expected = b64url(createHmac("sha256", key).update(`${h}.${p}`).digest());
  const a = Buffer.from(s);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let claims;
  try {
    claims = JSON.parse(Buffer.from(p, "base64url").toString());
  } catch {
    return null;
  }
  if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) return null;
  if (!/^\d+$/.test(String(claims.sub))) return null;
  return claims;
}

function cookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function bearer(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

/** The customer (or admin browsing the shop) — `{ tgId, role }` or null for a guest. */
export function customer(req) {
  if (config.devAuth) {
    const dev = new URL(req.url, "http://x").searchParams.get("dev") || req.headers["x-dev-user"];
    if (dev && /^\d+$/.test(dev)) return { tgId: dev, role: "CUSTOMER" };
  }
  const claims = verifyJwt(bearer(req)) || verifyJwt(cookie(req, "access"));
  return claims ? { tgId: String(claims.sub), role: claims.role } : null;
}

// Admin tokens can be revoked (logout, password change), which the signature alone cannot tell.
// So an ADMIN-signed token is also shown to the shop backend once a minute.
const adminCache = new Map(); // sha256(token) → { ok, until }

export async function admin(req) {
  const token = bearer(req);
  if (config.devAuth && token === "dev-admin") return { tgId: "1", role: "ADMIN" };
  const claims = verifyJwt(token);
  if (!claims || (claims.role !== "ADMIN" && claims.role !== "SUPER_ADMIN")) return null;
  const k = createHash("sha256").update(token).digest("hex");
  const hit = adminCache.get(k);
  if (hit && hit.until > Date.now()) return hit.ok ? { tgId: String(claims.sub), role: claims.role } : null;
  let ok = false;
  try {
    const res = await fetch(`${config.backendUrl}/api/admin/account`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4000),
    });
    ok = res.ok;
  } catch {
    ok = false;
  }
  adminCache.set(k, { ok, until: Date.now() + 60_000 });
  if (adminCache.size > 500) adminCache.clear();
  return ok ? { tgId: String(claims.sub), role: claims.role } : null;
}
