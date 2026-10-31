"use client";

/**
 * Brand picker: search over names and aliases of the brand directory, or «Создать „…“» —
 * then only the name is sent (`brandName`) and the server finds it by alias or creates it.
 * Value: `{ id, name }`; `id = null` with a name = a new brand, both empty = no brand.
 */
import { Check, Plus, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { hasBrandNamed, rankBrands, type BrandHit } from "../model/brand-search";
import type { AdminBrand } from "../model/types";
import { Popover } from "./Popover";

export interface BrandValue {
  id: string | null;
  name: string;
}

function SelectedBrand({ value, onClear }: { value: BrandValue; onClear: () => void }) {
  return (
    <div className="flex h-10 items-center justify-between gap-2 rounded-[var(--r-md)] border border-[rgba(255,102,0,.45)] bg-[var(--accent-soft)] px-3 pointer-coarse:h-11">
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[14px] font-semibold text-[var(--accent-hi)]">{value.name}</span>
        {!value.id && (
          <span className="chip-tint shrink-0 !py-0 text-[10px]" style={{ ["--chip" as string]: "var(--info)" }}>
            новый
          </span>
        )}
      </span>
      <button
        type="button"
        aria-label="Убрать бренд"
        onClick={onClear}
        className="focusable hit grid h-7 w-7 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--accent-hi)] hover:bg-[var(--accent-soft-2)]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

interface OptionsProps {
  listId: string;
  results: BrandHit[];
  selectedId: string | null;
  active: number;
  canCreate: boolean;
  query: string;
  total: number;
  emptyDirectory: boolean;
  onActive: (i: number) => void;
  onChoose: (i: number) => void;
}

function BrandOptions({ listId, results, selectedId, active, canCreate, query, total, emptyDirectory, onActive, onChoose }: OptionsProps) {
  return (
    <div id={listId} role="listbox" className="thin-scroll min-h-0 flex-1 overflow-auto p-1">
      {results.map(({ b, alias }, i) => (
        <button
          key={b.id}
          id={`${listId}-${i}`}
          data-idx={i}
          type="button"
          role="option"
          aria-selected={selectedId === b.id}
          onMouseEnter={() => onActive(i)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChoose(i)}
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
          {selectedId === b.id && <Check className="h-4 w-4 shrink-0 text-[var(--accent-hi)]" />}
        </button>
      ))}
      {canCreate && (
        <button
          id={`${listId}-${results.length}`}
          data-idx={results.length}
          type="button"
          role="option"
          aria-selected={false}
          onMouseEnter={() => onActive(results.length)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChoose(results.length)}
          className={cn(
            "mt-0.5 flex w-full items-center gap-2 rounded-[var(--r-sm)] border-t border-[var(--line)] px-3 py-2.5 text-left text-[14px] font-semibold text-[var(--accent-hi)] transition-colors",
            active === results.length ? "bg-[var(--accent-soft)]" : ""
          )}
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span className="truncate">Создать „{query.trim()}“</span>
        </button>
      )}
      {total === 0 && (
        <div className="px-3 py-4 text-center text-[13px] text-[var(--text-faint)]">
          {emptyDirectory ? "Справочник брендов пуст — введите название" : "Ничего не найдено"}
        </div>
      )}
    </div>
  );
}

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

  const results = useMemo(() => rankBrands(brands, q, exclude), [brands, q, exclude]);
  const canCreate = allowCreate && q.trim().length > 0 && !hasBrandNamed(brands, q);
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
        <SelectedBrand
          value={selected}
          onClear={() => {
            onChange({ id: null, name: "" });
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
        />
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
        <BrandOptions
          listId={listId}
          results={results}
          selectedId={value.id}
          active={active}
          canCreate={canCreate}
          query={q}
          total={total}
          emptyDirectory={brands.length === 0}
          onActive={setActive}
          onChoose={choose}
        />
      </Popover>
    </div>
  );
}
