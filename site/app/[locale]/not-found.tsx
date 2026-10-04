import type { Metadata } from "next";
import { ErrorScreen } from "@/components/errors/ErrorScreen";
import { makeT } from "@/i18n";
import { isLocale } from "@/i18n/locales";

/** The 404's own title instead of the home page's (Next adds `noindex` to a 404 itself). */
export async function generateMetadata(props: { params?: Promise<{ locale?: string }> }): Promise<Metadata> {
  const raw = (await props.params?.catch(() => undefined))?.locale;
  const t = makeT(isLocale(raw) ? raw : "uk");
  return { title: t("notFound.title"), description: t("notFound.text") };
}

export default function NotFound() {
  return <ErrorScreen code={404} />;
}
