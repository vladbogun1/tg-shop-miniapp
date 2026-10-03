import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { Providers } from "@/components/Providers";
import { alternates, makeT } from "@/i18n";
import { isLocale, LOCALE_TAG, type Locale } from "@/i18n/locales";
import { SITE_URL } from "@/lib/config";
import { getCategories, safe } from "@/lib/server-api";
import "../globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F1E6" },
    { media: "(prefers-color-scheme: dark)", color: "#26262B" },
  ],
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
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t("meta.title"), template: "%s · MAXSOLCH" },
    description: t("meta.description"),
    applicationName: "MAXSOLCH",
    alternates: alternates("/", locale),
    openGraph: {
      type: "website",
      siteName: "MAXSOLCH",
      locale: LOCALE_TAG[locale].replace("-", "_"),
      title: t("meta.title"),
      description: t("meta.description"),
    },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: false },
  };
}

/** Applies the stored theme before the first paint (light by default), like the Mini App. */
const THEME_SCRIPT =
  "(function(){try{var t=localStorage.getItem('neo-theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();";

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
  const categories = await safe(getCategories(), []);

  return (
    <html lang={LOCALE_TAG[locale]} className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <div className="scene" aria-hidden />
        <Providers locale={locale}>
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
