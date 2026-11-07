"use client";

import { createStorage } from "@shop/core/storage";
import { useCallback, useEffect, useState } from "react";

const store = createStorage("session", "admin-translations-");
const KEY = "ai-batch";

/** Номер пакета «Перевести с ИИ», итог которого показан на экране: переживает обновление вкладки, пока она открыта. */
export interface StartedBatch {
  batchId: number | null;
  remember: (id: number) => void;
  forget: () => void;
}

export function useStartedBatch(): StartedBatch {
  const [batchId, setBatchId] = useState<number | null>(null);

  // Читаем после монтирования: первый кадр должен совпасть с серверным.
  useEffect(() => {
    const saved = store.getJson<number>(KEY);
    if (typeof saved === "number" && Number.isInteger(saved) && saved > 0) setBatchId(saved);
  }, []);

  const remember = useCallback((id: number) => {
    store.setJson(KEY, id);
    setBatchId(id);
  }, []);
  const forget = useCallback(() => {
    store.removeItem(KEY);
    setBatchId(null);
  }, []);
  return { batchId, remember, forget };
}
