"use client";

/**
 * Order page, after the case: what the gift became — the guaranteed discount the customer chose, the
 * code of a discount prize (or of a swapped prize) with «copy», and the swap offer for a product prize
 * similar to what they bought. Re-exported from GiftCaseParts.
 */
import { useState } from "react";
import { caseDiscountText, type CaseRarity, type CaseSize, type CaseTier, type OrderGift } from "@shop/core/giftcase";
import { CaseStyles } from "./case-opening-bits";
import { CaseSizePicker, type CaseSizeTexts } from "./case-size";
import { CaseDiscountTile, CasePromoBox, caseTierAsset, caseTierVars, rarityVars, type CasePromoTexts } from "./case-tier";

export interface GiftOrderPanelTexts {
  tierName: Record<CaseTier, string>;
  rarity: Record<CaseRarity, string>;
  /** «Подарунок із кейса» */
  prizeTitle: string;
  /** «Знижка {d} на наступне замовлення» */
  discountPrize: string;
  promo: CasePromoTexts;
  /** «Замінити подарунок на знижку» */
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
  /** The size picker of a prize with sizes; without it the size is not shown. */
  size?: CaseSizeTexts;
}

/** Whether {@link GiftCaseOrderPanel} has anything to show for the order's gift (so the page skips its wrapper). */
export function hasGiftCaseOrderPanel(gift: OrderGift | null | undefined): boolean {
  if (!gift) return false;
  if (gift.guaranteedDiscountMinor > 0) return true;
  if (gift.caseStatus !== "OPENED" || !gift.prize) return false;
  return !!gift.promo || (!gift.swap?.swappedAt && gift.prize.kind === "PRODUCT" && (!!gift.swap?.available || !!gift.size));
}

type Money = (minor: number) => string;
type Prize = NonNullable<OrderGift["prize"]>;

interface PrizeState {
  prize: Prize;
  swapped: boolean;
  canSwap: boolean;
  size: OrderGift["size"] | null;
  sizePending: boolean;
}

/** What the prize panel shows; null = nothing to say (a product prize without a swap shows as its order line). */
function prizePanelState(gift: OrderGift, texts: GiftOrderPanelTexts, onSwap?: () => Promise<unknown>, onSize?: (variantId: string) => Promise<CaseSize>): PrizeState | null {
  const prize = gift.prize;
  if (gift.caseStatus !== "OPENED" || !prize) return null;
  const swapped = !!gift.swap?.swappedAt;
  const isProduct = prize.kind === "PRODUCT";
  const canSwap = !!onSwap && !!gift.swap?.available && !swapped && isProduct;
  const size = !swapped && isProduct && texts.size ? gift.size ?? null : null;
  if (!gift.promo && !canSwap && !size) return null;
  return { prize, swapped, canSwap, size, sizePending: isSizePending(size, onSize) };
}

function isSizePending(size: OrderGift["size"] | null, onSize?: (variantId: string) => Promise<CaseSize>): boolean {
  return !!size?.pending && !!onSize && size.changeable;
}

/** The panel headline by priority: size to choose → swap offer → discount prize → swapped → plain prize. */
function panelHeading({ prize, swapped, canSwap, sizePending }: PrizeState, texts: GiftOrderPanelTexts, money: Money): string {
  if (sizePending && texts.size) return texts.size.choose;
  if (canSwap) return texts.swapTitle;
  if (prize.kind === "DISCOUNT") return texts.discountPrize.replace("{d}", caseDiscountText(prize, money));
  return swapped ? texts.swapped : texts.prizeTitle;
}

function useSwapAction(onSwap?: () => Promise<unknown>) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
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
  return { busy, err, swap };
}

