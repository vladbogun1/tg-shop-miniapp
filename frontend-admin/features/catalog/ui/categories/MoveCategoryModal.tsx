"use client";

import { FolderInput } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@shop/ui/admin-button";
import { Modal } from "@shop/ui/overlay";
import { moveTargets } from "../../model/tree-filter";
import type { AdminCategory } from "../../model/types";

/**
 * «Переместить в…» (одну категорию или несколько из панели выбора): «Сделать корневой» первой строкой, затем корни.
 * Недоступные строки серые, с причиной (в корне лежат товары, уже лежит здесь, это сама категория).
 * Корень с подкатегориями не переносится — дерево двухуровневое.
 */
export function MoveCategoryModal({
  moving,
  categories,
  onClose,
  onMove,
}: {
  moving: AdminCategory[] | null;
  categories: AdminCategory[];
  onClose: () => void;
  onMove: (moving: AdminCategory[], parentId: string | null) => void;
}) {
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => setTarget(null), [moving]);
  const info = useMemo(() => moveTargets(categories, moving ?? []), [categories, moving]);
  const one = moving?.length === 1 ? moving[0] : null;
  const anyFree = info.targets.some((t) => !t.reason);

  return (
    <Modal
      open={!!moving}
      onClose={onClose}
      size="sm"
      title={one ? `Переместить «${one.name}»` : `Переместить категорий: ${moving?.length ?? 0}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="accent"
            icon={<FolderInput className="h-4 w-4" />}
            disabled={target === null || info.movable.length === 0}
            onClick={() => target !== null && onMove(info.movable, target || null)}
          >
            Переместить{info.movable.length > 1 ? ` ${info.movable.length}` : ""}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {info.blocked.length > 0 && (
          <p className="rounded-[var(--r-md)] bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] px-3 py-2 text-[12.5px] leading-snug text-[var(--text)]">
            Не переместятся: {info.blocked.map((b) => `«${b.name}»`).join(", ")} — у них есть подкатегории, а вложенность только в два уровня.
          </p>
        )}
        {!anyFree || info.movable.length === 0 ? (
          <p className="text-[14px] text-[var(--text-muted)]">Некуда перемещать: подходящих категорий нет.</p>
        ) : (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="field-label mb-1">Куда</legend>
            {info.targets.map((t) => (
              <label
                key={t.value || "root"}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-[var(--r-md)] border px-3 py-2 text-[14px]",
                  t.reason ? "cursor-not-allowed border-[var(--line)] opacity-55" : "cursor-pointer hover:bg-[var(--surface-hover)]",
                  target === t.value ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)]"
                )}
              >
                <input
                  type="radio"
                  name="move-target"
                  className="accent-[var(--accent)]"
                  disabled={!!t.reason}
                  checked={target === t.value}
                  onChange={() => setTarget(t.value)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-[var(--text)]">{t.label}</span>
                  {t.reason && <span className="block text-[12px] text-[var(--text-faint)]">нельзя: {t.reason}</span>}
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <p className="text-[12px] leading-relaxed text-[var(--text-faint)]">
          Товары и адреса /catalog/… не меняются. Характеристики нового родителя добавятся к собственным.
        </p>
      </div>
    </Modal>
  );
}
