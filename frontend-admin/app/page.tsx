"use client";

/**
 * Orders board (route "/").
 *  - Desktop (lg+): kanban with dnd-kit drag-between-columns -> PATCH status.
 *    SHIPPED prompts ТТН, REJECTED a reason, DELIVERED a confirmation. Transitions validated.
 *    Optimistic update + rollback on error.
 *  - Phone: status tabs + list with a "Переместить в…" sheet (MobileBoard).
 *    Only ONE of the two is mounted (matchMedia) — both used to render, hidden by CSS.
 *  - The period applies to the closed columns (Доставлен / Отклонён) only: an active order is never
 *    hidden by it. Closed columns load 20 cards + "Показать ещё".
 *  - Column money totals come from the server.
 *  - Realtime: polling refetch (board query refetchInterval).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Search, RefreshCw } from "lucide-react";
import { ApiError, type OrderCardDto, type OrderStatus } from "@/lib/api";
import { ordersApi, type AdminBoard } from "@/lib/orders-api";
import { CLOSED_STATUSES, STATUS_LABEL, STATUS_ORDER, canTransition, shortId } from "@/lib/orders";
import { useTimeRange, RANGE_OPTIONS } from "@/lib/range";
import { useDebounced } from "@/lib/use-debounced";
import { useIsDesktop } from "@/lib/use-media";
import { useToast } from "@/lib/toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { QueryState } from "@/components/ui/QueryState";
import { KanbanColumn } from "@/components/orders/KanbanColumn";
import { OrderCard } from "@/components/orders/OrderCard";
import { MobileBoard } from "@/components/orders/MobileBoard";
import { OrdersTable } from "@/components/orders/OrdersTable";
import { OrderDrawer } from "@/components/orders/OrderDrawer";
import { StatusChangeModal, type StatusChangePayload } from "@/components/orders/StatusChangeModal";

type View = "board" | "table";

const VIEW_OPTIONS: { value: View; label: string }[] = [
  { value: "board", label: "Доска" },
  { value: "table", label: "Таблица" },
];

/** Cards per closed column before "Показать ещё". */
const CLOSED_PAGE = 20;

/** Transitions that need a modal before they are applied. */
const NEEDS_MODAL: OrderStatus[] = ["SHIPPED", "REJECTED", "DELIVERED"];

