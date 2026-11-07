"use client";

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useRef, useState } from "react";
import type { OrderStatus } from "@shop/core/types";
import { useMediaQuery } from "@shop/ui/use-media";
import { useFillHeight } from "@/lib/use-fill-height";
import type { AdminBoard, AdminOrderCard } from "../../api";
import { canDrop, isClosedColumn } from "../../model/board";
import { BOARD_ORDER, RETURNING } from "../../model/status";
import { CardAction, MoveSheet, type MoveFor } from "./CardActions";
import { KanbanColumn } from "./KanbanColumn";
import { OrderCard } from "./OrderCard";

interface Props {
  board: AdminBoard;
  activeId: string | null;
  activeOrder: AdminOrderCard | undefined;
  loadingMore: boolean;
  /** Undefined once a closed column reached the server's cap. */
  onMore?: () => void;
  onOpen: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: (e: DragEndEvent) => void;
  onDragCancel: () => void;
  /** Touch screens: «Посылка вернулась» / «Переместить» buttons on the cards (a long-press drag is not obvious). */
  onReceived: (id: string) => void;
  onMove: (id: string, from: OrderStatus, to: OrderStatus) => void;
}

/**
 * Kanban with drag-between-columns (tablet and up). The board is ONE scroll container that fills the
 * screen below the toolbar: it scrolls vertically as a whole (the column heads stay pinned) and
 * sideways when the columns do not fit; the page itself stays put. A finger scrolls it too: a drag
 * starts only after a short press (TouchSensor), a mouse drags after 6px.
 */
export function DesktopBoard({ board, activeId, activeOrder, loadingMore, onMore, onOpen, onDragStart, onDragEnd, onDragCancel, onReceived, onMove }: Props) {
  const touch = useMediaQuery("(pointer: coarse)", false);
  const [moveFor, setMoveFor] = useState<MoveFor | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } })
  );
  const boardRef = useRef<HTMLDivElement>(null);
  useFillHeight(boardRef, true);

  return (
    <DndContext
      sensors={sensors}
      autoScroll={{ threshold: { x: 0.1, y: 0.2 }, acceleration: 14 }}
      onDragStart={(e: DragStartEvent) => onDragStart(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div ref={boardRef} className="thin-scroll snap-x snap-proximity overflow-auto overscroll-contain rounded-[var(--r-lg)]">
        {/* min-h-full: the columns are as tall as the tallest one, so a short column is a drop zone to the bottom. */}
        <div className="flex min-h-full min-w-min items-stretch gap-4 pb-1">
          {BOARD_ORDER.map((s) => (
            <KanbanColumn
              key={s}
              status={s}
              orders={board.columns[s] ?? []}
              count={board.counts?.[s] ?? board.columns[s]?.length ?? 0}
              sum={s === RETURNING ? undefined : board.sums?.[s]}
              onCardClick={onOpen}
              dragActive={activeId !== null}
              validTarget={canDrop(activeOrder, s)}
              onMore={isClosedColumn(s) ? onMore : undefined}
              loadingMore={loadingMore}
              cardAction={touch ? (o) => <CardAction order={o} returning={s === RETURNING} onReceived={onReceived} onMoveFor={setMoveFor} /> : undefined}
            />
          ))}
        </div>
      </div>
      <DragOverlay>
        {activeOrder ? (
          <div className="w-72">
            <OrderCard order={activeOrder} dragging />
          </div>
        ) : null}
      </DragOverlay>
      <MoveSheet moveFor={moveFor} onClose={() => setMoveFor(null)} onMove={onMove} />
    </DndContext>
  );
}
