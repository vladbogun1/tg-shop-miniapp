import { Info } from "lucide-react";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { makeT } from "@/i18n";
import type { Locale } from "@/i18n/locales";
import { makeFmt } from "@/lib/format";
import type { LegalDoc } from "@/lib/legal";

/** A rendered legal page with breadcrumbs, a "Ukrainian only" note for ru/en and the update date. */
export function LegalView({ locale, title, doc }: { locale: Locale; title: string; doc: LegalDoc }) {
  const t = makeT(locale);
  const fmt = makeFmt(locale);
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
        <div className="prose-nb" dangerouslySetInnerHTML={{ __html: doc.html }} />
        {doc.updated && (
          <p className="mt-8 border-t border-[var(--line)] pt-3 text-[12px] font-medium text-[var(--muted)]" lang={locale}>
            {t("info.updated", { date: fmt.date(doc.updated) })}
          </p>
        )}
      </article>
    </div>
  );
}
