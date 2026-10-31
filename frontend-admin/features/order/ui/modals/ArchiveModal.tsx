"use client";

/** «В архив» — the main admin archives a closed order; the reason is required (≥ 3 characters). */
import { useEffect } from "react";
import { useForm } from "@shop/ui/form";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";
import { Textarea } from "@/components/ui/Textarea";

export function ArchiveModal({
  open,
  label,
  onClose,
  onConfirm,
  loading,
}: {
  open: boolean;
  label?: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<unknown> | void;
  loading?: boolean;
}) {
  const { reset, register, watch } = useForm<{ reason: string }>({ defaultValues: { reason: "" } });
  useEffect(() => {
    if (open) reset({ reason: "" });
  }, [open, reset]);
  const clean = watch("reason").trim();
  const valid = clean.length >= 3;

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      dirty={clean !== ""}
      size="sm"
      title={label ? `В архив · ${label}` : "В архив"}
      footer={
        <>
          <ModalCancel />
          <Button variant="accent" loading={loading} disabled={!valid} onClick={() => onConfirm(clean)}>
            В архив
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-[var(--text-muted)]">
          Заказы не удаляются: архивный заказ уходит с доски и из таблицы, но все данные, оплаты и журнал денег
          остаются. Вернуть из архива может главный админ.
        </p>
        <Textarea
          label="Причина (обязательно)"
          rows={3}
          autoFocus
          maxLength={500}
          {...register("reason")}
          hint={clean !== "" && !valid ? "Минимум 3 символа." : undefined}
        />
      </div>
    </Modal>
  );
}
