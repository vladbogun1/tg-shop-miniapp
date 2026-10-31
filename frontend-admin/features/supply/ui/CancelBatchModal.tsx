"use client";

import { Button } from "@shop/ui/admin-button";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { useState } from "react";
import { Toggle } from "@/components/ui/Toggle";
import type { Batch } from "@/features/procurement";
import { useCancelBatch } from "../queries";

export function CancelBatchModal({ open, onClose, batch, waiting }: { open: boolean; onClose: () => void; batch: Batch; waiting: number }) {
  const [closeQueue, setCloseQueue] = useState(false);
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
          <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate(closeQueue)}>
            Отменить поставку
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-[14px] text-[var(--text-muted)]">
        <p>
          «{batch.title}» перестанет быть открытой. Ждущих сейчас: {waiting} чел. Если очередь оставить, люди продолжат ждать товар без срока.
        </p>
        <Toggle checked={closeQueue} onChange={setCloseQueue} label="Закрыть очередь (ждущие выйдут из неё)" />
      </div>
    </Modal>
  );
}
