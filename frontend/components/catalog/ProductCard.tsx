"use client";

/**
 * ProductCard — ChiSetup tile (DESIGN-V3 §6): graphite card, photo on --surface-2, Inter 600
 * title in two lines, Exo 2 price, orange chamfered CTA; out of stock = desaturated photo.
 * Same contract/behavior as before: tap photo/title → product view;
 * no-variant products get an inline AddToCartControl, variant products get a
 * a "choose" button that opens the view.
 */
import { Bell, Check, SlidersHorizontal, Truck } from "lucide-react";
import { AddToCartControl } from "@/components/catalog/AddToCartControl";
import { CompareCardToggle } from "@/components/compare/CompareBits";
import { RatingBadge } from "@/components/reviews/Stars";
import { PRE_COLOR } from "@/components/preorder/PreorderBlock";
import { useI18n } from "@/i18n/context";
import { etaCardLine, type PreorderCardState } from "@/lib/preorders";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { haptic } from "@/lib/telegram";
import type { Product } from "@/lib/api";

export function ProductCard({
  product,
  onOpen,
  summary,
  compareGroup,
  preorder = null,
  onNotify,
}: {
  product: Product;
  onOpen: (p: Product) => void;
  /** Comparison group (root category id); absent until the schema is known = no compare button. */
  compareGroup?: string;
  /** One-line spec summary ("51 г · PAW3950 · 8000 Гц") from the catalog schema. */
  summary?: string;
  /** Pre-order state of a product that is out of stock / held for me (lib/preorders); null = ordinary. */
  preorder?: PreorderCardState | null;
  /** «Повідомити» on a product without variants → the queue sheet. Absent (guest) = the old disabled button. */
  onNotify?: (p: Product) => void;
}) {
  const { t, tag } = useI18n();
  const hasVariants = (product.variants?.length ?? 0) > 0;
  const inStock = hasVariants
    ? (product.variants ?? []).some((v) => v.stock > 0)
    : (product.stock ?? 0) > 0;

  const showPhoto = inStock || (preorder != null && preorder.kind !== "out");
  const etaLine = preorder?.kind === "preorder" ? etaCardLine(preorder.eta, t, tag) : null;
  const notify = () => {
    haptic();
    if (hasVariants || !onNotify) onOpen(product);
    else onNotify(product);
  };

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
            className={`h-full w-full ${showPhoto ? "" : "opacity-60 grayscale-[.85]"}`}
          />
          {/* Solid fill, no backdrop-blur: one blurred layer per card meant ~200 of them in the
              catalog, which the iOS webview pays for on every scroll frame. */}
          {(() => {
            const kind = preorder?.kind;
            const color = inStock ? "var(--ok)" : kind === "held" ? "var(--ok)" : kind === "preorder" ? PRE_COLOR : "var(--muted)";
            const label = inStock
              ? t("product.inStock")
              : kind === "held"
                ? t("preorder.badge.held")
                : kind === "preorder"
                  ? t("preorder.badge")
                  : t("product.outOfStockShort");
            return (
              <span
                className="font-display absolute left-2 top-2 inline-flex max-w-[calc(100%-16px)] items-center gap-1 rounded-full bg-[rgba(14,14,16,.86)] px-2 py-[3px] text-[10px] font-semibold uppercase tracking-[0.06em]"
                style={{ color }}
              >
                {kind === "preorder" ? (
                  <Truck aria-hidden className="h-3 w-3 shrink-0" strokeWidth={2.5} />
                ) : (
                  <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: inStock || kind === "held" ? "var(--ok)" : "var(--faint)" }} />
                )}
                <span className="truncate">{label}</span>
              </span>
            );
          })()}
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
          {etaLine && <p className="-mt-0.5 truncate text-[11.5px] font-semibold leading-tight" style={{ color: PRE_COLOR }}>{etaLine}</p>}
          {(product.ratingCount ?? 0) > 0 && (
            <RatingBadge avg={product.ratingAvg} count={product.ratingCount} />
          )}
        </div>
      </button>

      <div className="mt-auto p-2.5 pt-3">
        {preorder?.kind === "held" ? (
          <button type="button" onClick={open} className="nb-accent nb-press nb-up flex h-11 w-full items-center justify-center gap-1.5 px-3 text-[13px]">
            <span className="truncate">{t("preorder.card.held")}</span>
          </button>
        ) : preorder && (onNotify || hasVariants) ? (
          preorder.queued ? (
            <button
              type="button"
              onClick={notify}
              className="nb-up nb-press flex h-11 w-full items-center justify-center gap-1.5 rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 text-[13px] font-semibold text-[var(--ok)]"
            >
              <Check className="h-4 w-4 shrink-0 max-[359px]:hidden" strokeWidth={2.75} />
              <span className="truncate">{t("preorder.card.queued")}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={notify}
              className="nb-up nb-press flex h-11 w-full items-center justify-center gap-1.5 rounded-[var(--r)] border-2 bg-transparent px-3 text-[13px] font-bold"
              style={{ borderColor: preorder.kind === "preorder" ? PRE_COLOR : "var(--line-strong)", color: preorder.kind === "preorder" ? PRE_COLOR : "var(--ink)" }}
            >
              <Bell className="h-4 w-4 shrink-0 max-[359px]:hidden" strokeWidth={2.5} />
              <span className="truncate">{t("preorder.card.notify")}</span>
            </button>
          )
        ) : hasVariants ? (
          <button
            type="button"
            onClick={open}
            disabled={!inStock}
            className="nb-accent nb-press nb-up flex h-11 w-full items-center justify-center gap-1.5 px-3 text-[13px] disabled:opacity-50"
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0 max-[359px]:hidden" strokeWidth={2.5} />
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
