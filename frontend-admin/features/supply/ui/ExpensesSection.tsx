"use client";

import { Button } from "@shop/ui/admin-button";
import { useConfirm } from "@shop/ui/confirm";
import { toast } from "@shop/ui/toast";
import { FileText, Image as ImageIcon, Paperclip, Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/Badge";
import { expenseKindLabel, lineTitle, openExpenseFile, type BatchMoney, type Expense, type ExpenseFile } from "@/features/procurement";
import { cn } from "@/lib/cn";
import { money } from "@/lib/money";
import { fileSize } from "../model/money-form";
import { useAttachExpenseFiles, useDeleteExpense, useDeleteExpenseFile } from "../queries";

/** «Расходы партии»: список с документами; добавление и правка — в ExpenseModal, который открывает хозяин. */
export function ExpensesSection({
  data,
  onEdit,
}: {
  data: BatchMoney;
  /** null — новый расход. */
  onEdit: (expense: Expense | null) => void;
}) {
  const confirm = useConfirm();
  const removeExpense = useDeleteExpense(data.batchId);
  const attachFiles = useAttachExpenseFiles(data.batchId);
  const removeFile = useDeleteExpenseFile(data.batchId);
  const itemName = useMemo(() => new Map(data.lines.map((l) => [l.itemId, lineTitle(l.title, l.variantName)])), [data.lines]);
  const uploadingId = attachFiles.isPending ? attachFiles.variables?.expenseId : null;

  async function remove(e: Expense) {
    const ok = await confirm({
      title: "Удалить расход?",
      message: `${expenseKindLabel(e.kind)} · ${money(e.amountUahMinor)}. Себестоимость пересчитается.`,
      confirmLabel: "Удалить",
      danger: true,
    });
    if (ok) removeExpense.mutate(e.id);
  }

  function attach(e: Expense, files: FileList | null) {
    if (files?.length) attachFiles.mutate({ expenseId: e.id, files: Array.from(files) });
  }

  async function detach(f: ExpenseFile) {
    const ok = await confirm({
      title: "Удалить документ?",
      message: `${f.name} удалится из хранилища. Сам расход останется.`,
      confirmLabel: "Удалить",
      danger: true,
    });
    if (ok) removeFile.mutate(f.id);
  }

  async function open(f: ExpenseFile) {
    try {
      await openExpenseFile(f);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Документ не открылся");
    }
  }

  return (
    <section className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[13px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">Расходы партии</h2>
        <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => onEdit(null)}>
          Добавить расход
        </Button>
      </div>
      {data.expenses.length === 0 ? (
        <div className="card p-4 text-[13px] text-[var(--text-faint)]">Расходов пока нет: доставка, растаможка, брокер и т. п. вносятся сюда.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {data.expenses.map((e) => (
            <div key={e.id} className="card flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 p-3">
              <div className="min-w-0 flex-1 basis-52">
                <div className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-[var(--text)]">
                  {expenseKindLabel(e.kind)}
                  {e.amountMinor < 0 && <Badge tone="info">компенсация</Badge>}
                </div>
                <div className="text-[12px] text-[var(--text-faint)]">
                  {e.itemId != null ? (itemName.get(e.itemId) ?? "позиция") : "на всю поставку"}
                  {e.spentOn ? ` · ${e.spentOn}` : ""}
                  {e.createdBy ? ` · ${e.createdBy}` : ""}
                </div>
                {e.note && <div className="break-words text-[12.5px] text-[var(--text-muted)]">{e.note}</div>}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {e.files.map((f) => (
                    <span
                      key={f.id}
                      className="inline-flex max-w-full items-center gap-1 rounded-md border border-[var(--line)] bg-[var(--surface-2)] pl-2 text-[12px]"
                    >
                      <button
                        type="button"
                        onClick={() => open(f)}
                        title={`${f.name} · ${fileSize(f.sizeBytes)}`}
                        className="inline-flex min-w-0 items-center gap-1 py-1 text-[var(--text)] hover:text-[var(--accent)]"
                      >
                        {f.contentType?.startsWith("image/") ? (
                          <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span className="max-w-[180px] truncate">{f.name}</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Удалить документ ${f.name}`}
                        onClick={() => detach(f)}
                        className="px-1.5 py-1 text-[var(--text-faint)] hover:text-[var(--danger)]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                  <label
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-[var(--text-muted)] hover:text-[var(--accent)]",
                      uploadingId === e.id && "pointer-events-none opacity-60",
                    )}
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    {uploadingId === e.id ? "Загрузка…" : e.files.length ? "Ещё документ" : "Прикрепить документ"}
                    <input
                      type="file"
                      multiple
                      accept="image/*,application/pdf,.pdf"
                      className="sr-only"
                      onChange={(ev) => {
                        attach(e, ev.target.files);
                        ev.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>
              <div className="text-right">
                <div className="tabular font-display text-[14px] font-bold text-[var(--ink)]">{money(e.amountUahMinor)}</div>
                {e.currency !== "UAH" && (
                  <div className="tabular text-[11px] text-[var(--text-faint)]">
                    {money(e.amountMinor, e.currency)}
                    {e.fxRate != null ? ` × ${e.fxRate}` : ""}
                  </div>
                )}
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" aria-label="Изменить расход" icon={<Pencil className="h-4 w-4" />} onClick={() => onEdit(e)} />
                <Button size="sm" variant="ghost" aria-label="Удалить расход" icon={<Trash2 className="h-4 w-4" />} onClick={() => remove(e)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
