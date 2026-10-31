"use client";

/**
 * Отправка (route "/dispatch") — the shipping-day workplace.
 *
 * Every order ready to go out, with everything the Nova Poshta form needs (copy buttons for name,
 * phone, city, branch), the cash-on-delivery amount in big letters, and — right on the card — the
 * ТТН field and "Отправлено". Clicking the card opens the full order. NEW orders can be shipped
 * straight away too (NEW → SHIPPED is allowed); those still waiting for a prepayment are flagged.
 * Refreshes itself; a failed load shows the error, never a fake "нет заказов".
 */
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { OrderDrawer, orderKeys, type AdminDispatchOrder } from "@/features/order";
import { cn } from "@/lib/cn";
import { Button } from "@shop/ui/admin-button";
import { Lightbox } from "@shop/ui/overlay";
import { useQueryClient } from "@tanstack/react-query";
import { Package, RefreshCw, Send } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useBroadcastDispatch, useDispatchOrders } from "../queries";
import { DispatchCard } from "./DispatchCard";

function Section({ title, orders, onOpen, onZoom }: { title: string; orders: AdminDispatchOrder[]; onOpen: (id: string) => void; onZoom: (src: string) => void }) {
  if (orders.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>{title} · {orders.length}</SectionTitle>
      {orders.map((o) => (
        <DispatchCard key={o.id} o={o} onOpen={() => onOpen(o.id)} onZoom={onZoom} />
      ))}
    </section>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="section-title !text-[var(--text-muted)]">{children}</h2>;
}

export function DispatchScreen() {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const q = useDispatchOrders();
  const broadcast = useBroadcastDispatch();
  const all = q.data ?? [];
  const approved = all.filter((o) => o.status !== "NEW");
  const fresh = all.filter((o) => o.status === "NEW");

  return (
    <div>
      <PageHeader
        title="Отправка"
        subtitle="Что отправлять, куда и сколько брать наложкой"
        // On a phone the title is already in the shell header: keep only the buttons.
        className="max-lg:mb-3 max-lg:[&_h1]:hidden max-lg:[&_p]:hidden"
        actions={
          <>
            <Button
              variant="surface"
              icon={<RefreshCw className={cn("h-4 w-4", q.isFetching && "animate-spin")} />}
              onClick={() => q.refetch()}
            >
              Обновить
            </Button>
            <Button
              variant="outline"
              loading={broadcast.isPending}
              icon={<Send className="h-4 w-4" />}
              onClick={() => broadcast.mutate()}
              disabled={approved.length === 0}
            >
              Карточки в Telegram
            </Button>
          </>
        }
      />

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка заказов…">
        {all.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Нет заказов к отправке"
            description="Одобренные заказы появятся здесь — со всем, что нужно для отправки."
          />
        ) : (
          <div className="flex flex-col gap-6">
            <Section title="Одобрены" orders={approved} onOpen={setOpenId} onZoom={setZoom} />
            <Section title="Новые — можно отправить сразу" orders={fresh} onOpen={setOpenId} onZoom={setZoom} />
          </div>
        )}
      </QueryState>

      <Lightbox src={zoom} onClose={() => setZoom(null)} />

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
