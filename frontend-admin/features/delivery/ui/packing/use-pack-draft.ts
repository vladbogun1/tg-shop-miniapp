"use client";

/**
 * Выбор коробки и вес до «Упаковано» — на вкладку браузера (sessionStorage), по заказу. Отказ Новой почты,
 * перечитанный список или обновлённая страница не сбрасывают свои размеры и вес; после «Упаковано» черновик стирается.
 */
import { useCallback, useEffect, useState } from "react";
import { createStorage } from "@shop/core/storage";
import type { PackChoice, PackPlace } from "../../model/packing";

const store = createStorage("session", "admin-pack-");

interface Draft {
  picked: PackChoice | null;
  weight: string;
  /** Места после первого — пусто, если посылка одним местом. */
  more: PackPlace[];
}

const EMPTY: Draft = { picked: null, weight: "", more: [] };

function isChoice(x: unknown): x is PackChoice {
  const k = (x as { kind?: unknown } | null)?.kind;
  return k === "box" || k === "custom";
}

function places(x: unknown): PackPlace[] {
  if (!Array.isArray(x)) return [];
  return x.map((p: { choice?: unknown; weight?: unknown }) => ({
    choice: isChoice(p?.choice) ? p.choice : null,
    weight: typeof p?.weight === "string" ? p.weight : "",
  }));
}

export function usePackDraft(orderId: string) {
  const [draft, setDraft] = useState<Draft>(EMPTY);

  // Читаем после монтирования: первый рендер совпадает с серверным.
  useEffect(() => {
    const saved = store.getJson<Draft>(orderId);
    const picked = saved?.picked;
    setDraft({
      picked: isChoice(picked) ? picked : null,
      weight: typeof saved?.weight === "string" ? saved.weight : "",
      more: places(saved?.more),
    });
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
    setDraft(EMPTY);
  }, [orderId]);

  return {
    picked: draft.picked,
    weight: draft.weight,
    more: draft.more,
    setPicked: (picked: PackChoice | null) => update({ picked }),
    setWeight: (weight: string) => update({ weight }),
    setMore: (more: PackPlace[]) => update({ more }),
    clear,
  };
}
