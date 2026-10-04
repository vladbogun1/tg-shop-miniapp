"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/context";

/**
 * ChiSetup wordmark (DESIGN-V3 §6): Exo 2 800 italic, «Chi» white, «Setup» in an orange
 * gradient #FF8533 → #FF6600. `compact` is the bare wordmark (header, sheets); `full` adds the HUD
 * brackets and the «GAMING GEAR & SETUP» line (hero-like places, login).
 */
export function Wordmark({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-block whitespace-nowrap font-display font-extrabold italic leading-none tracking-[-.01em] ${className}`}
      style={{ fontSize: size }}
    >
      <span className="text-white">Chi</span>
      <span
        className="bg-clip-text pr-[.08em] text-transparent"
        style={{ backgroundImage: "linear-gradient(90deg, #FF8533, #FF6600)", WebkitBackgroundClip: "text" }}
      >
        Setup
      </span>
    </span>
  );
}

export function LogoFull({ size = 44, className = "" }: { size?: number; className?: string }) {
  const { t } = useI18n();
  return (
    <span className={`hud-frame inline-flex flex-col items-center px-[.55em] pb-[.45em] pt-[.4em] ${className}`} style={{ fontSize: size }}>
      <Wordmark size={size} />
      <span className="mt-[.32em] whitespace-nowrap pl-[.3em] font-display text-[max(10px,.24em)] font-semibold uppercase leading-none tracking-[.3em] text-[var(--muted)]">
        {t("brand.tagline")}
      </span>
    </span>
  );
}

export function Logo() {
  const { t, href } = useI18n();
  return (
    <Link
      href={href("/")}
      aria-label={t("header.home")}
      className="group inline-flex shrink-0 items-center rounded-[var(--r)] py-1 transition-[filter] duration-150 hover:[filter:drop-shadow(0_0_10px_rgba(255,102,0,.35))]"
    >
      <Wordmark size={25} />
    </Link>
  );
}
