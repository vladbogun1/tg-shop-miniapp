"use client";

import { requestConfirm, type ConfirmOptions } from "./confirm-store";

/** Подтверждение промисом: `if (!(await confirm({ title: "Удалить?", danger: true }))) return;`. Нужен `<ConfirmHost/>` в провайдерах. */
export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  return requestConfirm;
}
