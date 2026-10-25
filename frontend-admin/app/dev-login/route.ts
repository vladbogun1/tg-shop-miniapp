/**
 * LOCAL STAND ONLY: signs the admin panel in without the password and the 2FA code.
 *
 * Works only under `next dev` AND when DEV_ADMIN_CREDS points at the local stand's credentials file
 * ({"login","password","totpSecretFile"}, see the shop-local-stand skill). Any other build — the
 * Docker image runs `next start` with NODE_ENV=production — answers 404, and the file is read on
 * the server, so the password and the TOTP secret never reach the browser. It does the same two
 * steps a person would (password → code), against the local backend.
 *
 * One sign-in serves every tab: the token is kept until shortly before it expires, concurrent
 * requests share one attempt, and a code is never sent twice in one 30-s step. The backend counts
 * a replayed code as a failure and locks the account after 5 (that happened with a sign-in per tab).
 */
import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

export const dynamic = "force-dynamic";

const BACKEND = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

function base32(s: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of s.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

const step = () => Math.floor(Date.now() / 30000);

function totp(secret: string, at: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(at));
  const h = createHmac("sha1", base32(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function post(path: string, body: unknown): Promise<Record<string, string>> {
  const res = await fetch(`${BACKEND}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

/** Expiry of a JWT (ms), 0 when unreadable. */
function expiresAt(jwt: string): number {
  try {
    return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).exp * 1000;
  } catch {
    return 0;
  }
}

// Module state survives between requests of one `next dev` process (and HMR, via globalThis).
const g = globalThis as { __devAdmin?: { token?: string; exp?: number; lastStep?: number; inflight?: Promise<string> } };
const mem = (g.__devAdmin ??= {});

async function signIn(file: string): Promise<string> {
  const cfg = JSON.parse(readFileSync(file, "utf8"));
  // The previous code of this step was already used: wait for the next one instead of replaying it.
  if (mem.lastStep === step()) await new Promise((r) => setTimeout(r, 30000 - (Date.now() % 30000) + 300));
  let r = await post("/api/auth/admin/login", { username: cfg.login, password: cfg.password });
  if (r.status === "SETUP_REQUIRED") {
    const s = await post("/api/auth/admin/2fa/setup", { preAuthToken: r.preAuthToken });
    writeFileSync(cfg.totpSecretFile, s.secret);
    mem.lastStep = step();
    r = await post("/api/auth/admin/2fa/confirm", { preAuthToken: r.preAuthToken, code: totp(s.secret, mem.lastStep), trustDevice: false });
  } else if (r.status === "TOTP_REQUIRED") {
    const secret = readFileSync(cfg.totpSecretFile, "utf8").trim();
    mem.lastStep = step();
    r = await post("/api/auth/admin/2fa/verify", { preAuthToken: r.preAuthToken, code: totp(secret, mem.lastStep), trustDevice: false });
  }
  if (r.status !== "OK" || !r.accessToken) throw new Error(`login: ${r.status}`);
  mem.token = r.accessToken;
  mem.exp = expiresAt(r.accessToken);
  return r.accessToken;
}

export async function GET(req: Request) {
  const file = process.env.DEV_ADMIN_CREDS;
  if (process.env.NODE_ENV !== "development" || !file) return new Response("Not found", { status: 404 });
  // ?fresh=1: the panel got 401 with the cached token (backend restarted, token revoked).
  const fresh = new URL(req.url).searchParams.has("fresh");
  try {
    if (!fresh && mem.token && (mem.exp ?? 0) - Date.now() > 60_000) {
      return Response.json({ accessToken: mem.token }, { headers: { "Cache-Control": "no-store" } });
    }
    mem.inflight ??= signIn(file).finally(() => (mem.inflight = undefined));
    const accessToken = await mem.inflight;
    return Response.json({ accessToken }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: String((e as Error).message) }, { status: 502 });
  }
}
