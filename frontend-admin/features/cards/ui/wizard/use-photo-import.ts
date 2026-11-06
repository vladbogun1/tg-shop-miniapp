"use client";

/**
 * «Фото по ссылке» after the cards are saved: every chosen link goes to `POST /products/{id}/photos/import`, two at a
 * time (the server downloads and renders each — up to ~40 s), in the order the admin chose, so the first photo of a
 * product stays first. Each link keeps its own result; one bad link does not stop the rest.
 *
 * A lost connection or a 5xx is repeated once on its own; what still failed can be repeated by hand («Повторить»).
 * Repeating is safe: the server returns the photo it already added from the same link instead of adding a copy.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { errorMessage } from "@shop/core/errors";
import { cardsApi } from "../../api";
import { groupByProduct, isTransientError, type PhotoJob } from "../../model/photos";
import { invalidateCards } from "../../queries";

/** `cutOut: false` — фон не вырезан (сервис занят или не справился): фото взято как есть, на цвете своих краёв. */
export type PhotoJobState = { status: "wait" | "run" } | { status: "ok"; cutOut: boolean } | { status: "error"; error: string };

const PARALLEL = 2;
const AUTO_RETRY_DELAY_MS = 2_000;

const keyOf = (j: PhotoJob) => `${j.productId} ${j.url}`;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function importWithOneRetry(j: PhotoJob) {
  try {
    return await cardsApi.importPhoto(j.productId, j.url);
  } catch (e) {
    if (!isTransientError(e)) throw e;
    await pause(AUTO_RETRY_DELAY_MS);
    return cardsApi.importPhoto(j.productId, j.url);
  }
}

export function usePhotoImport() {
  const qc = useQueryClient();
  const [jobs, setJobs] = useState<PhotoJob[]>([]);
  const [state, setState] = useState<Map<string, PhotoJobState>>(new Map());
  const [running, setRunning] = useState(false);
  const onAddedRef = useRef<(j: PhotoJob) => void>(() => {});

  const mark = (j: PhotoJob, s: PhotoJobState) => setState((prev) => new Map(prev).set(keyOf(j), s));

  async function runGroup(group: PhotoJob[]) {
    for (const j of group) {
      mark(j, { status: "run" });
      try {
        const res = await importWithOneRetry(j);
        mark(j, { status: "ok", cutOut: res.cutOut !== false });
        onAddedRef.current(j);
      } catch (e) {
        mark(j, { status: "error", error: errorMessage(e, undefined, "ошибка сети") });
      }
    }
  }

  async function process(list: PhotoJob[]) {
    setState((prev) => {
      const next = new Map(prev);
      for (const j of list) next.set(keyOf(j), { status: "wait" });
      return next;
    });
    setRunning(true);
    const queue = groupByProduct(list);
    const worker = async () => {
      for (let g = queue.shift(); g; g = queue.shift()) await runGroup(g);
    };
    try {
      await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker));
    } finally {
      setRunning(false);
      invalidateCards(qc);
    }
  }

  const stateOf = (j: PhotoJob): PhotoJobState => state.get(keyOf(j)) ?? { status: "wait" };

  /** `onAdded` — фото уже у товара: вызывающий убирает ссылку из выбора, чтобы повторный запуск её не добавил ещё раз. */
  async function run(next: PhotoJob[], onAdded: (j: PhotoJob) => void = () => {}) {
    if (!next.length || running) return;
    onAddedRef.current = onAdded;
    setJobs(next);
    setState(new Map());
    await process(next);
  }

  /** Again only the links that failed (all of them, or the given ones); the rest of the list keeps its result. */
  async function retry(only?: PhotoJob[]) {
    if (running) return;
    const failed = (only ?? jobs).filter((j) => stateOf(j).status === "error");
    if (failed.length) await process(failed);
  }

  return { jobs, run, retry, running, stateOf };
}

export type PhotoImport = ReturnType<typeof usePhotoImport>;
