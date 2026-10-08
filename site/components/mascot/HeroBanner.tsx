"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n/context";
import type { MessageKey } from "@/i18n";
import { categoryKind, type CategoryKind } from "./category-kind";
import "./hero-banner.css";

/**
 * Home hero banner (right column): big slides «category + slogan + device icon» on an orange disc,
 * one every SLIDE_MS, in the categories' order (01/12 → 02/12 → … → 12/12 → 01/12). Each slide links to
 * its category. In the bottom-right corner the «21» mascot reacts to the slide's device (REACTIONS):
 * a 4-frame scene with the device (flicks the mouse, pulls on the sleeve, blows the dust…) or, for the
 * rest, an emotion peeking out of the corner. Mascot states cross-fade together with the slides.
 * Autoplay pauses on hover / keyboard focus, in a hidden tab and while the panel is off screen.
 * Reduced motion: slides still change (plain swap), scenes stay on frame 0, nothing moves.
 * Styles: hero-banner.css.
 */

const SLIDE_MS = 3800;
/** How long the outgoing slide (and its mascot) stays mounted for the exit animation. */
const OUT_MS = 520;

/** Device icons: /public/mascot/icons/<kind>.(webp|png), 256×256. */
const iconSrc = (kind: CategoryKind, ext: "webp" | "png") => `/mascot/icons/${kind}.${ext}`;

/** Peek emotions: /public/mascot/banner/peek_<name>.webp, 320×320, the mascot leaning in from the right edge. */
type Emotion = "smile" | "wink" | "wave1" | "wave2" | "laugh" | "oh" | "thumb" | "fire";
/** Scenes: 4 frames of 240×200 in a row (/mascot/scenes/<name>.webp), or one 240×200 still (banner/discord). */
type Scene = "headset" | "mouse" | "keycaps" | "sleeve" | "blower" | "chair" | "discord";

/**
 * What the mascot does on a slide: a scene, or a peek with 1+ emotion frames (`ms` per frame; `loop`
 * cycles them, otherwise it stays on the last one — «oh!» then a thumbs-up).
 */
type Reaction = { scene: Scene } | { peek: Emotion[]; ms?: number; loop?: boolean };
const WAVE: Reaction = { peek: ["wave1", "wave2"], ms: 260, loop: true };

/** Per art kind; a slide's repeat visits (each full round) go through its list in turn. */
const REACTIONS: Record<CategoryKind, Reaction[]> = {
  headset: [{ scene: "headset" }, { scene: "discord" }],
  mouse: [{ scene: "mouse" }],
  keycaps: [{ scene: "keycaps" }],
  sleeve: [{ scene: "sleeve" }],
  blower: [{ scene: "blower" }],
  chair: [{ scene: "chair" }],
  glides: [{ peek: ["wink"] }, WAVE],
  mousepad: [{ peek: ["smile"] }, { peek: ["thumb"] }],
  glass: [{ peek: ["oh"] }, { peek: ["wink"] }],
  mechanical: [{ peek: ["thumb"] }, WAVE],
  magnetic: [{ peek: ["fire"] }, { peek: ["laugh"] }],
  cable: [WAVE, { peek: ["smile"] }],
  desk: [{ peek: ["thumb"] }, { peek: ["smile"] }],
  sale: [{ peek: ["oh", "thumb"], ms: 1500 }],
};

const sceneSrc = (s: Scene) => (s === "discord" ? "/mascot/banner/discord.webp" : `/mascot/scenes/${s}.webp`);
const sceneFrames = (s: Scene) => (s === "discord" ? 1 : 4);
const peekSrc = (e: Emotion) => `/mascot/banner/peek_${e}.webp`;

/** Slogans per art kind (home.banner.<kind>.a|b); shown a, b, a, … on the slide's repeat visits. */
const VARIANTS = ["a", "b"] as const;
const slogan = (kind: CategoryKind, n: number) => `home.banner.${kind}.${VARIANTS[n % VARIANTS.length]}` as MessageKey;
const reaction = (kind: CategoryKind, n: number) => REACTIONS[kind][n % REACTIONS[kind].length];

export type BannerCategory = { slug: string; name: string; productCount: number };
type Slide = { slug: string; name: string; kind: CategoryKind };
/** A mounted slide: index, visit number (picks slogan + reaction), key, leaving or not. */
type Layer = { i: number; v: number; id: number; out: boolean };

