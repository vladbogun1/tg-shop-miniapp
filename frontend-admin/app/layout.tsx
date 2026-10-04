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
  title: "MAXSOLCH — админка",
  description: "Админка магазина MAX/SOLCH: заказы, отправка, товары, оплата, клиенты",
  applicationName: "MAXSOLCH Admin",
  // The manifest is linked automatically from app/manifest.ts.
  appleWebApp: {
    capable: true,
    title: "MAXSOLCH",
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
  // Light theme colour; the stored theme updates it before paint (themeInit) and on toggle (lib/theme).
  themeColor: "#F4F1E6",
};

// Apply the stored theme before paint to avoid a flash (light by default) — also the status bar /
// browser chrome colour of the installed app.
const themeInit = `(function(){var d='light';try{d=localStorage.getItem('admin-theme')==='dark'?'dark':'light';}catch(e){}document.documentElement.setAttribute('data-theme',d);try{var m=document.querySelector('meta[name=theme-color]');if(m)m.setAttribute('content',d==='dark'?'#26262B':'#F4F1E6');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <div className="aurora" aria-hidden />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
