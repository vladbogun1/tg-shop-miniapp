"use client";

/** Поля ввода характеристики: Да/Нет/Не знаю, чипы выбора, поиск по длинному списку опций. */
import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { AdminSpecAttribute } from "../model/types";
import { Popover } from "./Popover";

export function TriState({ id, value, onChange, missing }: { id: string; value: boolean | null; onChange: (v: boolean | null) => void; missing?: boolean }) {
  const opts: { v: boolean | null; label: string }[] = [
    { v: true, label: "Да" },
    { v: false, label: "Нет" },
    { v: null, label: "Не знаю" },
  ];
  return (
    <div
      id={id}
      role="radiogroup"
      className={cn(
        "inline-flex h-10 w-full items-center gap-0.5 rounded-[var(--r-md)] border bg-[var(--bg-2)] p-[3px] pointer-coarse:h-11",
        missing ? "border-[color-mix(in_srgb,var(--warn)_55%,transparent)]" : "border-[var(--line)]"
      )}
    >
      {opts.map((o) => {
        const on = value === o.v;
        return (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.v)}
            className={cn(
              "focusable font-display h-full flex-1 rounded-[var(--r-sm)] border text-[12px] font-semibold uppercase tracking-[0.06em] transition-colors",
              on
                ? o.v === null
                  ? "border-[var(--line-strong)] bg-[var(--surface-3)] text-[var(--text)]"
                  : "border-[rgba(255,102,0,.45)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Chips({
  id,
  attr,
  selected,
  onToggle,
  single,
  missing,
}: {
  id: string;
  attr: AdminSpecAttribute;
  selected: string[];
  onToggle: (v: string) => void;
  single?: boolean;
  missing?: boolean;
}) {
  const [all, setAll] = useState(false);
  const opts = [...attr.options].sort((a, b) => a.sort - b.sort);
  const LIMIT = 14;
  const shown = all || opts.length <= LIMIT ? opts : opts.filter((o, i) => i < LIMIT || selected.includes(o.value));
  return (
    <div
      id={id}
      role={single ? "radiogroup" : "group"}
      className={cn("flex flex-wrap gap-1.5 rounded-[var(--r-md)]", missing && "ring-1 ring-[color-mix(in_srgb,var(--warn)_55%,transparent)] ring-offset-4 ring-offset-[var(--surface)]")}
    >
      {shown.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            role={single ? "radio" : "checkbox"}
            aria-checked={on}
            onClick={() => onToggle(o.value)}
            className={cn(
              "nb-chip nb-press focusable inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] transition-colors",
              on ? "nb-chip-active" : "text-[var(--text-muted)] hover:border-[var(--border-2)] hover:text-[var(--text)]"
            )}
          >
            {on && <Check className="h-3.5 w-3.5" />}
            {o.labelRu}
          </button>
        );
      })}
      {opts.length > LIMIT && (
        <button type="button" onClick={() => setAll((v) => !v)} className="focusable rounded-[var(--r-sm)] px-2 text-[12px] font-semibold text-[var(--accent-hi)] hover:underline">
          {all ? "Свернуть" : `Ещё ${opts.length - shown.length}`}
        </button>
      )}
    </div>
  );
}

/** Searchable single choice for long option lists (sensors, switches). */
export function OptionPicker({
  id,
  attr,
  value,
  onChange,
  missing,
}: {
  id: string;
  attr: AdminSpecAttribute;
  value: string;
  onChange: (v: string) => void;
  missing?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const opts = useMemo(() => {
    const nq = q.toLowerCase().trim();
    return [...attr.options]
      .sort((a, b) => a.sort - b.sort)
      .filter((o) => !nq || o.labelRu.toLowerCase().includes(nq) || o.value.includes(nq) || o.aliases.some((x) => x.toLowerCase().includes(nq)));
  }, [attr.options, q]);
  const current = attr.options.find((o) => o.value === value);
  useEffect(() => setActive(0), [q]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
    setQ("");
    btnRef.current?.focus();
  }

  return (
    <>
      <button
        ref={btnRef}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "focusable flex h-10 items-center justify-between gap-2 rounded-[var(--r-md)] border bg-[var(--surface-2)] px-3 text-left text-[14px] hover:border-[var(--border-2)] pointer-coarse:h-11",
          open ? "!border-[var(--accent)] shadow-[var(--ring-accent)]" : missing ? "border-[color-mix(in_srgb,var(--warn)_55%,transparent)]" : "border-[var(--line)]"
        )}
      >
        <span className={cn("truncate", current ? "text-[var(--text)]" : "text-[var(--text-faint)]")}>
          {current ? current.labelRu : value ? `«${value}» (нет в списке)` : `Выбрать · ${attr.options.length}`}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-[var(--text-faint)] transition-transform", open && "rotate-180")} />
      </button>
      <Popover open={open} anchorRef={btnRef} panelRef={panelRef} onClose={() => (setOpen(false), setQ(""))} maxHeight={320}>
        <div className="flex items-center gap-2 border-b border-[var(--line)] px-3">
          <Search className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(opts.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter" && opts[active]) {
                e.preventDefault();
                pick(opts[active].value);
              }
            }}
            placeholder="Найти…"
            className="h-10 min-w-0 flex-1 bg-transparent text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
          />
          {value && (
            <button type="button" onClick={() => pick("")} className="focusable flex shrink-0 items-center gap-1 rounded-[var(--r-sm)] text-[12px] text-[var(--text-faint)] hover:text-[var(--text)]">
              <X className="h-3.5 w-3.5" /> сбросить
            </button>
          )}
        </div>
        <div role="listbox" className="thin-scroll min-h-0 flex-1 overflow-auto p-1">
          {opts.length === 0 && <div className="px-3 py-4 text-center text-[13px] text-[var(--text-faint)]">Ничего не найдено</div>}
          {opts.map((o, i) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o.value)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-[var(--r-sm)] px-3 py-2 text-left text-[14px]",
                o.value === value ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent-hi)]" : i === active ? "bg-[var(--surface-hover)] text-[var(--text)]" : "text-[var(--text)]"
              )}
            >
              <span className="truncate">{o.labelRu}</span>
              {o.value === value && <Check className="h-4 w-4 shrink-0" />}
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}
