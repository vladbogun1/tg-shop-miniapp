import type { Metadata } from "next";
import { shortOrderId } from "@shop/shared";
import { OrderDetailView } from "@/components/account/OrderDetailView";
import { makeT } from "@/i18n";
import { localeOf } from "@/lib/route";

type Params = Promise<{ locale: string; id: string }>;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const locale = await localeOf(params);
  const { id } = await params;
  return { title: makeT(locale)("order.title", { id: shortOrderId(id) }), robots: { index: false, follow: false } };
}

export default async function OrderPage({ params }: { params: Params }) {
  const { id } = await params;
  return <OrderDetailView id={id} />;
}
