"use client";

/**
 * Small gift case pieces used around the opening screen: the «case is waiting» card of the order
 * page, the checkout choice «guaranteed discount or the case», the prize rows of the cart
 * («Що може бути в кейсі» — no chances, those are never shown to customers) and the rarity chip of the
 * prize line.
 */
import { useState, type ReactNode } from "react";
import {
  caseDiscountText,
  guaranteedDiscountMinor,
  sortCasePrizes,
  type CaseItem,
  type CaseRarity,
  type CaseTier,
  type GiftChoice,
  type GiftTierInfo,
} from "@shop/core/giftcase";
import { CaseStyles } from "./case-opening-bits";
import { CaseDiscountTile, CaseRulesLink, caseTierAsset, caseTierVars, rarityVars, type CaseRulesLinkProps } from "./case-tier";
import { sessionStore } from "@shop/core/storage";

const LockIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 018 0v3" />
  </svg>
);

/**
 * Order page: the sealed case of the tier with a glowing bob, a headline, a hint and «Відкрити».
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
  tier = null,
  tierLabel,
  assetBase = "/case",
}: {
  title: string;
  text: string;
  action?: string;
  onOpen?: () => void;
  locked?: boolean;
  /** Screen-reader name of the lock («Закрито до оплати»). */
  lockLabel?: string;
  tier?: CaseTier | null;
  /** «Золотий кейс» badge over the title. */
  tierLabel?: string;
  assetBase?: string;
}) {
  return (
    <section className={`gc-sealed${locked ? " is-locked" : ""}`} style={caseTierVars(tier, assetBase)}>
      <CaseStyles />
      <div className="gc-sealed-art">
        <img src={caseTierAsset(assetBase, tier, "case-closed-sm.webp")} alt="" draggable={false} aria-hidden />
        {locked && (
          <span className="gc-lock" role="img" aria-label={lockLabel}>
            {LockIcon}
          </span>
        )}
      </div>
      <div className="gc-sealed-text">
        {tierLabel && <span className="gc-tier gc-disp">{tierLabel}</span>}
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
export function GiftCaseArt({
  glow = false,
  className,
  tier = null,
  assetBase = "/case",
}: {
  glow?: boolean;
  className?: string;
  tier?: CaseTier | null;
  assetBase?: string;
}) {
  return (
    <span className={`gc-art${glow ? " is-glow" : ""}${className ? ` ${className}` : ""}`} style={caseTierVars(tier, assetBase)} aria-hidden>
      <CaseStyles />
      <img src={caseTierAsset(assetBase, tier, "case-closed-sm.webp")} alt="" draggable={false} />
    </span>
  );
}

/** «Що може бути в кейсі»: rarity bar, thumbnail (or the discount coupon), title, rarity. Rarest first, no chances. */
export function GiftCasePrizeRows({
  items,
  rarity,
  resolveImage,
  money,
  discountLabel,
}: {
  items: CaseItem[];
  rarity: Record<CaseRarity, string>;
  resolveImage: (src: string, size: number) => string;
  money: (minor: number) => string;
  /** «Знижка {d} на наступне замовлення» — the title of a discount prize. */
  discountLabel: string;
}) {
  const sorted = sortCasePrizes(items);
  return (
    <ul className="gc-rows">
      <CaseStyles />
      {sorted.map((p) => (
        <li key={p.key} className="gc-row" style={rarityVars(p.rarity)}>
          <i aria-hidden />
          {p.kind === "DISCOUNT" ? (
            <CaseDiscountTile item={p} money={money} size="sm" />
          ) : p.imageUrl ? (
            <img src={resolveImage(p.imageUrl, 80)} alt="" loading="lazy" decoding="async" />
          ) : (
            <span className="gc-noimg">🎁</span>
          )}
          <span>
            {p.kind === "DISCOUNT" ? discountLabel.replace("{d}", caseDiscountText(p, money)) : p.title}
            <em className="gc-disp" style={{ display: "block", marginTop: 1 }}>
              {rarity[p.rarity]}
            </em>
          </span>
          {p.kind === "PRODUCT" && p.priceMinor > 0 && <b className="gc-disp">{money(p.priceMinor)}</b>}
        </li>
      ))}
    </ul>
  );
}

/** An expandable «Що може бути в кейсі» (a disclosure button + the rows). */
export function GiftCasePrizeDisclosure({
  label,
  children,
  className,
  tier = null,
  aside,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  tier?: CaseTier | null;
  /** Next to the button, pushed right and wrapping under it when narrow (the «Правила акції» link). */
  aside?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const button = (
    <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="gc-disclose gc-disp">
      {label}
      <span aria-hidden style={{ display: "inline-block", transition: "transform .2s", transform: open ? "rotate(180deg)" : "none" }}>
        ▾
      </span>
    </button>
  );
  return (
    <div className={className} style={caseTierVars(tier)}>
      <CaseStyles />
      {aside ? (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: 12 }}>
          {button}
          {aside}
        </div>
      ) : (
        button
      )}
      {open && children}
    </div>
  );
}

/** «Епічний · з кейса» next to the prize line of an opened case. */
export function GiftCaseRarityChip({ rarity, label }: { rarity: CaseRarity | string; label: string }) {
  return (
    <span className="gc-chip gc-disp" style={rarityVars(rarity)}>
      <CaseStyles />
      {label}
    </span>
  );
}

export interface GiftChoiceTexts {
  /** «Ваш подарунок за замовлення» */
  title: string;
  /** «Золотий кейс» */
  tierName: string;
  /** «Відкрити кейс» */
  caseTitle: string;
  /** «Усередині — девайс у посилку або знижка на наступне замовлення. Відкриєте після оплати» */
  caseText: string;
  /** «Два варіанти подарунка: …» under the title (optional). */
  hint?: string;
  /** «Гарантована знижка {amount}» */
  discountTitle: string;
  /** «{percent} одразу на це замовлення» */
  discountText: string;
}

/**
 * Checkout: the customer chooses before placing the order — the tier's guaranteed discount on this
 * order, or the tier's case (the default). Hidden by the caller when the tier has no guaranteed
 * discount (then it is always the case).
 */
export function GiftChoicePicker({
  tier,
  totalMinor,
  value,
  onChange,
  texts,
  money,
  assetBase = "/case",
  rules,
}: {
  tier: GiftTierInfo;
  /** The order total the discount is counted from (after a promo code). */
  totalMinor: number;
  value: GiftChoice;
  onChange: (v: GiftChoice) => void;
  texts: GiftChoiceTexts;
  money: (minor: number) => string;
  assetBase?: string;
  /** «Правила акції» under the options. */
  rules?: CaseRulesLinkProps;
}) {
  const amount = guaranteedDiscountMinor(tier, totalMinor);
  const opt = (v: GiftChoice, body: ReactNode, art: ReactNode) => (
    <button
      type="button"
      role="radio"
      aria-checked={value === v}
      className={`gc-opt${value === v ? " is-on" : ""}`}
      onClick={() => value !== v && onChange(v)}
    >
      <span className="gc-opt-art" aria-hidden>
        {art}
      </span>
      <span className="gc-opt-text">{body}</span>
      <span className="gc-opt-dot" aria-hidden />
    </button>
  );
  return (
    <section className="gc-choice" style={caseTierVars(tier.tier, assetBase)} aria-label={texts.title}>
      <CaseStyles />
      <header className="gc-choice-head">
        <span className="gc-disp">{texts.title}</span>
        <span className="gc-tier gc-disp">{texts.tierName}</span>
      </header>
      {texts.hint && <p className="gc-choice-hint">{texts.hint}</p>}
      <div role="radiogroup" aria-label={texts.title} className="gc-choice-opts">
        {opt(
          "CASE",
          <>
            <b className="gc-disp">{texts.caseTitle}</b>
            <small>{texts.caseText}</small>
          </>,
          <img src={caseTierAsset(assetBase, tier.tier, "case-closed-sm.webp")} alt="" draggable={false} />
        )}
        {opt(
          "DISCOUNT",
          <>
            <b className="gc-disp">{texts.discountTitle.replace("{amount}", `−${money(amount)}`)}</b>
            <small>{texts.discountText.replace("{percent}", `−${tier.guaranteedPercent}%`)}</small>
          </>,
          <span className="gc-opt-pct gc-disp">−{tier.guaranteedPercent}%</span>
        )}
      </div>
      {rules && <CaseRulesLink {...rules} className="is-choice" />}
    </section>
  );
}

export { GiftCaseOrderPanel, hasGiftCaseOrderPanel, type GiftOrderPanelTexts } from "./gift-order-panel";

/**
 * Cart: the three tiers as one segmented bar — each segment fills up to its threshold in the tier's
 * metal, the reached ones glow; the labels show the short tier name and the threshold.
 */
export function GiftCaseTierLadder({
  tiers,
  totalMinor,
  names,
  money,
}: {
  tiers: GiftTierInfo[];
  totalMinor: number;
  /** Short names («Бронза»). */
  names: Record<CaseTier, string>;
  money: (minor: number) => string;
}) {
  const sorted = [...tiers].sort((a, b) => a.thresholdMinor - b.thresholdMinor);
  if (!sorted.length) return null;
  return (
    <ol className="gc-ladder" aria-label={sorted.map((t) => `${names[t.tier]} ${money(t.thresholdMinor)}`).join(", ")}>
      <CaseStyles />
      {sorted.map((t, i) => {
        const from = i === 0 ? 0 : sorted[i - 1].thresholdMinor;
        const fill = Math.min(1, Math.max(0, (totalMinor - from) / Math.max(1, t.thresholdMinor - from)));
        const on = totalMinor > 0 && totalMinor >= t.thresholdMinor;
        return (
          <li key={t.tier} className={`gc-step${on ? " is-on" : ""}`} style={caseTierVars(t.tier)}>
            <span className="gc-step-bar" aria-hidden>
              <i style={{ transform: `scaleX(${fill})` }} />
            </span>
            <span className="gc-step-label gc-disp">
              {names[t.tier]} <em>{money(t.thresholdMinor)}</em>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const AUTO_KEY = "gift-case-auto:";

/** The checkout marks a freshly placed order so its page opens the case screen once by itself. */
export function markGiftCaseAutoOpen(orderId: string): void {
  try {
    sessionStore.setItem(AUTO_KEY + orderId, "1");
  } catch {
    /* storage unavailable: the order page still shows the case card */
  }
}

/** True once for an order marked by {@link markGiftCaseAutoOpen} (the mark is consumed). */
export function takeGiftCaseAutoOpen(orderId: string): boolean {
  try {
    if (sessionStore.getItem(AUTO_KEY + orderId) !== "1") return false;
    sessionStore.removeItem(AUTO_KEY + orderId);
    return true;
  } catch {
    return false;
  }
}
