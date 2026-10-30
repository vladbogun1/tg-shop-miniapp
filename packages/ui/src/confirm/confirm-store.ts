/**
 * Подтверждение как промис (docs/ARCHITECTURE-FRONT.md, 2.5): вместо `window.confirm`, который выглядит чужеродно и
 * может вообще не показаться внутри WebView Telegram.
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "Удалить?", danger: true }))) return;
 *
 * Логика вопроса — здесь, без React (тестируется отдельно); вид рисует `<ConfirmHost/>`.
 */
import type { ReactNode } from "react";

export interface ConfirmOptions {
  title: ReactNode;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Красная кнопка подтверждения для необратимых действий. */
  danger?: boolean;
}

export interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (ok: boolean) => void;
}

let pending: PendingConfirm | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Задаёт вопрос. Второй вопрос, пока открыт первый, отвечает на первый «нет». */
export function requestConfirm(options: ConfirmOptions): Promise<boolean> {
  pending?.resolve(false);
  return new Promise<boolean>((resolve) => {
    pending = { options, resolve };
    emit();
  });
}

/** Ответ человека (кнопки, Esc, фон). Без открытого вопроса — ничего не делает. */
export function answerConfirm(ok: boolean): void {
  const current = pending;
  if (!current) return;
  pending = null;
  emit();
  current.resolve(ok);
}

export function getPendingConfirm(): PendingConfirm | null {
  return pending;
}

export function subscribeConfirm(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
