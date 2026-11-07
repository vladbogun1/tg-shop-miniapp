"use client";

/**
 * Слой ручного пакета один на экран, а входов в него несколько (кнопки по выбору, полоса «Продолжить», ручной путь
 * у пакета ИИ). Входы только открывают слой; рисует его первый смонтированный хозяин — `ManualBatchLayer` в полосе
 * «Продолжить» экрана или в полосе пакетов оболочки, — поэтому выбор, снятый под слоем, его не закрывает.
 */
import { useEffect, useState, useSyncExternalStore } from "react";

let open = false;
let version = 0;
const owners: symbol[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  version += 1;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function openManualLayer(): void {
  open = true;
  emit();
}

export function closeManualLayer(): void {
  open = false;
  emit();
}

/** Открыт ли слой и рисует ли его этот хозяин (первый смонтированный). */
export function useManualLayer(): { open: boolean; owner: boolean } {
  const [me] = useState(() => Symbol("manual-layer"));
  useEffect(() => {
    owners.push(me);
    emit();
    return () => {
      owners.splice(owners.indexOf(me), 1);
      emit();
    };
  }, [me]);
  useSyncExternalStore(subscribe, () => version, () => 0);
  return { open, owner: owners[0] === me };
}

/** Открыт ли слой — для входов, которые прячут себя под ним. */
export const useManualLayerOpen = (): boolean => {
  useSyncExternalStore(subscribe, () => version, () => 0);
  return open;
};
