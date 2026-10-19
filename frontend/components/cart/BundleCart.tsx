"use client";

/**
 * Cart side of «Разом дешевше» (2.0): one compact line — the best accessory for what is in the cart
 * with the percent it would get and a «+». It reads the server quote (lib/bundle.ts) — the cart never
 * prices the bundle itself. The control group (`bundleGroup`) does not see it.
 */
import { motion } from "framer-motion";
import { ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { bundleGroup, bundlePercent, BUNDLE_MAX_ADDON_UNITS, type BundleOfferItem, type BundleQuote } from "@shop/shared";
import { PercentChip } from "@/components/catalog/BundleBlock";
import { useT } from "@/i18n/context";
import { trackAddToCart, trackBundleAdd, trackBundleHoldout, trackBundleView } from "@/lib/analytics";
import { bundleVisitorId } from "@/lib/bundle";
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
  const group = useMemo(() => bundleGroup(bundleVisitorId(), quote?.terms.holdoutPercent), [quote?.terms.holdoutPercent]);
  const offers: BundleOfferItem[] = quote?.terms.enabled
    ? quote.offers ?? quote.suggestions.map((product) => ({ product, capPercent: 100, reasons: [], kind: null }))
    : [];
  const best = offers.find((o) => o.capPercent > 0) ?? null;
  const id = best?.product.id ?? "";

  const viewed = useRef(false);
  useEffect(() => {
    if (!id || viewed.current) return;
    viewed.current = true;
    if (group === "H") trackBundleHoldout("cart", [id]);
    else trackBundleView("cart", [id]);
  }, [id, group]);

  if (!quote || !best || group === "H") return null;
  const p = best.product;

  // Units that already got the discount; the next add-on moves the order to the next tier.
  const units = quote.discountKind === "BUNDLE" ? quote.lines.filter((l) => l.kind !== "SETUP").reduce((s, l) => s + l.units, 0) : 0;
  const next = units < BUNDLE_MAX_ADDON_UNITS ? Math.min(bundlePercent(quote.terms, units + 1), best.capPercent) : 0;
  const variants = hasVariants(p);

  const tap = () => {
    haptic();
    if (variants) {
      onOpenProduct(p);
      return;
    }
    add(p, null, 1);
    trackAddToCart(p.id, null, 1);
    trackBundleAdd("cart", [p.id], { slot: 1, kind: "cart" });
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="mt-5"
      aria-label={t("bundle.suggestTitle")}
    >
      <button
        type="button"
        onClick={tap}
        aria-label={variants ? `${t("bundle.choose")}: ${p.title}` : t("bundle.addOne", { title: p.title })}
        className="nb nb-press flex w-full min-w-0 items-center gap-3 p-2 text-left"
      >
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[var(--r)] bg-[var(--surface-2)]">
          <Image src={p.images?.[0]?.url} alt="" size={120} className="h-full w-full" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">{t("bundle.suggestTitle")}</p>
          <p className="line-clamp-1 text-[12.5px] font-semibold leading-snug text-[var(--ink)]">{p.title}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="font-display whitespace-nowrap text-[12px] font-bold tabular-nums text-[var(--accent)]">
              {money(p.priceMinor, p.currency)}
            </span>
            {next > 0 && <PercentChip percent={next} />}
          </div>
        </div>
        <span
          aria-hidden
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r)] ${
            variants ? "border border-[var(--line-strong)] text-[var(--ink)]" : "bg-[var(--accent)] text-[var(--accent-ink)]"
          }`}
        >
          {variants ? <ChevronRight className="h-4 w-4" strokeWidth={2.5} /> : <Plus className="h-4 w-4" strokeWidth={2.75} />}
        </span>
      </button>
    </motion.section>
  );
}
