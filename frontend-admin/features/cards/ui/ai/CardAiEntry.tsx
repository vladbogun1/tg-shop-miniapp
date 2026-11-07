"use client";

import { AiEntryButton, AiJobSheet } from "@/features/ai";
import { useFinanceAccess } from "@/features/procurement";
import { useState } from "react";
import { startCardJob, useCardSubject } from "./card-subject";

/**
 * Вход «Заполнить с ИИ» для одного товара: акцентная кнопка → шторка запуска → страница проверки. «Через ChatGPT
 * вручную» зовёт `onManual` (старый мастер с вставкой ответа). Все три входа (после создания товара, строка списка,
 * товар поставки) используют этот компонент.
 */
export function CardAiEntry({
  productId,
  created,
  onManual,
  onSheetClose,
  className,
}: {
  productId: string;
  created: boolean;
  onManual: () => void;
  /** Окно запуска закрыто (задача уже стоит в очереди или человек передумал). */
  onSheetClose?: () => void;
  className?: string;
}) {
  const [sheet, setSheet] = useState(false);
  const finance = useFinanceAccess();
  const { item, schema, loading } = useCardSubject(productId);
  const ready = !!item && !!schema && !loading;
  const done = item?.cardStatus === "READY";

  return (
    <>
      <AiEntryButton feature={created ? "CARD" : "COMPLETION"} showMoney={finance} onStart={() => ready && setSheet(true)} onManual={onManual} className={className} />
      {sheet && item && schema && (
        <AiJobSheet
          open
          onClose={() => {
            setSheet(false);
            onSheetClose?.();
          }}
          title={`Заполнить с ИИ: ${item.title}`}
          subjectId={productId}
          start={(idemKey) => startCardJob({ item, schema, created, idemKey })}
          confirmText={done ? "Карточка уже готова. ИИ предложит правки, но ничего не изменится, пока вы не проверите и не нажмёте «Применить»." : undefined}
          reviewHref={(job) => `/cards/ai-review/${job.id}`}
          onManual={() => {
            setSheet(false);
            onManual();
          }}
        />
      )}
    </>
  );
}
