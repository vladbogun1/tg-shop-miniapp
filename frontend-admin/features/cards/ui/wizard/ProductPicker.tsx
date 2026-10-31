"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Search } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { categoryPathName, type CardSchema } from "../../model/schema";
import { CardStatusChip, Check, ConfidencePill, Thumb } from "../shared";
import type { BatchSelection } from "./use-batch-selection";

/** Список всех товаров с поиском и отметками — раскрывается над пакетами. */
export function ProductPicker({ b, schema }: { b: BatchSelection; schema: CardSchema }) {
  const { showList, query, setQuery, visibleList, manual, setManual, setChosen } = b;
  return (
    <AnimatePresence initial={false}>
      {showList && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
          <div className="mb-3 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)]">
            <div className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2">
              <Search className="h-4 w-4 text-[var(--text-faint)]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по названию, бренду, категории"
                aria-label="Поиск товаров"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
              />
              <Button
                size="sm"
                variant="ghost"
                disabled={!visibleList.length}
                onClick={() => setManual(new Set([...manual, ...visibleList.map((i) => i.id)]))}
              >
                Отметить все
              </Button>
            </div>
            <ul className="thin-scroll max-h-[340px] overflow-auto">
              {visibleList.length === 0 && <li className="px-3 py-3 text-[13px] text-[var(--text-faint)]">Ничего не найдено.</li>}
              {visibleList.map((i) => (
                <li key={i.id}>
                  <label className="flex cursor-pointer items-center gap-3 border-b border-[var(--line)] px-3 py-1.5 last:border-b-0 hover:bg-[var(--surface-hover)]">
                    <Check checked={manual.has(i.id)} onChange={(on) => setChosen(i.id, on)} label={`Выбрать ${i.title}`} />
                    <Thumb src={i.imageUrl} alt={i.title} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-[var(--text)]">{i.title}</span>
                      <span className="block truncate text-[11.5px] text-[var(--text-faint)]">
                        {categoryPathName(schema, i.categorySlug) || "без категории"}
                        {i.brand ? ` · ${i.brand}` : ""}
                        {(i.missingRequired?.length ?? 0) > 0 ? ` · нет ${i.missingRequired!.length} обяз. полей` : ""}
                      </span>
                    </span>
                    {i.cardStatus === "AI_FILLED" && <ConfidencePill value={i.cardConfidence ?? null} label="ИИ" />}
                    <CardStatusChip status={i.cardStatus} />
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
