"use client";

/**
 * «Разом дешевше» on the product page: the product + up to three accessories the shop pairs with it,
 * each a tap to tick, the bundle price with the discount and one button that puts the set in the
 * cart. The discount itself is decided again at checkout (bundle OR promo code, whichever is better),
 * so the numbers here mirror the server's rules (`bundleDiscount` in @shop/shared).
 *
 * An accessory with variants cannot be added blindly — its row opens its own page instead.
 */
import { Check, ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { bundleDiscount, bundlePercent, bundleUnitDiscount, BUNDLE_MAX_ADDON_UNITS } from "@shop/shared";
import { useT } from "@/i18n/context";
import { trackAddToCart, trackBundleAdd, trackBundleView } from "@/lib/analytics";
import { useBundleOffer } from "@/lib/bundle";
import { useCart } from "@/lib/cart";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { haptic } from "@/lib/telegram";
import type { Product, ProductVariant } from "@/lib/api";

const hasVariants = (p: Product) => (p.variants?.length ?? 0) > 0;
const inStock = (p: Product) =>
  hasVariants(p) ? (p.variants ?? []).some((v) => v.stock > 0) : (p.stock ?? 0) > 0;

export function BundleBlock({
  product,
  variant,
  needsVariant,
  onOpenProduct,
  onAdded,
}: {
  product: Product;
  /** The variant chosen for the main product (null when it has none or none is picked yet). */
  variant: ProductVariant | null;
  needsVariant: boolean;
  /** Opens an accessory's own page (variant products). Without it such accessories are left out. */
  onOpenProduct?: (p: Product) => void;
  onAdded?: () => void;
}) {
  const t = useT();
  const { data } = useBundleOffer(product.id);
  const lines = useCart((s) => s.lines);
  const add = useCart((s) => s.add);

  const items = useMemo(
    () => (data?.items ?? []).filter((p) => inStock(p) && (onOpenProduct || !hasVariants(p))),
    [data, onOpenProduct],
  );
  const terms = data?.terms;
  const show = !!terms?.enabled && items.length > 0 && inStock(product);

  const inCart = (id: string) => lines.some((l) => l.productId === id);

  // Ticked by default: the first accessory that can be added in one tap.
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const defaultPick = useMemo(() => {
    const first = items.find((p) => !hasVariants(p));
    return new Set(first ? [first.id] : []);
  }, [items]);
  const chosen = picked ?? defaultPick;
  // An accessory already in the cart is part of the set anyway.
  const isOn = (p: Product) => inCart(p.id) || (!hasVariants(p) && chosen.has(p.id));

  const viewed = useRef(false);
  useEffect(() => {
    if (!show || viewed.current) return;
    viewed.current = true;
    trackBundleView("product", items.map((p) => p.id));
  }, [show, items]);

  if (!show || !terms) return null;

  const on = items.filter(isOn);
  const calc = bundleDiscount(terms, on.map((p) => p.priceMinor));
  const discountOf = new Map(on.map((p, i) => [p.id, calc.perItem[i]]));
  const nextPercent = bundlePercent(terms, Math.min(on.length + 1, BUNDLE_MAX_ADDON_UNITS));
  const maxPercent = bundlePercent(terms, Math.min(items.length, BUNDLE_MAX_ADDON_UNITS));

  const mainPrice = product.priceMinor;
  const sum = mainPrice + on.reduce((s, p) => s + p.priceMinor, 0);
  const total = sum - calc.discountMinor;
  const currency = product.currency ?? "UAH";

  const mainInCart = inCart(product.id);
  const toAdd = on.filter((p) => !inCart(p.id));
  const nothingToAdd = toAdd.length === 0 && mainInCart;
  const blocked = !mainInCart && needsVariant;

  const toggle = (p: Product) => {
    haptic();
    if (hasVariants(p)) {
      onOpenProduct?.(p);
      return;
    }
    if (inCart(p.id)) return;
    const next = new Set(chosen);
    if (next.has(p.id)) next.delete(p.id);
    else next.add(p.id);
    setPicked(next);
  };

  const addSet = () => {
    if (nothingToAdd || blocked) return;
    haptic();
    const added: string[] = [];
    if (!mainInCart) {
      add(product, variant, 1);
      trackAddToCart(product.id, variant?.id ?? null, 1);
      added.push(product.id);
    }
    for (const p of toAdd) {
      add(p, null, 1);
      trackAddToCart(p.id, null, 1);
      added.push(p.id);
    }
    trackBundleAdd("product", added);
    onAdded?.();
  };

  return (
    <section className="nb mt-5 p-3.5" aria-label={t("bundle.title")}>
      <div className="mb-3">
        <h3 className="font-display text-[16px] font-bold uppercase tracking-[0.04em] text-[var(--ink)]">
          {t("bundle.title")}
        </h3>
        {maxPercent > 0 && (
          <p className="mt-0.5 text-[12px] font-medium text-[var(--muted)]">
            {t("bundle.subtitle", { max: maxPercent })}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {/* the product itself — always in the set */}
        <div className="flex items-center gap-3 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] p-2">
          <Thumb product={product} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--faint)]">{t("bundle.thisItem")}</p>
            <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-[var(--ink)]">{product.title}</p>
            <p className="font-display mt-0.5 text-[13px] font-bold tabular-nums text-[var(--ink)]">{money(mainPrice, currency)}</p>
          </div>
          <Tick on locked />
        </div>

        {items.map((p) => {
          const variants = hasVariants(p);
          const ticked = isOn(p);
          const percent = ticked ? calc.percent : nextPercent;
          const off = ticked ? (discountOf.get(p.id) ?? 0) : bundleUnitDiscount(p.priceMinor, nextPercent);
          return (
            <button
              key={p.id}
              type="button"
              role={variants ? undefined : "checkbox"}
              aria-checked={variants ? undefined : ticked}
              aria-label={variants ? `${t("bundle.choose")}: ${p.title}` : undefined}
              onClick={() => toggle(p)}
              className={`nb-press flex w-full items-center gap-3 rounded-[var(--r)] border p-2 text-left transition-colors ${
                ticked ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] bg-[var(--surface-2)]"
              }`}
            >
              <Thumb product={p} />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-[var(--ink)]">{p.title}</p>
                <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
                  <span className="font-display text-[13px] font-bold tabular-nums text-[var(--accent)]">
                    {money(p.priceMinor - off, p.currency ?? currency)}
                  </span>
                  {off > 0 && (
                    <span className="text-[11px] tabular-nums text-[var(--faint)] line-through">
                      {money(p.priceMinor, p.currency ?? currency)}
                    </span>
                  )}
                  {percent > 0 && <PercentChip percent={percent} />}
                </div>
                {inCart(p.id) && (
                  <p className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">{t("bundle.inCart")}</p>
                )}
              </div>
              {variants ? (
                <span className="font-display inline-flex shrink-0 items-center gap-0.5 rounded-full border border-[var(--line-strong)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--ink)]">
                  {t("bundle.choose")}
                  <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                </span>
              ) : (
                <Tick on={ticked} locked={inCart(p.id)} />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-end justify-between gap-3 border-t border-[var(--line)] pt-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-[var(--muted)]">{t("bundle.total")}</p>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-display text-[20px] font-bold tabular-nums leading-tight text-[var(--accent)]">
              {money(total, currency)}
            </span>
            {calc.discountMinor > 0 && (
              <span className="text-[13px] tabular-nums text-[var(--faint)] line-through">{money(sum, currency)}</span>
            )}
          </div>
        </div>
        {calc.discountMinor > 0 && (
          <span className="shrink-0 text-right text-[12px] font-bold text-[var(--ok)]">
            {t("bundle.save", { amount: money(calc.discountMinor, currency) })}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={addSet}
        disabled={nothingToAdd || blocked}
        className={`nb-up mt-3 inline-flex h-12 w-full items-center justify-center gap-2 px-4 text-[14px] font-semibold ${
          nothingToAdd || blocked
            ? "rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--faint)]"
            : "nb-accent nb-press"
        }`}
      >
        {nothingToAdd ? (
          <>
            <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} />
            {t("bundle.added")}
          </>
        ) : blocked ? (
          t("addToCart.chooseVariant")
        ) : (
          <>
            <Plus className="h-4 w-4 shrink-0" strokeWidth={2.5} />
            {t("bundle.addSet")}
          </>
        )}
      </button>
    </section>
  );
}

function Thumb({ product }: { product: Product }) {
  return (
    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[var(--r)] bg-[var(--surface-3)]">
      <Image src={product.images?.[0]?.url} alt={product.title} size={120} className="h-full w-full" />
    </div>
  );
}

function Tick({ on, locked = false }: { on: boolean; locked?: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid h-6 w-6 shrink-0 place-items-center rounded-[6px] border ${
        on
          ? locked
            ? "border-[var(--line-strong)] bg-[var(--surface-3)] text-[var(--muted)]"
            : "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
          : "border-[var(--line-strong)]"
      }`}
    >
      {on && <Check className="h-4 w-4" strokeWidth={3} />}
    </span>
  );
}

/** «−5%» — the bundle percent of an accessory. */
export function PercentChip({ percent }: { percent: number }) {
  return (
    <span className="font-display inline-flex rounded-full bg-[var(--ok)] px-1.5 py-px text-[10px] font-bold tabular-nums leading-[1.5] text-[#0b0b0d]">
      −{percent}%
    </span>
  );
}
