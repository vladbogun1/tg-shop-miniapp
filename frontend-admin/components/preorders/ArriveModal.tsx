"use client";

/**
 * «Приехала»: по каждой позиции «пришло» и цена продажи; режим раздачи и часы брони.
 * «Посчитать» — предпросмотр (dryRun), «Подтвердить» — настоящий приход: остаток, цены, брони, рассылка.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { COSTING_KEY, costingApi, useFinanceAccess } from "@/lib/costing";
import { pct } from "@/components/metrics/format";
import { money, toMajor, toMinor } from "@/lib/money";
import {
  DISTRIBUTIONS,
  PREORDERS_KEY,
  costUahMinor,
  lineTitle,
  preordersApi,
  type ArriveResult,
  type Batch,
  type Distribution,
} from "@/lib/preorders";
import { useToast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal, ModalCancel } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";

interface Row {
  qty: string;
  price: string;
}

export function ArriveModal({ open, onClose, batch }: { open: boolean; onClose: () => void; batch: Batch }) {
  const qc = useQueryClient();
  const { push } = useToast();
  const [rows, setRows] = useState<Record<number, Row>>({});
  const [distribution, setDistribution] = useState<Distribution>("QUEUE_HOLD");
  const [holdHours, setHoldHours] = useState("24");
  const [preview, setPreview] = useState<ArriveResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Себестоимость штуки из этой поставки — только с правом «Финансы»; без права (или 403/404) молча не показываем.
  const finance = useFinanceAccess();
  const moneyQ = useQuery({
    queryKey: [...COSTING_KEY, "batch", batch.id],
    queryFn: () => costingApi.money(batch.id),
    enabled: open && finance,
    retry: false,
  });

  useEffect(() => {
    if (!open) return;
    setRows(Object.fromEntries(batch.items.map((i) => [i.id, { qty: String(i.qtyOrdered), price: String(toMajor(i.priceMinor)) }])));
    setDistribution(batch.distribution);
    setHoldHours(String(batch.holdHours));
    setPreview(null);
    setError(null);
  }, [open, batch]);

  const body = useMemo(
    () => ({
      distribution,
      holdHours: Number(holdHours) || batch.holdHours,
      items: batch.items.map((i) => {
        const r = rows[i.id] ?? { qty: String(i.qtyOrdered), price: String(toMajor(i.priceMinor)) };
        const priceMinor = toMinor(r.price.replace(",", "."));
        return {
          itemId: i.id,
          qtyArrived: Math.max(0, Number(r.qty) || 0),
          // цену шлём только если её поменяли
          priceMinor: priceMinor > 0 && priceMinor !== i.priceMinor ? priceMinor : null,
        };
      }),
    }),
    [rows, distribution, holdHours, batch]
  );

  const run = useMutation({
    mutationFn: (dryRun: boolean) => preordersApi.arrive(batch.id, { dryRun, ...body }),
    onSuccess: (res, dryRun) => {
      setError(null);
      if (dryRun) {
        setPreview(res);
        return;
      }
      qc.invalidateQueries({ queryKey: PREORDERS_KEY });
      qc.invalidateQueries({ queryKey: ["products"] });
      const held = res.lines.reduce((n, l) => n + l.heldPeople, 0);
      push(`Приход проведён. Бронь получили ${held} чел.`, "ok");
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Не получилось"),
  });

  function edit(id: number, patch: Partial<Row>, i: Batch["items"][number]) {
    setRows((r) => ({ ...r, [id]: { ...(r[id] ?? { qty: String(i.qtyOrdered), price: String(toMajor(i.priceMinor)) }), ...patch } }));
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
          <Button variant="outline" loading={run.isPending && run.variables === true} onClick={() => run.mutate(true)}>
            Посчитать
          </Button>
          <Button variant="accent" disabled={!preview} loading={run.isPending && run.variables === false} onClick={() => run.mutate(false)}>
            Подтвердить
          </Button>
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-4">
        <p className="text-[13px] text-[var(--text-muted)]">
          Укажите, сколько приехало и по какой цене продаём. После «Подтвердить» остаток пополнится, цена обновится, а ждущие получат сообщение от бота.
        </p>

        <div className="flex flex-col gap-2">
          {batch.items.map((i) => {
            const r = rows[i.id] ?? { qty: String(i.qtyOrdered), price: String(toMajor(i.priceMinor)) };
            const res = preview?.lines.find((l) => l.itemId === i.id);
            const unitCost = moneyQ.data?.lines.find((l) => l.itemId === i.id)?.costUnitMinor ?? null;
            const priceNow = toMinor(r.price.replace(",", "."));
            const marginPct = unitCost != null && priceNow > 0 ? ((priceNow - unitCost) / priceNow) * 100 : null;
            const cost = batch.moneyVisible ? costUahMinor(i.unitPriceFx, batch.fxRate) : null;
            return (
              <div key={i.id} className="card-2 flex min-w-0 flex-col gap-2 p-3">
                <div className="flex min-w-0 flex-wrap items-end gap-3">
                  <div className="min-w-0 flex-1 basis-52">
                    <div className="line-clamp-2 break-words text-[14px] font-semibold text-[var(--text)]">{lineTitle(i.title, i.variantName)}</div>
                    <div className="tabular text-[12px] text-[var(--text-faint)]">
                      заказано {i.qtyOrdered} · сейчас на складе {i.stock} · ждут {i.waitingPeople} чел / {i.waitingQty} шт · цена {money(i.priceMinor)}
                      {cost != null && ` · закупка ≈ ${money(cost)}/шт`}
                    </div>
                  </div>
                  <div className="w-24">
                    <Input label="Пришло, шт" inputMode="numeric" value={r.qty} onChange={(e) => edit(i.id, { qty: e.target.value.replace(/[^\d]/g, "") }, i)} />
                  </div>
                  <div className="w-32">
                    <Input label="Цена продажи, ₴" inputMode="decimal" value={r.price} onChange={(e) => edit(i.id, { price: e.target.value }, i)} />
                    {unitCost != null && (
                      <div className="tabular mt-1 text-[11.5px] leading-snug text-[var(--text-faint)]">
                        себестоимость {money(unitCost)}
                        {marginPct != null && (
                          <>
                            {" · маржа "}
                            <b className={marginPct < 10 ? "text-[var(--danger-ink)]" : "text-[var(--ok)]"}>{pct(marginPct)}</b>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {res && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[var(--r-sm)] bg-[var(--surface-3)] px-2.5 py-1.5 text-[13px]">
                    <span className="text-[var(--text)]">
                      бронь получат <b>{res.heldPeople}</b> чел ({res.heldQty} шт)
                    </span>
                    {res.notifiedPeople > 0 && <span className="text-[var(--text)]">сообщение получат <b>{res.notifiedPeople}</b> чел</span>}
                    <span className={res.shortPeople > 0 ? "text-[var(--warn)]" : "text-[var(--text-muted)]"}>не хватит {res.shortPeople} чел</span>
                    <span className="text-[var(--text-muted)]">свободно в продажу {res.freeAfter} шт</span>
                    <span className="text-[var(--text-faint)]">остаток после: {res.stockAfter}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Как раздавать"
            value={distribution}
            options={DISTRIBUTIONS}
            onChange={(v) => {
              setDistribution(v as Distribution);
              setPreview(null);
            }}
          />
          <Input
            label="Бронь, часов"
            inputMode="numeric"
            value={holdHours}
            onChange={(e) => {
              setHoldHours(e.target.value.replace(/[^\d]/g, ""));
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
