"use client";

/**
 * Small gift case pieces used around the opening screen: the «case is waiting» card of the order
 * page, the checkout choice «guaranteed discount or the case», the prize rows of the cart
 * («Що може випасти» — no chances, those are never shown to customers) and the rarity chip of the
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
  type OrderGift,
} from "../giftcase";
import { CaseStyles } from "./GiftCaseOpening";
import { CaseDiscountTile, CasePromoBox, caseTierAsset, caseTierVars, rarityVars, type CasePromoTexts } from "./case-tier";

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

/** «Що може випасти»: rarity bar, thumbnail (or the discount coupon), title, rarity. Rarest first, no chances. */
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

/** An expandable «Що може випасти» (a disclosure button + the rows). */
export function GiftCasePrizeDisclosure({
  label,
  children,
  className,
  tier = null,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  tier?: CaseTier | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={className} style={caseTierVars(tier)}>
      <CaseStyles />
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="gc-disclose gc-disp">
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
  /** «Товар у посилку або знижка — як пощастить. Відкриється після оплати» */
  caseText: string;
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
}: {
  tier: GiftTierInfo;
  /** The order total the discount is counted from (after a promo code / «Разом дешевше»). */
  totalMinor: number;
  value: GiftChoice;
  onChange: (v: GiftChoice) => void;
  texts: GiftChoiceTexts;
  money: (minor: number) => string;
  assetBase?: string;
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
    </section>
  );
}

export interface GiftOrderPanelTexts {
  tierName: Record<CaseTier, string>;
  rarity: Record<CaseRarity, string>;
  /** «Приз із кейса» */
  prizeTitle: string;
  /** «Знижка {d} на наступне замовлення» */
  discountPrize: string;
  promo: CasePromoTexts;
  /** «Замінити приз на знижку» */
  swapTitle: string;
  swapHint: string;
  /** «Замінити на {d}» */
  swapAction: string;
  swapped: string;
  swapError: string;
  /** «Ви обрали гарантовану знижку» */
  guaranteedTitle: string;
  /** «{amount} вже враховано в сумі замовлення» */
  guaranteedText: string;
}

/** Whether {@link GiftCaseOrderPanel} has anything to show for the order's gift (so the page skips its wrapper). */
export function hasGiftCaseOrderPanel(gift: OrderGift | null | undefined): boolean {
  if (!gift) return false;
  if (gift.guaranteedDiscountMinor > 0) return true;
  if (gift.caseStatus !== "OPENED" || !gift.prize) return false;
  return !!gift.promo || (!!gift.swap?.available && !gift.swap.swappedAt && gift.prize.kind === "PRODUCT");
}

/**
 * Order page, after the case: what the gift became — the guaranteed discount the customer chose, the
 * code of a discount prize (or of a swapped prize) with «copy», and the swap offer for a product prize
 * similar to what they bought. Renders nothing when there is nothing to say (a product prize without a
 * swap shows as its order line).
 */
export function GiftCaseOrderPanel({
  gift,
  texts,
  money,
  formatDate,
  onSwap,
  assetBase = "/case",
}: {
  gift: OrderGift;
  texts: GiftOrderPanelTexts;
  money: (minor: number) => string;
  formatDate?: (iso: string) => string;
  /** Swap the prize (POST …/gift-case/swap); the caller refetches the order. Omit to hide the offer. */
  onSwap?: () => Promise<unknown>;
  assetBase?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const tier = gift.tier;
  if (gift.guaranteedDiscountMinor > 0) {
    return (
      <section className="gc-sealed gc-panel" style={caseTierVars(tier, assetBase)}>
        <CaseStyles />
        <span className="gc-opt-pct gc-disp" aria-hidden>
          %
        </span>
        <div className="gc-sealed-text">
          {tier && <span className="gc-tier gc-disp">{texts.tierName[tier]}</span>}
          <b className="gc-disp">{texts.guaranteedTitle}</b>
          <span>{texts.guaranteedText.replace("{amount}", `−${money(gift.guaranteedDiscountMinor)}`)}</span>
        </div>
      </section>
    );
  }
  const prize = gift.prize;
  if (gift.caseStatus !== "OPENED" || !prize) return null;
  const swapped = !!gift.swap?.swappedAt;
  const canSwap = !!onSwap && !!gift.swap?.available && !swapped && prize.kind === "PRODUCT";
  if (!gift.promo && !canSwap) return null;
  const swap = async () => {
    if (!onSwap || busy) return;
    setBusy(true);
    setErr(false);
    try {
      await onSwap();
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="gc-sealed gc-panel" style={caseTierVars(tier, assetBase)}>
      <CaseStyles />
      <div className="gc-panel-art" style={rarityVars(prize.kind === "DISCOUNT" ? prize.rarity : prize.rarity)}>
        {prize.kind === "DISCOUNT" ? (
          <CaseDiscountTile item={prize} money={money} size="md" />
        ) : (
          <img src={caseTierAsset(assetBase, tier, "case-open.webp")} alt="" draggable={false} aria-hidden />
        )}
      </div>
      <div className="gc-sealed-text">
        {tier && <span className="gc-tier gc-disp">{texts.tierName[tier]}</span>}
        <b className="gc-disp">
          {canSwap
            ? texts.swapTitle
            : prize.kind === "DISCOUNT"
              ? texts.discountPrize.replace("{d}", caseDiscountText(prize, money))
              : texts.swapped}
        </b>
        {prize.kind === "PRODUCT" && (
          <span>
            {texts.prizeTitle}: {prize.title} · {texts.rarity[prize.rarity]}
          </span>
        )}
        {canSwap && <span>{texts.swapHint}</span>}
        {gift.promo && <CasePromoBox promo={gift.promo} texts={texts.promo} money={money} formatDate={formatDate} compact />}
        {canSwap && gift.swap && (
          <div className="gc-btn-wrap" style={{ marginTop: 0, display: "inline-block" }}>
            <button type="button" className="gc-btn gc-disp" onClick={() => void swap()} disabled={busy} aria-busy={busy}>
              {texts.swapAction.replace("{d}", `−${money(gift.swap.amountMinor)}`)}
            </button>
          </div>
        )}
        {err && (
          <p className="gc-err" role="alert" style={{ textAlign: "left" }}>
            {texts.swapError}
          </p>
        )}
      </div>
    </section>
  );
}

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
