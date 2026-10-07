import type { Metadata } from "next";
import { LegalView } from "@/components/info/LegalView";
import { makeT } from "@/i18n";
import { legalPageMeta, loadLegal } from "@/lib/legal";
import { localeOf, type LocaleParams } from "@/lib/route";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeOf(params);
  const t = makeT(locale);
  return legalPageMeta(locale, "warranty", t("info.warranty"), t("meta.desc.warranty"));
}

export default async function Page({ params }: { params: LocaleParams }) {
  const locale = await localeOf(params);
  const doc = await loadLegal("warranty", locale);
  return <LegalView locale={locale} title={makeT(locale)("info.warranty")} doc={doc} />;
}
