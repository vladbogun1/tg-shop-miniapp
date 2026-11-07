"use client";

/** Заказы с кодом: правая панель (ноутбук) / на всю ширину (телефон) вместо раскрытия в карточке. */
import { formatDateTime } from "@shop/core/time";
import { shortOrderId as shortId } from "@shop/core/format";
import type { OrderStatus } from "@shop/core/types";
import { Drawer } from "@shop/ui/overlay";
import { StatusBadge } from "@/components/ui/Badge";
import { money } from "@/lib/money";
import { orderTotals } from "../model/promo";
import type { PromoCode } from "../model/types";
import { usePromoOrders } from "../queries";

function Totals({ rows }: { rows: { discountMinor: number; totalMinor: number }[] }) {
  const t = orderTotals(rows);
  const cell = (label: string, value: string) => (
    <div className="card-2 min-w-0 px-3 py-2">
      <div className="text-[11.5px] text-[var(--text-faint)]">{label}</div>
      <div className="tabular break-words font-display text-[15px] font-bold text-[var(--ink)]">{value}</div>
    </div>
  );
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {cell("Заказов", String(t.count))}
        {cell("Скидка", `−${money(t.discountMinor)}`)}
        {cell("Сумма заказов", money(t.totalMinor))}
      </div>
      <p className="mt-1.5 text-[11.5px] text-[var(--text-faint)]">
        Итоги — по всем заказам с кодом, включая отменённые (статус виден в строке).
      </p>
    </div>
  );
}

function Body({ id, onOpenOrder }: { id: string; onOpenOrder: (id: string) => void }) {
  const q = usePromoOrders(id, true);
  const rows = q.data ?? [];
  if (q.isLoading) return <span className="text-[12.5px] text-[var(--text-faint)]">Загружаем…</span>;
  if (q.isError) return <span className="text-[12.5px] text-[var(--danger-ink)]">Не удалось загрузить заказы</span>;
  if (rows.length === 0) {
    return (
      <span className="text-[12.5px] text-[var(--text-faint)]">
        Заказов с этим кодом нет (возможно, их удалили или код переименовали).
      </span>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <Totals rows={rows} />
      <div className="flex flex-col gap-1.5">
        {rows.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onOpenOrder(o.id)}
            className="card-2 flex min-h-[44px] flex-wrap items-center gap-2 rounded-[var(--r-sm)] px-3 py-2 text-left text-[12.5px] hover:bg-[var(--surface-hover)]"
          >
            <span className="font-mono font-semibold text-[var(--text)]">{shortId(o.id)}</span>
            <StatusBadge status={o.status as OrderStatus} />
            <span className="min-w-0 flex-1 truncate text-[var(--text-muted)]">{o.customerName ?? "—"}</span>
            <span className="tabular font-semibold text-[var(--text)]">{money(o.totalMinor)}</span>
            <span className="text-[var(--ok)]">−{money(o.discountMinor)}</span>
            <span className="w-full text-[var(--text-faint)] sm:w-auto">{formatDateTime(o.createdAt)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function PromoOrdersPanel({
  promo,
  onClose,
  onOpenOrder,
}: {
  promo: PromoCode | null;
  onClose: () => void;
  onOpenOrder: (id: string) => void;
}) {
  return (
    <Drawer open={!!promo} onClose={onClose} title={promo ? `Заказы с кодом ${promo.code}` : ""} width="max-w-[420px]" zClass="z-[110]">
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{promo && <Body id={promo.id} onOpenOrder={onOpenOrder} />}</div>
    </Drawer>
  );
}
