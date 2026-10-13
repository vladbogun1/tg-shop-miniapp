"use client";

/**
 * The gift case on the website's order page: the case card (top of the page while SEALED) and the
 * opening screen (@shop/shared/case-ui, the same as the Mini App).
 *
 * Owner's rules (the server enforces them): the case opens only once the order is paid
 * (`giftCaseOpenable`) and exactly once — no replays; after opening the order shows the prize line
 * with its rarity chip. Before payment the card is locked and points to the payment block.
 *
 * The prize list for «Що може випасти» comes from the public cart quote (an empty cart still
 * carries the case prizes); after opening, the server's own list (`reel`) drives the reel.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { paymentState, shortOrderId, type CaseRarity, type OrderDetail } from "@shop/shared";
import {
  GiftCaseOpening,
  GiftCaseRarityChip,
  GiftCaseSealedCard,
  takeGiftCaseAutoOpen,
  unlockCaseAudio,
  type GiftCaseTexts,
} from "@shop/shared/case-ui";
import { toast } from "@/components/ui/Toast";
import type { MessageKey } from "@/i18n";
import { useI18n } from "@/i18n/context";
import { trackGiftCaseOpen } from "@/lib/analytics";
import { api } from "@/lib/api";
import { resolveImageSrc } from "@/lib/image";

const RARITIES: CaseRarity[] = ["COMMON", "RARE", "EPIC", "LEGENDARY", "GOLD"];

/** The payment block of the order page (components/order/Payment.tsx) — the locked card's CTA scrolls there. */
export const ORDER_PAY_ANCHOR = "order-pay";

export function useCaseRarityNames(): Record<CaseRarity, string> {
  const { t } = useI18n();
  return useMemo(
    () => Object.fromEntries(RARITIES.map((r) => [r, t(`case.rarity.${r}` as MessageKey)])) as Record<CaseRarity, string>,
    [t]
  );
}

const resolveImage = (src: string, size: number) => resolveImageSrc(src, size);

/** Case prizes with chances (the public quote of an empty cart). */
export function useCasePrizes(enabled: boolean) {
  const { locale } = useI18n();
  return useQuery({
    queryKey: ["gift-case-prizes", locale],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const q = await api.bundleQuote({ lines: [], promoDiscountMinor: 0 });
      return q.gift?.kind === "CASE" ? q.gift.caseItems : [];
    },
  });
}

/** Everything the order page needs: `card` (top of the page while SEALED) and `overlay` (render once). */
export function useOrderGiftCase(order: OrderDetail) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const rarity = useCaseRarityNames();
  const sealed = order.giftCaseStatus === "SEALED" && order.status !== "REJECTED";
  const openable = sealed && order.giftCaseOpenable === true;
  const [open, setOpen] = useState(false);
  const prizes = useCasePrizes(openable || open);

  // Straight from the checkout or back from the bank: show the case screen once by itself — but only
  // when it can actually be opened. An unpaid order keeps the wish until it gets paid on this page.
  const autoWanted = useRef(false);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    autoWanted.current =
      autoWanted.current || takeGiftCaseAutoOpen(order.id) || sp.get("created") === "1" || sp.get("payment") === "return";
  }, [order.id]);
  // Paid while the page is open (the payment form, the check after coming back): open it then.
  const wasOpenable = useRef<boolean | null>(null);
  useEffect(() => {
    const before = wasOpenable.current;
    wasOpenable.current = openable;
    if (!openable || !(autoWanted.current || before === false)) return;
    // past the payment modal's exit and the «Оплачено» scroll
    const id = window.setTimeout(() => {
      autoWanted.current = false;
      setOpen(true);
    }, before === false ? 900 : 0);
    return () => window.clearTimeout(id);
  }, [openable, order.id]);

  const texts: GiftCaseTexts = useMemo(
    () => ({
      title: t("case.title", { id: shortOrderId(order.id) }),
      eyebrow: t("case.eyebrow"),
      canDrop: t("case.canDrop"),
      open: t("case.open"),
      opening: t("case.opening"),
      rarity,
      youGot: t("case.youGot"),
      addedFree: t("case.addedFree"),
      take: t("case.take"),
      close: t("case.close"),
      soundOn: t("case.soundOn"),
      soundOff: t("case.soundOff"),
      error: t("case.error"),
      retry: t("case.retry"),
    }),
    [t, order.id, rarity]
  );

  const openCase = useCallback(() => api.openGiftCase(order.id), [order.id]);
  const onRevealed = useCallback(
    (res: { won: { rarity: string } }) => {
      trackGiftCaseOpen(order.id, res.won.rarity);
      void qc.invalidateQueries({ queryKey: ["me", "orders"] });
    },
    [order.id, qc]
  );
  const onOpenRefused = useCallback(
    (code: "GIFT_CASE_UNPAID" | "GIFT_CASE_ALREADY_OPENED") => {
      setOpen(false);
      toast(t(code === "GIFT_CASE_UNPAID" ? "case.lockedText" : "case.alreadyOpened"), code === "GIFT_CASE_UNPAID" ? "error" : "ok");
      void qc.invalidateQueries({ queryKey: ["me", "orders"] });
    },
    [qc, t]
  );
  const close = useCallback(() => setOpen(false), []);

  const start = () => {
    unlockCaseAudio();
    setOpen(true);
  };

  // Unpaid: the CTA leads to the payment block when there is something to pay online.
  const canPay = order.payment.enabled && paymentState(order) === "AWAITING" && order.amountDueMinor > 0;
  const toPayment = () => document.getElementById(ORDER_PAY_ANCHOR)?.scrollIntoView({ behavior: "smooth", block: "center" });

  const card = !sealed ? null : openable ? (
    <GiftCaseSealedCard title={t("case.sealedTitle")} text={t("case.sealedText")} action={t("case.openShort")} onOpen={start} />
  ) : (
    <GiftCaseSealedCard
      locked
      lockLabel={t("case.locked")}
      title={t("case.sealedTitle")}
      text={t("case.lockedText")}
      action={canPay ? t("case.payCta") : undefined}
      onOpen={canPay ? toPayment : undefined}
    />
  );

  const overlay = (
    <GiftCaseOpening
      open={open}
      onClose={close}
      openCase={openCase}
      onOpenRefused={onOpenRefused}
      prizes={prizes.data ?? []}
      locale={locale}
      texts={texts}
      resolveImage={resolveImage}
      onRevealed={onRevealed}
    />
  );

  return { card, overlay, rarity };
}

/** «Епічний · з кейса» under the prize line of an opened case (no replay — a case opens once). */
export function CasePrizeNote({ rarity }: { rarity: CaseRarity }) {
  const { t } = useI18n();
  const names = useCaseRarityNames();
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
      <GiftCaseRarityChip rarity={rarity} label={t("case.fromCase", { rarity: names[rarity] })} />
    </span>
  );
}
