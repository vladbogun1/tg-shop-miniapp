"use client";

/**
 * Star rating — read-only display (with fractional fill) and a 1–5 picker.
 * Stars are the one place the brand orange is used for a "value", so the empty ones stay neutral.
 */
import { Star } from "lucide-react";
import { useT } from "@/i18n/context";
import { haptic } from "@/lib/telegram";

/** Read-only stars; `value` may be fractional (4.3 fills 30% of the fifth star). */
export function Stars({
  value,
  size = 14,
  className,
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  const t = useT();
  const v = Math.max(0, Math.min(5, value));
  return (
    <span
      role="img"
      aria-label={t("reviews.starsAria", { value: formatRating(v) })}
      className={`inline-flex items-center gap-[2px] ${className ?? ""}`}
    >
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, v - i));
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }} aria-hidden>
            <Star
              className="absolute inset-0 text-[var(--faint)]"
              style={{ width: size, height: size }}
              strokeWidth={2}
            />
            {fill > 0 && (
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star
                  className="fill-[var(--accent)] text-[var(--accent)]"
                  style={{ width: size, height: size }}
                  strokeWidth={2}
                />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** 1–5 picker: big tap targets, radio semantics for screen readers. */
export function StarInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={t("reviews.form.ratingLabel")} className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= value;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={t("reviews.form.starN", { n })}
            disabled={disabled}
            onClick={() => {
              haptic();
              onChange(n);
            }}
            className="tap grid h-11 w-11 place-items-center rounded-[var(--r)] transition-transform active:scale-90 disabled:opacity-50"
          >
            <Star
              className={`h-7 w-7 transition-colors ${
                on ? "fill-[var(--accent)] text-[var(--accent)]" : "text-[var(--faint)]"
              }`}
              strokeWidth={2}
            />
          </button>
        );
      })}
    </div>
  );
}

/** "4.8" — one decimal, locale-independent dot is fine for a rating. */
export function formatRating(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "0";
  return (Math.round(v * 10) / 10).toFixed(1);
}

/** Compact "★ 4.8 (12)" for catalog cards and next to the product title. */
export function RatingBadge({
  avg,
  count,
  onClick,
  size = "sm",
}: {
  avg: number | null | undefined;
  count: number | undefined;
  onClick?: () => void;
  size?: "sm" | "md";
}) {
  const t = useT();
  if (!count || count <= 0) return null;
  const label = t("reviews.ratingAria", { value: formatRating(avg), n: count });
  const content =
    size === "md" ? (
      <>
        <Stars value={avg ?? 0} size={15} />
        <span className="font-display text-[14px] font-bold tabular-nums text-[var(--ink)]">
          {formatRating(avg)}
        </span>
        <span className="text-[13px] text-[var(--muted)] underline decoration-dotted underline-offset-2">
          {t("reviews.count", { n: count })}
        </span>
      </>
    ) : (
      <>
        <Star className="h-3 w-3 fill-[var(--accent)] text-[var(--accent)]" strokeWidth={2} aria-hidden />
        <span className="font-display text-[12px] font-bold tabular-nums text-[var(--ink)]">
          {formatRating(avg)}
        </span>
        <span className="text-[11px] tabular-nums text-[var(--muted)]">({count})</span>
      </>
    );
  if (onClick) {
    return (
      <button
        type="button"
        aria-label={label}
        onClick={() => {
          haptic();
          onClick();
        }}
        className="tap -my-2 inline-flex items-center gap-1.5 text-left"
      >
        {content}
      </button>
    );
  }
  return (
    <span aria-label={label} role="img" className="inline-flex items-center gap-1">
      {content}
    </span>
  );
}
