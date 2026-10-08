"use client";

/**
 * Catalog v2 parts of the product view (docs/CATALOG-SPECS.md §5): breadcrumbs from the category
 * path, the brand link, the markdown/used plate and the "Характеристики" table.
 */
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { categoryPath, specRows, type CatalogSchema } from "@shop/shared";
import { useI18n } from "@/i18n/context";
import type { Product } from "@/lib/api";
import { haptic } from "@/lib/telegram";

/** Rows visible before "Все характеристики". */
const FIRST_ROWS = 6;

export function ProductCrumbs({
  schema,
  product,
  onCategory,
}: {
  schema: CatalogSchema;
  product: Product;
  onCategory?: (slug: string | null) => void;
}) {
  const { t } = useI18n();
  const path = categoryPath(schema, product.categoryId);
  if (path.length === 0) return null;
  const go = (slug: string | null) => {
    if (!onCategory) return;
    haptic();
    onCategory(slug);
  };
  const items = [{ key: "_all", slug: null as string | null, name: t("product.allProducts") }, ...path.map((c) => ({ key: c.id, slug: c.slug, name: c.name }))];
  return (
    <nav aria-label="breadcrumbs" className="mb-1.5 flex flex-wrap items-center gap-x-0.5 gap-y-1">
      {items.map((c, i) => (
        <span key={c.key} className="flex items-center gap-0.5">
          {i > 0 && <ChevronRight aria-hidden className="h-3.5 w-3.5 text-[var(--faint)]" strokeWidth={2.5} />}
          <button
            type="button"
            onClick={() => go(c.slug)}
            className={`font-display rounded-[4px] px-1 py-1 text-[12px] font-semibold uppercase tracking-[0.06em] ${
              i === items.length - 1 ? "text-[var(--accent-hi)]" : "text-[var(--muted)]"
            } ${i === 0 ? "-ml-1" : ""}`}
          >
            {c.name}
          </button>
        </span>
      ))}
    </nav>
  );
}

export function ProductBrand({ product, onBrand }: { product: Product; onBrand?: (slug: string) => void }) {
  const { t } = useI18n();
  const b = product.brandRef;
  if (!b) return null;
  return (
    <button
      type="button"
      onClick={() => {
        if (!onBrand) return;
        haptic();
        onBrand(b.slug);
      }}
      className="nb-chip nb-press mt-2 inline-flex min-h-[32px] items-center gap-1.5 px-3 py-1 text-[12.5px]"
    >
      <span className="text-[var(--faint)]">{t("product.brand")}</span>
      <span className="text-[var(--ink)]">{b.name}</span>
      {onBrand && <ChevronRight aria-hidden className="-mr-1 h-3.5 w-3.5 text-[var(--muted)]" strokeWidth={2.5} />}
    </button>
  );
}

export function ConditionPlate({ product }: { product: Product }) {
  const { t } = useI18n();
  if (!product.condition || product.condition === "NEW") return null;
  return (
    <div className="mt-4 flex gap-3 rounded-[var(--r)] border border-[rgba(255,102,0,.35)] bg-[var(--accent-soft)] px-3.5 py-3">
      <AlertTriangle className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[var(--accent)]" strokeWidth={2.25} />
      <div className="min-w-0">
        <p className="font-display text-[13px] font-bold uppercase tracking-[0.06em] text-[var(--accent-hi)]">
          {product.condition === "USED" ? t("catalog.cond.used") : t("catalog.cond.markdown")}
        </p>
        {product.conditionNote && (
          <p className="mt-0.5 whitespace-pre-line text-[13px] leading-snug text-[var(--ink)]">{product.conditionNote}</p>
        )}
      </div>
    </div>
  );
}

export function SpecsTable({ schema, product }: { schema: CatalogSchema; product: Product }) {
  const { t, locale } = useI18n();
  const [all, setAll] = useState(false);
  const groups = specRows(schema, product.categoryId, product.specs, locale, [t("catalog.yes"), t("catalog.no")]);
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  if (total === 0) return null;
  const collapsed = !all && total > FIRST_ROWS;

  return (
    <section className="mt-5">
      <h3 className="eyebrow mb-2.5 !tracking-[0.2em]">{t("product.specs.title")}</h3>
      <div className="overflow-hidden rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)]">
        {collapsed ? (
          <Rows rows={groups.flatMap((g) => g.rows).slice(0, FIRST_ROWS)} />
        ) : (
          groups.map((g, i) => (
            <div key={g.group.key} className={i > 0 ? "border-t border-[var(--line-strong)]" : ""}>
              {(groups.length > 1 || total > FIRST_ROWS) && (
                <p className="font-display bg-[var(--surface-2)] px-3.5 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
                  {g.group.label}
                </p>
              )}
              <Rows rows={g.rows} />
            </div>
          ))
        )}
        {total > FIRST_ROWS && (
          <button
            type="button"
            onClick={() => {
              haptic();
              setAll((v) => !v);
            }}
            className="font-display flex w-full items-center justify-center gap-1.5 border-t border-[var(--line)] px-3.5 py-3 text-[12.5px] font-bold uppercase tracking-[0.08em] text-[var(--accent-hi)] active:bg-[var(--surface-2)]"
          >
            {all ? t("product.specs.collapse") : `${t("product.specs.all")} · ${total}`}
            <ChevronDown className={`h-4 w-4 transition-transform ${all ? "rotate-180" : ""}`} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </section>
  );
}

function Rows({ rows }: { rows: { attr: { id: string; label: string }; text: string }[] }) {
  return (
    <dl>
      {rows.map((r, i) => (
        <div key={r.attr.id} className={`flex items-baseline gap-3 px-3.5 py-2.5 ${i > 0 ? "border-t border-[var(--line)]" : ""}`}>
          <dt className="min-w-0 flex-1 text-[13px] leading-snug text-[var(--muted)]">{r.attr.label}</dt>
          <dd className="max-w-[58%] text-right text-[13px] font-semibold leading-snug text-[var(--ink)] [overflow-wrap:anywhere]">{r.text}</dd>
        </div>
      ))}
    </dl>
  );
}
