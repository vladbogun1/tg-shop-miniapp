import type { Metadata } from "next";
import { LegalView } from "@/components/info/LegalView";
import { alternates, makeT } from "@/i18n";
import { loadLegal } from "@/lib/legal";
import { localeOf, type LocaleParams } from "@/lib/route";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeOf(params);
  return { title: makeT(locale)("info.privacy"), alternates: alternates("/privacy", locale) };
}

export default async function Page({ params }: { params: LocaleParams }) {
  const locale = await localeOf(params);
  const doc = await loadLegal("privacy", locale);
  return <LegalView locale={locale} title={makeT(locale)("info.privacy")} doc={doc} />;
}
