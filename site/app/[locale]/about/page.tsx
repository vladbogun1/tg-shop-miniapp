import { Check } from "lucide-react";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { alternates, localePath, makeT } from "@/i18n";
import { localeOf, type LocaleParams } from "@/lib/route";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeOf(params);
  const t = makeT(locale);
  return { title: t("info.about"), description: t("about.lead"), alternates: alternates("/about", locale) };
}

export default async function AboutPage({ params }: { params: LocaleParams }) {
  const locale = await localeOf(params);
  const t = makeT(locale);
  return (
    <div className="container-site pt-6">
      <Breadcrumbs locale={locale} items={[{ label: t("info.about") }]} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <article className="nb p-6 sm:p-10">
          <h1 className="font-display text-[30px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)] sm:text-[38px]">{t("info.about")}</h1>
          <p className="mt-4 text-[19px] font-semibold leading-snug text-[var(--ink)]">{t("about.lead")}</p>
          <p className="mt-4 text-[16px] leading-relaxed text-[#D4D4D8]">{t("about.text1")}</p>
          <p className="mt-3 text-[16px] leading-relaxed text-[#D4D4D8]">{t("about.text2")}</p>
          <div className="mt-6">
            <ButtonLink href={localePath(locale, "/catalog")} variant="accent">
              {t("common.toCatalog")}
            </ButtonLink>
          </div>
        </article>
        <aside className="nb-lg hud-frame h-fit p-6">
          <h2 className="flex items-center gap-3 font-display text-[18px] font-extrabold uppercase tracking-[.02em]"><span aria-hidden className="tech-mark" />{t("about.facts")}</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {(["about.fact.delivery", "about.fact.payment", "about.fact.chat"] as const).map((k) => (
              <li key={k} className="flex items-start gap-2 text-[15px] font-medium text-[var(--ink)]">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" strokeWidth={2.25} /> {t(k)}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
