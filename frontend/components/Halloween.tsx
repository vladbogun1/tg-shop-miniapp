"use client";

/**
 * Halloween 2026 — the bridge to the pumpkin hunt widget (/hw/spawner.js, a separate service, see
 * events/halloween/README.md). Inside Telegram the customer is always signed in: the widget gets the
 * in-memory bearer token and Telegram haptics. Remove with the event: this file, its usages in the
 * layout and on the home screen, and halloween.css.
 */
import { createElement, useEffect } from "react";
import { EVENT_ATTR, getActiveTag, isHalloween } from "@shop/shared";
import { getAccessToken, onAccessToken } from "@/lib/api";
import { haptic, hapticSuccess, hapticImpact, openExternalLink } from "@/lib/telegram";
import "./halloween.css";

declare global {
  interface Window {
    HW_CONFIG?: Record<string, unknown>;
    HW?: { open: () => void; refresh: () => Promise<void> };
  }
}

/** Where the rules page lives: the website next to this Mini App (app.X → X). */
function siteOrigin(): string {
  const host = location.hostname.replace(/^app\./, "");
  return `${location.protocol}//${host}`;
}

export function HalloweenWidget() {
  useEffect(() => {
    if (!isHalloween()) return;
    document.documentElement.dataset.event = EVENT_ATTR;
    window.HW_CONFIG = {
      app: "miniapp",
      getLocale: () => getActiveTag(),
      getToken: () => getAccessToken(),
      login: () => location.reload(),
      haptic: (kind: string) => (kind === "success" ? hapticSuccess() : kind === "error" ? hapticImpact("heavy") : haptic()),
      // The tab bar hides while scrolling the catalogue: cover only what is on screen right now.
      insets: () => {
        const bar = document.querySelector(".tabbar")?.getBoundingClientRect();
        const bottom = bar && bar.top < innerHeight ? innerHeight - bar.top + 8 : 16;
        return { top: 130, bottom };
      },
      openLink: (url: string) => openExternalLink(url),
      rulesUrl: `${siteOrigin()}/halloween-rules`,
    };
    if (!document.getElementById("hw-spawner")) {
      const s = document.createElement("script");
      s.id = "hw-spawner";
      s.src = "/hw/spawner.js";
      s.async = true;
      document.body.append(s);
    }
    // The token appears after the initData exchange (and is replaced on re-login).
    return onAccessToken(() => window.HW?.refresh());
  }, []);
  return null;
}

/** The pumpkin counter on the home screen header; the widget hides it when the hunt is not running. */
export function HalloweenCounter() {
  if (!isHalloween()) return null;
  return createElement("hw-counter", { class: "hw-counter", hidden: true, suppressHydrationWarning: true });
}
