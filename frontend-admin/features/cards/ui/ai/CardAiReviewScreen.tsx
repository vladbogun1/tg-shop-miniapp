"use client";

/**
 * Страница проверки результата ИИ по карточке: `/cards/ai-review/[jobId]`. Идёт ли задача, сбой, готово — всё здесь:
 * ссылка из чипа ✦ и из шторки ведёт сюда же. Применение — тем же путём, что у ручного мастера (импорт карточки,
 * метка ИИ в card_meta), затем серверу уходят счётчики исхода.
 */
import {
  AiJobFailure,
  AiJobProgress,
  AiReview,
  type AiMenuItem as MenuItem,
  mostlyConflicted,
  useAiJob,
  useCancelJob,
  useRetryJob,
  type AiJob,
} from "@/features/ai";
import { CenterSpinner } from "@/components/ui/Spinner";
import { useFinanceAccess } from "@/features/procurement";
import { Button } from "@shop/ui/admin-button";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { CardCompletionModal } from "../completion/CardCompletionModal";
import { startCardJob, useCardSubject } from "./card-subject";
import { ReviewNotices } from "./ReviewNotices";
import { ReviewTextDialog } from "./ReviewTextDialog";
import { useCardAiApply } from "./use-card-ai-apply";
import { useCardAiReview } from "./use-card-ai-review";

type Subject = NonNullable<ReturnType<typeof useCardSubject>["item"]>;
type Schema = NonNullable<ReturnType<typeof useCardSubject>["schema"]>;

export function CardAiReviewScreen({ jobId }: { jobId: number }) {
  const q = useAiJob(Number.isFinite(jobId) ? jobId : null);
  const router = useRouter();
  if (q.isLoading) return <CenterSpinner label="Загрузка задачи…" />;
  if (!q.data) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-start gap-3 py-8">
        <div className="text-[14px] font-semibold text-[var(--ink)]">Задача не найдена — возможно, её уже убрали.</div>
        <Button variant="surface" onClick={() => router.push("/cards")}>К карточкам</Button>
      </div>
    );
  }
  return <JobScreen job={q.data} />;
}

function JobScreen({ job }: { job: AiJob }) {
  const router = useRouter();
  const subject = useCardSubject(job.subjectId);
  const retry = useRetryJob();
  const cancel = useCancelJob();
  const [manual, setManual] = useState(false);
  const toJob = (id: number) => router.replace(`/cards/ai-review/${id}`);
  const manualModal = manual ? (
    <CardCompletionModal productId={job.subjectId} open reason="manual" manualOnly onClose={() => { setManual(false); router.push("/cards"); }} />
  ) : null;

  if (job.status === "QUEUED" || job.status === "RUNNING") {
    return (
      <div className="mx-auto max-w-md py-6">
        <AiJobProgress job={job} onCancel={() => cancel.mutate(job.id)} cancelling={cancel.isPending} />
      </div>
    );
  }
  if (job.status !== "DONE") {
    return (
      <div className="mx-auto max-w-md py-6">
        <AiJobFailure job={job} onManual={() => setManual(true)} onRetry={() => retry.mutate(job.id, { onSuccess: (j) => toJob(j.id) })} retrying={retry.isPending} />
        {manualModal}
      </div>
    );
  }
  if (subject.loading) return <CenterSpinner label="Загрузка товара…" />;
  if (!subject.item || !subject.schema) {
    return <div className="py-8 text-[14px] font-semibold text-[var(--danger-ink)]">Товар не найден или схема каталога не загрузилась.</div>;
  }
  return <ReviewBody job={job} item={subject.item} schema={subject.schema} onManual={() => setManual(true)} manualModal={manualModal} toJob={toJob} />;
}

