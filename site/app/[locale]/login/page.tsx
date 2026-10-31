import type { Metadata } from "next";
import { LoginView } from "@/components/auth/LoginView";
import { alternates, makeT } from "@/i18n";
import { localeOf, type LocaleParams } from "@/lib/route";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeOf(params);
  return {
    title: makeT(locale)("login.title"),
    alternates: alternates("/login", locale),
    robots: { index: false, follow: false },
  };
}

export default function LoginPage() {
  return <LoginView />;
}
