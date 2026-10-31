"use client";

/** «Принять уверенные»: карточки из «Проверить» с уверенностью ≥ 90 % и всеми обязательными принимаются без просмотра, по одной. */
import { useQueryClient } from "@tanstack/react-query";
import { useApiMutation } from "@shop/ui/mutation";
import { toast } from "@shop/ui/toast";
import { useConfirm } from "@shop/ui/confirm";
import { cardsApi } from "../../api";
import { invalidateCards } from "../../queries";
import type { CardItem } from "../../model/item";
import { BULK_ACCEPT_MIN, cardsWord } from "../../model/view";

function ConfirmMessage({ skipped }: { skipped: number }) {
  return (
    <div className="flex flex-col gap-2">
      <p>
        Это карточки от ИИ с уверенностью {BULK_ACCEPT_MIN} % и выше, где заполнены все обязательные характеристики. Они уйдут в «Готово» и
        запишутся как проверенные вами.
      </p>
      {skipped > 0 && (
        <p className="text-[var(--text-faint)]">
          Ещё {skipped} из выбранных не подходят (уверенность ниже {BULK_ACCEPT_MIN} %, не хватает полей или не из «Проверить») — их нужно открыть и
          посмотреть.
        </p>
      )}
    </div>
  );
}

/** Принимает по одной; на первой ошибке останавливается и возвращает, сколько успело. */
async function acceptAll(items: CardItem[]): Promise<{ done: number; failed: boolean }> {
  let done = 0;
  try {
    for (const it of items) {
      await cardsApi.accept(it.id, { ready: true });
      done++;
    }
    return { done, failed: false };
  } catch {
    return { done, failed: true };
  }
}

export function useBulkAccept({ selectedCount, bulkOk, onFinished }: { selectedCount: number; bulkOk: CardItem[]; onFinished: () => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const mutation = useApiMutation<{ done: number; failed: boolean }, CardItem[]>({
    mutationFn: acceptAll,
    toastOnError: false,
    onSuccess: ({ done, failed }, items) => {
      if (failed) toast.error(`Принято ${done} из ${items.length}, дальше ошибка — попробуйте ещё раз`);
      else toast.success(`Принято ${done} ${cardsWord(done)} — они в «Готово»`);
      onFinished();
      invalidateCards(qc);
    },
  });

  async function bulkAccept() {
    if (!bulkOk.length || mutation.isPending) return;
    const ok = await confirm({
      title: `Принять ${bulkOk.length} ${cardsWord(bulkOk.length)} без просмотра?`,
      message: <ConfirmMessage skipped={selectedCount - bulkOk.length} />,
      confirmLabel: `Принять ${bulkOk.length}`,
    });
    if (ok) mutation.mutate(bulkOk);
  }

  return { bulkAccept, busy: mutation.isPending };
}
