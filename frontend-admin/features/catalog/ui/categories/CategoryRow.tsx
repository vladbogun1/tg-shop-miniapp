"use client";

import { AnimatePresence } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  CornerDownRight,
  EyeOff,
  FolderInput,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import type { AdminCategory } from "../../model/types";
import { plural, productsWord } from "../../model/words";
import type { CategoryTab } from "../category/CategoryDialog";
import { Act, MenuItem, RowMenu } from "./row-parts";

function RowToggle({ expanded, onToggle }: { expanded?: boolean; onToggle?: () => void }) {
  if (!onToggle) {
    return (
      <span className="grid h-8 w-8 shrink-0 place-items-center text-[var(--text-faint)] pointer-coarse:w-10" aria-hidden>
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--line-strong)]" />
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={expanded ? "Свернуть подкатегории" : "Развернуть подкатегории"}
      aria-expanded={expanded}
      className="focusable grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] pointer-coarse:h-10 pointer-coarse:w-10"
    >
      <ChevronRight className={cn("h-4 w-4 transition-transform duration-200", expanded && "rotate-90")} />
    </button>
  );
}

/** Название, бейджи «скрыта из меню» / SEO и адрес страницы. */
function RowTitle({ c, depth, onEdit }: { c: AdminCategory; depth: 0 | 1; onEdit: (tab?: CategoryTab) => void }) {
  const hidden = !c.showInMenu;
  const hasSeo = !!(c.seoTitle || c.seoDescription || c.h1 || c.introText);
  return (
      <button
        type="button"
        onClick={() => onEdit()}
        className="focusable flex min-w-0 flex-1 flex-col items-start justify-center rounded-[var(--r-sm)] text-left pointer-coarse:min-h-10"
      >
        <span className="flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("truncate font-semibold", depth === 0 ? "text-[15px] text-[var(--ink)]" : "text-[14px] text-[var(--text)]")}>
            {c.name}
          </span>
          {hidden && (
            <Badge tone="neutral" className="shrink-0 px-1.5">
              <EyeOff className="h-3 w-3" /> скрыта из меню
            </Badge>
          )}
          {hasSeo && (
            <Badge tone="info" className="shrink-0 px-1.5">
              SEO
            </Badge>
          )}
        </span>
        <span className="flex min-w-0 max-w-full flex-wrap items-center gap-x-2 text-[12px] text-[var(--text-faint)]">
          <span className="truncate font-mono">/catalog/{c.slug}</span>
          {c.artKind && <span className="hidden sm:inline">· плитка {c.artKind}</span>}
        </span>
      </button>
  );
}

/** Счётчики справа: товары на витрине, подкатегории, число характеристик. */
function RowStats({ c, childCount, attrCount, onEdit }: { c: AdminCategory; childCount: number; attrCount?: number; onEdit: (tab?: CategoryTab) => void }) {
  return (
    <>
      <div className="hidden shrink-0 flex-col items-end text-right md:flex">
        <span className="tabular text-[13px] font-semibold text-[var(--text)]" title="Активных товаров в категории и подкатегориях">
          {c.productCount} на витрине
        </span>
        <span className="text-[11.5px] text-[var(--text-faint)]">
          {childCount > 0
            ? `${childCount} ${plural(childCount, "подкатегория", "подкатегории", "подкатегорий")}`
            : `${productsWord(c.productCountDirect)} всего`}
        </span>
      </div>
      <button
        type="button"
        onClick={() => onEdit("specs")}
        title="Характеристики категории"
        className="focusable hidden shrink-0 items-center gap-1 rounded-[var(--r-sm)] px-2 py-1 text-[12px] text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] lg:inline-flex"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        <span className="tabular">{attrCount ?? 0}</span>
      </button>
      <span className="tabular shrink-0 text-[12px] font-semibold text-[var(--text-muted)] md:hidden" title="На витрине">{c.productCount}</span>

    </>
  );
}

