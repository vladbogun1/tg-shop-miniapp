"use client";

/**
 * Halloween 2026 — the pumpkin hunt slide of the home banner (HeroBanner puts it first while the hunt
 * runs, `isHuntOn()`). A tap opens the hunt panel of the widget; without the widget (blocked, not
 * loaded yet) it leads to the rules page. Remove with the event: this file and its use in HeroBanner.
 */
import Link from "next/link";
import { useI18n } from "@/i18n/context";

const TEXT = {
  uk: {
    tag: "30.10–01.11 · Хелловін",
    title: "Полювання на гарбузи",
    sub: "Шукай гарбузи на сайті: кожен — участь у розіграші, 15 — повний шанс. Покупки від 500 ₴ — окремий розіграш. Наживо 01.11 о 19:00 у TikTok і Kick",
    go: "Як узяти участь",
  },
  ru: {
    tag: "30.10–01.11 · Хэллоуин",
    title: "Охота на тыквы",
    sub: "Ищи тыквы на сайте: каждая — участие в розыгрыше, 15 — полный шанс. Покупки от 500 ₴ — отдельный розыгрыш. Вживую 01.11 в 19:00 в TikTok и Kick",
    go: "Как участвовать",
  },
  en: {
    tag: "30.10–01.11 · Halloween",
    title: "Pumpkin hunt",
    sub: "Find pumpkins on the site: each one gets you in, 15 give the full chance. Orders from 500 UAH — a separate draw. Live on 01.11 at 19:00 on TikTok and Kick",
    go: "How to join",
  },
} as const;

export function HwBannerSlide({
  out,
  first,
  num,
  total,
}: {
  out: boolean;
  first: boolean;
  num: string;
  total: string;
}) {
  const { locale, href } = useI18n();
  const x = TEXT[locale as keyof typeof TEXT] ?? TEXT.uk;
  return (
    <Link
      href={href("/halloween-rules")}
      className="hb-slide hb-hw"
      data-out={out || undefined}
      data-first={first || undefined}
      aria-hidden={out || undefined}
      tabIndex={out ? -1 : undefined}
      aria-label={`${x.title} — ${x.sub}`}
      onClick={(e) => {
        if (!window.HW) return;
        e.preventDefault();
        window.HW.open();
      }}
    >
      <span className="hb-text">
        <span className="hb-cat">
          <span className="hb-num">
            {num}/{total}
          </span>
          <span className="hb-name">{x.tag}</span>
        </span>
        <span className="hb-slogan">{x.title}</span>
        <span className="hb-hw-sub">{x.sub}</span>
        <span className="hb-go">
          {x.go}
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            <path
              d="M3 8h9M8.5 4l4 4-4 4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="square"
            />
          </svg>
        </span>
      </span>
      <span aria-hidden className="hb-hw-art">
        <img
          src="/mascot-hw/hw/hero.webp"
          alt=""
          width={1200}
          height={600}
          draggable={false}
          decoding="async"
        />
      </span>
    </Link>
  );
}
