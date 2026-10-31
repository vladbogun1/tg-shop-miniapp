"use client";

import { Button } from "@shop/ui/admin-button";
import { useForm } from "@shop/ui/form";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { inputToMinor, lineTitle, minorToInput, type OpeningRow } from "@/features/procurement";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { useSetOpeningCost } from "../queries";

export function OpeningLine({ row }: { row: OpeningRow }) {
  const saved = minorToInput(row.unitCostMinor);
  const form = useForm<{ value: string }>({ defaultValues: { value: saved } });
  const value = form.watch("value");
  const setValue = (v: string) => form.setValue("value", v);
  const changed = value.trim() !== saved;
  const minor = inputToMinor(value);
  const invalid = value.trim() !== "" && (minor == null || minor < 0);

  const setCost = useSetOpeningCost();
  const save = {
    isPending: setCost.isPending,
    mutate: () =>
      setCost.mutate(
        {
          productId: row.productId,
          variantId: row.variantId,
          unitCostMinor: value.trim() ? minor : null,
        },
        { onSuccess: () => setValue(value.trim() ? minorToInput(minor) : "") },
      ),
  };

  const margin = minor != null && minor > 0 && row.priceMinor > 0 ? ((row.priceMinor - minor) / row.priceMinor) * 100 : null;

  return (
    <div className="card flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 p-3">
      <Image src={row.imageUrl} alt={row.title} size={120} className="h-12 w-12 shrink-0 rounded-[var(--r-md)] border border-[var(--line)]" />
      <div className="min-w-0 flex-1 basis-52">
        <div className="line-clamp-2 break-words text-[14px] font-semibold leading-snug text-[var(--text)]">
          {lineTitle(row.title, row.variantName)}
        </div>
        <div className="text-[12px] text-[var(--text-faint)]">
          {row.units} шт. · цена {money(row.priceMinor)}
          {margin != null && ` · маржа ${margin.toFixed(1).replace(".", ",")} %`}
        </div>
      </div>
      {row.unitCostMinor == null ? <Badge tone="warn">нет данных</Badge> : <Badge tone="ok">{money(row.unitCostMinor)}</Badge>}
      <div className="flex items-start gap-2">
        <Input
          aria-label="Себестоимость за штуку, ₴"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && changed && !invalid) save.mutate();
          }}
          placeholder="₴ за штуку"
          error={invalid ? "Некорректная сумма" : undefined}
          className="w-28"
        />
        <Button variant={changed ? "accent" : "outline"} loading={save.isPending} disabled={!changed || invalid} onClick={() => save.mutate()}>
          Сохранить
        </Button>
      </div>
    </div>
  );
}
