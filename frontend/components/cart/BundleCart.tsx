"use client";

/**
 * Cart side of «Разом дешевше»: the «Докинь до замовлення» strip (accessories for what is in the
 * cart, with the percent the next one would get). It reads the server quote (lib/bundle.ts) — the cart never prices the bundle itself.
 */
import { motion } from "framer-motion";
import { ChevronRight, Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { bundlePercent, BUNDLE_MAX_ADDON_UNITS, type BundleQuote } from "@shop/shared";
import { PercentChip } from "@/components/catalog/BundleBlock";
import { useT } from "@/i18n/context";
import { trackAddToCart, trackBundleAdd, trackBundleView } from "@/lib/analytics";
import { useCart } from "@/lib/cart";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { spring } from "@/lib/motion";
import { haptic } from "@/lib/telegram";
import type { Product } from "@/lib/api";

const hasVariants = (p: Product) => (p.variants?.length ?? 0) > 0;

export function BundleSuggestions({
  quote,
  onOpenProduct,
}: {
  quote: BundleQuote | null;
  /** Variant products cannot be added blindly — they open their page. */
  onOpenProduct: (p: Product) => void;
}) {
  const t = useT();
  const add = useCart((s) => s.add);
  const items = (quote?.terms.enabled ? quote.suggestions : []).slice(0, 3);
  const ids = items.map((p) => p.id).join(",");

  const viewed = useRef(false);
  useEffect(() => {
    if (!ids || viewed.current) return;
    viewed.current = true;
    trackBundleView("cart", ids.split(","));
  }, [ids]);

  if (!quote || items.length === 0) return null;

  // Units that already got the discount; the next add-on moves the order to the next tier.
  const units = quote.discountKind === "BUNDLE" ? quote.lines.reduce((s, l) => s + l.units, 0) : 0;
  const next = units < BUNDLE_MAX_ADDON_UNITS ? bundlePercent(quote.terms, units + 1) : 0;
  const max = bundlePercent(quote.terms, BUNDLE_MAX_ADDON_UNITS);

  const tap = (p: Product) => {
    haptic();
    if (hasVariants(p)) {
      onOpenProduct(p);
      return;
    }
    add(p, null, 1);
    trackAddToCart(p.id, null, 1);
    trackBundleAdd("cart", [p.id]);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="mt-5"
      aria-label={t("bundle.suggestTitle")}
    >
      <div className="mb-2">
        <h2 className="font-display text-[15px] font-bold uppercase tracking-[0.04em] text-[var(--ink)]">
          {t("bundle.suggestTitle")}
        </h2>
        {max > 0 && (
          <p className="text-[12px] font-medium text-[var(--muted)]">{t("bundle.suggestHint", { max })}</p>
        )}
      </div>
      <div className={`grid gap-2 ${items.length === 1 ? "grid-cols-1" : items.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {items.map((p) => {
          const variants = hasVariants(p);
          const single = items.length === 1;
          const action = (
            <span
              aria-hidden
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-[var(--r)] ${
                variants
                  ? "border border-[var(--line-strong)] bg-[rgba(14,14,16,.8)] text-[var(--ink)]"
                  : "bg-[var(--accent)] text-[var(--accent-ink)]"
              } ${single ? "" : "absolute bottom-1 right-1"}`}
            >
              {variants ? <ChevronRight className="h-4 w-4" strokeWidth={2.5} /> : <Plus className="h-4 w-4" strokeWidth={2.75} />}
            </span>
          );
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => tap(p)}
              aria-label={variants ? `${t("bundle.choose")}: ${p.title}` : t("bundle.addOne", { title: p.title })}
              className={`nb nb-press relative flex min-w-0 p-2 text-left ${single ? "items-center gap-3" : "flex-col"}`}
            >
              <div
                className={`relative shrink-0 overflow-hidden rounded-[var(--r)] bg-[var(--surface-2)] ${
                  single ? "h-14 w-14" : "aspect-square w-full"
                }`}
              >
                <Image src={p.images?.[0]?.url} alt={p.title} size={200} className="h-full w-full" />
                {next > 0 && (
                  <span className="absolute left-1 top-1">
                    <PercentChip percent={next} />
                  </span>
                )}
                {!single && action}
              </div>
              <div className={`min-w-0 ${single ? "flex-1" : "mt-1.5 w-full"}`}>
                <p className="line-clamp-2 text-[11px] font-semibold leading-tight text-[var(--ink)]">{p.title}</p>
                <p className="font-display mt-1 whitespace-nowrap text-[12px] font-bold tabular-nums text-[var(--accent)]">
                  {money(p.priceMinor, p.currency)}
                </p>
              </div>
              {single && action}
            </button>
          );
        })}
      </div>
    </motion.section>
  );
}
