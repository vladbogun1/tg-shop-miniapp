"use client";

/**
 * Две записи окна оформления: «Сохранить» (ответ ИИ → импорт, при необходимости выложить) и
 * «Сохранить цену и выложить». Ошибки показываем в самом окне (`problem`), а не тостом.
 */
import { useQueryClient } from "@tanstack/react-query";
import { errorMessage } from "@shop/core/errors";
import { useApiMutation } from "@shop/ui/mutation";
import { toast } from "@shop/ui/toast";
import { cardsApi } from "../../api";
import { invalidateCards } from "../../queries";
import { HIDDEN_TOAST, publishProblem, translatedNote, type PublishProblem } from "../../model/completion";
import type { CardItem } from "../../model/item";
import type { CardImportItem } from "../../model/wire";

export interface CardCompletionResult {
  saved: boolean;
  published: boolean;
}

interface SaveVars {
  payload: CardImportItem;
  publish: boolean;
  item: CardItem;
}

interface SaveOutcome {
  /** Причина, по которой сервер не принял карточку. */
  rejected: string | null;
  problem: PublishProblem | null;
  published: boolean;
  note: string;
}

async function saveCard({ payload, publish, item }: SaveVars): Promise<SaveOutcome> {
  const res = await cardsApi.import({ items: [payload], replaceSpecs: false });
  const rejected = res.rejected.find((x) => x.productId === item.id);
  if (rejected) return { rejected: rejected.reason, problem: null, published: false, note: "" };
  const one = res.items.find((x) => x.productId === item.id);
  const note = translatedNote(one);
  if (one?.published) return { rejected: null, problem: null, published: true, note };
  if (!publish) return { rejected: null, problem: null, published: false, note };
  if (one) return { rejected: null, problem: publishProblem(one, item.priceMinor), published: false, note };
  // Older backend without `publish`: put it on the storefront ourselves.
  try {
    await cardsApi.setActive(item.id, true);
    return { rejected: null, problem: null, published: true, note };
  } catch (e) {
    const text = `Карточка сохранена, но не выложена: ${errorMessage(e, undefined, "ошибка")}`;
    return { rejected: null, problem: { text, needPrice: !item.priceMinor }, published: false, note };
  }
}

interface Handlers {
  /** Окно закрывается само после успешной записи. */
  onClose: (result: CardCompletionResult) => void;
  onProblem: (p: PublishProblem | null) => void;
  /** Карточка принята сервером: окно прячет ответ и разбор. */
  onSaved: (published: boolean) => void;
  onPublished: () => void;
}

export function useCompletionSave({ onClose, onProblem, onSaved, onPublished }: Handlers) {
  const qc = useQueryClient();

  const save = useApiMutation<SaveOutcome, SaveVars>({
    mutationFn: saveCard,
    toastOnError: false,
    onError: (e) => onProblem({ text: `Не удалось сохранить: ${errorMessage(e, undefined, "ошибка сети")}`, needPrice: false }),
    onSuccess: (out, { publish, item }) => {
      if (out.rejected) {
        onProblem({ text: `Сервер не принял карточку: ${out.rejected}`, needPrice: false });
        return;
      }
      onProblem(out.problem);
      onSaved(out.published);
      invalidateCards(qc);
      if (out.published) {
        toast.success(`Карточка сохранена, товар на витрине${out.note}`);
        onClose({ saved: true, published: true });
      } else if (!publish) {
        if (item.unfinished === true) toast.info(HIDDEN_TOAST);
        else toast.success("Карточка сохранена");
        onClose({ saved: true, published: false });
      }
    },
  });

  const savePrice = useApiMutation<void, { item: CardItem; priceMinor: number }>({
    mutationFn: async ({ item, priceMinor }) => {
      // Description may have just been replaced by the import — take the current one.
      const fresh = (await cardsApi.export("all", [item.id])).find((i) => i.id === item.id) ?? item;
      await cardsApi.setPrice(fresh, priceMinor);
      await cardsApi.setActive(item.id, true);
    },
    toastOnError: false,
    onError: (e) => onProblem({ text: `Не выложено: ${errorMessage(e, undefined, "ошибка сети")}`, needPrice: true }),
    onSuccess: () => {
      onPublished();
      invalidateCards(qc);
      toast.success("Цена сохранена, товар на витрине");
      onClose({ saved: true, published: true });
    },
  });

  return { save, savePrice, saving: save.isPending || savePrice.isPending };
}
