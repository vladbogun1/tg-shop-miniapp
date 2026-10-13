"use client";

/**
 * «🎁 Выдать кейс» (POST /api/admin/orders/{id}/gift-case): the server draws the prize right away
 * among the case prizes in stock and adds it to the order for free (status SEALED); the customer
 * opens the case after paying. The admin only confirms and chooses whether the bot tells the customer.
 */
import { useEffect, useState } from "react";
import { Modal, ModalCancel } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export function GiftCaseModal({
  open,
  loading,
  onClose,
  onConfirm,
}: {
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (notifyCustomer: boolean) => void;
}) {
  const [notify, setNotify] = useState(true);
  useEffect(() => {
    if (open) setNotify(true);
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="🎁 Выдать кейс?"
      footer={
        <>
          <ModalCancel />
          <Button variant="accent" loading={loading} onClick={() => onConfirm(notify)}>
            Выдать кейс
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <img src="/case/case-closed-sm.webp" alt="" width={64} height={64} className="h-12 w-12 shrink-0 object-contain" />
          <p className="text-[14px] leading-snug text-[var(--text-muted)]">
            Сервер сразу разыграет приз среди призов кейса в наличии и добавит его в заказ бесплатно. Покупатель откроет кейс
            после оплаты.
          </p>
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[14px] font-semibold text-[var(--text)]">
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 accent-[var(--accent)]"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
          />
          Сообщить покупателю в Telegram
        </label>
      </div>
    </Modal>
  );
}
