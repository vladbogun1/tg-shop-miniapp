"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  icon?: ReactNode;
  rightSlot?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, icon, rightSlot, className, id, ...rest },
  ref
) {
  const inputId = id || (label ? `in-${label.replace(/\s+/g, "-")}` : undefined);
  return (
    <label htmlFor={inputId} className="flex flex-col gap-1.5">
      {label && (
        <span className="text-[12px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
      )}
      <div
        className={cn(
          "group relative flex items-center rounded-[var(--r-md)] border-[3px] bg-[var(--surface-2)] transition-colors",
          "border-[var(--line)] focus-within:border-[var(--accent)] focus-within:shadow-[var(--ring-accent)]",
          error && "border-[var(--danger)]"
        )}
      >
        {icon && (
          <span className="pointer-events-none pl-3 text-[var(--text-faint)]">{icon}</span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "min-w-0 flex-1 bg-transparent px-3.5 py-2.5 text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]",
            !!icon && "pl-2.5",
            className
          )}
          {...rest}
        />
        {rightSlot && <span className="pr-2">{rightSlot}</span>}
      </div>
      {error ? (
        <span className="text-[12px] text-[var(--danger)]">{error}</span>
      ) : (
        hint && <span className="text-[12px] text-[var(--text-faint)]">{hint}</span>
      )}
    </label>
  );
});
