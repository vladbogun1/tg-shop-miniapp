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
import type { AdminCategory } from "@/lib/api";
import { buildTree, pathLabel } from "@/lib/catalog-admin";
import { cn } from "@/lib/cn";
import { Popover } from "./Popover";

interface Row {
  id: string;
  label: string;
  depth: 0 | 1;
  selectable: boolean;
  count?: number;
  hidden?: boolean;
  sub?: string;
}

const norm = (s: string) => s.toLocaleLowerCase("ru").replace(/ё/g, "е").trim();

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
  const [active, setActive] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const autoId = useId();
  const listId = `${id ?? autoId}-list`;

  const rows = useMemo<Row[]>(() => {
    const nq = norm(q);
    const hit = (c: AdminCategory) => !nq || norm(c.name).includes(nq) || c.slug.includes(nq);
    const out: Row[] = [];
    if (!nq) for (const e of extra) out.push({ id: e.value, label: e.label, depth: 0, selectable: true });
    for (const { cat, children } of buildTree(categories)) {
      const kids = children.filter((k) => hit(k) || hit(cat));
      if (!hit(cat) && kids.length === 0) continue;
      const hasKids = children.length > 0;
      out.push({
        id: cat.id,
        label: cat.name,
        depth: 0,
        selectable: mode === "any" || !hasKids,
        count: cat.productCount,
        hidden: !cat.showInMenu,
        sub: hasKids && mode === "leaf" ? `${children.length} подкат.` : undefined,
      });
      for (const k of kids) {
        out.push({ id: k.id, label: k.name, depth: 1, selectable: true, count: k.productCount, hidden: !k.showInMenu });
      }
    }
    return out;
  }, [categories, q, extra, mode]);

  const selectable = useMemo(() => rows.filter((r) => r.selectable), [rows]);

  // Opening puts the cursor on the current value.
  useEffect(() => {
    if (!open) return;
    const i = selectable.findIndex((r) => r.id === value);
    setActive(i >= 0 ? i : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    setActive(0);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const current =
    extra.find((e) => e.value === value)?.label ?? (value ? pathLabel(categories, value) || null : null);

  function pick(idv: string) {
    onChange(idv);
    setOpen(false);
    setQ("");
    btnRef.current?.focus();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(selectable.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      setActive(0);
    } else if (e.key === "End") {
      setActive(selectable.length - 1);
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
      <button
        ref={btnRef}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={label ? `${listId}-label` : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "focusable flex h-10 min-w-0 items-center justify-between gap-2 rounded-[var(--r-md)] border bg-[var(--surface-2)] px-3 text-left text-[14px] transition-[border-color,box-shadow] duration-150 hover:border-[var(--border-2)] pointer-coarse:h-11",
          open ? "!border-[var(--accent)] shadow-[var(--ring-accent)]" : "border-[var(--line)]",
          error && "!border-[var(--danger)]"
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <FolderTree className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
          <span className={cn("truncate", current ? "text-[var(--text)]" : "text-[var(--text-faint)]")}>
            {current ?? placeholder}
          </span>
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-[var(--text-faint)] transition-transform", open && "rotate-180")}
        />
      </button>
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
                onMouseEnter={() => setActive(idx)}
                onClick={() => pick(r.id)}
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
      </Popover>
    </div>
  );
}
