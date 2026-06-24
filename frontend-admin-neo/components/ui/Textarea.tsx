"use client";

import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, className, id, ...rest },
  ref
) {
  const taId = id || (label ? `ta-${label.replace(/\s+/g, "-")}` : undefined);
  return (
    <label htmlFor={taId} className="flex flex-col gap-1.5">
      {label && (
        <span className="text-[12px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
      )}
      <textarea
        ref={ref}
        id={taId}
        className={cn(
          "w-full resize-y rounded-[var(--r-md)] border-[3px] border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2.5 text-[14px] leading-relaxed text-[var(--text)] outline-none transition-colors",
          "placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:shadow-[var(--ring-accent)]",
          className
        )}
        {...rest}
      />
      {hint && <span className="text-[12px] text-[var(--text-faint)]">{hint}</span>}
    </label>
  );
});
