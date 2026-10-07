import type { Metadata } from "next";
import { AccountReviews } from "@/components/reviews/AccountReviews";
import { makeT } from "@/i18n";
import { localeOf, type LocaleParams } from "@/lib/route";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeOf(params);
  return { title: makeT(locale)("account.reviews"), robots: { index: false, follow: false } };
}

export default function AccountReviewsPage() {
  return <AccountReviews />;
}
