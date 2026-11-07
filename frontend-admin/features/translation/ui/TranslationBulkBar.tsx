"use client";

/**
 * «Переводы»: панель действий над отмеченными текстами. Набор действий зависит от вкладки; всё, что меняет
 * данные пачкой (принять, подтвердить, сбросить), спрашивает подтверждение с числом текстов и последствиями.
 */
import { Button } from "@shop/ui/admin-button";
import { useConfirm } from "@shop/ui/confirm";
import { CheckCheck, ListChecks, RotateCcw, Sparkles } from "lucide-react";
import { BulkBar } from "./bulk";
import { plural } from "../model/plural";
import type { Bucket } from "../model/queue";
import type { TrLocale } from "../model/types";
import type { UniqueString } from "../model/workset";
import { useAcceptAll, useConfirmAsIs, useResetMany } from "../queries";

const texts = (n: number) => `${n} ${plural(n, "текст", "текста", "текстов")}`;

export function TranslationBulkBar({
  bucket,
  chosen,
  langs,
  onClear,
  onAi,
  onReview,
}: {
  bucket: Bucket;
  chosen: UniqueString[];
  langs: TrLocale[];
  onClear: () => void;
  onAi: (hashes: string[]) => void;
  onReview: (hashes: string[]) => void;
}) {
  const confirm = useConfirm();
  const accept = useAcceptAll();
  const confirmAsIs = useConfirmAsIs();
  const reset = useResetMany();
  const where = langs.map((l) => l.toUpperCase()).join(" и ");
  const hashes = chosen.map((s) => s.sourceHash);
  const done = () => onClear();

  async function acceptChosen() {
    const ok = await confirm({
      title: `Принять ${texts(chosen.length)} без просмотра?`,
      message: `Переводы ИИ (${where}) отметятся проверенными и уйдут во вкладку «Готово». Тексты не меняются — покупатель видит то же, что и сейчас.`,
      confirmLabel: `Принять ${chosen.length}`,
    });
    if (ok) accept.mutate({ strings: chosen, langs }, { onSuccess: done });
  }

  async function confirmChosen() {
    const ok = await confirm({
      title: `Подтвердить ${texts(chosen.length)} как есть?`,
      message: `Текущий перевод (${where}) останется без правок, отметится проверенным и снова станет виден покупателю — даже если русский оригинал изменили. Если перевод в разных местах разный, такой текст пропустится.`,
      confirmLabel: `Подтвердить ${chosen.length}`,
    });
    if (ok) confirmAsIs.mutate({ strings: chosen, langs }, { onSuccess: done });
  }

  async function resetChosen() {
    const ok = await confirm({
      title: `Сбросить перевод у ${texts(chosen.length)}?`,
      message: `Переводы (${where}) будут удалены во всех местах, где стоят эти тексты, — покупатель увидит русский оригинал, пока не переведёте заново. Это необратимо.`,
      confirmLabel: "Сбросить",
      danger: true,
    });
    if (ok) reset.mutate({ strings: chosen, langs }, { onSuccess: done });
  }

  return (
    <BulkBar count={chosen.length} noun={plural(chosen.length, "текст", "текста", "текстов")} onClear={onClear}>
      {bucket === "review" && (
        <Button size="sm" variant="accent" icon={<CheckCheck className="h-3.5 w-3.5" />} loading={accept.isPending} onClick={() => void acceptChosen()}>
          Принять
        </Button>
      )}
      {bucket === "stale" && (
        <Button size="sm" variant="accent" icon={<CheckCheck className="h-3.5 w-3.5" />} loading={confirmAsIs.isPending} onClick={() => void confirmChosen()}>
          Подтвердить как есть
        </Button>
      )}
      {bucket !== "done" && (
        <Button size="sm" variant={bucket === "missing" ? "accent" : "outline"} icon={<Sparkles className="h-3.5 w-3.5" />} onClick={() => onAi(hashes)}>
          {bucket === "missing" ? "Перевести через ИИ" : "Перевести заново через ИИ"}
        </Button>
      )}
      <Button size="sm" variant="outline" icon={<ListChecks className="h-3.5 w-3.5" />} onClick={() => onReview(hashes)}>
        По одному
      </Button>
      {bucket !== "missing" && (
        <Button size="sm" variant="outline" icon={<RotateCcw className="h-3.5 w-3.5" />} loading={reset.isPending} onClick={() => void resetChosen()}>
          Сбросить перевод
        </Button>
      )}
    </BulkBar>
  );
}
