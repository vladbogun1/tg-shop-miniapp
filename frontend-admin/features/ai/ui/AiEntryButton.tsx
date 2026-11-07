"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import type { AiFeature } from "../api";
import { aboutDuration, unavailableReason } from "../model/availability";
import { uahFromMinor } from "../model/format";
import { useAiEstimate, useAiSummary } from "../queries";
import { AiUnavailable } from "./AiUnavailable";

/**
 * Вход «Заполнить с ИИ» для одного товара: акцентная кнопка с «около минуты» и вторичная «Через ChatGPT вручную».
 * Если ИИ выключен, не подключён или упёрся в лимит — вместо акцентной кнопки причина, а ручной путь выдвигается
 * вперёд. Деньги показываются, только если вызывающий передал `showMoney` (финансовый админ).
 */
export function AiEntryButton({
  feature,
  showMoney = false,
  onStart,
  onManual,
  manualLabel = "Через ChatGPT вручную",
  className,
}: {
  feature: AiFeature;
  /** Деньги (обычно/не больше) — только финансовым админам: решает вызывающий. */
  showMoney?: boolean;
  onStart: () => void;
  onManual: () => void;
  manualLabel?: string;
  className?: string;
}) {
  const summary = useAiSummary();
  const reason = unavailableReason(summary.data, feature, summary.isError);
  const ready = reason === null;
  const estimate = useAiEstimate(ready ? { feature, mode: "NORMAL", items: 1 } : null);

  if (reason === undefined) {
    return (
      <div className={className}>
        <Button variant="surface" onClick={onManual}>{manualLabel}</Button>
      </div>
    );
  }
  if (reason) {
    return (
      <div className={className}>
        <div className="flex flex-col gap-3">
          <AiUnavailable reason={reason} />
          <div><Button variant="accent" onClick={onManual}>{manualLabel}</Button></div>
        </div>
      </div>
    );
  }
  const e = estimate.data;
  return (
    <div className={className}>
      <div className="flex flex-col gap-2">
        <Button variant="accent" size="lg" icon={<Sparkles className="h-4 w-4" />} onClick={onStart} className="w-full sm:w-auto">
          Заполнить с ИИ
        </Button>
        <div className="text-[12px] text-[var(--text-muted)]">
          {e ? aboutDuration(e.seconds) : "около минуты"}
          {showMoney && e ? ` · обычно ${uahFromMinor(e.p50Minor)}, не больше ${uahFromMinor(e.p90Minor)}` : ""}
        </div>
        <div><Button variant="surface" size="sm" onClick={onManual}>{manualLabel}</Button></div>
      </div>
    </div>
  );
}
