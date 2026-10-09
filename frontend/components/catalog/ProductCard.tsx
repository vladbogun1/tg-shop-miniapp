"use client";

/**
 * ProductCard — ChiSetup tile (DESIGN-V3 §6): graphite card, photo on --surface-2, Inter 600
 * title in two lines, Exo 2 price, orange chamfered CTA; out of stock = desaturated photo.
 * Same contract/behavior as before: tap photo/title → product view;
 * no-variant products get an inline AddToCartControl, variant products get a
 * a "choose" button that opens the view.
 */
import { SlidersHorizontal } from "lucide-react";
import { AddToCartControl } from "@/components/catalog/AddToCartControl";
import { CompareCardToggle } from "@/components/compare/CompareBits";
import { RatingBadge } from "@/components/reviews/Stars";
import { useT } from "@/i18n/context";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { haptic } from "@/lib/telegram";
import type { Product } from "@/lib/api";

export function ProductCard({
  product,
  onOpen,
  summary,
  compareGroup,
}: {
  product: Product;
  onOpen: (p: Product) => void;
  /** Comparison group (root category id); absent until the schema is known = no compare button. */
  compareGroup?: string;
  /** One-line spec summary ("51 г · PAW3950 · 8000 Гц") from the catalog schema. */
  summary?: string;
}) {
  const t = useT();
  const hasVariants = (product.variants?.length ?? 0) > 0;
  const inStock = hasVariants
    ? (product.variants ?? []).some((v) => v.stock > 0)
    : (product.stock ?? 0) > 0;

  const open = () => {
    haptic();
    onOpen(product);
  };

  return (
    <div className="nb group relative flex h-full w-full flex-col overflow-hidden transition-[border-color,transform] duration-200 hover:border-[var(--line-strong)] md:hover:-translate-y-0.5">
      <button type="button" onClick={open} className="nb-press flex flex-col text-left">
        <div className="relative aspect-square w-full overflow-hidden bg-[var(--surface-2)]">
          <Image
            src={product.images?.[0]?.url}
            alt={product.title}
            size={600}
            sizes="50vw"
            className={`h-full w-full ${inStock ? "" : "opacity-60 grayscale-[.85]"}`}
          />
          {/* Solid fill, no backdrop-blur: one blurred layer per card meant ~200 of them in the
              catalog, which the iOS webview pays for on every scroll frame. */}
          <span
            className="font-display absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[rgba(14,14,16,.86)] px-2 py-[3px] text-[10px] font-semibold uppercase tracking-[0.06em]"
            style={{ color: inStock ? "var(--ok)" : "var(--muted)" }}
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: inStock ? "var(--ok)" : "var(--faint)" }}
            />
            {inStock ? t("product.inStock") : t("product.outOfStockShort")}
          </span>
          {product.condition && product.condition !== "NEW" && (
            <span className="font-display absolute bottom-2 left-2 rounded-full bg-[var(--accent)] px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--accent-ink)]">
              {product.condition === "USED" ? t("catalog.cond.used") : t("catalog.cond.markdown")}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5 px-3 pt-2.5">
          <h3 className="line-clamp-2 min-h-[2.6em] text-[13.5px] font-semibold leading-snug text-[var(--ink)]">
            {product.title}
          </h3>
          {summary && (
            <p className="-mt-0.5 truncate text-[11.5px] font-medium leading-tight text-[var(--muted)]">{summary}</p>
          )}
          <span className="font-display text-[17px] font-bold tabular-nums leading-none text-[var(--ink)]">
            {money(product.priceMinor, product.currency)}
          </span>
          {(product.ratingCount ?? 0) > 0 && (
            <RatingBadge avg={product.ratingAvg} count={product.ratingCount} />
          )}
        </div>
      </button>

      <div className="mt-auto p-2.5 pt-3">
        {hasVariants ? (
          <button
            type="button"
            onClick={open}
            disabled={!inStock}
            className="nb-accent nb-press nb-up flex h-11 w-full items-center justify-center gap-1.5 px-3 text-[13px] disabled:opacity-50"
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0" strokeWidth={2.5} />
            {inStock ? t("product.choose") : t("product.outOfStock")}
          </button>
        ) : (
          <AddToCartControl product={product} variant={null} fullWidth size="sm" />
        )}
      </div>
      {compareGroup && <CompareCardToggle productId={product.id} group={compareGroup} />}
      {/* desktop hover: orange strip along the bottom edge */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-[var(--accent)] opacity-0 transition-opacity duration-200 md:group-hover:opacity-100"
      />
    </div>
  );
}
