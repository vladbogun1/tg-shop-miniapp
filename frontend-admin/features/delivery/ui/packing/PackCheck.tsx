"use client";

/**
 * Под «Упаковано»: что помешает создать (изменить) ТТН с выбранной коробкой — до нажатия, а не отказом Новой почты.
 * Проблемы держат кнопку; предупреждения только подсказывают. Проверка та же, что у окна ТТН, с пакетом,
 * сложенным до ячейки поштомата, — поэтому не расходится с самим «Упаковано».
 */
import { useDebounced } from "@/lib/use-debounced";
import type { ConfirmBoxBody } from "../../model/types";
import { usePackCheck } from "../../queries-packing";
import { Notice } from "../parts";

const CHECK_DEBOUNCE_MS = 400;

/** Проблемы выбора (пусто — можно жать); `pending` — проверка ещё не ответила на текущий выбор. */
export function usePackProblems(orderId: string, body: ConfirmBoxBody | null) {
  const json = body ? JSON.stringify(body) : null;
  const debounced = useDebounced(json, CHECK_DEBOUNCE_MS);
  const q = usePackCheck(orderId, debounced);
  return {
    problems: q.data?.problems ?? [],
    warnings: q.data?.warnings ?? [],
    pending: !!json && (debounced !== json || q.isFetching),
  };
}

export function PackProblems({ problems, warnings }: { problems: string[]; warnings: string[] }) {
  return (
    <>
      {problems.length > 0 && <Notice tone="danger" title="ТТН не создастся — сначала исправьте" items={problems} />}
      {warnings.length > 0 && <Notice tone="warn" title="Обратите внимание" items={warnings} />}
    </>
  );
}

/** Под отказом Новой почты: что упаковщик может поправить сам, а что — только главный админ. */
export function NpRefusalHint() {
  return (
    <p className="text-[12px] leading-snug text-[var(--text-muted)]">
      Имя, телефон и отделение получателя правятся в «Изменить» заказа; коробка и вес — здесь. Объявленную стоимость,
      описание груза и отделение отправки меняет главный админ.
    </p>
  );
}
