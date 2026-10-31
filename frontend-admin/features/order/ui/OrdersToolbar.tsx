"use client";

import { Plus, RefreshCw, Search } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@shop/ui/admin-button";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { OrdersPeriod } from "../model/period";
import type { OrdersView } from "../model/view";
import { VIEW_OPTIONS } from "../model/view";
import { OrdersPeriodPicker } from "./OrdersPeriodPicker";

export function RefreshButton({ spinning, onClick }: { spinning: boolean; onClick: () => void }) {
  return (
    <Button
      variant="surface"
      icon={<RefreshCw className={spinning ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
      onClick={onClick}
      aria-label="Обновить"
      className="max-lg:w-11 max-lg:px-0"
    >
      <span className="max-lg:hidden">Обновить</span>
    </Button>
  );
}

export function NewOrderButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={onClick} aria-label="Новый заказ" className="max-lg:w-11 max-lg:px-0">
      <span className="max-lg:hidden">Новый заказ</span>
    </Button>
  );
}

interface Props {
  search: string;
  onSearch: (v: string) => void;
  view: OrdersView;
  onView: (v: OrdersView) => void;
  /** Period control is shown only where it matters (the table, desktop board, closed phone tabs). */
  showRange: boolean;
  period: OrdersPeriod;
  onPeriod: (p: OrdersPeriod) => void;
  /** Refresh + «Новый заказ» for phones; on desktop they sit in the page header. */
  phoneActions: ReactNode;
}

export function OrdersToolbar({ search, onSearch, view, onView, showRange, period, onPeriod, phoneActions }: Props) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 lg:mb-5 lg:gap-3">
      <div className="flex min-w-0 flex-1 basis-[220px] items-center gap-2">
        <div className="min-w-0 flex-1">
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Поиск: имя, телефон, товар, ТТН, №…"
            icon={<Search className="h-4 w-4" />}
            // 38 + 2px border = 40 (44 on touch): the same height as the buttons and segments beside it.
          />
        </div>
        <div className="flex items-center gap-2 lg:hidden">{phoneActions}</div>
      </div>
      {showRange && (
        <OrdersPeriodPicker
          value={period}
          onChange={onPeriod}
          label={
            view === "board" && (
              <span className="field-label hidden shrink-0 !text-[11px] !text-[var(--text-faint)] xl:inline">Период для «Доставлен / Отклонён»:</span>
            )
          }
        />
      )}
      <SegmentedControl options={VIEW_OPTIONS} value={view} onChange={onView} className="h-10 shrink-0 pointer-coarse:h-11" />
    </div>
  );
}
