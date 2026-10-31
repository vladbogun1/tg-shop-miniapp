import type { Metadata } from "next";
import { CaseRulesLive } from "@/features/legal/view";
import { LegalView } from "@/features/legal/view";
import { makeT } from "@/i18n";
import { legalPageMeta, loadLegal } from "@/features/legal/server";
import { localeOf, type LocaleParams } from "@/lib/route";
import { getGift } from "@/features/gift/server";

/**
 * Rules of the «Кейси з подарунками» promotion (docs/GIFT-CASE.md «Юридическое»): the owner's text
 * (content/legal/{uk,ru,en}/case-rules.md) + the live thresholds and gifts from GET /api/public/gift.
 * Per request (the build has no backend); the data itself is cached for 5 minutes. The address is
 * stable — adverts link to it (art. 8 of the Law on Advertising: where the terms are published).
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeOf(params);
  const t = makeT(locale);
  return legalPageMeta(locale, "caseRules", t("info.caseRules"), t("meta.desc.caseRules"));
}

export default async function Page({ params }: { params: LocaleParams }) {
  const locale = await localeOf(params);
  const [doc, gift] = await Promise.all([
    loadLegal("caseRules", locale),
    // undefined = the backend did not answer (the page then says so instead of «not running»)
    getGift(locale).then(
      (r) => r.gift,
      () => undefined
    ),
  ]);
  return (
    <LegalView
      locale={locale}
      title={makeT(locale)("info.caseRules")}
      doc={doc}
      live={<CaseRulesLive locale={locale} gift={gift} />}
    />
  );
}
