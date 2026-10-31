"use client";

import { Search, Trash2 } from "lucide-react";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Image } from "@/lib/image";
import { Input } from "@/components/ui/Input";
import type { ExchangeDraft } from "./use-exchange-draft";
import type { ReturnOrder } from "../../model/types";
import { Stepper } from "./Stepper";

export function ExchangeNew({ d, order }: { d: ExchangeDraft; order: ReturnOrder }) {
  const cur = order.currency;
  const { picked } = d;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="field-label">2. На что меняем</div>
      {d.lines.map((l) => {
        const max = l.qty + d.stock(l.product, l.variant);
        return (
          <div key={l.key} className="card-2 flex items-center gap-3 px-3 py-2">
            <Image
              src={l.product.images?.[0]?.url}
              alt={l.product.title}
              size={96}
              className="h-10 w-10 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-3)]"
            />
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 break-words text-[13.5px] leading-snug font-semibold text-[var(--text)]">
                {l.product.title}
              </div>
              <div className="text-[12px] text-[var(--text-faint)]">
                {l.variant ? `${l.variant.name} · ` : ""}
                {money(l.product.priceMinor, cur)} × {l.qty} = {money(l.product.priceMinor * l.qty, cur)}
              </div>
            </div>
            <Stepper value={l.qty} min={1} max={max} onChange={(n) => d.setLineQty(l.key, n)} />
            <button
              type="button"
              aria-label="Убрать"
              onClick={() => d.removeLine(l.key)}
              className="hit grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--text-faint)] hover:text-[var(--danger-ink)]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        );
      })}

      {picked ? (
        <div className="card-2 flex flex-col gap-2.5 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[13.5px] font-semibold text-[var(--text)]">{picked.title} — вариант:</span>
            <button
              type="button"
              onClick={() => d.setPicked(null)}
              className="font-display hit shrink-0 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--accent-hi)] hover:underline"
            >
              Другой товар
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {picked.variants!.map((v) => {
              const left = d.stock(picked, v);
              return (
                <button
                  key={v.id ?? v.name}
                  type="button"
                  disabled={left <= 0}
                  onClick={() => d.addLine(picked, v)}
                  className={cn(
                    "nb-chip nb-press h-8 px-3.5 text-[12.5px] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)]",
                    left <= 0 && "opacity-40",
                  )}
                >
                  {v.name} · {Math.max(0, left)}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          <Input
            label={d.lines.length ? "Добавить ещё товар" : "Поиск товара на замену"}
            icon={<Search className="h-4 w-4" />}
            value={d.q}
            onChange={(e) => d.setQ(e.target.value)}
            placeholder="Название…"
          />
          <div className="thin-scroll flex max-h-60 flex-col gap-1.5 overflow-auto">
            {d.filtered.map((p) => {
              const left = d.stock(p, null);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => d.pick(p)}
                  disabled={left <= 0}
                  className={cn(
                    "card-2 flex shrink-0 items-center gap-3 p-2 text-left transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)]",
                    left <= 0 && "opacity-40",
                  )}
                >
                  <Image
                    src={p.images?.[0]?.url}
                    alt={p.title}
                    size={96}
                    className="h-10 w-10 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-3)]"
                  />
                  <span className="min-w-0 flex-1 line-clamp-2 break-words text-[14px] leading-snug font-semibold text-[var(--text)]">
                    {p.title}
                  </span>
                  <span className="tabular shrink-0 text-[12.5px] font-semibold text-[var(--text-muted)]">
                    {money(p.priceMinor, p.currency)}
                  </span>
                  <span className="tabular w-12 shrink-0 pr-1 text-right text-[12px] font-medium text-[var(--text-faint)]">
                    {Math.max(0, left)} шт
                  </span>
                </button>
              );
            })}
            {d.filtered.length === 0 && <p className="p-2 text-[13px] text-[var(--text-faint)]">Ничего не найдено.</p>}
          </div>
        </>
      )}
    </div>
  );
}
