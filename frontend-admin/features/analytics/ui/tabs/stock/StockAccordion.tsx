import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface StockSection {
  key: string;
  label: string;
  count: number;
  /** Вторая строка в списке: сумма, которая лежит в разделе. */
  sub?: string;
  node: ReactNode;
}

/** Телефон: «Товары и склад» — список проблем со счётчиками; раздел раскрывается по тапу, открыт один. */
export function StockAccordion({ sections }: { sections: StockSection[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul className="flex flex-col gap-2">
      {sections.map((x) => {
        const isOpen = open === x.key;
        return (
          <li key={x.key}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : x.key)}
              className="card flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left"
            >
              <span className="min-w-0 flex-1 text-[14px] font-semibold text-[var(--text)]">{x.label}</span>
              {x.sub && <span className="text-[12px] text-[var(--text-muted)] mx-num">{x.sub}</span>}
              <span className="font-display min-w-6 rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-center text-[12px] font-bold mx-num">{x.count}</span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-[var(--text-faint)] transition-transform", isOpen && "rotate-180")} />
            </button>
            {isOpen && <div className="mt-2">{x.node}</div>}
          </li>
        );
      })}
    </ul>
  );
}
