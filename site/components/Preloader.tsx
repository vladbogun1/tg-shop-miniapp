import { PRELOADER_CSS, PRELOADER_HTML, PRELOADER_NOSCRIPT_CSS, PRELOADER_SCRIPT } from "@shop/shared";

/**
 * First-load preloader (logo + loading bar), server-rendered at the very top of <body> so it is
 * on screen from the first paint. Behaviour lives in `@shop/shared` (brand/preloader.ts): the
 * inline script tracks DOM / fonts / hydration / load / first-viewport images and fades it out
 * (at most 4s). Shown on a real page load only — never on client-side navigation, never to crawlers
 * or Lighthouse. Hidden without JS via <noscript>. Pair with <PreloaderReady /> inside the providers.
 *
 * Website mode (`data-grace` / `data-min`): the overlay stays invisible for the first 300ms and only
 * appears if the page is not usable by then, with no minimum time on screen — so a fast load paints
 * the page (and its LCP heading) straight away. It shows at most once per tab session and leaves as
 * soon as the page is usable (not after every image). See brand/preloader.ts.
 */
export function Preloader() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRELOADER_CSS }} />
      <noscript>
        <style dangerouslySetInnerHTML={{ __html: PRELOADER_NOSCRIPT_CSS }} />
      </noscript>
      <div
        id="cs-preloader"
        data-grace="300"
        data-min="0"
        data-once="session"
        data-until="usable"
        aria-hidden
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: PRELOADER_HTML }}
      />
      <script dangerouslySetInnerHTML={{ __html: PRELOADER_SCRIPT }} />
    </>
  );
}
