"use client";

/**
 * «Оформить с ИИ» (the batch wizard, opened from «Карточки» over the list): 1) the products —
 * preselected by the caller (checked rows, else the current tab), editable here → prompt in
 * batches → 2) paste the answer → 3) review field by field → import. Sure cards (overall ≥ 80,
 * no guessed field) go straight to «Готово», the rest to «Проверить». The prompt lives in
 * lib/card-prompt.ts, parsing and the schema checks in lib/card-check.ts (the backend re-validates
 * everything on import).
 */
import { PartyPopper } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import type { CardItem } from "../../model/item";
import type { CardSchema } from "../../model/schema";
import { AddOptionModal } from "../AddOptionModal";
import { SelectStep } from "./SelectStep";
import { useAnswerReview } from "./use-answer-review";
import { useBatchSelection } from "./use-batch-selection";
import { WizardAnswer } from "./WizardAnswer";
import { WizardReview } from "./WizardReview";

export function AiCards({
  items,
  schema,
  ids,
  preselect,
  preselectLabel,
}: {
  items: CardItem[];
  schema: CardSchema;
  ids: Map<string, string>;
  /** Products to start with (checked rows of the list, else its current tab); a new array = a new start. */
  preselect: string[];
  /** Where the preselection came from («отмеченные», «вкладка „Оформить“»). */
  preselectLabel?: string;
}) {
  const batch = useBatchSelection({ items, schema, ids, preselect });
  const a = useAnswerReview({ items, schema, ids, batchPids: batch.batches.map((b) => b.pids) });

  if (!items.length) {
    return <EmptyState icon={PartyPopper} title="Товаров нет" description="Добавьте товары — и их карточки можно будет оформить здесь." />;
  }

  return (
    <div>
      <SelectStep b={batch} schema={schema} answered={!!a.answer.trim()} preselectLabel={preselectLabel} />
      <WizardAnswer a={a} />
      <WizardReview a={a} schema={schema} />
      {a.addOption && (
        <AddOptionModal
          proposal={a.addOption}
          onClose={() => a.setAddOption(null)}
          onAdded={() => {
            a.setAddOption(null);
            a.invalidateWithSchema();
          }}
        />
      )}
    </div>
  );
}
