"use client";

/**
 * Куски экрана «Переводы», которые относятся к встроенному ИИ: фильтр «Встроенный ИИ», итог пакета и кнопка
 * «Перевести с ИИ (N)» во вкладках «Нужно перевести» и «Устарели». Вынесены, чтобы сам экран оставался простым.
 */
import { Button } from "@shop/ui/admin-button";
import type { ReactNode } from "react";
import type { Bucket } from "../../model/queue";
import type { TrLocale } from "../../model/types";
import type { UniqueString } from "../../model/workset";
import type { TranslationLists } from "../use-translation-lists";
import { BatchResult } from "./BatchResult";
import { BuiltinAiButton } from "./BuiltinAiButton";
import type { StartedBatch } from "./use-started-batch";

/** «Встроенный ИИ · N» на вкладке «Проверить ИИ»: только черновики встроенного ИИ, которые ждут человека. */
export function BuiltinFilterButton({ lists }: { lists: TranslationLists }) {
  if (lists.active !== "review" || (lists.builtinCount === 0 && !lists.onlyBuiltin)) return null;
  return (
    <Button
      variant={lists.onlyBuiltin ? "accent" : "outline"}
      aria-pressed={lists.onlyBuiltin}
      onClick={() => lists.setBuiltinOnly((on) => !on)}
      data-testid="tr-filter-builtin"
    >
      Встроенный ИИ · {lists.builtinCount}
    </Button>
  );
}

/** Итог запущенного пакета; «Открыть в «Проверить ИИ»» ставит вкладку и фильтр, нового экрана проверки нет. */
export function StartedBatchResult({ lists, started }: { lists: TranslationLists; started: StartedBatch }) {
  if (started.batchId === null) return null;
  return (
    <BatchResult
      batchId={started.batchId}
      onDismiss={started.forget}
      onOpenReview={() => {
        lists.setScope("all");
        lists.setType("");
        lists.setQ("");
        lists.setBuiltinOnly(true);
        lists.setTab("review");
        started.forget();
      }}
    />
  );
}

/** Кнопка встроенного ИИ для вкладки; нет её (`undefined`) — ИИ недоступен или вкладка не про перевод. */
export function builtinAiSlot(
  active: Bucket,
  ready: boolean,
  strings: UniqueString[],
  langs: readonly TrLocale[],
  onStarted: (id: number) => void
): ReactNode {
  if (!ready || (active !== "missing" && active !== "stale")) return undefined;
  return <BuiltinAiButton strings={strings} langs={langs} emphasis={active === "missing"} onStarted={onStarted} />;
}
