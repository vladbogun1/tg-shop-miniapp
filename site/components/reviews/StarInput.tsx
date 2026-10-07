"use client";

/**
 * 1–5 star picker: a radiogroup (roving tabindex), arrows/Home/End move and select, hover previews.
 */
import { Star } from "lucide-react";
import { useRef, useState } from "react";
import { useI18n } from "@/i18n/context";

export function StarInput({
  value,
  onChange,
  labelId,
}: {
  value: number;
  onChange: (n: number) => void;
  labelId: string;
}) {
  const { t } = useI18n();
  const [hover, setHover] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const shown = hover || value;

  function select(n: number) {
    const v = Math.max(1, Math.min(5, n));
    onChange(v);
    refs.current[v - 1]?.focus();
  }

  function onKey(e: React.KeyboardEvent) {
    const cur = value || 0;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") select(cur + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") select(cur - 1);
    else if (e.key === "Home") select(1);
    else if (e.key === "End") select(5);
    else return;
    e.preventDefault();
  }

  return (
    <div role="radiogroup" aria-labelledby={labelId} className="flex gap-1" onMouseLeave={() => setHover(0)} onKeyDown={onKey}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= shown;
        const focusable = value ? n === value : n === 1;
        return (
          <button
            key={n}
            ref={(el) => {
              refs.current[n - 1] = el;
            }}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={t("reviews.form.rate", { n })}
            tabIndex={focusable ? 0 : -1}
            onClick={() => select(n)}
            onMouseEnter={() => setHover(n)}
            className="grid h-11 w-11 place-items-center rounded-[var(--r)] transition-transform hover:scale-110"
          >
            <Star
              className={`h-8 w-8 transition-colors ${on ? "text-[var(--accent)]" : "text-[var(--faint)]"}`}
              strokeWidth={on ? 0 : 1.75}
              fill={on ? "currentColor" : "none"}
            />
          </button>
        );
      })}
    </div>
  );
}
