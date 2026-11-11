"use client";

/**
 * Отправка (route "/dispatch") — the shipping-day workplace (variant A: a grid of cards).
 *
 * Every order ready to go out, with everything the Nova Poshta form needs (copy fields for name,
 * phone, city, branch), the cash-on-delivery amount in big letters right under the name, and — on
 * the card — the ТТН field and "Отправлено". Clicking the name opens the full order. NEW orders can be
 * shipped straight away too (NEW → SHIPPED is allowed); those still waiting for a prepayment are flagged.
 * Sections: unpaid first (never hidden), then approved, then new. A sticky toolbar filters and searches.
 * Refreshes itself; a failed load shows the error, never a fake "нет заказов".
 */
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { OrderDrawer, orderKeys, type AdminDispatchOrder } from "@/features/order";
import { useIsDesktop } from "@/lib/use-media";
import { Lightbox } from "@shop/ui/overlay";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Package, SearchX } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { filterCounts, filterOrders, splitOrders, type DispatchFilter } from "../model/dispatch";
import { useBroadcastDispatch, useDispatchOrders } from "../queries";
import { DispatchCard } from "./DispatchCard";
import { BatchBar, BatchResults } from "./BatchBar";
import { useNpBatch, type NpBatch } from "./use-np-batch";
import { ShipmentDialog } from "@/features/delivery";
import { DispatchToolbar } from "./DispatchToolbar";
import { PageHeader } from "@/components/layout/PageHeader";

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="section-title !text-[var(--text-muted)]">{children}</h2>;
}

function Section({
  title,
  orders,
  phone,
  np,
  onOpen,
  onZoom,
}: {
  title: string;
  orders: AdminDispatchOrder[];
  phone: boolean;
  np: NpBatch;
  onOpen: (id: string) => void;
  onZoom: (src: string) => void;
}) {
  if (orders.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>
        {title} · {orders.length}
      </SectionTitle>
      {/* 1 column on a phone / tablet, then as many 420–440 px cards as fit. */}
      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-[repeat(auto-fill,minmax(420px,1fr))] 2xl:grid-cols-[repeat(auto-fill,minmax(440px,1fr))]">
        <AnimatePresence initial={false}>
          {orders.map((o) => (
            // A shipped card folds up instead of the list jumping (not on a phone: the page scroll stays calm).
            <motion.div
              key={o.id}
              exit={phone ? undefined : { opacity: 0, height: 0, overflow: "hidden", transition: { duration: 0.2 } }}
            >
              <DispatchCard
                o={o}
                np={{
                  ticked: np.ticked.has(o.id),
                  onTick: () => np.toggle(o.id),
                  format: np.format,
                  onTtn: (mode) => np.openTtn(o.id, mode),
                }}
                onOpen={() => onOpen(o.id)}
                onZoom={onZoom}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}

/** «Створити ТТН для всіх», печать и результат пакета — над секциями, когда на экране есть заказы НП. */
function NpBatchPanel({ np, onOpen }: { np: NpBatch; onOpen: (id: string) => void }) {
  if (np.scope.np.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <BatchBar
        total={np.scope.np.length}
        selected={np.scope.selected.length}
        toCreate={np.scope.toCreate.length}
        toPrintIds={np.scope.toPrint.map((o) => o.id)}
        staleCount={np.scope.staleCount}
        format={np.format}
        onFormat={np.setFormat}
        branches={np.branches}
        branch={np.branch}
        onBranch={np.setBranch}
        creating={np.creating}
        onAll={np.toggleAll}
        onCreate={np.createAll}
      />
      {np.results && <BatchResults results={np.results} onClose={np.clearResults} onOpen={onOpen} />}
    </div>
  );
}

export function DispatchScreen() {
  const qc = useQueryClient();
  const phone = !useIsDesktop();
  const [openId, setOpenId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [filter, setFilter] = useState<DispatchFilter>("all");
  const [query, setQuery] = useState("");
  const q = useDispatchOrders();
  const broadcast = useBroadcastDispatch();
  const all = useMemo(() => q.data ?? [], [q.data]);
  const counts = useMemo(() => filterCounts(all), [all]);
  const visible = useMemo(() => filterOrders(all, filter, query), [all, filter, query]);
  const sections = useMemo(() => splitOrders(visible), [visible]);
  const np = useNpBatch(visible);
  const shown = sections.unpaid.length + sections.approved.length + sections.fresh.length;
  const sectionProps = { phone, np, onOpen: setOpenId, onZoom: setZoom };

  return (
    <div>
      <PageHeader title="Отправка" subtitle="Что упаковать и отправить сегодня" />
      <DispatchToolbar
        phone={phone}
        filter={filter}
        counts={counts}
        query={query}
        fetching={q.isFetching}
        broadcasting={broadcast.isPending}
        canBroadcast={all.some((o) => o.status !== "NEW")}
        onFilter={setFilter}
        onQuery={setQuery}
        onRefresh={() => q.refetch()}
        onBroadcast={() => broadcast.mutate()}
      />

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка заказов…">
        {all.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Нет заказов к отправке"
            description="Одобренные заказы появятся здесь — со всем, что нужно для отправки."
          />
        ) : shown === 0 ? (
          <EmptyState icon={SearchX} title="Ничего не найдено" description="Попробуйте другой запрос или фильтр." />
        ) : (
          <div className="flex flex-col gap-6">
            <NpBatchPanel np={np} onOpen={setOpenId} />
            <Section title="Не оплачено — не отправляйте без проверки" orders={sections.unpaid} {...sectionProps} />
            <Section title="Одобрены" orders={sections.approved} {...sectionProps} />
            <Section title="Новые — можно отправить сразу" orders={sections.fresh} {...sectionProps} />
          </div>
        )}
      </QueryState>

      <Lightbox src={zoom} onClose={() => setZoom(null)} />

      {np.ttnFor && <ShipmentDialog orderId={np.ttnFor.id} mode={np.ttnFor.mode} onClose={np.closeTtn} onDone={np.ttnDone} />}

      <OrderDrawer
        orderId={openId}
        onClose={() => {
          setOpenId(null);
          void qc.invalidateQueries({ queryKey: orderKeys.dispatch() });
        }}
      />
    </div>
  );
}
