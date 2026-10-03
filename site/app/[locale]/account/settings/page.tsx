import type { Metadata } from "next";
import { SettingsView } from "@/components/account/SettingsView";
import { makeT } from "@/i18n";
import { localeOf, type LocaleParams } from "@/lib/route";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeOf(params);
  return { title: makeT(locale)("account.settings"), robots: { index: false, follow: false } };
}

export default function AccountSettingsPage() {
  return <SettingsView />;
}
