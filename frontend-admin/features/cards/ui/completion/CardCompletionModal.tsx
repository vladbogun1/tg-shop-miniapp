"use client";

/**
 * Completion of ONE product card — right after a product is created with only a title (it is saved hidden:
 * active=false, card DRAFT) or from the product list / «Карточки» («Оформить с ИИ»). Opens on the built-in AI
 * (`CardAiEntry`); «Через ChatGPT вручную» gives the same prompt (batch of 1) for any external AI, and the pasted
 * answer is checked in the same review screen as the built-in AI's result (`CardReviewPanel`), publishing included:
 * when the backend refuses because the price is missing, the price is asked for inline.
 *
 * Usage: <CardCompletionModal productId={id} open={open} reason="created" onClose={(r) => …} />
 */
import { Modal } from "@shop/ui/overlay";
import { useState } from "react";
import { CardAiEntry } from "../ai/CardAiEntry";
import { ManualBody } from "./ManualBody";
import { useCardCompletion } from "./use-card-completion";
import type { CardCompletionResult } from "./use-completion-save";

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
  const c = useCardCompletion({ productId, open, reason, onClose });
  const { item, saved, answer } = c;

  return (
    <Modal
      open={open}
      onClose={c.close}
      size="lg"
      closeOnBackdrop={false}
      dirty={manual && !!answer.trim() && !saved}
      dirtyMessage="Ответ ИИ вставлен, но не сохранён. Закрыть без сохранения?"
      title={item ? `${manual ? "Вручную" : "Заполнить с ИИ"}: ${item.title}` : "Оформить карточку с ИИ"}
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
  );
}
