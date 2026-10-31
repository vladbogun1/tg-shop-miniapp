"use client";

import { AnimatePresence, motion, type PanInfo, useDragControls, useReducedMotion } from "framer-motion";
import { SlidersHorizontal, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { activeFilterCount, type CatalogFilter } from "@shop/core/catalog";
import { noFadeFlash } from "@shop/ui/motion";
import { useI18n } from "@/i18n/context";
import { type CatalogState, hasFilters } from "@/features/catalog";
import { useEscape, useHydrated, useScrollLock } from "@/lib/hooks";
import { headerHeight, toResults, useMedia, useNav, StateLink } from "./CatalogNav";
import { FacetPanel } from "./FacetPanel";

export function useSmartStickyTop(ref: React.RefObject<HTMLElement | null>): number | null {
  const [top, setTop] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const calc = () => {
      if (!el.offsetHeight) return; // hidden below 1280
      setTop(Math.min(headerHeight() + 16, window.innerHeight - el.offsetHeight - 16));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    window.addEventListener("resize", calc);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", calc);
    };
  }, [ref]);
  return top;
}

/** The right column from 1280 px: the panel without its own scroll, plus the draft callout. */
export function FilterSidebar({ hint, resetState }: { hint?: boolean; /** The state without filters, or null when nothing is set. */ resetState: CatalogState | null }) {
  const { t } = useI18n();
  const { applied } = useNav();
  const wrap = useRef<HTMLDivElement>(null);
  const top = useSmartStickyTop(wrap);
  const active = activeFilterCount(applied.filter);
  return (
    <div ref={wrap} className="sticky top-[calc(var(--header-h)+16px)]" style={top != null ? { top } : undefined}>
      <div className="nb px-4 pb-2 pt-3">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] pb-3">
          <h2 className="eyebrow flex items-center gap-2 text-[11px]">
            <span aria-hidden className="h-[2px] w-3 bg-[var(--accent)]" />
            {active > 0 ? t("catalog.filtersN", { n: active }) : t("catalog.filters")}
          </h2>
          {resetState && (
            <StateLink state={resetState} className="link-ink text-[12px] font-semibold text-[var(--muted)]">
              {t("catalog.resetAll")}
            </StateLink>
          )}
        </div>
        <FacetPanel hint={hint} />
      </div>
      <DraftCallout wrap={wrap} />
    </div>
  );
}

export const applyBtn = "flex h-11 items-center justify-center whitespace-nowrap px-4 font-display text-[13px] font-bold uppercase tracking-[.06em]";
export const applyOff = "chamfer cursor-not-allowed bg-[var(--surface-2)] text-[var(--faint)] border border-[var(--line-strong)]";

