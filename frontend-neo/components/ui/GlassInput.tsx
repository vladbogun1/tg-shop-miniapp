"use client";

/**
 * GlassInput — NEO-BRUTALISM field (API unchanged: label floating, status, hint).
 * Thick ink border; accent border on focus; danger/ok on validation. Sharp corners.
 */
import { useId, useState, type InputHTMLAttributes } from "react";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "placeholder"> {
  label: string;
  status?: "ok" | "danger";
  hint?: string;
}

export function GlassInput({
  label,
  status,
  hint,
  value,
  className,
  onFocus,
  onBlur,
  ...rest
}: Props) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const hasValue = value !== undefined && value !== null && String(value).length > 0;
  const floated = focused || hasValue;

  const borderColor =
    status === "danger"
      ? "var(--danger)"
      : status === "ok"
        ? "var(--ok)"
        : focused
          ? "var(--accent)"
          : "var(--line)";

  return (
    <div className={`relative ${className ?? ""}`}>
      <div
        className="relative flex items-center rounded-[var(--r)] bg-[var(--surface)] px-4 transition-colors"
        style={{ border: `3px solid ${borderColor}` }}
      >
        <label
          htmlFor={id}
          className={`pointer-events-none absolute left-4 origin-left font-bold transition-all duration-150 ${
            floated
              ? "top-1.5 text-[11px] uppercase tracking-wide text-[var(--muted)]"
              : "top-1/2 -translate-y-1/2 text-[15px] text-[var(--faint)]"
          }`}
        >
          {label}
        </label>
        <input
          id={id}
          value={value}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          className="tap w-full bg-transparent pb-2 pt-6 text-[15px] font-semibold text-[var(--ink)] outline-none placeholder:text-transparent"
          {...rest}
        />
      </div>
      {hint && (
        <p
          className={`mt-1 px-1 text-[12px] font-semibold ${
            status === "danger" ? "text-[var(--danger)]" : "text-[var(--faint)]"
          }`}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
