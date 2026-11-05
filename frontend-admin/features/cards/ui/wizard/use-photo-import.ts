"use client";

/**
 * «Фото по ссылке» after the cards are saved: every chosen link goes to `POST /products/{id}/photos/import`, two at a
 * time (the server downloads and renders each — up to ~40 s), in the order the admin chose, so the first photo of a
 * product stays first. Each link keeps its own result; one bad link does not stop the rest.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { errorMessage } from "@shop/core/errors";
import { cardsApi } from "../../api";
import { groupByProduct, type PhotoJob } from "../../model/photos";
import { invalidateCards } from "../../queries";

/** `cutOut: false` — фон не вырезан (сервис занят или не справился): фото взято как есть, на цвете своих краёв. */
export type PhotoJobState = { status: "wait" | "run" } | { status: "ok"; cutOut: boolean } | { status: "error"; error: string };

const PARALLEL = 2;

const keyOf = (j: PhotoJob) => `${j.productId} ${j.url}`;

export function usePhotoImport() {
  const qc = useQueryClient();
  const [jobs, setJobs] = useState<PhotoJob[]>([]);
  const [state, setState] = useState<Map<string, PhotoJobState>>(new Map());
  const [running, setRunning] = useState(false);

  const mark = (j: PhotoJob, s: PhotoJobState) => setState((prev) => new Map(prev).set(keyOf(j), s));

  async function runGroup(group: PhotoJob[], onAdded: (j: PhotoJob) => void) {
    for (const j of group) {
      mark(j, { status: "run" });
      try {
        const res = await cardsApi.importPhoto(j.productId, j.url);
        mark(j, { status: "ok", cutOut: res.cutOut !== false });
        onAdded(j);
      } catch (e) {
        mark(j, { status: "error", error: errorMessage(e, undefined, "ошибка сети") });
      }
    }
  }

  /** `onAdded` — фото уже у товара: вызывающий убирает ссылку из выбора, чтобы повторный запуск её не добавил ещё раз. */
  async function run(next: PhotoJob[], onAdded: (j: PhotoJob) => void = () => {}) {
    if (!next.length || running) return;
    setJobs(next);
    setState(new Map(next.map((j) => [keyOf(j), { status: "wait" }])));
    setRunning(true);
    const queue = groupByProduct(next);
    const worker = async () => {
      for (let g = queue.shift(); g; g = queue.shift()) await runGroup(g, onAdded);
    };
    try {
      await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker));
    } finally {
      setRunning(false);
      invalidateCards(qc);
    }
  }

  const stateOf = (j: PhotoJob): PhotoJobState => state.get(keyOf(j)) ?? { status: "wait" };
  return { jobs, run, running, stateOf };
}

export type PhotoImport = ReturnType<typeof usePhotoImport>;
