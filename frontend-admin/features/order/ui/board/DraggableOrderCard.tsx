"use client";

/** DraggableOrderCard — wraps OrderCard with dnd-kit draggable. */
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";
import type { AdminOrderCard } from "../../api";
import { OrderCard } from "./OrderCard";

interface Props {
  order: AdminOrderCard;
  onClick: () => void;
  /** Touch screens: «Переместить» in the card header. */
  headerAction?: ReactNode;
}

export function DraggableOrderCard({ order, onClick, headerAction }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: order.id,
    data: { status: order.status },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
      // A finger on a card must still scroll the board; TouchSensor starts the drag after a 220 ms hold.
      className="touch-manipulation"
    >
      <OrderCard order={order} onClick={onClick} dragging={isDragging} headerAction={headerAction} />
    </div>
  );
}
