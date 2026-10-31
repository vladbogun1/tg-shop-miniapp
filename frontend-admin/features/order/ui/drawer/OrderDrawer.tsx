"use client";

/**
 * OrderDrawer — order card in the neo `Drawer` shell.
 * Header: short id + status/payment/source badges (they wrap — the × must stay on a phone screen).
 * Tabs: Детали / Чат (unread counter) / История (admin action log).
 * Footer: on desktop every action; on a phone one main action for the status + "⋯" for the rest.
 * Every action has its own spinner; destructive ones ask first (own modal, not window.confirm).
 * The phone/browser "Назад" closes the card instead of leaving the page.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Drawer } from "@shop/ui/overlay";
import { useBatchProductTools } from "@/components/preorders/BatchItemProduct";
import { useIsSuperAdmin } from "@/features/staff";
import { useIsDesktop } from "@/lib/use-media";
import { unreadFromCustomer } from "../../model/chat";
import { drawerRules } from "../../model/drawer-rules";
import { useOrderMessagesQuery } from "../../queries/chat";
import { useOpenCustomerMutation, useOpenProductMutation, useOrderActionRunner, useOrderQuery } from "../../queries/drawer";
import { useMergeCandidatesQuery } from "../../queries/modals";
import { OrderChat } from "../chat/OrderChat";
import { OrderHistory } from "../details/OrderHistory";
import { buildDetailHandlers } from "./build-detail-handlers";
import { DetailsPane } from "./DetailsPane";
import { DrawerHeader } from "./DrawerHeader";
import { DrawerModals } from "./DrawerModals";
import { DrawerTabs } from "./DrawerTabs";
import { buildSheetActions } from "./sheet-actions";
import { useDrawerModals } from "./use-drawer-modals";
import { useFlowActions } from "./use-flow-actions";
import { useInitialAction, type InitialAction } from "./use-initial-action";
import { useOrderActions } from "./use-order-actions";

interface Props {
  orderId: string | null;
  onClose: () => void;
  initialTab?: "details" | "chat";
  /**
   * Once the order has loaded: «payment» scrolls to «Онлайн-оплата» («Внимание» → «Оплаты»),
   * «return» opens the return wizard, «received» opens «Посылка вернулась» (board «Едет назад»).
   */
  initialAction?: InitialAction;
  /** `onClose` navigates to another page (the /orders/{id} deep link) — see Drawer `closeNavigates`. */
  closeNavigates?: boolean;
}

export function OrderDrawer({ orderId: propId, onClose, initialTab = "details", initialAction, closeNavigates }: Props) {
  // An exchange opens its new order in the same drawer; the links between the two switch back and
  // forth. Opening another order from outside starts over from it.
  const [jumped, setJumped] = useState<string | null>(null);
  useEffect(() => setJumped(null), [propId]);
  const orderId = propId ? (jumped ?? propId) : null;
  const isDesktop = useIsDesktop();
  const isSuper = useIsSuperAdmin() === true;
  const closeRef = useRef<(() => void) | null>(null);
  const close = useCallback(() => closeRef.current?.(), []);

  const modals = useDrawerModals(orderId, initialTab);
  const { show, tab } = modals;
  const orderQ = useOrderQuery(orderId);
  const order = orderQ.data;
  const { busyKey, run, refreshLists } = useOrderActionRunner(orderId);
  const actions = useOrderActions({ orderId, run, modals, close });
  const flows = useFlowActions({ orderId, run, modals, jumpTo: setJumped });
  const paymentRef = useInitialAction({ orderId, order, initialAction, tab, show });

  // Unread customer messages for the "Чат" tab badge (the chat itself shares this cache entry).
  const messagesQ = useOrderMessagesQuery(orderId);
  const unread = useMemo(() => unreadFromCustomer(messagesQ.data), [messagesQ.data]);

  const rules = drawerRules(order, isSuper);
  // Merge: the button shows only when the customer has another order it can be merged with right now.
  const mergeQ = useMergeCandidatesQuery(order?.id ?? null, rules.mergeable);
  const canMerge = rules.mergeable && (mergeQ.data ?? []).some((c) => !c.blocker);

  // Tap on a line → the supply page's quick view, over this drawer (z-[120]) and under its modals (z-[150]).
  const productTools = useBatchProductTools({ zClass: "z-[140]" });
  const openProduct = useOpenProductMutation(productTools.openPreview);
  const openCustomer = useOpenCustomerMutation(modals.setProfile);

  const handlers = buildDetailHandlers({
    order,
    rules,
    canMerge,
    busyKey,
    actions,
    show,
    openOrder: setJumped,
    openCustomer: () => order && openCustomer.mutate(order),
    openProduct: (id) => openProduct.mutate(id),
    onPaymentChanged: refreshLists,
    paymentRef,
  });
  const onUnarchive = () => void actions.applyUnarchive();
  const sheetActions = buildSheetActions({ rules, canMerge, show, requestStatus: actions.requestStatus, onUnarchive });

  return (
    <>
      <Drawer
        open={!!orderId}
        onClose={onClose}
        header={<DrawerHeader order={order} archived={rules.archived} />}
        width="max-w-[680px]"
        zClass="z-[120]"
        backClose="orderDrawer"
        closeNavigates={closeNavigates}
        closeRef={closeRef}
      >
        <div className="flex h-full min-h-0 flex-col">
          <DrawerTabs tab={tab} onChange={modals.setTab} unread={unread} />

          {tab === "details" && (
            <DetailsPane
              query={orderQ}
              handlers={handlers}
              bar={{ rules, busyKey, isDesktop, show, requestStatus: actions.requestStatus, onUnarchive }}
            />
          )}

          {tab === "chat" && (
            <div className="flex min-h-0 flex-1 p-3 pb-[calc(12px+var(--safe-bottom))] sm:p-5 sm:pb-[calc(20px+var(--safe-bottom))]">
              {orderId && <OrderChat key={orderId} orderId={orderId} />}
            </div>
          )}

          {tab === "history" && (
            <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{orderId && <OrderHistory orderId={orderId} />}</div>
          )}
        </div>
      </Drawer>

      <DrawerModals
        orderId={orderId}
        order={order}
        busyKey={busyKey}
        isDesktop={isDesktop}
        modals={modals}
        actions={actions}
        flows={flows}
        sheetActions={rules.primary ? sheetActions : sheetActions.filter((a) => a.key !== "pay")}
        restockUnits={rules.restockUnits}
        refreshLists={refreshLists}
      />

      {productTools.ui}
    </>
  );
}
