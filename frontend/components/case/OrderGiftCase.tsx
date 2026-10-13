"use client";

/**
 * The gift case in the Mini App's order page: the «case is waiting» card, the opening screen
 * (@shop/shared/case-ui, the same as the website) with Telegram haptics and the native back button,
 * and the replay from the prize line.
 *
 * The prize list for «Що може випасти» comes from the public cart quote (an empty cart still
 * carries the case prizes); after opening, the server's own list (`reel`) drives the reel.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CaseRarity, GiftCaseOpen, OrderDetail } from "@shop/shared";
import {
  GiftCaseOpening,
  GiftCaseRarityChip,
  GiftCaseSealedCard,
  takeGiftCaseAutoOpen,
  unlockCaseAudio,
  type GiftCaseHaptics,
  type GiftCaseTexts,
} from "@shop/shared/case-ui";
import { useI18n, useT } from "@/i18n/context";
import { trackGiftCaseOpen } from "@/lib/analytics";
import { customerApi } from "@/lib/api";
import { shortOrderId } from "@/lib/format";
import { resolveImageSrc } from "@/lib/image";
import { haptic, hapticImpact, hapticSelection, hapticSuccess, useBackButton } from "@/lib/telegram";

const RARITIES: CaseRarity[] = ["COMMON", "RARE", "EPIC", "LEGENDARY", "GOLD"];

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

/**
 * Everything the order page needs: `card` (top of the page while SEALED), `overlay` (render once),
 * `replay()` for the prize line.
 */
export function useOrderGiftCase(order: OrderDetail, created: boolean) {
  const t = useT();
  const qc = useQueryClient();
  const rarity = useCaseRarityNames();
  const sealed = order.giftCaseStatus === "SEALED";
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"sealed" | "replay">("sealed");
  const prizes = useCasePrizes(sealed || open);

  // Straight from the checkout: show the sealed case once by itself.
  useEffect(() => {
    if (sealed && (takeGiftCaseAutoOpen(order.id) || created)) {
      setMode("sealed");
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per order
  }, [order.id]);

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
      replay: t("case.replay"),
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
      if (sealed) trackGiftCaseOpen(order.id, res.won.rarity);
      void qc.invalidateQueries({ queryKey: ["me", "orders"] });
    },
    [order.id, qc, sealed]
  );

  const start = (m: "sealed" | "replay") => {
    haptic();
    unlockCaseAudio();
    setMode(m);
    setOpen(true);
  };

  const card = sealed ? (
    <GiftCaseSealedCard title={t("case.sealedTitle")} text={t("case.sealedText")} action={t("case.openShort")} onOpen={() => start("sealed")} />
  ) : null;

  const overlay = (
    <GiftCaseOpening
      open={open}
      onClose={close}
      openCase={openCase}
      prizes={prizes.data ?? []}
      mode={mode}
      texts={texts}
      resolveImage={caseImage}
      haptics={HAPTICS}
      onRevealed={onRevealed}
      onClosableChange={onClosableChange}
    />
  );

  return { card, overlay, replay: () => start("replay") };
}

/** «Епічний · з кейса» + «Переглянути відкриття» under the prize line of an opened case. */
export function CasePrizeNote({ rarity, onReplay }: { rarity: CaseRarity; onReplay: () => void }) {
  const t = useT();
  const names = useCaseRarityNames();
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
      <GiftCaseRarityChip rarity={rarity} label={t("case.fromCase", { rarity: names[rarity] })} />
      <button
        type="button"
        onClick={onReplay}
        className="tap font-display min-h-8 text-[12px] font-bold uppercase tracking-[0.06em] text-[var(--accent-hi)]"
      >
        ↻ {t("case.watchAgain")}
      </button>
    </span>
  );
}
