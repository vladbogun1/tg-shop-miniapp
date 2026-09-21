"use client";

/**
 * Gallery — product image carousel for the fullscreen product view (Neo-Brutalism).
 *
 * - Pointer-drag swipe (framer-motion) to move between slides.
 * - ‹ › arrow buttons overlaid on the sides (disabled at first/last).
 * - An "n / total" counter pill (top-right) + dot indicators along the bottom.
 * - Graceful single-image case: no arrows / dots / counter, drag disabled.
 * - Uses the custom imgproxy <Image>; handles the no-image case (placeholder).
 */
import { motion, type PanInfo } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useT } from "@/i18n/context";
import { Image } from "@/lib/image";
import { haptic } from "@/lib/telegram";
import type { ProductImage } from "@/lib/api";

export function Gallery({
  images,
  alt,
}: {
  images?: ProductImage[];
  alt: string;
}) {
  const t = useT();
  const urls = useMemo(
    () =>
      (images ?? [])
        .slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((i) => i.url)
        .filter((u): u is string => !!u),
    [images]
  );
  const slides = urls.length > 0 ? urls : [undefined];
  const [slide, setSlide] = useState(0);
  const multi = slides.length > 1;

  const go = (next: number) => {
    const clamped = Math.max(0, Math.min(slides.length - 1, next));
    setSlide((s) => {
      if (clamped !== s) haptic();
      return clamped;
    });
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -60) go(slide + 1);
    else if (info.offset.x > 60) go(slide - 1);
  };

  return (
    <div className="nb relative aspect-square w-full overflow-hidden p-1">
      <div className="relative h-full w-full overflow-hidden rounded-[calc(var(--r-lg)-4px)]">
        <motion.div
          className="flex h-full"
          drag={multi ? "x" : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.15}
          onDragEnd={onDragEnd}
          animate={{ x: `-${slide * 100}%` }}
          transition={{ type: "spring", stiffness: 320, damping: 34 }}
        >
          {slides.map((url, i) => (
            <div key={i} className="h-full w-full shrink-0">
              <Image
                src={url}
                alt={t("gallery.photoAlt", { alt, n: i + 1 })}
                size={1000}
                priority={i === 0}
                className="pointer-events-none h-full w-full"
              />
            </div>
          ))}
        </motion.div>

        {multi && (
          <>
            <ArrowBtn
              side="left"
              disabled={slide === 0}
              onClick={() => go(slide - 1)}
            />
            <ArrowBtn
              side="right"
              disabled={slide === slides.length - 1}
              onClick={() => go(slide + 1)}
            />

            {/* counter pill */}
            <div className="nb-flat absolute right-2.5 top-2.5 bg-[var(--surface)] px-2.5 py-1 text-[11px] font-black text-[var(--ink)]">
              {slide + 1} / {slides.length}
            </div>

            {/* dots */}
            <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={t("gallery.photoLabel", { n: i + 1 })}
                  onClick={() => go(i)}
                  className="h-1.5 rounded-full transition-all duration-300"
                  style={{
                    width: i === slide ? 20 : 6,
                    background:
                      i === slide ? "var(--grad-accent)" : "rgba(255,255,255,.5)",
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ArrowBtn({
  side,
  disabled,
  onClick,
}: {
  side: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  const t = useT();
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.9 }}
      disabled={disabled}
      onClick={onClick}
      aria-label={side === "left" ? t("gallery.prev") : t("gallery.next")}
      className={`nb-flat tap absolute top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center bg-[var(--surface)] text-[var(--ink)] transition-opacity disabled:opacity-0 ${
        side === "left" ? "left-2" : "right-2"
      }`}
    >
      {side === "left" ? (
        <ChevronLeft className="h-5 w-5" />
      ) : (
        <ChevronRight className="h-5 w-5" />
      )}
    </motion.button>
  );
}
