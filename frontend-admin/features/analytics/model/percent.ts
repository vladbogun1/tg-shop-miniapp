/** part / whole в процентах, умножение до деления — как раньше `(part * 100) / whole` (на точность не влияет иначе). */
export function percentOf(part: number, whole: number): number {
  return (100 * part) / whole;
}
