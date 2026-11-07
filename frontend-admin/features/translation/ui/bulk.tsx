"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@shop/ui/admin-button";

/**
 * Липкая панель массовых действий: «Выбрано N · действия · Снять». Прилипает к низу экрана
 * (на телефоне — над нижней панелью), живёт в потоке страницы и не закрывает последние строки списка.
 * Копия панели из features/catalog (фичи не импортируют друг друга по кругу) — кандидат на вынос в components/ui.
 */
export function BulkBar({
  count,
  noun,
  onClear,
  children,
  className,
}: {
  count: number;
  /** Что выбрано: «категорий», «брендов», «текстов» — пишется после числа. */
  noun: string;
  onClear: () => void;
  children: ReactNode;
  className?: string;
}) {
  if (count === 0) return null;
  return (
    <div
      role="toolbar"
      aria-label="Массовые действия"
      className={cn(
        "elevated sticky bottom-[calc(var(--bottom-nav)+12px)] z-20 mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5",
        className
      )}
    >
      <span className="text-[13px] font-semibold text-[var(--text)]">
        Выбрано <b className="tabular text-[var(--accent-hi)]">{count}</b> {noun}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      <Button size="sm" variant="ghost" onClick={onClear}>
        Снять
      </Button>
    </div>
  );
}

/** Чекбокс выбора строки — цель касания 44 px на телефоне. */
export function RowCheck({
  checked,
  onChange,
  label,
  indeterminate,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  indeterminate?: boolean;
  className?: string;
}) {
  return (
    <label className={cn("focusable grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-[var(--r-sm)] pointer-coarse:h-11 pointer-coarse:w-11", className)}>
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        ref={(el) => {
          if (el) el.indeterminate = !!indeterminate && !checked;
        }}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
      />
    </label>
  );
}

/** Липкий тулбар экрана (поиск, фильтры, главная кнопка) под шапкой оболочки. */
export function StickyToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "sticky top-[var(--hdr-h,61px)] z-20 -mx-4 mb-3 bg-[var(--bg)]/95 px-4 py-2 backdrop-blur lg:-mx-7 lg:px-7",
        className
      )}
    >
      {children}
    </div>
  );
}
