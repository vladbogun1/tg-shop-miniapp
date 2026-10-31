"use client";

import { formatAdminSpec } from "@/features/catalog";
import { money } from "@/lib/money";
import { CURRENCY } from "../../../model/form";
import { Review } from "../Review";
import type { ProductCtx } from "../ctx";

export function ReviewStep({ x }: { x: ProductCtx }) {
  const { f, product, attrs, missing, cardStatus, hasVariants, effectiveStock, priceMinor, compareAtMinor, slugPreview, pathText, go } = x;
  const currency = CURRENCY;
  return (
    <Review
      f={f}
      priceLabel={priceMinor > 0 ? money(priceMinor, currency) : "—"}
      compareAtLabel={compareAtMinor > priceMinor ? money(compareAtMinor, currency) : null}
      slug={slugPreview}
      stock={effectiveStock}
      hasVariants={hasVariants}
      categoryPath={pathText}
      specsSummary={attrs
        .map((a) => {
          const t = formatAdminSpec(a, f.specs[a.key]);
          return t ? { label: a.labelRu, text: t } : null;
        })
        .filter((x): x is { label: string; text: string } => !!x)}
      missing={missing.length}
      cardStatus={cardStatus}
      confidence={product?.cardConfidence}
      onEdit={go}
    />
  );
}
