"use client";

import { Button } from "@shop/ui/admin-button";
import { useConfirm } from "@shop/ui/confirm";
import { toast } from "@shop/ui/toast";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { costingApi, inputToMinor, procurementKeys, type OpeningRow } from "@/features/procurement";
import { money } from "@/lib/money";

/**
 * Массовое проставление (вариант B макета): «одна себестоимость выбранным». Это оценка, а не факт, поэтому перед
 * записью спрашиваем подтверждение с числом позиций. Пишет по одной позиции тем же запросом, что и ввод в строке.
 */
export function BulkOpeningBar({ rows, onClear }: { rows: OpeningRow[]; onClear: () => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const qc = useQueryClient();
  const minor = inputToMinor(value);
  const valid = minor != null && minor >= 0 && value.trim() !== "";

  async function apply() {
    if (minor == null) return;
    const ok = await confirm({
      title: `Поставить ${money(minor)} за штуку ${rows.length} позициям?`,
      message: "Это оценка для старого остатка, а не фактическая цена закупки. Маржа по этим позициям посчитается от неё.",
      confirmLabel: "Поставить",
    });
    if (!ok) return;
    setBusy(true);
    let done = 0;
    try {
      for (const r of rows) {
        await costingApi.setOpening({ productId: r.productId, variantId: r.variantId, unitCostMinor: minor });
        done++;
      }
      toast.success(`Проставлено: ${done}`);
      setValue("");
      onClear();
    } catch (e) {
      toast.error(`${e instanceof Error ? e.message : "Не удалось сохранить"} (проставлено ${done} из ${rows.length})`);
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: procurementKeys.opening() });
      void qc.invalidateQueries({ queryKey: procurementKeys.report() });
    }
  }

  return (
    <div className="elevated sticky bottom-[calc(var(--tabbar-h,0px)+12px)] z-20 mt-4 flex flex-wrap items-center gap-3 p-3">
      <span className="tabular min-w-0 flex-1 basis-32 text-[13px] text-[var(--text)]">
        Выбрано <b>{rows.length}</b>
      </span>
      <input
        aria-label="Себестоимость выбранным, ₴ за штуку"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && valid && !busy && void apply()}
        placeholder="₴ за штуку"
        className="h-[42px] w-32 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-[14px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
      />
      <Button variant="ghost" onClick={onClear} disabled={busy}>
        Снять
      </Button>
      <Button variant="accent" loading={busy} disabled={!valid} onClick={() => void apply()}>
        Поставить выбранным
      </Button>
    </div>
  );
}
