"use client";

/**
 * Halloween 2026 — the bridge to the pumpkin hunt widget (/hw/spawner.js, a separate service, see
 * events/halloween/README.md). The widget draws itself in its own shadow root; the site only tells
 * it how to sign in and where the header ends, and places the counter in the header.
 * Remove with the event: this file, its two usages (layout, Header) and halloween.css.
 */
import { createElement, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isHalloween } from "@shop/shared";
import { useI18n } from "@/i18n/context";
import { refreshSession } from "@/lib/api";
import { useSession } from "@/lib/session";
import "./halloween.css";

declare global {
  interface Window {
    HW_CONFIG?: Record<string, unknown>;
    HW?: { open: () => void; refresh: () => Promise<void> };
  }
}

export function HalloweenWidget() {
  const { href, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const { status } = useSession();

  useEffect(() => {
    if (!isHalloween()) {
      delete document.documentElement.dataset.event;
      return;
    }
    window.HW_CONFIG = {
      app: "site",
      getLocale: () => document.documentElement.lang || locale,
      refresh: () => refreshSession(),
      login: () => router.push(href(`/login?next=${encodeURIComponent(location.pathname + location.search)}`)),
      insets: () => {
        const h = document.querySelector("header");
        return { top: h ? Math.max(0, h.getBoundingClientRect().bottom) : 64, bottom: 16 };
      },
      rulesUrl: href("/halloween-rules"),
    };
    if (document.getElementById("hw-spawner")) return;
    const s = document.createElement("script");
    s.id = "hw-spawner";
    s.src = "/hw/spawner.js";
    s.async = true;
    document.body.append(s);
  }, [href, locale, router]);

  // Signed in or out on this page: the widget must re-read who it is talking to.
  useEffect(() => {
    if (status !== "loading") window.HW?.refresh();
  }, [status, pathname]);

  return null;
}

/** The pumpkin counter in the header; hidden by the widget itself when the hunt is not running. */
export function HalloweenCounter() {
  if (!isHalloween()) return null;
  return createElement("hw-counter", { class: "hw-counter", hidden: true, suppressHydrationWarning: true });
}
