"use client";

import { Button } from "@shop/ui/admin-button";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import type { AiFeature } from "../../api";
import { confirmView } from "../../model/batch-view";
import { useBatchEstimate } from "../../queries-batch";

/**
 * Подтверждение пакета. Админ видит штуки и минуты; финансист ещё и диапазон в гривнах и «хватит ли лимита».
 * Запуск — по кнопке, один раз: `onStart` ставит пакет в очередь, окно закрывает вызывающий.
 */
export function BatchConfirm(p: {
  open: boolean;
  onClose: () => void;
  feature: AiFeature;
  count: number;
  finance: boolean;
  starting: boolean;
  onStart: () => void;
  /** Что лежит в пакете, для заголовка: «карточек». */
  noun?: string;
  /** Сообщение, если запуск не удался (сервер ответил отказом). */
  error?: string | null;
}) {
  const est = useBatchEstimate(p.feature, p.count, p.open);
  const v = confirmView(p.count, est.data, p.finance, p.noun);
  return (
    <Modal
      open={p.open}
      onClose={p.onClose}
      size="sm"
      title="Заполнить с ИИ пакетом"
      footer={
        <div className="flex w-full justify-end gap-2">
          <ModalCancel disabled={p.starting} />
          <Button variant="accent" onClick={p.onStart} loading={p.starting} data-testid="batch-start">
            Запустить
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-2 text-[13px]" data-testid="batch-confirm">
        <div className="text-[15px] font-semibold text-[var(--ink)]">{v.lead}</div>
        <p className="leading-snug text-[var(--text-muted)]">
          ИИ заполнит карточки по очереди, по две-три одновременно. Окно можно закрыть: ход виден в полосе вверху, готовое ждёт проверки. Ничего не
          сохранится, пока вы не примете результат.
        </p>
        {v.money && <p className="tabular-nums text-[var(--text)]">{v.money}</p>}
        {v.warn && <p className="text-[var(--warn)]">{v.warn}</p>}
        {p.error && <p className="font-semibold text-[var(--danger-ink)]">{p.error}</p>}
      </div>
    </Modal>
  );
}
