"use client";

/**
 * Promocodes (route "/promocodes") — list + create/edit + delete.
 *
 *  - A code is EITHER a percent OR a fixed amount (the «% / ₴» switch); percent is 1–100. A percent
 *    code may have a ceiling in ₴ («не больше», V63) — review bonuses get one from the settings.
 *  - One sticky control row (tabs, search, state filter, «+ Новый»); the list is one panel of compact
 *    rows with a quick on/off switch and a «⋯» menu (edit, orders, copy, delete).
 *  - The orders placed with a code open in a side panel (a full-width one on a phone); an order opens over it.
 *  - Editing a code that was already used warns what that means for existing orders.
 *  - Four tabs, so the owner's codes are not buried under generated ones (`?tab=` keeps it):
 *    «Наши» — shared codes made here (default); «Персональные скидки» — codes for one customer plus
 *    orders with a manual amount/percent discount («Ручная скидка», not a code); «За отзывы» —
 *    automatic review bonuses; «Из кейса» — prizes of the gift case (hundreds of codes: a server-side page
 *    with search, status filter and paging). Search and the status filter work inside the open tab.
 *  - «Срок до» in the form (date + 7/30/90 дн./«Без срока»); the quick on/off switch never touches it.
 */
import { useState, type ReactNode } from "react";
import { QueryState } from "@/components/ui/QueryState";
import { usesOf, type StateFilter } from "../model/promo";
import type { PromoCode } from "../model/types";
import { DeletePromoModal } from "./DeletePromoModal";
import { PromoControls } from "./PromoFilters";
import { PromoFormModal } from "./PromoFormModal";
import { PromoList } from "./PromoList";
import { PromoOrdersPanel } from "./PromoOrdersPanel";
import { PromoPager } from "./PromoPager";
import { PromoSummary } from "./PromoSummary";
import { usePromoTab } from "./use-promo-tabs";
import { usePromoView } from "./use-promo-view";
import { PageHeader } from "@/components/layout/PageHeader";

export function PromocodesScreen({
  renderOrderDrawer,
}: {
  renderOrderDrawer: (orderId: string | null, onClose: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PromoCode | null>(null);
  const [confirming, setConfirming] = useState<PromoCode | null>(null);
  const [ordersOf, setOrdersOf] = useState<PromoCode | null>(null);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const { tab, setTab, ready } = usePromoTab();
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");

  const view = usePromoView(tab, query, stateFilter);
  const { byTab, shown, shownManual } = view;
  const filtering = !!query.trim() || stateFilter !== "all";
  const review = tab === "REVIEW" ? { issued: byTab.REVIEW.length, used: byTab.REVIEW.filter((p) => usesOf(p) > 0).length } : null;

  function openForm(p: PromoCode | null) {
    setEditing(p);
    setOpen(true);
  }

  return (
    <div className="mx-auto min-w-0 max-w-[1200px]">
      <PageHeader title="Промокоды" subtitle="Скидки по коду: свои, личные, за отзывы и призы кейса" />
      <PromoControls
        tab={tab}
        onTab={setTab}
        counts={view.countsReady ? view.counts : undefined}
        query={query}
        onQuery={setQuery}
        state={stateFilter}
        onState={setStateFilter}
        onCreate={() => openForm(null)}
      />
      <PromoSummary list={byTab[tab]} review={review} now={view.now} />

      <QueryState
        isLoading={view.isLoading || !ready}
        isError={view.isError}
        error={view.error}
        refetch={view.refetch}
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
          onOrders={setOrdersOf}
          onOpenOrder={setOpenOrderId}
        />
        {view.pager && <PromoPager {...view.pager} />}
      </QueryState>

      <PromoFormModal
        open={open}
        editing={editing}
        onClose={() => setOpen(false)}
        // A code made here is always «Наши» — show it where it landed.
        onSaved={(created) => created && setTab("OURS")}
      />
      <DeletePromoModal promo={confirming} onClose={() => setConfirming(null)} />
      <PromoOrdersPanel promo={ordersOf} onClose={() => setOrdersOf(null)} onOpenOrder={setOpenOrderId} />
      {renderOrderDrawer(openOrderId, () => setOpenOrderId(null))}
    </div>
  );
}
