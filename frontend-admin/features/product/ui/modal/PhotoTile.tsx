"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Star, X } from "lucide-react";
import { Image } from "@/lib/image";
import { cn } from "@/lib/cn";

/** Pressing a control inside a photo must not start a drag (mouse, touch or Space/Enter). */
const noDrag = {
  onMouseDown: (e: React.SyntheticEvent) => e.stopPropagation(),
  onTouchStart: (e: React.SyntheticEvent) => e.stopPropagation(),
  onKeyDown: (e: React.SyntheticEvent) => e.stopPropagation(),
};

export function SortablePhoto({
  id,
  src,
  index,
  projectedIndex,
  total,
  dragging,
  justDropped,
  onRemove,
  onMakeCover,
}: {
  id: string;
  src: string;
  index: number;
  projectedIndex: number;
  total: number;
  dragging: boolean;
  justDropped: boolean;
  onRemove: () => void;
  onMakeCover: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const cover = projectedIndex === 0;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      aria-label={`Фото ${index + 1} из ${total}${index === 0 ? ", обложка" : ""}`}
      className={cn(
        "focusable group relative touch-manipulation select-none overflow-hidden rounded-[var(--r-lg)] border outline-none",
        isDragging ? "cursor-grabbing" : "cursor-grab",
        isDragging
          ? "border-dashed border-[var(--accent)] bg-[var(--accent-soft)]"
          : cover
            ? "border-[rgba(255,102,0,.45)]"
            : "border-[var(--line)] hover:border-[var(--border-2)]",
        justDropped && "photo-dropped",
      )}
    >
      <Image
        src={src}
        alt=""
        size={200}
        className={cn(
          "pointer-events-none aspect-square w-full transition-opacity",
          isDragging && "opacity-20",
        )}
      />

      {!isDragging && (
        <>
          {cover ? (
            <span className="font-display absolute left-1.5 top-1.5 rounded-[var(--r-md)] border border-[rgba(255,102,0,.45)] bg-[rgba(14,14,16,.8)] px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-[14px] tracking-[0.06em] text-[var(--accent-hi)] backdrop-blur-sm">
              обложка
            </span>
          ) : (
            <span className="absolute left-1.5 top-1.5 grid h-5 min-w-5 place-items-center rounded-[var(--r-sm)] bg-[rgba(14,14,16,.72)] px-1 text-[10.5px] font-semibold tabular-nums text-[var(--text-muted)] backdrop-blur-sm">
              {projectedIndex + 1}
            </span>
          )}

          {!dragging && (
            <>
              <button
                type="button"
                {...noDrag}
                onClick={onRemove}
                className="hit absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[rgba(14,14,16,.8)] text-[var(--text)] backdrop-blur-sm transition-colors hover:border-[color-mix(in_srgb,var(--danger)_55%,transparent)] hover:text-[var(--danger-ink)]"
                aria-label={`Удалить фото ${index + 1}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>

              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 border-t border-[var(--line)] bg-[rgba(14,14,16,.72)] px-1 py-0.5 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:opacity-100">
                <GripVertical
                  className="h-4 w-4 text-[var(--text-faint)]"
                  aria-hidden
                />
                {index > 0 && (
                  <button
                    type="button"
                    {...noDrag}
                    onClick={onMakeCover}
                    className="font-display flex h-6 items-center gap-1 rounded-[var(--r-sm)] px-1.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--text)] transition-colors hover:bg-white/10 hover:text-[var(--accent-hi)]"
                    aria-label={`Сделать фото ${index + 1} обложкой`}
                  >
                    <Star className="h-3.5 w-3.5" />
                    <span className="max-sm:hidden">В обложку</span>
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
