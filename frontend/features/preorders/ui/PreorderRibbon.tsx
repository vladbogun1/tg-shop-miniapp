"use client";

/**
 * «Скоро в наявності →» — a horizontal ribbon of products on their way, above the catalog grid.
 * Shown only while there are open batches; the arrow opens the full list (the «Передзамовлення» filter).
 */
import { ChevronRight, Truck } from "lucide-react";
import { PRE_COLOR } from "@/features/preorders/ui/colors";
import { useI18n } from "@/i18n/context";
import type { Product } from "@/lib/api";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { etaCardLine, type Coming } from "@/features/preorders/state";
import { haptic } from "@/platform/telegram";

export function PreorderRibbon({
  products,
  coming,
  onOpen,
  onAll,
}: {
  products: Product[];
  coming: Coming;
  onOpen: (p: Product) => void;
  onAll: () => void;
}) {
  const { t, tag } = useI18n();
  return (
    <section className="mb-6" aria-label={t("preorder.ribbon.title")}>
      <button type="button" onClick={onAll} className="nb-press tap mb-2.5 flex w-full items-center gap-2 text-left">
        <Truck className="h-[18px] w-[18px] shrink-0" strokeWidth={2.25} style={{ color: PRE_COLOR }} />
        <h2 className="font-display min-w-0 flex-1 truncate text-[16px] font-extrabold uppercase tracking-[0.04em] text-[var(--ink)]">
          {t("preorder.ribbon.title")}
        </h2>
        <span className="inline-flex shrink-0 items-center gap-0.5 text-[12px] font-semibold text-[var(--muted)]">
          {t("preorder.ribbon.all")}
          <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
        </span>
      </button>
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1" style={{ touchAction: "pan-x pan-y" }}>
        {products.map((p) => {
          const eta = coming.productEta(p.id);
          const line = eta ? etaCardLine(eta, t, tag) : null;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                haptic();
                onOpen(p);
              }}
              className="nb nb-press flex w-[132px] shrink-0 flex-col overflow-hidden text-left"
            >
              <div className="aspect-square w-full overflow-hidden bg-[var(--surface-2)]">
                <Image src={p.images?.[0]?.url} alt={p.title} size={300} sizes="132px" className="h-full w-full" />
              </div>
              <div className="flex flex-col gap-1 px-2.5 pb-2.5 pt-2">
                <span className="line-clamp-2 min-h-[2.5em] text-[12px] font-semibold leading-tight text-[var(--ink)]">{p.title}</span>
                <span className="font-display text-[14px] font-bold tabular-nums leading-none text-[var(--ink)]">
                  {money(p.priceMinor, p.currency)}
                </span>
                {line && (
                  <span className="truncate text-[11px] font-semibold leading-tight" style={{ color: PRE_COLOR }}>
                    {line}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
