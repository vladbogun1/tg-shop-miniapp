import type { Metadata, Viewport } from "next";
import { Exo_2, Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { Preloader } from "@/components/Preloader";
import { PreloaderReady } from "@/components/PreloaderReady";
import { Providers } from "@/components/Providers";
import { makeT } from "@/i18n";
import { isLocale, LOCALE_TAG, type Locale } from "@/i18n/locales";
import { SITE_URL } from "@/lib/config";
import { pageMeta } from "@/lib/seo";
import { getCategories, safe } from "@/lib/server-api";
import "../globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
  display: "swap",
});

/** Display face (DESIGN-V3 §3): headings, buttons, prices, labels; italic 800 for the wordmark. */
const exo = Exo_2({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-exo",
  display: "swap",
});

/**
 * Nothing is prerendered at build time — the build has no backend to talk to. Every page is
 * rendered on its first request and then cached (ISR), see REVALIDATE_SECONDS.
 */
export function generateStaticParams() {
  return [];
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0E0E10",
  colorScheme: "dark",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "uk";
  const t = makeT(locale);
  const indexable = process.env.SITE_INDEXABLE === "true";
  // Defaults for every page (pages send their own full set via pageMeta). No canonical/hreflang
  // here: a page that forgets them (the 404) must not claim to be the home page.
  const base = pageMeta({ locale, path: "/", title: t("meta.title"), absoluteTitle: true, description: t("meta.description") });
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t("meta.title"), template: "%s · ChiSetup" },
    description: t("meta.description"),
    applicationName: "ChiSetup",
    openGraph: { ...base.openGraph, url: undefined },
    twitter: base.twitter,
    // Indexable is the default, so nothing is emitted then — otherwise the 404 page carried both
    // "index, follow" from here and Next's own "noindex".
    ...(indexable ? {} : { robots: { index: false, follow: false } }),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const categories = await safe(getCategories(locale), []);

  return (
    <html lang={LOCALE_TAG[locale]} className={`${inter.variable} ${exo.variable}`} suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col">
        {/* First-load overlay (logo + loading bar) — plain HTML, painted before fonts/React. */}
        <Preloader />
        <div className="scene" aria-hidden />
        <Providers locale={locale}>
          <PreloaderReady />
          <Header categories={categories} />
          {/* No z-index here: it would trap the sheets and lightboxes rendered inside under the sticky header. */}
          <main id="main" className="relative flex-1">
            {children}
          </main>
          <Footer categories={categories} locale={locale} />
        </Providers>
      </body>
    </html>
  );
}
