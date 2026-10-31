"use client";

/**
 * Карточка поставки → «Деньги»: валюта и курс (кнопка «Курс НБУ»), способ распределения расходов, цена закупки
 * по позициям и вес/ручная доля, итоговая себестоимость и маржа за штуку; расходы партии (доставка, растаможка…).
 * Только для тех, у кого есть право «Финансы» — страница не рендерит вкладку без него.
 */
import { Button } from "@shop/ui/admin-button";
import { useForm } from "@shop/ui/form";
import { AlertTriangle, CloudDownload, Save } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { QueryState } from "@/components/ui/QueryState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { Toggle } from "@/components/ui/Toggle";
import { pct } from "@/features/analytics";
import { ALLOCATIONS, CURRENCIES, lineTitle, type Allocation, type BatchMoney, type Expense } from "@/features/procurement";
import { cn } from "@/lib/cn";
import { money } from "@/lib/money";
import { EMPTY_DRAFT, moneyFormValues, toMoneyRequest, type LineDraft, type MoneyFormValues } from "../model/money-form";
import { useBatchMoney, useNbuRate, useSaveMoney } from "../queries";
import { ExpenseModal } from "./ExpenseModal";
import { ExpensesSection } from "./ExpensesSection";
import { MoneyLinesTable } from "./MoneyLinesTable";

export function BatchMoneyTab({ batchId }: { batchId: number }) {
  const q = useBatchMoney(batchId);
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка денег поставки">
      {q.data && <MoneyBody data={q.data} updatedAt={q.dataUpdatedAt} />}
    </QueryState>
  );
}

function MoneyBody({ data, updatedAt }: { data: BatchMoney; updatedAt: number }) {
  const form = useForm<MoneyFormValues>({
    defaultValues: moneyFormValues(data),
  });
  const v = form.watch();
  const [dirty, setDirty] = useState(false);
  const [expense, setExpense] = useState<{ edit: Expense | null } | null>(null);

  // Свежий ответ сервера (сохранение, правка расхода, любое обновление запроса) сбрасывает форму; первый рендер
  // уже взял значения из data. Срабатывает только на смену метки updatedAt, не на смену ссылки data.
  const seenAt = useRef(updatedAt);
  useEffect(() => {
    if (seenAt.current === updatedAt) return;
    seenAt.current = updatedAt;
    form.reset(moneyFormValues(data));
    setDirty(false);
  }, [updatedAt, data, form]);

  const set = useCallback(
    <K extends keyof MoneyFormValues>(key: K, value: MoneyFormValues[K]) => {
      form.setValue(key, value as never);
      setDirty(true);
    },
    [form],
  );
  const setLine = (id: number, patch: Partial<LineDraft>) =>
    set("lines", {
      ...v.lines,
      [id]: { ...(v.lines[id] ?? EMPTY_DRAFT), ...patch },
    });

  const save = useSaveMoney(data.batchId);
  const rate = useNbuRate((r) => set("fx", r), true);

  const alloc = ALLOCATIONS.find((a) => a.value === v.allocation);
  const needsRate = v.currency !== "UAH";
  const incomplete = data.lines.some((l) => !v.lines[l.itemId]?.price.trim());

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <CostsState final={v.costsFinal && !dirty} data={data} />
      </div>

      <MoneyProblems problems={data.problems} />

      <section className="card flex flex-col gap-4 p-4">
        <div className="grid items-end gap-3 sm:grid-cols-[10rem_1fr_auto]">
          <Select
            label="Валюта закупки"
            value={v.currency}
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            onChange={(c) => set("currency", c)}
          />
          <Input
            label="Курс к гривне"
            inputMode="decimal"
            value={needsRate ? v.fx : "1"}
            disabled={!needsRate}
            onChange={(e) => set("fx", e.target.value)}
            placeholder="напр. 41.5"
            hint={needsRate ? "Сколько ₴ за 1 единицу валюты." : "Закупка в гривнах — курс не нужен."}
          />
          {needsRate && (
            <Button
              variant="outline"
              icon={<CloudDownload className="h-4 w-4" />}
              loading={rate.isPending}
              onClick={() => rate.mutate({ currency: v.currency })}
              className="sm:mb-[22px]"
            >
              Курс НБУ
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="field-label">Как делить расходы по позициям</span>
          <SegmentedControl
            className="self-start"
            options={ALLOCATIONS.map((a) => ({
              value: a.value,
              label: a.label,
            }))}
            value={v.allocation}
            onChange={(a: Allocation) => set("allocation", a)}
          />
          {alloc && <span className="text-[12px] text-[var(--text-faint)]">{alloc.hint}</span>}
        </div>

        <Toggle checked={v.costsFinal} onChange={(x) => set("costsFinal", x)} label="Все расходы внесены (себестоимость окончательная)" />
      </section>

      <MoneyLinesTable lines={data.lines} drafts={v.lines} allocation={v.allocation} currency={v.currency} onChange={setLine} />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="accent"
          icon={<Save className="h-4 w-4" />}
          loading={save.isPending}
          disabled={!dirty}
          onClick={() => save.mutate(toMoneyRequest(data, v))}
        >
          Сохранить
        </Button>
        {dirty && <span className="text-[12.5px] text-[var(--text-muted)]">Себестоимость и маржа в таблице пересчитаются после сохранения.</span>}
        {!dirty && incomplete && <span className="text-[12.5px] text-[var(--warn)]">Не у всех позиций внесена цена закупки.</span>}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Total label="Закупка" value={money(data.purchaseMinor)} />
        <Total label="Расходы" value={money(data.expensesMinor)} sub={data.expensesPct != null ? `${pct(data.expensesPct)} от закупки` : undefined} />
        <Total label="Всего" value={money(data.totalMinor)} />
        <Total
          label="Не распределено"
          value={money(data.unassignedMinor)}
          warn={data.unassignedMinor !== 0}
          sub={data.unassignedMinor !== 0 ? "расходы без позиции, куда их отнести" : undefined}
        />
      </div>

      <ExpensesSection data={data} onEdit={(edit) => setExpense({ edit })} />

      {expense && (
        <ExpenseModal
          batchId={data.batchId}
          edit={expense.edit}
          lines={data.lines.map((l) => ({
            itemId: l.itemId,
            label: lineTitle(l.title, l.variantName),
          }))}
          defaultCurrency={v.currency}
          defaultRate={needsRate ? v.fx : ""}
          onClose={() => setExpense(null)}
        />
      )}
    </div>
  );
}

function CostsState({ final, data }: { final: boolean; data: BatchMoney }) {
  return (
    <>
      {final ? (
        <Badge tone="ok" dot>
          себестоимость окончательная
        </Badge>
      ) : (
        <Badge tone="warn" dot>
          себестоимость предварительная
        </Badge>
      )}
      {data.preliminary && !data.costsFinal && <span className="text-[12.5px] text-[var(--text-muted)]">пока не отмечено «Все расходы внесены»</span>}
    </>
  );
}

function MoneyProblems({ problems }: { problems: string[] }) {
  if (problems.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--warn)_45%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] p-3 text-[13px] text-[var(--text)]">
      {problems.map((p, i) => (
        <div key={i} className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warn)]" />
          <span>{p}</span>
        </div>
      ))}
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
