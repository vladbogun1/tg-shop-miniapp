"use client";

/**
 * Input — dark field: floating label, status, hint. Hairline border; orange border + soft ring on
 * focus; danger/ok on validation.
 */
import { useId, useState, type InputHTMLAttributes } from "react";
import { useUiLook } from "../look";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "placeholder"> {
  label: string;
  status?: "ok" | "danger";
  hint?: string;
}

function fieldBorder(status: Props["status"], focused: boolean, miniapp: boolean): string {
  if (status === "danger") return "var(--danger)";
  if (status === "ok") return "var(--ok)";
  if (focused) return "var(--accent)";
  return miniapp ? "var(--line)" : "var(--line-strong)";
}

export function Input({ label, status, hint, value, className, onFocus, onBlur, ...rest }: Props) {
  const miniapp = useUiLook() === "miniapp";
  const id = useId();
  const [focused, setFocused] = useState(false);
  const hasValue = value !== undefined && value !== null && String(value).length > 0;
  const floated = focused || hasValue;

  const borderColor = fieldBorder(status, focused, miniapp);

  return (
    <div className={`relative ${className ?? ""}`}>
      <div
        className="relative flex items-center rounded-[var(--r)] bg-[var(--surface-2)] px-4 transition-[border-color,box-shadow]"
        style={{
          border: `1px solid ${borderColor}`,
          boxShadow: focused && !status ? "0 0 0 3px var(--accent-soft)" : undefined,
        }}
      >
        <label
          htmlFor={id}
          className={`pointer-events-none absolute left-4 origin-left transition-all duration-150 ${miniapp ? "" : "font-medium "}${
            floated
              ? miniapp
                ? "font-display top-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]"
                : "top-1.5 font-display text-[11px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]"
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
          className="tap w-full bg-transparent pb-2 pt-6 text-[15px] font-medium text-[var(--ink)] outline-none placeholder:text-transparent"
          {...rest}
        />
      </div>
      {hint && (
        <p className={`mt-1 px-1 text-[12px] font-medium ${status === "danger" ? "text-[var(--danger)]" : "text-[var(--faint)]"}`}>
          {hint}
        </p>
      )}
    </div>
  );
}
