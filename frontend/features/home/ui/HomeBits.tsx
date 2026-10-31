"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";

/** Horizontal scroller with mouse drag + wheel-to-horizontal (desktop). Touch
 *  keeps native overflow scrolling (drag is mouse-only). */
export function DragScroll({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const st = useRef({ down: false, startX: 0, startLeft: 0, moved: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Wheel → horizontal scroll (desktop).
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0 || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });

    // Drag-scroll via window listeners (NO pointer capture — capture would steal the
    // click from the chips, making tags unselectable). We only start scrolling after
    // a small movement threshold, so a plain click still selects a tag.
    const onMove = (e: PointerEvent) => {
      if (!st.current.down) return;
      const dx = e.clientX - st.current.startX;
      if (Math.abs(dx) > 5) st.current.moved = true;
      if (st.current.moved) el.scrollLeft = st.current.startLeft - dx;
    };
    const onUp = () => {
      if (!st.current.down) return;
      st.current.down = false;
      el.style.cursor = "grab";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      // userSelect:none stops text selection while dragging; touch keeps native scroll.
      style={{ cursor: "grab", userSelect: "none", touchAction: "pan-x" }}
      onPointerDown={(e) => {
        if (e.pointerType !== "mouse") return; // touch/pen → native overflow scroll + tap
        const el = ref.current!;
        st.current = { down: true, startX: e.clientX, startLeft: el.scrollLeft, moved: false };
        el.style.cursor = "grabbing";
      }}
      onClickCapture={(e) => {
        // Swallow the click only if this was a real drag; a plain click reaches the chip.
        if (st.current.moved) {
          e.preventDefault();
          e.stopPropagation();
          st.current.moved = false;
        }
      }}
    >
      {children}
    </div>
  );
}

export function Chip({ children, active, onClick, small }: { children: ReactNode; active: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`nb-chip nb-press shrink-0 whitespace-nowrap ${small ? "min-h-[32px] px-3 py-1 text-[12px]" : "min-h-[38px] px-4 py-1.5 text-[13px]"} ${active ? "nb-chip-active" : ""}`}
    >
      {children}
    </button>
  );
}

export function NbButton({ children, onClick, loading }: { children: ReactNode; onClick: () => void; loading?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="nb-accent nb-press tap nb-up px-6 py-3 text-[14px] disabled:opacity-60"
    >
      {loading ? "…" : children}
    </button>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  children,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="nb hud-frame mx-auto mt-10 flex max-w-[340px] flex-col items-center gap-3 px-6 py-10 text-center"
    >
      <span className="grid h-16 w-16 place-items-center rounded-[var(--r-card)] border border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--accent)]">
        {icon}
      </span>
      <h2 className="nb-up text-[18px] font-extrabold text-[var(--ink)]">{title}</h2>
      <p className="max-w-[260px] text-[13px] text-[var(--muted)]">{text}</p>
      {children}
    </motion.div>
  );
}
