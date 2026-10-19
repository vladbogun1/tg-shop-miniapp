"use client";

/**
 * «Предпросмотр»: what a customer sees in «Вместе дешевле» next to a product — by the SAVED terms,
 * pairs and margins (the server picks the slots, also while the feature is switched off). Each slot
 * shows its primary with the score breakdown (Pair × Demand × Match × Price × Stock × Margin), its
 * colours and alternatives, and the percent cap from the margin; below — «Собери сетап».
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, RefreshCw } from "lucide-react";
import {
  BUNDLE_MAX_ADDON_UNITS,
  bundleDiscount,
  bundlePercent,
  type BundleOfferItem,
  type BundleSlot,
} from "@shop/shared";
import { adminApi, type AdminProduct } from "@/lib/api";
import { bundlesApi, type BundleRule } from "@/lib/bundles";
import { productStock } from "@/lib/stock";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { QueryState } from "@/components/ui/QueryState";
import { PanelHeader } from "../settings/PanelHeader";
import { ProductPickModal } from "@/components/ProductPickModal";
import { RULES_KEY } from "./RulesPanel";

const REASON: Record<string, string> = { COLOR_MATCH: "в цвет", HIT: "хит", LAST_ONE: "последний" };
const ALT: Record<string, string> = { COLOR_MATCH: "в цвет", CHEAPER: "дешевле", OTHER_BRAND: "другой бренд" };

export function PreviewPanel() {
  const [picked, setPicked] = useState<AdminProduct | null>(null);
  const [picking, setPicking] = useState(false);

  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => adminApi.products(), staleTime: 60_000 });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: adminApi.categories, staleTime: 60_000 });
  const { data: rules = [] } = useQuery({ queryKey: RULES_KEY, queryFn: bundlesApi.rules });

  // Until the admin picks one: an in-stock product from the source category of the first active pair.
  const fallback = useMemo(() => {
    const rule = [...rules].filter((r) => r.active).sort((a, b) => a.sortOrder - b.sortOrder)[0] as BundleRule | undefined;
    if (!rule) return null;
    const ids = new Set([rule.sourceCategoryId, ...categories.filter((c) => c.parentId === rule.sourceCategoryId).map((c) => c.id)]);
    return (
      products.find((p) => !p.archived && p.active !== false && p.categoryId && ids.has(p.categoryId) && productStock(p) > 0) ?? null
    );
  }, [rules, categories, products]);
  const product = picked ?? fallback;

  const previewQ = useQuery({
    queryKey: ["bundles", "preview", product?.id],
    queryFn: () => bundlesApi.preview(product!.id),
    enabled: !!product,
  });
  const terms = previewQ.data?.terms;
  const slots: BundleSlot[] = previewQ.data?.slots ?? [];
  const setup: BundleSlot[] = previewQ.data?.setup ?? [];
  const tiers = terms ? Array.from({ length: BUNDLE_MAX_ADDON_UNITS }, (_, i) => bundlePercent(terms, i + 1)) : [];
  // Every slot's primary taken at once — what the block's total shows on the product page.
  const all = terms
    ? bundleDiscount(
        { ...terms, enabled: true },
        slots.map((s) => ({ priceMinor: s.primary.product.priceMinor, capPercent: s.primary.capPercent })),
      )
    : null;

  return (
    <section className="panel min-w-0 p-4 sm:p-5">
      <PanelHeader
        icon={Eye}
        title="Предпросмотр"
        description="Что увидит покупатель рядом с товаром — по сохранённым настройкам, парам и маржам. Баллы — почему выбран этот товар."
      />

      <div className="card-2 flex min-w-0 items-center gap-3 p-2.5">
        {product ? (
          <>
            <Image
              src={product.images?.[0]?.url}
              alt={product.title}
              size={120}
              className="h-12 w-12 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-3)]"
            />
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 break-words text-[14px] font-semibold leading-snug text-[var(--text)]">{product.title}</div>
              <div className="tabular text-[12px] text-[var(--text-faint)]">
                {money(product.priceMinor, product.currency)}
                {terms && ` · аксессуары до ${money(Math.floor((product.priceMinor * terms.maxAddonPricePercent) / 100), product.currency)}`}
              </div>
            </div>
          </>
        ) : (
          <div className="min-w-0 flex-1 text-[13px] text-[var(--text-muted)]">Выберите товар, чтобы увидеть предложение.</div>
        )}
        <Button size="sm" variant="surface" className="shrink-0" onClick={() => setPicking(true)}>
          {product ? "Другой" : "Выбрать"}
        </Button>
      </div>

      {product && (
        <div className="mt-3">
          <QueryState
            isLoading={previewQ.isLoading}
            isError={previewQ.isError}
            error={previewQ.error}
            refetch={previewQ.refetch}
            loadingLabel="Считаем предложение"
          >
            {terms && (
              <>
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  {terms.enabled ? <Badge tone="ok">Включено</Badge> : <Badge tone="warn">Выключено — покупатели не видят</Badge>}
                  {tiers.map((p, i) => (
                    <Badge key={i}>
                      {i + 1} шт · −{p}%
                    </Badge>
                  ))}
                  {terms.maxDiscountMinor > 0 && <Badge>потолок {money(terms.maxDiscountMinor)}</Badge>}
                  {(terms.holdoutPercent ?? 0) > 0 && <Badge>контроль {terms.holdoutPercent}%</Badge>}
                </div>

                {slots.length === 0 ? (
                  <p className="card-2 p-3 text-[13px] text-[var(--text-muted)]">
                    Предложить нечего: нет пары для категории этого товара или все подходящие аксессуары дороже порога / не в наличии.
                  </p>
                ) : (
                  <ul className="flex min-w-0 flex-col gap-2">
                    {slots.map((s, i) => (
                      <SlotCard key={s.categoryId + i} slot={s} index={i + 1} tiers={tiers} />
                    ))}
                  </ul>
                )}

                {all && slots.length > 0 && (
                  <p className="mt-2.5 text-[12.5px] leading-snug text-[var(--text-muted)]">
                    Если взять первые товары всех слотов: скидка{" "}
                    <b className="tabular text-[var(--ok)]">
                      {money(all.discountMinor)} (до −{all.percent}%)
                    </b>
                    {slots.length > BUNDLE_MAX_ADDON_UNITS && `, скидка действует на ${BUNDLE_MAX_ADDON_UNITS} самых дорогих`}.
                  </p>
                )}

                {setup.length > 0 && (
                  <div className="mt-4 border-t border-[var(--line)] pt-3">
                    <div className="field-label mb-2">
                      Собери сетап{terms.setupEnabled ? "" : " — выключено"}
                      {(terms.setupPercent ?? 0) > 0 && ` · −${terms.setupPercent}% на всё, кроме самого дорогого`}
                    </div>
                    <ul className="flex min-w-0 flex-col gap-2">
                      {setup.map((s, i) => (
                        <SlotCard key={s.categoryId + i} slot={s} index={i + 1} tiers={[]} />
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => previewQ.refetch()}
                  className="focusable hit mt-2 inline-flex items-center gap-1.5 rounded-[var(--r-sm)] px-1 py-1 text-[12px] font-semibold text-[var(--text-faint)] hover:text-[var(--text)]"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Обновить
                </button>
              </>
            )}
          </QueryState>
        </div>
      )}

      <ProductPickModal
        open={picking}
        title="Товар для предпросмотра"
        selectedId={product?.id}
        onClose={() => setPicking(false)}
        onPick={setPicked}
      />
    </section>
  );
}

function SlotCard({ slot, index, tiers }: { slot: BundleSlot; index: number; tiers: number[] }) {
  const it = slot.primary;
  const p = it.product;
  const sc = it.score;
  return (
    <li className="card-2 min-w-0 p-2.5">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-[var(--text-faint)]">
        <span className="font-semibold text-[var(--text-muted)]">
          {index}. {slot.categoryName ?? "—"}
        </span>
        {slot.pairPercent > 0 && <span>· берут вместе {slot.pairPercent}%</span>}
        {slot.explore && <Badge tone="accent">проба: второй по баллам</Badge>}
      </div>
      <div className="flex min-w-0 items-start gap-3">
        <Image
          src={p.images?.[0]?.url}
          alt={p.title}
          size={120}
          className="h-14 w-14 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-3)]"
        />
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 break-words text-[13.5px] font-semibold leading-snug text-[var(--text)]">{p.title}</div>
          <div className="tabular mt-0.5 text-[12px] text-[var(--text-faint)]">
            {money(p.priceMinor, p.currency)} · {productStock(p as AdminProduct)} шт · потолок −{it.capPercent}%
            {it.reasons.length > 0 && ` · ${it.reasons.map((r) => REASON[r] ?? r).join(", ")}`}
          </div>
          {tiers.length > 0 && (
            <div className="tabular mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px]">
              {tiers.map((t, i) => {
                const pct = Math.min(t, it.capPercent);
                return (
                  <span key={i} className="whitespace-nowrap">
                    <span className="text-[var(--text-faint)]">{i + 1} шт −{pct}%</span>{" "}
                    <b className="text-[var(--ok)]">{money(p.priceMinor - Math.floor((p.priceMinor * pct) / 10000) * 100, p.currency)}</b>
                  </span>
                );
              })}
            </div>
          )}
          {sc && (
            <div className="tabular mt-1 text-[11.5px] text-[var(--text-faint)]">
              балл {sc.total.toFixed(2)} = пара {sc.pair.toFixed(2)} × спрос {sc.demand.toFixed(2)} × подходит {sc.match.toFixed(2)} × цена{" "}
              {sc.price.toFixed(2)} × остаток {sc.stock.toFixed(2)} × маржа {sc.margin.toFixed(2)}
            </div>
          )}
        </div>
      </div>
      {(slot.colors.length > 0 || slot.alternatives.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-[68px]">
          {slot.colors.map((c) => (
            <Mini key={c.product.id} item={c} label="цвет" />
          ))}
          {slot.alternatives.map((a) => (
            <Mini key={a.product.id} item={a} label={a.kind ? ALT[a.kind] ?? a.kind : "вариант"} />
          ))}
        </div>
      )}
    </li>
  );
}

function Mini({ item, label }: { item: BundleOfferItem; label: string }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-3)] py-0.5 pl-0.5 pr-2 text-[11.5px]"
      title={item.product.title}
    >
      <Image src={item.product.images?.[0]?.url} alt="" size={60} className="h-6 w-6 shrink-0 rounded-[4px]" />
      <span className="text-[var(--text-faint)]">{label}</span>
      <span className="max-w-[160px] truncate text-[var(--text)]">{item.product.title}</span>
    </span>
  );
}
