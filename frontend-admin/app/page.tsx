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
 *  - «Едет назад» (V68) is a column, not a status: parcels on their way back. A SHIPPED card dropped
 *    on it = reject with «Посылка едет назад»; a DELIVERED one opens the return wizard. Its cards
 *    are not dragged — the order (or its rest, after a partial return) stays in its status column.
 *  - Realtime: polling refetch (board query refetchInterval).
 */
import { useEffect, useMemo, useRef, useState } from "react";
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
import { Search, RefreshCw, X, Plus } from "lucide-react";
import { payableMinor } from "@shop/shared";
import { ApiError, type OrderCardDto, type OrderStatus } from "@/lib/api";
import { changeStatusConfirmingUnpaid, ordersApi, type AdminBoard } from "@/lib/orders-api";
import { useConfirm } from "@/components/ui/ConfirmModal";
import {
  BOARD_ORDER,
  CLOSED_STATUSES,
  DELIVERED_REJECT_HINT,
  RETURNING,
  STATUS_LABEL,
  STATUS_ORDER,
  canTransition,
  shortId,
  type BoardKey,
} from "@/lib/orders";
import { useOrdersPeriod } from "@/lib/orders-period";
import { OrdersPeriodPicker } from "@/components/orders/OrdersPeriodPicker";
import { useDebounced } from "@/lib/use-debounced";
import { useIsDesktop } from "@/lib/use-media";
import { useFillHeight } from "@/lib/use-fill-height";
import { useToast } from "@/lib/toast";
import { refreshInbox } from "@/lib/inbox";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { QueryState } from "@/components/ui/QueryState";
import { TodayStrip } from "@/components/metrics/TodayStrip";
import { WantedWidget } from "@/components/preorders/WantedWidget";
import { KanbanColumn } from "@/components/orders/KanbanColumn";
import { OrderCard } from "@/components/orders/OrderCard";
import { MobileBoard } from "@/components/orders/MobileBoard";
import { OrdersTable } from "@/components/orders/OrdersTable";
import { OrderDrawer } from "@/components/orders/OrderDrawer";
import { NewOrderModal } from "@/components/orders/NewOrderModal";
import { StatusChangeModal, type StatusChangePayload } from "@/components/orders/StatusChangeModal";

type View = "board" | "table";

const VIEW_OPTIONS: { value: View; label: string }[] = [
  { value: "board", label: "Доска" },
  { value: "table", label: "Таблица" },
];

/** Cards per closed column before "Показать ещё". */
const CLOSED_PAGE = 20;
const CLOSED_MAX = 300;

/** Transitions that need a modal before they are applied. */
const NEEDS_MODAL: OrderStatus[] = ["SHIPPED", "REJECTED", "DELIVERED"];

