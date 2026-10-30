"use client";

import { Button } from "@shop/ui/admin-button";
import { AnimatePresence, motion } from "framer-motion";
import { Save, Undo2 } from "lucide-react";

interface Props {
  count: number;
  invalid: boolean;
  saving: boolean;
  onDiscard: () => void;
  onSave: () => void;
}

/** Панель сохранения — только пока есть что сохранять. */
export function SaveBar({ count, invalid, saving, onDiscard, onSave }: Props) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          // Над нижней панелью телефона (--bottom-nav), она уже закрывает отступ home-indicator.
          // Sticky внутри колонки контента (не fixed к окну): следует за шириной сайдбара.
          style={{ bottom: "calc(var(--bottom-nav) + 12px)" }}
          className="elevated sticky z-[55] mt-6 px-4 py-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 text-[13px] font-semibold text-[var(--text)]">
              Несохранённых изменений: {count}
              {invalid && <span className="block text-[12px] font-semibold text-[var(--danger-ink)]">Исправьте поля с ошибками</span>}
            </div>
            <div className="flex flex-1 justify-end gap-2 sm:flex-none">
              <Button variant="outline" icon={<Undo2 className="h-4 w-4" />} onClick={onDiscard} disabled={saving}>
                Отменить
              </Button>
              <Button variant="accent" icon={<Save className="h-4 w-4" />} loading={saving} disabled={invalid} onClick={onSave}>
                Сохранить
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
