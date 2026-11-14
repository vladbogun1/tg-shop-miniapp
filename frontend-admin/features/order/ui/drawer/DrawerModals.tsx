"use client";

/** Все окна над карточкой заказа: листок «⋯», подтверждения, формы, подбор товара, профиль покупателя. */
import { useMemo, useState } from "react";
import { ExchangeModal, ReturnModal, ReturnReceivedModal } from "@/features/returns";
import { PaymentModal } from "@/features/payment";
import { ActionSheet } from "@/components/ui/ActionSheet";
import { displayName, UserProfileDrawer } from "@/features/customer";
import type { AdminOrderDetail } from "../../api";
import type { NewOrderFrom } from "../../model/new-order-prefill";
import { shortId } from "../../model/status";
import { ItemPicker } from "../item-picker/ItemPicker";
import { ArchiveModal } from "../modals/ArchiveModal";
import { DeliveryEditModal } from "../modals/DeliveryEditModal";
import { DiscountModal } from "../modals/DiscountModal";
import { GiftCaseModal } from "../modals/GiftCaseModal";
import { MenuGroups } from "./MoreMenu";
import type { MenuGroup } from "./sheet-actions";
import { MergeModal } from "../modals/MergeModal";
import { NewOrderModal } from "../new-order/NewOrderModal";
import { StatusChangeModal } from "../modals/StatusChangeModal";
import { TrackingModal } from "../modals/TrackingModal";
import type { DrawerModals as Modals } from "./use-drawer-modals";
import type { useFlowActions } from "./use-flow-actions";
import type { useOrderActions } from "./use-order-actions";

interface Props {
  orderId: string | null;
  order: AdminOrderDetail | undefined;
  busyKey: string | null;
  isDesktop: boolean;
  modals: Modals;
  actions: ReturnType<typeof useOrderActions>;
  flows: ReturnType<typeof useFlowActions>;
  menuGroups: MenuGroup[];
  restockUnits: number | undefined;
  refreshLists: () => void;
  /** Open another order in this drawer (the one just created by «Новый заказ этому покупателю»). */
  jumpTo: (orderId: string) => void;
}

export function DrawerModals({
  orderId,
  order,
  busyKey,
  isDesktop,
  modals,
  actions,
  flows,
  menuGroups,
  restockUnits,
  refreshLists,
  jumpTo,
}: Props) {
  const { open, hide, pendingTarget, pendingBack, setPendingTarget, profile, setProfile } = modals;
  const o = order ?? null;
  // «Новый заказ»: from the «Ещё» menu — this order's buyer and address; from the profile — that customer.
  const [newForCustomer, setNewForCustomer] = useState<NewOrderFrom | null>(null);
  const newFrom = useMemo<NewOrderFrom | null>(() => newForCustomer ?? (orderId ? { orderId } : null), [newForCustomer, orderId]);
  return (
    <>
      <ActionSheet open={open.more && !isDesktop} title={order ? `Заказ ${shortId(order.id)}` : undefined} onClose={() => hide("more")}>
        <MenuGroups
          role="button"
          groups={menuGroups}
          busyKey={busyKey}
          onPick={(run) => {
            hide("more");
            run();
          }}
        />
      </ActionSheet>

      <StatusChangeModal
        open={pendingTarget !== null}
        target={pendingTarget}
        order={
          order
            ? {
                id: order.id,
                label: `${shortId(order.id)} · ${order.customerName}`,
                totalMinor: order.totalMinor,
                currency: order.currency,
                restockUnits,
                deliveryMethod: order.deliveryMethod,
                fromStatus: order.status,
                receivedMinor: order.receivedMinor,
                prepaymentMinor: order.prepaymentMinor,
              }
            : null
        }
        loading={!!pendingTarget && busyKey === `status:${pendingTarget}`}
        initialInTransit={pendingBack !== null}
        initialCode={pendingBack ?? undefined}
        onClose={() => setPendingTarget(null)}
        onConfirm={actions.applyStatus}
      />

      <PaymentModal open={open.pay} order={o} loading={busyKey === "pay"} onClose={() => hide("pay")} onConfirm={actions.applyPayment} />

      <TrackingModal
        open={open.tracking}
        orderId={orderId}
        current={order?.trackingNumber}
        loading={busyKey === "tracking"}
        onClose={() => hide("tracking")}
        onSave={actions.saveTracking}
      />

      <DeliveryEditModal
        open={open.delivery}
        order={o}
        loading={busyKey === "delivery"}
        onClose={() => hide("delivery")}
        onSave={actions.saveDelivery}
      />

      <ReturnModal open={open.return} order={o} loading={busyKey === "return"} onClose={() => hide("return")} onSave={flows.saveReturn} />

      <ReturnReceivedModal
        open={open.received}
        order={o}
        loading={busyKey === "return-received"}
        onClose={() => hide("received")}
        onSave={flows.saveReturnReceived}
      />

      <ArchiveModal
        open={open.archive}
        label={order ? shortId(order.id) : undefined}
        loading={busyKey === "archive"}
        onClose={() => hide("archive")}
        onConfirm={actions.applyArchive}
      />

      <ExchangeModal
        open={open.exchange}
        order={o}
        loading={busyKey === "exchange"}
        onClose={() => hide("exchange")}
        onSave={flows.saveExchange}
      />

      <MergeModal open={open.merge} order={o} loading={busyKey === "merge"} onClose={() => hide("merge")} onSave={flows.saveMerge} />

      <ItemPicker open={open.gift} orderId={orderId} onClose={() => hide("gift")} onDone={refreshLists} />

      <GiftCaseModal
        open={open.case}
        loading={busyKey === "gift-case"}
        onClose={() => hide("case")}
        onConfirm={(tier, notify) => void actions.grantCase(tier, notify)}
      />

      <DiscountModal open={open.discount} order={o} onClose={() => hide("discount")} onDone={refreshLists} />

      {/* The customer's profile opens OVER the order (rendered later → on top), Esc/× return here. */}
      <UserProfileDrawer
        user={profile}
        onClose={() => setProfile(null)}
        onNewOrder={(u) => setNewForCustomer({ tgId: u.telegramUserId, name: displayName(u) })}
      />

      <NewOrderModal
        open={open.newOrder || !!newForCustomer}
        from={newFrom}
        onClose={() => {
          hide("newOrder");
          setNewForCustomer(null);
        }}
        onCreated={(id) => {
          setProfile(null);
          jumpTo(id);
        }}
      />
    </>
  );
}
