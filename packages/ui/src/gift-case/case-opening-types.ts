/** Тексты, отклик и свойства экрана открытия кейса (контракт `GiftCaseOpening`; приложения передают всё через них). */
import type { CaseItem, CaseRarity, CaseSize, CaseTier, GiftCaseOpen } from "@shop/core/giftcase";
import type { CaseSizeTexts } from "./case-size";
import type { CasePromoTexts, CaseRulesLinkProps } from "./case-tier";

export interface GiftCaseTexts {
  /** «Кейс за замовлення #A1B2» */
  title: string;
  eyebrow: string;
  canDrop: string;
  open: string;
  opening: string;
  rarity: Record<CaseRarity, string>;
  youGot: string;
  addedFree: string;
  take: string;
  close: string;
  soundOn: string;
  soundOff: string;
  error: string;
  retry: string;
  /** «Бронзовий кейс» … — the badge over the title. */
  tierName?: Record<CaseTier, string>;
  /** «Знижка {d}» — the title of a discount prize. */
  discountTitle: string;
  /** «на наступне замовлення — промокод нижче» */
  discountNext: string;
  promo: CasePromoTexts;
  /** «Вже маєте схожий товар? Замініть подарунок на знижку» */
  swapHint: string;
  /** «Замінити на {d}» */
  swapAction: string;
  /** «Подарунок замінено на промокод» */
  swapped: string;
  swapError: string;
  /** The size picker of a prize with sizes; without it the size is not asked here. */
  size?: CaseSizeTexts;
}

export interface GiftCaseHaptics {
  /** A tile crossed the marker (throttled by the caller's platform anyway). */
  tick?: () => void;
  /** The reel stopped. */
  stop?: () => void;
  /** The prize is shown. */
  success?: () => void;
}

export interface GiftCaseOpeningProps {
  open: boolean;
  onClose: () => void;
  /** Reveals the prize (POST …/gift-case/open). Called once per overlay session. */
  openCase: () => Promise<GiftCaseOpen>;
  /**
   * The server refused to open (not paid yet / already opened): the caller closes the screen, shows a
   * toast and refetches the order. Without it the error is shown like any other.
   */
  onOpenRefused?: (code: "GIFT_CASE_UNPAID" | "GIFT_CASE_ALREADY_OPENED") => void;
  /** Prizes of the tier for «Що може бути в кейсі» before the case is opened (empty = the list is hidden). */
  prizes: CaseItem[];
  /** The tier of the case (the order's); the open response's tier wins. */
  tier?: CaseTier | null;
  /**
   * Swap the opened product prize for a discount code (POST …/gift-case/swap). Without it the swap
   * offer is not shown.
   */
  onSwap?: () => Promise<GiftCaseOpen>;
  /** Pick the size of a product prize with sizes (POST …/gift-case/size). Without it the size is not asked. */
  onSize?: (variantId: string) => Promise<CaseSize>;
  texts: GiftCaseTexts;
  /** Minor units → «1 299 ₴» in the app's style. */
  money: (minor: number) => string;
  /** ISO date → «12.11.2026» (the code's expiry). */
  formatDate?: (iso: string) => string;
  /** Product image key/url → a URL of roughly `size` px. */
  resolveImage: (src: string, size: number) => string;
  /** Where case-*.webp / scene-*.webp live. Default "/case". */
  assetBase?: string;
  haptics?: GiftCaseHaptics;
  /** The prize was shown (first time in this overlay): analytics, refetch of the order. */
  onRevealed?: (res: GiftCaseOpen) => void;
  /** Whether closing is allowed right now (false during the opening and the spin) — for a native back button. */
  onClosableChange?: (closable: boolean) => void;
  /**
   * The admin's «Тест кейса»: a second button on the prize card that opens the case once more (the
   * caller remounts the screen). Customers never get it — a real case opens once.
   */
  onAgain?: () => void;
  /** Label of that button («Открыть ещё»). */
  againLabel?: string;
  /** «Правила акції» under the closed case (the published promotion rules). */
  rules?: CaseRulesLinkProps;
}

