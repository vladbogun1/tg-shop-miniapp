"use client";

import { Button } from "@shop/ui/admin-button";
import { useForm } from "@shop/ui/form";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { Textarea } from "@/components/ui/Textarea";
import { CANCEL_REASON_MAX, cancelReasonTooLong, type Batch } from "@/features/procurement";
import { cn } from "@/lib/cn";
import { useCancelBatch } from "../queries";

const CHOICES = [
  {
    close: false,
    title: "Оставить очередь",
    hint: "Докупаем товар в другой поставке: люди продолжат ждать, брони не трогаем.",
  },
  {
    close: true,
    title: "Закрыть очередь",
    hint: "Ждущие выйдут из очереди, брони освободятся.",
  },
];

/** Отмена поставки (вариант B макета): выбор «Оставить / Закрыть очередь» и число затронутых ждущих. */
export function CancelBatchModal({ open, onClose, batch, waiting }: { open: boolean; onClose: () => void; batch: Batch; waiting: number }) {
  const form = useForm<{ closeQueue: boolean; reason: string }>({ defaultValues: { closeQueue: false, reason: "" } });
  const closeQueue = form.watch("closeQueue");
  const reason = form.watch("reason");
  const tooLong = cancelReasonTooLong(reason);
  const cancel = useCancelBatch(batch.id, onClose);
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Отменить поставку?"
      footer={
        <>
          <ModalCancel>Назад</ModalCancel>
          <Button variant="danger" loading={cancel.isPending} disabled={tooLong} onClick={() => cancel.mutate({ closeQueue, reason })}>
            Отменить поставку
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-[14px] text-[var(--text-muted)]">
        <p>
          «{batch.title}» перестанет быть открытой. Ждущих сейчас: <b className="tabular text-[var(--text)]">{waiting}</b> чел. Что сделать с их очередью?
        </p>
        <div role="radiogroup" aria-label="Что делать с очередью" className="flex flex-col gap-2">
          {CHOICES.map((c) => {
            const on = closeQueue === c.close;
            return (
              <label
                key={String(c.close)}
                className={cn(
                  "flex min-h-[44px] cursor-pointer items-start gap-3 rounded-[var(--r-md)] border p-3",
                  on ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] hover:border-[var(--line-strong)]",
                )}
              >
                <input
                  type="radio"
                  name="close-queue"
                  checked={on}
                  onChange={() => form.setValue("closeQueue", c.close)}
                  className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[var(--accent)]"
                />
                <span className="min-w-0">
                  <span className="block font-semibold text-[var(--text)]">{c.title}</span>
                  <span className="block text-[12.5px]">{c.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
        <Textarea
          label="Причина (необязательно)"
          rows={2}
          maxLength={CANCEL_REASON_MAX + 100}
          value={reason}
          onChange={(e) => form.setValue("reason", e.target.value)}
          placeholder="Например: завод закрылся, переносим на следующую партию"
          hint={tooLong ? `Слишком длинно: не больше ${CANCEL_REASON_MAX} знаков` : "Видна в поставке и в журнале действий."}
        />
      </div>
    </Modal>
  );
}
