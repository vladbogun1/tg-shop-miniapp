import type { Metadata } from "next";
import { Waitlist } from "@/features/preorder/view/Waitlist";
import { makeT } from "@/i18n";
import { localeOf, type LocaleParams } from "@/lib/route";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeOf(params);
  return { title: makeT(locale)("preorder.account.title"), robots: { index: false, follow: false } };
}

export default function AccountWaitlistPage() {
  return <Waitlist />;
}
