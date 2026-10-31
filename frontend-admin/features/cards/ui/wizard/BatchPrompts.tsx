"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@shop/ui/admin-button";
import { formatNumber } from "@shop/core/money";
import { cn } from "@/lib/cn";
import { CopyButton } from "@/features/translation";
import type { BatchSelection } from "./use-batch-selection";

/** Один пакет — всё в одной строке: скопировать, показать текст. */
function SingleBatch({ b, answered }: { b: BatchSelection; answered: boolean }) {
  const { batches, copied, markCopied, preview, setPreview } = b;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CopyButton
        variant={copied.has(0) || answered ? "surface" : "accent"}
        text={batches[0].text}
        copied={copied.has(0)}
        onCopied={() => markCopied(0)}
      />
      {copied.has(0) && <Badge tone="ok">скопирован</Badge>}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setPreview(preview === 0 ? null : 0)}
        iconRight={<ChevronDown className={cn("h-4 w-4 transition-transform", preview === 0 && "rotate-180")} />}
      >
        Показать текст
      </Button>
      <span className="text-[12px] text-[var(--text-faint)]">{formatNumber(batches[0].text.length, "ru")} симв.</span>
    </div>
  );
}

/** Несколько пакетов — карточка на пакет со своей кнопкой копирования. */
function BatchGrid({ b }: { b: BatchSelection }) {
  const { batches, copied, markCopied, preview, setPreview, nextBatch } = b;
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
      {batches.map((b, i) => (
        <div
          key={i}
          className={cn(
            "flex flex-col gap-2 rounded-[var(--r-md)] border border-[var(--line)] p-3",
            copied.has(i) ? "border-[color-mix(in_srgb,var(--ok)_35%,transparent)] bg-[color-mix(in_srgb,var(--ok)_8%,var(--surface-2))]" : "bg-[var(--surface-2)]"
          )}
        >
          <div className="flex items-center gap-2">
            <span className="section-title">
              Пакет {i + 1} из {batches.length}
            </span>
            {copied.has(i) && <Badge tone="ok">скопирован</Badge>}
          </div>
          <div className="line-clamp-2 text-[12px] text-[var(--text-muted)]" title={b.items.map((x) => x.title).join("\n")}>
            {b.items.map((x) => x.title).join(" · ")}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <CopyButton
              variant={i === nextBatch ? "accent" : "surface"}
              text={b.text}
              copied={copied.has(i)}
              onCopied={() => markCopied(i)}
              label={`Скопировать пакет ${i + 1}`}
            />
            <Button variant="ghost" size="sm" onClick={() => setPreview(preview === i ? null : i)}>
              {preview === i ? "Скрыть" : "Текст"}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Пакеты промпта и просмотр текста выбранного пакета. */
export function BatchPrompts({ b, answered }: { b: BatchSelection; answered: boolean }) {
  const { chosen, batches, preview } = b;
  return (
    <>
      {chosen.length === 0 ? (
        <div className="text-[13px] font-semibold text-[var(--text-faint)]">Товары не выбраны — нажмите «Изменить список» и отметьте нужные.</div>
      ) : batches.length === 1 ? (
        <SingleBatch b={b} answered={answered} />
      ) : (
        <BatchGrid b={b} />
      )}
      <AnimatePresence initial={false}>
        {preview != null && batches[preview] && (
          <motion.pre
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="thin-scroll mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3 font-mono text-[12px] leading-relaxed text-[var(--text)]"
          >
            {batches[preview].text}
          </motion.pre>
        )}
      </AnimatePresence>
    </>
  );
}
