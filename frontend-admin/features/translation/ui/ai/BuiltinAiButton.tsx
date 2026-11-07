"use client";

/**
 * «Перевести с ИИ (N)» над списком: встроенный ИИ переводит строки, которые показывает список, пакетом — по задаче на
 * часть (до 60 строк, как на ручном пути). Подтверждение показывает части и минуты (финансисту — ещё деньги); готовое
 * ждёт во вкладке «Проверить ИИ», ручные переводы сервер не заменяет. Пока ИИ выключен, не подключён или упёрся в лимит,
 * кнопки нет (`useBuiltinAiReady`): остаётся только ручной путь («Через ChatGPT»).
 */
import { BatchConfirm, newIdemKey, unavailableReason, useAiFinanceFlag, useAiSummary } from "@/features/ai";
import { errorMessage } from "@shop/core/errors";
import { Button } from "@shop/ui/admin-button";
import { Sparkles } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { plural } from "../../model/plural";
import { buildBatchParts, partsCaption, TRANSLATION_PROMPT_VERSION } from "../../model/ai-batch";
import type { UniqueString } from "../../model/workset";
import { useStartTranslationBatch } from "../../queries";

/** Встроенным ИИ можно переводить сейчас: подключён, включён, функция «Переводы» включена, лимит не исчерпан. */
export function useBuiltinAiReady(): boolean {
  const summary = useAiSummary();
  return unavailableReason(summary.data, "TRANSLATION", summary.isError) === null;
}

export function BuiltinAiButton({
  strings,
  onStarted,
  emphasis = true,
}: {
  strings: UniqueString[];
  /** Пакет поставлен: экран запоминает его номер, чтобы показать итог. */
  onStarted: (batchId: number) => void;
  /** Главная кнопка вкладки (акцентная) или вторичная. */
  emphasis?: boolean;
}) {
  const finance = useAiFinanceFlag();
  const parts = useMemo(() => buildBatchParts(strings), [strings]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newIdemKey());
  const start = useStartTranslationBatch();

  if (parts.length === 0) return null;

  async function run() {
    setError(null);
    try {
      const batch = await start.mutateAsync({
        body: { items: parts.map((p) => ({ part: p.part, prompt: p.prompt })), promptVersion: TRANSLATION_PROMPT_VERSION },
        idemKey: key.current,
      });
      key.current = newIdemKey();
      setOpen(false);
      onStarted(batch.id);
    } catch (e) {
      setError(errorMessage(e, undefined, "Не удалось запустить перевод"));
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant={emphasis ? "accent" : "outline"}
        icon={<Sparkles className="h-4 w-4" />}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        data-testid="tr-ai-start"
      >
        Перевести с ИИ ({strings.length})
      </Button>
      <span className="text-[12px] leading-tight text-[var(--text-muted)]" data-testid="tr-ai-caption">
        {partsCaption(parts)}
      </span>
      <BatchConfirm
        open={open}
        onClose={() => setOpen(false)}
        feature="TRANSLATION"
        count={parts.length}
        noun={plural(parts.length, "часть", "части", "частей")}
        title="Перевести с ИИ"
        description="ИИ переведёт тексты по частям. Окно можно закрыть: ход виден в полосе вверху. Переводы появятся во вкладке «Проверить ИИ», покупатель увидит их сразу; переводы, написанные вручную, не заменяются."
        finance={finance}
        starting={start.isPending}
        onStart={() => void run()}
        error={error}
      />
    </div>
  );
}