export default function BoardPage() {
  const qc = useQueryClient();
  const { push } = useToast();
  const [confirm, confirmUi] = useConfirm();
  const isDesktop = useIsDesktop();
  const [view, setView] = useState<View>("board");
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useOrdersPeriod();
  const [closedLimit, setClosedLimit] = useState(CLOSED_PAGE);
  const [mobileTab, setMobileTab] = useState<BoardKey>("NEW");
  const [openId, setOpenId] = useState<string | null>(null);
  /** What the drawer opens with: the return wizard / «Посылка вернулась» (from «Едет назад»). */
  const [openAction, setOpenAction] = useState<"return" | "received" | undefined>(undefined);
  /** The pending reject comes from a drop on «Едет назад»: «Посылка едет назад» is pre-ticked. */
  const [pendingInTransit, setPendingInTransit] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ order: OrderCardDto; to: OrderStatus } | null>(null);
  const [changing, setChanging] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Debounced so typing does not fire a board load per keystroke.
  const debouncedSearch = useDebounced(search);
  const boardKey = ["board", debouncedSearch, period, closedLimit] as const;
  const boardQ = useQuery({
    queryKey: boardKey,
    queryFn: () => ordersApi.board({ q: debouncedSearch || undefined, period, closedLimit }),
    // The board is the heaviest admin query; 10s polling kept the database busy all day for
    // changes that are rare. Mutations invalidate it immediately, so this is only a safety net
    // for changes made elsewhere (another admin, the bot).
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
  // «Сегодня» links land here as /?status=NEW or /?payment=paid. Read once from the URL (no
  // useSearchParams: it would force a Suspense boundary around the whole board).
  const [paidNewOnly, setPaidNewOnly] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status") as BoardKey | null;
    if (status && BOARD_ORDER.includes(status)) setMobileTab(status);
    // "claimed" = an old bookmark from the manual-transfer days; the closest thing now is the same.
    const payment = params.get("payment");
    if (payment === "paid" || payment === "claimed") setPaidNewOnly(true);
  }, []);
  function clearPaidNew() {
    setPaidNewOnly(false);
    window.history.replaceState(null, "", window.location.pathname);
  }

  const rawBoard = boardQ.data;
  // "Оплачены, ждут подтверждения": paid online, still NEW — the admin has to approve them.
  const board = useMemo<AdminBoard | undefined>(() => {
    if (!rawBoard || !paidNewOnly) return rawBoard;
    const columns = Object.fromEntries(
      Object.entries(rawBoard.columns).map(([k, v]) => [k, (v ?? []).filter((o) => o.paid && o.status === "NEW")])
    ) as AdminBoard["columns"];
    const counts = Object.fromEntries(
      Object.entries(columns).map(([k, v]) => [k, v?.length ?? 0])
    ) as AdminBoard["counts"];
    return { ...rawBoard, columns, counts, sums: undefined };
  }, [rawBoard, paidNewOnly]);

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
    // A status change adds/removes rows of «Внимание» (and its menu badge) — not only after 30 s.
    refreshInbox(qc);
  }

  // ---- status change with optimistic update + rollback ----
  async function commitStatus(payload: StatusChangePayload, id: string): Promise<boolean> {
    setChanging(true);
    const prev = qc.getQueryData<AdminBoard>(boardKey);
    if (prev) {
      const next: AdminBoard = {
        columns: { ...prev.columns } as AdminBoard["columns"],
        counts: { ...prev.counts },
        sums: prev.sums ? { ...prev.sums } : undefined,
      };
      let moved: AdminBoard["columns"][OrderStatus][number] | undefined;
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
          next.sums[from] = Math.max(0, (next.sums[from] ?? 0) - payableMinor(moved));
          next.sums[payload.status] = (next.sums[payload.status] ?? 0) + payableMinor(moved);
        }
        qc.setQueryData(boardKey, next);
      }
    }
    try {
      // SHIPPED without the online payment asks the admin first (server code ORDER_UNPAID_SHIP).
      const updated = await changeStatusConfirmingUnpaid(id, payload, confirm);
      if (updated === null) {
        if (prev) qc.setQueryData(boardKey, prev); // declined — put the card back
        return false;
      }
      push(`Статус: ${STATUS_LABEL[payload.status]}`, "ok");
      setPending(null);
      setPendingInTransit(false);
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
      push(from === "DELIVERED" && to === "REJECTED" ? DELIVERED_REJECT_HINT : "Недопустимый переход статуса", "error");
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
    const to = over.id as BoardKey;
    if (!from || from === to) return;
    if (to === RETURNING) {
      sendBack(String(active.id), from);
      return;
    }
    requestMove(String(active.id), from, to);
  }

  /** A card dropped on «Едет назад»: not taken at the post office, or a return of a delivered one. */
  function sendBack(id: string, from: OrderStatus) {
    const card = findCard(id);
    if (from === "SHIPPED" && card) {
      setPendingInTransit(true);
      setPending({ order: card, to: "REJECTED" });
    } else if (from === "DELIVERED") {
      openOrder(id, "return");
    } else {
      push("Назад едет только отправленный или доставленный заказ", "error");
    }
  }

  function openOrder(id: string, action?: "return" | "received") {
    setOpenAction(action);
    setOpenId(id);
  }

  /** Where a dragged card may land; «Едет назад» takes a shipped or a delivered order. */
  function canDrop(card: OrderCardDto | undefined, to: BoardKey): boolean {
    if (!card) return false;
    if (to === RETURNING) return card.status === "SHIPPED" || card.status === "DELIVERED";
    return canTransition(card.status, to);
  }

  // The backend caps a closed column at CLOSED_MAX cards; past it «Показать ещё» would do nothing.
  const showMore = closedLimit < CLOSED_MAX ? () => setClosedLimit((n) => Math.min(CLOSED_MAX, n + CLOSED_PAGE)) : undefined;
  const loadingMore = boardQ.isFetching && !boardQ.isLoading;
  // The period matters only for the closed columns / the table.
  const showRange = view === "table" || isDesktop || (mobileTab !== RETURNING && CLOSED_STATUSES.includes(mobileTab));

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

  const newOrderButton = (
    <Button
      variant="accent"
      icon={<Plus className="h-4 w-4" />}
      onClick={() => setNewOpen(true)}
      aria-label="Новый заказ"
      className="max-lg:w-11 max-lg:px-0"
    >
      <span className="max-lg:hidden">Новый заказ</span>
    </Button>
  );

  const boardRef = useRef<HTMLDivElement>(null);
  useFillHeight(boardRef, view === "board" && isDesktop && !!board);

  return (
    <div>
      {/* On a phone the title is already in the shell header — no second one. */}
      <div className="hidden lg:block">
        <PageHeader title="Заказы" subtitle="Управляйте заказами на доске или в таблице" actions={
            <>
              {refreshButton}
              {newOrderButton}
            </>
          }
        />
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
              // 38 + 2px border = 40 (44 on touch): the same height as the buttons and segments beside it.
            />
          </div>
          <div className="flex items-center gap-2 lg:hidden">
            {refreshButton}
            {newOrderButton}
          </div>
        </div>
        {showRange && (
          <OrdersPeriodPicker
            value={period}
            onChange={setPeriod}
            label={
              view === "board" && (
                <span className="field-label hidden shrink-0 !text-[11px] !text-[var(--text-faint)] xl:inline">
                  Период для «Доставлен / Отклонён»:
                </span>
              )
            }
          />
        )}
        <SegmentedControl options={VIEW_OPTIONS} value={view} onChange={setView} className="h-10 shrink-0 pointer-coarse:h-11" />
      </div>

      {view === "table" ? (
        <OrdersTable search={debouncedSearch} period={period} onOpen={setOpenId} />
      ) : (
        <>
          <TodayStrip />
          <WantedWidget />
          {paidNewOnly && (
            <div className="mb-3 flex items-center gap-2">
              <span className="text-[13px] font-semibold text-[var(--text)]">Показаны только оплаченные новые заказы — подтвердите их</span>
              <Button variant="ghost" icon={<X className="h-4 w-4" />} onClick={clearPaidNew}>
                Сбросить
              </Button>
            </div>
          )}
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
                        onCardClick={(id) => openOrder(id)}
                        dragActive={activeId !== null}
                        validTarget={canDrop(activeOrder, s)}
                        onMore={s !== RETURNING && CLOSED_STATUSES.includes(s) ? showMore : undefined}
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
                  onOpen={(id) => openOrder(id)}
                  onReceived={(id) => openOrder(id, "received")}
                  onMove={requestMove}
                  onMore={mobileTab !== RETURNING && CLOSED_STATUSES.includes(mobileTab) ? showMore : undefined}
                  loadingMore={loadingMore}
                />
              ))}
          </QueryState>
        </>
      )}

      <OrderDrawer
        orderId={openId}
        initialAction={openAction}
        onClose={() => {
          setOpenId(null);
          setOpenAction(undefined);
        }}
      />
      <NewOrderModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={setOpenId} />

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
        loading={changing}
        initialInTransit={pendingInTransit}
        onClose={() => {
          setPending(null);
          setPendingInTransit(false);
        }}
        onConfirm={(payload) => (pending ? commitStatus(payload, pending.order.id) : false)}
      />
      {/* After the status modal so «Отправить без предоплаты?» stacks above it. */}
      {confirmUi}
    </div>
  );
}
