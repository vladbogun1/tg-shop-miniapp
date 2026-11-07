"use client";

/**
 * The button in a card's header and the «Переместить» sheet it opens. Shared by the phone (MobileBoard)
 * and the kanban on a touch screen (a tablet), where dragging is a long press nobody guesses.
 */
import { ArrowRightLeft, PackageCheck } from "lucide-react";
import type { OrderStatus } from "@shop/core/types";
import { ActionSheet } from "@/components/ui/ActionSheet";
import type { AdminOrderCard } from "../../api";
import { STATUS_ACTION_LABEL, STATUS_VAR, allowedTargets } from "../../model/status";

export interface MoveFor {
  id: string;
  from: OrderStatus;
  label: string;
}

const ACTION_BTN =
  "nb-press hit -my-1 grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--border-2)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)]";

interface CardActionProps {
  order: AdminOrderCard;
  returning: boolean;
  onReceived: (id: string) => void;
  onMoveFor: (m: MoveFor) => void;
}

/** Кнопка в шапке карточки: «Посылка вернулась» в «Едет назад», иначе «Переместить». */
export function CardAction({ order, returning, onReceived, onMoveFor }: CardActionProps) {
  // The card around is draggable on a tablet: a press on the button must not start a drag.
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  if (returning) {
    return (
      <button
        type="button"
        onPointerDown={stop}
        onClick={(e) => {
          e.stopPropagation();
          onReceived(order.id);
        }}
        className={ACTION_BTN}
        aria-label="Посылка вернулась"
        title="Посылка вернулась"
      >
        <PackageCheck className="h-4 w-4" />
      </button>
    );
  }
  if (allowedTargets(order.status).length === 0) return null;
  return (
    <button
      type="button"
      onPointerDown={stop}
      onClick={(e) => {
        e.stopPropagation();
        onMoveFor({ id: order.id, from: order.status, label: order.customerName });
      }}
      className={ACTION_BTN}
      aria-label="Переместить"
      title="Переместить"
    >
      <ArrowRightLeft className="h-4 w-4" />
    </button>
  );
}

export function MoveSheet({ moveFor, onClose, onMove }: { moveFor: MoveFor | null; onClose: () => void; onMove: (id: string, from: OrderStatus, to: OrderStatus) => void }) {
  return (
    <ActionSheet
      open={!!moveFor}
      title={moveFor ? `Переместить · ${moveFor.label}` : undefined}
      onClose={onClose}
      actions={
        moveFor
          ? allowedTargets(moveFor.from).map((t) => ({
              key: t,
              label: STATUS_ACTION_LABEL[t],
              icon: <span aria-hidden className="mx-1 block h-2 w-2 rounded-full" style={{ background: STATUS_VAR[t] }} />,
              danger: t === "REJECTED",
              onSelect: () => onMove(moveFor.id, moveFor.from, t),
            }))
          : []
      }
    />
  );
}