interface ActionsProps {
  first: boolean;
  last: boolean;
  busy: boolean;
  reorderDisabled: boolean;
  onUp: () => void;
  onDown: () => void;
  onEdit: (tab?: CategoryTab) => void;
  onAddChild?: () => void;
  onMove?: () => void;
  onDelete: () => void;
}

/** ↑ ↓ и меню «Действия». */
function RowActions({ first, last, busy, reorderDisabled, onUp, onDown, onEdit, onAddChild, onMove, onDelete }: ActionsProps) {
  const [menu, setMenu] = useState(false);
  return (
      <div className="flex shrink-0 items-center gap-0.5">
        <Act label="Выше" disabled={first || reorderDisabled || busy} onClick={onUp}>
          <ArrowUp className="h-4 w-4" />
        </Act>
        <Act label="Ниже" disabled={last || reorderDisabled || busy} onClick={onDown}>
          <ArrowDown className="h-4 w-4" />
        </Act>
        <div className="relative">
          <Act label="Действия" onClick={() => setMenu((v) => !v)} expanded={menu}>
            <MoreHorizontal className="h-4 w-4" />
          </Act>
          <AnimatePresence>
            {menu && (
              <RowMenu onClose={() => setMenu(false)}>
                <MenuItem icon={Pencil} onClick={() => (setMenu(false), onEdit())}>
                  Изменить
                </MenuItem>
                <MenuItem icon={SlidersHorizontal} onClick={() => (setMenu(false), onEdit("specs"))}>
                  Характеристики
                </MenuItem>
                {onAddChild && (
                  <MenuItem icon={FolderPlus} onClick={() => (setMenu(false), onAddChild())}>
                    Добавить подкатегорию
                  </MenuItem>
                )}
                {onMove && (
                  <MenuItem icon={FolderInput} onClick={() => (setMenu(false), onMove())}>
                    Переместить в…
                  </MenuItem>
                )}
                <MenuItem icon={Trash2} danger onClick={() => (setMenu(false), onDelete())}>
                  Удалить
                </MenuItem>
              </RowMenu>
            )}
          </AnimatePresence>
        </div>
      </div>
  );
}

export function CategoryRow({
  c,
  depth,
  childCount,
  attrCount,
  expanded,
  onToggle,
  first,
  last,
  busy,
  reorderDisabled,
  onUp,
  onDown,
  onEdit,
  onAddChild,
  onMove,
  onDelete,
}: {
  c: AdminCategory;
  depth: 0 | 1;
  childCount: number;
  attrCount?: number;
  expanded?: boolean;
  onToggle?: () => void;
  first: boolean;
  last: boolean;
  busy: boolean;
  reorderDisabled: boolean;
  onUp: () => void;
  onDown: () => void;
  onEdit: (tab?: "main" | "seo" | "specs") => void;
  onAddChild?: () => void;
  onMove?: () => void;
  onDelete: () => void;
  index?: number;
}) {
  return (
    <div
      className={cn(
        "group relative flex items-center gap-2 py-2.5 pr-2 transition-colors hover:bg-[var(--surface-hover)] sm:gap-3 sm:pr-3",
        depth === 0 ? "pl-2 sm:pl-3" : "pl-11 sm:pl-12",
        busy && "opacity-60"
      )}
    >
      {depth === 1 && (
        <CornerDownRight aria-hidden className="absolute left-[21px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-faint)]" />
      )}
      {depth === 0 && <RowToggle expanded={expanded} onToggle={onToggle} />}

      <RowTitle c={c} depth={depth} onEdit={onEdit} />
      <RowStats c={c} childCount={childCount} attrCount={attrCount} onEdit={onEdit} />
      <RowActions
        first={first}
        last={last}
        busy={busy}
        reorderDisabled={reorderDisabled}
        onUp={onUp}
        onDown={onDown}
        onEdit={onEdit}
        onAddChild={onAddChild}
        onMove={onMove}
        onDelete={onDelete}
      />
    </div>
  );
}
