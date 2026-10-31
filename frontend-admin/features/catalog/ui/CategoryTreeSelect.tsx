"use client";

/**
 * Category picker over the 2-level tree, with search.
 *  - mode "leaf" (product wizard): only categories without children can be picked; a root with
 *    children is a non-selectable header over its indented subcategories, a root without children
 *    is an ordinary option;
 *  - mode "any" (list filter): every category is selectable (a root = its whole subtree), plus the
 *    `extra` rows on top («Все категории», «Без категории»).
 * Keyboard: ↑/↓ move, Enter picks, Esc closes; typing goes into the search field.
 */
import { Check, ChevronDown, CornerDownRight, FolderTree, Search } from "lucide-react";
import { useId, useMemo, useRef, useState, useEffect } from "react";
import { moveCursor, selectedLabel, treeSelectRows, type TreeSelectRow } from "../model/tree-select";
import type { AdminCategory } from "../model/types";
import { cn } from "@/lib/cn";
import { Popover } from "./Popover";

interface OptionsProps {
  listRef: React.RefObject<HTMLDivElement | null>;
  listId: string;
  rows: TreeSelectRow[];
  selectable: TreeSelectRow[];
  active: number;
  value: string;
  showCounts: boolean;
  onActive: (i: number) => void;
  onPick: (id: string) => void;
}

