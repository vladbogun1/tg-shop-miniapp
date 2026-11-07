"use client";

/**
 * Файлы читаемого документа: загрузка по одному (телефонное фото — несколько мегабайт, параллельно не нужно)
 * с настоящим прогрессом (XHR), список картинок на сервере, удаление. Лимит 10 картинок проверяется при выборе,
 * перетаскивании и вставке (`model/ai/files-limit`); что не влезло — тост с именами файлов, а отказ сервера
 * (например, PDF с лишними страницами) — на плашке файла. Файлы живут 7 дней: после перезагрузки страницы
 * непрочитанные возвращаются из `GET /ai/files`.
 */
import { errorMessage } from "@shop/core/errors";
import { toast } from "@shop/ui/toast";
import { useCallback, useEffect, useRef, useState } from "react";
import { supplyAiApi, type AiFile } from "../../api-ai";
import { admitFiles, admitMessages } from "../../model/ai/files-limit";

export { MAX_FILE_BYTES, MAX_PICTURES } from "../../model/ai/files-limit";

export interface PendingUpload {
  key: number;
  name: string;
  /** Доля отправленного, 0…1 (0 — ещё ждёт в очереди). */
  sent: number;
  /** Идёт ли сейчас (а не ждёт очереди). */
  active: boolean;
  failed: string | null;
}

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

  const patch = useCallback((key: number, change: Partial<PendingUpload>) => {
    if (alive.current) setPending((p) => p.map((x) => (x.key === key ? { ...x, ...change } : x)));
  }, []);

  const pump = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    for (let next = queue.current.shift(); next && alive.current; next = queue.current.shift()) {
      const key = next.key;
      patch(key, { active: true });
      try {
        const saved = await supplyAiApi.upload(next.file, (sent) => patch(key, { sent }));
        setFiles((prev) => [...prev, ...saved]);
        setPending((p) => p.filter((x) => x.key !== key));
      } catch (e) {
        patch(key, { active: false, failed: errorMessage(e, undefined, "Не удалось загрузить файл") });
      }
    }
    busy.current = false;
  }, [patch]);

  /** Отсеивает слишком большие и не влезающие в лимит (тост с именами) и ставит остальные в очередь. */
  const add = useCallback(
    (list: FileList | File[]) => {
      const taken = files.length + queue.current.length + (busy.current ? 1 : 0);
      const admitted = admitFiles(Array.from(list), taken);
      for (const text of admitMessages(admitted, taken)) toast.info(text);
      const items = admitted.take.map((file) => ({ key: ++seq, file }));
      if (!items.length) return;
      queue.current.push(...items);
      setPending((p) => [...p, ...items.map((i) => ({ key: i.key, name: i.file.name || "картинка", sent: 0, active: false, failed: null }))]);
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

  const queued = pending.filter((p) => !p.failed).length;
  return { files, pending, queued, uploading: queued > 0, add, remove, dismiss, clear };
}

export type SupplyFiles = ReturnType<typeof useSupplyFiles>;
