"use client";

import { Button } from "@shop/ui/admin-button";
import { Lightbox, Modal } from "@shop/ui/overlay";
import { Images } from "lucide-react";
import { useEffect, useState } from "react";
import { supplyAiApi, type AiFile } from "../../api-ai";

/** Картинка файла: сервер отдаёт её только с токеном, поэтому blob → objectURL (освобождается при уходе). */
export function useBlobUrl(id: number): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    supplyAiApi
      .content(id)
      .then((blob) => {
        if (!alive) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [id]);
  return url;
}

export function Thumb({ file, onOpen, onRemove }: { file: AiFile; onOpen: (src: string) => void; onRemove?: () => void }) {
  const src = useBlobUrl(file.id);
  const label = file.name;
  return (
    <div className="relative">
      <button
        type="button"
        disabled={!src}
        onClick={() => src && onOpen(src)}
        title={label}
        aria-label={`Открыть: ${label}`}
        className="block h-20 w-20 overflow-hidden rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--accent)]"
      >
        {src && <img src={src} alt="" className="h-full w-full object-cover" />}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Убрать: ${label}`}
          className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[14px] leading-none text-[var(--text-muted)] hover:text-[var(--danger-ink)]"
        >
          ×
        </button>
      )}
    </div>
  );
}

function Gallery({ files }: { files: AiFile[] }) {
  return (
    <div className="flex flex-col gap-3">
      {files.map((f) => (
        <GalleryImage key={f.id} file={f} />
      ))}
    </div>
  );
}

function GalleryImage({ file }: { file: AiFile }) {
  const src = useBlobUrl(file.id);
  return (
    <figure className="m-0">
      <figcaption className="mb-1 break-words text-[12px] text-[var(--text-muted)]">{file.name}</figcaption>
      {src ? <img src={src} alt={file.name} className="w-full rounded-[var(--r-sm)] border border-[var(--line)]" /> : <div className="h-32 rounded-[var(--r-sm)] bg-[var(--surface-2)]" />}
    </figure>
  );
}

/**
 * Исходные скрины рядом с таблицей: на ПК колонка миниатюр (тап — крупно), на телефоне одна кнопка, по тапу —
 * все файлы подряд. Файлы лежат на сервере 7 дней.
 */
export function SourceShots({ files }: { files: AiFile[] }) {
  const [big, setBig] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  if (files.length === 0) return null;
  return (
    <>
      <aside className="hidden lg:block" aria-label="Исходные файлы">
        <div className="sticky top-0 flex flex-col gap-2">
          <div className="field-label">Исходные файлы</div>
          <div className="flex flex-wrap gap-2">
            {files.map((f) => (
              <Thumb key={f.id} file={f} onOpen={setBig} />
            ))}
          </div>
        </div>
      </aside>
      <div className="lg:hidden">
        <Button variant="surface" size="sm" icon={<Images className="h-4 w-4" />} onClick={() => setAll(true)}>
          Исходные файлы ({files.length})
        </Button>
        <Modal open={all} onClose={() => setAll(false)} size="lg" title="Исходные файлы">
          <Gallery files={files} />
        </Modal>
      </div>
      <Lightbox src={big} onClose={() => setBig(null)} />
    </>
  );
}
