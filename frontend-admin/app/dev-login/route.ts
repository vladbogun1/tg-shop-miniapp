/**
 * LOCAL STAND ONLY: signs the admin panel in without the password and the 2FA code.
 *
 * Works only under `next dev` AND when DEV_ADMIN_CREDS points at the local stand's credentials file
 * ({"login","password","totpSecretFile"}, see the shop-local-stand skill). Any other build — the
 * Docker image runs `next start` with NODE_ENV=production — answers 404, and the file is read on
 * the server, so the password and the TOTP secret never reach the browser. It does the same two
 * steps a person would (password → code), against the local backend.
 */
import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

export const dynamic = "force-dynamic";

const BACKEND = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

function base32(s: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of s.replace(/=+$/, "").toUpperCase())
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret: string): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", base32(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function post(
  path: string,
  body: unknown,
): Promise<Record<string, string>> {
  const res = await fetch(`${BACKEND}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

export async function GET() {
  const file = process.env.DEV_ADMIN_CREDS;
  if (process.env.NODE_ENV !== "development" || !file)
    return new Response("Not found", { status: 404 });
  try {
    const cfg = JSON.parse(readFileSync(file, "utf8"));
    let r = await post("/api/auth/admin/login", {
      username: cfg.login,
      password: cfg.password,
    });
    if (r.status === "SETUP_REQUIRED") {
      const s = await post("/api/auth/admin/2fa/setup", {
        preAuthToken: r.preAuthToken,
      });
      writeFileSync(cfg.totpSecretFile, s.secret);
      r = await post("/api/auth/admin/2fa/confirm", {
        preAuthToken: r.preAuthToken,
        code: totp(s.secret),
        trustDevice: false,
      });
    } else if (r.status === "TOTP_REQUIRED") {
      const secret = readFileSync(cfg.totpSecretFile, "utf8").trim();
      r = await post("/api/auth/admin/2fa/verify", {
        preAuthToken: r.preAuthToken,
        code: totp(secret),
        trustDevice: false,
      });
    }
    if (r.status !== "OK" || !r.accessToken)
      throw new Error(`login: ${r.status}`);
    return Response.json(
      { accessToken: r.accessToken },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return Response.json(
      { error: String((e as Error).message) },
      { status: 502 },
    );
  }
}
