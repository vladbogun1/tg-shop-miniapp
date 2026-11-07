"use client";

import { Save, Undo2 } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { cn } from "@/lib/cn";

/** Панель «одно сохранение на всю страницу»: статус или причина блокировки, «Показать» (к строке с ошибкой), «Отменить», «Сохранить». */
export function PaymentSaveBar({
  dirty,
  blocker,
  saving,
  onShow,
  onDiscard,
  onSave,
}: {
  dirty: boolean;
  blocker: string | null;
  saving: boolean;
  onShow: (() => void) | null;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <div style={{ bottom: "calc(var(--bottom-nav) + 12px)" }} className="elevated sticky z-20 mt-4 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={cn("min-w-0 text-[13px] font-semibold", blocker && dirty ? "text-[var(--danger-ink)]" : "text-[var(--text-muted)]")}>
          {dirty ? (blocker ?? "Есть несохранённые изменения") : "Все изменения сохранены"}
        </span>
        <div className="flex flex-1 justify-end gap-2 sm:flex-none">
          {dirty && blocker && onShow && (
            <Button variant="ghost" onClick={onShow}>
              Показать
            </Button>
          )}
          {dirty && (
            <Button variant="outline" icon={<Undo2 className="h-4 w-4" />} onClick={onDiscard} disabled={saving}>
              Отменить
            </Button>
          )}
          <Button variant="accent" loading={saving} disabled={!dirty || !!blocker} icon={<Save className="h-4 w-4" />} onClick={onSave}>
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  );
}
