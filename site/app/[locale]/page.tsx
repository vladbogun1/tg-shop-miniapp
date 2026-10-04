import { ArrowRight, CreditCard, MessageCircle, ShieldCheck, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ProductGrid } from "@/components/catalog/ProductCard";
import { CategoryArt, CategoryArtDefs } from "@/components/home/CategoryArt";
import { HeroArt } from "@/components/home/HeroArt";
import { JsonLd } from "@/components/layout/Breadcrumbs";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { alternates, localePath, makeT, type MessageKey } from "@/i18n";
import { BOT_URL, SITE_URL } from "@/lib/config";
import { localeOf, type LocaleParams } from "@/lib/route";
import { getCategories, getProducts, safe } from "@/lib/server-api";

// Literal on purpose: Next reads segment config statically (must match REVALIDATE_SECONDS).
export const revalidate = 60;

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeOf(params);
  const t = makeT(locale);
  return {
    title: { absolute: t("meta.title") },
    description: t("meta.description"),
    alternates: alternates("/", locale),
  };
}

const TRUST: { icon: typeof Truck; title: MessageKey; text: MessageKey }[] = [
  { icon: Truck, title: "home.trust.delivery.title", text: "home.trust.delivery.text" },
  { icon: CreditCard, title: "home.trust.payment.title", text: "home.trust.payment.text" },
  { icon: ShieldCheck, title: "home.trust.warranty.title", text: "home.trust.warranty.text" },
  { icon: MessageCircle, title: "home.trust.chat.title", text: "home.trust.chat.text" },
];

export default async function HomePage({ params }: { params: LocaleParams }) {
  const locale = await localeOf(params);
  const t = makeT(locale);
  const href = (p: string) => localePath(locale, p);

  const [categories, hits, fresh] = await Promise.all([
    safe(getCategories(locale), []),
    safe(getProducts({ sort: "default", inStock: true, size: 8 }, locale), null),
    safe(getProducts({ sort: "new", inStock: true, size: 8 }, locale), null),
  ]);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "ChiSetup",
          url: SITE_URL,
          sameAs: [BOT_URL],
          legalName: "ФОП Солоха Максим Андрійович",
        }}
      />

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
              <span className="cta-glow flex w-full sm:w-auto">
                <ButtonLink href={href("/catalog")} variant="accent" size="lg" className="w-full sm:w-auto" icon={<ArrowRight className="h-5 w-5" strokeWidth={2.25} />}>
                  {t("home.hero.cta")}
                </ButtonLink>
              </span>
              <ButtonLink href={href("/delivery")} variant="surface" size="lg" className="w-full sm:w-auto">
                {t("home.hero.cta2")}
              </ButtonLink>
            </div>
          </div>
          {/* Drawn kit (decorative) in a HUD frame. Desktop only — on narrower screens the copy needs the room. */}
          <div aria-hidden className="hud-frame relative hidden rounded-[var(--r-card)] border border-[var(--line)] bg-[radial-gradient(ellipse_at_60%_70%,rgba(255,102,0,.14),transparent_62%),linear-gradient(180deg,#151517,#0F0F11)] p-6 lg:block">
            <HeroArt className="pointer-events-none relative h-auto w-full select-none" />
          </div>
        </div>
      </section>

      {/* categories */}
      {categories.length > 0 && (
        <section className="container-site mt-16 md:mt-20" aria-labelledby="home-cats">
          <SectionHead id="home-cats" title={t("home.categories")} more={href("/catalog")} moreLabel={t("common.showAll")} />
          <CategoryArtDefs />
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {categories.map((c) => (
              <li key={c.id}>
                <Link
                  href={href(`/catalog/${c.slug}`)}
                  className="nb nb-hover group relative isolate flex h-full min-h-[136px] flex-col justify-between overflow-hidden bg-[radial-gradient(circle_at_85%_85%,rgba(255,102,0,.10),transparent_55%)] p-3.5 sm:min-h-[148px] sm:p-4"
                >
                  <span className="relative z-10 font-display text-[15px] font-bold uppercase leading-tight tracking-[.04em] text-[var(--ink)] [overflow-wrap:anywhere] sm:text-[16px]">
                    {c.name}
                  </span>
                  <span className="relative z-10 mt-2 max-w-[55%] text-[12px] font-medium text-[var(--muted)]">
                    {t("home.categoryCount", { n: c.productCount })}
                  </span>
                  <CategoryArt
                    slug={c.slug}
                    name={c.name}
                    accent="var(--accent)"
                    className="pointer-events-none absolute bottom-1.5 right-2 h-[70px] w-[70px] opacity-80 transition-[transform,opacity] group-hover:opacity-100 duration-200 ease-out group-hover:-translate-y-1 group-hover:-rotate-6 sm:h-[92px] sm:w-[92px] motion-reduce:transition-none motion-reduce:group-hover:transform-none"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hits && hits.items.length > 0 && (
        <section className="container-site mt-16 md:mt-20" aria-labelledby="home-hits">
          <SectionHead id="home-hits" title={t("home.hits")} more={href("/catalog")} moreLabel={t("common.showAll")} />
          <ProductGrid products={hits.items} priorityCount={4} />
        </section>
      )}

      {fresh && fresh.items.length > 0 && (
        <section className="container-site mt-16 md:mt-20" aria-labelledby="home-new">
          <SectionHead id="home-new" title={t("home.new")} more={href("/catalog?sort=new")} moreLabel={t("common.showAll")} />
          <ProductGrid products={fresh.items} />
        </section>
      )}

      {/* trust */}
      <section className="container-site mt-16 md:mt-20" aria-labelledby="home-trust">
        <h2 id="home-trust" className="sr-only">
          {t("home.trust.title")}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST.map(({ icon: Icon, title, text }) => (
            <li key={title} className="nb flex gap-4 p-5">
              <span className="chamfer grid h-12 w-12 shrink-0 place-items-center bg-[var(--accent-soft)] text-[var(--accent)]">
                <Icon className="h-6 w-6" strokeWidth={1.75} />
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
