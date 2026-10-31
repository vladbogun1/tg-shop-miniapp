"use client";

/**
 * «Вернуть на склад» — единицы, списанные по ошибке (брак, пересчёт…), возвращаются на полку.
 * Строка списания остаётся с пометкой «вернули N»; бракованная единица возврата становится принятой на склад,
 * так что последующая отмена того возврата снова снимет её с полки.
 */
import { useLayoutEffect } from "react";
import { useForm } from "@shop/ui/form";
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
  const form = useForm<{ qty: number; note: string }>({ defaultValues: { qty: 1, note: "" } });
  const { reset, setValue } = form;
  const { qty, note } = form.watch();
  const restore = useRestoreWriteoff(onDone);
  // Layout effect: a passive reset would race with the textarea's own change handler.
  useLayoutEffect(() => {
    if (writeoff) reset({ qty: writeoff.left, note: "" });
  }, [writeoff, reset]);

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
            <Counter label="Сколько вернуть" value={qty} min={1} max={writeoff.left} onChange={(n) => setValue("qty", n)} />
          )}
          <Textarea
            label="Комментарий (необязательно)"
            rows={2}
            maxLength={500}
            {...form.register("note")}
            placeholder="Например: оказалось целым"
          />
        </div>
      )}
    </Modal>
  );
}
