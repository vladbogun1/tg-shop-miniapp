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
 * The prize is decided by the server (checkout / an admin's gift): `openCase()` only reveals it. A case
 * opens exactly once and only after the order is paid — there is no replay; a refused open
 * (GIFT_CASE_UNPAID / GIFT_CASE_ALREADY_OPENED) goes to `onOpenRefused`, and the caller closes the
 * screen. Everything app-specific — texts, image URLs, haptics, analytics — comes in through props.
 * `prefers-reduced-motion`: no spin, a short fade to the prize.
 */
import { animate, AnimatePresence, motion, useMotionValue, type AnimationPlaybackControls } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  buildCaseReel,
  CASE_RARITY_COLOR,
  CASE_REEL_WIN_INDEX,
  caseRarityRank,
  caseReelOffset,
  formatCaseChance,
  giftCaseOpenErrorCode,
  type CaseItem,
  type CaseRarity,
  type GiftCaseOpen,
} from "../giftcase";
import { caseOpenSound, caseRevealSound, caseStopSound, caseTick, isCaseAudioMuted, setCaseAudioMuted, unlockCaseAudio } from "./case-audio";
import { CaseBurst } from "./case-particles";
import { CASE_CSS } from "./case-styles";

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
  /** Prizes for «Що може випасти» before the case is opened (empty = the list is hidden). */
  prizes: CaseItem[];
  /** For the chance's decimal separator (uk/ru «,», en «.»). */
  locale?: string;
  texts: GiftCaseTexts;
  /** Product image key/url → a URL of roughly `size` px. */
  resolveImage: (src: string, size: number) => string;
  /** Where case-*.webp / scene-*.webp live. Default "/case". */
  assetBase?: string;
  haptics?: GiftCaseHaptics;
  /** The prize was shown (first time in this overlay): analytics, refetch of the order. */
  onRevealed?: (res: GiftCaseOpen) => void;
  /** Whether closing is allowed right now (false during the opening and the spin) — for a native back button. */
  onClosableChange?: (closable: boolean) => void;
}

type Stage = "sealed" | "opening" | "spin" | "reveal";

const SPIN_SECONDS = 6.6;
const SPIN_EASE: [number, number, number, number] = [0.12, 0.8, 0.18, 1];

function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Loads (and decodes) images before the reel moves, so nothing pops in mid-spin. Gives up after `ms`. */
function preload(urls: string[], ms = 2500): Promise<void> {
  const all = urls.map(
    (u) =>
      new Promise<void>((res) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => {
          if (img.decode) img.decode().then(() => res(), () => res());
          else res();
        };
        img.onerror = () => res();
        img.src = u;
      })
  );
  return Promise.race([Promise.all(all).then(() => undefined), wait(ms)]);
}

function rc(r: CaseRarity | string | null | undefined): CSSProperties {
  return { ["--rc" as string]: CASE_RARITY_COLOR[(r as CaseRarity) ?? "COMMON"] ?? CASE_RARITY_COLOR.COMMON } as CSSProperties;
}

export function CaseStyles() {
  // React 19 hoists this to <head> once, however many case components are mounted.
  return (
    <style href="gift-case-ui" precedence="default">
      {CASE_CSS}
    </style>
  );
}

function PrizeImg({ item, resolveImage, size }: { item: CaseItem; resolveImage: (s: string, n: number) => string; size: number }) {
  const [failed, setFailed] = useState(false);
  if (!item.imageUrl || failed) return <span className="gc-noimg">🎁</span>;
  return <img src={resolveImage(item.imageUrl, size)} alt="" draggable={false} decoding="async" onError={() => setFailed(true)} />;
}

