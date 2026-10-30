"use client";

/**
 * Карточка поставки → «Деньги»: валюта и курс (кнопка «Курс НБУ»), способ распределения расходов, цена закупки
 * по позициям и вес/ручная доля, итоговая себестоимость и маржа за штуку; расходы партии (доставка, растаможка…).
 * Только для тех, у кого есть право «Финансы» — страница не рендерит вкладку без него.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CloudDownload, FileText, Image as ImageIcon, Paperclip, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { ApiError } from "@/lib/api";
import {
  ALLOCATIONS,
  COSTING_KEY,
  EXPENSE_KINDS,
  costingApi,
  expenseKindLabel,
  inputToMinor,
  minorToInput,
  type Allocation,
  type BatchMoney,
  type Expense,
  type ExpenseFile,
  openExpenseFile,
  type ExpenseKind,
  type MoneyRequest,
} from "@/lib/costing";
import { CURRENCIES, fxToInput, inputToFx, lineTitle } from "@/lib/preorders";
import { money } from "@/lib/money";
import { Image } from "@/lib/image";
import { cn } from "@/lib/cn";
import { useToast } from "@/lib/toast";
import { pct } from "@/components/metrics/format";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { Input } from "@/components/ui/Input";
import { Modal, ModalCancel } from "@/components/ui/Modal";
import { QueryState } from "@/components/ui/QueryState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { Toggle } from "@/components/ui/Toggle";
import { now } from "@shop/core/time";

interface LineDraft {
  price: string;
  weight: string;
  manual: string;
}

function parseRate(s: string): number | null {
  const n = Number(s.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function marginTone(p: number | null | undefined): string {
  if (p == null) return "text-[var(--text-muted)]";
  return p < 0 ? "text-[#F87171]" : "text-[var(--ok)]";
}

export function BatchMoneyTab({ batchId }: { batchId: number }) {
  const q = useQuery({ queryKey: [...COSTING_KEY, "money", batchId], queryFn: () => costingApi.money(batchId), retry: false });
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка денег поставки">
      {q.data && <MoneyBody data={q.data} updatedAt={q.dataUpdatedAt} />}
    </QueryState>
  );
}

function MoneyBody({ data, updatedAt }: { data: BatchMoney; updatedAt: number }) {
  const qc = useQueryClient();
  const { push } = useToast();
  const [currency, setCurrency] = useState(data.currency);
  const [fx, setFx] = useState("");
  const [allocation, setAllocation] = useState<Allocation>(data.allocation);
  const [costsFinal, setCostsFinal] = useState(data.costsFinal);
  const [lines, setLines] = useState<Record<number, LineDraft>>({});
  const [dirty, setDirty] = useState(false);
  const [rateBusy, setRateBusy] = useState(false);
  const [expense, setExpense] = useState<{ edit: Expense | null } | null>(null);

  // A fresh server answer (first load, save, expense change) resets the form.
  useEffect(() => {
    setCurrency(data.currency);
    setFx(data.fxRate != null ? String(data.fxRate) : "");
    setAllocation(data.allocation);
    setCostsFinal(data.costsFinal);
    setLines(
      Object.fromEntries(
        data.lines.map((l) => [l.itemId, { price: fxToInput(l.unitPriceFx), weight: l.weightG != null ? String(l.weightG) : "", manual: minorToInput(l.manualExtraMinor) }])
      )
    );
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updatedAt]);

  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
  };
  const setLine = (id: number, patch: Partial<LineDraft>) => {
    setLines((m) => ({ ...m, [id]: { ...m[id], ...patch } }));
    setDirty(true);
  };

  const apply = (r: BatchMoney) => {
    qc.setQueryData([...COSTING_KEY, "money", data.batchId], r);
    qc.invalidateQueries({ queryKey: [...COSTING_KEY, "sales", data.batchId] });
    qc.invalidateQueries({ queryKey: ["preorders"] });
  };

  const save = useMutation({
    mutationFn: () => {
      const body: MoneyRequest = {
        currency,
        fxRate: parseRate(fx),
        allocation,
        costsFinal,
        lines: data.lines.map((l) => {
          const d = lines[l.itemId] ?? { price: "", weight: "", manual: "" };
          const w = parseInt(d.weight, 10);
          return { itemId: l.itemId, unitPriceFx: inputToFx(d.price), weightG: Number.isFinite(w) && w > 0 ? w : null, manualExtraMinor: inputToMinor(d.manual) };
        }),
      };
      return costingApi.saveMoney(data.batchId, body);
    },
    onSuccess: (r) => {
      apply(r);
      push("Деньги поставки сохранены", "ok");
    },
    onError: (e) => push(e instanceof ApiError ? e.message : "Не удалось сохранить", "error"),
  });

  async function fetchRate() {
    setRateBusy(true);
    try {
      const r = await costingApi.nbuRate(currency);
      if (r.rate != null) {
        touch(setFx)(String(r.rate));
        push(`Курс НБУ на ${r.date}: ${r.rate}`, "ok");
      } else {
        push("НБУ не отдал курс — введите вручную", "error");
      }
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось получить курс", "error");
    } finally {
      setRateBusy(false);
    }
  }

  const alloc = ALLOCATIONS.find((a) => a.value === allocation);
  const needsRate = currency !== "UAH";
  const incomplete = data.lines.some((l) => !lines[l.itemId]?.price.trim());
  const [confirm, confirmUi] = useConfirm();

  async function remove(e: Expense) {
    const ok = await confirm({
      title: "Удалить расход?",
      message: `${expenseKindLabel(e.kind)} · ${money(e.amountUahMinor)}. Себестоимость пересчитается.`,
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
    try {
      apply(await costingApi.deleteExpense(e.id));
      push("Расход удалён", "ok");
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Не удалось удалить", "error");
    }
  }

  const [uploading, setUploading] = useState<number | null>(null);

  async function attach(e: Expense, files: FileList | null) {
    if (!files?.length) return;
    setUploading(e.id);
    try {
      let last: BatchMoney | null = null;
      for (const f of Array.from(files)) last = await costingApi.addExpenseFile(e.id, f);
      if (last) apply(last);
      push(files.length > 1 ? `Документов прикреплено: ${files.length}` : "Документ прикреплён", "ok");
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Не удалось загрузить документ", "error");
    } finally {
      setUploading(null);
    }
  }

  async function detach(f: ExpenseFile) {
    const ok = await confirm({
      title: "Удалить документ?",
      message: `${f.name} удалится из хранилища. Сам расход останется.`,
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
    try {
      apply(await costingApi.deleteExpenseFile(f.id));
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Не удалось удалить документ", "error");
    }
  }

  async function open(f: ExpenseFile) {
    try {
      await openExpenseFile(f);
    } catch (err) {
      push(err instanceof Error ? err.message : "Документ не открылся", "error");
    }
  }

  const itemName = useMemo(() => new Map(data.lines.map((l) => [l.itemId, lineTitle(l.title, l.variantName)])), [data.lines]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {confirmUi}
      <div className="flex flex-wrap items-center gap-2">
        {costsFinal && !dirty ? <Badge tone="ok" dot>себестоимость окончательная</Badge> : <Badge tone="warn" dot>себестоимость предварительная</Badge>}
        {data.preliminary && !data.costsFinal && <span className="text-[12.5px] text-[var(--text-muted)]">пока не отмечено «Все расходы внесены»</span>}
      </div>

      {data.problems.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--warn)_45%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] p-3 text-[13px] text-[var(--text)]">
          {data.problems.map((p, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warn)]" />
              <span>{p}</span>
            </div>
          ))}
        </div>
      )}

      <section className="card flex flex-col gap-4 p-4">
        <div className="grid items-end gap-3 sm:grid-cols-[10rem_1fr_auto]">
          <Select label="Валюта закупки" value={currency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} onChange={touch(setCurrency)} />
          <Input
            label="Курс к гривне"
            inputMode="decimal"
            value={needsRate ? fx : "1"}
            disabled={!needsRate}
            onChange={(e) => touch(setFx)(e.target.value)}
            placeholder="напр. 41.5"
            hint={needsRate ? "Сколько ₴ за 1 единицу валюты." : "Закупка в гривнах — курс не нужен."}
          />
          {needsRate && (
            <Button variant="outline" icon={<CloudDownload className="h-4 w-4" />} loading={rateBusy} onClick={fetchRate} className="sm:mb-[22px]">
              Курс НБУ
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="field-label">Как делить расходы по позициям</span>
          <SegmentedControl className="self-start" options={ALLOCATIONS.map((a) => ({ value: a.value, label: a.label }))} value={allocation} onChange={touch(setAllocation)} />
          {alloc && <span className="text-[12px] text-[var(--text-faint)]">{alloc.hint}</span>}
        </div>

        <Toggle checked={costsFinal} onChange={touch(setCostsFinal)} label="Все расходы внесены (себестоимость окончательная)" />
      </section>

      <div className="card thin-scroll overflow-x-auto p-0">
        <table className="data-table min-w-[980px]">
          <thead>
            <tr>
              <th>Товар</th>
              <th className="r">Шт</th>
              <th>Закупка, {currency}</th>
              {allocation === "BY_WEIGHT" && <th>Вес, г</th>}
              {allocation === "MANUAL" && <th>Доля расходов, ₴</th>}
              <th className="r">Закупка ₴/шт</th>
              <th className="r">Расходы ₴/шт</th>
              <th className="r">Себестоимость</th>
              <th className="r">Цена продажи</th>
              <th className="r">Маржа ₴</th>
              <th className="r">Маржа %</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l) => {
              const d = lines[l.itemId] ?? { price: "", weight: "", manual: "" };
              return (
                <tr key={l.itemId}>
                  <td>
                    <div className="flex min-w-[12rem] items-center gap-2.5">
                      <Image src={l.imageUrl} alt={l.title} size={80} className="h-9 w-9 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)]" />
                      <span className="line-clamp-2 break-words text-[13px] font-semibold">{lineTitle(l.title, l.variantName)}</span>
                    </div>
                  </td>
                  <td className="r" title={l.qtyArrived != null ? `заказано ${l.qtyOrdered}, приехало ${l.qtyArrived}` : undefined}>
                    {l.qty}
                  </td>
                  <td>
                    <Input aria-label="Цена закупки" inputMode="decimal" value={d.price} onChange={(e) => setLine(l.itemId, { price: e.target.value })} placeholder="0.00" className="w-24" />
                  </td>
                  {allocation === "BY_WEIGHT" && (
                    <td>
                      <Input aria-label="Вес, г" inputMode="numeric" value={d.weight} onChange={(e) => setLine(l.itemId, { weight: e.target.value })} placeholder="г" className="w-20" />
                    </td>
                  )}
                  {allocation === "MANUAL" && (
                    <td>
                      <Input aria-label="Доля расходов, ₴" inputMode="decimal" value={d.manual} onChange={(e) => setLine(l.itemId, { manual: e.target.value })} placeholder="0.00" className="w-24" />
                    </td>
                  )}
                  <td className="r whitespace-nowrap">{l.purchaseUnitMinor != null ? money(l.purchaseUnitMinor) : "—"}</td>
                  <td className="r whitespace-nowrap">{money(l.extraUnitMinor)}</td>
                  <td className="r whitespace-nowrap font-semibold">{l.costUnitMinor != null ? money(l.costUnitMinor) : "—"}</td>
                  <td className="r whitespace-nowrap">{money(l.priceMinor)}</td>
                  <td className={cn("r whitespace-nowrap font-semibold", marginTone(l.marginPct))}>{l.marginUnitMinor != null ? money(l.marginUnitMinor) : "—"}</td>
                  <td className={cn("r whitespace-nowrap font-semibold", marginTone(l.marginPct))}>{pct(l.marginPct)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="accent" icon={<Save className="h-4 w-4" />} loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>
          Сохранить
        </Button>
        {dirty && <span className="text-[12.5px] text-[var(--text-muted)]">Себестоимость и маржа в таблице пересчитаются после сохранения.</span>}
        {!dirty && incomplete && <span className="text-[12.5px] text-[var(--warn)]">Не у всех позиций внесена цена закупки.</span>}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Total label="Закупка" value={money(data.purchaseMinor)} />
        <Total label="Расходы" value={money(data.expensesMinor)} sub={data.expensesPct != null ? `${pct(data.expensesPct)} от закупки` : undefined} />
        <Total label="Всего" value={money(data.totalMinor)} />
        <Total label="Не распределено" value={money(data.unassignedMinor)} warn={data.unassignedMinor !== 0} sub={data.unassignedMinor !== 0 ? "расходы без позиции, куда их отнести" : undefined} />
      </div>

      <section className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-[13px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">Расходы партии</h2>
          <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => setExpense({ edit: null })}>
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
                    {e.itemId != null ? itemName.get(e.itemId) ?? "позиция" : "на всю поставку"}
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
                        uploading === e.id && "pointer-events-none opacity-60"
                      )}
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                      {uploading === e.id ? "Загрузка…" : e.files.length ? "Ещё документ" : "Прикрепить документ"}
                      <input
                        type="file"
                        multiple
                        accept="image/*,application/pdf,.pdf"
                        className="sr-only"
                        onChange={(ev) => {
                          void attach(e, ev.target.files);
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
                  <Button size="sm" variant="ghost" aria-label="Изменить расход" icon={<Pencil className="h-4 w-4" />} onClick={() => setExpense({ edit: e })} />
                  <Button size="sm" variant="ghost" aria-label="Удалить расход" icon={<Trash2 className="h-4 w-4" />} onClick={() => remove(e)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {expense && (
        <ExpenseModal
          batchId={data.batchId}
          edit={expense.edit}
          lines={data.lines.map((l) => ({ itemId: l.itemId, label: lineTitle(l.title, l.variantName) }))}
          defaultCurrency={currency}
          defaultRate={needsRate ? fx : ""}
          onClose={() => setExpense(null)}
          onSaved={(r) => {
            apply(r);
            setExpense(null);
          }}
        />
      )}
    </div>
  );
}

function Total({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="card min-w-0 p-3">
      <div className="text-[11px] text-[var(--text-faint)]">{label}</div>
      <div className={cn("tabular font-display text-[18px] font-bold", warn ? "text-[var(--warn)]" : "text-[var(--ink)]")}>{value}</div>
      {sub && <div className="text-[11px] leading-snug text-[var(--text-faint)]">{sub}</div>}
    </div>
  );
}

function todayLocal(): string {
  const d = now();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function ExpenseModal({
  batchId,
  edit,
  lines,
  defaultCurrency,
  defaultRate,
  onClose,
  onSaved,
}: {
  batchId: number;
  edit: Expense | null;
  lines: { itemId: number; label: string }[];
  defaultCurrency: string;
  defaultRate: string;
  onClose: () => void;
  onSaved: (r: BatchMoney) => void;
}) {
  const { push } = useToast();
  const [kind, setKind] = useState<ExpenseKind>(edit?.kind ?? "FREIGHT");
  const [amount, setAmount] = useState(edit ? minorToInput(edit.amountMinor) : "");
  const [currency, setCurrency] = useState(edit?.currency ?? defaultCurrency);
  const [rate, setRate] = useState(edit?.fxRate != null ? String(edit.fxRate) : defaultRate);
  const [spentOn, setSpentOn] = useState(edit?.spentOn ?? todayLocal());
  const [note, setNote] = useState(edit?.note ?? "");
  const [scope, setScope] = useState(edit?.itemId != null ? String(edit.itemId) : "ALL");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rateBusy, setRateBusy] = useState(false);
  const foreign = currency !== "UAH";

  async function fetchRate() {
    setRateBusy(true);
    try {
      const r = await costingApi.nbuRate(currency, spentOn || undefined);
      if (r.rate != null) setRate(String(r.rate));
      else push("НБУ не отдал курс — введите вручную", "error");
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось получить курс", "error");
    } finally {
      setRateBusy(false);
    }
  }

  async function submit() {
    const amountMinor = inputToMinor(amount);
    if (amountMinor == null || amountMinor === 0) return setError("Введите сумму (отрицательная — компенсация)");
    const fxRate = foreign ? parseRate(rate) : null;
    if (foreign && fxRate == null) return setError("Укажите курс к гривне");
    setError(null);
    setBusy(true);
    const body = {
      itemId: scope === "ALL" ? null : Number(scope),
      kind,
      amountMinor,
      currency,
      fxRate,
      spentOn: spentOn || null,
      note: note.trim() || null,
    };
    try {
      onSaved(edit ? await costingApi.updateExpense(edit.id, body) : await costingApi.addExpense(batchId, body));
      push(edit ? "Расход изменён" : "Расход добавлен", "ok");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
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
          <ModalCancel disabled={busy} />
          <Button variant="accent" loading={busy} onClick={submit}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Select label="Вид" value={kind} options={EXPENSE_KINDS} onChange={setKind} />
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Input label="Сумма" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="напр. 120.00" hint="Минус — компенсация (вернули часть денег)." />
          <Select label="Валюта" value={currency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} onChange={setCurrency} />
        </div>
        {foreign && (
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
            <Input label="Курс к гривне" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="напр. 41.5" />
            <Button variant="outline" icon={<CloudDownload className="h-4 w-4" />} loading={rateBusy} onClick={fetchRate} className="sm:mb-[2px]">
              Курс НБУ
            </Button>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Дата расхода" type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
          <Select
            label="На что"
            value={scope}
            options={[{ value: "ALL", label: "На всю поставку" }, ...lines.map((l) => ({ value: String(l.itemId), label: l.label }))]}
            onChange={setScope}
          />
        </div>
        <Input label="Примечание" value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} placeholder="напр. DHL, накладная 123" />
        {error && (
          <p role="alert" className="text-[13px] text-[var(--danger-ink)]">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`;
}
