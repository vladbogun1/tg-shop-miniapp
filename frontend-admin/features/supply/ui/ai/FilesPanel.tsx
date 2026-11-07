"use client";

import { Button } from "@shop/ui/admin-button";
import { Lightbox } from "@shop/ui/overlay";
import { Camera, FileUp, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { Thumb } from "./SourceShots";
import { ACCEPT, MAX_PICTURES, type SupplyFiles } from "./use-supply-files";

/**
 * Загрузчик файлов документа: выбрать (или перетащить на ПК), «Снять камерой» на телефоне, миниатюры с крестиком,
 * очередь загрузки. Всё, что загружено, лежит на сервере 7 дней и удаляется само — об этом подпись под полем.
 */
export function FilesPanel({ files, locked }: { files: SupplyFiles; locked: boolean }) {
  const pick = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [big, setBig] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const full = files.files.length >= MAX_PICTURES;

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
        <span className="text-[12px] text-[var(--text-muted)]">
          JPEG, PNG, WEBP или PDF до 10 МБ; всего до {MAX_PICTURES} картинок (страница PDF — одна)
        </span>
      </div>
      {(files.files.length > 0 || files.pending.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {files.files.map((f) => (
            <Thumb key={f.id} file={f} onOpen={setBig} onRemove={locked ? undefined : () => void files.remove(f)} />
          ))}
          {files.pending.map((p) => (
            <div
              key={p.key}
              className="flex h-20 w-28 flex-col justify-center gap-1 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] px-2 text-[11.5px]"
              role="status"
            >
              <span className="truncate font-semibold" title={p.name}>
                {p.name}
              </span>
              {p.failed ? (
                <button type="button" className="text-left text-[var(--danger-ink)]" onClick={() => files.dismiss(p.key)} title={p.failed}>
                  ✕ {p.failed}
                </button>
              ) : (
                <span className="flex items-center gap-1 text-[var(--text-muted)]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> загружается…
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="text-[12px] text-[var(--text-muted)]">Файлы хранятся 7 дней и удаляются сами.</p>
      <Lightbox src={big} onClose={() => setBig(null)} />
    </div>
  );
}
