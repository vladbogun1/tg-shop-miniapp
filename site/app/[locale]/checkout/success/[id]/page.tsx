import type { Metadata } from "next";
import { SuccessView } from "@/components/checkout/SuccessView";
import { makeT } from "@/i18n";
import { localeOf } from "@/lib/route";

type Params = Promise<{ locale: string; id: string }>;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const locale = await localeOf(params);
  return { title: makeT(locale)("success.title"), robots: { index: false, follow: false } };
}

export default async function SuccessPage({ params }: { params: Params }) {
  const { id } = await params;
  return <SuccessView orderId={id} />;
}
