import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ProductGrid } from "@/components/catalog/ProductCard";
import { BrandsMarquee } from "@/components/home/BrandsMarquee";
import { ReviewsRibbon } from "@/components/home/ReviewsRibbon";
import { JsonLd } from "@/components/layout/Breadcrumbs";
import { CategoryTile } from "@/components/mascot/CategoryTile";
import { HeroBanner } from "@/components/mascot/HeroBanner";
import { CoinPop } from "@/components/mascot/scenes";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { localePath, makeT, type MessageKey } from "@/i18n";
import { localeOf, type LocaleParams } from "@/lib/route";
import { getCategories, getProducts, getReviewFeed, safe } from "@/lib/server-api";
import { pageMeta, storeJsonLd } from "@/lib/seo";
import { toCardProducts } from "@/lib/card";
import { cardContext, loadSchema } from "@/lib/catalog";
import { menuTree } from "@/lib/category-tree";

// Literal on purpose: Next reads segment config statically (must match REVALIDATE_SECONDS).
export const revalidate = 60;

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeOf(params);
  const t = makeT(locale);
  return pageMeta({ locale, path: "/", title: t("meta.title"), absoluteTitle: true, description: t("meta.description") });
}

/** Each point has its pixel character: the forklift with a parcel, the coin-heart, the mascot
 *  inspecting a mouse through a magnifier («we check every item»), the mascot typing («a real person answers»). */
const TRUST: { sprite: "hauler_box" | "don_ua" | "devices" | "dm"; title: MessageKey; text: MessageKey }[] = [
  { sprite: "hauler_box", title: "home.trust.delivery.title", text: "home.trust.delivery.text" },
  { sprite: "don_ua", title: "home.trust.payment.title", text: "home.trust.payment.text" },
  { sprite: "devices", title: "home.trust.warranty.title", text: "home.trust.warranty.text" },
  { sprite: "dm", title: "home.trust.chat.title", text: "home.trust.chat.text" },
];

