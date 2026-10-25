"use client";

/**
 * Halloween 2026 — the bridge to the pumpkin hunt widget (/hw/spawner.js, a separate service, see
 * events/halloween/README.md). Inside Telegram the customer is always signed in: the widget gets the
 * in-memory bearer token and Telegram haptics. Remove with the event: this file, its usages in the
 * layout and on the home screen, and halloween.css.
 */
import { createElement, useEffect, useState } from "react";
import { EVENT_ATTR, getActiveTag, isHalloween, isHuntOn } from "@shop/shared";
import { useI18n } from "@/i18n/context";
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

const BANNER = {
  uk: {
    soon: "Завтра стартує",
    live: "Полювання на гарбузи",
    stream: "Розіграш іде зараз",
    soonSub: (at: string) => `Збирай гарбузи з 26.10 — розіграш на стрімі ${at}`,
    liveSub: (at: string) => `50 гарбузів = квиток, кожне замовлення +1. Розіграш на стрімі ${at}`,
    streamSub: "Обираємо 5 переможців у прямому ефірі",
    go: "Як узяти участь",
    watch: "Дивитися стрім",
    at: "о",
  },
  ru: {
    soon: "Завтра старт",
    live: "Охота на тыквы",
    stream: "Розыгрыш идёт сейчас",
    soonSub: (at: string) => `Собирай тыквы с 26.10 — розыгрыш на стриме ${at}`,
    liveSub: (at: string) => `50 тыкв = билет, каждый заказ +1. Розыгрыш на стриме ${at}`,
    streamSub: "Выбираем 5 победителей в прямом эфире",
    go: "Как участвовать",
    watch: "Смотреть стрим",
    at: "в",
  },
  en: {
    soon: "Starts tomorrow",
    live: "Pumpkin hunt",
    stream: "The draw is live",
    soonSub: (at: string) => `Collect pumpkins from 26.10 — the stream draw is ${at}`,
    liveSub: (at: string) => `50 pumpkins = a ticket, every order +1. Stream draw ${at}`,
    streamSub: "Picking 5 winners live on stream",
    go: "How to join",
    watch: "Watch the stream",
    at: "at",
  },
} as const;

/** How long after the start of the stream the banner keeps saying «the draw is live». */
const STREAM_HOURS = 3;

type HwState = { phase: "soon" | "live" | "over"; streamAt: string; streamUrl: string };

/**
 * The hunt card under the home screen header: «starts tomorrow» → «the hunt» → «the draw is live» on the
 * evening of the stream, then gone. Dates come from the service (/hw/api/state): when it is down there
 * is no card, the same as with no widget.
 */
export function HalloweenBanner() {
  const { locale } = useI18n();
  const [s, setS] = useState<HwState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isHuntOn()) return;
    let off = false;
    fetch("/hw/api/state", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: HwState | null) => !off && setS(j))
      .catch(() => undefined);
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      off = true;
      clearInterval(t);
    };
  }, []);
  if (!s || s.phase === "over") return null;
  const x = BANNER[locale as keyof typeof BANNER] ?? BANNER.uk;
  const streamAt = Date.parse(s.streamAt);
  if (now > streamAt + STREAM_HOURS * 3_600_000) return null;
  const onAir = now >= streamAt;
  const kyiv = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", ...o }).format(streamAt);
  const at = `${kyiv({ day: "2-digit", month: "2-digit" })} ${x.at} ${kyiv({ hour: "2-digit", minute: "2-digit" })}`;
  const state = onAir ? "stream" : s.phase;
  return (
    <button
      type="button"
      className="hw-banner nb-press"
      data-state={state}
      onClick={() => {
        haptic();
        if (onAir && s.streamUrl) openExternalLink(s.streamUrl);
        else window.HW?.open();
      }}
    >
      <span className="hw-banner-text">
        <span className="hw-banner-title">
          {onAir && <span className="hw-banner-dot" aria-hidden />}
          {x[state]}
        </span>
        <span className="hw-banner-sub">{onAir ? x.streamSub : state === "soon" ? x.soonSub(at) : x.liveSub(at)}</span>
        <span className="hw-banner-go">{onAir && s.streamUrl ? x.watch : x.go} →</span>
      </span>
      <img className="hw-banner-art" src="/hw/sprites/hero-app.webp" alt="" width={204} height={240} decoding="async" />
    </button>
  );
}
