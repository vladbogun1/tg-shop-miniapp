"use client";

/**
 * Completion of ONE product card by any external AI — right after a product is created with only
 * a title (it is saved hidden: active=false, card DRAFT) or from the product list / «Карточки»
 * («Оформить с ИИ»). Same prompt (batch of 1), same check and the same review card as step 3 of
 * «Оформление с ИИ», plus publishing: «Сразу выложить на витрину» sends `publish` with the import;
 * when the backend refuses because the price is missing, the price is asked for inline and the
 * product is published with PATCH …/active.
 *
 * Usage: <CardCompletionModal productId={id} open={open} reason="created" onClose={(r) => …} />
 */
import { Modal } from "@shop/ui/overlay";
import { CenterSpinner } from "@/components/ui/Spinner";
import { invalidateCards } from "../../queries";
import { AddOptionModal } from "../AddOptionModal";
import { CompletionFooter } from "./CompletionFooter";
import { AnswerStep } from "./AnswerStep";
import { HiddenNotice } from "./HiddenNotice";
import { ProblemBox } from "./ProblemBox";
import { PromptStep } from "./PromptStep";
import { ReviewStep } from "./ReviewStep";
import { useCardCompletion } from "./use-card-completion";
import type { CardCompletionResult } from "./use-completion-save";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@shop/ui/admin-button";
import { ManualBody } from "./ManualBody";
import { CardAiEntry } from "../ai/CardAiEntry";

export type { CardCompletionResult };

export function CardCompletionModal({
  productId,
  open,
  onClose,
  reason = "manual",
  manualOnly = false,
}: {
  productId: string;
  open: boolean;
  onClose: (result?: CardCompletionResult) => void;
  reason?: "created" | "manual";
  /** Сразу ручной путь (без входа во встроенный ИИ): его открывают из экрана проверки ИИ. */
  manualOnly?: boolean;
}) {
  const [manual, setManual] = useState(manualOnly);
  const qc = useQueryClient();
  const c = useCardCompletion({ productId, open, reason, onClose });
  const { item, saved, answer, addOption, setAddOption } = c;

  return (
    <>
      <Modal
        open={open}
        onClose={c.close}
        size="lg"
        closeOnBackdrop={false}
        dirty={manual && !!answer.trim() && !saved}
        dirtyMessage="Ответ ИИ вставлен, но не сохранён. Закрыть без сохранения?"
        title={item ? `${manual ? "Вручную" : "Заполнить с ИИ"}: ${item.title}` : "Оформить карточку с ИИ"}
        footer={manual ? <CompletionFooter c={c} /> : undefined}
      >
        {!manual ? (
          <CardAiEntry
            productId={productId}
            created={reason === "created"}
            onManual={() => setManual(true)}
            onSheetClose={() => onClose({ saved: false, published: false })}
          />
        ) : (
          <ManualBody c={c} onBackToAi={manualOnly ? undefined : () => setManual(false)} />
        )}
      </Modal>
      {addOption && (
        <AddOptionModal
          proposal={addOption}
          onClose={() => setAddOption(null)}
          onAdded={() => {
            setAddOption(null);
            invalidateCards(qc, true);
          }}
        />
      )}
    </>
  );
}
