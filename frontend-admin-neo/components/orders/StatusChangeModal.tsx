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
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Toggle } from "@/components/ui/Toggle";

export interface StatusChangePayload {
  status: OrderStatus;
  trackingNumber?: string;
  rejectReason?: string;
  /** REJECTED only: return items to stock (skip when goods aren't sellable). */
  restock?: boolean;
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
  const [restock, setRestock] = useState(true);

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
      restock: needsReason ? restock : undefined,
    });
    setTtn("");
    setReason("");
    setRestock(true);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${STATUS_EMOJI[target]} ${STATUS_LABEL[target]}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant={needsReason ? "danger" : "accent"}
            loading={loading}
            onClick={submit}
            disabled={(needsTtn && !ttn.trim()) || (needsReason && !reason.trim())}
          >
            Подтвердить
          </Button>
        </>
      }
    >
      {needsTtn && (
        <Input
          label="Номер ТТН (обязательно)"
          value={ttn}
          onChange={(e) => setTtn(e.target.value)}
        />
      )}
      {needsReason && (
        <div className="flex flex-col gap-3">
          <Textarea
            label="Причина отклонения / отмены (обязательно)"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="rounded-[var(--r-md)] border border-[var(--border-2)] bg-[var(--surface-2)] p-3">
            <Toggle
              checked={restock}
              onChange={setRestock}
              label="Вернуть товар на склад (+1 к остатку)"
            />
            <p className="mt-1.5 text-[12px] text-[var(--text-muted)]">
              Выключите, если товар вернулся не в товарном виде и продавать его снова нельзя.
            </p>
          </div>
        </div>
      )}
      {!needsTtn && !needsReason && (
        <p className="text-[14px] text-[var(--text-muted)]">
          Перевести заказ в статус «{STATUS_LABEL[target]}»?
        </p>
      )}
    </Modal>
  );
}
