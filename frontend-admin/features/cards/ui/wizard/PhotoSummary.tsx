"use client";

import { Check, Loader2, RotateCcw, X } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { Badge } from "@/components/ui/Badge";
import { host } from "../shared";
import type { PhotoImport } from "./use-photo-import";

/** Progress and result of «Фото по ссылке»: per link — waiting, downloading, added or why not; failed ones can be repeated. */
export function PhotoSummary({ photos }: { photos: PhotoImport }) {
  const { jobs, running, stateOf, retry } = photos;
  if (!jobs.length) return null;
  const states = jobs.map(stateOf);
  const ok = states.filter((s) => s.status === "ok").length;
  const failed = states.filter((s) => s.status === "error").length;
  const uncut = states.filter((s) => s.status === "ok" && !s.cutOut).length;
  return (
    <div className="mt-4 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3 text-[13px]">
      <div className="section-title mb-2 flex flex-wrap items-center gap-2 !text-[12px]">
        <span>Фото по ссылкам</span>
        {running && <Badge tone="info">загружаю {ok + failed} из {jobs.length}</Badge>}
        {ok > 0 && <Badge tone="ok">добавлено {ok}</Badge>}
        {failed > 0 && <Badge tone="danger">не удалось {failed}</Badge>}
        {uncut > 0 && <Badge tone="warn">без вырезки фона {uncut}</Badge>}
        {!running && failed > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto normal-case"
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            onClick={() => void retry()}
          >
            {failed > 1 ? `Повторить неудачные (${failed})` : "Повторить"}
          </Button>
        )}
      </div>
      <ul className="flex flex-col gap-1 text-[12.5px]">
        {jobs.map((j, i) => {
          const s = states[i];
          return (
            <li key={`${j.productId} ${j.url}`} className="flex min-w-0 items-start gap-2">
              <span className="mt-0.5 shrink-0">
                {s.status === "ok" && <Check className="h-3.5 w-3.5 text-[var(--ok)]" />}
                {s.status === "error" && <X className="h-3.5 w-3.5 text-[var(--danger)]" />}
                {s.status === "run" && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--info)]" />}
                {s.status === "wait" && <span className="block h-3.5 w-3.5 rounded-full border border-[var(--line-strong)]" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{j.title}</span>
                <span className="text-[var(--text-muted)]"> · {host(j.url)}</span>
                {s.status === "error" && (
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold text-[var(--danger-ink)]">{s.error}</span>
                    {!running && failed > 1 && (
                      <button type="button" className="text-[var(--accent)] underline-offset-2 hover:underline" onClick={() => void retry([j])}>
                        повторить эту
                      </button>
                    )}
                  </span>
                )}
                {s.status === "ok" && !s.cutOut && (
                  <span className="block text-[var(--warn)]">фон не вырезан — фото как есть; можно заменить в карточке товара</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
