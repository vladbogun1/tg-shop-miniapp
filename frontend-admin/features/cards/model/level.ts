/** «Карточки»: уровень замечаний и уверенность ИИ (0–100). Чистая логика. */
import type { CardIssue, Level } from "./types";
import { parseNumberLoose } from "./value";

export function levelOf(issues: { level: string }[]): Level {
  if (issues.some((i) => i.level === "error")) return "error";
  if (issues.some((i) => i.level === "warn")) return "warn";
  return "ok";
}

/** Уверенность из ответа (0..1 или 0..100) → проценты; null — не указана или не число (замечание уходит в `issues`). */
export function confidenceOf(raw: unknown, issues: CardIssue[], what: string): number | null {
  if (raw === undefined || raw === null) return null;
  const n = parseNumberLoose(raw);
  if (n === null) {
    issues.push({ level: "warn", text: `${what}: уверенность не число` });
    return null;
  }
  // 0..1 scale ("0.92") → percent.
  const pct = n > 0 && n <= 1 && String(raw).includes(".") ? Math.round(n * 100) : Math.round(n);
  if (pct < 0 || pct > 100) {
    issues.push({ level: "info", text: `${what}: уверенность ${n} приведена к 0…100` });
    return Math.max(0, Math.min(100, pct));
  }
  return pct;
}

/** Confidence → colour token. */
export function confidenceColor(c: number | null | undefined): string {
  if (c === null || c === undefined) return "var(--text-faint)";
  if (c >= 80) return "var(--ok)";
  if (c >= 60) return "color-mix(in srgb, var(--ok) 50%, var(--warn))";
  if (c >= 40) return "var(--warn)";
  return "var(--danger)";
}
