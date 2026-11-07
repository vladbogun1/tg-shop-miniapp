"use client";

import { Button } from "@shop/ui/admin-button";
import { Plus, Search, Ticket } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { TAB_EMPTY } from "../model/promo";
import type { ManualDiscountOrder, PromoCode, PromoOrigin } from "../model/types";
import { ManualRow } from "./ManualRow";
import { PromoRow } from "./PromoRow";

interface Props {
  tab: PromoOrigin;
  shown: PromoCode[];
  shownManual: ManualDiscountOrder[];
  filtering: boolean;
  onResetFilters: () => void;
  onCreate: () => void;
  onEdit: (p: PromoCode) => void;
  onDelete: (p: PromoCode) => void;
  onOrders: (p: PromoCode) => void;
  onOpenOrder: (id: string) => void;
}

function Empty({ tab, filtering, onResetFilters, onCreate }: Pick<Props, "tab" | "filtering" | "onResetFilters" | "onCreate">) {
  if (filtering) {
    return (
      <EmptyState
        icon={Search}
        title="Ничего не найдено"
        description="В этой вкладке нет кодов под условия поиска."
        action={
          <Button variant="ghost" onClick={onResetFilters}>
            Сбросить фильтры
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      icon={Ticket}
      title={TAB_EMPTY[tab].title}
      description={TAB_EMPTY[tab].text}
      action={
        tab === "OURS" ? (
          <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={onCreate}>
            Новый промокод
          </Button>
        ) : undefined
      }
    />
  );
}

/** Коды выбранной вкладки одной панелью строк (+ ручные скидки в «Персональных») либо пустое состояние. */
export function PromoList(p: Props) {
  if (p.shown.length === 0 && p.shownManual.length === 0) return <Empty {...p} />;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {p.shown.length > 0 && (
        <div className="panel min-w-0 divide-y divide-[var(--line)] overflow-hidden">
          {p.shown.map((promo) => (
            <PromoRow
              key={promo.id}
              p={promo}
              onEdit={() => p.onEdit(promo)}
              onDelete={() => p.onDelete(promo)}
              onOrders={() => p.onOrders(promo)}
            />
          ))}
        </div>
      )}
      {p.shownManual.length > 0 && (
        <section>
          <h2 className="font-display text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Ручные скидки в заказах · {p.shownManual.length}
          </h2>
          <p className="mb-2 mt-0.5 text-[12px] text-[var(--text-faint)]">
            Сумма или процент, заданные вручную в «Скидке» заказа — это не промокод, повторно не применяется.
          </p>
          <div className="panel min-w-0 divide-y divide-[var(--line)] overflow-hidden">
            {p.shownManual.map((o) => (
              <ManualRow key={o.id} o={o} onOpen={() => p.onOpenOrder(o.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
