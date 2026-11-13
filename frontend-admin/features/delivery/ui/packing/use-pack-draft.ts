"use client";

/**
 * Выбор коробки и вес до «Упаковано» — на вкладку браузера (sessionStorage), по заказу. Отказ Новой почты,
 * перечитанный список или обновлённая страница не сбрасывают свои размеры и вес; после «Упаковано» черновик стирается.
 */
import { useCallback, useEffect, useState } from "react";
import { createStorage } from "@shop/core/storage";
import type { PackChoice } from "../../model/packing";

const store = createStorage("session", "admin-pack-");

interface Draft {
  picked: PackChoice | null;
  weight: string;
}

function isChoice(x: unknown): x is PackChoice {
  const k = (x as { kind?: unknown } | null)?.kind;
  return k === "box" || k === "custom";
}

export function usePackDraft(orderId: string) {
  const [draft, setDraft] = useState<Draft>({ picked: null, weight: "" });

  // Читаем после монтирования: первый рендер совпадает с серверным.
  useEffect(() => {
    const saved = store.getJson<Draft>(orderId);
    if (!saved) return;
    setDraft({ picked: isChoice(saved.picked) ? saved.picked : null, weight: typeof saved.weight === "string" ? saved.weight : "" });
  }, [orderId]);

  const update = useCallback(
    (patch: Partial<Draft>) =>
      setDraft((prev) => {
        const next = { ...prev, ...patch };
        store.setJson(orderId, next);
        return next;
      }),
    [orderId],
  );
  const clear = useCallback(() => {
    store.removeItem(orderId);
    setDraft({ picked: null, weight: "" });
  }, [orderId]);

  return {
    picked: draft.picked,
    weight: draft.weight,
    setPicked: (picked: PackChoice | null) => update({ picked }),
    setWeight: (weight: string) => update({ weight }),
    clear,
  };
}
