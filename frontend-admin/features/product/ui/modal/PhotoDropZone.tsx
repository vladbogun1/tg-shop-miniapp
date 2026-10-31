"use client";

import { useState } from "react";
import { ImagePlus, UploadCloud } from "lucide-react";
import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui/Spinner";

export function EmptyDropZone({
  compact,
  fileOver,
  pick,
}: {
  compact?: boolean;
  fileOver: boolean;
  pick: () => void;
}) {
  return (
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
          : "border-[var(--line)] bg-[var(--bg-2)] text-[var(--text-muted)] hover:border-[var(--border-2)] hover:text-[var(--text)]",
      )}
    >
      <span className="accent-tint grid h-11 w-11 place-items-center rounded-[var(--r-md)]">
        <UploadCloud className="h-5 w-5" />
      </span>
      Перетащите фото или нажмите для загрузки
    </div>
  );
}

export function PhotoSummary({ count }: { count: number }) {
  return (
    <p className="field-label flex flex-wrap items-center gap-x-1.5 !text-[11px] !text-[var(--text-faint)]">
      <span>{count} фото</span>
      <span aria-hidden>·</span>
      <span>первое = обложка</span>
      {count > 1 && (
        <>
          <span aria-hidden>·</span>
          <span className="pointer-coarse:hidden">
            перетащите, чтобы поменять порядок
          </span>
          <span className="hidden pointer-coarse:inline">
            удерживайте фото и тяните
          </span>
        </>
      )}
    </p>
  );
}

const hasFiles = (e: React.DragEvent) =>
  Array.from(e.dataTransfer.types).includes("Files");

/** Файлы можно бросить с рабочего стола на весь блок, не только на пустую зону. */
export function useFileDrop(onFiles: (f: FileList | null) => void) {
  const [over, setOver] = useState(false);
  const bind = {
    onDragOver: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null))
        setOver(false);
    },
    onDrop: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setOver(false);
      onFiles(e.dataTransfer.files);
    },
  };
  return { over, bind };
}

/** Последняя плитка сетки: спиннер при загрузке или кнопка «Добавить». */
export function AddTile({
  uploading,
  fileOver,
  pick,
}: {
  uploading: boolean;
  fileOver: boolean;
  pick: () => void;
}) {
  if (uploading) {
    return (
      <div className="grid aspect-square place-items-center rounded-[var(--r-lg)] border border-dashed border-[var(--line-strong)] bg-[var(--bg-2)]">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={pick}
      className={cn(
        "focusable font-display flex aspect-square flex-col items-center justify-center gap-1.5 rounded-[var(--r-lg)] border border-dashed text-[10.5px] font-semibold uppercase tracking-[0.06em] transition-colors",
        fileOver
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
          : "border-[var(--line-strong)] bg-[var(--bg-2)] text-[var(--text-muted)] hover:border-[var(--border-2)] hover:text-[var(--text)]",
      )}
    >
      <ImagePlus className="h-5 w-5" />
      Добавить
    </button>
  );
}
