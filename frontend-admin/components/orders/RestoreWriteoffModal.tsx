"use client";

/**
 * «Вернуть на склад» — units written off (брак, пересчёт…) by mistake go back on the shelf.
 * The write-off row stays, marked «вернули N»; a return's defect unit becomes a restocked one,
 * so cancelling that return later takes it off the shelf again.
 */
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { restoreWriteoff } from "@/lib/writeoffs";
import { useToast } from "@/lib/toast";
import { Modal, ModalCancel } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Counter } from "./ReturnModal";

export function RestoreWriteoffModal({
  writeoff,
  onClose,
  onDone,
}: {
  /** null = closed. `left` = units still written off. */
  writeoff: { id: number; title: string; left: number } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { push } = useToast();
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (writeoff) {
      setQty(writeoff.left);
      setNote("");
    }
  }, [writeoff]);

  async function submit() {
    if (!writeoff) return;
    setBusy(true);
    try {
      await restoreWriteoff(writeoff.id, qty, note.trim());
      push(`${writeoff.title} ×${qty} — снова на складе`, "ok");
      onDone();
      onClose();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось вернуть на склад", "error");
    } finally {
      setBusy(false);
    }
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
          <Button variant="accent" loading={busy} onClick={() => void submit()}>
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
