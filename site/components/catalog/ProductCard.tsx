"use client";

/**
 * Catalog tile — the Mini App's neo card, made for a desktop grid: the whole picture/title is a
 * real link (open in new tab works), hover lifts the card and zooms the photo, old price and the
 * discount sticker come from `compareAtMinor`.
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
        <div className="relative aspect-square w-full overflow-hidden border-b-[3px] border-[var(--line)] bg-[var(--surface-2)]">
          <Image
            src={image?.url}
            alt={product.title}
            size={600}
            priority={priority}
            className="h-full w-full"
            imgClassName="group-hover:scale-[1.04]"
          />
          <span
            className="absolute left-2 top-2 -rotate-2 border-[2px] border-[var(--line)] px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide"
            style={{
              background: inStock ? "var(--c4)" : "var(--danger)",
              color: inStock ? "#0c2417" : "#fff",
            }}
          >
            {inStock ? t("product.inStock") : t("product.outOfStock")}
          </span>
          {off > 0 && (
            <span className="absolute right-2 top-2 rotate-2 border-[2px] border-[var(--line)] bg-[var(--c5)] px-1.5 py-0.5 text-[12px] font-black text-[var(--accent-ink)]">
              {t("product.discount", { n: off })}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 px-3 pt-3">
          <h3 className="line-clamp-2 min-h-[2.7em] text-[14px] font-bold leading-snug text-[var(--ink)] group-hover:underline group-hover:decoration-2 group-hover:underline-offset-2">
            {product.title}
          </h3>
          <div className="mt-auto flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="border-[2.5px] border-[var(--line)] bg-[var(--c3)] px-2 py-0.5 text-[16px] font-black text-[var(--accent-ink)]">
              {fmt.money(product.priceMinor, product.currency)}
            </span>
            {off > 0 && (
              <s className="text-[13px] font-bold text-[var(--muted)]">
                {fmt.money(product.compareAtMinor, product.currency)}
              </s>
            )}
          </div>
        </div>
      </Link>
      <div className="p-3">
        {hasVariants || !inStock ? (
          <Link
            href={url}
            aria-disabled={!inStock}
            className={`nb-flat tap nb-up flex min-h-[42px] w-full items-center justify-center gap-1.5 px-3 text-[13px] font-extrabold text-[var(--ink)] hover:bg-[var(--surface-2)] ${
              inStock ? "" : "opacity-60"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0" strokeWidth={2.75} />
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
            className="nb-accent nb-press tap nb-up flex min-h-[42px] w-full items-center justify-center gap-1.5 px-3 text-[13px] hover:brightness-105"
          >
            <ShoppingBag className="h-4 w-4 shrink-0" strokeWidth={2.75} />
            {t("product.addToCart")}
          </button>
        )}
      </div>
    </article>
  );
}

export function ProductGrid({ products, priorityCount = 0 }: { products: StorefrontProduct[]; priorityCount?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard product={p} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
