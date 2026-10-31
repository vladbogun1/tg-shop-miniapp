"use client";

/**
 * Review panel of one card (right drawer; a full-screen sheet from the bottom on a phone): what the
 * LAST AI import changed — category / brand «было → стало», characteristics with the AI's
 * confidence (least sure first) and sources, texts ru/uk/en «было / стало» editable in place — who
 * reviewed it and when. «Принять» saves the edits and makes the card READY, then the next card of
 * the list opens. Keys: J / K — next / previous, A — accept, Esc — close (lib/overlay-stack).
 *
 * Data: GET /api/admin/cards/{id}/review (card_meta.last + reviewer name + current uk/en texts),
 * PUT …/accept (edits + READY), PATCH …/card-status (back to «Проверить»).
 */
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import type { CardItem } from "../../model/item";
import type { CardSchema } from "../../model/schema";
import { cn } from "@/lib/cn";
import { backdropVariants, drawerVariants, sheetVariants, useOverlayLayer } from "@shop/ui/overlay";
import { useMediaQuery } from "@shop/ui/use-media";
import { useConfirm } from "@shop/ui/confirm";
import { PanelBody } from "./PanelBody";
import { PanelLayer } from "./PanelLayer";

export function ReviewPanel({
  item,
  schema,
  position,
  onPrev,
  onNext,
  onClose,
  onDone,
  onReAi,
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
}) {
  const open = !!item;
  const phone = useMediaQuery("(max-width: 639px)", false);
  const confirm = useConfirm();
  const [dirty, setDirty] = useState(false);

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
  const layer = useOverlayLayer(open, () => void guarded(onClose));

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <AnimatePresence>
        {open && (
          <PanelLayer>
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
            </motion.aside>
          </PanelLayer>
        )}
      </AnimatePresence>

    </>,
    document.body
  );
}
