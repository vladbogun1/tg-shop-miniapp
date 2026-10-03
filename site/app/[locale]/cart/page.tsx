import type { Metadata } from "next";
import { CartPageBody } from "@/components/cart/CartPageBody";
import { alternates, makeT } from "@/i18n";
import { localeOf, type LocaleParams } from "@/lib/route";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeOf(params);
  return {
    title: makeT(locale)("cart.title"),
    alternates: alternates("/cart", locale),
    robots: { index: false, follow: false },
  };
}

export default function CartPage() {
  return <CartPageBody />;
}
