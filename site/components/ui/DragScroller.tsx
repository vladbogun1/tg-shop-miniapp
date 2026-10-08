"use client";

/**
 * Horizontal chip scroller, the site twin of the Mini App's DragScroll (frontend/app/page.tsx):
 * native overflow scrolling with scroll-snap and no visible scrollbar; on desktop a mouse drag
 * scrolls it (after a 5px threshold, and the click that ends a drag is swallowed so no chip opens
 * by accident) and the vertical wheel scrolls it sideways. The overflowing edge fades out, and the
 * element marked `data-active` is brought into view on mount — without moving the page.
 */
import { useEffect, useRef, useState } from "react";

export function DragScroller({ children, className = "", label }: { children: React.ReactNode; className?: string; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const st = useRef({ down: false, startX: 0, startLeft: 0, moved: false });
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const max = el.scrollWidth - el.clientWidth;
      setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft < max - 4 });
    };
    // Active chip into view: scroll the row itself (scrollIntoView would also scroll the page).
    const active = el.querySelector<HTMLElement>("[data-active]");
    if (active) {
      const target = active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2;
      el.scrollLeft = Math.max(0, target);
    }
    measure();

    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (e.deltaY === 0 || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      if (!st.current.down) return;
      const dx = e.clientX - st.current.startX;
      if (Math.abs(dx) > 5 && !st.current.moved) {
        st.current.moved = true;
        // Snap fights a programmatic drag; switch it off until the drag ends.
        el.style.scrollSnapType = "none";
      }
      if (st.current.moved) el.scrollLeft = st.current.startLeft - dx;
    };
    const onUp = () => {
      if (!st.current.down) return;
      st.current.down = false;
      el.style.cursor = "";
      el.style.scrollSnapType = "";
    };
    el.addEventListener("scroll", measure, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("resize", measure);
    };
  }, []);

  const fade = 28;
  const mask =
    edges.left || edges.right
      ? `linear-gradient(to right, ${edges.left ? "transparent" : "#000"} 0, #000 ${edges.left ? fade : 0}px, #000 calc(100% - ${edges.right ? fade : 0}px), ${edges.right ? "transparent" : "#000"} 100%)`
      : undefined;

  return (
    <div
      ref={ref}
      role={label ? "group" : undefined}
      aria-label={label}
      className={`no-scrollbar snap-x snap-proximity overflow-x-auto ${className}`}
      style={{ maskImage: mask, WebkitMaskImage: mask, userSelect: "none", touchAction: "pan-x pan-y" }}
      onPointerDown={(e) => {
        if (e.pointerType !== "mouse" || e.button !== 0) return; // touch/pen: native scroll + tap
        const el = ref.current!;
        if (el.scrollWidth <= el.clientWidth) return;
        st.current = { down: true, startX: e.clientX, startLeft: el.scrollLeft, moved: false };
        el.style.cursor = "grabbing";
      }}
      onDragStart={(e) => e.preventDefault()}
      onClickCapture={(e) => {
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
