"use client";

/**
 * Product photos: upload + reorder by drag and drop.
 *
 * - Mouse: grab a photo anywhere and drag (a 4 px move starts it, so a click on ✕ or «В обложку» stays a click).
 * - Touch (the admin is used as a PWA on phones): hold ~0.2 s, then drag; a quick swipe still scrolls the modal.
 * - Keyboard: Tab to a photo, Space — pick up, arrows — move, Space — drop, Esc — put it back.
 * - While dragging, the «обложка» badge already sits on the photo that will be first after the drop.
 * - Esc during a drag cancels the drag only, not the product modal under it (overlay stack `passEscape`).
 * - Files can be dropped from the desktop onto the whole block, not just the empty dropzone.
 * The order lives in the form like every other field — it is saved with «Сохранить».
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ImagePlus, Star, UploadCloud, X } from "lucide-react";
import { Image } from "@/lib/image";
import { cn } from "@/lib/cn";
import { useOverlayLayer } from "@/lib/overlay-stack";
import { Spinner } from "@/components/ui/Spinner";

/** Stable ids even if the same key appears twice: «key#occurrence». */
function idsFor(keys: string[]): string[] {
  const seen = new Map<string, number>();
  return keys.map((k) => {
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    return `${k}#${n}`;
  });
}

const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

/** Pressing a control inside a photo must not start a drag (mouse, touch or Space/Enter). */
const noDrag = {
  onMouseDown: (e: React.SyntheticEvent) => e.stopPropagation(),
  onTouchStart: (e: React.SyntheticEvent) => e.stopPropagation(),
  onKeyDown: (e: React.SyntheticEvent) => e.stopPropagation(),
};

