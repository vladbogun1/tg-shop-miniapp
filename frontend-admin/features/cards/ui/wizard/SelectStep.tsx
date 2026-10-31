"use client";

import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Button } from "@shop/ui/admin-button";
import { cn } from "@/lib/cn";
import type { CardSchema } from "../../model/schema";
import { Step } from "../shared";
import { BatchPrompts } from "./BatchPrompts";
import { ProductPicker } from "./ProductPicker";
import type { BatchSize, BatchSelection } from "./use-batch-selection";

/** Шаг 1: товары, пакеты и промпт. */
export function SelectStep({ b, schema, answered, preselectLabel }: { b: BatchSelection; schema: CardSchema; answered: boolean; preselectLabel?: string }) {
  const { chosen, batches, size, setSize, showList, toggleList, manual, setManual } = b;
  return (
    <Step n={1} title="Товары и промпт" aside={preselectLabel ? <Badge tone="neutral">{preselectLabel}</Badge> : undefined}>
      <p className="mb-3 text-[13px] leading-relaxed text-[var(--text-muted)]">
        Скопируйте промпт в чат с ИИ, у которого есть поиск в интернете (ChatGPT, Claude, Gemini, Perplexity…), дождитесь ответа одним
        блоком кода и вставьте его ниже. Выбрано <b className="text-[var(--text)]">{chosen.length}</b> товаров →{" "}
        <b className="text-[var(--text)]">{batches.length}</b> {batches.length === 1 ? "пакет" : "пакетов"} по {size}.
        {batches.length > 1 && " Отправляйте пакеты по очереди — каждый в новом чате: ИИ ищет данные по каждому товару, большие пакеты он делает хуже."}
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={toggleList} iconRight={<ChevronDown className={cn("h-4 w-4 transition-transform", showList && "rotate-180")} />}>
          {showList ? "Скрыть список" : "Изменить список"}
        </Button>
        <span className="field-label !text-[11px]">Товаров в пакете</span>
        <SegmentedControl<BatchSize>
          size="sm"
          value={size}
          onChange={setSize}
          options={[
            { value: "4", label: "4" },
            { value: "8", label: "8" },
          ]}
        />
        {manual.size > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setManual(new Set())}>
            Снять выбор
          </Button>
        )}
      </div>

      <ProductPicker b={b} schema={schema} />
      <BatchPrompts b={b} answered={answered} />
    </Step>
  );
}