export default function BoardPage() {
  const qc = useQueryClient();
  const { push } = useToast();
  const isDesktop = useIsDesktop();
  const [view, setView] = useState<View>("board");
  const [search, setSearch] = useState("");
  const [range, setRange] = useTimeRange();
  const [closedLimit, setClosedLimit] = useState(CLOSED_PAGE);
  const [mobileTab, setMobileTab] = useState<OrderStatus>("NEW");
  const [openId, setOpenId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ order: OrderCardDto; to: OrderStatus } | null>(null);
  const [changing, setChanging] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Debounced so typing does not fire a board load per keystroke.
  const debouncedSearch = useDebounced(search);
  const boardKey = ["board", debouncedSearch, range, closedLimit] as const;
  const boardQ = useQuery({
    queryKey: boardKey,
    queryFn: () => ordersApi.board({ q: debouncedSearch || undefined, range, closedLimit }),
    // The board is the heaviest admin query; 10s polling kept the database busy all day for
    // changes that are rare. Mutations invalidate it immediately, so this is only a safety net
    // for changes made elsewhere (another admin, the bot).
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
  const board = boardQ.data;

  const findCard = useMemo(() => {
    return (id: string | null): OrderCardDto | undefined => {
      if (!board || !id) return undefined;
      for (const s of STATUS_ORDER) {
        const found = board.columns[s]?.find((o) => o.id === id);
        if (found) return found;
      }
      return undefined;
    };
  }, [board]);
  const activeOrder = findCard(activeId);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["board"] });
    qc.invalidateQueries({ queryKey: ["orders-table"] });
  }

  // ---- status change with optimistic update + rollback ----
  async function commitStatus(payload: StatusChangePayload, id: string): Promise<boolean> {
    setChanging(true);
    const prev = qc.getQueryData<AdminBoard>(boardKey);
    if (prev) {
      const next: AdminBoard = {
        columns: { ...prev.columns },
        counts: { ...prev.counts },
        sums: prev.sums ? { ...prev.sums } : undefined,
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
        next.columns[payload.status] = [moved, ...(next.columns[payload.status] ?? [])];
        next.counts[from] = Math.max(0, (next.counts[from] ?? 0) - 1);
        next.counts[payload.status] = (next.counts[payload.status] ?? 0) + 1;
        if (next.sums) {
          next.sums[from] = Math.max(0, (next.sums[from] ?? 0) - moved.totalMinor);
          next.sums[payload.status] = (next.sums[payload.status] ?? 0) + moved.totalMinor;
        }
        qc.setQueryData(boardKey, next);
      }
    }
    try {
      await ordersApi.changeStatus(id, payload);
      push(`Статус: ${STATUS_LABEL[payload.status]}`, "ok");
      setPending(null);
      refresh();
      qc.invalidateQueries({ queryKey: ["dispatch"] });
      qc.invalidateQueries({ queryKey: ["order", id] });
      return true;
    } catch (e) {
      if (prev) qc.setQueryData(boardKey, prev); // rollback
      push(e instanceof ApiError ? e.message : "Ошибка смены статуса", "error");
      return false;
    } finally {
      setChanging(false);
    }
  }

  function requestMove(id: string, from: OrderStatus, to: OrderStatus) {
    if (!canTransition(from, to)) {
      push("Недопустимый переход статуса", "error");
      return;
    }
    const card = findCard(id);
    if (NEEDS_MODAL.includes(to)) {
      if (card) setPending({ order: card, to });
      else push("Заказ не найден на доске — обновите", "error");
    } else {
      void commitStatus({ status: to }, id);
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

  const showMore = () => setClosedLimit((n) => Math.min(300, n + CLOSED_PAGE));
  const loadingMore = boardQ.isFetching && !boardQ.isLoading;
  // The period matters only for the closed columns / the table.
  const showRange = view === "table" || isDesktop || CLOSED_STATUSES.includes(mobileTab);

  const refreshButton = (
    <Button
      variant="surface"
      icon={<RefreshCw className={boardQ.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
      onClick={refresh}
      aria-label="Обновить"
      className="max-lg:w-11 max-lg:px-0"
    >
      <span className="max-lg:hidden">Обновить</span>
    </Button>
  );

  return (
    <div>
      {/* On a phone the title is already in the shell header — no second one. */}
      <div className="hidden lg:block">
        <PageHeader title="Заказы" subtitle="Управляйте заказами на доске или в таблице" actions={refreshButton} />
      </div>

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2 lg:mb-5 lg:gap-3">
        <div className="flex min-w-0 flex-1 basis-[220px] items-center gap-2">
          <div className="min-w-0 flex-1">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск: имя, телефон, товар, ТТН, №…"
              icon={<Search className="h-4 w-4" />}
            />
          </div>
          <div className="lg:hidden">{refreshButton}</div>
        </div>
        {showRange && (
          <div className="thin-scroll flex max-w-full items-center gap-2 overflow-x-auto">
            {view === "board" && (
              <span className="hidden shrink-0 text-[11px] font-bold uppercase tracking-wide text-[var(--text-faint)] xl:inline">
                Период для «Доставлен / Отклонён»:
              </span>
            )}
            <SegmentedControl options={RANGE_OPTIONS} value={range} onChange={setRange} />
          </div>
        )}
        <SegmentedControl options={VIEW_OPTIONS} value={view} onChange={setView} />
      </div>

      {view === "table" ? (
        <OrdersTable search={debouncedSearch} range={range} onOpen={setOpenId} />
      ) : (
        <>
          {/* TodayStrip */}
          <QueryState
            isLoading={boardQ.isLoading || (!board && !boardQ.isError)}
            isError={boardQ.isError && !board}
            error={boardQ.error}
            refetch={boardQ.refetch}
            loadingLabel="Загружаем доску…"
          >
            {board &&
              (isDesktop ? (
                <DndContext
                  sensors={sensors}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onDragCancel={() => setActiveId(null)}
                >
                  <div className="thin-scroll flex gap-4 overflow-x-auto pb-4">
                    {STATUS_ORDER.map((s) => (
                      <KanbanColumn
                        key={s}
                        status={s}
                        orders={board.columns[s] ?? []}
                        count={board.counts?.[s] ?? board.columns[s]?.length ?? 0}
                        sum={board.sums?.[s]}
                        onCardClick={setOpenId}
                        dragActive={activeId !== null}
                        validTarget={!!activeOrder && canTransition(activeOrder.status, s)}
                        onMore={CLOSED_STATUSES.includes(s) ? showMore : undefined}
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
              ) : (
                <MobileBoard
                  board={board}
                  active={mobileTab}
                  onActiveChange={setMobileTab}
                  onOpen={setOpenId}
                  onMove={requestMove}
                  onMore={CLOSED_STATUSES.includes(mobileTab) ? showMore : undefined}
                  loadingMore={loadingMore}
                />
              ))}
          </QueryState>
        </>
      )}

      <OrderDrawer orderId={openId} onClose={() => setOpenId(null)} />

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
              }
            : null
        }
        loading={changing}
        onClose={() => setPending(null)}
        onConfirm={(payload) => (pending ? commitStatus(payload, pending.order.id) : false)}
      />
    </div>
  );
}
