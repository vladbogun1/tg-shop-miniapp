"use client";

/**
 * Invisible glue of the installed app:
 *  - PwaBoot (whole app, also the login screen): registers the service worker and catches
 *    Chrome's install prompt before anything else can miss it.
 *  - AppRuntime (inside the logged-in shell): opens the screen a tapped notification points to,
 *    keeps the app-icon badge = «Внимание» and tracks the on-screen keyboard (hides the tab bar,
 *    keeps the focused field in view). The push subscription is renewed by PushOfferBanner.
 */
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useInbox } from "@/lib/inbox";
import { startPwa } from "@/lib/pwa";
import { setAppBadge } from "@/lib/push";

export function PwaBoot() {
  useEffect(() => {
    startPwa();
  }, []);
  return null;
}

/** A keyboard is up when the visual viewport lost a good part of the layout height. */
function useKeyboardWatcher() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !window.matchMedia("(pointer: coarse)").matches) return;
    const root = document.documentElement;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const focused = document.activeElement;
        const typing = !!focused && focused.matches("input, textarea, select, [contenteditable=true]");
        // iOS keeps the layout viewport and shrinks only the visual one; Android (resizes-content)
        // shrinks both — then the focus check alone tells us.
        const shrunk = vv.height < window.innerHeight * 0.8 || window.innerHeight < screen.height * 0.6;
        root.classList.toggle("kb-open", typing && shrunk);
      });
    };
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || !el.matches?.("input, textarea, select")) return;
      update();
      // After the keyboard animation: if the field ended up under it, bring it to the middle.
      window.setTimeout(() => {
        const r = el.getBoundingClientRect();
        const visibleBottom = vv.offsetTop + vv.height;
        if (r.bottom > visibleBottom - 8 || r.top < vv.offsetTop) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        update();
      }, 320);
    };
    const onFocusOut = () => window.setTimeout(update, 50);
    vv.addEventListener("resize", update);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", update);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      root.classList.remove("kb-open");
    };
  }, []);
}

export function AppRuntime() {
  const router = useRouter();
  const { data: inbox } = useInbox();
  const total = inbox?.total;

  // Notification tapped while the app is open: the service worker asks us to navigate.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; url?: string } | null;
      if (data?.type === "OPEN_URL" && typeof data.url === "string" && data.url.startsWith("/")) {
        router.push(data.url);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  useEffect(() => {
    if (typeof total === "number") setAppBadge(total);
  }, [total]);

  // This device's push subscription is renewed by <PushOfferBanner> (it also offers to turn push
  // on when there is none — e.g. after «Выйти везде»).

  useKeyboardWatcher();
  return null;
}
