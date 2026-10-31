/**
 * iOS version from a User-Agent: `OS 16_4` -> 16.04 (minor is a hundredth, not a decimal digit).
 * The caller compares it with a threshold; the encoding is kept as is so the check does not change.
 */
const MINOR_SCALE = 100;

export function parseIosVersion(userAgent: string): number | null {
  const m = userAgent.match(/OS (\d+)[_.](\d+)/);
  return m ? Number(m[1]) + Number(m[2]) / MINOR_SCALE : null;
}
