import { PRELOADER_CSS, PRELOADER_HTML, PRELOADER_NOSCRIPT_CSS, PRELOADER_SCRIPT } from "@shop/shared";

/**
 * First-load preloader (logo + loading bar), server-rendered at the very top of <body> so it is
 * on screen from the first paint. Behaviour lives in `@shop/shared` (brand/preloader.ts): the
 * inline script tracks DOM / fonts / hydration / load / first-viewport images, keeps it up at least
 * 500ms and at most 4s, then fades it out. Shown on a real page load only — never on client-side
 * navigation. Hidden without JS via <noscript>. Pair with <PreloaderReady /> inside the providers.
 */
export function Preloader() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRELOADER_CSS }} />
      <noscript>
        <style dangerouslySetInnerHTML={{ __html: PRELOADER_NOSCRIPT_CSS }} />
      </noscript>
      <div id="cs-preloader" aria-hidden suppressHydrationWarning dangerouslySetInnerHTML={{ __html: PRELOADER_HTML }} />
      <script dangerouslySetInnerHTML={{ __html: PRELOADER_SCRIPT }} />
    </>
  );
}
