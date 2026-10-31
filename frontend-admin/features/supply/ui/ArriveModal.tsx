"use client";

/**
 * «Приехала»: по каждой позиции «пришло» и цена продажи; режим раздачи и часы брони.
 * «Посчитать» — предпросмотр (dryRun), «Подтвердить» — настоящий приход: остаток, цены, брони, рассылка.
 */
import { Button } from "@shop/ui/admin-button";
import { useForm } from "@shop/ui/form";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { DISTRIBUTIONS, useFinanceAccess, type ArriveResult, type Batch, type Distribution } from "@/features/procurement";
import { toMajor, toMinor } from "@/lib/money";
import { useArrive, useBatchCosting } from "../queries";
import { ArriveLine, type ArriveRow } from "./ArriveLine";

type Row = ArriveRow;

interface Values {
  rows: Record<number, Row>;
  distribution: Distribution;
  holdHours: string;
}

export function ArriveModal({ open, onClose, batch }: { open: boolean; onClose: () => void; batch: Batch }) {
  const form = useForm<Values>({
    defaultValues: { rows: {}, distribution: "QUEUE_HOLD", holdHours: "24" },
  });
  const { rows, distribution, holdHours } = form.watch();
  const [preview, setPreview] = useState<ArriveResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Себестоимость штуки из этой поставки — только с правом «Финансы»; без права (или 403/404) молча не показываем.
  const finance = useFinanceAccess();
  const moneyQ = useBatchCosting(batch.id, open && finance);

  useEffect(() => {
    if (!open) return;
    form.reset({
      rows: Object.fromEntries(batch.items.map((i) => [i.id, { qty: String(i.qtyOrdered), price: String(toMajor(i.priceMinor)) }])),
      distribution: batch.distribution,
      holdHours: String(batch.holdHours),
    });
    setPreview(null);
    setError(null);
  }, [open, batch, form]);

  const body = useMemo(
    () => ({
      distribution,
      holdHours: Number(holdHours) || batch.holdHours,
      items: batch.items.map((i) => {
        const r = rows[i.id] ?? {
          qty: String(i.qtyOrdered),
          price: String(toMajor(i.priceMinor)),
        };
        const priceMinor = toMinor(r.price.replace(",", "."));
        return {
          itemId: i.id,
          qtyArrived: Math.max(0, Number(r.qty) || 0),
          // цену шлём только если её поменяли
          priceMinor: priceMinor > 0 && priceMinor !== i.priceMinor ? priceMinor : null,
        };
      }),
    }),
    [rows, distribution, holdHours, batch],
  );

  const run = useArrive(batch.id, {
    onPreview: setPreview,
    onDone: onClose,
    onError: setError,
  });

  function edit(id: number, patch: Partial<Row>, i: Batch["items"][number]) {
    const cur = rows[id] ?? {
      qty: String(i.qtyOrdered),
      price: String(toMajor(i.priceMinor)),
    };
    form.setValue("rows", { ...rows, [id]: { ...cur, ...patch } });
    setPreview(null); // цифры поменялись — прежний расчёт устарел
  }

  const totals = preview
    ? {
        held: preview.lines.reduce((n, l) => n + l.heldPeople, 0),
        short: preview.lines.reduce((n, l) => n + l.shortPeople, 0),
      }
    : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      title={`Приехала: ${batch.title}`}
      footer={
        <>
          {error && <p className="mr-auto min-w-0 text-[13px] text-[var(--danger-ink)]">{error}</p>}
          <ModalCancel />
          <Button variant="outline" loading={run.isPending && run.variables?.dryRun === true} onClick={() => run.mutate({ dryRun: true, body })}>
            Посчитать
          </Button>
          <Button
            variant="accent"
            disabled={!preview}
            loading={run.isPending && run.variables?.dryRun === false}
            onClick={() => run.mutate({ dryRun: false, body })}
          >
            Подтвердить
          </Button>
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-4">
        <p className="text-[13px] text-[var(--text-muted)]">
          Укажите, сколько приехало и по какой цене продаём. После «Подтвердить» остаток пополнится, цена обновится, а ждущие получат сообщение от
          бота.
        </p>

        <div className="flex flex-col gap-2">
          {batch.items.map((i) => (
            <ArriveLine
              key={i.id}
              batch={batch}
              item={i}
              row={
                rows[i.id] ?? {
                  qty: String(i.qtyOrdered),
                  price: String(toMajor(i.priceMinor)),
                }
              }
              res={preview?.lines.find((l) => l.itemId === i.id)}
              unitCost={moneyQ.data?.lines.find((l) => l.itemId === i.id)?.costUnitMinor ?? null}
              onEdit={(patch) => edit(i.id, patch, i)}
            />
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Как раздавать"
            value={distribution}
            options={DISTRIBUTIONS}
            onChange={(v) => {
              form.setValue("distribution", v as Distribution);
              setPreview(null);
            }}
          />
          <Input
            label="Бронь, часов"
            inputMode="numeric"
            value={holdHours}
            onChange={(e) => {
              form.setValue("holdHours", e.target.value.replace(/[^\d]/g, ""));
              setPreview(null);
            }}
            disabled={distribution === "ALL_AT_ONCE"}
          />
        </div>

        {totals && (
          <div
            className={
              "flex items-start gap-2 rounded-[var(--r-md)] border p-3 text-[13px] " +
              (totals.short > 0 ? "border-[var(--warn)] text-[var(--warn)]" : "border-[var(--ok)] text-[var(--ok)]")
            }
          >
            {totals.short > 0 ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>
              Итого: бронь получат {totals.held} чел, не хватит {totals.short} чел. Проверьте и нажмите «Подтвердить» — рассылка пойдёт сразу.
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}
