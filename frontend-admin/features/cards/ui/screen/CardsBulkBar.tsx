"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCheck, Sparkles } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { BULK_ACCEPT_MIN, productsWord } from "../../model/view";
import type { CardsScreenState } from "./use-cards-screen";

function AcceptSure({ s }: { s: CardsScreenState }) {
  const n = s.bulkOk.length;
  return (
    <Button
      size="sm"
      variant="surface"
      icon={<CheckCheck className="h-4 w-4" />}
      loading={s.bulk.busy}
      disabled={!n}
      onClick={s.bulk.bulkAccept}
      title={
        n
          ? `Принять без просмотра карточки с уверенностью от ${BULK_ACCEPT_MIN} % и всеми обязательными полями`
          : `Среди выбранных нет карточек с уверенностью от ${BULK_ACCEPT_MIN} % и всеми обязательными полями — откройте и проверьте их`
      }
    >
      Принять уверенные ({n})
    </Button>
  );
}

/** Липкая панель над списком, пока что-то отмечено. */
export function CardsBulkBar({ s }: { s: CardsScreenState }) {
  const count = s.selected.size;
  return (
    <AnimatePresence initial={false}>
      {count > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
          className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-[var(--r-lg)] border border-[rgba(255,102,0,.35)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] px-3 py-2 shadow-[var(--shadow-2)] backdrop-blur"
        >
          <span className="text-[13px] font-semibold text-[var(--text)]">
            Выбрано {count} {productsWord(count)}
          </span>
          <span className="flex-1" />
          <Button size="sm" variant="ghost" onClick={() => s.setSelected(new Set())}>
            Снять выбор
          </Button>
          {s.current === "review" && <AcceptSure s={s} />}
          <Button size="sm" variant="accent" icon={<Sparkles className="h-4 w-4" />} onClick={s.openWizard} disabled={!s.schema}>
            Оформить с ИИ ({count})
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
