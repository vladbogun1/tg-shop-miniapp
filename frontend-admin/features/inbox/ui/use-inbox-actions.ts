"use client";

import { ApiError } from "@shop/core/errors";
import { toast } from "@shop/ui/toast";
import { useQueryClient } from "@tanstack/react-query";
import { inboxApi } from "../api";
import { inboxKeys } from "../keys";
import { snoozeLabel, withoutItem } from "../model/inbox";
import type { Inbox, InboxItem, SnoozePreset } from "../model/types";

/**
 * «Отложить» / «Разобрано» / «Отменить» — оптимистично: строка уходит из кэша сразу, при ошибке возвращается.
 * Это явный код, а не useApiMutation: у того один «замок двойного нажатия» на хук, и второй «Отложить» на
 * другой строке, пока летит первый, молча терялся бы; тост здесь ещё с кнопкой «Отменить», а список
 * перечитывается и после успеха, и после ошибки.
 */
export function useInboxActions() {
  const qc = useQueryClient();
  const refetch = () => qc.invalidateQueries({ queryKey: inboxKeys.all() });

  async function restore(item: InboxItem) {
    try {
      await inboxApi.restore(item);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Не удалось вернуть");
    }
    refetch();
  }

  /** Убирает строку из кэша, зовёт сервер; `onOk` показывает тост, ошибка откатывает кэш. */
  async function optimistic(
    item: InboxItem,
    snoozed: boolean,
    call: () => Promise<void>,
    failText: string,
  ) {
    await qc.cancelQueries({ queryKey: inboxKeys.all() });
    const before = qc.getQueryData<Inbox>(inboxKeys.all());
    if (before) qc.setQueryData(inboxKeys.all(), withoutItem(before, item, snoozed));
    try {
      await call();
    } catch (e) {
      if (before) qc.setQueryData(inboxKeys.all(), before);
      toast.error(e instanceof ApiError ? e.message : failText);
    }
    refetch();
  }

  const undo = (item: InboxItem) => ({ label: "Отменить", onClick: () => void restore(item) });

  function snooze(item: InboxItem, preset: SnoozePreset) {
    return optimistic(
      item,
      true,
      async () => {
        const res = await inboxApi.snooze(item, preset);
        toast.success(`Отложено ${snoozeLabel(res?.until, preset) ?? ""}`.trim(), { action: undo(item) });
      },
      "Не удалось отложить",
    );
  }

  function dismiss(item: InboxItem) {
    return optimistic(
      item,
      false,
      async () => {
        await inboxApi.dismiss(item);
        toast.success("Разобрано", { action: undo(item) });
      },
      "Не удалось отметить",
    );
  }

  return { snooze, dismiss };
}
