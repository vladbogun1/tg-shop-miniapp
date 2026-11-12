import type { Metadata } from "next";
import { CheckoutView } from "@/features/checkout";
import { checkoutTextsOf } from "@/features/checkout/server/texts";
import { alternates, makeT } from "@/i18n";
import { CheckoutTextsProvider } from "@/i18n/checkout";
import { localeOf, type LocaleParams } from "@/lib/route";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeOf(params);
  return {
    title: makeT(locale)("checkout.title"),
    alternates: alternates("/checkout", locale),
    robots: { index: false, follow: false },
  };
}

export default async function CheckoutPage({ params }: { params: LocaleParams }) {
  // Тексты оформления одного языка — с сервера, а не все три в бандле.
  const locale = await localeOf(params);
  return (
    <CheckoutTextsProvider texts={checkoutTextsOf(locale)}>
      <CheckoutView />
    </CheckoutTextsProvider>
  );
}
