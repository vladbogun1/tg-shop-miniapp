/**
 * Чистая логика доски заказов: что можно перетащить куда, оптимистичный перенос карточки, «только
 * оплаченные новые», разбор адреса «Сегодня → /?status=NEW». Без React.
 */
import { payableMinor } from "@shop/core/orders";
import type { OrderStatus } from "@shop/core/types";
import type { AdminBoard, AdminOrderCard } from "../api";
import { BOARD_ORDER, CLOSED_STATUSES, DELIVERED_REJECT_HINT, RETURNING, STATUS_ORDER, canTransition, returningMinor, type BoardKey } from "./status";

/** Cards per closed column before "Показать ещё". */
export const CLOSED_PAGE = 20;
/** Бэкенд режет закрытую колонку на CLOSED_MAX карточек; дальше «Показать ещё» ничего не даст. */
export const CLOSED_MAX = 300;

/** Transitions that need a modal before they are applied. */
export const NEEDS_MODAL: OrderStatus[] = ["SHIPPED", "REJECTED", "DELIVERED"];

/** Закрытая колонка («Доставлен» / «Отклонён»): к ней применяется период и «Показать ещё». */
export function isClosedColumn(s: BoardKey): boolean {
  return s !== RETURNING && CLOSED_STATUSES.includes(s);
}

/** «Оплачены, ждут подтверждения»: оплачены онлайн, ещё NEW — админ должен их одобрить. */
export function onlyPaidNew(board: AdminBoard): AdminBoard {
  const columns = Object.fromEntries(
    Object.entries(board.columns).map(([k, v]) => [k, (v ?? []).filter((o) => o.paid && o.status === "NEW")])
  ) as AdminBoard["columns"];
  const counts = Object.fromEntries(Object.entries(columns).map(([k, v]) => [k, v?.length ?? 0])) as AdminBoard["counts"];
  return { ...board, columns, counts, sums: undefined };
}

export function findCard(board: AdminBoard | undefined, id: string | null): AdminOrderCard | undefined {
  if (!board || !id) return undefined;
  for (const s of STATUS_ORDER) {
    const found = board.columns[s]?.find((o) => o.id === id);
    if (found) return found;
  }
  return undefined;
}

/** Where a dragged card may land; «Едет назад» takes a shipped or a delivered order. */
export function canDrop(card: AdminOrderCard | undefined, to: BoardKey): boolean {
  if (!card) return false;
  if (to === RETURNING) return card.status === "SHIPPED" || card.status === "DELIVERED";
  return canTransition(card.status, to);
}

export type MoveVerdict = { kind: "refuse"; text: string } | { kind: "modal" } | { kind: "commit" };

/** Что делать с переходом статуса: отказать, спросить в окне или сразу применить. */
export function moveVerdict(from: OrderStatus, to: OrderStatus): MoveVerdict {
  if (!canTransition(from, to)) {
    return { kind: "refuse", text: from === "DELIVERED" && to === "REJECTED" ? DELIVERED_REJECT_HINT : "Недопустимый переход статуса" };
  }
  return NEEDS_MODAL.includes(to) ? { kind: "modal" } : { kind: "commit" };
}

/** Карточка, брошенная на «Едет назад»: что из этого выйдет. */
export type SendBackPlan = "reject-in-transit" | "return" | "refuse";

export function sendBackPlan(from: OrderStatus, hasCard: boolean): SendBackPlan {
  if (from === "SHIPPED" && hasCard) return "reject-in-transit";
  if (from === "DELIVERED") return "return";
  return "refuse";
}

/**
 * Оптимистичный перенос карточки `id` в колонку `to`: счётчики и суммы колонок тоже. null — карточки нет
 * на доске (ничего не меняем).
 */
export function moveCard(prev: AdminBoard, id: string, to: OrderStatus): AdminBoard | null {
  const next: AdminBoard = {
    columns: { ...prev.columns } as AdminBoard["columns"],
    counts: { ...prev.counts },
    sums: prev.sums ? { ...prev.sums } : undefined,
  };
  let moved: AdminOrderCard | undefined;
  let from: OrderStatus | undefined;
  for (const s of STATUS_ORDER) {
    const idx = (next.columns[s] ?? []).findIndex((o) => o.id === id);
    if (idx >= 0) {
      moved = { ...next.columns[s][idx], status: to };
      next.columns[s] = next.columns[s].filter((o) => o.id !== id);
      from = s;
      break;
    }
  }
  if (!moved || !from) return null;
  next.columns[to] = [moved, ...(next.columns[to] ?? [])];
  next.counts[from] = Math.max(0, (next.counts[from] ?? 0) - 1);
  next.counts[to] = (next.counts[to] ?? 0) + 1;
  if (next.sums) {
    next.sums[from] = Math.max(0, (next.sums[from] ?? 0) - payableMinor(moved));
    next.sums[to] = (next.sums[to] ?? 0) + payableMinor(moved);
  }
  return next;
}

/** «Сегодня» ведёт на /?status=NEW или /?payment=paid. */
export function parseBoardLink(search: string): { tab?: BoardKey; paidNewOnly: boolean } {
  const params = new URLSearchParams(search);
  const status = params.get("status") as BoardKey | null;
  // "claimed" = an old bookmark from the manual-transfer days; the closest thing now is the same.
  const payment = params.get("payment");
  return {
    tab: status && BOARD_ORDER.includes(status) ? status : undefined,
    paidNewOnly: payment === "paid" || payment === "claimed",
  };
}

/** Итоги колонки «Едет назад»: единицы и сумма в пути. */
export function returningTotals(orders: AdminOrderCard[]): { units: number; minor: number } {
  return {
    units: orders.reduce((acc, o) => acc + (o.returningUnits ?? 0), 0),
    minor: orders.reduce((acc, o) => acc + returningMinor(o), 0),
  };
}

/** Деньги колонки: серверная сумма, а без неё — по загруженным карточкам. */
export function columnTotal(orders: AdminOrderCard[], sum?: number): number {
  return sum ?? orders.reduce((acc, o) => acc + payableMinor(o), 0);
}
