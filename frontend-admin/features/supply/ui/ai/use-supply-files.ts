"use client";

/**
 * Файлы читаемого документа: загрузка по одному (телефонное фото — несколько мегабайт, параллельно не нужно),
 * список картинок на сервере, удаление. Загрузка идёт через fetch, у него нет байтового прогресса — показываем
 * очередь: что грузится сейчас и что уже на сервере. Файлы живут 7 дней: после перезагрузки страницы
 * непрочитанные возвращаются из `GET /ai/files`.
 */
import { errorMessage } from "@shop/core/errors";
import { toast } from "@shop/ui/toast";
import { useCallback, useEffect, useRef, useState } from "react";
import { supplyAiApi, type AiFile } from "../../api-ai";

export interface PendingUpload {
  key: number;
  name: string;
  failed: string | null;
}

/** Не больше стольки картинок за раз (страница PDF — одна картинка): столько читает одна задача. */
export const MAX_PICTURES = 10;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

let seq = 0;

export function useSupplyFiles(enabled: boolean) {
  const [files, setFiles] = useState<AiFile[]>([]);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const busy = useRef(false);
  const queue = useRef<{ key: number; file: File }[]>([]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Непрочитанные с прошлого раза.
  useEffect(() => {
    if (!enabled) return;
    supplyAiApi
      .waiting()
      .then((list) => alive.current && setFiles((prev) => (prev.length ? prev : list)))
      .catch(() => undefined);
  }, [enabled]);

  const pump = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    for (let next = queue.current.shift(); next && alive.current; next = queue.current.shift()) {
      try {
        const saved = await supplyAiApi.upload(next.file);
        setFiles((prev) => [...prev, ...saved]);
        setPending((p) => p.filter((x) => x.key !== next!.key));
      } catch (e) {
        const text = errorMessage(e, undefined, "Не удалось загрузить файл");
        setPending((p) => p.map((x) => (x.key === next!.key ? { ...x, failed: text } : x)));
      }
    }
    busy.current = false;
  }, []);

  /** Отсеивает слишком большие сразу (сервер всё равно откажет) и ставит остальные в очередь. */
  const add = useCallback(
    (list: FileList | File[]) => {
      const picked = Array.from(list);
      const tooBig = picked.filter((f) => f.size > MAX_FILE_BYTES);
      if (tooBig.length) toast.info(`Файл больше 10 МБ не загружаю: ${tooBig.map((f) => f.name).join(", ")}`);
      const ok = picked.filter((f) => f.size <= MAX_FILE_BYTES);
      const room = Math.max(0, MAX_PICTURES - files.length - queue.current.length);
      if (ok.length > room) toast.info(`За раз читается не больше ${MAX_PICTURES} картинок (страница PDF — одна картинка)`);
      const take = ok.slice(0, room);
      const items = take.map((file) => ({ key: ++seq, file }));
      queue.current.push(...items);
      setPending((p) => [...p, ...items.map((i) => ({ key: i.key, name: i.file.name, failed: null }))]);
      void pump();
    },
    [files.length, pump],
  );

  const dismiss = useCallback((key: number) => setPending((p) => p.filter((x) => x.key !== key)), []);

  const remove = useCallback(async (file: AiFile) => {
    try {
      await supplyAiApi.remove(file.id);
      // Удаление страницы PDF уносит весь PDF: убираем все картинки той же загрузки.
      setFiles((prev) => prev.filter((f) => f.id !== file.id && (file.page == null || f.uploadId !== file.uploadId)));
    } catch (e) {
      toast.error(errorMessage(e, undefined, "Не удалось удалить файл"));
    }
  }, []);

  const clear = useCallback(() => {
    queue.current = [];
    setFiles([]);
    setPending([]);
  }, []);

  return { files, pending, uploading: pending.some((p) => !p.failed), add, remove, dismiss, clear };
}

export type SupplyFiles = ReturnType<typeof useSupplyFiles>;
