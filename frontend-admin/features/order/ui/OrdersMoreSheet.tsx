"use client";

import { Columns3, RefreshCw, Table2 } from "lucide-react";
import { ActionSheet } from "@/components/ui/ActionSheet";
import type { OrdersView } from "../model/view";

/** Phone «⋯»: what is rare there — the board/table switch and the refresh. */
export function OrdersMoreSheet({ open, view, onView, onRefresh, onClose }: { open: boolean; view: OrdersView; onView: (v: OrdersView) => void; onRefresh: () => void; onClose: () => void }) {
  const toTable = view === "board";
  return (
    <ActionSheet
      open={open}
      title="Заказы"
      onClose={onClose}
      actions={[
        toTable
          ? { key: "table", label: "Показать таблицей", icon: <Table2 className="h-4 w-4" />, onSelect: () => onView("table") }
          : { key: "board", label: "Показать доской", icon: <Columns3 className="h-4 w-4" />, onSelect: () => onView("board") },
        { key: "refresh", label: "Обновить", icon: <RefreshCw className="h-4 w-4" />, onSelect: onRefresh },
      ]}
    />
  );
}
