"use client";

/** Fix the ТТН of an order that is already shipped (PATCH /orders/{id}/tracking). */
import { useEffect } from "react";
import { useForm } from "@shop/ui/form";
import { isNovaPoshtaTtn } from "../../model/status";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";
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
  const { reset, register, watch } = useForm<{ ttn: string }>({ defaultValues: { ttn: "" } });
  useEffect(() => {
    if (open) reset({ ttn: current ?? "" });
  }, [open, orderId, current, reset]);

  const clean = watch("ttn").replace(/\s+/g, "");
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
        inputMode="numeric"
        autoFocus
        autoComplete="off"
        {...register("ttn")}
        error={wrong ? "Не похоже на ТТН Новой Почты (14 цифр, начало 20/59)." : undefined}
        hint="Клиент получит новый номер в боте, карточка в Telegram обновится."
      />
    </Modal>
  );
}
