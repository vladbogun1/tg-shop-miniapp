"use client";

/** Мелкие части экрана открытия кейса: константы, таймеры, предзагрузка, стили, картинка приза, иконки. */
import { useState, type CSSProperties } from "react";
import { CASE_RARITY_COLOR, caseDiscountText, type CaseItem, type CaseRarity } from "@shop/core/giftcase";
import { CASE_CSS } from "./case-styles";
import { CaseDiscountTile } from "./case-tier";
import type { GiftCaseTexts } from "./case-opening-types";

export type Stage = "sealed" | "opening" | "spin" | "reveal";

export const SPIN_SECONDS = 6.6;
export const SPIN_EASE: [number, number, number, number] = [0.12, 0.8, 0.18, 1];

export function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Loads (and decodes) images before the reel moves, so nothing pops in mid-spin. Gives up after `ms`. */
export function preload(urls: string[], ms = 2500): Promise<void> {
  const all = urls.map(
    (u) =>
      new Promise<void>((res) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => {
          if (img.decode) img.decode().then(() => res(), () => res());
          else res();
        };
        img.onerror = () => res();
        img.src = u;
      })
  );
  return Promise.race([Promise.all(all).then(() => undefined), wait(ms)]);
}

/** The "opening" show before the reel: shake/charge, flash, lid. Stops quietly once the screen is gone. */
export async function openingShow(reduced: boolean, alive: { current: boolean }, onFlash: () => void, onLid: () => void): Promise<void> {
  if (reduced) return wait(150);
  await wait(720);
  if (!alive.current) return;
  onFlash();
  await wait(120);
  if (!alive.current) return;
  onLid();
  await wait(900);
}

export function itemTitle(item: CaseItem, texts: GiftCaseTexts, money: (m: number) => string): string {
  return item.kind === "DISCOUNT" ? texts.discountTitle.replace("{d}", caseDiscountText(item, money)) : item.title ?? "";
}

export function rc(r: CaseRarity | string | null | undefined): CSSProperties {
  return { ["--rc" as string]: CASE_RARITY_COLOR[(r as CaseRarity) ?? "COMMON"] ?? CASE_RARITY_COLOR.COMMON } as CSSProperties;
}

export function CaseStyles() {
  // React 19 hoists this to <head> once, however many case components are mounted.
  return (
    <style href="gift-case-ui" precedence="default">
      {CASE_CSS}
    </style>
  );
}

export function PrizeImg({
  item,
  resolveImage,
  size,
  money,
}: {
  item: CaseItem;
  resolveImage: (s: string, n: number) => string;
  size: number;
  money: (m: number) => string;
}) {
  const [failed, setFailed] = useState(false);
  if (item.kind === "DISCOUNT") return <CaseDiscountTile item={item} money={money} size={size >= 400 ? "lg" : "md"} />;
  if (!item.imageUrl || failed) return <span className="gc-noimg">🎁</span>;
  return <img src={resolveImage(item.imageUrl, size)} alt="" draggable={false} decoding="async" onError={() => setFailed(true)} />;
}

export const Icon = {
  close: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  sound: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5L6 9H3v6h3l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" />
    </svg>
  ),
  mute: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5L6 9H3v6h3l5 4V5z" />
      <path d="M22 9l-6 6M16 9l6 6" />
    </svg>
  ),
};

