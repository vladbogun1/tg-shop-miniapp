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
        <span className="field-label">{label}</span>
      )}
      <textarea
        ref={ref}
        id={taId}
        className={cn(
          "w-full resize-y rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[14px] leading-relaxed text-[var(--text)] outline-none transition-[border-color,box-shadow] duration-150",
          "placeholder:text-[var(--text-faint)] hover:border-[var(--border-2)] focus:!border-[var(--accent)] focus:shadow-[var(--ring-accent)]",
          className
        )}
        {...rest}
      />
      {hint && <span className="text-[12px] text-[var(--text-faint)]">{hint}</span>}
    </label>
  );
});
