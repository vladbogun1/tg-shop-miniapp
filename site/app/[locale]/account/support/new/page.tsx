import type { Metadata } from "next";
import { Suspense } from "react";
import { NewSupportView } from "@/components/support/NewSupportView";
import { makeT } from "@/i18n";
import { localeOf, type LocaleParams } from "@/lib/route";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeOf(params);
  return { title: makeT(locale)("support.new"), robots: { index: false, follow: false } };
}

export default function NewSupportPage() {
  // useSearchParams (?product=) needs a Suspense boundary on a statically rendered page.
  return (
    <Suspense fallback={<div className="shimmer h-64" />}>
      <NewSupportView />
    </Suspense>
  );
}
