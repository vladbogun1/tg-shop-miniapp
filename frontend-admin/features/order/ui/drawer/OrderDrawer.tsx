"use client";

/**
 * OrderDrawer — order card in the neo `Drawer` shell.
 * Header: two lines — «#id · имя» + status, then chips and the urgent money line (deadline / наложка).
 * Tabs: Детали / Чат (unread counter) / История (admin action log); on ≥ sm they sit in the header strip.
 * From 1360 px the card is wide: details (or history) on the left, the chat always on the right, no «Чат» tab.
 * Footer: main step + «Отклонить» + «⋯ Ещё» (groups Деньги / Заказ / Архив): popover on desktop, sheet on a phone.
 * Every action has its own spinner; destructive ones ask first (own modal, not window.confirm).
 * The phone/browser "Назад" closes the card instead of leaving the page.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Drawer } from "@shop/ui/overlay";
import { useBatchProductTools } from "@/features/product";
import { useIsSuperAdmin } from "@/features/staff";
import { useMediaQuery } from "@shop/ui/use-media";
import { useIsDesktop } from "@/lib/use-media";
import { unreadFromCustomer } from "../../model/chat";
import { drawerRules } from "../../model/drawer-rules";
import { useOrderMessagesQuery } from "../../queries/chat";
import { useOpenCustomerMutation, useOpenProductMutation, useOrderActionRunner, useOrderQuery } from "../../queries/drawer";
import { useMergeCandidatesQuery } from "../../queries/modals";
import { buildDetailHandlers } from "./build-detail-handlers";
import { DrawerBody } from "./DrawerBody";
import { DrawerHeader } from "./DrawerHeader";
import { DrawerModals } from "./DrawerModals";
import { DrawerTabs } from "./DrawerTabs";
import { buildMenuGroups } from "./sheet-actions";
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
  const hasTabsInHeader = useMediaQuery("(min-width: 640px)", true);
  // Wide card: details and chat side by side (the e2e/laptop 1280 keeps tabs).
  const twoCols = useMediaQuery("(min-width: 1360px)", false);
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
  const paymentRef = useInitialAction({
    orderId,
    order,
    initialAction,
    tab,
    show,
  });

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
  const menuGroups = buildMenuGroups({
    rules,
    canMerge,
    withReject: true,
    show,
    requestStatus: actions.requestStatus,
    onUnarchive,
  });
  // Two columns: «Чат» is not a tab (it is always on the right).
  const view = twoCols && tab === "chat" ? "details" : tab;
  const tabs = <DrawerTabs tab={view} onChange={modals.setTab} unread={unread} withChat={!twoCols} inHeader={hasTabsInHeader} />;

  return (
    <>
      <Drawer
        open={!!orderId}
        onClose={onClose}
        header={<DrawerHeader order={order} archived={rules.archived} tabs={hasTabsInHeader ? tabs : undefined} />}
        // Disjoint ranges: Tailwind v4 emits arbitrary `min-[1360px]:` BEFORE `sm:`, so `sm:` used to win and the
        // two-column drawer stayed 720 px wide on a 1440/1920 screen.
        width="max-[1359px]:sm:max-w-[720px] min-[1360px]:max-w-[1040px]"
        zClass="z-[120]"
        backClose="orderDrawer"
        closeNavigates={closeNavigates}
        closeRef={closeRef}
      >
        <DrawerBody
          orderId={orderId}
          orderQ={orderQ}
          order={order}
          view={view}
          twoCols={twoCols}
          tabs={hasTabsInHeader ? undefined : tabs}
          handlers={handlers}
          bar={{
            rules,
            canMerge,
            busyKey,
            isDesktop,
            show,
            requestStatus: actions.requestStatus,
            onUnarchive,
            onChat: () => modals.setTab("chat"),
          }}
          setTab={modals.setTab}
        />
      </Drawer>

      <DrawerModals
        orderId={orderId}
        order={order}
        busyKey={busyKey}
        isDesktop={isDesktop}
        modals={modals}
        actions={actions}
        flows={flows}
        menuGroups={menuGroups}
        restockUnits={rules.restockUnits}
        refreshLists={refreshLists}
      />

      {productTools.ui}
    </>
  );
}
