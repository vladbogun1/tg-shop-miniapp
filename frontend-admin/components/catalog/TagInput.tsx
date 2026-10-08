"use client";

/**
 * Chips + text field for short string lists (aliases): Enter or comma adds, Backspace on an empty
 * field removes the last chip, × removes one. A pasted "a, b\nc" becomes three chips.
 */
import { X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

export function TagInput({
  value,
  onChange,
  placeholder = "добавить…",
  ariaLabel,
  className,
  dense,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  dense?: boolean;
}) {
  const [text, setText] = useState("");

  function add(raw: string) {
    const parts = raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const lower = new Set(value.map((v) => v.toLowerCase()));
    const next = [...value];
    for (const p of parts) {
      if (!lower.has(p.toLowerCase())) {
        next.push(p);
        lower.add(p.toLowerCase());
      }
    }
    onChange(next);
    setText("");
  }

  return (
    <div
      className={cn(
        "flex min-h-10 flex-wrap items-center gap-1 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-1.5 py-1 transition-[border-color,box-shadow] focus-within:!border-[var(--accent)] focus-within:shadow-[var(--ring-accent)] hover:border-[var(--border-2)]",
        dense && "min-h-9",
        className
      )}
    >
      {value.map((v, i) => (
        <span
          key={v + i}
          className="inline-flex max-w-full items-center gap-1 rounded-[var(--r-sm)] bg-[var(--surface-3)] py-0.5 pl-2 pr-0.5 text-[12px] text-[var(--text)]"
        >
          <span className="truncate">{v}</span>
          <button
            type="button"
            aria-label={`Убрать «${v}»`}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            className="focusable grid h-5 w-5 place-items-center rounded-[3px] text-[var(--text-faint)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={text}
        aria-label={ariaLabel}
        placeholder={value.length ? "" : placeholder}
        onChange={(e) => {
          const v = e.target.value;
          if (/[,\n]/.test(v)) add(v);
          else setText(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(text);
          } else if (e.key === "Backspace" && !text && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => add(text)}
        className="h-7 min-w-[80px] flex-1 bg-transparent px-1 text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
      />
    </div>
  );
}
