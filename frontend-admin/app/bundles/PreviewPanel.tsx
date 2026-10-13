"use client";

/**
 * «Предпросмотр»: what a customer sees in «Вместе дешевле» next to a product — by the SAVED terms
 * and pairs (the server picks the items, also while the feature is switched off). Prices per tier
 * are computed with the same helpers as the shop (`bundleUnitDiscount`, `bundleDiscount`).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, RefreshCw } from "lucide-react";
import { BUNDLE_MAX_ADDON_UNITS, bundleDiscount, bundlePercent, bundleUnitDiscount } from "@shop/shared";
import { adminApi, type AdminProduct } from "@/lib/api";
import { bundlesApi, productStock, type BundleRule } from "@/lib/bundles";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { QueryState } from "@/components/ui/QueryState";
import { PanelHeader } from "../settings/PanelHeader";
import { ProductPickModal } from "./ProductPickModal";
import { RULES_KEY } from "./RulesPanel";

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
  const items = previewQ.data?.items ?? [];
  const tiers = terms ? Array.from({ length: BUNDLE_MAX_ADDON_UNITS }, (_, i) => bundlePercent(terms, i + 1)) : [];
  // Everything offered taken at once — what the block's total shows on the product page.
  const all = terms ? bundleDiscount({ ...terms, enabled: true }, items.map((p) => p.priceMinor)) : null;

  return (
    <section className="panel min-w-0 p-4 sm:p-5">
      <PanelHeader
        icon={Eye}
        title="Предпросмотр"
        description="Что увидит покупатель рядом с товаром — по сохранённым настройкам и парам."
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
                </div>

                {items.length === 0 ? (
                  <p className="card-2 p-3 text-[13px] text-[var(--text-muted)]">
                    Предложить нечего: нет пары для категории этого товара или все подходящие аксессуары дороже порога / не в наличии.
                  </p>
                ) : (
                  <ul className="flex min-w-0 flex-col gap-2">
                    {items.map((it) => (
                      <li key={it.id} className="card-2 flex min-w-0 items-start gap-3 p-2.5">
                        <Image
                          src={it.images?.[0]?.url}
                          alt={it.title}
                          size={120}
                          className="h-14 w-14 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-3)]"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-2 break-words text-[13.5px] font-semibold leading-snug text-[var(--text)]">{it.title}</div>
                          <div className="tabular mt-0.5 text-[12px] text-[var(--text-faint)]">
                            {money(it.priceMinor, it.currency)} · {productStock(it)} шт
                          </div>
                          <div className="tabular mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px]">
                            {tiers.map((p, i) => (
                              <span key={i} className="whitespace-nowrap">
                                <span className="text-[var(--text-faint)]">−{p}%</span>{" "}
                                <b className="text-[var(--ok)]">{money(it.priceMinor - bundleUnitDiscount(it.priceMinor, p), it.currency)}</b>
                              </span>
                            ))}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {all && items.length > 0 && (
                  <p className="mt-2.5 text-[12.5px] leading-snug text-[var(--text-muted)]">
                    Если взять {items.length > 1 ? `все ${Math.min(items.length, BUNDLE_MAX_ADDON_UNITS)}` : "этот аксессуар"}: скидка{" "}
                    <b className="tabular text-[var(--ok)]">
                      {money(all.discountMinor)} (−{all.percent}%)
                    </b>
                    {items.length > BUNDLE_MAX_ADDON_UNITS && `, скидка действует на ${BUNDLE_MAX_ADDON_UNITS} самых дорогих`}.
                  </p>
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