function CategoryOptions({ listRef, listId, rows, selectable, active, value, showCounts, onActive, onPick }: OptionsProps) {
  return (
    <div ref={listRef} id={listId} role="listbox" className="thin-scroll min-h-0 flex-1 overflow-auto p-1">
      {rows.length === 0 && (
        <div className="px-3 py-4 text-center text-[13px] text-[var(--text-faint)]">Ничего не найдено</div>
      )}
      {rows.map((r) => {
        const idx = selectable.indexOf(r);
        const isActive = r.selectable && idx === active;
        const isSel = r.id === value;
        if (!r.selectable) {
          return (
            <div
              key={r.id}
              className="font-display mt-1 flex items-center justify-between gap-2 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)] first:mt-0"
            >
              <span className="truncate">{r.label}</span>
              {r.sub && <span className="normal-case tracking-normal">{r.sub}</span>}
            </div>
          );
        }
        return (
          <button
            key={r.id || "none"}
            id={`${listId}-${r.id || "none"}`}
            data-idx={idx}
            type="button"
            role="option"
            aria-selected={isSel}
            onMouseEnter={() => onActive(idx)}
            onClick={() => onPick(r.id)}
            className={cn(
              "flex w-full items-center gap-2 rounded-[var(--r-sm)] py-2 pr-3 text-left text-[14px] transition-colors",
              r.depth === 1 ? "pl-7" : "pl-3",
              isSel
                ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent-hi)]"
                : isActive
                  ? "bg-[var(--surface-hover)] text-[var(--text)]"
                  : "text-[var(--text)]"
            )}
          >
            {r.depth === 1 && <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-faint)]" />}
            <span className="min-w-0 flex-1 truncate">{r.label}</span>
            {r.hidden && <span className="shrink-0 text-[11px] text-[var(--text-faint)]">скрыта</span>}
            {showCounts && r.count !== undefined && (
              <span className="tabular shrink-0 text-[12px] text-[var(--text-faint)]">{r.count}</span>
            )}
            {isSel && <Check className="h-4 w-4 shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}

interface TriggerProps {
  btnRef: React.RefObject<HTMLButtonElement | null>;
  id?: string;
  open: boolean;
  labelledBy: string | undefined;
  text: string;
  filled: boolean;
  invalid: boolean;
  onToggle: () => void;
  onOpen: () => void;
}

function TreeSelectTrigger({ btnRef, id, open, labelledBy, text, filled, invalid, onToggle, onOpen }: TriggerProps) {
  return (
    <button
      ref={btnRef}
      id={id}
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-labelledby={labelledBy}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "focusable flex h-10 min-w-0 items-center justify-between gap-2 rounded-[var(--r-md)] border bg-[var(--surface-2)] px-3 text-left text-[14px] transition-[border-color,box-shadow] duration-150 hover:border-[var(--border-2)] pointer-coarse:h-11",
        open ? "!border-[var(--accent)] shadow-[var(--ring-accent)]" : "border-[var(--line)]",
        invalid && "!border-[var(--danger)]"
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <FolderTree className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
        <span className={cn("truncate", filled ? "text-[var(--text)]" : "text-[var(--text-faint)]")}>{text}</span>
      </span>
      <ChevronDown className={cn("h-4 w-4 shrink-0 text-[var(--text-faint)] transition-transform", open && "rotate-180")} />
    </button>
  );
}

/** Курсор списка; при открытии встаёт на текущее значение (состояние правится во время рендера, только по фронту «открылось»). */
function useCursor(open: boolean, selectable: { id: string }[], value: string) {
  const [active, setActive] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      const i = selectable.findIndex((r) => r.id === value);
      setActive(i >= 0 ? i : 0);
    }
  }
  return [active, setActive] as const;
}

export function CategoryTreeSelect({
  categories,
  value,
  onChange,
  mode = "leaf",
  label,
  placeholder = "Выберите категорию",
  extra = [],
  showCounts = false,
  error,
  hint,
  className,
  id,
}: {
  categories: AdminCategory[];
  value: string;
  onChange: (id: string) => void;
  mode?: "leaf" | "any";
  label?: string;
  placeholder?: string;
  extra?: { value: string; label: string }[];
  showCounts?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const autoId = useId();
  const listId = `${id ?? autoId}-list`;

  const rows = useMemo(() => treeSelectRows(categories, q, extra, mode), [categories, q, extra, mode]);

  const selectable = useMemo(() => rows.filter((r) => r.selectable), [rows]);

  const [active, setActive] = useCursor(open, selectable, value);
  useEffect(() => {
    setActive(0);
  }, [q, setActive]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const current = selectedLabel(categories, extra, value);

  function pick(idv: string) {
    onChange(idv);
    setOpen(false);
    setQ("");
    btnRef.current?.focus();
  }

  function onKey(e: React.KeyboardEvent) {
    const move = moveCursor(e.key, active, selectable.length);
    if (move) {
      if (move.prevent) e.preventDefault();
      setActive(move.index);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = selectable[active];
      if (r) pick(r.id);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {label && (
        <span className="field-label" id={`${listId}-label`}>
          {label}
        </span>
      )}
      <TreeSelectTrigger
        btnRef={btnRef}
        id={id}
        open={open}
        labelledBy={label ? `${listId}-label` : undefined}
        text={current ?? placeholder}
        filled={!!current}
        invalid={!!error}
        onToggle={() => setOpen((o) => !o)}
        onOpen={() => setOpen(true)}
      />
      {error ? (
        <span className="text-[12px] text-[var(--danger-ink)]">{error}</span>
      ) : (
        hint && <span className="text-[12px] text-[var(--text-faint)]">{hint}</span>
      )}

      <Popover
        open={open}
        anchorRef={btnRef}
        panelRef={panelRef}
        onClose={() => {
          setOpen(false);
          setQ("");
        }}
        maxHeight={380}
        minWidth={300}
      >
        <div className="flex items-center gap-2 border-b border-[var(--line)] px-3">
          <Search className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Найти категорию…"
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={selectable[active] ? `${listId}-${selectable[active].id || "none"}` : undefined}
            className="h-11 min-w-0 flex-1 bg-transparent text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
          />
        </div>
        <CategoryOptions
          listRef={listRef}
          listId={listId}
          rows={rows}
          selectable={selectable}
          active={active}
          value={value}
          showCounts={showCounts}
          onActive={setActive}
          onPick={pick}
        />
      </Popover>
    </div>
  );
}
