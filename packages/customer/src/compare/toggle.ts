import { COMPARE_MAX_PER_GROUP, COMPARE_MAX_TOTAL } from "@shop/core/compare";
import type { CompareStore } from "./store";

/** Как приложение сообщает, что произошло: тосты и аналитика у Mini App и сайта свои. */
export interface CompareToggleUi {
  removed(): void;
  /** `n` — сколько товаров этой группы теперь в списке; тост всегда с кнопкой «Открыть» (иначе при втором добавлении менялся размер). */
  added(n: number, group: string): void;
  groupFull(max: number): void;
  totalFull(max: number): void;
  /** Только после успешного добавления. */
  track(productId: string): void;
}

/** Добавить/убрать по кнопке + сообщение о результате. true — товар в списке после вызова. */
export function toggleCompareIn(store: CompareStore, ui: CompareToggleUi, id: string, group: string): boolean {
  const s = store.getState();
  if (s.entries.some((e) => e.id === id)) {
    s.remove(id);
    ui.removed();
    return false;
  }
  const result = s.add(id, group);
  if (result === "added") {
    ui.track(id);
    ui.added(store.getState().entries.filter((e) => e.group === group).length, group);
    return true;
  }
  if (result === "group-full") ui.groupFull(COMPARE_MAX_PER_GROUP);
  if (result === "total-full") ui.totalFull(COMPARE_MAX_TOTAL);
  return false;
}
