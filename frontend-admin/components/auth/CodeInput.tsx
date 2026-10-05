"use client";

/**
 * The 6-digit code from the authenticator app: ONE field (so iOS/Android «code from Messages /
 * password manager» autofill and paste just work — autocomplete="one-time-code"), big tabular
 * digits with a slot underlay, submits by itself on the 6th digit.
 */
import { forwardRef, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export const CODE_LENGTH = 6;

export interface CodeInputProps {
  value: string;
  onChange: (v: string) => void;
  /** Called once when the 6th digit arrives (typed or pasted). */
  onComplete?: (code: string) => void;
  label?: string;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
  id?: string;
}

export const CodeInput = forwardRef<HTMLInputElement, CodeInputProps>(function CodeInput(
  { value, onChange, onComplete, label = "Код из приложения", disabled, error, autoFocus, id = "totp-code" },
  ref
) {
  const lastCompleted = useRef<string | null>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (value.length === CODE_LENGTH && value !== lastCompleted.current) {
      lastCompleted.current = value;
      onComplete?.(value);
    }
    if (value.length < CODE_LENGTH) lastCompleted.current = null;
  }, [value, onComplete]);

  const digits = value.padEnd(CODE_LENGTH, " ").split("").slice(0, CODE_LENGTH);

  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="field-label">{label}</span>
      <div className="relative">
        {/* Slots under the real input: the input's text is transparent, the slots show the digits. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 grid grid-cols-6 gap-2">
          {digits.map((d, i) => {
            const active = focused && i === Math.min(value.length, CODE_LENGTH - 1);
            return (
              <span
                key={i}
                className={cn(
                  "font-display grid place-items-center rounded-[var(--r-md)] border bg-[var(--surface-2)] text-[24px] font-bold tabular-nums text-[var(--ink)] transition-[border-color,box-shadow] duration-150",
                  error
                    ? "border-[var(--danger)]"
                    : active
                      ? "border-[var(--accent)] shadow-[var(--ring-accent)]"
                      : d.trim()
                        ? "border-[var(--border-2)]"
                        : "border-[var(--line)]"
                )}
              >
                {d.trim()}
              </span>
            );
          })}
        </div>
        <input
          ref={ref}
          id={id}
          name="one-time-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={CODE_LENGTH + 2}
          autoFocus={autoFocus}
          disabled={disabled}
          aria-invalid={error || undefined}
          value={value}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
          className="relative block h-14 w-full bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent disabled:opacity-60"
        />
      </div>
    </label>
  );
});
