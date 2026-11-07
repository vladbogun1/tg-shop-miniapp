"use client";

import { MoreHorizontal, Plus, RefreshCw, Search } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@shop/ui/admin-button";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { OrdersPeriod } from "../model/period";
import type { OrdersView } from "../model/view";
import { VIEW_OPTIONS } from "../model/view";
import { OrdersPeriodPicker } from "./OrdersPeriodPicker";

// Icon-only below 1280px: on a laptop every pixel of the toolbar row goes to search and the period.
export function RefreshButton({ spinning, onClick }: { spinning: boolean; onClick: () => void }) {
  return (
    <Button
      variant="surface"
      icon={<RefreshCw className={spinning ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
      onClick={onClick}
      aria-label="Обновить"
      title="Обновить"
      className="max-xl:w-11 max-xl:px-0"
    >
      <span className="max-xl:hidden">Обновить</span>
    </Button>
  );
}

export function NewOrderButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={onClick} aria-label="Новый заказ" title="Новый заказ" className="max-xl:w-11 max-xl:px-0">
      <span className="max-xl:hidden">Новый заказ</span>
    </Button>
  );
}

/** Phone: «⋯» holds what is rare there — the board/table switch and the refresh; it spins while the board loads. */
export function MoreButton({ onClick, spinning }: { onClick: () => void; spinning: boolean }) {
  const icon = spinning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />;
  return <Button variant="surface" icon={icon} onClick={onClick} aria-label="Ещё" aria-haspopup="dialog" aria-busy={spinning} className="w-11 px-0" />;
}

interface Props {
  search: string;
  onSearch: (v: string) => void;
  view: OrdersView;
  onView: (v: OrdersView) => void;
  /** Period control is shown only where it matters (the table, the board, closed phone tabs). */
  showRange: boolean;
  period: OrdersPeriod;
  onPeriod: (p: OrdersPeriod) => void;
  /** Phone: search + «Новый заказ» + «⋯»; the period goes under the sticky panel (screen). */
  phone: boolean;
  /** Refresh + «Новый заказ» (tablet and up) / «Новый заказ» + «⋯» (phone). */
  actions: ReactNode;
}

/**
 * One line: search, the period of the closed columns, board/table, and on the right the actions.
 * Wraps to a second line only on a narrow tablet. The screen makes it sticky.
 */
export function OrdersToolbar({ search, onSearch, view, onView, showRange, period, onPeriod, phone, actions }: Props) {
  const searchBox = (
    <Input
      value={search}
      onChange={(e) => onSearch(e.target.value)}
      aria-label="Поиск заказов"
      placeholder={phone ? "Имя, телефон, ТТН, №…" : "Поиск: имя, телефон, товар, ТТН, №…"}
      icon={<Search className="h-4 w-4" />}
      // 38 + 2px border = 40 (44 on touch): the same height as the buttons and segments beside it.
    />
  );
  if (phone) {
    return (
      <div className="flex h-[52px] items-center gap-2">
        <div className="min-w-0 flex-1">{searchBox}</div>
        {actions}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
      <div className="min-w-[200px] max-w-[420px] flex-1 basis-[240px]">{searchBox}</div>
      {showRange && (
        <OrdersPeriodPicker
          value={period}
          onChange={onPeriod}
          compact
          label={
            view === "board" && <span className="field-label hidden shrink-0 !text-[11px] !text-[var(--text-faint)] min-[1800px]:inline">Закрытые колонки:</span>
          }
        />
      )}
      <SegmentedControl options={VIEW_OPTIONS} value={view} onChange={onView} className="h-10 shrink-0 pointer-coarse:h-11" />
      <div className="ml-auto flex items-center gap-2">{actions}</div>
    </div>
  );
}
