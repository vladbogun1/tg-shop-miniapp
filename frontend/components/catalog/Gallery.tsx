"use client";

/**
 * Gallery — product image carousel for the fullscreen product view.
 *
 * - ‹ › arrow buttons overlaid on the sides (disabled at first/last).
 * - Dot indicators along the bottom.
 * - Pointer-drag swipe (framer-motion) to move between slides.
 * - Uses the custom imgproxy <Image>; handles the no-image case (placeholder).
 */
import { motion, type PanInfo } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Image } from "@/lib/image";
import type { ProductImage } from "@/lib/api";

export function Gallery({
  images,
  alt,
}: {
  images?: ProductImage[];
  alt: string;
}) {
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
    setSlide((s) => Math.max(0, Math.min(slides.length - 1, next)));
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -60) go(slide + 1);
    else if (info.offset.x > 60) go(slide - 1);
  };

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-[var(--r-lg)]">
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
              alt={`${alt} — фото ${i + 1}`}
              size={1000}
              priority={i === 0}
              className="h-full w-full"
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

          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Фото ${i + 1}`}
                onClick={() => go(i)}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: i === slide ? 18 : 6,
                  background: i === slide ? "var(--accent)" : "rgba(255,255,255,.5)",
                }}
              />
            ))}
          </div>
        </>
      )}
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
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.9 }}
      disabled={disabled}
      onClick={onClick}
      aria-label={side === "left" ? "Предыдущее фото" : "Следующее фото"}
      className={`glass glass--strong absolute top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-[var(--r-pill)] text-[var(--text)] transition-opacity disabled:opacity-30 ${
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
