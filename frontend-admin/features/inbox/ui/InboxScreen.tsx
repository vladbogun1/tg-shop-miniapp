"use client";

/**
 * «Внимание» (route "/inbox"): one screen with everything waiting for the owner, most urgent
 * group first — money (paid online → confirm; paid but cancelled → refund) → unread chats → new orders nobody approved → approved but not
 * shipped → refusals/returns → stock running out → a failed site rebuild.
 *
 *  - Laptop / tablet (≥ 768): variant A — a sticky toolbar with group chips (anchors), a thin divider per
 *    group, two-line rows with the main action and «⋯». Phone (< 768): variant B — the groups as a chat
 *    list, a tap opens the group with big cards.
 *  - GET /api/admin/inbox, polled every 30 s and on focus; the order drawer and the chat refetch
 *    it after every action (there is no global order WebSocket topic to listen to).
 *  - An order opens in the OrderDrawer ON TOP of this page (payment rows scrolled to the
 *    «Онлайн-оплата» block, chat rows into the chat), so the list stays where it was.
 *  - A kind the UI does not know yet (the server added one) still renders: the server's group
 *    title and hint, a neutral icon, «Открыть заказ».
 *  - «Отложить» (1 h / until 9:00 / 3 days) and «Разобрано» are optimistic, with «Отменить»
 *    in the toast. A newer event (a new payment, a new message) brings a row back by itself.
 */
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { useMediaQuery } from "@shop/ui/use-media";
import { useBackToClose } from "@shop/ui/overlay";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCheck } from "lucide-react";
import { useState } from "react";
import type { InboxOrderSlot } from "../model/order-slot";
import { inboxKeys } from "../keys";
import { snoozedTotal, visibleGroups } from "../model/inbox";
import { useInbox } from "../queries";
import { GroupSection } from "./GroupSection";
import { InboxToolbar } from "./InboxToolbar";
import { PhoneGroupList } from "./PhoneGroupList";
import { PhoneGroupView } from "./PhoneGroupView";
import { useActiveGroup } from "./use-active-group";
import { useExpandedGroups } from "./use-expanded-groups";
import { useInboxActions } from "./use-inbox-actions";
import { useInboxPrimary } from "./use-inbox-primary";

function AllClear() {
  return <EmptyState icon={CheckCheck} title="Всё разобрано" />;
}

export function InboxScreen({ order: slot }: { order: InboxOrderSlot }) {
  const { OrderDrawer } = slot;
  const q = useInbox();
  const qc = useQueryClient();
  const tablet = useMediaQuery("(min-width: 768px)", true);
  const phone = !tablet;
  const { snooze, dismiss } = useInboxActions();
  const { order, closeOrder, primary, siteBusy } = useInboxPrimary();
  const expanded = useExpandedGroups();
  const [openId, setOpenId] = useState<string | null>(null);

  const data = q.data;
  const groups = visibleGroups(data);
  const snoozed = snoozedTotal(data);
  // A group whose last row was handled closes by itself (back to the list).
  const openGroup = phone ? (groups.find((g) => g.id === openId) ?? null) : null;
  const back = useBackToClose(openGroup !== null, () => setOpenId(null), { marker: "inboxGroup" });
  const active = useActiveGroup(
    groups.map((g) => g.id),
    !phone
  );

  const rowProps = { siteBusy, onToggleExpanded: expanded.toggle, onPrimary: primary, onSnooze: snooze, onDismiss: dismiss };

  return (
    <div className="mx-auto min-w-0 max-w-[920px] 2xl:max-w-[1100px]">
      {/* The shell's top bar carries the visible title. */}
      <h1 className="sr-only">Внимание</h1>

      <QueryState
        isLoading={q.isLoading}
        isError={q.isError && !data}
        error={q.error}
        refetch={q.refetch}
        loadingLabel="Собираем, что требует внимания"
      >
        <InboxToolbar groups={groups} active={active} snoozed={snoozed} phone={phone} fetching={q.isFetching} onRefresh={() => q.refetch()} />
        <div className="pt-2">
          {groups.length === 0 ? (
            <AllClear />
          ) : phone ? (
            openGroup ? (
              <PhoneGroupView group={openGroup} order={slot} expanded={expanded.isExpanded(openGroup.id)} onBack={back} {...rowProps} />
            ) : (
              <PhoneGroupList groups={groups} onOpen={setOpenId} />
            )
          ) : (
            <div className="flex flex-col gap-5">
              {groups.map((g) => (
                <GroupSection key={g.id} group={g} order={slot} expanded={expanded.isExpanded(g.id)} {...rowProps} />
              ))}
            </div>
          )}
        </div>
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
