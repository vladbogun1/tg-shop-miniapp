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
  // The brand, not a translated word: metadata is rendered on the server with no language, and
  // Next re-asserts it on updates, so a client-side override does not stick. A brand name is the
  // right title anyway — it reads the same in all three languages.
  title: "MAXSOLCH",
  description: "Telegram Mini App",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom stays enabled: blocking it fails WCAG 1.4.4 and makes small print unreadable for
  // anyone who needs to magnify it. The layout is already mobile-first, so zoom is not needed to
  // use the shop — only to read it comfortably.
  viewportFit: "cover", // safe-area insets (notch)
  // Matches the light theme the app actually defaults to (it used to declare a dark colour,
  // so Telegram tinted its chrome dark around a light page).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F1E6" },
    { media: "(prefers-color-scheme: dark)", color: "#26262B" },
  ],
};

// DEV ONLY — see the comment at the injection site in <head> below.
const DEV_TELEGRAM_STUB = [
  "(function(){try{",
  "var id=new URLSearchParams(location.search).get('tgstub');if(!id)return;",
  "var u={id:Number(id),first_name:'Dev',last_name:'Tester',username:'dev_tester',language_code:'ru'};",
  "var d='user='+encodeURIComponent(JSON.stringify(u))+'&auth_date='+Math.floor(Date.now()/1000)+'&hash=devstub';",
  "var n=function(){},i={top:0,bottom:0,left:0,right:0};",
  "var w={initData:d,initDataUnsafe:{user:u},version:'8.0',platform:'web',colorScheme:'light',",
  "themeParams:{},safeAreaInset:i,contentSafeAreaInset:i,isExpanded:true,viewportHeight:innerHeight,",
  "viewportStableHeight:innerHeight,ready:n,expand:n,close:n,onEvent:n,offEvent:n,",
  "requestFullscreen:n,exitFullscreen:n,isVersionAtLeast:function(){return true},",
  "setHeaderColor:n,setBackgroundColor:n,enableClosingConfirmation:n,disableClosingConfirmation:n,",
  "HapticFeedback:{impactOccurred:n,notificationOccurred:n,selectionChanged:n},",
  "MainButton:{setText:n,show:n,hide:n,enable:n,disable:n,showProgress:n,hideProgress:n,onClick:n,offClick:n,setParams:n},",
  "BackButton:{show:n,hide:n,onClick:n,offClick:n}};",
  "var t={};",
  "var lock=function(o,k,v){Object.defineProperty(o,k,{get:function(){return v;},set:function(){},configurable:false});};",
  // telegram-web-app.js does `window.Telegram = window.Telegram || {}` and then assigns
  // `.WebApp`, so both the namespace and the WebApp itself have to be write-protected.
  "lock(t,'WebApp',w);lock(window,'Telegram',t);",
  "}catch(e){}})();",
].join("");

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // lang is rewritten by I18nProvider; "uk" here matches the app's own fallback so the
    // first paint is not lying about the most common case.
    <html lang="uk" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Apply the stored neo theme before paint (default light). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('neo-theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();",
          }}
        />
        {/* DEV ONLY. Outside Telegram there is no window.Telegram.WebApp, so the Mini App stays
            unauthenticated and half the screens cannot be opened — which made UI defects
            impossible to reproduce locally or in Playwright. ?tgstub=<telegramUserId> installs a
            minimal WebApp stub; the backend accepts its unsigned initData only because
            ALLOW_UNSIGNED_INIT_DATA is on, and with that flag the app refuses to boot outside the
            dev profile. window.Telegram is locked with defineProperty because telegram-web-app.js
            loads below and would otherwise replace the stub with an empty initData. Next inlines
            NODE_ENV, so the whole block is dropped from a production build.
            See docs/LOCAL-TESTING.md. */}
        {process.env.NODE_ENV === "development" && (
          <script
            dangerouslySetInnerHTML={{
              __html: DEV_TELEGRAM_STUB,
            }}
          />
        )}
        {/* Official Telegram WebApp SDK — guarantees window.Telegram.WebApp (initData,
            theme, MainButton) in any Telegram client (mobile + desktop). */}
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        {/* Reveal the webview ASAP: call WebApp.ready()/expand() as soon as the SDK
            exists, INDEPENDENT of React/initData. On iOS the Telegram loading
            placeholder stays until ready() fires; if it were only called from a
            React effect (and skipped when initData is briefly empty) the Mini App
            could hang on the placeholder forever. This poller fixes that. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){function r(){try{var w=window.Telegram&&window.Telegram.WebApp;if(w){if(w.ready)w.ready();if(w.expand)w.expand();return true;}}catch(e){}return false;}if(!r()){var n=0,t=setInterval(function(){if(r()||++n>60)clearInterval(t);},50);}})();",
          }}
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
              paddingBottom: "calc(var(--tabbar-h) + 12px + var(--safe-bottom))",
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
