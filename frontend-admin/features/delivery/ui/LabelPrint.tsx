"use client";

/**
 * «Печать этикетки» + формат (100×100 / 85×85 / A4): один PDF на выбранные заказы.
 * Формат свой у кнопки; на «Отправке» он общий — экран передаёт `format` (и `onFormat` там, где показывать выбор).
 * `confirmFirst` — сначала спросить (коробка не подтверждена): вкладку тогда открываем после ответа, и если
 * браузер её заблокирует, PDF скачается файлом.
 */
import { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { useConfirm, type ConfirmOptions } from "@shop/ui/confirm";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { openLabelsTab } from "../api";
import { LABEL_FORMATS } from "../model/labels";
import type { LabelFormat } from "../model/types";
import { usePrintLabels } from "../queries";

export function LabelPrint({
  orderIds,
  label = "Печать этикетки",
  disabled,
  disabledTitle,
  format: shared,
  onFormat,
  confirmFirst,
  variant = "surface",
}: {
  orderIds: string[];
  label?: string;
  disabled?: boolean;
  /** Почему нельзя печатать (подсказка на кнопке). */
  disabledTitle?: string;
  /** Общий формат экрана; без `onFormat` выбор формата не показывается. */
  format?: LabelFormat;
  onFormat?: (f: LabelFormat) => void;
  /** Спросить перед печатью; «нет» — ничего не печатаем. */
  confirmFirst?: ConfirmOptions;
  variant?: "surface" | "ghost";
}) {
  const [own, setOwn] = useState<LabelFormat>("100x100");
  const format = shared ?? own;
  const showPicker = shared === undefined || !!onFormat;
  const print = usePrintLabels();
  const confirm = useConfirm();
  async function onClick() {
    if (!confirmFirst) {
      // Вкладка открывается здесь, до первого await: иначе браузер её заблокирует.
      print.mutate({ tab: openLabelsTab(), orderIds, format });
      return;
    }
    if (await confirm(confirmFirst)) print.mutate({ tab: openLabelsTab(), orderIds, format });
  }
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant={variant}
        loading={print.isPending}
        disabled={disabled || orderIds.length === 0}
        title={disabled ? disabledTitle : undefined}
        icon={<Printer className="h-4 w-4" />}
        onClick={onClick}
      >
        {label}
      </Button>
      {showPicker && <SegmentedControl size="sm" options={LABEL_FORMATS} value={format} onChange={onFormat ?? setOwn} />}
    </span>
  );
}
