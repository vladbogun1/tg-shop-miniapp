"use client";

/**
 * Черновик «Поставки с ИИ» (route "/preorders/drafts/{id}", сюда ведёт и пуш «Поставка готова — проверьте»): пока ИИ
 * работает — его ход и «Остановить»; не вышло — почему и «Повторить»; готово — проверка и «Принять»; принят — ссылка
 * на поставку. Страницу можно закрыть в любой момент: работа идёт на сервере.
 */
import { Button } from "@shop/ui/admin-button";
import { ArrowLeft, RotateCcw, Square } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { QueryState } from "@/components/ui/QueryState";
import { useFinanceAccess } from "@/features/procurement";
import type { SupplyDraft } from "../../api-drafts";
import { useDraft, useRetryDraft, useStopDraft } from "../../queries-drafts";
import { Accepted } from "./AcceptedNext";
import { DraftHeader } from "./DraftHeader";
import { DraftNotes, DraftProgress } from "./DraftProgress";
import { DraftReview } from "./DraftReview";

function Working({ draft, finance }: { draft: SupplyDraft; finance: boolean }) {
  const stop = useStopDraft(draft.id);
  const retry = useRetryDraft(draft.id);
  const main =
    draft.status === "RUNNING" ? (
      <Button variant="outline" icon={<Square className="h-4 w-4" />} loading={stop.isPending} onClick={() => stop.mutate()}>
        Остановить
      </Button>
    ) : (
      <Button variant="accent" icon={<RotateCcw className="h-4 w-4" />} loading={retry.isPending} onClick={() => retry.mutate()}>
        Повторить
      </Button>
    );
  return (
    <>
      <DraftHeader draft={draft} main={main} />
      <DraftProgress draft={draft} finance={finance} />
      <DraftNotes draft={draft} />
    </>
  );
}

function DraftView({ draft, onConflict }: { draft: SupplyDraft; onConflict: () => void }) {
  const finance = useFinanceAccess();
  if (draft.status === "ACCEPTED") return <Accepted draft={draft} />;
  if (draft.status === "READY") return <DraftReview draft={draft} finance={finance} onConflict={onConflict} />;
  return <Working draft={draft} finance={finance} />;
}

export function DraftScreen() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const q = useDraft(id);
  // Черновик поменяли в другом окне: перечитать и начать проверку заново с серверной версии.
  const [epoch, setEpoch] = useState(0);
  const { refetch } = q;
  const onConflict = useCallback(() => void refetch().then(() => setEpoch((e) => e + 1)), [refetch]);
  return (
    <div className="min-w-0">
      <Link href="/preorders?tab=drafts" className="hit mb-3 inline-flex items-center gap-1.5 text-[13px] text-[var(--text-muted)] hover:text-[var(--text)]">
        <ArrowLeft className="h-4 w-4" /> Черновики поставок
      </Link>
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка черновика">
        {q.data && <DraftView key={`${q.data.id}:${q.data.status}:${epoch}`} draft={q.data} onConflict={onConflict} />}
      </QueryState>
    </div>
  );
}
