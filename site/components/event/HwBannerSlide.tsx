"use client";

/**
 * Halloween 2026 — the pumpkin hunt slide of the home banner (HeroBanner shows it alone while the hunt
 * runs, `isHuntOn()`): a looping promo reel (media/2026-10-halloween-promo, out/banner) with a small
 * button over it. A tap opens the hunt panel of the widget; without the widget (blocked, not loaded
 * yet) it leads to the rules page. Remove with the event: this file and its use in HeroBanner.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/i18n/context";

/** The reel says it all (hunt → two super prizes → the stream); the text is for screen readers and SEO. */
const TEXT = {
  uk: {
    title: "Полювання на гарбузи",
    sub: "Шукай гарбузи на сайті: кожен гарбуз дає участь у розіграші, 15 гарбузів — повний шанс. Покупки від 500 ₴ — окремий розіграш. Наживо 01.11 о 19:00 у TikTok і Kick",
    go: "Як узяти участь",
  },
  ru: {
    title: "Охота на тыквы",
    sub: "Ищи тыквы на сайте: каждая тыква даёт участие в розыгрыше, 15 тыкв — полный шанс. Покупки от 500 ₴ — отдельный розыгрыш. Вживую 01.11 в 19:00 в TikTok и Kick",
    go: "Как участвовать",
  },
  en: {
    title: "Pumpkin hunt",
    sub: "Find pumpkins on the site: each one gets you into the draw, 15 give the full chance. Orders from 500 UAH get a separate draw. Live on 01.11 at 19:00 on TikTok and Kick",
    go: "How to join",
  },
} as const;

/** Three cuts of the reel; the banner takes the cut's proportions (halloween.css, .hb[data-hw]). */
type Cut = "wide" | "mid" | "narrow";
const NARROW = "(max-width: 639px)";
/** Full width on tablets is the long cut; on desktops the banner sits in the hero's side column. */
const MID = "(min-width: 640px) and (max-width: 767px), (min-width: 1024px)";
const reel = (lang: string, cut: Cut, ext: "mp4" | "webp") =>
  `/mascot-hw/hw/banner/${lang}/hw-banner-${cut}.${ext}`;

export function HwBannerSlide({
  out,
  first,
}: {
  out: boolean;
  first: boolean;
  num: string;
  total: string;
}) {
  const { locale, href } = useI18n();
  const lang = locale in TEXT ? locale : "uk";
  const x = TEXT[lang as keyof typeof TEXT];
  const video = useRef<HTMLVideoElement>(null);
  // Picked after mount: the poster (<picture>) covers SSR; no video with reduced motion.
  const [cut, setCut] = useState<Cut | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const narrow = window.matchMedia(NARROW);
    const mid = window.matchMedia(MID);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pick = () => setCut(still.matches ? null : narrow.matches ? "narrow" : mid.matches ? "mid" : "wide");
    pick();
    const all = [narrow, mid, still];
    all.forEach((m) => m.addEventListener("change", pick));
    return () => all.forEach((m) => m.removeEventListener("change", pick));
  }, []);
  useEffect(() => {
    setPlaying(false);
    // iOS ignores autoplay until the element is in the DOM with muted set as a property
    const v = video.current;
    if (!v) return;
    v.muted = true;
    v.play().catch(() => undefined);
  }, [cut]);
  return (
    <Link
      href={href("/halloween-rules")}
      className="hb-slide hb-hw"
      data-out={out || undefined}
      data-first={first || undefined}
      aria-hidden={out || undefined}
      tabIndex={out ? -1 : undefined}
      aria-label={`${x.title}. ${x.sub}`}
      onClick={(e) => {
        if (!window.HW) return;
        e.preventDefault();
        window.HW.open();
      }}
    >
      <span aria-hidden className="hb-hw-reel">
        <picture>
          <source media={NARROW} srcSet={reel(lang, "narrow", "webp")} />
          <source media={MID} srcSet={reel(lang, "mid", "webp")} />
          <img src={reel(lang, "wide", "webp")} alt="" draggable={false} decoding="async" />
        </picture>
        {cut && (
          <video
            key={cut}
            ref={video}
            src={reel(lang, cut, "mp4")}
            data-on={playing || undefined}
            muted
            loop
            autoPlay
            playsInline
            preload="auto"
            disablePictureInPicture
            onPlaying={() => setPlaying(true)}
          />
        )}
      </span>
      <span className="sr-only">
        {x.title}. {x.sub}
      </span>
      <span aria-hidden className="hb-hw-go">
        {x.go}
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
          <path d="M3 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
        </svg>
      </span>
    </Link>
  );
}