export function HeroBanner({ categories }: { categories: BannerCategory[] }) {
  const { t, href } = useI18n();
  const slides = useMemo<Slide[]>(
    () => categories.filter((c) => c.productCount > 0).map((c) => ({ slug: c.slug, name: c.name, kind: categoryKind(c.slug, c.name) })),
    [categories]
  );

  // SSR + first client render: slide 0, visit 0.
  const [layers, setLayers] = useState<Layer[]>([{ i: 0, v: 0, id: 0, out: false }]);
  const [tick, setTick] = useState(0);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [offscreen, setOffscreen] = useState(false);
  const [still, setStill] = useState(false);

  const root = useRef<HTMLDivElement>(null);
  const left = useRef(SLIDE_MS);

  const count = slides.length;
  const paused = hover || focus || hidden || offscreen;

  // reduced motion, tab visibility, on-screen
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMq = () => setStill(mq.matches);
    onMq();
    mq.addEventListener("change", onMq);
    const onVis = () => setHidden(document.hidden);
    onVis();
    document.addEventListener("visibilitychange", onVis);
    let io: IntersectionObserver | undefined;
    if (root.current && "IntersectionObserver" in window) {
      io = new IntersectionObserver(([e]) => setOffscreen(!e.isIntersecting), { threshold: 0.25 });
      io.observe(root.current);
    }
    return () => {
      mq.removeEventListener("change", onMq);
      document.removeEventListener("visibilitychange", onVis);
      io?.disconnect();
    };
  }, []);

  // warm up the next slide's icon and mascot art while this one is on
  const shown = layers.find((l) => !l.out) ?? layers[0];
  useEffect(() => {
    if (count < 2) return;
    const n = (shown.i + 1) % count;
    const s = slides[n];
    const r = reaction(s.kind, n === 0 ? shown.v + 1 : shown.v);
    new Image().src = iconSrc(s.kind, "webp");
    if ("scene" in r) new Image().src = sceneSrc(r.scene);
    else r.peek.forEach((e) => (new Image().src = peekSrc(e)));
  }, [shown.i, shown.v, count, slides]);

  // drop the outgoing layer once its exit has played (at once with reduced motion)
  useEffect(() => {
    if (!layers.some((l) => l.out)) return;
    const id = window.setTimeout(() => setLayers((ls) => ls.filter((l) => !l.out)), still ? 0 : OUT_MS);
    return () => window.clearTimeout(id);
  }, [layers, still]);

  // autoplay in order, with a resumable remainder (hover mid-slide, then leave → the rest of the slide)
  useEffect(() => {
    if (paused || count < 2) return;
    const start = performance.now();
    let fired = false;
    const id = window.setTimeout(() => {
      fired = true;
      left.current = SLIDE_MS;
      setLayers((ls) => {
        // the shown layer keeps its key (no remount) and plays its exit under the new one
        const cur = ls.find((l) => !l.out) ?? ls[0];
        const i = (cur.i + 1) % count;
        return [{ ...cur, out: true }, { i, v: i === 0 ? cur.v + 1 : cur.v, id: cur.id + 1, out: false }];
      });
      setTick((x) => x + 1);
    }, left.current);
    return () => {
      window.clearTimeout(id);
      if (!fired) left.current = Math.max(400, left.current - (performance.now() - start));
    };
  }, [paused, tick, count]);

  if (count === 0) return null;

  const total = String(count).padStart(2, "0");

  return (
    <div
      ref={root}
      role="region"
      aria-roledescription="carousel"
      aria-label={t("home.banner.label")}
      className="hb hud-frame"
      data-paused={paused || undefined}
      data-still={still || undefined}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocus(false);
      }}
    >
      <span aria-hidden className="hb-bg" />

      {layers.map((l) => {
        const s = slides[l.i] ?? slides[0];
        const text = t(slogan(s.kind, l.v));
        return (
          <Link
            key={l.id}
            href={href(`/catalog/${s.slug}`)}
            className="hb-slide"
            data-out={l.out || undefined}
            data-first={l.id === 0 || undefined}
            aria-hidden={l.out || undefined}
            tabIndex={l.out ? -1 : undefined}
            aria-label={`${s.name} — ${text}`}
          >
            <span className="hb-text">
              <span className="hb-cat">
                <span className="hb-num">
                  {String(l.i + 1).padStart(2, "0")}/{total}
                </span>
                <span className="hb-name">{s.name}</span>
              </span>
              <span className="hb-slogan">{text}</span>
              <span className="hb-go">
                {t("home.banner.go")}
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
                  <path d="M3 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
                </svg>
              </span>
            </span>
            <span aria-hidden className="hb-art">
              <span className="hb-disc" />
              <span className="hb-rays" />
              <span className="hb-float">
                <picture>
                  <source type="image/webp" srcSet={iconSrc(s.kind, "webp")} />
                  <img
                    className="hb-icon"
                    src={iconSrc(s.kind, "png")}
                    alt=""
                    width={256}
                    height={256}
                    draggable={false}
                    decoding="async"
                  />
                </picture>
              </span>
              <span className="hb-shine" />
            </span>
          </Link>
        );
      })}

      {layers.map((l) => (
        <Mascot key={`m${l.id}`} r={reaction((slides[l.i] ?? slides[0]).kind, l.v)} out={l.out} first={l.id === 0} still={still} />
      ))}

      {tick > 0 && <span key={`g${tick}`} aria-hidden className="hb-glitch" />}

      {count > 1 && <span aria-hidden className="hb-progress" key={`b${tick}`} style={{ "--hb-ms": `${SLIDE_MS}ms` } as React.CSSProperties} />}
    </div>
  );
}

/** The mascot of one slide, in the bottom-right corner; cross-fades in/out with its slide. */
function Mascot({ r, out, first, still }: { r: Reaction; out: boolean; first: boolean; still: boolean }) {
  const [f, setF] = useState(0);
  useEffect(() => {
    if (!("peek" in r) || r.peek.length < 2 || still || out) return;
    const n = r.peek.length;
    const id = window.setInterval(() => setF((x) => (x + 1 < n ? x + 1 : r.loop ? 0 : x)), r.ms ?? 400);
    return () => window.clearInterval(id);
  }, [r, still, out]);

  const state = { "data-out": out || undefined, "data-first": first || undefined };
  if ("scene" in r) {
    const n = sceneFrames(r.scene);
    return (
      <span aria-hidden className="hb-mx hb-mx-scene" {...state}>
        <span
          className="hb-scene"
          data-strip={n > 1 || undefined}
          style={{ "--sn": n, "--sms": `${SLIDE_MS / 2}ms`, backgroundImage: `url(${sceneSrc(r.scene)})` } as React.CSSProperties}
        />
      </span>
    );
  }
  return (
    <span aria-hidden className="hb-mx hb-mx-peek" {...state}>
      <span className="hb-peek-b">
        {r.peek.map((e, k) => (
          <img key={e} className="hb-peek-f" data-on={k === f || undefined} src={peekSrc(e)} alt="" width={320} height={320} draggable={false} decoding="async" />
        ))}
      </span>
    </span>
  );
}
