"use client";

/**
 * Small gift case pieces used around the opening screen: the «case is waiting» card of the order
 * page, the prize rows of the cart («Що може випасти») and the rarity chip of the prize line.
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import { CASE_RARITY_COLOR, caseRarityRank, formatCaseChance, type CaseItem, type CaseRarity } from "../giftcase";
import { CaseStyles } from "./GiftCaseOpening";

const rc = (r: CaseRarity | string | null | undefined) =>
  ({ ["--rc" as string]: CASE_RARITY_COLOR[(r as CaseRarity) ?? "COMMON"] ?? CASE_RARITY_COLOR.COMMON }) as CSSProperties;

const LockIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 018 0v3" />
  </svg>
);

/**
 * Order page: the sealed case with a glowing bob, a headline, a hint and «Відкрити».
 * `locked` (not paid yet): the case is dimmed with a lock, no «Відкрити»; `action`/`onOpen` then
 * point to the payment block of the page (omit them when there is nothing to pay).
 */
export function GiftCaseSealedCard({
  title,
  text,
  action,
  onOpen,
  locked = false,
  lockLabel,
  assetBase = "/case",
}: {
  title: string;
  text: string;
  action?: string;
  onOpen?: () => void;
  locked?: boolean;
  /** Screen-reader name of the lock («Закрито до оплати»). */
  lockLabel?: string;
  assetBase?: string;
}) {
  return (
    <section className={`gc-sealed${locked ? " is-locked" : ""}`}>
      <CaseStyles />
      <div className="gc-sealed-art">
        <img src={`${assetBase}/case-closed-sm.webp`} alt="" draggable={false} aria-hidden />
        {locked && (
          <span className="gc-lock" role="img" aria-label={lockLabel}>
            {LockIcon}
          </span>
        )}
      </div>
      <div className="gc-sealed-text">
        <b className="gc-disp">{title}</b>
        <span>{text}</span>
        {action && onOpen && (
          <div className="gc-btn-wrap" style={{ marginTop: 0, display: "inline-block" }}>
            <button type="button" className={`gc-btn gc-disp${locked ? " ghost" : ""}`} onClick={onOpen}>
              {action}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * The small case art for banners (product page, cart, checkout). `glow`: a pulsing glow and a slow bob
 * (the gift is earned) — off under prefers-reduced-motion.
 */
export function GiftCaseArt({ glow = false, className, assetBase = "/case" }: { glow?: boolean; className?: string; assetBase?: string }) {
  return (
    <span className={`gc-art${glow ? " is-glow" : ""}${className ? ` ${className}` : ""}`} aria-hidden>
      <CaseStyles />
      <img src={`${assetBase}/case-closed-sm.webp`} alt="" draggable={false} />
    </span>
  );
}

/** «Що може випасти»: rarity bar, thumbnail, title, rarity, chance. Rarest first. */
export function GiftCasePrizeRows({
  items,
  rarity,
  resolveImage,
  locale,
}: {
  items: CaseItem[];
  rarity: Record<CaseRarity, string>;
  resolveImage: (src: string, size: number) => string;
  /** For the chance's decimal separator (uk/ru «,», en «.»). */
  locale?: string;
}) {
  const sorted = [...items].sort((a, b) => caseRarityRank(b.rarity) - caseRarityRank(a.rarity) || a.chancePercent - b.chancePercent);
  return (
    <ul className="gc-rows">
      <CaseStyles />
      {sorted.map((p) => (
        <li key={p.productId} className="gc-row" style={rc(p.rarity)}>
          <i aria-hidden />
          {p.imageUrl ? <img src={resolveImage(p.imageUrl, 80)} alt="" loading="lazy" decoding="async" /> : <span className="gc-noimg">🎁</span>}
          <span>
            {p.title}
            <em className="gc-disp" style={{ display: "block", marginTop: 1 }}>
              {rarity[p.rarity]}
            </em>
          </span>
          <b className="gc-disp">{formatCaseChance(p.chancePercent, locale)}</b>
        </li>
      ))}
    </ul>
  );
}

/** An expandable «Що може випасти» (a disclosure button + the rows). */
export function GiftCasePrizeDisclosure({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="gc-disp"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          minHeight: 32,
          padding: 0,
          border: 0,
          background: "none",
          color: "#ff8533",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          cursor: "pointer",
        }}
      >
        {label}
        <span aria-hidden style={{ display: "inline-block", transition: "transform .2s", transform: open ? "rotate(180deg)" : "none" }}>
          ▾
        </span>
      </button>
      {open && children}
    </div>
  );
}

/** «Епічний · з кейса» next to the prize line of an opened case. */
export function GiftCaseRarityChip({ rarity, label }: { rarity: CaseRarity | string; label: string }) {
  return (
    <span className="gc-chip gc-disp" style={rc(rarity)}>
      <CaseStyles />
      {label}
    </span>
  );
}

const AUTO_KEY = "gift-case-auto:";

/** The checkout marks a freshly placed order so its page opens the case screen once by itself. */
export function markGiftCaseAutoOpen(orderId: string): void {
  try {
    sessionStorage.setItem(AUTO_KEY + orderId, "1");
  } catch {
    /* storage unavailable: the order page still shows the case card */
  }
}

/** True once for an order marked by {@link markGiftCaseAutoOpen} (the mark is consumed). */
export function takeGiftCaseAutoOpen(orderId: string): boolean {
  try {
    if (sessionStorage.getItem(AUTO_KEY + orderId) !== "1") return false;
    sessionStorage.removeItem(AUTO_KEY + orderId);
    return true;
  } catch {
    return false;
  }
}
