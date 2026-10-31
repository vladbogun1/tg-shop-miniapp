"use client";

/**
 * «Отменить возврат» / «Отменить обмен»: единицы возвращаются в заказ (со склада, из брака или просто перестают ехать),
 * деньги — вернули сейчас, записали долг или оставили покупателю. Обмен отменяет и заказ-замену.
 * Ничего не удаляется: запись помечается, в журнале денег появляются встречные строки.
 */
import { useLayoutEffect } from "react";
import { useForm } from "@shop/ui/form";
import { ArrowLeftRight, CircleDollarSign, Gift, HandCoins } from "lucide-react";
import { shortOrderId } from "@shop/core/format";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Image } from "@/lib/image";
import { Textarea } from "@/components/ui/Textarea";
import type { CancelMoney } from "../../api";
import { givenBack, lineUndo } from "../../model/records";
import type { ReturnOrder, ReturnRecord } from "../../model/types";
import { useCancelReturn } from "../../queries";
import { ChoiceCard } from "../parts";

export function CancelReturnModal({
  order,
  record,
  onClose,
  onDone,
}: {
  order: ReturnOrder;
  record: ReturnRecord | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const form = useForm<{ moneyChoice: CancelMoney | null; note: string }>({ defaultValues: { moneyChoice: null, note: "" } });
  const { reset, setValue } = form;
  const { moneyChoice, note } = form.watch();
  const setMoneyChoice = (m: CancelMoney) => setValue("moneyChoice", m);
  const cancel = useCancelReturn(order.id, onDone);
  // Layout effect: a passive reset would race with the textarea's own change handler.
  useLayoutEffect(() => {
    if (record) reset({ moneyChoice: null, note: "" });
  }, [record, reset]);

  const cur = order.currency;
  const exchange = record?.kind === "EXCHANGE";
  const given = record && !exchange ? givenBack(record, order) : 0;
  const needMoney = given > 0;
  const clean = note.trim();
  const valid = clean.length >= 3 && (!needMoney || moneyChoice !== null);
  const label = exchange ? "Отменить обмен" : "Отменить возврат";

  function submit() {
    if (!record || !valid) return;
    cancel.mutate(
      {
        returnId: record.id,
        exchange: !!exchange,
        money: needMoney ? moneyChoice! : undefined,
        note: clean,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <Modal
      open={record !== null}
      onClose={onClose}
      closeOnBackdrop={false}
      dirty={clean !== ""}
      title={label}
      footer={
        <>
          <ModalCancel />
          <Button variant="accent" loading={cancel.isPending} disabled={!valid} onClick={submit}>
            {label}
          </Button>
        </>
      }
    >
      {record && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="field-label">Что вернётся в заказ</div>
            {record.lines.map((l, i) => {
              const undo = lineUndo(l);
              return (
                <div key={`${l.itemId}-${i}`} className="card-2 flex items-center gap-3 px-3 py-2">
                  <Image
                    src={l.imageUrl ?? undefined}
                    alt={l.title}
                    size={96}
                    className={cn(
                      "h-12 w-12 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)]",
                      !undo && "opacity-50",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-[var(--text)]">
                      {l.title} <span className="tabular text-[var(--text-muted)]">×{l.quantity}</span>
                    </div>
                    <div className="text-[12px] text-[var(--text-faint)]">
                      {undo ?? "и так у покупателя — ничего не меняем"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {exchange && (
            <div className="card-2 flex items-start gap-2.5 px-3 py-2.5 text-[13px] text-[var(--text-muted)]">
              <ArrowLeftRight className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Новый заказ
                {record.newOrderId && <> {shortOrderId(record.newOrderId)}</>} отменится, его товар вернётся на склад,
                покупатель получит обычное сообщение об отмене. {money(record.refundMinor, cur)}, перенесённые в него,
                снова засчитаются в этот заказ.
              </span>
            </div>
          )}

          {needMoney && (
            <div className="flex flex-col gap-2">
              <div className="field-label">Покупателю вернули {money(given, cur)}. Что с этими деньгами?</div>
              <div className="grid gap-2">
                <ChoiceCard
                  active={moneyChoice === "RETURNED"}
                  onClick={() => setMoneyChoice("RETURNED")}
                  icon={<CircleDollarSign className="h-5 w-5" />}
                  label="Покупатель уже вернул деньги"
                  sub="Запишем, что деньги снова у нас"
                />
                <ChoiceCard
                  active={moneyChoice === "DEBT"}
                  onClick={() => setMoneyChoice("DEBT")}
                  icon={<HandCoins className="h-5 w-5" />}
                  label="Ещё не вернул — запишем долг"
                  sub="В заказе появится кнопка «Деньги пришли»"
                />
                <ChoiceCard
                  active={moneyChoice === "KEEP"}
                  onClick={() => setMoneyChoice("KEEP")}
                  icon={<Gift className="h-5 w-5" />}
                  label="Оставляем деньги покупателю"
                  sub="Товар у него, деньги не просим"
                />
              </div>
            </div>
          )}

          <Textarea
            label="Почему отменяем (обязательно)"
            rows={2}
            maxLength={500}
            {...form.register("note")}
            placeholder="Например: передумал возвращать"
            hint={clean !== "" && clean.length < 3 ? "Минимум 3 символа." : undefined}
          />
        </div>
      )}
    </Modal>
  );
}
