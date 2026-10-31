"use client";

/**
 * Список сравнения — ключ `compare-v1` в localStorage, только id товаров (см. core/compare.ts: почему только id и как
 * устроены группы). Одинаковый в Mini App и на сайте: список, лимиты, «открыт ли экран», группа для показа первой.
 * Различия — политикой: Mini App при открытии шлёт аналитику и гасит свой тост (`onOpen`), сайт ничего не делает.
 * Экземпляр хука создаёт приложение (`lib/compare.ts`), чтобы у каждого была своя запись в zustand.
 */
import { asStateStorage, localStore } from "@shop/core/storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { COMPARE_STORAGE_KEY, compareAdd, parseCompareEntries, type CompareAddResult, type CompareEntry } from "@shop/core/compare";

export interface CompareState {
  entries: CompareEntry[];
  open: boolean;
  /** Группа, которую показать первой, когда экран открывается (только что добавленный товар). */
  focusGroup: string | null;
  add: (id: string, group: string) => CompareAddResult;
  remove: (id: string) => void;
  removeGroup: (group: string) => void;
  /** Выбрасывает id, которых больше нет в каталоге. */
  prune: (alive: Set<string>) => void;
  openScreen: (group?: string | null) => void;
  closeScreen: () => void;
}

export interface CompareStorePolicy {
  /** Вызывается при открытии экрана, до `set` (число товаров в списке). */
  onOpen?: (entriesCount: number) => void;
}

export function createCompareStore(policy: CompareStorePolicy = {}) {
  return create<CompareState>()(
    persist(
      (set, get) => ({
        entries: [],
        open: false,
        focusGroup: null,
        add: (id, group) => {
          const r = compareAdd(get().entries, id, group);
          if (r.result === "added") set({ entries: r.entries });
          return r.result;
        },
        remove: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
        removeGroup: (group) => set((s) => ({ entries: s.entries.filter((e) => e.group !== group) })),
        prune: (alive) => {
          const next = get().entries.filter((e) => alive.has(e.id));
          if (next.length !== get().entries.length) set({ entries: next });
        },
        openScreen: (group = null) => {
          policy.onOpen?.(get().entries.length);
          set({ open: true, focusGroup: group });
        },
        closeScreen: () => set({ open: false }),
      }),
      {
        name: COMPARE_STORAGE_KEY,
        storage: createJSONStorage(() => asStateStorage(localStore)),
        partialize: (s) => ({ entries: s.entries }),
        merge: (persisted, current) => ({ ...current, entries: parseCompareEntries((persisted as { entries?: unknown })?.entries) }),
      },
    ),
  );
}

export type CompareStore = ReturnType<typeof createCompareStore>;