const Icon = {
  close: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  sound: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5L6 9H3v6h3l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" />
    </svg>
  ),
  mute: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5L6 9H3v6h3l5 4V5z" />
      <path d="M22 9l-6 6M16 9l6 6" />
    </svg>
  ),
};

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
  locale,
  texts,
  resolveImage,
  assetBase = "/case",
  haptics,
  onRevealed,
  onClosableChange,
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

  const rootRef = useRef<HTMLDivElement>(null);
  const shakeRef = useRef<HTMLDivElement>(null);
  const vpRef = useRef<HTMLDivElement | null>(null);
  // The reel mounts only after the sealed view has left (AnimatePresence "wait"), so the spin starts
  // when its viewport appears, not when the stage flips.
  const [vpEl, setVpEl] = useState<HTMLDivElement | null>(null);
  const spunRun = useRef(0);
  const speedRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const burstRef = useRef<CaseBurst | null>(null);
  const alive = useRef(true);
  const revealedOnce = useRef(false);
  const x = useMotionValue(0);
  const anim = useRef<AnimationPlaybackControls | null>(null);
  const hapticsRef = useRef(haptics);
  hapticsRef.current = haptics;
  const onRevealedRef = useRef(onRevealed);
  onRevealedRef.current = onRevealed;

  const closable = stage === "sealed" || (stage === "reveal" && card);
  useEffect(() => onClosableChange?.(closable), [closable, onClosableChange]);
  useEffect(() => () => onClosableChange?.(true), [onClosableChange]);

  // Scroll lock + Esc + focus.
  useEffect(() => {
    alive.current = true;
    const html = document.documentElement;
    const prev = [html.style.overflow, document.body.style.overflow];
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    const before = document.activeElement as HTMLElement | null;
    rootRef.current?.focus({ preventScroll: true });
    return () => {
      alive.current = false;
      html.style.overflow = prev[0];
      document.body.style.overflow = prev[1];
      anim.current?.stop();
      burstRef.current?.destroy();
      try {
        before?.focus?.({ preventScroll: true });
      } catch {
        /* noop */
      }
    };
  }, []);
  const closableRef = useRef(closable);
  closableRef.current = closable;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && closableRef.current) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Canvas for the bursts.
  useEffect(() => {
    if (!canvasRef.current) return;
    const b = new CaseBurst(canvasRef.current);
    burstRef.current = b;
    const onResize = () => b.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      b.destroy();
    };
  }, []);

  const urls = useCallback(
    (items: CaseItem[], size: number) =>
      Array.from(new Set(items.map((p) => p.imageUrl).filter((u): u is string => !!u))).map((u) => resolveImage(u, size)),
    [resolveImage]
  );

  const reveal = useCallback(
    (res: GiftCaseOpen, reduced: boolean) => {
      const rank = caseRarityRank(res.won.rarity);
      const color = CASE_RARITY_COLOR[res.won.rarity] ?? CASE_RARITY_COLOR.COMMON;
      setStage("reveal");
      caseRevealSound(rank);
      hapticsRef.current?.success?.();
      if (!revealedOnce.current) {
        revealedOnce.current = true;
        onRevealedRef.current?.(res);
      }
      const b = burstRef.current;
      const vp = vpRef.current?.getBoundingClientRect();
      if (b && !reduced) {
        const cx = vp ? vp.left + vp.width / 2 : window.innerWidth / 2;
        const cy = vp ? vp.top + vp.height / 2 : window.innerHeight / 2;
        const big = rank >= 3;
        b.burst({ x: cx, y: cy, colors: [color, color, "#ffffff", "#ff8533"], count: big ? 170 : 70 + rank * 25, power: big ? 900 : 560 });
        if (big) {
          window.setTimeout(() => alive.current && b.burst({ x: cx, y: cy - 40, colors: [color, "#ffe28a", "#fff"], count: 120, power: 1100, sparks: 0.6 }), 260);
          if (shakeRef.current) {
            animate(shakeRef.current, { x: [0, -10, 9, -7, 6, -3, 0], y: [0, 4, -5, 3, -2, 1, 0] }, { duration: 0.6, ease: "easeOut" });
          }
        }
      }
      window.setTimeout(() => alive.current && setCard(true), reduced ? 0 : 950);
    },
    []
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
  }, [openCase, onOpenRefused, result, reveal, spin, urls]);

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
  const sortedPrizes = useMemo(
    () => [...prizes].sort((a, b) => caseRarityRank(b.rarity) - caseRarityRank(a.rarity) || a.chancePercent - b.chancePercent),
    [prizes]
  );
  const sparks = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        left: `${8 + ((i * 61) % 84)}%`,
        d: `${2.6 + ((i * 7) % 10) / 5}s`,
        delay: `${((i * 37) % 30) / 10}s`,
        dx: `${((i * 23) % 60) - 30}px`,
      })),
    []
  );

  const caseArt = (
    <>
      <div className="gc-floor" />
      <div className="gc-glow" />
      <div className="gc-burst" />
      {sparks.map((s, i) => (
        <span
          key={i}
          className="gc-spark"
          style={{ left: s.left, ["--d" as string]: s.d, ["--delay" as string]: s.delay, ["--dx" as string]: s.dx } as CSSProperties}
        />
      ))}
      <div className="gc-case">
        <img src={`${assetBase}/${lidOpen ? "case-open" : "case-closed"}.webp`} alt="" draggable={false} />
      </div>
    </>
  );

  return (
    <motion.div
      ref={rootRef}
      className="gc-root"
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
      <link rel="preload" as="image" href={`${assetBase}/case-open.webp`} />

      <div ref={shakeRef} className="gc-shake" style={{ position: "absolute", inset: 0 }}>
        <div className="gc-body">
          <AnimatePresence mode="wait" initial={false}>
            {(stage === "sealed" || stage === "opening") && (
              <motion.div
                key="sealed"
                style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", margin: "auto 0" }}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.25 } }}
              >
                <p className="gc-eyebrow gc-disp">{texts.eyebrow}</p>
                <h2 className="gc-title gc-disp">{texts.title}</h2>
                <div className={`gc-stage ${stage === "opening" ? (lidOpen ? "is-open" : "is-opening") : ""}`} aria-hidden>
                  {caseArt}
                </div>
                <motion.div
                  className="gc-btn-wrap"
                  animate={{ opacity: stage === "opening" ? 0 : 1, y: stage === "opening" ? 12 : 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <button type="button" className="gc-btn gc-disp" onClick={() => void start()} disabled={stage !== "sealed"} aria-busy={stage === "opening"}>
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
                        <li key={p.productId} className="gc-drop" style={rc(p.rarity)} title={`${texts.rarity[p.rarity]} · ${p.title}`}>
                          <PrizeImg item={p} resolveImage={resolveImage} size={200} />
                          <p>{p.title}</p>
                          <b className="gc-disp">{formatCaseChance(p.chancePercent, locale)}</b>
                        </li>
                      ))}
                    </ul>
                  </motion.section>
                )}
              </motion.div>
            )}

            {(stage === "spin" || stage === "reveal") && (
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
                  <img src={`${assetBase}/case-open.webp`} alt="" draggable={false} />
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
                          <PrizeImg item={it} resolveImage={resolveImage} size={240} />
                          <p>{it.title}</p>
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
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {card && won && (
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
                  <PrizeImg item={won} resolveImage={resolveImage} size={480} />
                </motion.div>
                <span className="gc-rarity gc-disp">{texts.rarity[won.rarity]}</span>
                <p className="gc-prize-title gc-disp">{won.title}</p>
                <p className="gc-free">✓ {texts.addedFree}</p>
                <div className="gc-actions">
                  <button type="button" className="gc-btn gc-disp" onClick={onClose} autoFocus>
                    {texts.take}
                  </button>
                </div>
              </motion.div>
            </motion.div>
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
