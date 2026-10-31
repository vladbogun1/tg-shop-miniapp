"use client";

/**
 * Разметка экрана открытия кейса по стадиям: запечатанный кейс, барабан, карточка приза. Состояние и таймеры живут в
 * `GiftCaseOpening`; здесь только отрисовка по пропсам (порядок и анимации те же, что были в одном файле).
 */
import { motion, type MotionValue } from "framer-motion";
import type { CSSProperties, MutableRefObject, RefObject } from "react";
import { CASE_REEL_WIN_INDEX, type CaseItem, type CaseSize, type CaseTier, type GiftCaseOpen } from "@shop/core/giftcase";
import { CaseSizePicker } from "./case-size";
import { CasePromoBox, CaseRulesLink, caseTierAsset, type CaseRulesLinkProps } from "./case-tier";
import { itemTitle, PrizeImg, rc, type Stage } from "./case-opening-bits";
import type { GiftCaseTexts } from "./case-opening-types";

type Money = (m: number) => string;
type ResolveImage = (s: string, n: number) => string;

const SPARKS = Array.from({ length: 14 }, (_, i) => ({
  left: `${8 + ((i * 61) % 84)}%`,
  d: `${2.6 + ((i * 7) % 10) / 5}s`,
  delay: `${((i * 37) % 30) / 10}s`,
  dx: `${((i * 23) % 60) - 30}px`,
}));

function CaseArt({ tier, lidOpen, assetBase }: { tier: CaseTier | null; lidOpen: boolean; assetBase: string }) {
  return (
    <>
      <div className="gc-floor" />
      <div className="gc-glow" />
      <div className="gc-burst" />
      {SPARKS.map((s, i) => (
        <span
          key={i}
          className="gc-spark"
          style={{ left: s.left, ["--d" as string]: s.d, ["--delay" as string]: s.delay, ["--dx" as string]: s.dx } as CSSProperties}
        />
      ))}
      <div className="gc-case">
        <img src={caseTierAsset(assetBase, tier, lidOpen ? "case-open.webp" : "case-closed.webp")} alt="" draggable={false} />
      </div>
    </>
  );
}

export interface SealedViewProps {
  stage: Stage;
  tier: CaseTier | null;
  texts: GiftCaseTexts;
  lidOpen: boolean;
  error: boolean;
  assetBase: string;
  sortedPrizes: CaseItem[];
  money: Money;
  resolveImage: ResolveImage;
  rules?: CaseRulesLinkProps;
  onStart: () => void;
}

/** Запечатанный кейс: заголовок, кейс над ареной, кнопка «Відкрити», «що може випасти», правила. */
export function SealedView({ stage, tier, texts, lidOpen, error, assetBase, sortedPrizes, money, resolveImage, rules, onStart }: SealedViewProps) {
  return (
      <motion.div
        key="sealed"
        style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", margin: "auto 0" }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.25 } }}
      >
        <p className="gc-eyebrow gc-disp">{texts.eyebrow}</p>
        {tier && texts.tierName && <span className="gc-tier gc-disp is-hero">{texts.tierName[tier]}</span>}
        <h2 className="gc-title gc-disp">{texts.title}</h2>
        <div className={`gc-stage ${stage === "opening" ? (lidOpen ? "is-open" : "is-opening") : ""}`} aria-hidden>
          <CaseArt tier={tier} lidOpen={lidOpen} assetBase={assetBase} />
        </div>
        <motion.div
          className="gc-btn-wrap"
          animate={{ opacity: stage === "opening" ? 0 : 1, y: stage === "opening" ? 12 : 0 }}
          transition={{ duration: 0.25 }}
        >
          <button type="button" className="gc-btn gc-disp" onClick={onStart} disabled={stage !== "sealed"} aria-busy={stage === "opening"}>
            {error ? texts.retry : stage === "opening" ? texts.opening : texts.open}
          </button>
        </motion.div>
        {error && (
          <p className="gc-err" role="alert">
            {texts.error}
          </p>
        )}
        {sortedPrizes.length > 0 && (
          <motion.section
            className="gc-drops"
            animate={{ opacity: stage === "opening" ? 0 : 1 }}
            transition={{ duration: 0.25 }}
            aria-label={texts.canDrop}
          >
            <h3 className="gc-disp">{texts.canDrop}</h3>
            <ul>
              {sortedPrizes.map((p) => (
                <li key={p.key} className="gc-drop" style={rc(p.rarity)} title={`${texts.rarity[p.rarity]} · ${itemTitle(p, texts, money)}`}>
                  <PrizeImg item={p} resolveImage={resolveImage} size={200} money={money} />
                  <p>{itemTitle(p, texts, money)}</p>
                  <b className="gc-disp">{texts.rarity[p.rarity]}</b>
                </li>
              ))}
            </ul>
          </motion.section>
        )}
        {rules && (
          <motion.div animate={{ opacity: stage === "opening" ? 0 : 1 }} transition={{ duration: 0.25 }}>
            <CaseRulesLink {...rules} />
          </motion.div>
        )}
      </motion.div>
  );
}

