"use client";

/** DraggableOrderCard — wraps OrderCard with dnd-kit draggable. */
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { OrderCardDto } from "@/lib/api";
import { OrderCard } from "./OrderCard";

interface Props {
  order: OrderCardDto;
  onClick: () => void;
}

export function DraggableOrderCard({ order, onClick }: Props) {
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
      className="touch-none"
    >
      <OrderCard order={order} onClick={onClick} dragging={isDragging} />
    </div>
  );
}
