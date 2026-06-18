import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { Providers } from "@/components/Providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Админка — tg-shop-v2",
  description: "Liquid Glass admin panel",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0c1118",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className={inter.variable}>
      <body>
        {/* Telegram WebApp SDK — present when the panel is opened in Telegram. */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <div className="scene" aria-hidden />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
