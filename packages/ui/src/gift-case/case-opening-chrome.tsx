"use client";

/** Обвязка экрана открытия кейса: фон, смена экранов «закрытый кейс» ↔ «барабан», верхние кнопки. */
import { AnimatePresence } from "framer-motion";
import type { CaseTier } from "@shop/core/giftcase";
import { Icon, type Stage } from "./case-opening-bits";
import { SealedView, SpinView, type SealedViewProps, type SpinViewProps } from "./case-opening-views";
import { caseTierAsset } from "./case-tier";
import type { GiftCaseTexts } from "./case-opening-types";

export function CaseBackdrop({ assetBase, tier }: { assetBase: string; tier: CaseTier | null }) {
  return (
    <>
      <div className="gc-scene" aria-hidden>
        <picture>
          <source media="(min-width: 768px)" srcSet={`${assetBase}/scene-wide.webp`} />
          <img src={`${assetBase}/scene-tall.webp`} alt="" />
        </picture>
      </div>
      <div className="gc-rays" aria-hidden />
      {/* the case art is preloaded so the swap at the flash is instant */}
      <link rel="preload" as="image" href={caseTierAsset(assetBase, tier, "case-open.webp")} />
    </>
  );
}

type SharedProps = Pick<SealedViewProps, "tier" | "texts" | "assetBase" | "money" | "resolveImage">;

interface CaseStageProps {
  stage: Stage;
  shared: SharedProps;
  sealed: Pick<SealedViewProps, "lidOpen" | "error" | "sortedPrizes" | "rules" | "onStart">;
  spin: Pick<SpinViewProps, "vpRef" | "setVpEl" | "speedRef" | "x" | "run" | "spinDone" | "tile" | "reel" | "won">;
}

export function CaseStage({ stage, shared, sealed, spin }: CaseStageProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {(stage === "sealed" || stage === "opening") && <SealedView key="sealed" stage={stage} {...shared} {...sealed} />}

      {(stage === "spin" || stage === "reveal") && <SpinView key="spin" stage={stage} {...shared} {...spin} />}
    </AnimatePresence>
  );
}

interface CaseTopBarProps {
  texts: GiftCaseTexts;
  closable: boolean;
  muted: boolean;
  onClose: () => void;
  onToggleMute: () => void;
}

export function CaseTopBar({ texts, closable, muted, onClose, onToggleMute }: CaseTopBarProps) {
  return (
    <div className="gc-top">
      <button type="button" className="gc-icon" onClick={onClose} disabled={!closable} aria-label={texts.close}>
        {Icon.close}
      </button>
      <button type="button" className="gc-icon" onClick={onToggleMute} aria-label={muted ? texts.soundOn : texts.soundOff} aria-pressed={muted}>
        {muted ? Icon.mute : Icon.sound}
      </button>
    </div>
  );
}
