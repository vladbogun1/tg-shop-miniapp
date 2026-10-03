import { ArrowRight, CreditCard, MessageCircle, ShieldCheck, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ProductGrid } from "@/components/catalog/ProductCard";
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

const TILE_COLORS = ["var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--accent)"];

const TRUST: { icon: typeof Truck; title: MessageKey; text: MessageKey; color: string }[] = [
  { icon: Truck, title: "home.trust.delivery.title", text: "home.trust.delivery.text", color: "var(--c3)" },
  { icon: CreditCard, title: "home.trust.payment.title", text: "home.trust.payment.text", color: "var(--c4)" },
  { icon: ShieldCheck, title: "home.trust.warranty.title", text: "home.trust.warranty.text", color: "var(--c5)" },
  { icon: MessageCircle, title: "home.trust.chat.title", text: "home.trust.chat.text", color: "var(--c2)" },
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
          name: "MAXSOLCH",
          url: SITE_URL,
          sameAs: [BOT_URL],
          legalName: "ФОП Солоха Максим Андрійович",
        }}
      />

      {/* hero */}
      <section className="container-site pt-6 md:pt-10">
        <div className="nb-lg relative overflow-hidden bg-[var(--surface)] p-6 sm:p-10 lg:p-14">
          <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 hidden h-64 w-64 rotate-12 border-[3px] border-[var(--line)] bg-[var(--c3)] md:block" />
          <div aria-hidden className="pointer-events-none absolute bottom-8 right-40 hidden h-24 w-24 -rotate-6 border-[3px] border-[var(--line)] bg-[var(--c2)] lg:block" />
          <div aria-hidden className="pointer-events-none absolute bottom-[-30px] right-8 hidden h-40 w-40 rounded-full border-[3px] border-[var(--line)] bg-[var(--accent)] md:block" />
          <div className="relative max-w-2xl">
            <p className="nb-up inline-block border-[2.5px] border-[var(--line)] bg-[var(--ink)] px-2 py-1 text-[12px] font-black text-[var(--bg)]">
              {t("home.hero.kicker")}
            </p>
            <h1 className="mt-4 text-[34px] font-black uppercase leading-[1.02] tracking-tight text-[var(--ink)] sm:text-[48px] lg:text-[60px]">
              {t("home.hero.title")}
            </h1>
            <p className="mt-4 max-w-xl text-[16px] font-semibold leading-relaxed text-[var(--muted)] sm:text-[18px]">
              {t("home.hero.text")}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <ButtonLink href={href("/catalog")} variant="accent" size="lg" className="w-full sm:w-auto" icon={<ArrowRight className="h-5 w-5" strokeWidth={2.75} />}>
                {t("home.hero.cta")}
              </ButtonLink>
              <ButtonLink href={href("/delivery")} variant="surface" size="lg" className="w-full sm:w-auto">
                {t("home.hero.cta2")}
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>

      {/* categories */}
      {categories.length > 0 && (
        <section className="container-site mt-14" aria-labelledby="home-cats">
          <SectionHead id="home-cats" title={t("home.categories")} more={href("/catalog")} moreLabel={t("common.showAll")} />
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {categories.map((c, i) => (
              <li key={c.id}>
                <Link
                  href={href(`/catalog/${c.slug}`)}
                  className="nb nb-hover flex h-full min-h-[96px] flex-col justify-between p-4"
                  style={{ background: TILE_COLORS[i % TILE_COLORS.length] }}
                >
                  <span className="text-[16px] font-black uppercase leading-tight tracking-wide text-[var(--accent-ink)]">
                    {c.name}
                  </span>
                  <span className="mt-2 text-[12px] font-bold text-[var(--accent-ink)] opacity-75">
                    {t("home.categoryCount", { n: c.productCount })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hits && hits.items.length > 0 && (
        <section className="container-site mt-14" aria-labelledby="home-hits">
          <SectionHead id="home-hits" title={t("home.hits")} more={href("/catalog")} moreLabel={t("common.showAll")} />
          <ProductGrid products={hits.items} priorityCount={4} />
        </section>
      )}

      {fresh && fresh.items.length > 0 && (
        <section className="container-site mt-14" aria-labelledby="home-new">
          <SectionHead id="home-new" title={t("home.new")} more={href("/catalog?sort=new")} moreLabel={t("common.showAll")} />
          <ProductGrid products={fresh.items} />
        </section>
      )}

      {/* trust */}
      <section className="container-site mt-16" aria-labelledby="home-trust">
        <h2 id="home-trust" className="sr-only">
          {t("home.trust.title")}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST.map(({ icon: Icon, title, text, color }) => (
            <li key={title} className="nb flex gap-4 p-5">
              <span
                className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--r)] border-[3px] border-[var(--line)] text-[var(--accent-ink)]"
                style={{ background: color }}
              >
                <Icon className="h-6 w-6" strokeWidth={2.5} />
              </span>
              <div>
                <h3 className="text-[15px] font-black uppercase tracking-wide text-[var(--ink)]">{t(title)}</h3>
                <p className="mt-1 text-[14px] font-medium leading-snug text-[var(--muted)]">{t(text)}</p>
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
    <div className="mb-5 flex items-end justify-between gap-4">
      <h2 id={id} className="text-[26px] font-black uppercase tracking-tight text-[var(--ink)] sm:text-[32px]">
        {title}
      </h2>
      <Link
        href={more}
        className="inline-flex shrink-0 items-center gap-1 text-[13px] font-black uppercase tracking-wide text-[var(--ink)] hover:text-[var(--accent)]"
      >
        {moreLabel} <ArrowRight className="h-4 w-4" strokeWidth={3} />
      </Link>
    </div>
  );
}
