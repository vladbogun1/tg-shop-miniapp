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
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { CenterSpinner } from "@/components/ui/Spinner";
import { Tabs } from "@/components/ui/Tabs";
import { useDebounced } from "@/lib/use-debounced";
import { plural } from "../model/plural";
import { BUCKET_LABEL, BUCKETS, langsOf, splitByBucket, type Bucket, type LangScope, type TypeFilter } from "../model/queue";
import { buildWorkSet } from "../model/workset";
import { useAcceptAll, useTranslationExport, useTranslationStats } from "../queries";
import { AiTranslate } from "./ai/AiTranslate";
import { TranslationReview } from "./review/TranslationReview";
import { EmptyList, FilterBar, ScreenHeader, TabHint } from "./TabPanel";
import { TranslationQueue } from "./TranslationQueue";

export function TranslationsScreen() {
  const confirm = useConfirm();
  const exportQ = useTranslationExport();
  const { refetch: refetchStats } = useTranslationStats();
  const acceptAllM = useAcceptAll();
  const ws = useMemo(() => (exportQ.data ? buildWorkSet(exportQ.data.uk, exportQ.data.en) : null), [exportQ.data]);

  const [tab, setTab] = useState<Bucket | null>(null);
  const [scope, setScope] = useState<LangScope>("all");
  const [type, setType] = useState<TypeFilter>("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 200).trim().toLowerCase();
  const [review, setReview] = useState<{ queue: string[]; start: number; bucket: Bucket } | null>(null);
  const [ai, setAi] = useState<string[] | null>(null);
  const langs = langsOf(scope);

  const byBucket = useMemo(
    () => splitByBucket(ws?.strings ?? [], langsOf(scope), type, dq),
    [ws, scope, type, dq]
  );

  // First visit: open the first tab that has work.
  useEffect(() => {
    if (tab || !ws) return;
    setTab(BUCKETS.find((b) => byBucket[b].length > 0) ?? "missing");
  }, [ws, tab, byBucket]);

  const active: Bucket = tab ?? "missing";
  const list = byBucket[active];
  const filtered = !!(type || dq);

  function openReview(start: number) {
    setReview({ queue: list.map((s) => s.sourceHash), start, bucket: active });
    window.scrollTo({ top: 0 });
  }

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
      {ai && !review && <AiTranslate ws={ws} scope={ai} onClose={() => setAi(null)} />}

      <div hidden={!!review || !!ai}>
        <Tabs<Bucket>
          className="mb-4 overflow-y-hidden"
          value={active}
          onChange={setTab}
          items={BUCKETS.map((b) => ({ value: b, label: BUCKET_LABEL[b], count: byBucket[b].length }))}
        />
        <FilterBar scope={scope} onScope={setScope} type={type} onType={setType} q={q} onQ={setQ} />
        <TabHint
          active={active}
          count={list.length}
          bulkBusy={acceptAllM.isPending}
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
          <TranslationQueue key={`${active}|${scope}|${type}|${dq}`} strings={list} langs={langs} onOpen={openReview} />
        )}
      </div>
    </div>
  );
}
