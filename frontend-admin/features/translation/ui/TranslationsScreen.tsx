"use client";

/**
 * Translations (route "/translations") — uk/en layer over the Russian content
 * (docs/CONTENT-I18N.md, docs/TRANSLATIONS-UX-AUDIT.md). Russian is the source of truth; a
 * translation is shown only while the original it was made from is unchanged.
 *
 * Tabs by task — one row is one unique Russian text and sits in exactly one tab (model/queue):
 *   «Нужно перевести» → «Устарели» → «Проверить ИИ» → «Готово».
 * Filters: language, kind of text, search. A row opens the review one by one (TranslationReview);
 * «Перевести через ИИ» runs the prompt → answer → check flow (AiTranslate) for what the list shows.
 */
import { Button } from "@shop/ui/admin-button";
import { useConfirm } from "@shop/ui/confirm";
import { Languages, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { CenterSpinner } from "@/components/ui/Spinner";
import { Tabs } from "@/components/ui/Tabs";
import { plural } from "../model/plural";
import { useBuiltinAiReady } from "./ai/BuiltinAiButton";
import { BuiltinFilterButton, builtinAiSlot, StartedBatchResult } from "./ai/screen-parts";
import { useStartedBatch } from "./ai/use-started-batch";
import { BUCKET_LABEL, BUCKETS, type Bucket } from "../model/queue";
import { buildWorkSet } from "../model/workset";
import { useAcceptAll, useTranslationExport, useTranslationStats } from "../queries";
import { AiTranslate } from "./ai/AiTranslate";
import { TranslationReview } from "./review/TranslationReview";
import { StickyToolbar } from "./bulk";
import { EmptyList, FilterBar, ScreenHeader, SelectControls, TabHint } from "./TabPanel";
import { TranslationBulkBar } from "./TranslationBulkBar";
import { TranslationQueue } from "./TranslationQueue";
import { useQueueSelection } from "./use-queue-selection";
import { useTranslationLists } from "./use-translation-lists";

export function TranslationsScreen() {
  const confirm = useConfirm();
  const exportQ = useTranslationExport();
  const { refetch: refetchStats } = useTranslationStats();
  const acceptAllM = useAcceptAll();
  const ws = useMemo(() => (exportQ.data ? buildWorkSet(exportQ.data.uk, exportQ.data.en) : null), [exportQ.data]);

  const v = useTranslationLists(ws);
  const { tab, setTab, scope, setScope, type, setType, q, setQ, langs, byBucket, active, list, filtered } = v;
  const [review, setReview] = useState<{ queue: string[]; start: number; bucket: Bucket } | null>(null);
  const [ai, setAi] = useState<string[] | null>(null);
  const started = useStartedBatch();
  const aiReady = useBuiltinAiReady();
  const sel = useQueueSelection(v.key);

  function openReview(start: number, hashes?: string[]) {
    setReview({ queue: hashes ?? list.map((s) => s.sourceHash), start, bucket: active });
    window.scrollTo({ top: 0 });
  }
  const chosen = list.filter((s) => sel.ids.has(s.sourceHash));

  async function acceptEverything() {
    const n = list.length;
    const ok = await confirm({
      title: `Принять ${n} ${plural(n, "перевод", "перевода", "переводов")} без просмотра?`,
      message: (
        <div className="flex flex-col gap-2">
          <p>
            Переводы ИИ {filtered ? "по текущему фильтру " : ""}({langs.map((l) => l.toUpperCase()).join(" и ")}) будут отмечены как
            проверенные и уйдут во вкладку «Готово». Тексты не меняются — покупатель видит то же, что и сейчас.
          </p>
          <p className="text-[var(--text-faint)]">
            Подходит, если переводы уже смотрели вне админки. Иначе лучше «Проверять по одному».
          </p>
        </div>
      ),
      confirmLabel: `Принять ${n}`,
    });
    if (ok) acceptAllM.mutate({ strings: list, langs });
  }

  const header = (
    <ScreenHeader
      showRefresh={!review && !ai}
      fetching={exportQ.isFetching}
      onRefresh={() => {
        exportQ.refetch();
        refetchStats();
      }}
    />
  );

  if (exportQ.isLoading || (ws && !tab)) {
    return (
      <div>
        {header}
        <CenterSpinner label="Загрузка текстов…" />
      </div>
    );
  }
  if (exportQ.isError || !ws) {
    return (
      <div>
        {header}
        <EmptyState
          icon={Languages}
          title="Не удалось загрузить тексты"
          description="Проверьте соединение и нажмите «Обновить»."
          action={
            <Button variant="outline" icon={<RefreshCw className="h-4 w-4" />} onClick={() => exportQ.refetch()}>
              Обновить
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div>
      {header}

      {review && (
        <TranslationReview
          ws={ws}
          queue={review.queue}
          start={review.start}
          langs={langs}
          title={BUCKET_LABEL[review.bucket]}
          onClose={() => setReview(null)}
        />
      )}

      {/* Stays mounted while open: a pasted answer must survive a refetch. */}
      {ai && !review && <AiTranslate ws={ws} scope={ai} langs={langs} onClose={() => setAi(null)} />}

      <div hidden={!!review || !!ai}>
        <StickyToolbar>
          <Tabs<Bucket>
            className="mb-2 overflow-y-hidden"
            value={active}
            onChange={setTab}
            items={BUCKETS.map((b) => ({ value: b, label: BUCKET_LABEL[b], count: byBucket[b].length }))}
          />
          <FilterBar
            scope={scope}
            onScope={setScope}
            type={type}
            onType={setType}
            q={q}
            onQ={setQ}
            extra={
              <>
                <BuiltinFilterButton lists={v} />
                <SelectControls on={sel.selectMode} total={list.length} onToggle={sel.toggleMode} onAll={() => sel.selectAll(list.map((s) => s.sourceHash))} />
              </>
            }
          />
        </StickyToolbar>
        <StartedBatchResult lists={v} started={started} />
        <TabHint
          active={active}
          count={list.length}
          bulkBusy={acceptAllM.isPending}
          builtinAi={builtinAiSlot(active, aiReady, list, langs, started.remember)}
          onAi={() => setAi(list.map((s) => s.sourceHash))}
          onReview={() => openReview(0)}
          onAcceptAll={() => void acceptEverything()}
        />
        {list.length === 0 ? (
          <EmptyList
            active={active}
            filtered={filtered}
            onReset={() => {
              setQ("");
              setType("");
            }}
          />
        ) : (
          <TranslationQueue key={v.key} strings={list} langs={langs} onOpen={openReview} selection={sel.selection} />
        )}
        <TranslationBulkBar
          bucket={active}
          chosen={chosen}
          langs={langs}
          onClear={sel.clear}
          onAi={setAi}
          onReview={(hashes) => openReview(0, hashes)}
        />
      </div>
    </div>
  );
}
