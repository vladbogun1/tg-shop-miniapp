// Pace of pumpkins: who is ahead waits longer, so the leaders spread the rest over the remaining days
// while a late joiner keeps the normal pause. The daily cap stays the same for everyone.

/**
 * Multiplier of the pause between two pumpkins: 1 with nothing collected before today, growing
 * linearly to `slowMax` at a full day's worth (`dailyCap`) collected on earlier days.
 */
export function gapMultiplier(collectedBefore, dailyCap, slowMax) {
  if (!(slowMax > 1) || !(dailyCap > 0)) return 1;
  return 1 + (slowMax - 1) * Math.min(1, Math.max(0, collectedBefore) / dailyCap);
}
