"use client";

/**
 * The gift case in the Mini App's order page: the case card (top of the page while SEALED) and the
 * opening screen (@shop/shared/case-ui, the same as the website) with Telegram haptics and the
 * native back button.
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
import { paymentState, type CaseRarity, type GiftCaseOpen, type OrderDetail } from "@shop/shared";
import {
  GiftCaseOpening,
  GiftCaseRarityChip,
  GiftCaseSealedCard,
  takeGiftCaseAutoOpen,
  unlockCaseAudio,
  type GiftCaseHaptics,
  type GiftCaseTexts,
} from "@shop/shared/case-ui";
import { Toast } from "@/components/ui/Toast";
import { useI18n, useT } from "@/i18n/context";
import { trackGiftCaseOpen } from "@/lib/analytics";
import { customerApi } from "@/lib/api";
import { shortOrderId } from "@/lib/format";
import { resolveImageSrc } from "@/lib/image";
import { haptic, hapticImpact, hapticSelection, hapticSuccess, useBackButton } from "@/lib/telegram";

const RARITIES: CaseRarity[] = ["COMMON", "RARE", "EPIC", "LEGENDARY", "GOLD"];

/** The payment block of the order page — the locked card's CTA scrolls there. */
export const ORDER_PAY_ANCHOR = "order-pay";

export function useCaseRarityNames(): Record<CaseRarity, string> {
  const t = useT();
  return useMemo(() => Object.fromEntries(RARITIES.map((r) => [r, t(`case.rarity.${r}`)])) as Record<CaseRarity, string>, [t]);
}

export const caseImage = (src: string, size: number) => resolveImageSrc(src, size);

const HAPTICS: GiftCaseHaptics = {
  tick: hapticSelection,
  stop: () => hapticImpact("heavy"),
  success: hapticSuccess,
};

/** Case prizes with chances (the public quote of an empty cart). */
function useCasePrizes(enabled: boolean) {
  const { locale } = useI18n();
  return useQuery({
    queryKey: ["gift-case-prizes", locale],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const q = await customerApi.quoteBundle({ lines: [], promoDiscountMinor: 0 });
      return q.gift?.kind === "CASE" ? q.gift.caseItems : [];
    },
  });
}

/** Everything the order page needs: `card` (top of the page while SEALED) and `overlay` (render once). */
export function useOrderGiftCase(order: OrderDetail, created: boolean) {
  const t = useT();
  const { locale } = useI18n();
  const qc = useQueryClient();
  const rarity = useCaseRarityNames();
  const sealed = order.giftCaseStatus === "SEALED" && order.status !== "REJECTED";
  const openable = sealed && order.giftCaseOpenable === true;
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const prizes = useCasePrizes(openable || open);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Straight from the checkout: show the case screen once by itself — but only when it can be
  // opened. An unpaid order keeps the wish until it gets paid on this page.
  const autoWanted = useRef(false);
  useEffect(() => {
    autoWanted.current = autoWanted.current || takeGiftCaseAutoOpen(order.id) || created;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per order
  }, [order.id]);
  // Paid while the page is open (the payment form, the check after coming back): open it then.
  const wasOpenable = useRef<boolean | null>(null);
  useEffect(() => {
    const before = wasOpenable.current;
    wasOpenable.current = openable;
    if (!openable || !(autoWanted.current || before === false)) return;
    const id = window.setTimeout(() => {
      autoWanted.current = false;
      setOpen(true);
    }, before === false ? 900 : 0);
    return () => window.clearTimeout(id);
  }, [openable, order.id]);

  // Telegram's back button (and Android's hardware back) closes the screen — but not mid-spin.
  const closable = useRef(true);
  const close = useCallback(() => setOpen(false), []);
  useBackButton(open, () => {
    if (closable.current) close();
  });
  const onClosableChange = useCallback((c: boolean) => {
    closable.current = c;
  }, []);

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

  const openCase = useCallback(() => customerApi.openGiftCase(order.id), [order.id]);
  const onRevealed = useCallback(
    (res: GiftCaseOpen) => {
      trackGiftCaseOpen(order.id, res.won.rarity);
      void qc.invalidateQueries({ queryKey: ["me", "orders"] });
    },
    [order.id, qc]
  );
  const onOpenRefused = useCallback(
    (code: "GIFT_CASE_UNPAID" | "GIFT_CASE_ALREADY_OPENED") => {
      setOpen(false);
      setToast(t(code === "GIFT_CASE_UNPAID" ? "case.lockedText" : "case.alreadyOpened"));
      void qc.invalidateQueries({ queryKey: ["me", "orders"] });
    },
    [qc, t]
  );

  const start = () => {
    haptic();
    unlockCaseAudio();
    setOpen(true);
  };

  // Unpaid: the CTA leads to the payment block when there is something to pay online.
  const canPay = order.payment.enabled && paymentState(order) === "AWAITING" && order.amountDueMinor > 0;
  const toPayment = () => {
    haptic();
    document.getElementById(ORDER_PAY_ANCHOR)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

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
    <>
      <GiftCaseOpening
        open={open}
        onClose={close}
        openCase={openCase}
        onOpenRefused={onOpenRefused}
        prizes={prizes.data ?? []}
        locale={locale}
        texts={texts}
        resolveImage={caseImage}
        haptics={HAPTICS}
        onRevealed={onRevealed}
        onClosableChange={onClosableChange}
      />
      <Toast message={toast} />
    </>
  );

  return { card, overlay };
}

/** «Епічний · з кейса» under the prize line of an opened case (no replay — a case opens once). */
export function CasePrizeNote({ rarity }: { rarity: CaseRarity }) {
  const t = useT();
  const names = useCaseRarityNames();
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
      <GiftCaseRarityChip rarity={rarity} label={t("case.fromCase", { rarity: names[rarity] })} />
    </span>
  );
}
