"use client";

/**
 * StatusChangeModal — prompts for the extra field a transition needs:
 *  - SHIPPED -> tracking number (ТТН, required)
 *  - REJECTED -> reject reason (required)
 * Other transitions resolve immediately (no modal needed).
 */
import { useState } from "react";
import type { OrderStatus } from "@/lib/api";
import { STATUS_EMOJI, STATUS_LABEL } from "@/lib/orders";
import { Modal } from "@/components/ui/Modal";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassInput } from "@/components/ui/GlassInput";
import { GlassTextarea } from "@/components/ui/GlassTextarea";

export interface StatusChangePayload {
  status: OrderStatus;
  trackingNumber?: string;
  rejectReason?: string;
}

interface Props {
  open: boolean;
  target: OrderStatus | null;
  onClose: () => void;
  onConfirm: (payload: StatusChangePayload) => void;
  loading?: boolean;
}

export function StatusChangeModal({ open, target, onClose, onConfirm, loading }: Props) {
  const [ttn, setTtn] = useState("");
  const [reason, setReason] = useState("");

  if (!target) return null;
  const needsTtn = target === "SHIPPED";
  const needsReason = target === "REJECTED";

  function submit() {
    if (!target) return;
    if (needsTtn && !ttn.trim()) return;
    if (needsReason && !reason.trim()) return;
    onConfirm({
      status: target,
      trackingNumber: needsTtn ? ttn.trim() : undefined,
      rejectReason: needsReason ? reason.trim() : undefined,
    });
    setTtn("");
    setReason("");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${STATUS_EMOJI[target]} ${STATUS_LABEL[target]}`}
      footer={
        <>
          <GlassButton variant="ghost" onClick={onClose}>
            Отмена
          </GlassButton>
          <GlassButton
            variant={needsReason ? "danger" : "accent"}
            loading={loading}
            onClick={submit}
            disabled={(needsTtn && !ttn.trim()) || (needsReason && !reason.trim())}
          >
            Подтвердить
          </GlassButton>
        </>
      }
    >
      {needsTtn && (
        <GlassInput
          label="Номер ТТН (обязательно)"
          value={ttn}
          onChange={(e) => setTtn(e.target.value)}
        />
      )}
      {needsReason && (
        <GlassTextarea
          label="Причина отклонения (обязательно)"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      )}
      {!needsTtn && !needsReason && (
        <p className="text-[14px] text-[var(--text-muted)]">
          Перевести заказ в статус «{STATUS_LABEL[target]}»?
        </p>
      )}
    </Modal>
  );
}
