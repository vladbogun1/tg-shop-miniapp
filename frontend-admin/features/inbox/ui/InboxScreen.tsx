"use client";

/**
 * «Внимание» (route "/inbox"): one screen with everything waiting for the owner, most urgent
 * group first — money (paid online → confirm; paid but cancelled → refund) → unread chats → new orders nobody approved → approved but not
 * shipped → refusals/returns → stock running out → a failed site rebuild.
 *
 *  - GET /api/admin/inbox, polled every 30 s and on focus; the order drawer and the chat refetch
 *    it after every action (there is no global order WebSocket topic to listen to).
 *  - An order opens in the OrderDrawer ON TOP of this page (payment rows scrolled to the
 *    «Онлайн-оплата» block, chat rows into the chat), so the list stays where it was.
 *  - A kind the UI does not know yet (the server added one) still renders: the server's group
 *    title and hint, a neutral icon, «Открыть заказ».
 *  - «Отложить» (1 h / until 9:00 / 3 days) and «Разобрано» are optimistic, with «Отменить»
 *    in the toast. A newer event (a new payment, a new message) brings a row back by itself.
 */
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { cn } from "@/lib/cn";
import { useIsDesktop } from "@/lib/use-media";
import { Button } from "@shop/ui/admin-button";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCheck, RotateCw } from "lucide-react";
import type { InboxOrderSlot } from "../model/order-slot";
import { inboxKeys } from "../keys";
import { snoozedTotal, visibleGroups } from "../model/inbox";
import { useInbox } from "../queries";
import { GroupNav } from "./GroupNav";
import { GroupSection } from "./GroupSection";
import { useInboxActions } from "./use-inbox-actions";
import { useInboxPrimary } from "./use-inbox-primary";

function AllClear({ snoozed }: { snoozed: number }) {
  return (
    <EmptyState
      icon={CheckCheck}
      title="Всё разобрано ✓"
      description={
        snoozed > 0
          ? `Отложено: ${snoozed}. Они вернутся сами, когда подойдёт срок.`
          : "Оплаченные заказы, сообщения и застрявшие заказы появятся здесь."
      }
    />
  );
}

export function InboxScreen({ order: slot }: { order: InboxOrderSlot }) {
  const { OrderDrawer } = slot;
  const q = useInbox();
  const qc = useQueryClient();
  const isDesktop = useIsDesktop();
  const { snooze, dismiss } = useInboxActions();
  const { order, closeOrder, primary, siteBusy } = useInboxPrimary();

  const data = q.data;
  const groups = visibleGroups(data);
  const snoozed = snoozedTotal(data);

  return (
    <div className="min-w-0">
      <PageHeader
        title="Внимание"
        subtitle="Всё, что ждёт вашего действия. Обновляется само каждые 30 секунд."
        actions={
          <Button
            variant="outline"
            size="sm"
            icon={<RotateCw className={cn("h-4 w-4", q.isFetching && "animate-spin")} />}
            onClick={() => q.refetch()}
          >
            Обновить
          </Button>
        }
      />

      <QueryState
        isLoading={q.isLoading}
        isError={q.isError && !data}
        error={q.error}
        refetch={q.refetch}
        loadingLabel="Собираем, что требует внимания"
      >
        {groups.length === 0 ? (
          <AllClear snoozed={snoozed} />
        ) : (
          <>
            <GroupNav groups={groups} />

            <div className="flex flex-col gap-6">
              {groups.map((g, i) => (
                <GroupSection
                  key={g.id}
                  group={g}
                  order={slot}
                  index={i}
                  isDesktop={isDesktop}
                  siteBusy={siteBusy}
                  onPrimary={primary}
                  onSnooze={snooze}
                  onDismiss={dismiss}
                />
              ))}
            </div>

            {snoozed > 0 && (
              <p className="font-display mt-6 text-center text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">
                Отложено: {snoozed} — вернутся сами
              </p>
            )}
          </>
        )}
      </QueryState>

      <OrderDrawer
        orderId={order?.id ?? null}
        initialTab={order?.tab ?? "details"}
        initialAction={order?.payment ? "payment" : undefined}
        onClose={() => {
          closeOrder();
          void qc.invalidateQueries({ queryKey: inboxKeys.all() });
        }}
      />
    </div>
  );
}
