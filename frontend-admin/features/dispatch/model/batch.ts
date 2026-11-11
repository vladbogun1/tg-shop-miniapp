/**
 * «Створити ТТН для всіх» и печать этикеток на экране «Отправка»: какие заказы в работе.
 * Галочки — подмножество показанных заказов Новой Почты; без галочек работаем со всеми показанными.
 */
import type { AdminDispatchOrder } from "@/features/order";

type BatchOrder = Pick<AdminDispatchOrder, "id" | "deliveryMethod" | "shipmentStage" | "shipmentOrigin" | "shipmentStaleReasons">;

export function isNovaPoshta(o: Pick<AdminDispatchOrder, "deliveryMethod">): boolean {
  return o.deliveryMethod === "NOVA_POSHTA";
}

export function isStale(o: Pick<AdminDispatchOrder, "shipmentStaleReasons">): boolean {
  return (o.shipmentStaleReasons?.length ?? 0) > 0;
}

/** Своя, живая и не устаревшая ТТН: этикетку можно клеить (устаревшую сервер тоже не отдаёт). */
export function isPrintable(o: BatchOrder): boolean {
  return o.shipmentOrigin === "API" && !!o.shipmentStage && o.shipmentStage !== "CANCELLED" && !isStale(o);
}

export interface BatchScope<T extends BatchOrder> {
  /** Заказы НП на экране (после фильтра и поиска). */
  np: T[];
  /** Отмеченные из них. */
  selected: T[];
  /** Без ТТН — для «Створити ТТН для всіх». */
  toCreate: T[];
  /** С этикеткой — для печати. */
  toPrint: T[];
  /** С устаревшей ТТН — их не печатаем, а пересоздаём. */
  staleCount: number;
}

export function batchScope<T extends BatchOrder>(visible: T[], ticked: ReadonlySet<string>): BatchScope<T> {
  const np = visible.filter(isNovaPoshta);
  const selected = np.filter((o) => ticked.has(o.id));
  const scope = selected.length > 0 ? selected : np;
  return {
    np,
    selected,
    toCreate: scope.filter((o) => !o.shipmentStage),
    toPrint: scope.filter(isPrintable),
    staleCount: scope.filter(isStale).length,
  };
}

/** Отделение отправки: выбранное вручную, если оно ещё есть у отправителя, иначе — по умолчанию. */
export function pickBranch(chosen: string | null, branches: { ref: string }[], defaultRef: string | null | undefined): string | null {
  if (chosen && branches.some((b) => b.ref === chosen)) return chosen;
  return defaultRef ?? branches[0]?.ref ?? null;
}
