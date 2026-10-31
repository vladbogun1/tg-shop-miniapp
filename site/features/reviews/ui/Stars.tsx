/**
 * Read-only rating stars (V44 reviews). No hooks: usable from server and client components alike.
 * A fractional value (4.6) fills the last star partially; the whole row is one `img` for screen
 * readers with the caller's label ("4,6 з 5").
 */
import { Star } from "lucide-react";

export function Stars({
  value,
  label,
  size = 16,
  className = "",
}: {
  value: number;
  label: string;
  size?: number;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(5, value)) * 20;
  const row = (filled: boolean) =>
    Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className="shrink-0"
        style={{ width: size, height: size }}
        strokeWidth={filled ? 0 : 1.75}
        fill={filled ? "currentColor" : "none"}
      />
    ));
  return (
    <span role="img" aria-label={label} className={`relative inline-flex shrink-0 align-middle ${className}`}>
      <span aria-hidden className="flex gap-0.5 text-[var(--faint)]">
        {row(false)}
      </span>
      <span aria-hidden className="absolute inset-y-0 left-0 flex gap-0.5 overflow-hidden text-[var(--accent)]" style={{ width: `${pct}%` }}>
        {row(true)}
      </span>
    </span>
  );
}

/** "4.6" / "4,6" — one decimal in the page language. */
export function formatRating(value: number, tag: string): string {
  return new Intl.NumberFormat(tag, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}
