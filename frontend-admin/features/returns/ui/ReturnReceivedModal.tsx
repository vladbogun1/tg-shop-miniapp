"use client";

/**
 * «Посылка вернулась» (POST /orders/{id}/return-received): посылка снова в магазине — отказная или та, что мастер
 * возврата отправил «едет назад». Всё, что не отмечено браком, возвращается на полку; брак списывается («Списания»).
 * У каждой строки переключатель «Брак»; при нескольких единицах — счётчик, сколько из них сломано.
 */
import { useLayoutEffect, useState } from "react";
import { useForm } from "@shop/ui/form";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { Image } from "@/lib/image";
import { cn } from "@/lib/cn";
import type { ReturnReceivedBody } from "../api";
import { buildReceivedBody, travelling } from "../model/received";
import type { ReturnOrder } from "../model/types";
import { Counter } from "./parts";

export function ReturnReceivedModal({
  open,
  order,
  onClose,
  onSave,
  loading,
}: {
  open: boolean;
  order: ReturnOrder | null;
  onClose: () => void;
  onSave: (body: ReturnReceivedBody) => Promise<unknown> | void;
  loading?: boolean;
}) {
  /** itemId → единиц вернулось сломанными (спишутся). */
  const [defect, setDefect] = useState<Record<number, number>>({});
  const form = useForm<{ note: string }>({ defaultValues: { note: "" } });
  const { reset } = form;
  const note = form.watch("note");

  const orderId = order?.id ?? null;
  // Layout effect: a passive reset would race with the input's own change handler.
  useLayoutEffect(() => {
    if (!open) return;
    setDefect({});
    reset({ note: "" });
  }, [open, orderId, reset]);

  if (!order) return null;

  const rows = order.items.filter((it) => it.id != null && travelling(order, it) > 0);
  const totalDefect = Object.values(defect).reduce((s, n) => s + n, 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      dirty={totalDefect > 0 || note.trim() !== ""}
      title="📦 Посылка вернулась"
      footer={
        <>
          <ModalCancel />
          <Button
            variant="accent"
            loading={loading}
            disabled={rows.length === 0}
            onClick={() => onSave(buildReceivedBody(order, rows, defect, note))}
          >
            Принять на склад
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-[var(--text-muted)]">
          Всё вернётся на склад. Если что-то пришло сломанным — включите «Брак», оно спишется.
        </p>
        {rows.length === 0 && <p className="text-[13px] text-[var(--text-muted)]">Все позиции уже учтены.</p>}
        {rows.map((it) => {
          const left = travelling(order, it);
          const d = defect[it.id!] ?? 0;
          const setD = (n: number) =>
            setDefect((p) => ({
              ...p,
              [it.id!]: Math.max(0, Math.min(left, n)),
            }));
          return (
            <div
              key={it.id}
              className={cn(
                "card-2 flex flex-col gap-2 px-3 py-2.5",
                d > 0 && "border-[color-mix(in_srgb,var(--danger)_45%,transparent)]",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <Image
                  src={it.imageUrl ?? undefined}
                  alt={it.title}
                  size={80}
                  className="h-10 w-10 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)]"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold text-[var(--text)]">
                    {it.gift && "🎁 "}
                    {it.title}
                  </div>
                  <div className="text-[12px] text-[var(--text-faint)]">
                    {it.variantName ? `${it.variantName} · ` : ""}вернулось {left} шт. · на склад{" "}
                    <b className="tabular text-[var(--text-muted)]">{left - d}</b>
                    {d > 0 && (
                      <>
                        {" "}
                        · спишется <b className="tabular text-[var(--danger-ink)]">{d}</b>
                      </>
                    )}
                  </div>
                </div>
                <div className="shrink-0">
                  <Toggle checked={d > 0} onChange={(on) => setD(on ? (left > 1 ? 1 : left) : 0)} label="Брак" />
                </div>
              </div>
              {d > 0 && left > 1 && (
                <Counter
                  label="Сколько бракованных"
                  lessLabel="Меньше бракованных"
                  moreLabel="Больше бракованных"
                  value={d}
                  min={1}
                  max={left}
                  onChange={setD}
                />
              )}
            </div>
          );
        })}
        <Input label="Комментарий (в журнал)" {...form.register("note")} maxLength={500} />
      </div>
    </Modal>
  );
}
