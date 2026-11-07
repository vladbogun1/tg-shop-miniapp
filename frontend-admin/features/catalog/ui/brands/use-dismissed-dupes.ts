"use client";

import { localStore } from "@shop/core/storage";
import { useCallback, useEffect, useState } from "react";

const KEY = "admin-brands-not-dupes-v1";

/**
 * «Не дубликаты»: подписи групп, которые владелец отклонил. Бэкенд такого не хранит — запоминаем в браузере
 * (на другом устройстве группа покажется снова, это безвредно).
 */
export function useDismissedDupes() {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const saved = localStore.getJson<string[]>(KEY);
    if (saved) setDismissed(new Set(saved));
  }, []);
  const dismiss = useCallback((signature: string) => {
    setDismissed((prev) => {
      const next = new Set(prev).add(signature);
      localStore.setJson(KEY, [...next]);
      return next;
    });
  }, []);
  return { dismissed, dismiss };
}
