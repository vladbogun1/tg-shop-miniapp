/**
 * TOTP codes for the e2e admins (RFC 6238: HMAC-SHA1, 6 digits, 30 s) — what the authenticator app
 * on the owner's phone would show.
 *
 * The backend never accepts the same 30-second step twice for one admin (replay protection), and
 * the specs sign the same admins in again and again, so {@link freshCode} hands out a step that has
 * not been used yet: the current one, else the next one (accepted thanks to the ±1-step window),
 * else it waits. Used steps are remembered in .auth/ across the global setup and the spec files.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AUTH_DIR } from "./api";

const STEPS_FILE = path.join(AUTH_DIR, "totp-steps.json");
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(text: string): Buffer {
  const s = text.replace(/[=\s-]/g, "").toUpperCase();
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of s) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error(`not base32: ${ch}`);
    buffer = (buffer << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((buffer >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function stepNow(): number {
  return Math.floor(Date.now() / 1000 / 30);
}

export function codeAt(secretBase32: string, step: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac("sha1", base32Decode(secretBase32)).update(msg).digest();
  const offset = h[h.length - 1] & 0x0f;
  const bin = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(bin % 1_000_000).padStart(6, "0");
}

function readSteps(): Record<string, number> {
  try {
    return JSON.parse(fs.readFileSync(STEPS_FILE, "utf8")) as Record<string, number>;
  } catch {
    return {};
  }
}

/** Forget the used steps (the global setup resets the admins' last-used step in the DB too). */
export function resetUsedSteps(): void {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(STEPS_FILE, "{}");
}

/** A code whose step this admin has not used yet; waits (≤ 30 s) when both now and now+1 are spent. */
export async function freshCode(secretBase32: string): Promise<string> {
  const steps = readSteps();
  const last = steps[secretBase32] ?? -1;
  const step = Math.max(stepNow(), last + 1);
  while (step > stepNow() + 1) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  steps[secretBase32] = step;
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(STEPS_FILE, JSON.stringify(steps));
  return codeAt(secretBase32, step);
}

/** A code that is certainly wrong right now (no step within the ±1 window produces it). */
export function wrongCode(secretBase32: string): string {
  const now = stepNow();
  const valid = new Set([now - 1, now, now + 1, now + 2].map((s) => codeAt(secretBase32, s)));
  for (let i = 0; ; i++) {
    const c = String((123456 + i * 7919) % 1_000_000).padStart(6, "0");
    if (!valid.has(c)) return c;
  }
}

/** The stored form of a TOTP secret: AES-256-GCM, AAD "admin-totp:<id>", "v1:" + base64(iv‖ct‖tag) — as SecretCipher. */
export function encryptSecret(secretBase32: string, adminId: number, keyBase64: string): string {
  const key = Buffer.from(keyBase64, "base64");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`admin-totp:${adminId}`, "ascii"));
  const ct = Buffer.concat([cipher.update(base32Decode(secretBase32)), cipher.final()]);
  return "v1:" + Buffer.concat([iv, ct, cipher.getAuthTag()]).toString("base64");
}
