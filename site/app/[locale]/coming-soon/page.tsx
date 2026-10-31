import { Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { StorefrontProduct } from "@shop/core/site";
import { ProductGrid } from "@/features/catalog/view/ProductCard";
import { Breadcrumbs } from "@/features/layout/view/Breadcrumbs";
import { alternates, localePath, makeT } from "@/i18n";
import { toCardProducts } from "@/features/catalog";
import { cardContext } from "@/features/catalog";
import { loadSchema } from "@/features/catalog/server";
import { buildPreorderIndex, groupTitle, type PreorderEta } from "@/features/preorder";
import { localeOf, type LocaleParams } from "@/lib/route";
import { pageMeta } from "@/features/seo/server";
import { getComingBatches } from "@/features/preorder/server";
import { getListingProducts } from "@/features/catalog/server";
import { safe } from "@/lib/server-http";
import { stockOf } from "@shop/customer/catalog/model/stock";

/**
 * The batches and their products come through the data cache tagged "catalog" (the backend drops it
 * whenever a batch changes status), and the page itself is rebuilt at most once a minute — the
 * «~2 тижні» wording moves with the calendar.
 */
export const revalidate = 60;

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeOf(params);
  const t = makeT(locale);
  const batches = await safe(getComingBatches(locale), []);
  return {
    ...pageMeta({ locale, path: "/coming-soon", title: t("preorder.coming.title"), description: t("preorder.coming.meta"), alternates: alternates("/coming-soon", locale) }),
    // nothing on its way: a thin page, keep it out of the index
    ...(batches.length === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

interface Group {
  title: string;
  eta: PreorderEta;
  products: StorefrontProduct[];
}

export default async function ComingSoonPage({ params }: { params: LocaleParams }) {
  const locale = await localeOf(params);
  const t = makeT(locale);
  const [batches, all, schema] = await Promise.all([safe(getComingBatches(locale), []), safe(getListingProducts(locale), []), loadSchema(locale)]);
  const byId = new Map(all.map((p) => [p.id, p]));
  const pre = buildPreorderIndex(batches);

  // batches arrive soonest first; a product sits in the group of its soonest batch; equal headings merge
  const seen = new Set<string>();
  const groups: Group[] = [];
  for (const b of batches) {
    const products = [...new Set(b.lines.map((l) => l.productId))]
      .filter((id) => !seen.has(id))
      .map((id) => byId.get(id))
      .filter((p): p is StorefrontProduct => !!p && stockOf(p, null) <= 0);
    if (products.length === 0) continue;
    products.forEach((p) => seen.add(p.id));
    const title = groupTitle(b.eta, t, locale);
    const last = groups[groups.length - 1];
    if (last && last.title === title) last.products.push(...products);
    else groups.push({ title, eta: b.eta, products });
  }

  return (
    <div className="container-site pt-6">
      <Breadcrumbs locale={locale} items={[{ label: t("catalog.title"), path: "/catalog" }, { label: t("preorder.coming.title") }]} />
      <h1 className="font-display text-[28px] font-extrabold uppercase leading-tight tracking-[.02em] text-[var(--ink)] [overflow-wrap:anywhere] sm:text-[38px]">
        {t("preorder.coming.title")}
      </h1>
      <p className="mt-2 max-w-2xl text-[15px] font-medium leading-relaxed text-[var(--muted)]">{t("preorder.coming.lead")}</p>

      {groups.length === 0 ? (
        <div className="nb hud-frame mt-8 flex flex-col items-center gap-3 px-6 py-14 text-center">
          <Truck className="h-10 w-10 text-[var(--pre)]" strokeWidth={1.75} />
          <p className="font-display text-[18px] font-extrabold uppercase text-[var(--ink)]">{t("preorder.coming.empty.title")}</p>
          <p className="max-w-sm text-[14px] font-medium text-[var(--muted)]">{t("preorder.coming.empty.text")}</p>
          <Link href={localePath(locale, "/catalog")} className="nb-accent nb-press tap nb-up mt-2 px-5 py-3 text-[14px]">
            {t("common.toCatalog")}
          </Link>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-10">
          {groups.map((g, i) => (
            <section key={`${g.title}-${i}`} aria-labelledby={`coming-${i}`}>
              <h2 id={`coming-${i}`} className="mb-4 flex items-center gap-3 font-display text-[20px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)] sm:text-[24px]">
                <Truck className="h-5 w-5 shrink-0 text-[var(--pre)]" strokeWidth={2.25} aria-hidden />
                <span className="min-w-0 [overflow-wrap:anywhere]">{g.title}</span>
              </h2>
              <ProductGrid products={toCardProducts(g.products, cardContext(schema, locale, pre))} priorityCount={i === 0 ? 4 : 0} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
