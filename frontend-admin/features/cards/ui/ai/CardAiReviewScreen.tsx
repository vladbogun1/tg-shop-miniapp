"use client";

/**
 * Страница проверки результата ИИ по карточке: `/cards/ai-review/[jobId]`. Идёт ли задача, сбой, готово — всё здесь:
 * ссылка из чипа ✦ и из шторки ведёт сюда же. Само ревью — общая с ручным путём `CardReviewPanel`; здесь то, что
 * есть только у задачи: конфликт правок, «Повторить», «Отклонить», ответ и промпт, отчёт серверу о счётчиках исхода.
 */
import {
  ApplyUndoBar,
  AiJobFailure,
  AiJobProgress,
  AiReview,
  type AiMenuItem as MenuItem,
  editedBanner,
  mostlyConflicted,
  useAiJob,
  useApplyLive,
  useCancelJob,
  useJobOutcome,
  useRetryJob,
  type AiJob,
  type OutcomeCounts,
} from "@/features/ai";
import { CenterSpinner } from "@/components/ui/Spinner";
import { useFinanceAccess } from "@/features/procurement";
import { Button } from "@shop/ui/admin-button";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { invalidateCards } from "../../queries";
import { CardCompletionModal } from "../completion/CardCompletionModal";
import { startCardJob, useCardSubject } from "./card-subject";
import { ReviewNotices } from "./ReviewNotices";
import { ReviewTextDialog } from "./ReviewTextDialog";
import { CardReviewPanel } from "./CardReviewPanel";
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
  const outcome = useJobOutcome();
  const live = useApplyLive(job.id);
  const qc = useQueryClient();
  const [appliedNow, setAppliedNow] = useState(false);
  // После отмены применения ревью начинается заново: новый ключ — свежий выбор и правки.
  const [round, setRound] = useState(0);
  const [dialog, setDialog] = useState<"answer" | "prompt" | null>(null);
  const { mostly, edited, finished, doneText } = statusOf(job, data, appliedNow);
  // Ответ, вставленный из ChatGPT вручную: повторять встроенным ИИ нечего, его вставляют заново.
  const pasted = job.path === "MANUAL";
  const canRetryMore = !pasted && (finance || job.retryOf === 0);
  const report = (o: OutcomeCounts) => outcome.mutate({ id: job.id, outcome: o });

  const menu = (rejectCounts: () => OutcomeCounts) =>
    reviewMenu({
      onManual: p.onManual,
      onRetry: canRetryMore ? () => retry.mutate(job.id, { onSuccess: (j) => p.toJob(j.id) }) : null,
      onReject: finished
        ? null
        : () => {
            report(rejectCounts());
            router.push("/cards");
          },
      onAnswer: job.answer ? () => setDialog("answer") : null,
      onPrompt: job.prompt ? () => setDialog("prompt") : null,
    });
  const notices = (
    <>
      <ApplyUndoBar
        jobId={job.id}
        note={UNDO_NOTE}
        onUndone={() => {
          // Значения карточки на сервере вернулись: ревью заново — по свежей выгрузке, а не по кэшу после записи.
          invalidateCards(qc);
          setAppliedNow(false);
          setRound((r) => r + 1);
        }}
      />
      <ReviewNotices
        problems={data.problems}
        edited={edited}
        mostly={mostly}
        onFresh={pasted ? undefined : () => void startCardJob({ item, schema, created: false, idemKey: `fresh-${job.id}` }).then((j) => p.toJob(j.id))}
      />
    </>
  );

  return (
    <>
      {data.review && data.ctx ? (
        <CardReviewPanel
          key={round}
          item={item}
          review={data.review}
          ctx={data.ctx}
          created={item.unfinished === true}
          title={item.title}
          finishedAt={job.finishedAt}
          doneText={doneText}
          notices={notices}
          onBack={() => router.back()}
          menu={menu}
          jobId={() => Promise.resolve(job.id)}
          onApplied={(o) => {
            setAppliedNow(true);
            report(o);
            void live.refetch();
          }}
        />
      ) : (
        <AiReview finishedAt={job.finishedAt} title={item.title} fields={[]} selected={new Set()} onSelected={() => undefined} onApply={() => undefined} applying={false} doneText={doneText} menu={menu(() => ({ applied: 0, rejected: 0, edited: 0, ignoredLocked: 0 }))} onBack={() => router.back()} notices={notices} />
      )}
      {dialog && <ReviewTextDialog title={dialog === "answer" ? (pasted ? "Ответ ChatGPT" : "Ответ ИИ") : "Промпт"} text={(dialog === "answer" ? job.answer : job.prompt) ?? ""} onClose={() => setDialog(null)} />}
      {p.manualModal}
    </>
  );
}

/** Что вернёт отмена применения (поля журнала у карточки) и что нет. */
const UNDO_NOTE = "Вернутся характеристики (и удалённые заменой), название, описание, категория и бренд; фото, переводы, статус и витрина останутся как есть.";

/** Что показать над ревью и в подвале: заметно ли изменилась карточка, применён ли результат уже. */
function statusOf(job: AiJob, data: ReturnType<typeof useCardAiReview>, appliedNow: boolean) {
  const conflicted = data.rows.filter((x) => x.conflict).length;
  const finished = appliedNow || !!job.outcome;
  const text = !job.outcome ? null : job.outcome === "REJECTED" ? "Результат отклонён" : "Результат применён";
  const changed = data.versionChanged && !finished;
  const edited = !changed ? null : data.changes ? editedBanner(data.changes.editors, conflicted, data.rows.length) : "Карточку изменили после запуска ИИ — заменять заполненные поля ИИ не будет";
  return { mostly: changed && mostlyConflicted(conflicted, data.rows.length), edited, finished, doneText: text };
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
