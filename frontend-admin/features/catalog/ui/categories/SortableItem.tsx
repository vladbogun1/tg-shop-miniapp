"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Строка дерева, которую можно перетащить: `<li>` с трансформацией dnd-kit и ручкой-захватом,
 * которую получает содержимое. Ручка — единственное, что начинает перетаскивание (в строке много кнопок),
 * на телефоне — долгое нажатие на неё; с клавиатуры — пробел и стрелки.
 */
export function SortableItem({
  id,
  name,
  disabled,
  children,
}: {
  id: string;
  name: string;
  disabled: boolean;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const handle = disabled ? null : (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Перетащить «${name}»`}
      title="Перетащить: изменить порядок"
      className="focusable grid h-8 w-6 shrink-0 cursor-grab touch-none place-items-center rounded-[var(--r-sm)] text-[var(--text-faint)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] active:cursor-grabbing pointer-coarse:h-11 pointer-coarse:w-8"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative list-none", isDragging && "z-20 opacity-90 shadow-lg")}
    >
      {children(handle)}
    </li>
  );
}
