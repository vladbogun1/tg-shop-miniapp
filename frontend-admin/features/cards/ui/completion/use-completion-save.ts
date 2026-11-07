"use client";

/**
 * Две записи окна оформления: «Сохранить» (ответ ИИ → импорт, при необходимости выложить) и
 * «Сохранить цену и выложить». Ошибки показываем в самом окне (`problem`), а не тостом. Ответ ИИ, у которого есть
 * задача, пишется в рамке журнала применений (`inApplyLog`): его можно отменить 24 часа. Шаги после записи (фото
 * ответа, «Сохранить цену и выложить») называют это применение (`applyId`) — сервер дописывает их в тот же журнал.
 */
import { aiKeys, inApplyLog } from "@/features/ai";
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
  /** «Заменить характеристики целиком»: чего нет в записи, удаляется. */
  replaceSpecs?: boolean;
  /** Задача ответа (null — её нет или она не записалась): запись идёт в журнал применений. */
  jobId?: () => Promise<number | null>;
}

interface SaveOutcome {
  /** Причина, по которой сервер не принял карточку. */
  rejected: string | null;
  problem: PublishProblem | null;
  published: boolean;
  note: string;
  /** Запись журнала применений; null — ответ без задачи. */
  applyId: number | null;
}

async function saveCard({ payload, publish, item, replaceSpecs, jobId }: SaveVars): Promise<SaveOutcome> {
  const write = () => cardsApi.import({ items: [payload], replaceSpecs: replaceSpecs === true });
  const job = jobId ? await jobId() : null;
  const logged = job === null ? null : await inApplyLog(job, "SINGLE", write);
  const res = logged ? logged.value : await write();
  const applyId = logged ? logged.applied.id : null;
  const rejected = res.rejected.find((x) => x.productId === item.id);
  if (rejected) return { rejected: rejected.reason, problem: null, published: false, note: "", applyId };
  const one = res.items.find((x) => x.productId === item.id);
  const note = translatedNote(one);
  if (one?.published) return { rejected: null, problem: null, published: true, note, applyId };
  if (!publish) return { rejected: null, problem: null, published: false, note, applyId };
  if (one) return { rejected: null, problem: publishProblem(one, item.priceMinor), published: false, note, applyId };
  // Older backend without `publish`: put it on the storefront ourselves.
  try {
    await cardsApi.setActive(item.id, true, applyId);
    return { rejected: null, problem: null, published: true, note, applyId };
  } catch (e) {
    const text = `Карточка сохранена, но не выложена: ${errorMessage(e, undefined, "ошибка")}`;
    return { rejected: null, problem: { text, needPrice: !item.priceMinor }, published: false, note, applyId };
  }
}

interface Handlers {
  /** Окно закрывается само после успешной записи. */
  onClose: (result: CardCompletionResult) => void;
  onProblem: (p: PublishProblem | null) => void;
  /** Карточка принята сервером: окно прячет ответ и разбор. `applyId` — запись журнала применений (для фото). */
  onSaved: (published: boolean, applyId: number | null) => void;
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
      onSaved(out.published, out.applyId);
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

  /** `applyId` — выкладка как шаг того же применения: «Отменить применение» снова спрячет товар. */
  const savePrice = useApiMutation<void, { item: CardItem; priceMinor: number; applyId?: number | null }>({
    mutationFn: async ({ item, priceMinor, applyId }) => {
      // Description may have just been replaced by the import — take the current one.
      const fresh = (await cardsApi.export("all", [item.id])).find((i) => i.id === item.id) ?? item;
      await cardsApi.setPrice(fresh, priceMinor);
      await cardsApi.setActive(item.id, true, applyId);
    },
    toastOnError: false,
    onError: (e) => onProblem({ text: `Не выложено: ${errorMessage(e, undefined, "ошибка сети")}`, needPrice: true }),
    onSuccess: () => {
      onPublished();
      invalidateCards(qc);
      // Выкладка дописана в журнал применения — плашка «Отменить применение» перечитывает, что вернётся.
      void qc.invalidateQueries({ queryKey: aiKeys.applyLiveAll() });
      toast.success("Цена сохранена, товар на витрине");
      onClose({ saved: true, published: true });
    },
  });

  return { save, savePrice, saving: save.isPending || savePrice.isPending };
}
