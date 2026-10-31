"use client";

/** Замена подарка-товара на промокод прямо на карточке приза: состояние, доступность и обработчик. */
import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { GiftCaseOpen } from "@shop/core/giftcase";
import type { GiftCaseHaptics } from "./case-opening-types";

interface CaseSwapArgs {
  result: GiftCaseOpen | null;
  setResult: Dispatch<SetStateAction<GiftCaseOpen | null>>;
  onSwap?: () => Promise<GiftCaseOpen>;
  alive: MutableRefObject<boolean>;
  hapticsRef: MutableRefObject<GiftCaseHaptics | undefined>;
}

export function useCaseSwap({ result, setResult, onSwap, alive, hapticsRef }: CaseSwapArgs) {
  const [swapBusy, setSwapBusy] = useState(false);
  const [swapErr, setSwapErr] = useState(false);
  const swap = result?.swap ?? null;
  const swapped = !!swap?.swappedAt;
  const canSwap = !!onSwap && !!swap?.available && !swapped && result?.won?.kind === "PRODUCT";
  const doSwap = async () => {
    if (!onSwap || swapBusy) return;
    setSwapBusy(true);
    setSwapErr(false);
    try {
      const res = await onSwap();
      if (!alive.current) return;
      setResult(res);
      hapticsRef.current?.success?.();
    } catch {
      if (alive.current) setSwapErr(true);
    } finally {
      if (alive.current) setSwapBusy(false);
    }
  };
  return { swapped, canSwap, swapBusy, swapErr, doSwap };
}
