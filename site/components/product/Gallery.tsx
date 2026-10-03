"use client";

/**
 * Product gallery: big photo with arrows (swipe on touch), a thumbnail strip, and a full-screen
 * lightbox on click (← → to browse, Esc to close). Adapted from the Mini App's carousel.
 */
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useT } from "@/i18n/context";
import { useEscape, useScrollLock } from "@/lib/hooks";
import { Image } from "@/lib/image";

export function Gallery({ images, alt }: { images: string[]; alt: string }) {
  const t = useT();
  const slides: (string | undefined)[] = images.length > 0 ? images : [undefined];
  const [slide, setSlide] = useState(0);
  const [zoom, setZoom] = useState(false);
  const multi = slides.length > 1;
  const go = useCallback(
    (n: number) => setSlide(((n % slides.length) + slides.length) % slides.length),
    [slides.length]
  );

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -60) go(slide + 1);
    else if (info.offset.x > 60) go(slide - 1);
  };

  return (
    <div className="min-w-0">
      <div className="nb relative aspect-square w-full overflow-hidden bg-[var(--surface-2)]">
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
            <button
              key={i}
              type="button"
              onClick={() => url && setZoom(true)}
              aria-label={t("gallery.zoom")}
              tabIndex={i === slide ? 0 : -1}
              className="h-full w-full shrink-0 cursor-zoom-in"
            >
              <Image
                src={url}
                alt={t("gallery.photo", { alt, n: i + 1 })}
                size={1000}
                fit={false}
                priority={i === 0}
                className="pointer-events-none h-full w-full"
              />
            </button>
          ))}
        </motion.div>

        {multi && (
          <>
            <ArrowBtn side="left" label={t("gallery.prev")} onClick={() => go(slide - 1)} />
            <ArrowBtn side="right" label={t("gallery.next")} onClick={() => go(slide + 1)} />
            <div className="nb-flat absolute bottom-3 left-3 bg-[var(--surface)] px-2.5 py-1 text-[12px] font-black text-[var(--ink)]">
              {slide + 1} / {slides.length}
            </div>
          </>
        )}
        {slides[slide] && (
          <button
            type="button"
            onClick={() => setZoom(true)}
            aria-label={t("gallery.zoom")}
            className="nb-flat absolute right-3 top-3 grid h-10 w-10 place-items-center bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--c3)]"
          >
            <Maximize2 className="h-4 w-4" strokeWidth={2.75} />
          </button>
        )}
      </div>

      {multi && (
        <ul className="no-scrollbar mt-3 flex gap-2 overflow-x-auto p-0.5 pb-2">
          {slides.map((url, i) => (
            <li key={i} className="shrink-0">
              <button
                type="button"
                onClick={() => go(i)}
                aria-label={t("gallery.thumb", { n: i + 1 })}
                aria-current={i === slide ? "true" : undefined}
                className={`block h-[72px] w-[72px] overflow-hidden rounded-[var(--r)] border-[3px] transition-transform sm:h-20 sm:w-20 ${
                  i === slide
                    ? "border-[var(--accent)] shadow-[3px_3px_0_var(--shadow)]"
                    : "border-[var(--line)] opacity-75 hover:opacity-100"
                }`}
              >
                <Image src={url} alt="" size={160} className="h-full w-full" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Lightbox
        open={zoom}
        onClose={() => setZoom(false)}
        slides={slides}
        index={slide}
        go={go}
        alt={alt}
      />
    </div>
  );
}

function ArrowBtn({ side, label, onClick }: { side: "left" | "right"; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`nb-flat absolute top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--c3)] ${
        side === "left" ? "left-3" : "right-3"
      }`}
    >
      {side === "left" ? <ChevronLeft className="h-5 w-5" strokeWidth={3} /> : <ChevronRight className="h-5 w-5" strokeWidth={3} />}
    </button>
  );
}

function Lightbox({
  open,
  onClose,
  slides,
  index,
  go,
  alt,
}: {
  open: boolean;
  onClose: () => void;
  slides: (string | undefined)[];
  index: number;
  go: (n: number) => void;
  alt: string;
}) {
  const t = useT();
  useScrollLock(open);
  useEscape(open, onClose);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(index + 1);
      if (e.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, index, go]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4"
        >
          <button
            type="button"
            autoFocus
            onClick={onClose}
            aria-label={t("common.close")}
            className="absolute right-4 top-4 z-10 grid h-12 w-12 place-items-center rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shadow-[4px_4px_0_var(--accent)]"
          >
            <X className="h-6 w-6" strokeWidth={3} />
          </button>
          {slides.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  go(index - 1);
                }}
                aria-label={t("gallery.prev")}
                className="absolute left-4 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]"
              >
                <ChevronLeft className="h-6 w-6" strokeWidth={3} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  go(index + 1);
                }}
                aria-label={t("gallery.next")}
                className="absolute right-4 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]"
              >
                <ChevronRight className="h-6 w-6" strokeWidth={3} />
              </button>
            </>
          )}
          <motion.div
            key={index}
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="max-h-[88dvh] max-w-[min(92vw,1100px)]"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={slides[index]}
              alt={t("gallery.photo", { alt, n: index + 1 })}
              size={1600}
              fit
              className="max-h-[88dvh] max-w-full border-[3px] border-[var(--line)]"
            />
          </motion.div>
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-[var(--r)] border-[2.5px] border-[var(--line)] bg-[var(--surface)] px-3 py-1 text-[13px] font-black text-[var(--ink)]">
            {index + 1} / {slides.length}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
