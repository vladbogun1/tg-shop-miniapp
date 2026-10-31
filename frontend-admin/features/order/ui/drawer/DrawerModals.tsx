"use client";

/** Все окна над карточкой заказа: листок «⋯», подтверждения, формы, подбор товара, профиль покупателя. */
import { ExchangeModal, ReturnModal, ReturnReceivedModal } from "@/features/returns";
import { PaymentModal } from "@/features/payment";
import { ActionSheet, type SheetAction } from "@/components/ui/ActionSheet";
import { UserProfileDrawer } from "@/features/customer";
import type { AdminOrderDetail } from "../../api";
import { shortId } from "../../model/status";
import { ItemPicker } from "../item-picker/ItemPicker";
import { ArchiveModal } from "../modals/ArchiveModal";
import { DeliveryEditModal } from "../modals/DeliveryEditModal";
import { DiscountModal } from "../modals/DiscountModal";
import { GiftCaseModal } from "../modals/GiftCaseModal";
import { MergeModal } from "../modals/MergeModal";
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
  sheetActions: SheetAction[];
  restockUnits: number | undefined;
  refreshLists: () => void;
}

export function DrawerModals({
  orderId,
  order,
  busyKey,
  isDesktop,
  modals,
  actions,
  flows,
  sheetActions,
  restockUnits,
  refreshLists,
}: Props) {
  const { open, hide, pendingTarget, setPendingTarget, profile, setProfile } = modals;
  const o = order ?? null;
  return (
    <>
      <ActionSheet
        open={open.more && !isDesktop}
        title={order ? `Заказ ${shortId(order.id)}` : undefined}
        actions={sheetActions}
        onClose={() => hide("more")}
      />

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
      <UserProfileDrawer user={profile} onClose={() => setProfile(null)} />
    </>
  );
}
