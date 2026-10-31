/**
 * Модель шагов жизненного цикла заказа NEW → APPROVED → SHIPPED → DELIVERED (REJECTED — отдельный блок).
 * Вёрстка у приложений разная (Mini App — колонка с пульсом, сайт — колонка/строка с датами); общее — какой шаг
 * пройден, какой текущий, какого он цвета и когда наступил.
 */
import { ORDER_STATUS_COLOR, ORDER_TIMELINE } from "@shop/core/orders";
import type { OrderDetail, OrderStatus } from "@shop/core/types";

export type TimelineOrder = Pick<OrderDetail, "status"> &
  Partial<Pick<OrderDetail, "createdAt" | "approvedAt" | "shippedAt" | "deliveredAt" | "rejectedAt">>;

export interface TimelineStep {
  status: OrderStatus;
  index: number;
  /** Шаг пройден или текущий. */
  done: boolean;
  current: boolean;
  last: boolean;
  /** Линия под шагом закрашена: следующий шаг тоже достигнут. */
  linkDone: boolean;
  color: string;
  /** Когда заказ достиг шага; сайт показывает под названием. */
  stamp: string | null | undefined;
}

/** Время достижения шага по полям заказа. */
export function stampOf(order: TimelineOrder, s: OrderStatus): string | null | undefined {
  switch (s) {
    case "NEW":
      return order.createdAt;
    case "APPROVED":
      return order.approvedAt;
    case "SHIPPED":
      return order.shippedAt;
    case "DELIVERED":
      return order.deliveredAt;
    default:
      return null;
  }
}

/** Шаги по порядку; для отклонённого заказа шагов нет — экран рисует отдельный блок. */
export function timelineSteps(order: TimelineOrder): TimelineStep[] | null {
  if (order.status === "REJECTED") return null;
  const currentIdx = ORDER_TIMELINE.indexOf(order.status);
  return ORDER_TIMELINE.map((status, index) => ({
    status,
    index,
    done: index <= currentIdx,
    current: index === currentIdx,
    last: index === ORDER_TIMELINE.length - 1,
    linkDone: index < currentIdx,
    color: ORDER_STATUS_COLOR[status],
    stamp: stampOf(order, status),
  }));
}
