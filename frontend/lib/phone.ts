/**
 * Ukrainian phone mask helpers. Display: +38 (0XX) XXX-XX-XX.
 * Stored/submitted value is the E.164 digits string "+380XXXXXXXXX".
 */

/** Keep only digits, normalise to a 12-digit "380…" national+country form. */
function digits(raw: string): string {
  let d = raw.replace(/\D/g, "");
  // Strip leading 0 if user typed local "0XX…" without country code.
  if (d.startsWith("380")) return d.slice(0, 12);
  if (d.startsWith("80")) return ("3" + d).slice(0, 12);
  if (d.startsWith("0")) return ("38" + d).slice(0, 12);
  if (d.startsWith("38")) return d.slice(0, 12);
  // assume bare operator+number, prefix 380
  return ("380" + d).slice(0, 12);
}

/** Format for display while typing: +38 (0XX) XXX-XX-XX */
export function formatPhone(raw: string): string {
  const d = digits(raw);
  if (d.length <= 2) return "+38";
  // d = 380XXXXXXXXX ; after "38" comes "0XX..."
  const rest = d.slice(2); // 0XXXXXXXXX (up to 10)
  const a = rest.slice(0, 3); // 0XX
  const b = rest.slice(3, 6); // XXX
  const c = rest.slice(6, 8); // XX
  const e = rest.slice(8, 10); // XX
  let out = "+38";
  if (a) out += ` (${a}`;
  if (a.length === 3) out += ")";
  if (b) out += ` ${b}`;
  if (c) out += `-${c}`;
  if (e) out += `-${e}`;
  return out;
}

/** E.164 value to submit: +380XXXXXXXXX (or "" if incomplete). */
export function phoneE164(raw: string): string {
  const d = digits(raw);
  return d.length === 12 ? `+${d}` : "";
}

/** True when the phone is a complete UA number. */
export function isvalidPhone(raw: string): boolean {
  return phoneE164(raw) !== "";
}
