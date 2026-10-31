"use client";

/**
 * «Упор на скидки» (docs/GIFT-CASE.md): brands and single products the shop earns (almost) nothing on.
 * An order with one still gets its case, but product prizes drop rarer — their share is set per tier
 * («Настройки» of a tier) — and a promo code from the case does not apply to these products.
 * Each change is saved at once (PUT /api/admin/gift/low-margin).
 */
import { useState } from "react";
import { BadgePercent, Plus, X } from "lucide-react";
import { CATALOG_STALE_MS, useBrandsQuery } from "@/features/catalog";
import type { LowMarginBody } from "../model/types";
import { useLowMarginQuery, useSetLowMargin } from "../queries";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { Button } from "@shop/ui/admin-button";
import { Select } from "@/components/ui/Select";
import { ProductPickModal } from "@/features/product";
import { PanelHeader } from "@/components/ui/PanelHeader";

export function LowMarginPanel() {
  const q = useLowMarginQuery();
  const setLowMargin = useSetLowMargin();
  const brandsQ = useBrandsQuery({ staleTime: CATALOG_STALE_MS });
  const [picking, setPicking] = useState(false);
  const busy = setLowMargin.isPending;
  const data = q.data;

  const save = (body: LowMarginBody, okText: string) => setLowMargin.mutate({ body, okText });

  const brandSlugs = data?.brands.map((b) => b.slug) ?? [];
  const productIds = data?.products.map((p) => p.id) ?? [];
  const brandOptions = (brandsQ.data ?? [])
    .filter((b) => !brandSlugs.includes(b.slug))
    .map((b) => ({ value: b.slug, label: `${b.name} · ${b.productCount}` }));

  return (
    <section className="panel mt-4 min-w-0 p-4 sm:p-5">
      <PanelHeader
        icon={BadgePercent}
        title="Упор на скидки"
        description="Товары, на которых магазин почти не зарабатывает (например, Lamzu). Заказ с ними получает кейс как обычно, но товарные призы выпадают реже — доля у каждого уровня в «Настройках» кейса — а промокоды (любые, не только из кейса) на эти товары не действуют."
      />
      {!data ? (
        <p className="mt-3 text-[13px] text-[var(--text-muted)]">{q.isError ? "Не удалось загрузить список" : "Загрузка…"}</p>
      ) : (
        <div className="mt-3 flex min-w-0 flex-col gap-4">
          <div className="min-w-0">
            <div className="field-label">Бренды целиком</div>
            <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
              {data.brands.length === 0 && <span className="text-[12.5px] text-[var(--text-faint)]">Нет</span>}
              {data.brands.map((b) => (
                <Chip
                  key={b.slug}
                  disabled={busy}
                  label={`${b.name} · ${b.productCount} шт.`}
                  onRemove={() =>
                    save({ brands: brandSlugs.filter((s) => s !== b.slug) }, `${b.name}: снова обычный кейс`)
                  }
                />
              ))}
            </div>
            {brandOptions.length > 0 && (
              <div className="mt-2 w-full max-w-[320px]">
                <Select
                  value=""
                  options={brandOptions}
                  placeholder="Добавить бренд…"
                  onChange={(slug) => {
                    const name = brandsQ.data?.find((b) => b.slug === slug)?.name ?? slug;
                    save({ brands: [...brandSlugs, slug] }, `${name}: упор на скидки`);
                  }}
                />
              </div>
            )}
          </div>

          <div className="min-w-0">
            <div className="field-label">Отдельные товары</div>
            {data.products.length === 0 ? (
              <p className="mt-1 text-[12.5px] text-[var(--text-faint)]">Нет</p>
            ) : (
              <ul className="mt-1.5 flex min-w-0 flex-col gap-1.5">
                {data.products.map((p) => (
                  <li key={p.id} className="card-2 flex min-w-0 items-center gap-2.5 p-2">
                    <Image src={p.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded-[var(--r-sm)] object-cover" />
                    <span className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-snug text-[var(--text)]">{p.title}</span>
                    {p.priceMinor > 0 && <span className="tabular shrink-0 text-[12.5px] text-[var(--text-muted)]">{money(p.priceMinor)}</span>}
                    <button
                      type="button"
                      disabled={busy}
                      aria-label="Убрать товар"
                      onClick={() =>
                        save({ products: productIds.filter((id) => id !== p.id) }, "Товар: снова обычный кейс")
                      }
                      className="focusable grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--text-faint)] hover:text-[var(--danger-ink)] pointer-coarse:h-10 pointer-coarse:w-10"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Button className="mt-2" size="sm" variant="surface" icon={<Plus className="h-3.5 w-3.5" />} disabled={busy} onClick={() => setPicking(true)}>
              Добавить товар
            </Button>
          </div>

          <p className="text-[12px] leading-snug text-[var(--text-muted)]">
            Под пометкой сейчас <b className="tabular text-[var(--text)]">{data.productCount}</b> активных товаров. «Автособрать» их в
            призы не предлагает. Проверить, что выпадает, — «Тест кейса» с переключателем «Заказ с товаром „упор на скидки“».
          </p>
        </div>
      )}

      <ProductPickModal
        open={picking}
        title="Товар с упором на скидки"
        onClose={() => setPicking(false)}
        onPick={(p) => {
          setPicking(false);
          if (!productIds.includes(p.id)) save({ products: [...productIds, p.id] }, `${p.title}: упор на скидки`);
        }}
      />
    </section>
  );
}

function Chip({ label, onRemove, disabled }: { label: string; onRemove: () => void; disabled?: boolean }) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface-2)] py-1 pl-3 pr-1 text-[13px] font-semibold text-[var(--text)]">
      <span className="truncate">{label}</span>
      <button
        type="button"
        disabled={disabled}
        aria-label={`Убрать ${label}`}
        onClick={onRemove}
        className="focusable grid h-6 w-6 shrink-0 place-items-center rounded-full text-[var(--text-faint)] hover:text-[var(--danger-ink)] pointer-coarse:h-8 pointer-coarse:w-8"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}