/** Vertical position of the changed row inside the panel wrapper (and whether it is on screen). */
function useCalloutPos(show: boolean, anchor: Element | null | undefined, view: unknown, wrap: React.RefObject<HTMLDivElement | null>) {
  const [pos, setPos] = useState<{ top: number; onScreen: boolean } | null>(null);

  useLayoutEffect(() => {
    const box = wrap.current;
    if (!show || !box) return;
    const measure = () => {
      if (!anchor || !anchor.isConnected || !box.contains(anchor)) return setPos(null);
      const a = anchor.getBoundingClientRect();
      const w = box.getBoundingClientRect();
      setPos({ top: Math.round(a.top - w.top + a.height / 2), onScreen: a.bottom > headerHeight() + 8 && a.top < window.innerHeight - 8 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [show, anchor, view, wrap]);
  return pos;
}

/**
 * Desktop: after a change, a callout to the left of the panel points at the changed row with
 * «Показати N» and «Скасувати»; it follows the last change and stays until one of them (or Esc).
 * When that row is off screen, a bar pinned to the bottom of the screen takes over.
 */
export function DraftCallout({ wrap }: { wrap: React.RefObject<HTMLDivElement | null> }) {
  const { t } = useI18n();
  const { dirty, pending, anchor, view, apply, cancel } = useNav();
  const desk = useMedia("(min-width: 1280px)");
  const reduce = useReducedMotion();
  const show = desk && dirty && !pending;
  const pos = useCalloutPos(show, anchor, view, wrap);
  useEscape(show, cancel);

  const total = view?.total ?? 0;
  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 460, damping: 36 };
  const inline = show && pos?.onScreen;
  const bar = show && !pos?.onScreen;

  return (
    <>
      <AnimatePresence>
        {inline && (
          <InlineCallout top={pos.top} total={total} spring={spring} reduce={!!reduce} apply={apply} cancel={cancel} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {bar && (
          <BottomBar total={total} spring={spring} apply={apply} cancel={cancel} />
        )}
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------- drawer (< 1280 px)

/**
 * «Фільтри (N)» below 1280 px (from 1280 the same panel is the right column). Opens a right drawer
 * on tablets/small laptops and a full-screen sheet on phones. Choices edit the draft — «Знайдено N»
 * in the head and «Показати N товарів» at the foot are recounted live — and leaving the drawer in
 * any way (the button, the cross, Esc, the backdrop, a swipe) applies it and returns to the list.
 */
/** Swipe down (sheet) or right (drawer) far or fast enough closes the drawer. */
function swipeToClose(wide: boolean, close: () => void) {
  return (_: unknown, info: PanInfo) => {
    const d = wide ? info.offset.x : info.offset.y;
    const v = wide ? info.velocity.x : info.velocity.y;
    if (d > 120 || v > 600) close();
  };
}

export function FiltersDrawer({ active, hint }: { active: number; hint?: boolean }) {
  const { t } = useI18n();
  const { pending, dirty, draft, view, setDraft, apply } = useNav();
  const wide = useMedia("(min-width: 768px)");
  const reduce = useReducedMotion();
  const drag = useDragControls();
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => {
    setOpen(false);
    if (dirty) apply();
  }, [dirty, apply]);
  useScrollLock(open);
  useEscape(open, close);
  const total = view?.total ?? 0;
  const onDragEnd = swipeToClose(wide, close);

  return (
    <>
      <FiltersButton active={active} open={open} onOpen={() => setOpen(true)} />
      {/* Portal: the trigger sits in the sticky row, whose backdrop-filter would trap position:fixed. */}
      {hydrated && createPortal(
        <AnimatePresence>
          {open && wide && (
            <motion.div
              key="backdrop"
              {...noFadeFlash}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={close}
              aria-hidden
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[6px] xl:hidden"
            />
          )}
          {open && (
            <motion.div
              key="panel"
              {...noFadeFlash}
              role="dialog"
              aria-modal="true"
              aria-label={t("catalog.filters")}
              initial={wide ? { x: "100%" } : { y: "100%" }}
              animate={wide ? { x: 0 } : { y: 0 }}
              exit={wide ? { x: "100%" } : { y: "100%" }}
              transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 340, damping: 36 }}
              drag={wide ? "x" : "y"}
              dragListener={false}
              dragControls={drag}
              dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }}
              dragElastic={wide ? { left: 0, right: 0.9 } : { top: 0, bottom: 0.9 }}
              onDragEnd={onDragEnd}
              className={`fixed z-50 flex flex-col bg-[var(--bg)] xl:hidden ${
                wide ? "inset-y-0 right-0 w-[400px] max-w-[90vw] border-l border-[var(--line-strong)] shadow-[-24px_0_60px_rgba(0,0,0,.5)]" : "inset-0"
              }`}
            >
              <DrawerHead active={active} total={total} wide={wide} drag={drag} close={close} />
              <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-1">
                <FacetPanel hint={hint} />
              </div>
              <DrawerFoot dirty={dirty} total={total} pending={pending} draft={draft} setDraft={setDraft} close={close} onShowList={() => { setOpen(false); requestAnimationFrame(toResults); }} />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

function DrawerHead({ active, total, wide, drag, close }: { active: number; total: number; wide: boolean; drag: ReturnType<typeof useDragControls>; close: () => void }) {
  const { t } = useI18n();
  return (
    <>
      {/* the head is the drag handle: swipe down (sheet) / right (drawer) to close */}
      <div onPointerDown={(e) => drag.start(e)} className="relative flex touch-none items-center justify-between gap-3 border-b border-[var(--line)] px-4 pb-3 pt-4 select-none">
        {!wide && <span aria-hidden className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-[var(--line-strong)]" />}
        <div className="min-w-0">
          <p className="font-display text-[18px] font-extrabold uppercase leading-tight text-[var(--ink)]">
            {active > 0 ? t("catalog.filtersN", { n: active }) : t("catalog.filters")}
          </p>
          <p aria-live="polite" className="mt-0.5 flex items-center gap-2 text-[13px] font-medium text-[var(--muted)]">
            <span aria-hidden className="tech-mark" />
            {t("catalog.found", { n: total })}
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={t("common.close")}
          className="tap grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
        >
          <X className="h-5 w-5" strokeWidth={2.25} />
        </button>
      </div>
    </>
  );
}

function DrawerFoot({ dirty, total, pending, draft, setDraft, close, onShowList }: { dirty: boolean; total: number; pending: boolean; draft: CatalogFilter; setDraft: (f: CatalogFilter) => void; close: () => void; onShowList: () => void }) {
  const { t } = useI18n();
  const blocked = dirty && total === 0;
  return (
      <div className="flex gap-2 border-t border-[var(--line)] bg-[var(--surface)] px-4 pb-[calc(12px+var(--safe-bottom))] pt-3">
        {hasFilters(draft) && (
          <button
            type="button"
            onClick={() => setDraft({ q: draft.q })}
            className="tap flex h-12 shrink-0 items-center rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-4 font-display text-[13px] font-bold uppercase tracking-[.06em] text-[var(--ink)]"
          >
            {t("catalog.resetAll")}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            return dirty ? close() : onShowList();
          }}
          disabled={blocked}
          aria-busy={pending}
          className={`flex h-12 flex-1 items-center justify-center rounded-[var(--r)] font-display text-[14px] font-bold uppercase tracking-[.06em] ${
            blocked ? applyOff : "nb-accent nb-press"
          }`}
        >
          {pending ? t("common.loading") : blocked ? t("catalog.empty.title") : t("catalog.showN", { n: total })}
        </button>
      </div>
  );
}

function FiltersButton({ active, open, onOpen }: { active: number; open: boolean; onOpen: () => void }) {
  const { t } = useI18n();
  return (
  <button
    type="button"
    onClick={onOpen}
    aria-expanded={open}
    className={`nb-press tap flex h-11 shrink-0 items-center gap-2 rounded-[var(--r)] border px-4 font-display text-[13px] font-bold uppercase tracking-[.06em] xl:hidden ${
      active > 0 ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]" : "border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)]"
    }`}
  >
    <SlidersHorizontal className="h-4 w-4" strokeWidth={2.25} />
    {active > 0 ? t("catalog.filtersN", { n: active }) : t("catalog.filters")}
  </button>
  );
}

type Spring = { duration: number } | { type: "spring"; stiffness: number; damping: number };

function InlineCallout({ top, total, spring, reduce, apply, cancel }: { top: number; total: number; spring: Spring; reduce: boolean; apply: () => void; cancel: () => void }) {
  const { t } = useI18n();
  return (
    <motion.div
      key="callout"
      role="group"
      aria-label={t("catalog.draftChanged")}
      initial={{ opacity: 0, x: 10, y: "-50%", top: top }}
      animate={{ opacity: 1, x: 0, y: "-50%", top: top }}
      exit={{ opacity: 0, x: 10, transition: { duration: reduce ? 0 : 0.12 } }}
      transition={spring}
      className="absolute right-[calc(100%+14px)] z-30"
    >
      <div className="relative flex items-center gap-1.5 rounded-[var(--r-card)] border border-[var(--line-strong)] bg-[var(--surface-2)] p-1.5 shadow-[0_18px_44px_-10px_rgba(0,0,0,.75)]">
        <span aria-hidden className="absolute -right-[7px] top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border-r border-t border-[var(--line-strong)] bg-[var(--surface-2)]" />
        <button
          type="button"
          onClick={apply}
          disabled={total === 0}
          className={`${applyBtn} ${total > 0 ? "nb-accent nb-press" : applyOff}`}
        >
          {total > 0 ? t("catalog.showN", { n: total }) : t("catalog.empty.title")}
        </button>
        <button
          type="button"
          onClick={cancel}
          className="h-11 rounded-[var(--r)] px-3 text-[13px] font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--ink)]"
        >
          {t("common.cancel")}
        </button>
      </div>
    </motion.div>
  );
}

function BottomBar({ total, spring, apply, cancel }: { total: number; spring: Spring; apply: () => void; cancel: () => void }) {
  const { t } = useI18n();
  return (
    <motion.div
      key="bar"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={spring}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[calc(16px+var(--safe-bottom))]"
    >
      <div
        role="group"
        aria-label={t("catalog.draftChanged")}
        className="pointer-events-auto flex items-center gap-1.5 rounded-[var(--r-card)] border border-[var(--line-strong)] bg-[var(--surface-2)] p-1.5 shadow-[0_18px_44px_-10px_rgba(0,0,0,.8)]"
      >
        <span className="flex items-center gap-2 px-2 text-[13px] font-medium text-[var(--muted)]">
          <span aria-hidden className="tech-mark" />
          {t("catalog.draftChanged")}
        </span>
        <button type="button" onClick={apply} disabled={total === 0} className={`${applyBtn} ${total > 0 ? "nb-accent nb-press" : applyOff}`}>
          {total > 0 ? t("catalog.applyN", { n: total }) : t("catalog.empty.title")}
        </button>
        <button
          type="button"
          onClick={cancel}
          aria-label={t("common.cancel")}
          className="grid h-11 w-11 place-items-center rounded-[var(--r)] text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--ink)]"
        >
          <X className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
    </motion.div>
  );
}
