"use client";

import { errorMessage } from "@shop/core/errors";
import { nowMs } from "@shop/core/time";
import { Button } from "@shop/ui/admin-button";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { useState } from "react";
import type { AiSafeApplied } from "../../api-batch";
import { safeTotals, undoLeft, type SafeTotals } from "../../model/batch-view";
import { useUndoBatch } from "../../queries-batch";

type Phase = { kind: "ask" } | { kind: "run" } | { kind: "done"; applied: AiSafeApplied[] } | { kind: "error"; text: string };

interface Counts {
  cards: number;
  fields: number;
}

/**
 * «Принять безопасное»: сначала что именно произойдёт (сколько карточек и полей, что не трогаем), потом запись,
 * потом точные числа и «Отменить применение» на 24 часа. Саму запись делает вызывающий (`run`): она зависит от
 * предмета пакета. Сервер сам проверяет обещание и возвращает назад то, что вышло за него (число — в итоге).
 */
export function AcceptSafeDialog(
  p: { open: boolean; onClose: () => void; batchId: number; run: () => Promise<AiSafeApplied[]>; /** Ответы из ChatGPT вручную, а не встроенного ИИ. */ manual?: boolean } & Counts,
) {
  const [phase, setPhase] = useState<Phase>({ kind: "ask" });

  async function go() {
    setPhase({ kind: "run" });
    try {
      setPhase({ kind: "done", applied: await p.run() });
    } catch (e) {
      setPhase({ kind: "error", text: errorMessage(e, undefined, "Не удалось применить") });
    }
  }

  return (
    <Modal open={p.open} onClose={p.onClose} size="sm" title="Принять безопасное" footer={<Footer p={p} phase={phase} go={() => void go()} />}>
      <div className="flex flex-col gap-2 text-[13px]" data-testid="safe-dialog">
        <Body phase={phase} cards={p.cards} fields={p.fields} manual={p.manual === true} />
      </div>
    </Modal>
  );
}

function Footer({ p, phase, go }: { p: { onClose: () => void; batchId: number }; phase: Phase; go: () => void }) {
  const undo = useUndoBatch();
  const wrote = phase.kind === "done" && safeTotals(phase.applied).fields > 0;
  return (
    <div className="flex w-full flex-wrap justify-end gap-2">
      {phase.kind === "ask" && (
        <>
          <ModalCancel />
          <Button variant="accent" onClick={go} data-testid="safe-go">
            Принять
          </Button>
        </>
      )}
      {wrote && (
        <Button variant="outline" loading={undo.isPending} onClick={() => undo.mutate(p.batchId, { onSuccess: p.onClose })} data-testid="safe-undo">
          Отменить применение
        </Button>
      )}
      {(phase.kind === "done" || phase.kind === "error") && (
        <Button variant="surface" onClick={p.onClose}>
          Закрыть
        </Button>
      )}
    </div>
  );
}

function Body({ phase, cards, fields, manual }: { phase: Phase; manual: boolean } & Counts) {
  if (phase.kind === "run") return <p>Записываю…</p>;
  if (phase.kind === "error") return <p className="font-semibold text-[var(--danger-ink)]">{phase.text}</p>;
  if (phase.kind === "done") return <Result applied={phase.applied} totals={safeTotals(phase.applied)} />;
  return (
    <>
      <div className="text-[15px] font-semibold text-[var(--ink)]">
        {fields} полей в {cards} карточках
      </div>
      <p className="leading-snug text-[var(--text-muted)]">
        Заполним только пустые характеристики и пустое описание — {manual ? "из вставленных ответов ChatGPT" : "там, где ИИ искал в интернете"}. Название, бренд,
        категорию и всё, что уже заполнено, не трогаем. Отменить можно 24 часа.
      </p>
    </>
  );
}

function Result({ applied, totals }: { applied: AiSafeApplied[]; totals: SafeTotals }) {
  const until = applied.map((a) => a.undoUntil).filter(Boolean).sort()[0];
  const left = totals.fields > 0 ? undoLeft(until, nowMs()) : null;
  return (
    <>
      <div className="text-[15px] font-semibold text-[var(--ink)]" data-testid="safe-result">
        Записано полей: {totals.fields}, карточек: {totals.cards}
      </div>
      {totals.reverted > 0 && <p className="text-[var(--warn)]">В {totals.reverted} карточках запись вышла за «безопасное», её вернули назад.</p>}
      {left && <p className="text-[var(--text-muted)]">Отменить можно ещё {left}.</p>}
    </>
  );
}
