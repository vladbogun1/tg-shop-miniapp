"use client";

import { shortId } from "../../model/status";
import { StatusChangeModal } from "../modals/StatusChangeModal";
import type { useBoardMoves } from "./use-board-moves";

/** «Отправлен» / «Отклонён» / «Доставлен»: окно подтверждения для карточки, которую перенесли. */
export function StatusMoveModal({ moves }: { moves: ReturnType<typeof useBoardMoves> }) {
  const { pending } = moves;
  return (
    <StatusChangeModal
      open={pending !== null}
      target={pending?.to ?? null}
      order={
        pending
          ? {
              id: pending.order.id,
              label: `${shortId(pending.order.id)} · ${pending.order.customerName}`,
              totalMinor: pending.order.totalMinor,
              currency: pending.order.currency,
              restockUnits: pending.order.itemsCount,
              deliveryMethod: pending.order.deliveryMethod,
              fromStatus: pending.order.status,
              receivedMinor: pending.order.receivedMinor,
            }
          : null
      }
      loading={moves.changing}
      initialInTransit={moves.pendingInTransit}
      onClose={moves.closeModal}
      onConfirm={(payload) => (pending ? moves.commitStatus(payload, pending.order.id) : false)}
    />
  );
}
