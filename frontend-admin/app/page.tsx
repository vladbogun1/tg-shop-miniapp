"use client";

/**
 * Orders board (route "/").
 *  - Desktop (lg+): kanban with dnd-kit drag-between-columns -> PATCH status.
 *    SHIPPED prompts ТТН, REJECTED prompts reason. Transitions validated.
 *    Optimistic update + rollback on error.
 *  - Mobile: status-tab list fallback with "Переместить в…" sheet (MobileBoard).
 *  - Toolbar: search + range filter + Доска/Таблица toggle + refresh.
 *  - Realtime: polling refetch (board query refetchInterval).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Search, LayoutGrid, Table2, RefreshCw } from "lucide-react";
import {
  adminApi,
  ApiError,
  type BoardDto,
  type OrderCardDto,
  type OrderStatus,
} from "@/lib/api";
import { STATUS_ORDER, canTransition } from "@/lib/orders";
import { useTimeRange, RANGE_OPTIONS } from "@/lib/range";
import { useToast } from "@/lib/toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { CenterSpinner } from "@/components/ui/Spinner";
import { staggerContainer, riseItem } from "@/lib/motion";
import { KanbanColumn } from "@/components/orders/KanbanColumn";
import { OrderCard } from "@/components/orders/OrderCard";
import { MobileBoard } from "@/components/orders/MobileBoard";
import { OrdersTable } from "@/components/orders/OrdersTable";
import { OrderDrawer } from "@/components/orders/OrderDrawer";
import {
  StatusChangeModal,
  type StatusChangePayload,
} from "@/components/orders/StatusChangeModal";

type View = "board" | "table";

const VIEW_OPTIONS: { value: View; label: string }[] = [
  { value: "board", label: "Доска" },
  { value: "table", label: "Таблица" },
];

export default function BoardPage() {
  const qc = useQueryClient();
  const { push } = useToast();
  const [view, setView] = useState<View>("board");
  const [search, setSearch] = useState("");
  const [range, setRange] = useTimeRange();
  const [openId, setOpenId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    id: string;
    from: OrderStatus;
    to: OrderStatus;
  } | null>(null);
  const [changing, setChanging] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const boardKey = ["board", search, range] as const;
  const { data: board, isLoading } = useQuery({
    queryKey: boardKey,
    queryFn: () => adminApi.board({ q: search || undefined, range }),
    refetchInterval: 10_000,
    placeholderData: keepPreviousData,
  });

  const activeOrder: OrderCardDto | undefined = useMemo(() => {
    if (!board || !activeId) return undefined;
    for (const s of STATUS_ORDER) {
      const found = board.columns[s]?.find((o) => o.id === activeId);
      if (found) return found;
    }
    return undefined;
  }, [board, activeId]);

  // ---- status change with optimistic update + rollback ----
  async function commitStatus(payload: StatusChangePayload, id: string) {
    setChanging(true);
    const prev = qc.getQueryData<BoardDto>(boardKey);
    // optimistic: move card
    if (prev) {
      const next: BoardDto = {
        columns: { ...prev.columns },
        counts: { ...prev.counts },
      };
      let moved: OrderCardDto | undefined;
      let from: OrderStatus | undefined;
      for (const s of STATUS_ORDER) {
        const idx = (next.columns[s] ?? []).findIndex((o) => o.id === id);
        if (idx >= 0) {
          moved = { ...next.columns[s][idx], status: payload.status };
          next.columns[s] = next.columns[s].filter((o) => o.id !== id);
          from = s;
          break;
        }
      }
      if (moved && from) {
        next.columns[payload.status] = [
          moved,
          ...(next.columns[payload.status] ?? []),
        ];
        next.counts[from] = Math.max(0, (next.counts[from] ?? 0) - 1);
        next.counts[payload.status] = (next.counts[payload.status] ?? 0) + 1;
        qc.setQueryData(boardKey, next);
      }
    }
    try {
      await adminApi.changeStatus(id, payload);
      push("Статус обновлён", "ok");
      setPending(null);
      qc.invalidateQueries({ queryKey: ["board"] });
      qc.invalidateQueries({ queryKey: ["orders-table"] });
      qc.invalidateQueries({ queryKey: ["order", id] });
    } catch (e) {
      if (prev) qc.setQueryData(boardKey, prev); // rollback
      push(e instanceof ApiError ? e.message : "Ошибка смены статуса", "error");
    } finally {
      setChanging(false);
    }
  }

  function requestMove(id: string, from: OrderStatus, to: OrderStatus) {
    if (!canTransition(from, to)) {
      push("Недопустимый переход статуса", "error");
      return;
    }
    if (to === "SHIPPED" || to === "REJECTED") {
      setPending({ id, from, to });
    } else {
      commitStatus({ status: to }, id);
    }
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const from = (active.data.current?.status as OrderStatus) ?? null;
    const to = over.id as OrderStatus;
    if (!from || from === to) return;
    requestMove(String(active.id), from, to);
  }

  return (
    <div>
      <PageHeader
        title="Заказы"
        subtitle="Управляйте заказами на доске или в таблице"
        actions={
          <Button
            variant="surface"
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={() => {
              qc.invalidateQueries({ queryKey: ["board"] });
              qc.invalidateQueries({ queryKey: ["orders-table"] });
            }}
          >
            Обновить
          </Button>
        }
      />

      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="min-w-[220px] flex-1">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск: имя, товар, ТТН, №…"
            icon={<Search className="h-4 w-4" />}
          />
        </div>
        <div className="thin-scroll max-w-full overflow-x-auto">
          <SegmentedControl
            options={RANGE_OPTIONS}
            value={range}
            onChange={setRange}
          />
        </div>
        <SegmentedControl
          options={VIEW_OPTIONS}
          value={view}
          onChange={setView}
        />
      </div>

      {view === "table" ? (
        <OrdersTable search={search} range={range} onOpen={setOpenId} />
      ) : isLoading || !board ? (
        <CenterSpinner label="Загружаем доску…" />
      ) : (
        <>
          {/* Desktop kanban */}
          <div className="hidden lg:block">
            <DndContext
              sensors={sensors}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragCancel={() => setActiveId(null)}
            >
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="thin-scroll flex gap-4 overflow-x-auto pb-4"
              >
                {STATUS_ORDER.map((s) => (
                  <motion.div key={s} variants={riseItem}>
                    <KanbanColumn
                      status={s}
                      orders={board.columns[s] ?? []}
                      count={board.counts?.[s] ?? board.columns[s]?.length ?? 0}
                      onCardClick={setOpenId}
                      dragActive={activeId !== null}
                      validTarget={
                        !!activeOrder && canTransition(activeOrder.status, s)
                      }
                    />
                  </motion.div>
                ))}
              </motion.div>
              <DragOverlay>
                {activeOrder ? (
                  <div className="w-72">
                    <OrderCard order={activeOrder} dragging />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>

          {/* Mobile fallback */}
          <div className="lg:hidden">
            <MobileBoard board={board} onOpen={setOpenId} onMove={requestMove} />
          </div>
        </>
      )}

      <OrderDrawer orderId={openId} onClose={() => setOpenId(null)} />

      <StatusChangeModal
        open={pending !== null}
        target={pending?.to ?? null}
        loading={changing}
        onClose={() => setPending(null)}
        onConfirm={(payload) => pending && commitStatus(payload, pending.id)}
      />
    </div>
  );
}
