"use client";

/**
 * Small gift case pieces used around the opening screen: the «case is waiting» card of the order
 * page, the prize rows of the cart («Що може випасти») and the rarity chip of the prize line.
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import { CASE_RARITY_COLOR, caseRarityRank, type CaseItem, type CaseRarity } from "../giftcase";
import { CaseStyles, formatChance } from "./GiftCaseOpening";

const rc = (r: CaseRarity | string | null | undefined) =>
  ({ ["--rc" as string]: CASE_RARITY_COLOR[(r as CaseRarity) ?? "COMMON"] ?? CASE_RARITY_COLOR.COMMON }) as CSSProperties;

/** Order page: the sealed case with a glowing bob, a headline, a hint and «Відкрити». */
export function GiftCaseSealedCard({
  title,
  text,
  action,
  onOpen,
  assetBase = "/case",
}: {
  title: string;
  text: string;
  action: string;
  onOpen: () => void;
  assetBase?: string;
}) {
  return (
    <section className="gc-sealed">
      <CaseStyles />
      <div className="gc-sealed-art" aria-hidden>
        <img src={`${assetBase}/case-closed-sm.webp`} alt="" draggable={false} />
      </div>
      <div className="gc-sealed-text">
        <b className="gc-disp">{title}</b>
        <span>{text}</span>
        <div className="gc-btn-wrap" style={{ marginTop: 0, display: "inline-block" }}>
          <button type="button" className="gc-btn gc-disp" onClick={onOpen}>
            {action}
          </button>
        </div>
      </div>
    </section>
  );
}

/** «Що може випасти»: rarity bar, thumbnail, title, rarity, chance. Rarest first. */
export function GiftCasePrizeRows({
  items,
  rarity,
  resolveImage,
}: {
  items: CaseItem[];
  rarity: Record<CaseRarity, string>;
  resolveImage: (src: string, size: number) => string;
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
          <b className="gc-disp">{formatChance(p.chancePercent)}</b>
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
