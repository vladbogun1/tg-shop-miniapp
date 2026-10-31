"use client";

import { Button } from "@shop/ui/admin-button";
import { useForm } from "@shop/ui/form";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { CloudDownload } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CURRENCIES, EXPENSE_KINDS, type Expense } from "@/features/procurement";
import { expenseFormValues, toExpenseRequest, type ExpenseFormValues } from "../model/money-form";
import { useNbuRate, useSaveExpense } from "../queries";

/** Расход партии: вид, сумма в валюте с курсом, дата, на что отнести. Окно монтируется на каждое открытие. */
export function ExpenseModal({
  batchId,
  edit,
  lines,
  defaultCurrency,
  defaultRate,
  onClose,
}: {
  batchId: number;
  edit: Expense | null;
  lines: { itemId: number; label: string }[];
  defaultCurrency: string;
  defaultRate: string;
  onClose: () => void;
}) {
  const form = useForm<ExpenseFormValues>({
    defaultValues: expenseFormValues(edit, defaultCurrency, defaultRate),
  });
  const v = form.watch();
  const set = <K extends keyof ExpenseFormValues>(key: K, value: ExpenseFormValues[K]) => form.setValue(key, value as never);
  const [error, setError] = useState<string | null>(null);
  const foreign = v.currency !== "UAH";

  const save = useSaveExpense(batchId, { onSaved: onClose, onError: setError });
  const rate = useNbuRate((r) => set("rate", r), false);

  function submit() {
    const res = toExpenseRequest(v);
    if ("error" in res) return setError(res.error);
    setError(null);
    save.mutate({ edit, body: res.body });
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={edit ? "Изменить расход" : "Добавить расход"}
      closeOnBackdrop={false}
      footer={
        <>
          <ModalCancel disabled={save.isPending} />
          <Button variant="accent" loading={save.isPending} onClick={submit}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Select label="Вид" value={v.kind} options={EXPENSE_KINDS} onChange={(k) => set("kind", k)} />
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Input
            label="Сумма"
            inputMode="decimal"
            value={v.amount}
            onChange={(e) => set("amount", e.target.value)}
            placeholder="напр. 120.00"
            hint="Минус — компенсация (вернули часть денег)."
          />
          <Select label="Валюта" value={v.currency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} onChange={(c) => set("currency", c)} />
        </div>
        {foreign && (
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
            <Input label="Курс к гривне" inputMode="decimal" value={v.rate} onChange={(e) => set("rate", e.target.value)} placeholder="напр. 41.5" />
            <Button
              variant="outline"
              icon={<CloudDownload className="h-4 w-4" />}
              loading={rate.isPending}
              onClick={() =>
                rate.mutate({
                  currency: v.currency,
                  date: v.spentOn || undefined,
                })
              }
              className="sm:mb-[2px]"
            >
              Курс НБУ
            </Button>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Дата расхода" type="date" value={v.spentOn} onChange={(e) => set("spentOn", e.target.value)} />
          <Select
            label="На что"
            value={v.scope}
            options={[
              { value: "ALL", label: "На всю поставку" },
              ...lines.map((l) => ({
                value: String(l.itemId),
                label: l.label,
              })),
            ]}
            onChange={(s) => set("scope", s)}
          />
        </div>
        <Input
          label="Примечание"
          value={v.note}
          onChange={(e) => set("note", e.target.value)}
          maxLength={255}
          placeholder="напр. DHL, накладная 123"
        />
        {error && (
          <p role="alert" className="text-[13px] text-[var(--danger-ink)]">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
