"use client";

/**
 * Tier skin of the case UI: CSS variables of the metal (case-styles.ts reads --ga/--ga2/--gb1/--gb2/
 * --gink/--gm) and the art of the tier (public/case/<tier>/case-*.webp; no tier → the original
 * orange case in public/case/). Plus the small pieces every case screen shares: the discount tile
 * (a discount prize has no picture), the promo code box with «copy», the tier badge.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  CASE_RARITY_COLOR,
  CASE_TIER_METAL,
  caseDiscountText,
  type CaseItem,
  type CasePromo,
  type CaseRarity,
  type CaseTier,
} from "@shop/core/giftcase";

export type CaseArtFile = "case-closed.webp" | "case-open.webp" | "case-closed-sm.webp";

/** URL of the tier's case art (`assetBase` = where the apps keep /case). */
export function caseTierAsset(assetBase: string, tier: CaseTier | null | undefined, file: CaseArtFile): string {
  return tier ? `${assetBase}/${tier.toLowerCase()}/${file}` : `${assetBase}/${file}`;
}

/** Inline CSS variables of the tier's metal (spread into a `style`). */
export function caseTierVars(tier: CaseTier | null | undefined, assetBase = "/case"): CSSProperties {
  if (!tier) return {};
  const m = CASE_TIER_METAL[tier];
  return {
    ["--ga" as string]: m.ga,
    ["--ga2" as string]: m.ga2,
    ["--gb1" as string]: m.gb1,
    ["--gb2" as string]: m.gb2,
    ["--gink" as string]: m.ink,
    ["--gm" as string]: `url(${caseTierAsset(assetBase, tier, "case-closed-sm.webp")})`,
  } as CSSProperties;
}

export function rarityVars(r: CaseRarity | string | null | undefined): CSSProperties {
  return { ["--rc" as string]: CASE_RARITY_COLOR[(r as CaseRarity) ?? "COMMON"] ?? CASE_RARITY_COLOR.COMMON } as CSSProperties;
}

/** «Золотий кейс» — a small metal pill. */
export function GiftCaseTierBadge({ tier, label, className }: { tier: CaseTier; label: string; className?: string }) {
  return (
    <span className={`gc-tier gc-disp${className ? ` ${className}` : ""}`} style={caseTierVars(tier)}>
      {label}
    </span>
  );
}

/** A discount prize in a tile: a big «−10%» on a coupon in the rarity colour. */
export function CaseDiscountTile({ item, money, size = "md" }: { item: CaseItem; money: (minor: number) => string; size?: "sm" | "md" | "lg" }) {
  const full = caseDiscountText(item, money);
  // The 30 px tile of a list row: «−1000₴» without the spaces still has to fit.
  const text = size === "sm" ? full.replace(/\s/g, "") : full;
  const len = text.length > 7 ? "xl" : text.length > 5 ? "long" : undefined;
  return (
    <span className={`gc-disc is-${size}`} style={rarityVars(item.rarity)} aria-hidden>
      <span className="gc-disc-ticket">
        <b className="gc-disp" data-len={len}>
          {text}
        </b>
      </span>
    </span>
  );
}

export interface CasePromoTexts {
  /** «Ваш промокод» */
  label: string;
  copy: string;
  copied: string;
  /** «Діє до {date}» */
  validUntil: string;
  /** «Використано» */
  used: string;
}

/** The personal code of a discount prize / a swap, with «copy» and the expiry date. */
export function CasePromoBox({
  promo,
  texts,
  money,
  formatDate,
  compact = false,
}: {
  promo: CasePromo;
  texts: CasePromoTexts;
  money: (minor: number) => string;
  formatDate?: (iso: string) => string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => (timer.current ? window.clearTimeout(timer.current) : undefined), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(promo.code);
    } catch {
      // Older WebViews: a hidden textarea + execCommand.
      const ta = document.createElement("textarea");
      ta.value = promo.code;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* the code stays visible to copy by hand */
      }
      ta.remove();
    }
    setCopied(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1800);
  };
  const until = promo.expiresAt && formatDate ? texts.validUntil.replace("{date}", formatDate(promo.expiresAt)) : null;
  return (
    <div className={`gc-promo${compact ? " is-compact" : ""}${promo.used ? " is-used" : ""}`}>
      <span className="gc-promo-label gc-disp">
        {texts.label} · {caseDiscountText(promo, money)}
      </span>
      <div className="gc-promo-row">
        <code className="gc-promo-code" translate="no">
          {promo.code}
        </code>
        {!promo.used && (
          <button type="button" className="gc-promo-copy gc-disp" onClick={() => void copy()} aria-live="polite">
            {copied ? `✓ ${texts.copied}` : texts.copy}
          </button>
        )}
      </div>
      {(until || promo.used) && <span className="gc-promo-until">{promo.used ? texts.used : until}</span>}
    </div>
  );
}

/**
 * «Правила акції» — a quiet link to the published promotion rules (site /{locale}/case-rules,
 * docs/GIFT-CASE.md «Юридическое»). `onOpen` replaces the plain link (the Mini App opens the site
 * over itself with WebApp.openLink); without it the link opens in a new tab.
 */
export interface CaseRulesLinkProps {
  label: string;
  href: string;
  onOpen?: (href: string) => void;
  className?: string;
}

export function CaseRulesLink({ label, href, onOpen, className }: CaseRulesLinkProps) {
  return (
    <a
      className={`gc-rules${className ? ` ${className}` : ""}`}
      href={href}
      target="_blank"
      rel="noopener"
      onClick={(e) => {
        e.stopPropagation();
        if (onOpen) {
          e.preventDefault();
          onOpen(href);
        }
      }}
    >
      {label}
    </a>
  );
}
