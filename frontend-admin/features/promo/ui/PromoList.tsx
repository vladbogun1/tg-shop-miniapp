"use client";

import { Button } from "@shop/ui/admin-button";
import { motion } from "framer-motion";
import { Plus, Search, Ticket } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { riseItem, staggerContainer } from "@/lib/motion";
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

/** Коды выбранной вкладки (+ ручные скидки в «Персональных») либо пустое состояние. */
export function PromoList(p: Props) {
  if (p.shown.length === 0 && p.shownManual.length === 0) return <Empty {...p} />;
  return (
    <motion.div key={p.tab} variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-3">
      {p.shown.map((promo) => (
        <PromoRow key={promo.id} p={promo} onEdit={() => p.onEdit(promo)} onDelete={() => p.onDelete(promo)} onOpenOrder={p.onOpenOrder} />
      ))}
      {p.shownManual.length > 0 && (
        <>
          <motion.div variants={riseItem} className="mt-2">
            <h2 className="font-display text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Ручные скидки в заказах · {p.shownManual.length}
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--text-faint)]">
              Сумма или процент, заданные вручную в «Скидке» заказа — это не промокод, повторно не применяется.
            </p>
          </motion.div>
          {p.shownManual.map((o) => (
            <ManualRow key={o.id} o={o} onOpen={() => p.onOpenOrder(o.id)} />
          ))}
        </>
      )}
    </motion.div>
  );
}
