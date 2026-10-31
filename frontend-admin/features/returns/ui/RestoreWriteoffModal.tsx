"use client";

/**
 * «Вернуть на склад» — единицы, списанные по ошибке (брак, пересчёт…), возвращаются на полку.
 * Строка списания остаётся с пометкой «вернули N»; бракованная единица возврата становится принятой на склад,
 * так что последующая отмена того возврата снова снимет её с полки.
 */
import { useEffect, useState } from "react";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";
import { Textarea } from "@/components/ui/Textarea";
import { useRestoreWriteoff } from "../queries";
import { Counter } from "./parts";

export function RestoreWriteoffModal({
  writeoff,
  onClose,
  onDone,
}: {
  /** null = закрыто. `left` = единиц, всё ещё числящихся списанными. */
  writeoff: { id: number; title: string; left: number } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const restore = useRestoreWriteoff(onDone);
  useEffect(() => {
    if (writeoff) {
      setQty(writeoff.left);
      setNote("");
    }
  }, [writeoff]);

  function submit() {
    if (!writeoff) return;
    restore.mutate(
      {
        id: writeoff.id,
        title: writeoff.title,
        quantity: qty,
        note: note.trim(),
      },
      { onSuccess: onClose },
    );
  }

  return (
    <Modal
      open={writeoff !== null}
      onClose={onClose}
      size="sm"
      title="Вернуть на склад"
      footer={
        <>
          <ModalCancel />
          <Button variant="accent" loading={restore.isPending} onClick={submit}>
            Вернуть {qty} шт
          </Button>
        </>
      }
    >
      {writeoff && (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-[var(--text-muted)]">
            <b className="text-[var(--text)]">{writeoff.title}</b> снова появится в остатке и его можно будет продать.
            Строка списания останется с пометкой «вернули».
          </p>
          {writeoff.left > 1 && (
            <Counter label="Сколько вернуть" value={qty} min={1} max={writeoff.left} onChange={setQty} />
          )}
          <Textarea
            label="Комментарий (необязательно)"
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Например: оказалось целым"
          />
        </div>
      )}
    </Modal>
  );
}
