import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { Providers } from "@/components/Providers";
import { TabBar } from "@/components/TabBar";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Магазин",
  description: "Telegram Mini App — tg-shop-v2",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover", // safe-area insets (notch)
  themeColor: "#0c1118",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className={inter.variable}>
      <head>
        {/* Official Telegram WebApp SDK — guarantees window.Telegram.WebApp (initData,
            theme, MainButton) in any Telegram client (mobile + desktop). */}
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </head>
      <body>
        {/* Zhivoy gradientnyy "scene" background za steklom (design doc §8.2) */}
        <div className="scene" aria-hidden />
        <Providers>
          {/* Tsentrirovannyy container, max-width ~480px (design doc §8bis.1).
              Bottom padding ostavlyaet mesto pod tab-bar. */}
          <main
            className="relative z-10 mx-auto min-h-dvh w-full max-w-[480px] px-4"
            style={{
              paddingTop: "max(16px, var(--safe-top))",
              paddingBottom: "calc(96px + var(--safe-bottom))",
            }}
          >
            {children}
          </main>
          <TabBar />
        </Providers>
      </body>
    </html>
  );
}
