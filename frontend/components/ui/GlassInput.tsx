"use client";

/**
 * GlassInput — custom field with floating label (design doc §8.4).
 * NO default HTML input styling: no browser outline, glass container, accent
 * focus ring, danger/ok border on validation.
 */
import { useId, useState, type InputHTMLAttributes } from "react";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "placeholder"> {
  label: string;
  /** "ok" | "danger" tints the border; undefined = neutral. */
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

  const ring =
    status === "danger"
      ? "[box-shadow:inset_0_0_0_1.5px_var(--danger)]"
      : status === "ok"
        ? "[box-shadow:inset_0_0_0_1.5px_var(--ok)]"
        : focused
          ? "[box-shadow:inset_0_0_0_1.5px_var(--accent)]"
          : "[box-shadow:inset_0_1px_0_var(--glass-stroke),inset_0_-1px_0_var(--glass-stroke-bottom)]";

  return (
    <div className={`relative ${className ?? ""}`}>
      <div
        className={`glass relative flex items-center rounded-[var(--r-md)] px-4 transition-shadow ${ring}`}
      >
        <label
          htmlFor={id}
          className={`pointer-events-none absolute left-4 origin-left text-[var(--text-faint)] transition-all duration-200 ${
            floated
              ? "top-2 text-[11px] text-[var(--text-muted)]"
              : "top-1/2 -translate-y-1/2 text-[15px]"
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
          className="tap w-full bg-transparent pb-2 pt-6 text-[15px] text-[var(--text)] outline-none placeholder:text-transparent"
          {...rest}
        />
      </div>
      {hint && (
        <p
          className={`mt-1 px-1 text-[12px] ${
            status === "danger"
              ? "text-[var(--danger)]"
              : "text-[var(--text-faint)]"
          }`}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