export function PhotoUploader({
  fileRef,
  imageKeys,
  uploading,
  onFiles,
  onRemove,
  onReorder,
  compact,
}: {
  fileRef: React.RefObject<HTMLInputElement | null>;
  imageKeys: string[];
  uploading: boolean;
  onFiles: (f: FileList | null) => void;
  onRemove: (i: number) => void;
  onReorder: (from: number, to: number) => void;
  compact?: boolean;
}) {
  const [fileOver, setFileOver] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dropped, setDropped] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!dropped) return;
    const t = setTimeout(() => setDropped(null), 750);
    return () => clearTimeout(t);
  }, [dropped]);

  const ids = useMemo(() => idsFor(imageKeys), [imageKeys]);
  const activeIndex = activeId ? ids.indexOf(activeId) : -1;
  const overIndex = overId ? ids.indexOf(overId) : -1;
  // Where everything lands if dropped now — drives the live «обложка» badge and the position numbers.
  const projected = activeIndex >= 0 && overIndex >= 0 ? arrayMove(ids, activeIndex, overIndex) : ids;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Esc while dragging belongs to dnd-kit (it cancels the drag), not to the modal.
  useOverlayLayer(activeId !== null, () => {}, { lockScroll: false, passEscape: true });

  const pos = (id: string) => ids.indexOf(id) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Фото ${pos(String(active.id))} из ${ids.length} поднято. Стрелки — переместить, пробел — отпустить, Esc — отменить.`,
    onDragOver: ({ over }) => (over ? `Место ${pos(String(over.id))} из ${ids.length}.` : "Вне списка фото."),
    onDragEnd: ({ over }) => (over ? `Фото поставлено на место ${pos(String(over.id))}.` : "Фото отпущено вне списка, порядок не изменился."),
    onDragCancel: () => "Перемещение отменено, порядок не изменился.",
  };

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    setOverId(String(e.active.id));
    setDropped(null);
  }
  function onDragOver(e: DragOverEvent) {
    setOverId(e.over ? String(e.over.id) : null);
  }
  function onDragEnd(e: DragEndEvent) {
    const from = ids.indexOf(String(e.active.id));
    const to = e.over ? ids.indexOf(String(e.over.id)) : -1;
    if (from >= 0 && to >= 0 && from !== to) {
      onReorder(from, to);
      setDropped(String(e.active.id).replace(/#\d+$/, ""));
    }
    setActiveId(null);
    setOverId(null);
  }
  function onDragCancel() {
    setActiveId(null);
    setOverId(null);
  }

  const activeKey = activeIndex >= 0 ? imageKeys[activeIndex] : null;
  const pick = () => fileRef.current?.click();

  return (
    <div
      className="relative flex flex-col gap-3"
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setFileOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFileOver(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setFileOver(false);
        onFiles(e.dataTransfer.files);
      }}
    >
      {compact && <span className="field-label">Фото · необязательно</span>}
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />

      {imageKeys.length === 0 && !uploading ? (
        <>
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                pick();
              }
            }}
            onClick={pick}
            className={cn(
              "focusable font-display flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-[var(--r-lg)] border px-4 text-center text-[12.5px] font-semibold uppercase tracking-[0.06em] transition-colors",
              compact ? "py-5" : "py-7",
              fileOver
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                : "border-[var(--line)] bg-[var(--bg-2)] text-[var(--text-muted)] hover:border-[var(--border-2)] hover:text-[var(--text)]"
            )}
          >
            <span className="accent-tint grid h-11 w-11 place-items-center rounded-[var(--r-md)]">
              <UploadCloud className="h-5 w-5" />
            </span>
            Перетащите фото или нажмите для загрузки
          </div>
          {!compact && <p className="text-[13px] text-[var(--text-faint)]">Первое фото станет обложкой. Порядок потом меняется перетаскиванием.</p>}
        </>
      ) : (
        <>
          <p className="field-label flex flex-wrap items-center gap-x-1.5 !text-[11px] !text-[var(--text-faint)]">
            <span>{imageKeys.length} фото</span>
            <span aria-hidden>·</span>
            <span>первое = обложка</span>
            {imageKeys.length > 1 && (
              <>
                <span aria-hidden>·</span>
                <span className="pointer-coarse:hidden">перетащите, чтобы поменять порядок</span>
                <span className="hidden pointer-coarse:inline">удерживайте фото и тяните</span>
              </>
            )}
          </p>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            accessibility={{
              announcements,
              screenReaderInstructions: {
                draggable: "Пробел — взять фото, стрелки — переместить, пробел — поставить, Esc — отменить.",
              },
            }}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
          >
            <SortableContext items={ids} strategy={rectSortingStrategy}>
              <div className={cn("grid gap-2", compact ? "grid-cols-4 sm:grid-cols-5" : "grid-cols-3 sm:grid-cols-4")}>
                {ids.map((id, i) => (
                  <SortablePhoto
                    key={id}
                    id={id}
                    src={imageKeys[i]}
                    index={i}
                    projectedIndex={projected.indexOf(id)}
                    total={ids.length}
                    dragging={activeId !== null}
                    justDropped={dropped === imageKeys[i] && activeId === null}
                    onRemove={() => onRemove(i)}
                    onMakeCover={() => {
                      onReorder(i, 0);
                      setDropped(imageKeys[i]);
                    }}
                  />
                ))}
                {uploading ? (
                  <div className="grid aspect-square place-items-center rounded-[var(--r-lg)] border border-dashed border-[var(--line-strong)] bg-[var(--bg-2)]">
                    <Spinner className="h-5 w-5" />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={pick}
                    className={cn(
                      "focusable font-display flex aspect-square flex-col items-center justify-center gap-1.5 rounded-[var(--r-lg)] border border-dashed text-[10.5px] font-semibold uppercase tracking-[0.06em] transition-colors",
                      fileOver
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                        : "border-[var(--line-strong)] bg-[var(--bg-2)] text-[var(--text-muted)] hover:border-[var(--border-2)] hover:text-[var(--text)]"
                    )}
                  >
                    <ImagePlus className="h-5 w-5" />
                    Добавить
                  </button>
                )}
              </div>
            </SortableContext>
            {mounted &&
              createPortal(
                // Portal: the modal is transformed by framer-motion, which would offset a fixed-position overlay.
                <DragOverlay zIndex={400} dropAnimation={{ duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" }}>
                  {activeKey ? (
                    <div className="relative cursor-grabbing overflow-hidden rounded-[var(--r-lg)] border border-[var(--accent)] shadow-[0_18px_40px_-12px_rgba(0,0,0,.75),0_0_0_3px_rgba(255,102,0,.25)] [transform:scale(1.05)_rotate(-1.5deg)]">
                      <Image src={activeKey} alt="" size={200} className="aspect-square w-full" />
                    </div>
                  ) : null}
                </DragOverlay>,
                document.body
              )}
          </DndContext>
        </>
      )}

      {fileOver && imageKeys.length > 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-[var(--r-lg)] border-2 border-dashed border-[var(--accent)] bg-[rgba(14,14,16,.78)] backdrop-blur-[2px]">
          <span className="font-display flex items-center gap-2 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-[var(--accent-hi)]">
            <UploadCloud className="h-5 w-5" /> Отпустите — фото добавятся в конец
          </span>
        </div>
      )}
    </div>
  );
}

function SortablePhoto({
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
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
        justDropped && "photo-dropped"
      )}
    >
      <Image src={src} alt="" size={200} className={cn("pointer-events-none aspect-square w-full transition-opacity", isDragging && "opacity-20")} />

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
                <GripVertical className="h-4 w-4 text-[var(--text-faint)]" aria-hidden />
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
