"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { formatNumber } from "@shop/core/money";
import { cn } from "@/lib/cn";
import { CopyButton } from "@/features/translation";
import type { CardCompletion } from "./use-card-completion";

/** Шаг 1: промпт для ИИ — скопировать или посмотреть текст. */
export function PromptStep({ c }: { c: CardCompletion }) {
  const { prompt, copied, setCopied, answer, preview, setPreview } = c;
  return (
    <div>
      <div className="field-label mb-2">1 · Промпт для ИИ</div>
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton variant={copied || answer.trim() ? "surface" : "accent"} text={prompt} copied={copied} onCopied={() => setCopied(true)} />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPreview(!preview)}
          iconRight={<ChevronDown className={cn("h-4 w-4 transition-transform", preview && "rotate-180")} />}
        >
          Показать текст
        </Button>
        <span className="text-[12px] text-[var(--text-faint)]">{formatNumber(prompt.length, "ru")} симв.</span>
      </div>
      <AnimatePresence initial={false}>
        {preview && (
          <motion.pre
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="thin-scroll mt-2 max-h-[300px] overflow-auto whitespace-pre-wrap break-words rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3 font-mono text-[12px] leading-relaxed text-[var(--text)]"
          >
            {prompt}
          </motion.pre>
        )}
      </AnimatePresence>
    </div>
  );
}
