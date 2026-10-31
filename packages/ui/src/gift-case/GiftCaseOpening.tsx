"use client";

/**
 * The gift case opening screen (CS-style loot case with a spinning reel), shared by the Mini App
 * and the website. Full-screen portal over the page:
 *
 *   sealed  → the closed case floats over the arena, «what can drop», «Відкрити кейс»
 *   opening → shake, charge, white/orange flash, the lid opens with a light burst (~1.1 s)
 *   spin    → the reel (buildCaseReel) slides to the prize (caseReelOffset), ~6.5 s long ease-out,
 *             a tick + haptic per tile crossing the marker
 *   reveal  → the prize tile pops, everything else dims, a burst in the rarity colour (bigger, with
 *             screen shake, a golden sheen and a fanfare for LEGENDARY/GOLD), then the prize card
 *
 * Three tiers (bronze/silver/gold) share the screen; the tier only re-skins it (art, metal colours).
 * A prize is a product (added to the order for free) or a discount (a personal code, shown with «copy»).
 * A product similar to what the customer bought may be swapped for a code right on the prize card
 * (`swap.available`, `onSwap`). A product with sizes asks for the size there (`size`, `onSize`).
 * Chances are never shown.
 *
 * The prize is decided by the server (checkout / an admin's gift): `openCase()` only reveals it. A case
 * opens exactly once and only after the order is paid — there is no replay; a refused open
 * (GIFT_CASE_UNPAID / GIFT_CASE_ALREADY_OPENED) goes to `onOpenRefused`, and the caller closes the
 * screen. Everything app-specific — texts, image URLs, haptics, analytics — comes in through props.
 * `prefers-reduced-motion`: no spin, a short fade to the prize.
 */
import { animate, AnimatePresence, motion, useMotionValue } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  buildCaseReel,
  CASE_RARITY_COLOR,
  caseRarityRank,
  caseReelOffset,
  CASE_TIER_METAL,
  giftCaseOpenErrorCode,
  sortCasePrizes,
  type CaseItem,
  type GiftCaseOpen,
} from "@shop/core/giftcase";
import { caseOpenSound, caseRevealSound, caseStopSound, caseTick, isCaseAudioMuted, setCaseAudioMuted, unlockCaseAudio } from "./case-audio";
import { playRevealBurst, useCaseOverlayLifecycle } from "./use-case-overlay";
import { caseTierAsset, caseTierVars } from "./case-tier";
import { CaseStyles, Icon, preload, reducedMotion, SPIN_EASE, SPIN_SECONDS, wait, type Stage } from "./case-opening-bits";
import type { GiftCaseOpeningProps } from "./case-opening-types";
import { RevealCard, SealedView, SpinView } from "./case-opening-views";

export function GiftCaseOpening(props: GiftCaseOpeningProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <>
      <CaseStyles />
      <AnimatePresence>{props.open && <CaseOverlay key="gc" {...props} />}</AnimatePresence>
    </>,
    document.body
  );
}

