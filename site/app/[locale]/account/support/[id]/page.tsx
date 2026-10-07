import type { Metadata } from "next";
import { SupportThreadView } from "@/components/support/SupportChat";
import { makeT } from "@/i18n";
import { localeOf } from "@/lib/route";

type Params = Promise<{ locale: string; id: string }>;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const locale = await localeOf(params);
  return { title: makeT(locale)("support.title"), robots: { index: false, follow: false } };
}

export default async function SupportThreadPage({ params }: { params: Params }) {
  const { id } = await params;
  return <SupportThreadView id={id} />;
}
