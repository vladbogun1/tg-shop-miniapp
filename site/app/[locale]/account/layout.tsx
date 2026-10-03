import type { Metadata } from "next";
import { AccountShell } from "@/components/account/AccountShell";
import { makeT } from "@/i18n";
import { localeOf, type LocaleParams } from "@/lib/route";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeOf(params);
  return {
    title: { default: makeT(locale)("account.title"), template: "%s · MAXSOLCH" },
    robots: { index: false, follow: false },
  };
}

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
