"use client";

/**
 * Review panel of one card (right drawer; a full-screen sheet from the bottom on a phone): what the
 * LAST AI import changed — category / brand «было → стало», characteristics with the AI's
 * confidence (least sure first) and sources, texts ru/uk/en «было / стало» editable in place — who
 * reviewed it and when. «Принять» saves the edits and makes the card READY, then the next card of
 * the list opens. Keys: J / K — next / previous, A — accept, Esc — close (lib/overlay-stack).
 * `docked` (≥ 1280 px): the panel is a column next to the list (master-detail) — no backdrop and no page-scroll
 * lock, the list stays clickable; it still takes part in the overlay stack, so Esc / J / K / A work the same.
 *
 * Data: GET /api/admin/cards/{id}/review (card_meta.last + reviewer name + current uk/en texts),
 * PUT …/accept (edits + READY), PATCH …/card-status (back to «Проверить»).
 */
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CardItem } from "../../model/item";
import type { CardSchema } from "../../model/schema";
import { cn } from "@/lib/cn";
import { useStickyFit } from "@/lib/use-sticky-fit";
import { backdropVariants, drawerVariants, PresenceLayer, sheetVariants, useOpenKey, useOverlayLayer } from "@shop/ui/overlay";
import { useMediaQuery } from "@shop/ui/use-media";
import { useConfirm } from "@shop/ui/confirm";
import { PanelBody } from "./PanelBody";

export function ReviewPanel({
  item,
  schema,
  position,
  onPrev,
  onNext,
  onClose,
  onDone,
  onReAi,
  docked = false,
}: {
  /** The list row (instant header while the review loads); null = closed. */
  item: CardItem | null;
  schema: CardSchema | undefined;
  /** 1-based place in the list and its length. */
  position: { index: number; total: number };
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
  /** The card left the current tab (accepted / sent back): open the next one. */
  onDone: () => void;
  /** «Переоформить с ИИ» — the single-product completion modal. */
  onReAi: (id: string) => void;
  /** Рядом со списком, а не поверх него. */
  docked?: boolean;
}) {
  const open = !!item;
  const phone = useMediaQuery("(max-width: 639px)", false);
  const confirm = useConfirm();
  const [dirty, setDirty] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  useStickyFit(asideRef, docked && open);

  // Leaving with unsaved edits asks first (Esc, ×, backdrop, J/K, the arrows).
  const guarded = useCallback(
    async (action: (() => void) | null) => {
      if (!action) return;
      if (dirty && !(await confirm({ title: "Правки не сохранены", message: "Уйти без сохранения? Изменения в этой карточке пропадут.", confirmLabel: "Уйти", danger: true })))
        return;
      setDirty(false);
      action();
    },
    [dirty, confirm]
  );
  const layer = useOverlayLayer(open, () => void guarded(onClose), { lockScroll: !docked });
  const session = useOpenKey(open);

  const body = item && (
    <PanelBody
      key={item.id}
      layer={layer}
      item={item}
      schema={schema}
      position={position}
      onPrev={onPrev ? () => void guarded(onPrev) : null}
      onNext={onNext ? () => void guarded(onNext) : null}
      onClose={() => void guarded(onClose)}
      onDone={() => {
        setDirty(false);
        onDone();
      }}
      onReAi={() => void guarded(() => onReAi(item.id))}
      onDirty={setDirty}
    />
  );

  if (docked) {
    if (!item) return null;
    return (
      <aside
        ref={asideRef}
        aria-label={`Проверка карточки: ${item.title}`}
        className="sticky top-[calc(var(--hdr-h,61px)+12px)] flex h-[calc(100dvh-var(--hdr-h,61px)-24px)] min-h-[480px] flex-col overflow-hidden rounded-[var(--r-xl)] border border-[var(--line-strong)] bg-[var(--surface)] shadow-[var(--shadow-2)]"
      >
        {body}
      </aside>
    );
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <AnimatePresence>
        {open && (
          <PresenceLayer key={session} name="cards-review" className="fixed inset-0 z-[120]">
            <motion.div
              variants={backdropVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              onClick={() => void guarded(onClose)}
              className="absolute inset-0 bg-black/45 backdrop-blur-[3px]"
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label={`Проверка карточки: ${item.title}`}
              variants={phone ? sheetVariants : drawerVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className={cn(
                "absolute flex flex-col bg-[var(--surface)] shadow-[var(--shadow-3)]",
                phone ? "inset-0" : "inset-y-0 right-0 w-full max-w-[720px] rounded-l-[var(--r-xl)] border-l border-[var(--line-strong)]"
              )}
            >
              {body}
            </motion.aside>
          </PresenceLayer>
        )}
      </AnimatePresence>

    </>,
    document.body
  );
}
