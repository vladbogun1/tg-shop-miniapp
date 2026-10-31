"use client";

/** «Перевод через ИИ», шаг 1: промпт (одной частью или несколькими) — скопировать в чат с ИИ. */
import { formatNumber } from "@shop/core/money";
import { Button } from "@shop/ui/admin-button";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { plural } from "../../model/plural";
import { CopyButton } from "../shared";
import type { AiSession } from "./use-ai-session";

export function PromptStep({ ai, hasAnswer }: { ai: AiSession; hasAnswer: boolean }) {
  const { chosen, parts, fieldCount, copied, nextPart, preview } = ai;
  return (
    <>
      <p className="mb-3 text-[13px] leading-relaxed text-[var(--text-muted)]">
        Скопируйте промпт в любой чат с ИИ (ChatGPT, Claude…), дождитесь ответа одним блоком кода и вставьте его ниже.
        В промпте <b className="text-[var(--text)]">{chosen.length}</b> {plural(chosen.length, "текст", "текста", "текстов")} — те,
        что были в списке; они используются в <b className="text-[var(--text)]">{fieldCount}</b>{" "}
        {plural(fieldCount, "месте", "местах", "местах")}. ИИ заодно вычитает русский текст — правки оригинала применяются
        только по вашей галочке.
        {parts.length > 1 && " Большой объём разбит на части — отправляйте их по очереди, каждую в новом сообщении или чате."}
      </p>
      {parts.length === 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton variant={copied.has(0) || hasAnswer ? "surface" : "accent"} text={parts[0].text} copied={copied.has(0)} onCopied={() => ai.markCopied(0)} />
          <Button variant="ghost" size="sm" onClick={() => ai.togglePreview(0)} iconRight={<ChevronDown className={cn("h-4 w-4 transition-transform", preview === 0 && "rotate-180")} />}>
            Показать текст
          </Button>
          <span className="text-[12px] text-[var(--text-faint)]">{formatNumber(parts[0].text.length, "ru")} симв.</span>
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {parts.map((p, i) => (
            <div
              key={i}
              className={cn(
                "flex flex-col gap-2 rounded-[var(--r-md)] border border-[var(--line)] p-3",
                copied.has(i) ? "border-[color-mix(in_srgb,var(--ok)_35%,transparent)] bg-[color-mix(in_srgb,var(--ok)_8%,var(--surface-2))]" : "bg-[var(--surface-2)]"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="section-title">
                  Часть {i + 1} из {parts.length}
                </span>
                {copied.has(i) && <Badge tone="ok">скопирована</Badge>}
              </div>
              <div className="text-[12px] text-[var(--text-muted)]">
                {p.ids.length} строк · {formatNumber(p.chars, "ru")} симв. оригинала
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <CopyButton variant={i === nextPart ? "accent" : "surface"} text={p.text} copied={copied.has(i)} onCopied={() => ai.markCopied(i)} label={`Скопировать часть ${i + 1}`} />
                <Button variant="ghost" size="sm" onClick={() => ai.togglePreview(i)}>
                  {preview === i ? "Скрыть" : "Текст"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <AnimatePresence initial={false}>
        {preview != null && parts[preview] && (
          <motion.pre
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="thin-scroll mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3 font-mono text-[12px] leading-relaxed text-[var(--text)]"
          >
            {parts[preview].text}
          </motion.pre>
        )}
      </AnimatePresence>
    </>
  );
}
