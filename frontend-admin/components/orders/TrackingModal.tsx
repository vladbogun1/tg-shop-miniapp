"use client";

/** Fix the ТТН of an order that is already shipped (PATCH /orders/{id}/tracking). */
import { useEffect, useState } from "react";
import { isNovaPoshtaTtn } from "@/lib/orders";
import { Modal, ModalCancel } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function TrackingModal({
  open,
  orderId,
  current,
  onClose,
  onSave,
  loading,
}: {
  open: boolean;
  orderId: string | null;
  current: string | null | undefined;
  onClose: () => void;
  onSave: (ttn: string) => Promise<unknown> | void;
  loading?: boolean;
}) {
  const [ttn, setTtn] = useState("");
  useEffect(() => {
    if (open) setTtn(current ?? "");
  }, [open, orderId, current]);

  const clean = ttn.replace(/\s+/g, "");
  const wrong = clean.length > 0 && !isNovaPoshtaTtn(clean);
  const unchanged = clean === (current ?? "");

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      dirty={!unchanged}
      size="sm"
      title="Изменить ТТН"
      footer={
        <>
          <ModalCancel />
          <Button variant="accent" loading={loading} disabled={!clean || unchanged || !orderId} onClick={() => onSave(clean)}>
            Сохранить
          </Button>
        </>
      }
    >
      <Input
        label="Номер ТТН"
        value={ttn}
        inputMode="numeric"
        autoFocus
        autoComplete="off"
        onChange={(e) => setTtn(e.target.value)}
        error={wrong ? "Не похоже на ТТН Новой Почты (14 цифр, начало 20/59)." : undefined}
        hint="Клиент получит новый номер в боте, карточка в Telegram обновится."
      />
    </Modal>
  );
}