function GuaranteedPanel({ gift, texts, money, assetBase }: { gift: OrderGift; texts: GiftOrderPanelTexts; money: Money; assetBase: string }) {
  const tier = gift.tier;
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

function PrizeArt({ prize, tier, money, assetBase }: { prize: Prize; tier: CaseTier | null; money: Money; assetBase: string }) {
  return (
    <div className="gc-panel-art" style={rarityVars(prize.rarity)}>
      {prize.kind === "DISCOUNT" ? (
        <CaseDiscountTile item={prize} money={money} size="md" />
      ) : (
        <img src={caseTierAsset(assetBase, tier, "case-open.webp")} alt="" draggable={false} aria-hidden />
      )}
    </div>
  );
}

interface SwapButtonProps {
  label: string;
  busy: boolean;
  onClick: () => void;
}

function SwapButton({ label, busy, onClick }: SwapButtonProps) {
  return (
    <div className="gc-btn-wrap" style={{ marginTop: 0, display: "inline-block" }}>
      <button type="button" className="gc-btn gc-disp" onClick={onClick} disabled={busy} aria-busy={busy}>
        {label}
      </button>
    </div>
  );
}

interface PrizePanelProps {
  gift: OrderGift;
  state: PrizeState;
  texts: GiftOrderPanelTexts;
  money: Money;
  formatDate?: (iso: string) => string;
  onSize?: (variantId: string) => Promise<CaseSize>;
  assetBase: string;
  busy: boolean;
  err: boolean;
  onSwapClick: () => void;
}

function PrizePanel({ gift, state, texts, money, formatDate, onSize, assetBase, busy, err, onSwapClick }: PrizePanelProps) {
  const { prize, canSwap, size } = state;
  const tier = gift.tier;
  return (
    <section className="gc-sealed gc-panel" style={caseTierVars(tier, assetBase)}>
      <CaseStyles />
      <PrizeArt prize={prize} tier={tier} money={money} assetBase={assetBase} />
      <div className="gc-sealed-text">
        {tier && <span className="gc-tier gc-disp">{texts.tierName[tier]}</span>}
        <b className="gc-disp">{panelHeading(state, texts, money)}</b>
        {prize.kind === "PRODUCT" && (
          <span>
            {texts.prizeTitle}: {prize.title} · {texts.rarity[prize.rarity]}
          </span>
        )}
        {size && texts.size && <CaseSizePicker size={size} texts={texts.size} onChoose={onSize} />}
        {canSwap && <span>{texts.swapHint}</span>}
        {gift.promo && <CasePromoBox promo={gift.promo} texts={texts.promo} money={money} formatDate={formatDate} compact />}
        {canSwap && gift.swap && <SwapButton label={texts.swapAction.replace("{d}", `−${money(gift.swap.amountMinor)}`)} busy={busy} onClick={onSwapClick} />}
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
 * Renders nothing when there is nothing to say (a product prize without a swap shows as its order
 * line).
 */
export function GiftCaseOrderPanel({
  gift,
  texts,
  money,
  formatDate,
  onSwap,
  onSize,
  assetBase = "/case",
}: {
  gift: OrderGift;
  texts: GiftOrderPanelTexts;
  money: Money;
  formatDate?: (iso: string) => string;
  /** Swap the prize (POST …/gift-case/swap); the caller refetches the order. Omit to hide the offer. */
  onSwap?: () => Promise<unknown>;
  /** Pick the prize's size (POST …/gift-case/size); the caller refetches the order. Omit: read-only. */
  onSize?: (variantId: string) => Promise<CaseSize>;
  assetBase?: string;
}) {
  const { busy, err, swap } = useSwapAction(onSwap);
  if (gift.guaranteedDiscountMinor > 0) return <GuaranteedPanel gift={gift} texts={texts} money={money} assetBase={assetBase} />;
  const state = prizePanelState(gift, texts, onSwap, onSize);
  if (!state) return null;
  return (
    <PrizePanel
      gift={gift}
      state={state}
      texts={texts}
      money={money}
      formatDate={formatDate}
      onSize={onSize}
      assetBase={assetBase}
      busy={busy}
      err={err}
      onSwapClick={() => void swap()}
    />
  );
}
