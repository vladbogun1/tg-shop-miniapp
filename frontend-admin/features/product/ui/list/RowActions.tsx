"use client";

/**
 * Меню «⋯» строки товара: Редактировать · Оформить с ИИ (черновик) · В архив. Общий `ActionMenu`: от 1024 px —
 * список у кнопки, уже — нижняя шторка (та же граница, что у остальных «⋯» админки).
 * В архиве вместо меню — кнопка «Восстановить».
 */
import { Archive, ArchiveRestore, Pencil, Wand2 } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { ActionMenu, type MenuItem } from "@/components/ui/ActionMenu";
import { isUnfinished } from "../../model/stock";
import type { AdminProduct } from "../../model/types";

export interface RowActionsProps {
  p: AdminProduct;
  archivedView: boolean;
  onEdit: () => void;
  onComplete: () => void;
  onArchive: (archived: boolean) => void;
}

/** «Оформить с ИИ» нужен черновику и только что созданному (короткой формой) товару. */
export const needsCompletion = (p: AdminProduct): boolean => isUnfinished(p) || (p.cardStatus ?? "DRAFT") === "DRAFT";

function items({ p, onEdit, onComplete, onArchive }: RowActionsProps): MenuItem[] {
  return [
    ...(needsCompletion(p) ? [{ key: "ai", label: "Оформить с ИИ", icon: <Wand2 className="h-4 w-4" />, onSelect: onComplete }] : []),
    { key: "edit", label: "Редактировать", icon: <Pencil className="h-4 w-4" />, onSelect: onEdit },
    { key: "archive", label: "В архив", icon: <Archive className="h-4 w-4" />, danger: true, onSelect: () => onArchive(true) },
  ];
}

export function RowActions(props: RowActionsProps) {
  const { p, archivedView, onArchive } = props;

  if (archivedView) {
    return (
      <Button size="sm" variant="surface" icon={<ArchiveRestore className="h-4 w-4" />} onClick={(e) => (e.stopPropagation(), onArchive(false))}>
        Восстановить
      </Button>
    );
  }
  // Клик по «⋯» и пунктам (портал всплывает по дереву React) не открывает саму строку.
  return (
    <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
      <ActionMenu title={p.title} items={items(props)} label="Действия" />
    </span>
  );
}
