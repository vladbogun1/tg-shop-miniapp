"use client";

import { Button } from "@shop/ui/admin-button";
import { Lightbox } from "@shop/ui/overlay";
import { Camera, FileUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { percent, percentOf, picturesCounter } from "../../model/ai/files-limit";
import { Thumb } from "./SourceShots";
import { ACCEPT, MAX_PICTURES, type PendingUpload, type SupplyFiles } from "./use-supply-files";

/**
 * Загрузчик файлов документа: выбрать, перетащить (ПК), вставить скрин из буфера (Ctrl+V), «Снять камерой» на
 * телефоне; миниатюры с крестиком, очередь загрузки с процентами, счётчик «N из 10 картинок». Всё, что загружено,
 * лежит на сервере 7 дней и удаляется само — об этом подпись под полем.
 */
export function FilesPanel({ files, locked }: { files: SupplyFiles; locked: boolean }) {
  const pick = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [big, setBig] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const count = files.files.length + files.queued;
  const full = count >= MAX_PICTURES;
  usePastedPictures(locked ? null : files.add);

  function take(list: FileList | null) {
    if (list && list.length) files.add(list);
  }

  return (
    <div
      onDragOver={(e) => {
        if (locked) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!locked) take(e.dataTransfer.files);
      }}
      className={`flex flex-col gap-3 rounded-[var(--r-md)] border border-dashed p-3 ${over ? "border-[var(--accent)] bg-[var(--surface-2)]" : "border-[var(--line)]"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="surface" size="sm" icon={<FileUp className="h-4 w-4" />} disabled={locked || full} onClick={() => pick.current?.click()}>
          Выбрать файлы
        </Button>
        {/* На телефоне: сразу камера; на ПК этой кнопки нет. */}
        <Button variant="surface" size="sm" icon={<Camera className="h-4 w-4" />} disabled={locked || full} className="sm:hidden" onClick={() => camera.current?.click()}>
          Снять камерой
        </Button>
        <span
          data-testid="supply-ai-files-count"
          className={`rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums bg-[var(--surface-2)] ${full ? "text-[var(--warn)]" : "text-[var(--text-muted)]"}`}
        >
          {picturesCounter(files.files.length, files.queued)}
        </span>
        <input
          ref={pick}
          type="file"
          multiple
          accept={ACCEPT}
          hidden
          data-testid="supply-ai-file-input"
          aria-label="Файлы документа"
          onChange={(e) => {
            take(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          aria-label="Снимок документа"
          onChange={(e) => {
            take(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      <p className="text-[12px] text-[var(--text-muted)]">
        JPEG, PNG, WEBP или PDF до 10 МБ; всего до {MAX_PICTURES} картинок (страница PDF — одна). Скрин можно вставить Ctrl+V.
      </p>
      {(files.files.length > 0 || files.pending.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {files.files.map((f) => (
            <Thumb key={f.id} file={f} onOpen={setBig} onRemove={locked ? undefined : () => void files.remove(f)} />
          ))}
          {files.pending.map((p) => (
            <PendingTile key={p.key} item={p} onDismiss={() => files.dismiss(p.key)} />
          ))}
        </div>
      )}
      <p className="text-[12px] text-[var(--text-muted)]">Файлы хранятся 7 дней и удаляются сами.</p>
      <Lightbox src={big} onClose={() => setBig(null)} />
    </div>
  );
}

/** Файл в очереди: имя, полоса с процентами (или «в очереди»), ошибка сервера с крестиком. */
function PendingTile({ item, onDismiss }: { item: PendingUpload; onDismiss: () => void }) {
  return (
    <div
      className="flex h-20 w-32 flex-col justify-center gap-1 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] px-2 text-[11.5px]"
      role="status"
      data-testid="supply-ai-pending"
    >
      <span className="truncate font-semibold" title={item.name}>
        {item.name}
      </span>
      {item.failed ? (
        <button type="button" className="line-clamp-3 text-left text-[var(--danger-ink)]" onClick={onDismiss} title={item.failed}>
          ✕ {item.failed}
        </button>
      ) : (
        <>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-[var(--line)]"
            role="progressbar"
            aria-label={`Загрузка ${item.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percentOf(item.sent)}
          >
            <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-150" style={{ width: `${percentOf(item.sent)}%` }} />
          </div>
          <span className="tabular-nums text-[var(--text-muted)]">{item.active ? `загружается ${percent(item.sent)}` : "в очереди"}</span>
        </>
      )}
    </div>
  );
}

/** Картинки из буфера (Ctrl+V скрина) — пока поле не заблокировано; вставка в поле ввода текста не перехватывается. */
function usePastedPictures(add: ((list: File[]) => void) | null) {
  useEffect(() => {
    if (!add) return;
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("textarea, input, [contenteditable='true']")) return;
      const pics = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");
      if (!pics.length) return;
      e.preventDefault();
      add(pics);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [add]);
}
