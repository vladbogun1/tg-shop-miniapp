"use client";

/**
 * Brand picker: search over names and aliases of the brand directory, or «Создать „…“» —
 * then only the name is sent (`brandName`) and the server finds it by alias or creates it.
 * Value: `{ id, name }`; `id = null` with a name = a new brand, both empty = no brand.
 */
import { Check, Plus, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { AdminBrand } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Popover } from "./Popover";

export interface BrandValue {
  id: string | null;
  name: string;
}

const norm = (s: string) => s.toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/[\s_-]+/g, " ").trim();

export function BrandCombobox({
  brands,
  value,
  onChange,
  label = "Бренд",
  hint,
  allowCreate = true,
  exclude,
}: {
  brands: AdminBrand[];
  value: BrandValue;
  onChange: (v: BrandValue) => void;
  label?: string;
  hint?: string;
  /** false: only existing brands (merge target). */
  allowCreate?: boolean;
  /** Brand ids not offered. */
  exclude?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const results = useMemo(() => {
    const nq = norm(q);
    const scored = brands
      .filter((b) => !exclude?.includes(b.id))
      .map((b) => {
        const name = norm(b.name);
        const alias = b.aliases.find((a) => norm(a).includes(nq));
        let score = -1;
        if (!nq) score = 1;
        else if (name === nq) score = 4;
        else if (name.startsWith(nq)) score = 3;
        else if (name.includes(nq)) score = 2;
        else if (alias) score = 1;
        return { b, score, alias: nq && !name.includes(nq) ? alias : undefined };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || b.b.productCount - a.b.productCount || a.b.name.localeCompare(b.b.name));
    return scored.slice(0, 50);
  }, [brands, q, exclude]);

  const exact = brands.some((b) => norm(b.name) === norm(q) || b.aliases.some((a) => norm(a) === norm(q)));
  const canCreate = allowCreate && q.trim().length > 0 && !exact;
  const total = results.length + (canCreate ? 1 : 0);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function choose(i: number) {
    if (i < results.length) {
      const b = results[i].b;
      onChange({ id: b.id, name: b.name });
    } else if (canCreate) {
      onChange({ id: null, name: q.trim().replace(/\s+/g, " ") });
    }
    setQ("");
    setOpen(false);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(total - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      if (open && total > 0) {
        e.preventDefault();
        choose(active);
      }
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  const selected = value.id || value.name ? value : null;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="field-label" id={`${listId}-label`}>
        {label}
      </span>
      {selected ? (
        <div className="flex h-10 items-center justify-between gap-2 rounded-[var(--r-md)] border border-[rgba(255,102,0,.45)] bg-[var(--accent-soft)] px-3 pointer-coarse:h-11">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[14px] font-semibold text-[var(--accent-hi)]">{selected.name}</span>
            {!selected.id && (
              <span className="chip-tint shrink-0 !py-0 text-[10px]" style={{ ["--chip" as string]: "var(--info)" }}>
                новый
              </span>
            )}
          </span>
          <button
            type="button"
            aria-label="Убрать бренд"
            onClick={() => {
              onChange({ id: null, name: "" });
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="focusable hit grid h-7 w-7 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--accent-hi)] hover:bg-[var(--accent-soft-2)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div
          ref={boxRef}
          className={cn(
            "flex h-10 items-center gap-2 rounded-[var(--r-md)] border bg-[var(--surface-2)] px-3 transition-[border-color,box-shadow] duration-150 pointer-coarse:h-11",
            open ? "border-[var(--accent)] shadow-[var(--ring-accent)]" : "border-[var(--line)] hover:border-[var(--border-2)]"
          )}
        >
          <Search className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
          <input
            ref={inputRef}
            value={q}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-labelledby={`${listId}-label`}
            aria-autocomplete="list"
            aria-activedescendant={open && total > 0 ? `${listId}-${active}` : undefined}
            placeholder={allowCreate ? "Найти или создать бренд…" : "Найти бренд…"}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onKeyDown={onKey}
            className="min-w-0 flex-1 self-stretch bg-transparent text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
          />
        </div>
      )}
      {hint && <span className="text-[12px] text-[var(--text-faint)]">{hint}</span>}

      <Popover open={open && !selected} anchorRef={boxRef} panelRef={panelRef} onClose={() => setOpen(false)} maxHeight={300}>
        <div id={listId} role="listbox" className="thin-scroll min-h-0 flex-1 overflow-auto p-1">
          {results.map(({ b, alias }, i) => (
            <button
              key={b.id}
              id={`${listId}-${i}`}
              data-idx={i}
              type="button"
              role="option"
              aria-selected={value.id === b.id}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
              className={cn(
                "flex w-full items-center gap-2 rounded-[var(--r-sm)] px-3 py-2 text-left text-[14px] transition-colors",
                i === active ? "bg-[var(--surface-hover)]" : ""
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[var(--text)]">{b.name}</span>
                {alias && <span className="block truncate text-[11.5px] text-[var(--text-faint)]">алиас: {alias}</span>}
              </span>
              <span className="tabular shrink-0 text-[12px] text-[var(--text-faint)]">{b.productCount}</span>
              {value.id === b.id && <Check className="h-4 w-4 shrink-0 text-[var(--accent-hi)]" />}
            </button>
          ))}
          {canCreate && (
            <button
              id={`${listId}-${results.length}`}
              data-idx={results.length}
              type="button"
              role="option"
              aria-selected={false}
              onMouseEnter={() => setActive(results.length)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(results.length)}
              className={cn(
                "mt-0.5 flex w-full items-center gap-2 rounded-[var(--r-sm)] border-t border-[var(--line)] px-3 py-2.5 text-left text-[14px] font-semibold text-[var(--accent-hi)] transition-colors",
                active === results.length ? "bg-[var(--accent-soft)]" : ""
              )}
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="truncate">Создать „{q.trim()}“</span>
            </button>
          )}
          {total === 0 && (
            <div className="px-3 py-4 text-center text-[13px] text-[var(--text-faint)]">
              {brands.length === 0 ? "Справочник брендов пуст — введите название" : "Ничего не найдено"}
            </div>
          )}
        </div>
      </Popover>
    </div>
  );
}
