"use client";

/** Окна «Запроса отмены»: подтверждение возврата денег и отказ с комментарием для покупателя. */
import { AlertTriangle } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { money } from "@/lib/money";
import { Button } from "@shop/ui/admin-button";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { Textarea } from "@/components/ui/Textarea";

export function ApproveCancelModal({
  open,
  onClose,
  onConfirm,
  busy,
  loading,
  refundable,
  manual,
  currency,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
  /** Сумма возврата ещё считается. */
  loading: boolean;
  refundable: number;
  manual: number;
  currency: string;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Одобрить отмену"
      footer={
        <>
          <ModalCancel />
          <Button variant="danger" loading={busy} onClick={onConfirm}>
            {refundable > 0 ? `Отменить и вернуть ${money(refundable, currency)}` : "Отменить заказ"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2.5 text-[13.5px] text-[var(--text)]">
        <p>
          Заказ будет <b>отменён</b> (причина «Передумал / отменил»), товары <b>вернутся на склад</b>.
        </p>
        {loading ? (
          <p className="text-[var(--text-muted)]">Считаем сумму возврата…</p>
        ) : refundable > 0 ? (
          <p>
            На карту покупателя через monobank вернётся <b className="tabular text-[var(--accent-hi)]">{money(refundable, currency)}</b>.
          </p>
        ) : (
          <p className="text-[var(--text-muted)]">Онлайн-платежей для возврата нет.</p>
        )}
        {manual > 0 && (
          <p className="flex items-start gap-2 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] px-3 py-2 text-[13px]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warn)]" />
            {money(manual, currency)} получено не через monobank — их нужно вернуть вручную.
          </p>
        )}
        <p className="text-[12px] text-[var(--text-faint)]">Возврат нельзя отменить. Покупатель получит сообщение в Telegram.</p>
      </div>
    </Modal>
  );
}

export function DeclineCancelModal({
  open,
  onClose,
  onConfirm,
  busy,
  comment,
  register,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (comment: string) => void;
  busy: boolean;
  comment: string;
  register: UseFormReturn<{ comment: string }>["register"];
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      dirty={comment.trim() !== ""}
      title="Отклонить запрос отмены"
      footer={
        <>
          <ModalCancel />
          <Button variant="accent" loading={busy} disabled={!comment.trim()} onClick={() => onConfirm(comment.trim())}>
            Отклонить
          </Button>
        </>
      }
    >
      <Textarea
        label="Комментарий для покупателя (обязательно)"
        rows={4}
        maxLength={1000}
        autoFocus
        {...register("comment")}
        placeholder="Например: посылка уже передана в Новую Почту — после получения можно оформить возврат."
      />
      <p className="mt-2 text-[12px] text-[var(--text-faint)]">
        Покупатель увидит его в боте и на странице заказа. Повторно запросить отмену он не сможет — только написать в чат.
      </p>
    </Modal>
  );
}
