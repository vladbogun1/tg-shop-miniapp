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
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Image } from "@/lib/image";
import { cn } from "@/lib/cn";
import { UploadCloud } from "lucide-react";
import { useOverlayLayer } from "@shop/ui/overlay";
import {
  AddTile,
  EmptyDropZone,
  PhotoSummary,
  useFileDrop,
} from "./PhotoDropZone";
import { SortablePhoto } from "./PhotoTile";

/** Stable ids even if the same key appears twice: «key#occurrence». */
function idsFor(keys: string[]): string[] {
  const seen = new Map<string, number>();
  return keys.map((k) => {
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    return `${k}#${n}`;
  });
}

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
  const fileDrop = useFileDrop(onFiles);
  const fileOver = fileDrop.over;
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
  const projected =
    activeIndex >= 0 && overIndex >= 0
      ? arrayMove(ids, activeIndex, overIndex)
      : ids;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Esc while dragging belongs to dnd-kit (it cancels the drag), not to the modal.
  useOverlayLayer(activeId !== null, () => {}, {
    lockScroll: false,
    passEscape: true,
  });

  const pos = (id: string) => ids.indexOf(id) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Фото ${pos(String(active.id))} из ${ids.length} поднято. Стрелки — переместить, пробел — отпустить, Esc — отменить.`,
    onDragOver: ({ over }) =>
      over
        ? `Место ${pos(String(over.id))} из ${ids.length}.`
        : "Вне списка фото.",
    onDragEnd: ({ over }) =>
      over
        ? `Фото поставлено на место ${pos(String(over.id))}.`
        : "Фото отпущено вне списка, порядок не изменился.",
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
    <div className="relative flex flex-col gap-3" {...fileDrop.bind}>
      {compact && <span className="field-label">Фото · необязательно</span>}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {imageKeys.length === 0 && !uploading ? (
        <>
          <EmptyDropZone compact={compact} fileOver={fileOver} pick={pick} />
          {!compact && (
            <p className="text-[13px] text-[var(--text-faint)]">
              Первое фото станет обложкой. Порядок потом меняется
              перетаскиванием.
            </p>
          )}
        </>
      ) : (
        <>
          <PhotoSummary count={imageKeys.length} />
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            accessibility={{
              announcements,
              screenReaderInstructions: {
                draggable:
                  "Пробел — взять фото, стрелки — переместить, пробел — поставить, Esc — отменить.",
              },
            }}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
          >
            <SortableContext items={ids} strategy={rectSortingStrategy}>
              <div
                className={cn(
                  "grid gap-2",
                  compact
                    ? "grid-cols-4 sm:grid-cols-5"
                    : "grid-cols-3 sm:grid-cols-4",
                )}
              >
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
                <AddTile
                  uploading={uploading}
                  fileOver={fileOver}
                  pick={pick}
                />
              </div>
            </SortableContext>
            {mounted &&
              createPortal(
                // Portal: the modal is transformed by framer-motion, which would offset a fixed-position overlay.
                <DragOverlay
                  zIndex={400}
                  dropAnimation={{
                    duration: 180,
                    easing: "cubic-bezier(.2,.8,.2,1)",
                  }}
                >
                  {activeKey ? (
                    <div className="relative cursor-grabbing overflow-hidden rounded-[var(--r-lg)] border border-[var(--accent)] shadow-[0_18px_40px_-12px_rgba(0,0,0,.75),0_0_0_3px_rgba(255,102,0,.25)] [transform:scale(1.05)_rotate(-1.5deg)]">
                      <Image
                        src={activeKey}
                        alt=""
                        size={200}
                        className="aspect-square w-full"
                      />
                    </div>
                  ) : null}
                </DragOverlay>,
                document.body,
              )}
          </DndContext>
        </>
      )}

      {fileOver && imageKeys.length > 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-[var(--r-lg)] border-2 border-dashed border-[var(--accent)] bg-[rgba(14,14,16,.78)] backdrop-blur-[2px]">
          <span className="font-display flex items-center gap-2 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-[var(--accent-hi)]">
            <UploadCloud className="h-5 w-5" /> Отпустите — фото добавятся в
            конец
          </span>
        </div>
      )}
    </div>
  );
}
