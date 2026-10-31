import type { Metadata } from "next";
import { CheckoutView } from "@/features/checkout";
import { alternates, makeT } from "@/i18n";
import { localeOf, type LocaleParams } from "@/lib/route";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeOf(params);
  return {
    title: makeT(locale)("checkout.title"),
    alternates: alternates("/checkout", locale),
    robots: { index: false, follow: false },
  };
}

export default function CheckoutPage() {
  return <CheckoutView />;
}
