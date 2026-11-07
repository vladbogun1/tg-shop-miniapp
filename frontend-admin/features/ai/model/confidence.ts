/** Цвет точки уверенности модели (0–100): число человеку не показываем, только цвет. */
export function confidenceColor(c: number | null | undefined): string {
  if (c === null || c === undefined) return "var(--text-faint)";
  if (c >= 80) return "var(--ok)";
  if (c >= 60) return "color-mix(in srgb, var(--ok) 50%, var(--warn))";
  if (c >= 40) return "var(--warn)";
  return "var(--danger)";
}
