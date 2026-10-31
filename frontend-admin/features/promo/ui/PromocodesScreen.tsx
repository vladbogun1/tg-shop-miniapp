"use client";

/**
 * Promocodes (route "/promocodes") — list + create/edit + delete.
 *
 *  - A code is EITHER a percent OR a fixed amount (the «% / ₴» switch); percent is 1–100. A percent
 *    code may have a ceiling in ₴ («не больше», V63) — review bonuses get one from the settings.
 *  - The list shows uses, live reservations («резерв N» — customers holding the code in the cart
 *    for 30 min, which also take limited slots) and, on demand, the orders placed with the code
 *    (each opens over the page).
 *  - Editing a code that was already used warns what that means for existing orders.
 *  - Three tabs, so the owner's codes are not buried under generated ones (`?tab=` keeps it):
 *    «Наши» — shared codes made here (default); «Персональные скидки» — codes for one customer plus
 *    orders with a manual amount/percent discount («Ручная скидка», not a code); «За отзывы» —
 *    automatic review bonuses. Search and the status filter work inside the open tab.
 */
import { Button } from "@shop/ui/admin-button";
import { nowMs } from "@shop/core/time";
import { Plus } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { QueryState } from "@/components/ui/QueryState";
import { filterCodes, filterManual, groupByTab, usesOf, type StateFilter } from "../model/promo";
import type { PromoCode, PromoOrigin } from "../model/types";
import { useManualDiscounts, usePromocodes } from "../queries";
import { DeletePromoModal } from "./DeletePromoModal";
import { PromoFilters, PromoTabs } from "./PromoFilters";
import { PromoFormModal } from "./PromoFormModal";
import { PromoList } from "./PromoList";
import { usePromoTab } from "./use-promo-tabs";

export function PromocodesScreen({
  renderOrderDrawer,
}: {
  renderOrderDrawer: (orderId: string | null, onClose: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PromoCode | null>(null);
  const [confirming, setConfirming] = useState<PromoCode | null>(null);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const { tab, setTab, ready } = usePromoTab();
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");

  const promosQ = usePromocodes();
  const promos = useMemo(() => promosQ.data ?? [], [promosQ.data]);
  const manualQ = useManualDiscounts();
  const manual = useMemo(() => manualQ.data ?? [], [manualQ.data]);

  const byTab = useMemo(() => groupByTab(promos), [promos]);
  const counts: Record<PromoOrigin, number> = {
    OURS: byTab.OURS.length,
    PERSONAL: byTab.PERSONAL.length + manual.length,
    REVIEW: byTab.REVIEW.length,
  };
  const shown = filterCodes(byTab[tab], query, stateFilter, nowMs());
  const shownManual = filterManual(manual, tab, query, stateFilter);
  const filtering = !!query.trim() || stateFilter !== "all";
  const reviewUsed = byTab.REVIEW.filter((p) => usesOf(p) > 0).length;

  function openForm(p: PromoCode | null) {
    setEditing(p);
    setOpen(true);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Промокоды"
        subtitle="Скидки для клиентов — процент или фиксированная сумма"
        actions={
          <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => openForm(null)}>
            Новый промокод
          </Button>
        }
      />

      <PromoTabs tab={tab} onTab={setTab} counts={promosQ.isSuccess ? counts : undefined} />
      <PromoFilters tab={tab} query={query} onQuery={setQuery} state={stateFilter} onState={setStateFilter} />
      {tab === "REVIEW" && byTab.REVIEW.length > 0 && (
        <p className="mb-3 text-[12.5px] text-[var(--text-muted)]">
          Выдаются автоматически за отзыв о заказе — личные, на один раз. Выдано {byTab.REVIEW.length}, использовано{" "}
          {reviewUsed}.
        </p>
      )}

      <QueryState
        isLoading={promosQ.isLoading || !ready}
        isError={promosQ.isError}
        error={promosQ.error}
        refetch={() => promosQ.refetch()}
        loadingLabel="Загрузка промокодов"
      >
        <PromoList
          tab={tab}
          shown={shown}
          shownManual={shownManual}
          filtering={filtering}
          onResetFilters={() => {
            setQuery("");
            setStateFilter("all");
          }}
          onCreate={() => openForm(null)}
          onEdit={openForm}
          onDelete={setConfirming}
          onOpenOrder={setOpenOrderId}
        />
      </QueryState>

      <PromoFormModal
        open={open}
        editing={editing}
        onClose={() => setOpen(false)}
        // A code made here is always «Наши» — show it where it landed.
        onSaved={(created) => created && setTab("OURS")}
      />
      <DeletePromoModal promo={confirming} onClose={() => setConfirming(null)} />
      {renderOrderDrawer(openOrderId, () => setOpenOrderId(null))}
    </div>
  );
}