function ReviewBody(p: { job: AiJob; item: Subject; schema: Schema; onManual: () => void; manualModal: ReactNode; toJob: (id: number) => void }) {
  const { job, item, schema } = p;
  const router = useRouter();
  const finance = useFinanceAccess();
  const data = useCardAiReview(job, item, schema);
  const retry = useRetryJob();
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [translations, setTranslations] = useState(true);
  const [publish, setPublish] = useState(item.active !== true);
  const [dialog, setDialog] = useState<"answer" | "prompt" | null>(null);
  const selected = picked ?? data.initial;
  const act = useCardAiApply({ job, item, review: data.review, rows: data.rows, selected, translations, publish });

  const { mostly, finished, doneText } = statusOf(job, data, act.applied);
  const canRetryMore = finance || job.retryOf === 0;

  const menu = reviewMenu({
    onManual: p.onManual,
    onRetry: canRetryMore ? () => retry.mutate(job.id, { onSuccess: (j) => p.toJob(j.id) }) : null,
    onReject: finished ? null : act.reject,
    onAnswer: job.answer ? () => setDialog("answer") : null,
    onPrompt: job.prompt ? () => setDialog("prompt") : null,
  });

  return (
    <>
      <AiReview
        job={job}
        title={item.title}
        fields={data.rows}
        selected={selected}
        onSelected={setPicked}
        onApply={act.apply}
        applying={act.saving}
        doneText={doneText}
        menu={menu}
        onBack={() => router.back()}
        notices={
          <ReviewNotices
            problems={data.problems}
            versionChanged={data.versionChanged}
            mostly={mostly}
            onFresh={() => void startCardJob({ item, schema, created: false, idemKey: `fresh-${job.id}` }).then((j) => p.toJob(j.id))}
            problem={act.problem}
            price={act.price}
            setPrice={act.setPrice}
            priceOk={act.priceMinor !== null}
            onSavePrice={act.savePrice}
          />
        }
        extra={finished ? null : <ApplyOptions item={item} translations={translations} setTranslations={setTranslations} publish={publish} setPublish={setPublish} />}
      />
      {dialog && <ReviewTextDialog title={dialog === "answer" ? "Ответ ИИ" : "Промпт"} text={(dialog === "answer" ? job.answer : job.prompt) ?? ""} onClose={() => setDialog(null)} />}
      {p.manualModal}
    </>
  );
}

/** Что показать над ревью и в подвале: заметно ли изменилась карточка, применён ли результат уже. */
function statusOf(job: AiJob, data: ReturnType<typeof useCardAiReview>, appliedNow: boolean) {
  const conflicted = data.rows.filter((x) => x.conflict).length;
  const finished = appliedNow || !!job.outcome;
  const text = job.outcome === "REJECTED" ? "Результат отклонён" : "Результат применён";
  return { mostly: data.versionChanged && mostlyConflicted(conflicted, data.rows.length), finished, doneText: finished ? text : null };
}

/** Пункты «⋯»: что недоступно (null) — не показываем. */
function reviewMenu(a: { onManual: () => void; onRetry: (() => void) | null; onReject: (() => void) | null; onAnswer: (() => void) | null; onPrompt: (() => void) | null }): MenuItem[] {
  const items: (MenuItem | null)[] = [
    { label: "Заполнить вручную через ChatGPT", onSelect: a.onManual },
    a.onRetry && { label: "Повторить тщательнее", onSelect: a.onRetry },
    a.onReject && { label: "Отклонить", onSelect: a.onReject, danger: true },
    a.onAnswer && { label: "Показать ответ", onSelect: a.onAnswer },
    a.onPrompt && { label: "Показать промпт", onSelect: a.onPrompt },
  ];
  return items.filter((x): x is MenuItem => x !== null);
}

function ApplyOptions(p: { item: Subject; translations: boolean; setTranslations: (v: boolean) => void; publish: boolean; setPublish: (v: boolean) => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] p-3 text-[13px]">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={p.translations} onChange={(e) => p.setTranslations(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
        Сохранить переводы на украинский и английский
      </label>
      {p.item.active !== true && (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={p.publish} onChange={(e) => p.setPublish(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
          Выложить на витрину, если карточка готова
        </label>
      )}
    </div>
  );
}
