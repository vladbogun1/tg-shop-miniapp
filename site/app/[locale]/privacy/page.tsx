import type { Metadata } from "next";
import { LegalView } from "@/components/info/LegalView";
import { makeT } from "@/i18n";
import { loadLegal } from "@/lib/legal";
import { localeOf, type LocaleParams } from "@/lib/route";
import { legalPageMeta } from "@/lib/seo";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeOf(params);
  const t = makeT(locale);
  return legalPageMeta(locale, "/privacy", t("info.privacy"), t("meta.desc.privacy"));
}

export default async function Page({ params }: { params: LocaleParams }) {
  const locale = await localeOf(params);
  const doc = await loadLegal("privacy", locale);
  return <LegalView locale={locale} title={makeT(locale)("info.privacy")} doc={doc} />;
}
