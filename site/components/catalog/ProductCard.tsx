"use client";

/**
 * Catalog tile (DESIGN-V3 §6): graphite card, photo on --surface-2, Inter title, Exo 2 price. The
 * whole picture/title is a real link (open in new tab works); hover lifts the card, lightens the
 * border, draws the orange bottom line and zooms the photo. Out of stock: desaturated photo.
 */
import { ShoppingBag, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import type { StorefrontProduct } from "@shop/shared";
import { toast } from "@/components/ui/Toast";
import { useI18n } from "@/i18n/context";
import { trackAddToCart } from "@/lib/analytics";
import { stockOf, useCart } from "@/lib/cart";
import { discountPercent } from "@/lib/format";
import { Image } from "@/lib/image";
import { useFmt } from "@/lib/use-fmt";

export function ProductCard({ product, priority = false }: { product: StorefrontProduct; priority?: boolean }) {
  const { t, href } = useI18n();
  const fmt = useFmt();
  const add = useCart((s) => s.add);
  const hasVariants = (product.variants?.length ?? 0) > 0;
  const stock = stockOf(product, null);
  const inStock = stock > 0;
  const off = discountPercent(product.priceMinor, product.compareAtMinor);
  const url = href(`/product/${product.slug}`);
  const image = (product.images ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0];

  return (
    <article className="nb nb-hover group flex h-full flex-col overflow-hidden">
      <Link href={url} className="flex flex-1 flex-col" aria-label={product.title}>
        <div className={`relative aspect-square w-full overflow-hidden bg-[var(--surface-2)] ${inStock ? "" : "[&_img]:grayscale-[.85] [&_img]:opacity-60"}`}>
          <Image
            src={image?.url}
            alt={product.title}
            size={600}
            sizes="(min-width: 1280px) 300px, (min-width: 768px) 33vw, 50vw"
            priority={priority}
            className="h-full w-full"
            imgClassName="group-hover:scale-[1.04]"
          />
          <span
            className={`absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-[rgba(14,14,16,.78)] px-2 py-1 font-display text-[10px] font-semibold uppercase tracking-[.1em] backdrop-blur-sm ${
              inStock ? "text-[var(--ink)]" : "text-[var(--muted)]"
            }`}
          >
            <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: inStock ? "var(--ok)" : "var(--faint)" }} />
            {inStock ? t("product.inStock") : t("product.outOfStock")}
          </span>
          {off > 0 && (
            <span className="absolute right-2 top-2 rounded-full bg-[var(--accent)] px-2 py-0.5 font-display text-[12px] font-bold text-[var(--accent-ink)]">
              {t("product.discount", { n: off })}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 px-3 pt-3 sm:px-4 sm:pt-4">
          <h3 className="line-clamp-2 min-h-[2.7em] font-sans text-[14px] font-semibold leading-snug text-[var(--ink)] transition-colors group-hover:text-[var(--accent-hi)]">
            {product.title}
          </h3>
          <div className="mt-auto flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-display text-[18px] font-bold tabular-nums text-[var(--ink)]">
              {fmt.money(product.priceMinor, product.currency)}
            </span>
            {off > 0 && (
              <s className="font-display text-[13px] font-medium tabular-nums text-[var(--faint)]">
                {fmt.money(product.compareAtMinor, product.currency)}
              </s>
            )}
          </div>
        </div>
      </Link>
      <div className="p-3 sm:p-4">
        {hasVariants || !inStock ? (
          <Link
            href={url}
            aria-disabled={!inStock}
            className={`tap nb-up flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 text-[12px] font-semibold text-[var(--ink)] transition-colors hover:border-[rgba(255,255,255,.28)] hover:bg-[var(--surface-3)] sm:text-[13px] ${
              inStock ? "" : "text-[var(--muted)] opacity-70"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0" strokeWidth={2.25} />
            {inStock ? t("product.choose") : t("product.outOfStock")}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => {
              add(product, null, 1);
              trackAddToCart(product.id, null, 1);
              toast(t("product.added"));
            }}
            className="nb-press tap nb-up flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-[var(--r)] border border-[rgba(255,102,0,.55)] bg-[var(--accent-soft)] px-3 text-[12px] font-bold text-[var(--accent-hi)] hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] sm:text-[13px]"
          >
            <ShoppingBag className="h-4 w-4 shrink-0" strokeWidth={2.25} />
            {t("product.addToCart")}
          </button>
        )}
      </div>
    </article>
  );
}

export function ProductGrid({ products, priorityCount = 0 }: { products: StorefrontProduct[]; priorityCount?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard product={p} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
