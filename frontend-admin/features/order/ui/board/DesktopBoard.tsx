"use client";

import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { useRef } from "react";
import { useFillHeight } from "@/lib/use-fill-height";
import type { AdminBoard, AdminOrderCard } from "../../api";
import { canDrop, isClosedColumn } from "../../model/board";
import { BOARD_ORDER, RETURNING } from "../../model/status";
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
}

/** Kanban with drag-between-columns (lg+). */
export function DesktopBoard({ board, activeId, activeOrder, loadingMore, onMore, onOpen, onDragStart, onDragEnd, onDragCancel }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const boardRef = useRef<HTMLDivElement>(null);
  useFillHeight(boardRef, true);

  return (
    <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => onDragStart(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
      {/* The board fills the screen: one horizontal scrollbar at its bottom, each column
          scrolls on its own, the page stays put. */}
      <div ref={boardRef} className="thin-scroll flex items-stretch gap-4 overflow-x-auto pb-3">
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
          />
        ))}
      </div>
      <DragOverlay>
        {activeOrder ? (
          <div className="w-72">
            <OrderCard order={activeOrder} dragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
