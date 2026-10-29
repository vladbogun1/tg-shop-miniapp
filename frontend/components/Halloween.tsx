"use client";

/**
 * Halloween 2026 — the bridge to the pumpkin hunt widget (/hw/spawner.js, a separate service, see
 * events/halloween/README.md). Inside Telegram the customer is always signed in: the widget gets the
 * in-memory bearer token and Telegram haptics. Remove with the event: this file, its usages in the
 * layout and on the home screen, and halloween.css.
 */
import { createElement, useEffect, useRef, useState } from "react";
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
    soon: "Скоро стартує",
    live: "Полювання на гарбузи",
    wait: "Скоро розіграш",
    stream: "Розіграш іде зараз",
    soonSub: (at: string) => `Збирай гарбузи з 30.10 — розіграш наживо ${at}`,
    liveSub: (at: string) => `Кожен гарбуз — участь, 15 — повний шанс. Покупки від 500 ₴ — окремий розіграш. Наживо ${at}`,
    waitSub: (at: string) => `Наживо ${at} у TikTok і Kick`,
    streamSub: "Обираємо переможців у TikTok і Kick",
    go: "Як узяти участь",
    watch: "Дивитися стрім",
    at: "о",
  },
  ru: {
    soon: "Скоро старт",
    live: "Охота на тыквы",
    wait: "Скоро розыгрыш",
    stream: "Розыгрыш идёт сейчас",
    soonSub: (at: string) => `Собирай тыквы с 30.10 — розыгрыш вживую ${at}`,
    liveSub: (at: string) => `Каждая тыква — участие, 15 — полный шанс. Покупки от 500 ₴ — отдельный розыгрыш. Вживую ${at}`,
    waitSub: (at: string) => `Вживую ${at} в TikTok и Kick`,
    streamSub: "Выбираем победителей в TikTok и Kick",
    go: "Как участвовать",
    watch: "Смотреть стрим",
    at: "в",
  },
  en: {
    soon: "Starting soon",
    live: "Pumpkin hunt",
    wait: "The draw is coming",
    stream: "The draw is live",
    soonSub: (at: string) => `Collect pumpkins from 30.10 — live draw ${at}`,
    liveSub: (at: string) => `Every pumpkin gets you in, 15 give the full chance. Orders from 500 UAH — a separate draw. Live ${at}`,
    waitSub: (at: string) => `Live ${at} on TikTok and Kick`,
    streamSub: "Picking the winners on TikTok and Kick",
    go: "How to join",
    watch: "Watch the stream",
    at: "at",
  },
} as const;

/**
 * While the hunt runs the card is the promo reel (hunt → two super prizes → the stream), cut 720×200
 * (media/2026-10-halloween-promo, out/banner). In public/, not under /hw/: the hw service has no Range
 * requests, and iOS will not play a video without them. Reduced motion → its poster.
 */
function Reel({ lang }: { lang: string }) {
  const v = useRef<HTMLVideoElement>(null);
  const [still, setStill] = useState(true);
  const [on, setOn] = useState(false);
  useEffect(() => setStill(matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  useEffect(() => {
    if (!v.current) return;
    v.current.muted = true;
    v.current.play().catch(() => undefined);
  }, [still]);
  const src = (ext: string) => `/event-hw/${lang}/hw-banner-app.${ext}`;
  return (
    <span aria-hidden className="hw-banner-reel">
      <img src={src("webp")} alt="" width={720} height={200} decoding="async" />
      {!still && (
        <video ref={v} src={src("mp4")} data-on={on || undefined} muted loop autoPlay playsInline preload="auto" onPlaying={() => setOn(true)} />
      )}
    </span>
  );
}

/** How long after the start of the stream the banner keeps saying «the draw is live». */
const STREAM_HOURS = 3;

type HwState = { phase: "soon" | "live" | "over"; streamAt: string; streams?: { name: string; url: string }[] };

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
  if (!s) return null;
  const x = BANNER[locale as keyof typeof BANNER] ?? BANNER.uk;
  const streamAt = Date.parse(s.streamAt);
  if (now > streamAt + STREAM_HOURS * 3_600_000) return null;
  const onAir = now >= streamAt;
  const kyiv = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", ...o }).format(streamAt);
  const at = `${kyiv({ day: "2-digit", month: "2-digit" })} ${x.at} ${kyiv({ hour: "2-digit", minute: "2-digit" })}`;
  // "over" = the hunt is closed but the stream is still ahead (or on air)
  const state = onAir ? "stream" : s.phase === "over" ? "wait" : s.phase;
  const streamUrl = s.streams?.[0]?.url;
  const sub = { stream: x.streamSub, soon: x.soonSub(at), live: x.liveSub(at), wait: x.waitSub(at) }[state];
  if (state === "live")
    return (
      <button
        type="button"
        className="hw-banner hw-banner-live nb-press"
        aria-label={`${x.live}. ${sub}`}
        onClick={() => {
          haptic();
          window.HW?.open();
        }}
      >
        <Reel lang={locale in BANNER ? locale : "uk"} />
      </button>
    );
  return (
    <button
      type="button"
      className="hw-banner nb-press"
      data-state={state}
      onClick={() => {
        haptic();
        if (onAir && streamUrl) openExternalLink(streamUrl);
        else window.HW?.open();
      }}
    >
      <span className="hw-banner-text">
        <span className="hw-banner-title">
          {onAir && <span className="hw-banner-dot" aria-hidden />}
          {x[state]}
        </span>
        <span className="hw-banner-sub">{sub}</span>
        <span className="hw-banner-go">{onAir && streamUrl ? x.watch : x.go} →</span>
      </span>
      <img className="hw-banner-art" src="/hw/sprites/hero-app.webp" alt="" width={204} height={240} decoding="async" />
    </button>
  );
}
