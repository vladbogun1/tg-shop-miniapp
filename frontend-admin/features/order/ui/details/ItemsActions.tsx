"use client";

/** Кнопки под итогами: добавить товар, скидка, кейс (пока заказ можно править). Объединить, обмен и возврат — в «⋯ Ещё». */
import { Plus, Percent } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import type { AdminOrderDetail } from "../../api";
import type { DetailHandlers } from "./types";

export function ItemsActions({ order, h }: { order: AdminOrderDetail; h: DetailHandlers }) {
  const editable = order.status === "NEW" || order.status === "APPROVED";
  if (!editable) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button size="sm" variant="surface" icon={<Plus className="h-4 w-4" />} onClick={h.onAddItem}>
        Добавить товар
      </Button>
      <Button size="sm" variant="surface" icon={<Percent className="h-4 w-4" />} onClick={h.onDiscount}>
        {order.discountMinor > 0 ? "Изменить скидку" : "Скидка"}
      </Button>
      {h.onGiftCase && order.giftCaseStatus == null && (
        <Button size="sm" variant="surface" onClick={h.onGiftCase} disabled={!!h.busyKey}>
          🎁 Выдать кейс
        </Button>
      )}
    </div>
  );
}
