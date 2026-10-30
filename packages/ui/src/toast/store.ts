/**
 * Единый тост приложения (docs/ARCHITECTURE-FRONT.md, 2.5): `toast.success/error/info` из любого места,
 * один `<Toaster/>` на приложение. Состояние — маленький внешний стор без зависимостей; React читает его
 * через useSyncExternalStore (см. Toaster).
 */

export type ToastKind = "success" | "error" | "info";

/** Кнопка в тосте, например «Отменить» сразу после обратимого действия. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  action?: ToastAction;
  /** Сколько показывать, мс. По умолчанию — по лицу приложения (с кнопкой дольше: есть что нажать). */
  duration?: number;
}

export interface ToastItem extends ToastOptions {
  id: number;
  kind: ToastKind;
  text: string;
}

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function push(kind: ToastKind, text: string, options?: ToastOptions): number {
  const id = nextId++;
  items = [...items, { id, kind, text, ...options }];
  emit();
  return id;
}

export function dismissToast(id: number): void {
  if (!items.some((t) => t.id === id)) return;
  items = items.filter((t) => t.id !== id);
  emit();
}

/** Убрать все, кроме одного (лицо «покупатель» показывает один тост за раз). */
export function dismissOtherToasts(keepId: number): void {
  if (items.every((t) => t.id === keepId)) return;
  items = items.filter((t) => t.id === keepId);
  emit();
}

export function getToasts(): readonly ToastItem[] {
  return items;
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Для тестов. */
export function clearToasts(): void {
  items = [];
  emit();
}

export const toast = {
  success: (text: string, options?: ToastOptions) => push("success", text, options),
  error: (text: string, options?: ToastOptions) => push("error", text, options),
  info: (text: string, options?: ToastOptions) => push("info", text, options),
  dismiss: dismissToast,
};