function CaseOverlay({
  onClose,
  openCase,
  onOpenRefused,
  prizes,
  tier: tierProp = null,
  onSwap,
  onSize,
  texts,
  money,
  formatDate,
  resolveImage,
  assetBase = "/case",
  haptics,
  onRevealed,
  onClosableChange,
  onAgain,
  againLabel,
  rules,
}: GiftCaseOpeningProps) {
  const [stage, setStage] = useState<Stage>("sealed");
  const [result, setResult] = useState<GiftCaseOpen | null>(null);
  const [error, setError] = useState(false);
  const [lidOpen, setLidOpen] = useState(false);
  const [flash, setFlash] = useState(0);
  const [reel, setReel] = useState<CaseItem[]>([]);
  const [spinDone, setSpinDone] = useState(false);
  const [card, setCard] = useState(false);
  const [muted, setMuted] = useState(() => isCaseAudioMuted());
  const [tile, setTile] = useState({ w: 120, gap: 8 });
  const [run, setRun] = useState(0);
  const [swapBusy, setSwapBusy] = useState(false);
  const [swapErr, setSwapErr] = useState(false);
  const tier = result?.tier ?? tierProp;

  const shakeRef = useRef<HTMLDivElement>(null);
  const vpRef = useRef<HTMLDivElement | null>(null);
  // The reel mounts only after the sealed view has left (AnimatePresence "wait"), so the spin starts
  // when its viewport appears, not when the stage flips.
  const [vpEl, setVpEl] = useState<HTMLDivElement | null>(null);
  const spunRun = useRef(0);
  const speedRef = useRef<HTMLDivElement>(null);
  const revealedOnce = useRef(false);
  const x = useMotionValue(0);
  const hapticsRef = useRef(haptics);
  hapticsRef.current = haptics;
  const onRevealedRef = useRef(onRevealed);
  onRevealedRef.current = onRevealed;

  const closable = stage === "sealed" || (stage === "reveal" && card);
  useEffect(() => onClosableChange?.(closable), [closable, onClosableChange]);
  useEffect(() => () => onClosableChange?.(true), [onClosableChange]);

  const { rootRef, canvasRef, burstRef, alive, anim } = useCaseOverlayLifecycle(closable, onClose);


  const urls = useCallback(
    (items: CaseItem[], size: number) =>
      Array.from(new Set(items.map((p) => p.imageUrl).filter((u): u is string => !!u))).map((u) => resolveImage(u, size)),
    [resolveImage]
  );

  const reveal = useCallback(
    (res: GiftCaseOpen, reduced: boolean) => {
      const rank = caseRarityRank(res.won.rarity);
      const accent = res.tier ? CASE_TIER_METAL[res.tier].ga2 : "#ff8533";
      const color = CASE_RARITY_COLOR[res.won.rarity] ?? CASE_RARITY_COLOR.COMMON;
      setStage("reveal");
      caseRevealSound(rank);
      hapticsRef.current?.success?.();
      if (!revealedOnce.current) {
        revealedOnce.current = true;
        onRevealedRef.current?.(res);
      }
      if (!reduced) {
        playRevealBurst({ burst: burstRef.current, viewport: vpRef.current?.getBoundingClientRect(), rank, color, accent, shakeEl: shakeRef.current, alive });
      }
      window.setTimeout(() => alive.current && setCard(true), reduced ? 0 : 950);
    },
    [alive, burstRef]
  );

  const spin = useCallback(
    async (res: GiftCaseOpen) => {
      setCard(false);
      setSpinDone(false);
      const narrow = window.innerWidth < 768;
      const t = { w: narrow ? 112 : 156, gap: narrow ? 8 : 10 };
      setTile(t);
      setReel(buildCaseReel(res.reel, res.won));
      x.set(0);
      setStage("spin");
      setRun((n) => n + 1);
    },
    [x]
  );

  // Drives the reel once the strip for this run is on screen.
  useEffect(() => {
    if (stage !== "spin" || !result || run === 0 || spunRun.current === run) return;
    const vp = vpEl;
    if (!vp) return;
    spunRun.current = run;
    const vw = vp.clientWidth;
    const step = tile.w + tile.gap;
    const target = caseReelOffset({ tileWidth: tile.w, gap: tile.gap, viewportWidth: vw, jitter: 0.2 + Math.random() * 0.6 });
    let lastIdx = Math.floor((vw / 2) / step);
    let lastTick = 0;
    let lastHaptic = 0;
    let lastX = 0;
    let lastT = performance.now();
    const res = result;
    const raf = requestAnimationFrame(() => {
      anim.current = animate(x, -target, {
        duration: SPIN_SECONDS,
        ease: SPIN_EASE,
        onUpdate: (v) => {
          const idx = Math.floor((-v + vw / 2) / step);
          const now = performance.now();
          if (idx !== lastIdx) {
            lastIdx = idx;
            if (now - lastTick > 28) {
              lastTick = now;
              caseTick();
            }
            if (now - lastHaptic > 70) {
              lastHaptic = now;
              hapticsRef.current?.tick?.();
            }
          }
          // speed lines: opacity only, follows the velocity
          const dt = Math.max(1, now - lastT);
          const speed = Math.abs(v - lastX) / dt; // px per ms
          lastX = v;
          lastT = now;
          if (speedRef.current) speedRef.current.style.opacity = String(Math.min(0.9, Math.max(0, (speed - 0.6) / 4)));
        },
        onComplete: () => {
          if (!alive.current) return;
          if (speedRef.current) speedRef.current.style.opacity = "0";
          caseStopSound();
          hapticsRef.current?.stop?.();
          setSpinDone(true);
          window.setTimeout(() => alive.current && reveal(res, false), 380);
        },
      });
    });
    return () => {
      cancelAnimationFrame(raf);
      spunRun.current = 0;
      anim.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one run per `run`
  }, [run, vpEl]);

  const start = useCallback(async () => {
    unlockCaseAudio();
    setError(false);
    const reduced = reducedMotion();
    setStage("opening");
    caseOpenSound();
    hapticsRef.current?.stop?.();
    const show = reduced
      ? wait(150)
      : (async () => {
          await wait(720);
          if (!alive.current) return;
          setFlash((n) => n + 1);
          await wait(120);
          if (!alive.current) return;
          setLidOpen(true);
          await wait(900);
        })();
    try {
      const res = result ?? (await openCase());
      if (!alive.current) return;
      setResult(res);
      await Promise.all([show, preload([...urls(res.reel, 240), ...urls([res.won], 480)])]);
      if (!alive.current) return;
      if (reduced) reveal(res, true);
      else void spin(res);
    } catch (e) {
      if (!alive.current) return;
      const code = giftCaseOpenErrorCode(e);
      if (code && onOpenRefused) {
        onOpenRefused(code);
        return;
      }
      setLidOpen(false);
      setStage("sealed");
      setError(true);
    }
  }, [alive, openCase, onOpenRefused, result, reveal, spin, urls]);

  // Warm the reel images while the customer looks at the sealed case.
  useEffect(() => {
    if (prizes.length) void preload(urls(prizes, 240), 4000);
  }, [prizes, urls]);

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    setCaseAudioMuted(m);
    if (!m) unlockCaseAudio();
  };

  const won = result?.won ?? null;
  const rank = won ? caseRarityRank(won.rarity) : 0;
  const sortedPrizes = useMemo(() => sortCasePrizes(prizes), [prizes]);
  const swap = result?.swap ?? null;
  const swapped = !!swap?.swappedAt;
  const canSwap = !!onSwap && !!swap?.available && !swapped && won?.kind === "PRODUCT";
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

  return (
    <motion.div
      ref={rootRef}
      className="gc-root"
      style={caseTierVars(tier, assetBase)}
      role="dialog"
      aria-modal="true"
      aria-label={texts.title}
      tabIndex={-1}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      onUpdate={() => {}}
    >
      <div className="gc-scene" aria-hidden>
        <picture>
          <source media="(min-width: 768px)" srcSet={`${assetBase}/scene-wide.webp`} />
          <img src={`${assetBase}/scene-tall.webp`} alt="" />
        </picture>
      </div>
      <div className="gc-rays" aria-hidden />
      {/* the case art is preloaded so the swap at the flash is instant */}
      <link rel="preload" as="image" href={caseTierAsset(assetBase, tier, "case-open.webp")} />

      <div ref={shakeRef} className="gc-shake" style={{ position: "absolute", inset: 0 }}>
        <div className="gc-body">
          <AnimatePresence mode="wait" initial={false}>
            {(stage === "sealed" || stage === "opening") && (
              <SealedView
                key="sealed"
                stage={stage}
                tier={tier}
                texts={texts}
                lidOpen={lidOpen}
                error={error}
                assetBase={assetBase}
                sortedPrizes={sortedPrizes}
                money={money}
                resolveImage={resolveImage}
                rules={rules}
                onStart={() => void start()}
              />
            )}

            {(stage === "spin" || stage === "reveal") && (
              <SpinView
                key="spin"
                stage={stage}
                tier={tier}
                assetBase={assetBase}
                texts={texts}
                money={money}
                resolveImage={resolveImage}
                vpRef={vpRef}
                setVpEl={setVpEl}
                speedRef={speedRef}
                x={x}
                run={run}
                spinDone={spinDone}
                tile={tile}
                reel={reel}
                won={won}
              />
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {card && won && (
            <RevealCard
              key="card"
              won={won}
              rank={rank}
              result={result}
              texts={texts}
              money={money}
              formatDate={formatDate}
              resolveImage={resolveImage}
              swapped={swapped}
              canSwap={canSwap}
              swapBusy={swapBusy}
              swapErr={swapErr}
              onClose={onClose}
              onAgain={onAgain}
              againLabel={againLabel}
              onSize={onSize}
              onSwap={() => void doSwap()}
            />
          )}
        </AnimatePresence>
      </div>

      <div key={flash} className={`gc-flash ${flash ? "on" : ""}`} aria-hidden />
      <canvas ref={canvasRef} className="gc-canvas" aria-hidden />

      <div className="gc-top">
        <button type="button" className="gc-icon" onClick={onClose} disabled={!closable} aria-label={texts.close}>
          {Icon.close}
        </button>
        <button type="button" className="gc-icon" onClick={toggleMute} aria-label={muted ? texts.soundOn : texts.soundOff} aria-pressed={muted}>
          {muted ? Icon.mute : Icon.sound}
        </button>
      </div>
    </motion.div>
  );
}
