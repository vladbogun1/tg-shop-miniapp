"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Archive, Eye, EyeOff } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import type { ReactNode } from "react";

/**
 * Панель в липкой полосе, пока что-то отмечено: показать · скрыть · в архив · снять выбор.
 * Свои действия — одной строкой (на телефоне иконками: в три ряда она съедала треть экрана под липкой шапкой);
 * чужие кнопки (`extra`) на телефоне — второй строкой под ними, на ПК — справа в той же строке.
 */
export function ProductsBulkBar({
  count,
  busy,
  onShow,
  onHide,
  onArchive,
  onClear,
  extra,
}: {
  count: number;
  busy: boolean;
  onShow: () => void;
  onHide: () => void;
  onArchive: () => void;
  onClear: () => void;
  /** Кнопки чужих фич (например, «Заполнить с ИИ») перед «Показать». */
  extra?: ReactNode;
}) {
  return (
    <AnimatePresence initial={false}>
      {count > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
          className="mt-2 flex flex-col gap-2 rounded-[var(--r-lg)] border border-[rgba(255,102,0,.35)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] px-3 py-2 shadow-[var(--shadow-2)] backdrop-blur sm:flex-row sm:items-center"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="whitespace-nowrap text-[13px] font-semibold text-[var(--text)]">Выбрано {count}</span>
            <span className="flex-1" />
            <Button size="sm" variant="ghost" onClick={onClear} disabled={busy}>
              Снять
            </Button>
            <Button size="sm" variant="surface" icon={<Eye className="h-4 w-4" />} loading={busy} onClick={onShow} aria-label="Показать" title="Карточки-черновики и товары без цены сервер не пропустит — они попадут в отчёт" compactBelow="sm">
              Показать
            </Button>
            <Button size="sm" variant="surface" icon={<EyeOff className="h-4 w-4" />} disabled={busy} onClick={onHide} aria-label="Скрыть" compactBelow="sm">
              Скрыть
            </Button>
            <Button size="sm" variant="surface" icon={<Archive className="h-4 w-4" />} disabled={busy} onClick={onArchive} aria-label="В архив" compactBelow="sm">
              В архив
            </Button>
          </div>
          {extra && <div className="flex flex-wrap justify-end gap-2">{extra}</div>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
