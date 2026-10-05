import type { Metadata } from "next";
import { SupportList } from "@/components/support/SupportList";
import { makeT } from "@/i18n";
import { localeOf, type LocaleParams } from "@/lib/route";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeOf(params);
  return { title: makeT(locale)("support.title"), robots: { index: false, follow: false } };
}

export default function AccountSupportPage() {
  return <SupportList />;
}
