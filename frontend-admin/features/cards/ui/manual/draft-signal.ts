"use client";

/**
 * Черновик ручного пакета лежит в localStorage, а входов в пакет на экране несколько (кнопка, полоса «Продолжить»):
 * закрытие слоя сообщает остальным, что черновик мог поменяться, и они перечитывают его.
 */
import { useSyncExternalStore } from "react";

let version = 0;
const listeners = new Set<() => void>();

export function draftChanged(): void {
  version += 1;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export const useDraftVersion = (): number => useSyncExternalStore(subscribe, () => version, () => 0);
