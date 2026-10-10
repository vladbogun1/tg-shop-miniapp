"use client";

/**
 * Translations (route "/translations") — uk/en layer over the Russian content
 * (docs/CONTENT-I18N.md, docs/TRANSLATIONS-UX-AUDIT.md). Russian is the source of truth; a
 * translation is shown only while the original it was made from is unchanged.
 *
 * Tabs by task — one row is one unique Russian text and sits in exactly one tab (lib/translation-queue):
 *   «Нужно перевести» → «Устарели» → «Проверить ИИ» → «Готово».
 * Filters: language, kind of text, search. A row opens the review one by one (TranslationReview);
 * «Перевести через ИИ» runs the prompt → answer → check flow (AiTranslate) for what the list shows.
 */
import { useQueryClient } from "@tanstack/react-query";
import { CheckCheck, Languages, ListChecks, RefreshCw, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import { buildWorkSet, type UniqueString } from "@/lib/translation-check";
import {
  BUCKET_LABEL,
  BUCKETS,
  bucketOf,
  langsOf,
  matchesSearch,
  matchesType,
  TYPE_OPTIONS,
  type Bucket,
  type LangScope,
  type TypeFilter,
} from "@/lib/translation-queue";
import { invalidateTranslations, useTranslationExport, useTranslationStats } from "@/lib/translations";
import { useToast } from "@/lib/toast";
import { useDebounced } from "@/lib/use-debounced";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { CenterSpinner } from "@/components/ui/Spinner";
import { Tabs } from "@/components/ui/Tabs";
import { acceptAll } from "@/components/translations/actions";
import { AiTranslate } from "@/components/translations/AiTranslate";
import { TranslationQueue } from "@/components/translations/TranslationQueue";
import { plural, TranslationReview } from "@/components/translations/TranslationReview";

const TAB_HINT: Record<Bucket, string> = {
  missing: "Нет перевода хотя бы на одном языке — покупатель видит русский текст.",
  stale: "Русский оригинал изменили после перевода. Старый перевод скрыт, пока его не обновят или не подтвердят.",
  review: "Переведено ИИ, но никто не проверял. Покупатель уже видит эти тексты.",
  done: "Проверено человеком или написано вручную.",
};

const EMPTY: Record<Bucket, { title: string; text: string }> = {
  missing: { title: "Всё переведено", text: "У всех текстов есть перевод. Новый товар или категория появятся здесь." },
  stale: { title: "Устаревших нет", text: "Когда поправите русский текст товара, его перевод окажется здесь." },
  review: { title: "Проверять нечего", text: "Все переводы ИИ просмотрены." },
  done: { title: "Пока пусто", text: "Принятые и написанные вручную переводы появятся здесь." },
};

export default function TranslationsPage() {
  const qc = useQueryClient();
  const { push } = useToast();
  const [confirm, confirmUi] = useConfirm();
  const exportQ = useTranslationExport();
  const { refetch: refetchStats } = useTranslationStats();
  const ws = useMemo(() => (exportQ.data ? buildWorkSet(exportQ.data.uk, exportQ.data.en) : null), [exportQ.data]);

  const [tab, setTab] = useState<Bucket | null>(null);
  const [scope, setScope] = useState<LangScope>("all");
  const [type, setType] = useState<TypeFilter>("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 200).trim().toLowerCase();
  const [review, setReview] = useState<{ queue: string[]; start: number; bucket: Bucket } | null>(null);
  const [ai, setAi] = useState<string[] | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const langs = langsOf(scope);

  const byBucket = useMemo(() => {
    const out: Record<Bucket, UniqueString[]> = { missing: [], stale: [], review: [], done: [] };
    if (!ws) return out;
    for (const s of ws.strings) {
      if (!matchesType(s, type) || !matchesSearch(s, dq)) continue;
      out[bucketOf(s, langs)].push(s);
    }
    return out;
    // langs is derived from scope
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, scope, type, dq]);

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
    if (!ok) return;
    setBulkBusy(true);
    try {
      const r = await acceptAll(list, langs);
      push(
        r.outdated || r.failed
          ? `Принято ${r.done}; ${[
              r.outdated ? `оригинал изменился у ${r.outdated}` : "",
              // notFound + invalid: the product/field is gone or the text is broken — not a changed original.
              r.failed ? `не удалось сохранить ${r.failed}` : "",
            ]
              .filter(Boolean)
              .join(", ")} — они остались в списке`
          : `Принято: ${r.done}`,
        r.outdated || r.failed ? "info" : "ok"
      );
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось принять", "error");
    } finally {
      setBulkBusy(false);
      invalidateTranslations(qc);
    }
  }

  const header = (
    <PageHeader
      title="Переводы"
      subtitle="Русский — оригинал. Украинский и английский показываются покупателю, пока русский текст не меняли."
      actions={
        !review &&
        !ai && (
          <Button
            variant="outline"
            icon={<RefreshCw className={exportQ.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
            onClick={() => {
              exportQ.refetch();
              refetchStats();
            }}
          >
            Обновить
          </Button>
        )
      }
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

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <SegmentedControl<LangScope>
            className="h-10 pointer-coarse:h-11"
            value={scope}
            onChange={setScope}
            options={[
              { value: "all", label: "UK + EN" },
              { value: "uk", label: "UK" },
              { value: "en", label: "EN" },
            ]}
          />
          <Select<TypeFilter> className="w-[200px] max-sm:flex-1" value={type} onChange={setType} options={TYPE_OPTIONS} />
          <div className="min-w-[220px] flex-1">
            <Input
              icon={<Search className="h-4 w-4" />}
              placeholder="Поиск по тексту, переводу, товару"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Поиск"
            />
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--bg-2)] px-3.5 py-3">
          <p className="min-w-[220px] flex-1 text-[13px] leading-snug text-[var(--text-muted)]">{TAB_HINT[active]}</p>
          {list.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {active === "missing" && (
                <>
                  <Button variant="accent" icon={<Sparkles className="h-4 w-4" />} onClick={() => setAi(list.map((s) => s.sourceHash))}>
                    Перевести через ИИ · {list.length}
                  </Button>
                  <Button variant="outline" icon={<ListChecks className="h-4 w-4" />} onClick={() => openReview(0)}>
                    Вручную по одному
                  </Button>
                </>
              )}
              {active === "stale" && (
                <>
                  <Button variant="accent" icon={<ListChecks className="h-4 w-4" />} onClick={() => openReview(0)}>
                    Сверить по одному
                  </Button>
                  <Button variant="outline" icon={<Sparkles className="h-4 w-4" />} onClick={() => setAi(list.map((s) => s.sourceHash))}>
                    Перевести заново через ИИ · {list.length}
                  </Button>
                </>
              )}
              {active === "review" && (
                <>
                  <Button variant="accent" icon={<ListChecks className="h-4 w-4" />} onClick={() => openReview(0)}>
                    Проверять по одному
                  </Button>
                  <Button variant="outline" icon={<CheckCheck className="h-4 w-4" />} loading={bulkBusy} onClick={() => void acceptEverything()}>
                    Принять все · {list.length}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {list.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={Search}
              title="Ничего не найдено"
              description="По этому фильтру на вкладке пусто. Сбросьте поиск или тип текста."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setQ("");
                    setType("");
                  }}
                >
                  Сбросить фильтр
                </Button>
              }
            />
          ) : (
            <EmptyState icon={CheckCheck} title={EMPTY[active].title} description={EMPTY[active].text} />
          )
        ) : (
          <TranslationQueue key={`${active}|${scope}|${type}|${dq}`} strings={list} langs={langs} onOpen={openReview} />
        )}
      </div>
      {confirmUi}
    </div>
  );
}