export default async function HomePage({ params }: { params: LocaleParams }) {
  const locale = await localeOf(params);
  const t = makeT(locale);
  const href = (p: string) => localePath(locale, p);

  const [allCategories, schema, hits, fresh, feed] = await Promise.all([
    safe(getCategories(locale), []),
    loadSchema(locale),
    safe(getProducts({ sort: "default", inStock: true, size: 8 }, locale), null),
    safe(getProducts({ sort: "new", inStock: true, size: 8 }, locale), null),
    safe(getReviewFeed(locale), null),
  ]);
  // Tiles and banner slides: ROOT categories with products (+ the virtual «Уцінка» last).
  const categories = menuTree(allCategories);
  const card = cardContext(schema, locale);

  return (
    <>
      <JsonLd data={storeJsonLd(locale)} />

      {/* hero (DESIGN-V3 §6, after the brandboard's website example) */}
      <section className="container-site pt-8 md:pt-14">
        <div className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] xl:grid-cols-[minmax(0,1fr)_520px]">
          <div className="relative min-w-0 max-w-2xl">
            <p className="eyebrow flex items-center gap-3 text-[11px]">
              <span aria-hidden className="tech-mark" />
              {t("brand.tagline")}
            </p>
            <h1 className="mt-5 font-display text-[36px] font-extrabold uppercase leading-[1] tracking-[.01em] text-[var(--ink)] [overflow-wrap:anywhere] sm:text-[54px] lg:text-[60px] xl:text-[68px]">
              {t("home.hero.title.pre")}{" "}
              <span className="text-[var(--accent)] [text-shadow:0_0_32px_rgba(255,102,0,.45)]">{t("home.hero.title.accent")}</span>
              <br className="hidden sm:block" /> {t("home.hero.title.post")}
            </h1>
            <p className="eyebrow mt-5 text-[11px] leading-relaxed text-[var(--ink)] sm:text-[12px]">{t("home.hero.kicker")}</p>
            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-[var(--muted)] sm:text-[17px]">{t("home.hero.text")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <span className="cta-glow mx-coin-host flex w-full sm:w-auto">
                <CoinPop />
                <ButtonLink href={href("/catalog")} variant="accent" size="lg" className="w-full sm:w-auto" icon={<ArrowRight className="h-5 w-5" strokeWidth={2.25} />}>
                  {t("home.hero.cta")}
                </ButtonLink>
              </span>
              <ButtonLink href={href("/delivery")} variant="surface" size="lg" className="w-full sm:w-auto">
                {t("home.hero.cta2")}
              </ButtonLink>
            </div>
          </div>
          {/* Category slides (slogan + device icon) with the «21» mascot peeking from the corner:
              under the copy on phones/tablets, the right column from lg (HeroBanner, hero-banner.css). */}
          <HeroBanner categories={categories} />
        </div>
      </section>

      {/* brands — a thin running strip right under the hero (logos from the admin, names otherwise) */}
      {schema.brands.length > 0 && <BrandsMarquee brands={schema.brands} />}

      {/* categories */}
      {categories.length > 0 && (
        <section className="container-site mt-16 md:mt-20" aria-labelledby="home-cats">
          <SectionHead id="home-cats" title={t("home.categories")} more={href("/catalog")} moreLabel={t("common.showAll")} />
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {categories.map((c) => (
              <li key={c.id}>
                <CategoryTile
                  href={href(`/catalog/${c.slug}`)}
                  slug={c.slug}
                  name={c.name}
                  artKind={c.artKind}
                  count={t("home.categoryCount", { n: c.productCount })}
                  loadingLabel={t("home.tile.loading")}
                  readyLabel={t("home.tile.ready")}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {hits && hits.items.length > 0 && (
        <section className="container-site mt-16 md:mt-20" aria-labelledby="home-hits">
          <SectionHead id="home-hits" title={t("home.hits")} more={href("/catalog")} moreLabel={t("common.showAll")} />
          <ProductGrid products={toCardProducts(hits.items, card)} />
        </section>
      )}

      {fresh && fresh.items.length > 0 && (
        <section className="container-site mt-16 md:mt-20" aria-labelledby="home-new">
          <SectionHead id="home-new" title={t("home.new")} more={href("/catalog?sort=new")} moreLabel={t("common.showAll")} />
          <ProductGrid products={toCardProducts(fresh.items, card)} />
        </section>
      )}

      {/* reviews ribbon — under the products, before the trust row */}
      {feed && feed.items.length > 0 && <ReviewsRibbon summary={feed.summary} items={feed.items} />}

      {/* trust */}
      <section className="container-site mt-16 md:mt-20" aria-labelledby="home-trust">
        <h2 id="home-trust" className="sr-only">
          {t("home.trust.title")}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST.map(({ sprite, title, text }, i) => (
            <li key={title} className="nb flex items-center gap-4 p-5">
              <span
                aria-hidden
                className="mx-trust chamfer flex h-16 w-[76px] shrink-0 items-end justify-center overflow-hidden bg-[var(--accent-soft)]"
                style={{ "--i": i } as React.CSSProperties}
              >
                { }
                <img src={`/mascot/trust/${sprite}.webp`} alt="" draggable={false} loading="lazy" decoding="async" className="mx-trust-img block h-14 w-auto max-w-[72px] object-contain" />
              </span>
              <div>
                <h3 className="font-display text-[15px] font-bold uppercase tracking-[.06em] text-[var(--ink)]">{t(title)}</h3>
                <p className="mt-1 text-[14px] leading-snug text-[var(--muted)]">{t(text)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function SectionHead({ id, title, more, moreLabel }: { id: string; title: string; more: string; moreLabel: string }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <h2 id={id} className="flex min-w-0 items-center gap-3 font-display text-[24px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)] sm:text-[32px]">
        <span aria-hidden className="tech-mark" />
        <span className="min-w-0">{title}</span>
      </h2>
      <Link
        href={more}
        className="inline-flex shrink-0 items-center gap-1.5 pb-1 font-display text-[12px] font-semibold uppercase tracking-[.12em] text-[var(--muted)] transition-colors hover:text-[var(--accent-hi)] sm:text-[13px]"
      >
        {moreLabel} <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
      </Link>
    </div>
  );
}