export interface SpinViewProps {
  stage: Stage;
  tier: CaseTier | null;
  assetBase: string;
  texts: GiftCaseTexts;
  money: Money;
  resolveImage: ResolveImage;
  vpRef: MutableRefObject<HTMLDivElement | null>;
  setVpEl: (el: HTMLDivElement | null) => void;
  speedRef: RefObject<HTMLDivElement | null>;
  x: MotionValue<number>;
  run: number;
  spinDone: boolean;
  tile: { w: number; gap: number };
  reel: CaseItem[];
  won: CaseItem | null;
}

/** Барабан: мини-кейс, лента с призами, метка, подсказка. */
export function SpinView({ stage, tier, assetBase, texts, money, resolveImage, vpRef, setVpEl, speedRef, x, run, spinDone, tile, reel, won }: SpinViewProps) {
  return (
      <motion.div
        key="spin"
        className="gc-spinwrap"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          className="gc-mini"
          aria-hidden
          initial={{ opacity: 0, y: 40, scale: 1.4 }}
          animate={{ opacity: 0.9, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <img src={caseTierAsset(assetBase, tier, "case-open.webp")} alt="" draggable={false} />
        </motion.div>
        <motion.div
          className="gc-reel"
          initial={{ opacity: 0, x: 120 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <div className="gc-reel-bg" />
          <div
            ref={(el) => {
              vpRef.current = el;
              setVpEl(el);
            }}
            className="gc-reel-vp"
          >
            <motion.div
              key={run}
              className={`gc-strip ${spinDone ? "is-done" : ""}`}
              style={{ x, ["--tw" as string]: `${tile.w}px`, ["--gap" as string]: `${tile.gap}px` } as never}
            >
              {reel.map((it, i) => (
                <div
                  key={i}
                  className={`gc-tile ${i === CASE_REEL_WIN_INDEX ? "is-win" : ""}`}
                  style={rc(it.rarity)}
                  aria-hidden={i !== CASE_REEL_WIN_INDEX}
                >
                  <PrizeImg item={it} resolveImage={resolveImage} size={240} money={money} />
                  <p>{itemTitle(it, texts, money)}</p>
                </div>
              ))}
            </motion.div>
            <div ref={speedRef} className="gc-speed" />
          </div>
          <div className="gc-marker" />
        </motion.div>
        <p className="gc-hint gc-disp" aria-live="polite">
          {stage === "spin" ? texts.opening : won ? texts.rarity[won.rarity] : ""}
        </p>
      </motion.div>
  );
}

export interface RevealCardProps {
  won: CaseItem;
  rank: number;
  result: GiftCaseOpen | null;
  texts: GiftCaseTexts;
  money: Money;
  formatDate?: (iso: string) => string;
  resolveImage: ResolveImage;
  swapped: boolean;
  canSwap: boolean;
  swapBusy: boolean;
  swapErr: boolean;
  onClose: () => void;
  onAgain?: () => void;
  againLabel?: string;
  onSize?: (variantId: string) => Promise<CaseSize>;
  onSwap: () => void;
}

/** Экран-карточка приза: что выпало, размер, промокод, замена на скидку. */
export function RevealCard({ won, rank, result, texts, money, formatDate, resolveImage, swapped, canSwap, swapBusy, swapErr, onClose, onAgain, againLabel, onSize, onSwap }: RevealCardProps) {
  const swap = result?.swap ?? null;
  return (
      <motion.div
        key="card"
        className="gc-reveal"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          className="gc-card"
          style={rc(won.rarity)}
          initial={{ opacity: 0, scale: 0.7, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          role="group"
          aria-label={texts.youGot}
        >
          <div className="gc-card-rays" aria-hidden />
          <div className="gc-card-edge" aria-hidden />
          {rank >= 3 && <div className="gc-shimmer" aria-hidden />}
          <p className="gc-eyebrow gc-disp" style={{ position: "relative", color: "rgba(255,255,255,.7)" }}>
            {texts.youGot}
          </p>
          <motion.div
            className="gc-prize"
            initial={{ scale: 0.4, rotate: -8 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 13, delay: 0.08 }}
          >
            <PrizeImg item={won} resolveImage={resolveImage} size={480} money={money} />
          </motion.div>
          <span className="gc-rarity gc-disp">{texts.rarity[won.rarity]}</span>
          <p className="gc-prize-title gc-disp" style={swapped ? { textDecoration: "line-through", opacity: 0.55 } : undefined}>
            {itemTitle(won, texts, money)}
          </p>
          <RevealNote won={won} swapped={swapped} texts={texts} />
          <RevealExtras won={won} swapped={swapped} result={result} texts={texts} money={money} formatDate={formatDate} onSize={onSize} />
          {canSwap && <p className="gc-swap">{texts.swapHint}</p>}
          {swapErr && (
            <p className="gc-err" role="alert">
              {texts.swapError}
            </p>
          )}
          <RevealActions texts={texts} money={money} swap={canSwap ? swap : null} swapBusy={swapBusy} onClose={onClose} onAgain={onAgain} againLabel={againLabel} onSwap={onSwap} />
        </motion.div>
      </motion.div>
  );
}

/** Строка под призом: «зарахується на наступне замовлення» / «замінено» / «додано безкоштовно». */
function RevealNote({ won, swapped, texts }: { won: CaseItem; swapped: boolean; texts: GiftCaseTexts }) {
  return (
    <>
        {won.kind === "DISCOUNT" ? (
          <p className="gc-free is-note">{texts.discountNext}</p>
        ) : swapped ? (
          <p className="gc-free">✓ {texts.swapped}</p>
        ) : (
          <p className="gc-free">✓ {texts.addedFree}</p>
        )}
    </>
  );
}

interface RevealActionsProps {
  texts: GiftCaseTexts;
  money: Money;
  /** Доступная замена на скидку (null — кнопки нет). */
  swap: GiftCaseOpen["swap"] | null;
  swapBusy: boolean;
  onClose: () => void;
  onAgain?: () => void;
  againLabel?: string;
  onSwap: () => void;
}

/** Кнопки карточки приза: «Забрати», «Ще раз» (если есть), «Замінити на знижку». */
function RevealActions({ texts, money, swap, swapBusy, onClose, onAgain, againLabel, onSwap }: RevealActionsProps) {
  return (
        <div className="gc-actions">
          <button type="button" className="gc-btn gc-disp" onClick={onClose} autoFocus>
            {texts.take}
          </button>
          {onAgain && (
            <button type="button" className="gc-btn gc-disp ghost" onClick={onAgain}>
              {againLabel}
            </button>
          )}
          {swap && (
            <button type="button" className="gc-btn gc-disp ghost" onClick={onSwap} disabled={swapBusy} aria-busy={swapBusy}>
              {texts.swapAction.replace("{d}", `−${money(swap.amountMinor)}`)}
            </button>
          )}
        </div>
  );
}

interface RevealExtrasProps {
  won: CaseItem;
  swapped: boolean;
  result: GiftCaseOpen | null;
  texts: GiftCaseTexts;
  money: Money;
  formatDate?: (iso: string) => string;
  onSize?: (variantId: string) => Promise<CaseSize>;
}

/** Выбор размера приза-товара и промокод приза-скидки. */
function RevealExtras({ won, swapped, result, texts, money, formatDate, onSize }: RevealExtrasProps) {
  const promo = result?.promo ?? null;
  return (
    <>
        {won.kind === "PRODUCT" && !swapped && result?.size && onSize && texts.size && (
          <CaseSizePicker size={result.size} texts={texts.size} onChoose={onSize} />
        )}
        {promo && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <CasePromoBox promo={promo} texts={texts.promo} money={money} formatDate={formatDate} />
          </motion.div>
        )}
    </>
  );
}
