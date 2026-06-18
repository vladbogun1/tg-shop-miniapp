"use client";

/** GlassTextarea — glass multiline field with floating label. */
import { useId, useState, type TextareaHTMLAttributes } from "react";

interface Props extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "placeholder"> {
  label: string;
}

export function GlassTextarea({ label, value, className, onFocus, onBlur, ...rest }: Props) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const hasValue = value !== undefined && value !== null && String(value).length > 0;
  const floated = focused || hasValue;
  const ring = focused
    ? "[box-shadow:inset_0_0_0_1.5px_var(--accent)]"
    : "[box-shadow:inset_0_1px_0_var(--glass-stroke),inset_0_-1px_0_var(--glass-stroke-bottom)]";

  return (
    <div className={`relative ${className ?? ""}`}>
      <div className={`glass relative rounded-[var(--r-md)] px-4 transition-shadow ${ring}`}>
        <label
          htmlFor={id}
          className={`pointer-events-none absolute left-4 origin-left text-[var(--text-faint)] transition-all duration-200 ${
            floated ? "top-1.5 text-[11px] text-[var(--text-muted)]" : "top-4 text-[15px]"
          }`}
        >
          {label}
        </label>
        <textarea
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
          className="thin-scroll w-full resize-none bg-transparent pb-2 pt-6 text-[15px] text-[var(--text)] outline-none"
          {...rest}
        />
      </div>
    </div>
  );
}
