"use client";

/**
 * The gift case on the website's order page: the «case is waiting» card, the opening screen
 * (@shop/shared/case-ui, the same as the Mini App) and the replay from the prize line.
 *
 * The prize list for «Що може випасти» comes from the public cart quote (an empty cart still
 * carries the case prizes); after opening, the server's own list (`reel`) drives the reel.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { shortOrderId, type CaseRarity, type OrderDetail } from "@shop/shared";
import {
  GiftCaseOpening,
  GiftCaseRarityChip,
  GiftCaseSealedCard,
  takeGiftCaseAutoOpen,
  unlockCaseAudio,
  type GiftCaseTexts,
} from "@shop/shared/case-ui";
import type { MessageKey } from "@/i18n";
import { useI18n } from "@/i18n/context";
import { trackGiftCaseOpen } from "@/lib/analytics";
import { api } from "@/lib/api";
import { resolveImageSrc } from "@/lib/image";

const RARITIES: CaseRarity[] = ["COMMON", "RARE", "EPIC", "LEGENDARY", "GOLD"];

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

/**
 * Everything the order page needs: `card` (top of the page while SEALED), `overlay` (render once),
 * `replay()` for the prize line.
 */
export function useOrderGiftCase(order: OrderDetail) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const rarity = useCaseRarityNames();
  const sealed = order.giftCaseStatus === "SEALED";
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"sealed" | "replay">("sealed");
  const prizes = useCasePrizes(sealed || open);

  // Straight from the checkout: show the sealed case once by itself.
  useEffect(() => {
    if (sealed && (takeGiftCaseAutoOpen(order.id) || new URLSearchParams(window.location.search).get("created") === "1")) {
      setMode("sealed");
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per order
  }, [order.id]);

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

  const openCase = useCallback(() => api.openGiftCase(order.id), [order.id]);
  const onRevealed = useCallback(
    (res: { won: { rarity: string } }) => {
      if (sealed) trackGiftCaseOpen(order.id, res.won.rarity);
      void qc.invalidateQueries({ queryKey: ["me", "orders"] });
    },
    [order.id, qc, sealed]
  );
  const close = useCallback(() => setOpen(false), []);

  const start = (m: "sealed" | "replay") => {
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
      resolveImage={resolveImage}
      onRevealed={onRevealed}
    />
  );

  return { card, overlay, replay: () => start("replay"), rarity };
}

/** «Епічний · з кейса» + «Переглянути відкриття» under the prize line of an opened case. */
export function CasePrizeNote({ rarity, onReplay }: { rarity: CaseRarity; onReplay: () => void }) {
  const { t } = useI18n();
  const names = useCaseRarityNames();
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
      <GiftCaseRarityChip rarity={rarity} label={t("case.fromCase", { rarity: names[rarity] })} />
      <button
        type="button"
        onClick={onReplay}
        className="min-h-8 font-display text-[12px] font-bold uppercase tracking-[.06em] text-[var(--accent-hi)] underline-offset-4 hover:underline"
      >
        ↻ {t("case.watchAgain")}
      </button>
    </span>
  );
}
