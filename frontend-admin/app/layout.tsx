import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Providers } from "@/components/Providers";
// Fonts are bundled from npm (@fontsource-variable), not fetched from Google at build time:
// a flaky fonts.googleapis.com used to break `next build`. Only the subsets in use are downloaded.
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/exo-2/wght.css";
import "@fontsource-variable/exo-2/wght-italic.css";
import "./globals.css";


export const metadata: Metadata = {
  title: "ChiSetup Admin",
  description: "Админка магазина ChiSetup: заказы, отправка, товары, оплата, клиенты",
  applicationName: "ChiSetup Admin",
  // The manifest is linked automatically from app/manifest.ts.
  appleWebApp: {
    capable: true,
    title: "ChiSetup Admin",
    // Content runs under the status bar; the shell pads itself with env(safe-area-inset-top).
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: [{ url: "/icons/apple-touch-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  formatDetection: { telephone: false, email: false, address: false },
  other: {
    // Older iOS reads only this name (Next emits the newer mobile-web-app-capable).
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Android Chrome: the on-screen keyboard shrinks the layout, so fields and sticky bars stay visible.
  interactiveWidget: "resizes-content",
  // One dark theme (v3) — also the status bar / browser chrome colour of the installed app.
  themeColor: "#0E0E10",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <div className="aurora" aria-hidden />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
