import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Breadcrumbs } from "@/features/layout/view";
import { makeT } from "@/i18n";
import { FALLBACK_LOCALE, type Locale } from "@shop/core/i18n";
import { makeFmt, SHOP_TIME_ZONE } from "@/lib/format";
import type { LegalDoc } from "@/features/legal";

/** Where a page's live block goes in its markdown (`<!-- live -->` on a line of its own). */
const LIVE_MARKER = /<!--\s*live\s*-->/;

/**
 * A rendered legal page with breadcrumbs and the update date. `live` (server-rendered data, e.g. the
 * promotion's thresholds and gifts) replaces the `<!-- live -->` marker of the text, or follows it. A translated (ru/en) text ends with a
 * note that the Ukrainian original prevails; a language without its own text shows the Ukrainian
 * one with a "Ukrainian only" note on top.
 */
export function LegalView({ locale, title, doc, live }: { locale: Locale; title: string; doc: LegalDoc; live?: ReactNode }) {
  const t = makeT(locale);
  const fmt = makeFmt(locale, SHOP_TIME_ZONE);
  const [before, after] = live ? doc.html.split(LIVE_MARKER, 2) : [doc.html];
  return (
    <div className="container-site pt-6">
      <Breadcrumbs locale={locale} items={[{ label: title }]} />
      <article className="nb mx-auto max-w-3xl p-5 sm:p-10" lang={doc.contentLocale}>
        {locale !== doc.contentLocale && (
          <p className="mb-6 flex items-start gap-2 rounded-[var(--r)] border border-[rgba(255,102,0,.35)] bg-[var(--accent-soft)] px-3 py-2 text-[13px] font-medium text-[var(--ink)]" lang={locale}>
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2.25} />
            {t("info.ukOnly")}
          </p>
        )}
        <div className="prose-nb" dangerouslySetInnerHTML={{ __html: before }} />
        {live && (
          <div className="my-5" lang={locale}>
            {live}
          </div>
        )}
        {after && <div className="prose-nb" dangerouslySetInnerHTML={{ __html: after }} />}
        {(doc.updated || doc.contentLocale !== FALLBACK_LOCALE) && (
          <div className="mt-8 flex flex-col gap-1 border-t border-[var(--line)] pt-3 text-[12px] font-medium text-[var(--muted)]" lang={locale}>
            {doc.updated && <p>{t("info.updated", { date: fmt.date(doc.updated) })}</p>}
            {doc.contentLocale !== FALLBACK_LOCALE && <p>{t("info.translationNote")}</p>}
          </div>
        )}
      </article>
    </div>
  );
}
